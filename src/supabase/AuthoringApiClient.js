import { SupabaseHttpClient } from "./SupabaseHttpClient.js";
import { deterministicUuid } from "../persistence/deterministicUuid.js";

const DEFAULT_REQUEST_INTERVAL_MS = 1_050;
const DEFAULT_RETRY_LIMIT = 3;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const SHA256_PATTERN = /^[0-9a-f]{64}$/u;

function delay(milliseconds) {
  return new Promise((resolve) => globalThis.setTimeout(resolve, milliseconds));
}

function retryableFailure(error) {
  const status = Number(error?.status);
  return error instanceof TypeError || error?.name === "AbortError" || error?.status === 0 ||
    status === 429 || status >= 500;
}

function authenticationRequiredError(error = null) {
  const normalized = new Error(
    error?.message || "Entre novamente para importar o curso.",
    error instanceof Error ? { cause: error } : undefined
  );
  normalized.name = "AuthRequiredError";
  normalized.code = "AUTH_REQUIRED";
  normalized.status = 401;
  normalized.authRequired = true;
  if (error?.code) normalized.remoteCode = String(error.code);
  return normalized;
}

function responseValue(value) {
  const normalized = Array.isArray(value) && value.length === 1 ? value[0] : value;
  if (normalized?.ok === true && Object.hasOwn(normalized, "data")) {
    return responseValue(normalized.data);
  }
  return normalized;
}

function statusOf(value) {
  return String(responseValue(value)?.status || "").trim().toLowerCase();
}

function normalizePublicationIntent(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("A publicação exige confirmação de criação ou atualização.");
  }
  const mode = String(value.mode || "").trim();
  if (mode === "create" && Object.keys(value).every((field) => field === "mode")) {
    return Object.freeze({ mode });
  }
  const existingCourseId = String(value.existingCourseId || "").trim();
  const expectedContentHash = String(value.expectedContentHash || "").trim();
  const fields = Object.keys(value);
  if (mode !== "update" || fields.some((field) => ![
    "mode", "existingCourseId", "expectedContentHash"
  ].includes(field)) || !UUID_PATTERN.test(existingCourseId) || !SHA256_PATTERN.test(expectedContentHash)) {
    throw new TypeError("A referência da publicação atual é inválida.");
  }
  return Object.freeze({ mode, existingCourseId, expectedContentHash });
}

export class AuthoringApiClient {
  constructor({
    projectUrl,
    publishableKey,
    authClient,
    fetchImpl = globalThis.fetch,
    sleep = delay,
    now = () => Date.now(),
    minimumRequestIntervalMs = DEFAULT_REQUEST_INTERVAL_MS
  } = {}) {
    if (!authClient || typeof authClient.getAccessToken !== "function") {
      throw new TypeError("Cliente de autenticação obrigatório para autoria.");
    }
    this.authClient = authClient;
    this.sleep = sleep;
    this.now = now;
    this.minimumRequestIntervalMs = Math.max(0, Number(minimumRequestIntervalMs) || 0);
    this.invalidatedAccessToken = null;
    this.http = new SupabaseHttpClient({
      projectUrl,
      publishableKey,
      fetchImpl,
      timeoutMs: 120_000
    });
  }

  async request(path, { method = "GET", body, timeoutMs = 120_000 } = {}) {
    const accessToken = await this.authClient.getAccessToken();
    if (!accessToken) {
      throw authenticationRequiredError();
    }
    try {
      return await this.http.request(`/functions/v1/aralearn-authoring-api${path}`, {
        method,
        body,
        accessToken,
        timeoutMs
      });
    } catch (error) {
      if (Number(error?.status) !== 401) throw error;
      const authenticationError = authenticationRequiredError(error);
      if (this.invalidatedAccessToken !== accessToken) {
        this.invalidatedAccessToken = accessToken;
        const shouldNotify = this.authClient.sessionInvalidated !== true;
        if (shouldNotify) {
          try {
            await this.authClient.clearSession?.();
          } catch {
            // A falha ao limpar o estado local não pode ocultar o 401 original.
          }
          this.authClient.emit?.("SESSION_INVALID");
        }
      }
      throw authenticationError;
    }
  }

  async requestWithRetry(path, options, { retryLimit = DEFAULT_RETRY_LIMIT } = {}) {
    for (let attempt = 0;; attempt += 1) {
      try {
        return await this.request(path, options);
      } catch (error) {
        if (!retryableFailure(error) || attempt >= retryLimit) throw error;
        await this.sleep(Math.min(5_000, 500 * (2 ** attempt)));
      }
    }
  }

  async waitForNextRequest(startedAt, requestedIntervalMs = 0) {
    const minimumIntervalMs = Math.max(
      this.minimumRequestIntervalMs,
      Number.isFinite(Number(requestedIntervalMs)) ? Math.max(0, Number(requestedIntervalMs)) : 0
    );
    const remaining = minimumIntervalMs - (this.now() - startedAt);
    if (remaining > 0) await this.sleep(remaining);
  }

  async importCourse(document, {
    target,
    requestId = null,
    publicationIntent = null,
    onProgress = () => {},
    maxSteps = Number.POSITIVE_INFINITY
  } = {}) {
    if (!["private", "catalog"].includes(target)) {
      throw new TypeError("O destino da importação deve ser private ou catalog.");
    }
    const normalizedPublicationIntent = normalizePublicationIntent(publicationIntent);
    const operationId = requestId || await deterministicUuid(
      `authoring:${target}-import:${JSON.stringify({
        publicationIntent: normalizedPublicationIntent,
        document
      })}`
    );
    onProgress({ percent: 8, message: "Validando o arquivo…" });
    let requestStartedAt = this.now();
    let result = responseValue(await this.requestWithRetry("/v1/imports", {
      method: "POST",
      body: {
        requestId: operationId,
        target,
        publicationIntent: normalizedPublicationIntent,
        document
      }
    }));
    onProgress({ percent: 22, message: "Rascunho recebido…" });
    const runId = result?.runId || result?.run_id;
    const publishRequestId = await deterministicUuid(`authoring:${operationId}:publish`);
    for (let step = 0; runId && (!Number.isFinite(maxSteps) || step < maxSteps); step += 1) {
      const status = statusOf(result);
      if (["published", "completed"].includes(status)) {
        onProgress({
          percent: 100,
          message: target === "catalog" ? "Curso publicado." : "Curso salvo na sua conta."
        });
        return result;
      }
      if (["rejected", "blocked", "failed"].includes(status)) {
        throw new Error(result?.message || "O curso não pôde ser publicado.");
      }
      const pollAfterSeconds = Number(result?.pollAfterSeconds);
      await this.waitForNextRequest(
        requestStartedAt,
        Number.isFinite(pollAfterSeconds) && pollAfterSeconds > 0
          ? pollAfterSeconds * 1_000
          : 0
      );
      const serverPercent = Number(result?.percent);
      onProgress({
        percent: Number.isFinite(serverPercent)
          ? Math.min(97, 28 + Math.floor(serverPercent * 0.69))
          : Math.min(94, 28 + step * 4),
        message: result?.message || "Gravando o curso…"
      });
      requestStartedAt = this.now();
      result = responseValue(await this.requestWithRetry(
        `/v1/runs/${encodeURIComponent(runId)}/publish`, {
        method: "POST",
        body: {
          requestId: publishRequestId
        }
      }));
    }
    if (["published", "completed"].includes(statusOf(result))) return result;
    throw new Error("A publicação foi interrompida antes de terminar.");
  }

  importCatalogCourse(document, options = {}) {
    return this.importCourse(document, { ...options, target: "catalog" });
  }

  importPrivateCourse(document, options = {}) {
    return this.importCourse(document, {
      ...options,
      target: "private",
      publicationIntent: { mode: "create" }
    });
  }
}
