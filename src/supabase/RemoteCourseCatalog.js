import { SupabaseHttpClient } from "./SupabaseHttpClient.js";
import { defaultUuidFactory } from "../persistence/relationalSchema.js";

function mutationId() {
  return defaultUuidFactory();
}

const SUPABASE_USER_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const CATALOG_CONTRACT_KEY_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const CATALOG_LICENSE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9.+-]{0,79}$/u;
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

function boundedText(value, label, maximum, { required = false } = {}) {
  const normalized = String(value ?? "").trim();
  if ((required && !normalized) || normalized.length > maximum) {
    throw new TypeError(`${label} inválida.`);
  }
  return normalized;
}

function catalogSubmissionFingerprint({ courseId, licenseCode, attribution, provenance }) {
  return JSON.stringify([courseId, licenseCode, attribution, provenance]);
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

  listCatalogSubmissionCandidates() {
    return this.rpc("list_my_catalog_submission_candidates");
  }

  listMyCatalogSubmissions() {
    return this.rpc("list_my_catalog_submissions");
  }

  listCatalogSubmissionQueue() {
    return this.rpc("list_catalog_submission_queue");
  }

  startCatalogSubmissionReview(submissionId) {
    return this.rpc("start_catalog_submission_review", {
      p_submission_id: requiredUuid(submissionId, "Identificador da oferta")
    });
  }

  withdrawCatalogSubmission(submissionId) {
    return this.rpc("withdraw_catalog_submission", {
      p_submission_id: requiredUuid(submissionId, "Identificador da oferta")
    });
  }

  decideCatalogSubmission({
    submissionId,
    decision,
    collectionId = null,
    officialContractKey = null,
    note = null
  } = {}) {
    const normalizedDecision = String(decision || "").trim().toLowerCase();
    if (!new Set(["accept", "reject"]).has(normalizedDecision)) {
      throw new TypeError("Decisão editorial inválida.");
    }
    const normalizedNote = boundedText(note, "Justificativa editorial", 4000, {
      required: normalizedDecision === "reject"
    });
    let normalizedCollectionId = null;
    let normalizedContractKey = null;
    if (normalizedDecision === "accept") {
      normalizedCollectionId = requiredUuid(collectionId, "Coleção de destino");
      normalizedContractKey = boundedText(
        officialContractKey,
        "Identificador público",
        160,
        { required: true }
      );
      if (!CATALOG_CONTRACT_KEY_PATTERN.test(normalizedContractKey)) {
        throw new TypeError("Identificador público inválido.");
      }
    }
    return this.rpc("decide_catalog_submission", {
      p_submission_id: requiredUuid(submissionId, "Identificador da oferta"),
      p_decision: normalizedDecision,
      p_collection_id: normalizedCollectionId,
      p_official_contract_key: normalizedContractKey,
      p_note: normalizedNote || null
    }, { timeoutMs: 90_000 });
  }

  async submitPersonalCourseToCatalog({
    courseId,
    consent,
    licenseCode,
    attribution,
    provenance,
    submissionId = null
  } = {}) {
    if (consent !== true) {
      throw new TypeError("A autorização explícita para criar uma cópia pública é obrigatória.");
    }
    const normalizedCourseId = requiredUuid(courseId, "Curso pessoal");
    const normalizedLicense = boundedText(licenseCode, "Licença", 80, { required: true });
    if (!CATALOG_LICENSE_PATTERN.test(normalizedLicense)) {
      throw new TypeError("Licença inválida.");
    }
    const normalizedAttribution = boundedText(attribution, "Atribuição", 1000, { required: true });
    const normalizedProvenance = boundedText(provenance, "Procedência", 4000, { required: true });
    const userId = await this.requireAuthenticatedUserId();
    const stateKey = `rpc.pending.${userId}:submit_personal_course_to_catalog:${normalizedCourseId}`;
    const fingerprint = catalogSubmissionFingerprint({
      courseId: normalizedCourseId,
      licenseCode: normalizedLicense,
      attribution: normalizedAttribution,
      provenance: normalizedProvenance
    });
    const sessionStore = this.authClient.sessionStore;
    const persisted = typeof sessionStore?.getSyncState === "function"
      ? await sessionStore.getSyncState(stateKey)
      : null;
    let effectiveSubmissionId = submissionId
      ? requiredUuid(submissionId, "Identificador da oferta")
      : persisted?.fingerprint === fingerprint
        ? requiredUuid(persisted.submissionId, "Identificador da oferta pendente")
        : mutationId();
    effectiveSubmissionId = requiredUuid(effectiveSubmissionId, "Identificador da oferta");
    if (typeof sessionStore?.putSyncState === "function") {
      await sessionStore.putSyncState(stateKey, {
        submissionId: effectiveSubmissionId,
        fingerprint
      });
    }
    const result = await this.rpc("submit_personal_course_to_catalog", {
      p_submission_id: effectiveSubmissionId,
      p_course_id: normalizedCourseId,
      p_consent: true,
      p_license_code: normalizedLicense,
      p_attribution_text: normalizedAttribution,
      p_provenance_text: normalizedProvenance
    }, { timeoutMs: 60_000 });
    if (typeof sessionStore?.putSyncState === "function") {
      await sessionStore.putSyncState(stateKey, null);
    }
    return result;
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

  forkCourseForEditing(sourceCourseId, requestMutationId = null) {
    return this.runIdempotentCourseRpc(
      "fork_catalog_course_for_editing",
      sourceCourseId,
      "p_source_course_id",
      requestMutationId
    );
  }

  createPersonalCourse({ contractKey, title, goal, contractScope = null } = {}, requestMutationId = null) {
    const normalizedContractKey = String(contractKey || "").trim();
    if (!normalizedContractKey) throw new TypeError("O novo curso exige contractKey.");
    return this.runIdempotentCourseRpc(
      "create_personal_course",
      normalizedContractKey,
      "p_contract_key",
      requestMutationId,
      {
        p_title: String(title || "").trim(),
        p_goal: String(goal || "").trim(),
        p_contract_scope: contractScope == null ? null : String(contractScope)
      }
    );
  }

  downloadSelectedCourseGraph(courseId) {
    return this.rpc("get_selected_course_graph", { p_course_id: courseId }, { timeoutMs: 60_000 });
  }
}
