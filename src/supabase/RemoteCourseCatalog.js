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

function requiredRevision(value, label = "Revisão") {
  const normalized = Number(value);
  if (!Number.isSafeInteger(normalized) || normalized < 0) {
    throw new TypeError(`${label} inválida.`);
  }
  return normalized;
}

function requiredJsonObject(value, label) {
  const prototype = value && typeof value === "object" ? Object.getPrototypeOf(value) : null;
  if (!value || typeof value !== "object" || Array.isArray(value) ||
      (prototype !== Object.prototype && prototype !== null)) {
    throw new TypeError(`${label} inválido.`);
  }
  return structuredClone(value);
}

function requiredJsonArray(value, label, { maxItems, maxBytes } = {}) {
  if (!Array.isArray(value) || value.length === 0 ||
      (Number.isSafeInteger(maxItems) && value.length > maxItems)) {
    throw new TypeError(`${label} inválidas.`);
  }
  const normalized = structuredClone(value);
  if (Number.isSafeInteger(maxBytes) &&
      new TextEncoder().encode(JSON.stringify(normalized)).byteLength > maxBytes) {
    throw new TypeError(`${label} excedem o limite permitido.`);
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

  listTrailItems({
    limit = 50,
    afterPathPosition = null,
    afterItemPosition = null,
    afterId = null
  } = {}) {
    return this.rpc("list_trail_items_v1", {
      p_limit: Number(limit),
      p_after_path_position: afterPathPosition,
      p_after_item_position: afterItemPosition,
      p_after_id: afterId === null ? null : requiredUuid(afterId, "Cursor de Trilhas")
    });
  }

  mutateTrails({ requestId = mutationId(), operation, arguments: argumentsValue = {} } = {}) {
    const normalizedOperation = String(operation || "").trim();
    if (!normalizedOperation) throw new TypeError("Operação de Trilhas inválida.");
    return this.rpc("mutate_trails_v1", {
      p_request_id: requiredUuid(requestId, "Identidade da operação"),
      p_operation: normalizedOperation,
      p_arguments: requiredJsonObject(argumentsValue, "Argumentos de Trilhas")
    });
  }

  getTrailWorkspaceCourse({
    trailItemId,
    limit = 100,
    afterCursor = null,
    expectedRevision = null
  } = {}) {
    const normalizedLimit = Number(limit);
    if (!Number.isSafeInteger(normalizedLimit) || normalizedLimit < 1 || normalizedLimit > 100) {
      throw new TypeError("Limite da composição inválido.");
    }
    const cursor = afterCursor === null ? null : String(afterCursor);
    if (cursor !== null && (!cursor || cursor.length > 4096)) {
      throw new TypeError("Cursor da composição inválido.");
    }
    return this.rpc("get_trail_workspace_course_v1", {
      p_trail_item_id: requiredUuid(trailItemId, "Item de Trilhas"),
      p_limit: normalizedLimit,
      p_after_cursor: cursor,
      p_expected_revision: expectedRevision === null
        ? null
        : requiredRevision(expectedRevision)
    });
  }

  loadTrailPersonalState(trailItemId) {
    return this.rpc("load_trail_personal_state_v1", {
      p_trail_item_id: requiredUuid(trailItemId, "Item de Trilhas")
    });
  }

  mutateTrailPersonalState({
    trailItemId,
    expectedRevision,
    operations,
    mutationId: requestMutationId = mutationId()
  } = {}) {
    return this.rpc("mutate_trail_personal_state_v1", {
      p_trail_item_id: requiredUuid(trailItemId, "Item de Trilhas"),
      p_expected_revision: requiredRevision(expectedRevision),
      p_operations: requiredJsonArray(operations, "Operações do estado pessoal", {
        maxItems: 512,
        maxBytes: 65_536
      }),
      p_mutation_id: requiredUuid(requestMutationId, "Identidade da alteração")
    });
  }

  async executeApplicationAuthoringAction(name, argumentsValue = {}) {
    const actionName = String(name || "").trim();
    if (!actionName || !argumentsValue || typeof argumentsValue !== "object" || Array.isArray(argumentsValue)) {
      throw new TypeError("Operação de autoria contextual inválida.");
    }
    let accessToken = null;
    try {
      accessToken = await this.authClient.getAccessToken();
      if (!accessToken) throw asAuthenticationRequired();
      this.authenticationWasRestored(accessToken);
      const result = await this.http.request(
        `/functions/v1/aralearn-authoring-action/app/${encodeURIComponent(actionName)}`,
        {
          method: "POST",
          body: argumentsValue,
          accessToken,
          timeoutMs: 60_000
        }
      );
      this.authenticationWasRestored(accessToken, { confirmed: true });
      return result?.data ?? null;
    } catch (error) {
      if (isAuthenticationFailure(error)) {
        throw await this.invalidateAuthentication(error, accessToken);
      }
      throw error;
    }
  }

  getEducationalWorkspace(workspaceId) {
    return this.rpc("get_current_educational_workspace_v1", {
      p_workspace_id: requiredUuid(workspaceId, "Workspace")
    });
  }

  manageEducationalWorkspace({ requestId, operation, payload } = {}) {
    const normalizedRequestId = String(requestId || "").trim();
    const normalizedOperation = String(operation || "").trim();
    if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/u.test(normalizedRequestId)) {
      throw new TypeError("Identidade da operação inválida.");
    }
    if (![
      "create", "update", "invite", "accept_invite", "cancel_invite",
      "set_role", "remove_member", "transfer_owner", "leave"
    ].includes(normalizedOperation)) {
      throw new TypeError("Operação de workspace inválida.");
    }
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      throw new TypeError("Dados do workspace inválidos.");
    }
    return this.rpc("manage_current_educational_workspace_v1", {
      p_request_id: normalizedRequestId,
      p_operation: normalizedOperation,
      p_payload: payload
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
