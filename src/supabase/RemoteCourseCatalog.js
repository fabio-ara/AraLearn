import { SupabaseHttpClient } from "./SupabaseHttpClient.js";
import { defaultUuidFactory } from "../persistence/relationalSchema.js";

function mutationId() {
  return defaultUuidFactory();
}

const SUPABASE_USER_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const AUTHENTICATION_FAILURE_CODES = new Set([
  "AUTH_REQUIRED",
  "BAD_JWT",
  "INVALID_JWT",
  "JWT_EXPIRED",
  "JWT_INVALID",
  "INVALID_TOKEN",
  "INVALID_GRANT",
  "SESSION_NOT_FOUND",
  "NO_SESSION",
  "REFRESH_TOKEN_NOT_FOUND",
  "REFRESH_TOKEN_EXPIRED",
  "REFRESH_TOKEN_ALREADY_USED",
  "PGRST301"
]);

function isAuthenticationFailure(error) {
  const status = Number(error?.status ?? error?.response?.status ?? 0);
  const code = String(error?.code || error?.response?.code || "").toUpperCase();
  const message = String(error?.message || "").toLowerCase();
  if (status === 403 && error?.authRequired !== true) return false;
  return error?.authRequired === true ||
    status === 401 ||
    AUTHENTICATION_FAILURE_CODES.has(code) ||
    /(?:\bjwt\b.*\b(?:invalid|expired|malformed)\b|\b(?:invalid|expired)\b.*\bjwt\b|\b(?:refresh token|token de refresh)\b.*\b(?:invalid|expired|missing|not found|already used|inv[aá]lido|expirado|ausente)\b|\b(?:session|sess[aã]o)\b.*\b(?:invalid|expired|missing|not found|inv[aá]lida|expirada|ausente)\b|\bauthentication required\b|\bautentica(?:ção|cao) necess[aá]ria\b)/u.test(message);
}

function asAuthenticationRequired(error) {
  const normalized = error instanceof Error ? error : new Error(String(error || "Autenticação necessária."));
  normalized.name = "AuthRequiredError";
  normalized.status = Number(normalized.status || 401);
  normalized.code ||= "AUTH_REQUIRED";
  normalized.authRequired = true;
  return normalized;
}

function authenticatedUserId(authClient) {
  const userId = String(authClient.getSession?.()?.user?.id || "").trim().toLowerCase();
  if (!SUPABASE_USER_ID_PATTERN.test(userId)) {
    throw asAuthenticationRequired(new Error("Entre novamente para continuar."));
  }
  return userId;
}

function courseMutationWasSuperseded(result) {
  const value = Array.isArray(result) && result.length === 1 ? result[0] : result;
  return value?.superseded === true || value?.superseded === "true";
}

function requiredUuid(value, label) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!SUPABASE_USER_ID_PATTERN.test(normalized)) {
    throw new TypeError(`${label} inválido.`);
  }
  return normalized;
}

export class RemoteCourseCatalog {
  constructor({ projectUrl, publishableKey, authClient, fetchImpl = globalThis.fetch } = {}) {
    if (
      !authClient ||
      typeof authClient.getAccessToken !== "function" ||
      typeof authClient.getSession !== "function"
    ) {
      throw new TypeError("Cliente de autenticação obrigatório.");
    }
    this.authClient = authClient;
    this.http = new SupabaseHttpClient({ projectUrl, publishableKey, fetchImpl });
    this.authenticationInvalidated = false;
    this.invalidatedAccessToken = null;
  }

  authenticationWasRestored(accessToken, { confirmed = false } = {}) {
    if (!accessToken) return;
    if (
      confirmed ||
      (this.authenticationInvalidated && accessToken !== this.invalidatedAccessToken)
    ) {
      this.authenticationInvalidated = false;
      this.invalidatedAccessToken = null;
      if ("sessionInvalidated" in this.authClient) {
        this.authClient.sessionInvalidated = false;
      }
    }
  }

  async invalidateAuthentication(error, accessToken = null) {
    const authError = asAuthenticationRequired(error);
    if (this.authenticationInvalidated) return authError;

    this.authenticationInvalidated = true;
    this.invalidatedAccessToken = accessToken || null;
    if (this.authClient.sessionInvalidated === true) return authError;

    try {
      await this.authClient.clearSession?.();
    } catch {
      // A invalidação local não pode converter a resposta 401 em rejeição da outbox.
    }
    this.authClient.emit?.("SESSION_INVALID");
    return authError;
  }

  async requireAuthenticatedUserId() {
    try {
      return authenticatedUserId(this.authClient);
    } catch (error) {
      throw await this.invalidateAuthentication(error);
    }
  }

  async rpc(name, parameters = {}, requestOptions = {}) {
    let accessToken = null;
    try {
      accessToken = await this.authClient.getAccessToken();
      if (!accessToken) throw asAuthenticationRequired();
      this.authenticationWasRestored(accessToken);
      const result = await this.http.rpc(name, parameters, { ...requestOptions, accessToken });
      this.authenticationWasRestored(accessToken, { confirmed: true });
      return result;
    } catch (error) {
      if (isAuthenticationFailure(error)) {
        throw await this.invalidateAuthentication(error, accessToken);
      }
      throw error;
    }
  }

  listCollections(query = "") {
    return this.rpc("list_catalog_collections", { p_query: String(query || "").trim() });
  }

  listLibrary() {
    return this.rpc("list_user_course_summaries");
  }

  getCurrentUserCapabilities() {
    return this.rpc("current_user_capabilities");
  }

  getCurrentStateCentral() {
    return this.rpc("get_current_state_central_v1");
  }

  listCurrentStateCentral({
    section,
    limit = 20,
    beforeAt = null,
    beforeId = null,
    afterPosition = null,
    afterId = null,
    audience = "mine"
  } = {}) {
    return this.rpc("list_current_state_central_v1", {
      p_section: String(section || "").trim(),
      p_limit: Number(limit),
      p_before_at: beforeAt,
      p_before_id: beforeId,
      p_after_position: afterPosition,
      p_after_id: afterId,
      p_audience: String(audience || "mine").trim()
    });
  }

  deleteOwnAccount() {
    return this.rpc("delete_own_account", { p_confirmation: "EXCLUIR" }, { timeoutMs: 60_000 });
  }

  async runIdempotentCourseRpc(
    operation,
    courseId,
    parameterName,
    requestMutationId = null,
    additionalParameters = {}
  ) {
    const userId = await this.requireAuthenticatedUserId();
    const stateKey = `rpc.pending.${userId}:${operation}:${courseId}`;
    const oppositeOperation = operation === "select_catalog_course"
      ? "unselect_catalog_course"
      : operation === "unselect_catalog_course"
        ? "select_catalog_course"
        : null;
    const sessionStore = this.authClient.sessionStore;
    if (oppositeOperation && typeof sessionStore?.putSyncState === "function") {
      await sessionStore.putSyncState(
        `rpc.pending.${userId}:${oppositeOperation}:${courseId}`,
        null
      );
    }
    let effectiveMutationId = requestMutationId;
    if (!effectiveMutationId && typeof sessionStore?.getSyncState === "function") {
      effectiveMutationId = await sessionStore.getSyncState(stateKey);
    }
    effectiveMutationId ||= mutationId();
    for (let attempt = 0; attempt < 2; attempt += 1) {
      if (typeof sessionStore?.putSyncState === "function") {
        await sessionStore.putSyncState(stateKey, effectiveMutationId);
      }
      const result = await this.rpc(operation, {
        [parameterName]: courseId,
        ...additionalParameters,
        p_mutation_id: effectiveMutationId
      }, { timeoutMs: 60_000 });
      if (!courseMutationWasSuperseded(result)) {
        if (typeof sessionStore?.putSyncState === "function") {
          await sessionStore.putSyncState(stateKey, null);
        }
        return result;
      }
      if (typeof sessionStore?.putSyncState === "function") {
        await sessionStore.putSyncState(stateKey, null);
      }
      if (attempt === 1) {
        const error = new Error("A alteração do curso não pôde ser confirmada. Tente novamente.");
        error.name = "CatalogIntentNotConfirmedError";
        error.code = "CATALOG_INTENT_NOT_CONFIRMED";
        throw error;
      }
      effectiveMutationId = mutationId();
    }
    throw new Error("Não foi possível confirmar a seleção do curso.");
  }

  selectCourse(courseId, requestMutationId = null) {
    return this.runIdempotentCourseRpc(
      "select_catalog_course",
      courseId,
      "p_course_id",
      requestMutationId
    );
  }

  unselectCourse(courseId, requestMutationId = null) {
    return this.runIdempotentCourseRpc(
      "unselect_catalog_course",
      courseId,
      "p_course_id",
      requestMutationId
    );
  }

  async downloadCourseRevision(courseId, revisionHash) {
    const normalizedCourseId = requiredUuid(courseId, "Curso");
    const normalizedHash = String(revisionHash || "").trim().toLowerCase();
    if (!/^[a-f0-9]{64}$/u.test(normalizedHash)) {
      throw new TypeError("Hash de revisão inválido.");
    }
    let accessToken = null;
    try {
      accessToken = await this.authClient.getAccessToken();
      if (!accessToken) throw asAuthenticationRequired();
      const result = await this.http.request(
        `/functions/v1/aralearn-course-revisions/${normalizedCourseId}/${normalizedHash}`,
        { accessToken, timeoutMs: 120_000 }
      );
      this.authenticationWasRestored(accessToken, { confirmed: true });
      return result;
    } catch (error) {
      if (isAuthenticationFailure(error)) {
        throw await this.invalidateAuthentication(error, accessToken);
      }
      throw error;
    }
  }
}
