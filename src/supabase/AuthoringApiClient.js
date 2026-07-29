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
    const course = document?.courses?.[0];
    if (!course?.id) throw new TypeError("O documento deve conter exatamente um curso.");
    onProgress({ percent: 8, message: "Validando o arquivo…" });
    const workspaceRequestId = await deterministicUuid(`authoring:${operationId}:workspace`);
    const created = responseValue(await this.requestWithRetry("/v1/workspaces", {
      method: "POST",
      body: {
        requestId: workspaceRequestId,
        title: `Importação: ${course.title || course.id}`
      }
    }));
    const workspaceId = created?.workspaceId;
    const initialRevision = created?.currentRevision || created?.revision;
    if (!workspaceId || !Number.isInteger(initialRevision)) {
      throw new Error("O workspace da importação não foi confirmado.");
    }
    onProgress({ percent: 28, message: "Workspace criado…" });
    const insertRequestId = await deterministicUuid(`authoring:${operationId}:insert`);
    const inserted = responseValue(await this.requestWithRetry(
      `/v1/workspaces/${encodeURIComponent(workspaceId)}/mutations`,
      {
        method: "POST",
        body: {
          requestId: insertRequestId,
          expectedRevision: initialRevision,
          operation: "insert_entity",
          arguments: {
            entityType: "course",
            parentId: null,
            entity: course
          }
        }
      }
    ));
    const revision = inserted?.currentRevision || inserted?.revision;
    if (!Number.isInteger(revision)) {
      throw new Error("A revisão importada não foi confirmada.");
    }
    onProgress({ percent: 68, message: "Revisão validada…" });
    const publishRequestId = await deterministicUuid(`authoring:${operationId}:publish`);
    void maxSteps;
    const result = responseValue(await this.requestWithRetry(
      `/v1/workspaces/${encodeURIComponent(workspaceId)}/publications`,
      {
        method: "POST",
        body: {
          requestId: publishRequestId,
          expectedRevision: revision,
          courseId: course.id,
          target,
          completion: "complete",
          publicationMode: normalizedPublicationIntent.mode,
          existingCourseId: normalizedPublicationIntent.existingCourseId || null,
          expectedContentHash: normalizedPublicationIntent.expectedContentHash || null,
          collectionId: null
        }
      }
    ));
    onProgress({
      percent: 100,
      message: target === "catalog" ? "Curso publicado." : "Curso salvo na sua conta."
    });
    return result;
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
