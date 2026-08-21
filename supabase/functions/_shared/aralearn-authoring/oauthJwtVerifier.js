import { AuthoringApiError } from "./errors.js";

const JWT_MAX_BYTES = 32 * 1024;
const JWKS_MAX_BYTES = 64 * 1024;
const JWKS_CACHE_MS = 5 * 60 * 1000;
const JWKS_UNKNOWN_KEY_COOLDOWN_MS = 30 * 1000;
const JOSE_SEGMENT_PATTERN = /^[A-Za-z0-9_-]+$/u;
const SUPPORTED_ALGORITHMS = new Set(["ES256"]);

function invalidOAuthToken() {
  return new AuthoringApiError(
    401,
    "invalid_oauth_token",
    "O access token OAuth é inválido."
  );
}

function verificationUnavailable() {
  return new AuthoringApiError(
    503,
    "oauth_verification_unavailable",
    "Não foi possível verificar o access token OAuth."
  );
}

function base64UrlBytes(value) {
  const source = String(value || "");
  if (!source || !JOSE_SEGMENT_PATTERN.test(source)) throw invalidOAuthToken();
  try {
    const decoded = atob(
      source.replaceAll("-", "+").replaceAll("_", "/")
        .padEnd(Math.ceil(source.length / 4) * 4, "=")
    );
    return Uint8Array.from(decoded, (character) => character.charCodeAt(0));
  } catch {
    throw invalidOAuthToken();
  }
}

function jsonSegment(value) {
  try {
    const parsed = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(
      base64UrlBytes(value)
    ));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("invalid JOSE object");
    }
    return parsed;
  } catch (error) {
    if (error instanceof AuthoringApiError) throw error;
    throw invalidOAuthToken();
  }
}

function parseSignedJwt(token) {
  const source = String(token || "").trim();
  if (!source || new TextEncoder().encode(source).byteLength > JWT_MAX_BYTES) {
    throw invalidOAuthToken();
  }
  const segments = source.split(".");
  if (segments.length !== 3 || segments.some((segment) => !segment)) {
    throw invalidOAuthToken();
  }
  const header = jsonSegment(segments[0]);
  const claims = jsonSegment(segments[1]);
  const algorithm = typeof header.alg === "string" ? header.alg.trim() : "";
  const keyId = typeof header.kid === "string" ? header.kid.trim() : "";
  if (!SUPPORTED_ALGORITHMS.has(algorithm) || !keyId || keyId.length > 256 ||
      header.crit != null || (header.typ != null && header.typ !== "JWT")) {
    throw invalidOAuthToken();
  }
  const signature = base64UrlBytes(segments[2]);
  if (algorithm === "ES256" && signature.byteLength !== 64) throw invalidOAuthToken();
  return {
    algorithm,
    claims,
    header,
    keyId,
    signature,
    signedBytes: new TextEncoder().encode(`${segments[0]}.${segments[1]}`)
  };
}

function jwkForHeader(keys, { algorithm, keyId }) {
  const matches = keys.filter((key) => key?.kid === keyId &&
    (key.alg == null || key.alg === algorithm) &&
    (key.use == null || key.use === "sig") &&
    (key.key_ops == null || (Array.isArray(key.key_ops) && key.key_ops.includes("verify"))) &&
    algorithm === "ES256" && key.kty === "EC" && key.crv === "P-256");
  return matches.length === 1 ? matches[0] : null;
}

function importAlgorithm(algorithm) {
  if (algorithm !== "ES256") throw invalidOAuthToken();
  return { name: "ECDSA", namedCurve: "P-256" };
}

function verifyAlgorithm(algorithm) {
  if (algorithm !== "ES256") throw invalidOAuthToken();
  return { name: "ECDSA", hash: "SHA-256" };
}

async function responseTextWithin(response, maximumBytes) {
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maximumBytes) {
    throw verificationUnavailable();
  }
  const reader = response.body?.getReader?.();
  if (!reader) {
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > maximumBytes) throw verificationUnavailable();
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  }
  const chunks = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maximumBytes) {
      await reader.cancel();
      throw verificationUnavailable();
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

function jwksDocument(value) {
  if (!value || typeof value !== "object" || Array.isArray(value) ||
      !Array.isArray(value.keys) || value.keys.length < 1 || value.keys.length > 16 ||
      value.keys.some((key) => !key || typeof key !== "object" || Array.isArray(key))) {
    throw verificationUnavailable();
  }
  return value.keys;
}

export class SupabaseOAuthJwtVerifier {
  constructor({
    issuer,
    fetchImpl = globalThis.fetch,
    now = () => Date.now(),
    requestTimeoutMs = 8_000,
    cacheTtlMs = JWKS_CACHE_MS,
    unknownKeyCooldownMs = JWKS_UNKNOWN_KEY_COOLDOWN_MS
  } = {}) {
    this.issuer = String(issuer || "").trim().replace(/\/+$/u, "");
    this.fetchImpl = fetchImpl;
    this.now = now;
    this.requestTimeoutMs = requestTimeoutMs;
    this.cacheTtlMs = cacheTtlMs;
    this.unknownKeyCooldownMs = unknownKeyCooldownMs;
    this.cachedKeys = null;
    this.cachedUntil = 0;
    this.pendingKeys = null;
    this.unknownKeyBlockedUntil = 0;
    if (!this.issuer || typeof this.fetchImpl !== "function" ||
        !Number.isSafeInteger(requestTimeoutMs) || requestTimeoutMs < 1 ||
        !Number.isSafeInteger(cacheTtlMs) || cacheTtlMs < 0 ||
        !Number.isSafeInteger(unknownKeyCooldownMs) || unknownKeyCooldownMs < 0) {
      throw new TypeError("A configuração do verificador OAuth é inválida.");
    }
  }

  async #loadKeys({ force = false, deadlineAt = null } = {}) {
    if (!force && this.cachedKeys && this.cachedUntil > this.now()) return this.cachedKeys;
    if (this.pendingKeys) return this.pendingKeys;
    const remaining = deadlineAt == null
      ? this.requestTimeoutMs
      : Math.min(this.requestTimeoutMs, deadlineAt - this.now());
    if (remaining <= 0) throw verificationUnavailable();
    this.pendingKeys = (async () => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), remaining);
      try {
      const response = await this.fetchImpl(`${this.issuer}/.well-known/jwks.json`, {
        headers: { Accept: "application/json" },
        redirect: "error",
        signal: controller.signal
      });
      if (!response.ok) throw verificationUnavailable();
      const source = await responseTextWithin(response, JWKS_MAX_BYTES);
      const keys = jwksDocument(JSON.parse(source));
      this.cachedKeys = keys;
      this.cachedUntil = this.now() + this.cacheTtlMs;
      return keys;
      } catch (error) {
        if (error instanceof AuthoringApiError) throw error;
        throw verificationUnavailable();
      } finally {
        clearTimeout(timer);
      }
    })();
    try {
      return await this.pendingKeys;
    } finally {
      this.pendingKeys = null;
    }
  }

  async #verifyWithKey(parsed, jwk) {
    try {
      const key = await globalThis.crypto.subtle.importKey(
        "jwk",
        jwk,
        importAlgorithm(parsed.algorithm),
        false,
        ["verify"]
      );
      return await globalThis.crypto.subtle.verify(
        verifyAlgorithm(parsed.algorithm),
        key,
        parsed.signature,
        parsed.signedBytes
      );
    } catch {
      return false;
    }
  }

  async verify(token, { deadlineAt = null } = {}) {
    const parsed = parseSignedJwt(token);
    const hadFreshCache = Boolean(this.cachedKeys && this.cachedUntil > this.now());
    let keys = await this.#loadKeys({ deadlineAt });
    let jwk = jwkForHeader(keys, parsed);
    if (jwk) {
      if (await this.#verifyWithKey(parsed, jwk)) return parsed.claims;
      throw invalidOAuthToken();
    }
    if (this.unknownKeyBlockedUntil > this.now()) {
      throw invalidOAuthToken();
    }
    if (!hadFreshCache) {
      this.unknownKeyBlockedUntil = this.now() + this.unknownKeyCooldownMs;
      throw invalidOAuthToken();
    }
    keys = await this.#loadKeys({ force: true, deadlineAt });
    jwk = jwkForHeader(keys, parsed);
    if (jwk) {
      this.unknownKeyBlockedUntil = 0;
      if (await this.#verifyWithKey(parsed, jwk)) return parsed.claims;
      throw invalidOAuthToken();
    }
    this.unknownKeyBlockedUntil = this.now() + this.unknownKeyCooldownMs;
    throw invalidOAuthToken();
  }
}
