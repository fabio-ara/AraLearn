import { SupabaseHttpClient } from "./SupabaseHttpClient.js";

const DEFAULT_RETRY_LIMIT = 3;
const CLIENT_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

function retryableFailure(error) {
  const status = Number(error?.status);
  return error instanceof TypeError || error?.name === "AbortError" || status === 0 ||
    status === 429 || status >= 500;
}

function delay(milliseconds) {
  return new Promise((resolve) => globalThis.setTimeout(resolve, milliseconds));
}

function randomRequestId() {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  if (typeof globalThis.crypto?.getRandomValues !== "function") {
    throw new Error("A criação de integrações exige Web Crypto.");
  }
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const value = [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}

function unwrap(value) {
  const normalized = Array.isArray(value) && value.length === 1 ? value[0] : value;
  if (normalized?.ok === true && Object.hasOwn(normalized, "data")) {
    return unwrap(normalized.data);
  }
  return normalized;
}

function authRequiredError(error = null) {
  const normalized = new Error(
    error?.message || "Entre novamente para gerenciar suas integrações.",
    error instanceof Error ? { cause: error } : undefined
  );
  normalized.name = "AuthRequiredError";
  normalized.code = "AUTH_REQUIRED";
  normalized.status = 401;
  normalized.authRequired = true;
  if (error?.code) normalized.remoteCode = String(error.code);
  return normalized;
}

function validName(name) {
  const normalized = String(name || "").trim();
  if (!normalized || normalized.length > 80) {
    throw new TypeError("O nome da integração deve ter entre 1 e 80 caracteres.");
  }
  return normalized;
}

function validExpiry(expiresInDays) {
  const normalized = Number(expiresInDays);
  if (!Number.isInteger(normalized) || normalized < 1 || normalized > 365) {
    throw new TypeError("A validade deve ter entre 1 e 365 dias.");
  }
  return normalized;
}

function validClientId(clientId) {
  const normalized = String(clientId || "").trim();
  if (!CLIENT_ID_PATTERN.test(normalized)) {
    throw new TypeError("Identificador de integração inválido.");
  }
  return normalized;
}

function validRequestId(requestId, createRequestId) {
  const normalized = String(requestId || createRequestId()).trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/u.test(normalized)) {
    throw new TypeError("Identificador de pedido inválido.");
  }
  return normalized;
}

export function normalizePersonalIntegration(value = {}, now = Date.now()) {
  const expiresAt = value.expiresAt ?? value.expires_at ?? null;
  const revokedAt = value.revokedAt ?? value.revoked_at ?? null;
  const expiresAtTime = expiresAt ? Date.parse(expiresAt) : Number.NaN;
  const state = revokedAt
    ? "revoked"
    : Number.isFinite(expiresAtTime) && expiresAtTime <= now
      ? "expired"
      : value.active === false
        ? "inactive"
        : "active";
  return Object.freeze({
    clientId: String(value.clientId ?? value.client_id ?? ""),
    name: String(value.name || "Integração"),
    keyPrefix: String(value.keyPrefix ?? value.key_prefix ?? ""),
    expiresAt,
    revokedAt,
    createdAt: value.createdAt ?? value.created_at ?? null,
    lastUsedAt: value.lastUsedAt ?? value.last_used_at ?? null,
    state
  });
}

export class PersonalIntegrationClient {
  constructor({
    projectUrl,
    publishableKey,
    authClient,
    fetchImpl = globalThis.fetch,
    sleep = delay,
    createRequestId = randomRequestId,
    retryLimit = DEFAULT_RETRY_LIMIT
  } = {}) {
    if (!authClient || typeof authClient.getAccessToken !== "function") {
      throw new TypeError("Cliente de autenticação obrigatório para integrações.");
    }
    if (typeof createRequestId !== "function") {
      throw new TypeError("Gerador de identificadores obrigatório.");
    }
    this.authClient = authClient;
    this.sleep = sleep;
    this.createRequestId = createRequestId;
    this.retryLimit = Math.max(0, Number(retryLimit) || 0);
    this.invalidatedAccessToken = null;
    this.http = new SupabaseHttpClient({
      projectUrl,
      publishableKey,
      fetchImpl,
      timeoutMs: 30_000
    });
  }

  async request(path, options = {}) {
    const accessToken = await this.authClient.getAccessToken();
    if (!accessToken) {
      if (this.invalidatedAccessToken !== "__missing_session__") {
        this.invalidatedAccessToken = "__missing_session__";
        this.authClient.emit?.("SESSION_INVALID");
      }
      throw authRequiredError();
    }
    try {
      const result = unwrap(await this.http.request(
        `/functions/v1/aralearn-authoring-api${path}`,
        { ...options, accessToken, timeoutMs: 30_000 }
      ));
      this.invalidatedAccessToken = null;
      return result;
    } catch (error) {
      if (Number(error?.status) !== 401) throw error;
      if (this.invalidatedAccessToken !== accessToken) {
        this.invalidatedAccessToken = accessToken;
        try {
          await this.authClient.clearSession?.();
        } catch {
          // A sessão remota inválida continua sendo o erro determinante.
        }
        this.authClient.emit?.("SESSION_INVALID");
      }
      throw authRequiredError(error);
    }
  }

  async requestWithRetry(path, options = {}) {
    for (let attempt = 0;; attempt += 1) {
      try {
        return await this.request(path, options);
      } catch (error) {
        if (!retryableFailure(error) || attempt >= this.retryLimit) throw error;
        await this.sleep(Math.min(4_000, 400 * (2 ** attempt)));
      }
    }
  }

  async list() {
    const result = await this.requestWithRetry("/v1/integrations");
    const items = Array.isArray(result?.items) ? result.items : [];
    return Object.freeze({
      items: Object.freeze(items.map((item) => normalizePersonalIntegration(item))),
      activeCount: Number(result?.activeCount ?? result?.active_count) || 0,
      activeLimit: Number(result?.activeLimit ?? result?.active_limit) || 5
    });
  }

  async create({ name, expiresInDays = 90, requestId = null } = {}) {
    const stableRequestId = validRequestId(requestId, this.createRequestId);
    const body = Object.freeze({
      requestId: stableRequestId,
      name: validName(name),
      expiresInDays: validExpiry(expiresInDays)
    });
    return this.requestWithRetry("/v1/integrations", {
      method: "POST",
      headers: { "Idempotency-Key": stableRequestId },
      body
    });
  }

  async rotate(clientId, { expiresInDays = 90, requestId = null } = {}) {
    const normalizedClientId = validClientId(clientId);
    const stableRequestId = validRequestId(requestId, this.createRequestId);
    const body = Object.freeze({
      requestId: stableRequestId,
      expiresInDays: validExpiry(expiresInDays)
    });
    return this.requestWithRetry(
      `/v1/integrations/${encodeURIComponent(normalizedClientId)}/rotate`,
      {
        method: "POST",
        headers: { "Idempotency-Key": stableRequestId },
        body
      }
    );
  }

  revoke(clientId) {
    return this.requestWithRetry(
      `/v1/integrations/${encodeURIComponent(validClientId(clientId))}`,
      { method: "DELETE" }
    );
  }
}
