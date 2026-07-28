import { deterministicRequestUuid } from "./canonical.js";
import { ArtifactAuthoringEngine } from "./artifactAuthoringEngine.js";
import { ArtifactGarbageCollector } from "./artifactGarbageCollector.js";
import { AuthoringApiError } from "./errors.js";
import { derivePrivateIntegrationApiKey, sha256Hex } from "./security.js";
import { supabaseServerHeaders } from "./supabaseEnvironment.js";

function first(value) {
  return Array.isArray(value) ? value[0] || null : value;
}

function normalizeUrl(value) {
  const result = String(value || "").trim().replace(/\/+$/, "");
  if (!result) throw new Error("SUPABASE_URL ausente no servidor.");
  return result;
}

function retryableStatus(status) {
  return status === 408 || status === 429 || status >= 500;
}

function safeValidationMessage(body, fallback) {
  const message = typeof body?.message === "string" ? body.message.trim() : "";
  if (!message || message.length > 1_000
      || /\b(private|public|constraint|schema|table|column|relation|index|trigger|function)\b/i.test(message)
      || /(?:^|[\s"'`])(?:[A-Za-z_][A-Za-z0-9_]*\.)+[A-Za-z_][A-Za-z0-9_]*/u.test(message)) {
    return fallback;
  }
  return message;
}

function databaseValidationFailure(databaseCode, body) {
  const reason = databaseCode === "23514"
    ? "structural_violation"
    : "invalid_parameter";
  const fallback = databaseCode === "23514"
    ? "A estrutura enviada viola uma regra do contrato."
    : "Os dados enviados são inválidos.";
  return {
    message: safeValidationMessage(body, fallback),
    details: {
      source: "database_validation",
      sqlState: databaseCode,
      reason
    }
  };
}

function apiError(status, body, fallbackCode = "database_error") {
  const databaseCode = String(body?.code || "");
  if (status === 401) return new AuthoringApiError(401, "authentication_required", "Sessão inválida ou expirada.");
  if (status === 408) {
    return new AuthoringApiError(
      503,
      "service_timeout",
      "O Supabase não respondeu dentro do tempo esperado."
    );
  }
  // PostgREST pode devolver HTTP 403 para uma exceção SQL de autenticação.
  // O SQLSTATE preserva a distinção: uma chave revogada é 401, enquanto uma
  // credencial válida sem permissão continua sendo 403.
  if (databaseCode === "28000") {
    return new AuthoringApiError(401, "invalid_client", "Credencial de autoria inválida.");
  }
  if (status === 403 || databaseCode === "42501") {
    return new AuthoringApiError(403, "not_authorized", "A operação não foi autorizada.");
  }
  if (databaseCode === "40001") {
    return new AuthoringApiError(
      409,
      "stale_authoring_state",
      "O estado da autoria mudou; atualize e tente novamente."
    );
  }
  if (databaseCode === "55P03") {
    return new AuthoringApiError(
      503,
      "publication_lease_unavailable",
      "A publicação já está sendo processada."
    );
  }
  if (databaseCode === "AR409") {
    return new AuthoringApiError(
      409,
      "course_incomplete",
      "A execução ainda não produziu um curso completo e validado."
    );
  }
  if (databaseCode === "AR422") {
    return new AuthoringApiError(
      422,
      "collection_unavailable",
      "A coleção escolhida não está mais disponível."
    );
  }
  if (new Set(["AC409", "PL409"]).has(databaseCode)) {
    return new AuthoringApiError(
      409,
      "idempotency_key_reused",
      "O requestId já foi usado com outro comando."
    );
  }
  if (status === 409 || databaseCode === "23505") {
    return new AuthoringApiError(
      409,
      "conflict",
      "A operação conflita com um registro existente."
    );
  }
  if (databaseCode === "55000") {
    return new AuthoringApiError(409, "invalid_state", "A operação não é válida no estado atual.");
  }
  if (databaseCode === "P0002") {
    return new AuthoringApiError(404, "not_found", "O recurso solicitado não foi encontrado.");
  }
  if (databaseCode === "P0001" && /limite|rate/i.test(String(body?.message || ""))) {
    return new AuthoringApiError(429, "rate_limited", "Limite temporário da API de autoria excedido.");
  }
  if (status === 429) {
    return new AuthoringApiError(429, "rate_limited", "Limite temporário da API de autoria excedido.");
  }
  if (status === 422 || databaseCode === "23514" || databaseCode === "22023") {
    const validation = databaseValidationFailure(databaseCode || "22023", body);
    return new AuthoringApiError(
      422,
      "invalid_command",
      validation.message,
      validation.details
    );
  }
  if (status >= 500) {
    return new AuthoringApiError(
      503,
      "service_unavailable",
      "O serviço de autoria está temporariamente indisponível."
    );
  }
  return new AuthoringApiError(
    status || 500,
    fallbackCode,
    "A operação no banco não pôde ser concluída."
  );
}

export class SupabaseAuthoringAdapter {
  constructor({
    supabaseUrl,
    serverApiKey,
    publishableKey,
    integrationKeySecret = serverApiKey,
    fetchImpl = globalThis.fetch,
    attempts = 5,
    requestTimeoutMs = 8_000,
    publicationLeaseSeconds = 130,
    scheduleBackground = /** @type {null | ((task: Promise<unknown>) => void)} */ (null),
    leaseTokenFactory = () => globalThis.crypto.randomUUID()
  }) {
    this.supabaseUrl = normalizeUrl(supabaseUrl);
    this.serverApiKey = String(serverApiKey || "").trim();
    this.publishableKey = String(publishableKey || "").trim();
    this.integrationKeySecret = String(integrationKeySecret || "");
    this.fetchImpl = fetchImpl;
    this.attempts = attempts;
    this.requestTimeoutMs = requestTimeoutMs;
    this.publicationLeaseSeconds = publicationLeaseSeconds;
    this.scheduleBackground = scheduleBackground;
    this.leaseTokenFactory = leaseTokenFactory;
    this.nextMaintenanceAttemptAt = 0;
    if (!this.serverApiKey) throw new Error("A chave administrativa do Supabase está ausente no servidor.");
    if (!this.publishableKey) throw new Error("A chave pública do Supabase está ausente no servidor.");
    this.authoringEngine = new ArtifactAuthoringEngine({
      supabaseUrl: this.supabaseUrl,
      serverApiKey: this.serverApiKey,
      fetchImpl: this.fetchImpl,
      leaseTokenFactory: this.leaseTokenFactory,
      leaseSeconds: Math.min(Math.max(this.publicationLeaseSeconds, 30), 300),
      rpc: (functionName, payload, options) => this.rpc(functionName, payload, options)
    });
    this.garbageCollector = new ArtifactGarbageCollector({
      supabaseUrl: this.supabaseUrl,
      serverApiKey: this.serverApiKey,
      fetchImpl: this.fetchImpl,
      rpc: (functionName, payload, options) => this.rpc(functionName, payload, options)
    });
  }

  async #request(url, init, {
    retry = true,
    deadlineAt = null,
    timeoutMs = this.requestTimeoutMs
  } = {}) {
    let lastError = null;
    for (let attempt = 1; attempt <= this.attempts; attempt += 1) {
      const remaining = deadlineAt == null ? timeoutMs : deadlineAt - Date.now();
      if (remaining <= 0) {
        throw new AuthoringApiError(503, "service_timeout", "O prazo da operação no Supabase terminou.");
      }
      const controller = new AbortController();
      const timeout = setTimeout(
        () => controller.abort(),
        Math.max(1, Math.min(timeoutMs, remaining))
      );
      try {
        const response = await this.fetchImpl(url, { ...init, signal: controller.signal });
        const source = await response.text();
        let body = null;
        try {
          body = source ? JSON.parse(source) : null;
        } catch {
          body = source;
        }
        if (response.ok) return body;
        const error = apiError(response.status, body);
        if (!retry || !retryableStatus(response.status) || attempt === this.attempts) throw error;
        lastError = error;
      } catch (error) {
        const normalized = controller.signal.aborted
          ? new AuthoringApiError(
            503,
            "service_timeout",
            "O Supabase não respondeu dentro do tempo esperado."
          )
          : error instanceof AuthoringApiError
            ? error
            : new AuthoringApiError(
              503,
              "service_unavailable",
              "Não foi possível alcançar o Supabase."
            );
        lastError = normalized;
        if (!retry
            || (normalized instanceof AuthoringApiError
              && !new Set(["service_timeout", "service_unavailable"]).has(normalized.code))
            || attempt === this.attempts) {
          throw normalized;
        }
      } finally {
        clearTimeout(timeout);
      }
      const delay = attempt * 200;
      if (deadlineAt != null && Date.now() + delay >= deadlineAt) {
        throw lastError || new AuthoringApiError(
          503,
          "service_timeout",
          "O prazo da operação no Supabase terminou."
        );
      }
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
    throw lastError || new AuthoringApiError(503, "service_unavailable", "Serviço indisponível.");
  }

  async rpc(functionName, payload, { deadlineAt = null, timeoutMs = this.requestTimeoutMs } = {}) {
    return this.#request(`${this.supabaseUrl}/rest/v1/rpc/${functionName}`, {
      method: "POST",
      headers: supabaseServerHeaders(this.serverApiKey),
      body: JSON.stringify(payload)
    }, { deadlineAt, timeoutMs });
  }

  async #userForJwt(jwt, { deadlineAt = null } = {}) {
    const body = await this.#request(`${this.supabaseUrl}/auth/v1/user`, {
      method: "GET",
      headers: {
        apikey: this.publishableKey,
        Authorization: `Bearer ${jwt}`
      }
    }, { retry: false, deadlineAt });
    if (!body?.id) {
      throw new AuthoringApiError(401, "authentication_required", "Sessão inválida ou expirada.");
    }
    return body;
  }

  async resolvePrincipal(authentication, { deadlineAt = null } = {}) {
    let payload;
    if (authentication.kind === "api_key") {
      payload = {
        p_api_key_hash: await sha256Hex(authentication.credential),
        p_user_id: null
      };
    } else {
      const user = await this.#userForJwt(authentication.credential, { deadlineAt });
      payload = { p_api_key_hash: null, p_user_id: user.id };
    }
    const principal = first(await this.rpc("resolve_authoring_api_client", payload, { deadlineAt }));
    if (principal?.status === "rate_limited") {
      throw new AuthoringApiError(
        429,
        "rate_limited",
        "Limite temporário da API de autoria excedido."
      );
    }
    if (!principal || principal.active === false) {
      throw new AuthoringApiError(401, "invalid_client", "Cliente de autoria inválido ou revogado.");
    }
    const scopes = Array.isArray(principal.scopes) ? principal.scopes : [];
    const resolved = {
      actorId: principal.actorId || principal.actor_id || principal.actorUserId || principal.actor_user_id || payload.p_user_id,
      clientId: principal.clientId || principal.client_id || null,
      authenticationKind: authentication.kind,
      scopes: authentication.kind === "jwt"
        ? [...new Set([
          ...scopes,
          "authoring:private:read",
          "authoring:private:write",
          "authoring:private:audit"
        ])]
        : scopes,
      rateLimit: principal.rateLimit || principal.rate_limit || null
    };
    if (Date.now() >= this.nextMaintenanceAttemptAt) {
      this.nextMaintenanceAttemptAt = Date.now() + 60 * 60 * 1000;
      const maintenance = this.garbageCollector.collect().then((result) => {
        const retryAfterMs = result.status === "partial"
          ? 10_000
          : result.status === "completed"
            ? 24 * 60 * 60 * 1000
            : 60 * 60 * 1000;
        this.nextMaintenanceAttemptAt = Date.now() + retryAfterMs;
        return result;
      }).catch(() => {
        this.nextMaintenanceAttemptAt = Date.now() + 60 * 60 * 1000;
        return null;
      });
      if (typeof this.scheduleBackground === "function") {
        try {
          this.scheduleBackground(maintenance);
        } catch {
          // Manutenção oportunista não pode impedir a requisição de autoria.
        }
      }
    }
    return resolved;
  }

  async replayCommand({ principal, requestId, apiRequestHash, requiredScope, deadlineAt = null }) {
    void requiredScope;
    return this.authoringEngine.replay({
      principal,
      requestId,
      payloadHash: apiRequestHash,
      deadlineAt
    });
  }

  async getRun({ principal, runId, deadlineAt = null }) {
    const run = await this.authoringEngine.getRun({
      principal, runId, full: true, deadlineAt
    });
    this.#assertRunScope(principal, run, "read");
    return run;
  }

  async listRuns({
    principal,
    limit = 25,
    beforeUpdatedAt = null,
    beforeRunId = null,
    deadlineAt = null
  }) {
    const result = await this.authoringEngine.listRuns({
      principal,
      limit,
      beforeUpdatedAt,
      beforeRunId,
      deadlineAt
    });
    const items = Array.isArray(result.items) ? result.items : [];
    return {
      ...result,
      items: items.filter((run) => this.#runScopeAllowed(principal, run, "read"))
    };
  }

  async getRunAuthorizationSummary({ principal, runId, deadlineAt = null }) {
    return this.authoringEngine.getRun({
      principal, runId, full: false, deadlineAt
    });
  }

  async getRunSummary({ principal, runId, deadlineAt = null }) {
    const run = await this.getRunAuthorizationSummary({ principal, runId, deadlineAt });
    this.#assertRunScope(principal, run, "read");
    return run;
  }

  async getNextPart({ principal, runId, deadlineAt = null }) {
    const run = await this.authoringEngine.getNextPart({
      principal, runId, deadlineAt
    });
    this.#assertRunScope(principal, run, "read");
    return run;
  }

  async getPartSubmission({ principal, runId, partKey, deadlineAt = null }) {
    return this.authoringEngine.getPartSubmission({
      principal, runId, partKey, deadlineAt
    });
  }

  async command({
    principal,
    requestId,
    runId = null,
    command,
    partKey = null,
    payload = {},
    deadlineAt = null
  }) {
    return this.authoringEngine.command({
      principal,
      requestId,
      runId,
      command,
      partKey,
      payload,
      deadlineAt
    });
  }

  async createPrivateIntegration({
    principal,
    requestId,
    name,
    expiresInDays,
    deadlineAt = null
  }) {
    const apiKey = await derivePrivateIntegrationApiKey(
      this.integrationKeySecret,
      principal.actorId,
      requestId
    );
    const result = first(await this.rpc("create_private_authoring_integration", {
      p_actor_user_id: principal.actorId,
      p_request_id: requestId,
      p_name: name,
      p_key_prefix: apiKey.slice(0, 16),
      p_api_key_hash: await sha256Hex(apiKey),
      p_expires_in_days: expiresInDays
    }, { deadlineAt }));
    if (result?.status === "limit_reached") {
      throw new AuthoringApiError(
        409,
        "integration_limit_reached",
        "Revogue uma integração pessoal antes de criar outra."
      );
    }
    const idempotent = result?.idempotent === true;
    return {
      ...result,
      secretAvailable: !idempotent,
      ...(idempotent ? {} : { apiKey })
    };
  }

  async listPrivateIntegrations({ principal, deadlineAt = null }) {
    return first(await this.rpc("list_private_authoring_integrations", {
      p_actor_user_id: principal.actorId
    }, { deadlineAt })) || { items: [], activeLimit: 5 };
  }

  async rotatePrivateIntegration({
    principal,
    clientId,
    requestId,
    expiresInDays,
    deadlineAt = null
  }) {
    const apiKey = await derivePrivateIntegrationApiKey(
      this.integrationKeySecret,
      principal.actorId,
      requestId
    );
    const result = first(await this.rpc("rotate_private_authoring_integration", {
      p_actor_user_id: principal.actorId,
      p_client_id: clientId,
      p_request_id: requestId,
      p_new_key_prefix: apiKey.slice(0, 16),
      p_new_api_key_hash: await sha256Hex(apiKey),
      p_expires_in_days: expiresInDays
    }, { deadlineAt }));
    const idempotent = result?.idempotent === true;
    return {
      ...result,
      secretAvailable: !idempotent,
      ...(idempotent ? {} : { apiKey })
    };
  }

  async revokePrivateIntegration({ principal, clientId, deadlineAt = null }) {
    return first(await this.rpc("revoke_private_authoring_integration", {
      p_actor_user_id: principal.actorId,
      p_client_id: clientId
    }, { deadlineAt }));
  }

  async listPersonalLibraryCourses({
    principal,
    limit = 50,
    afterPosition = null,
    afterSelectionId = null,
    query = "",
    deadlineAt = null
  }) {
    return first(await this.rpc("list_personal_library_courses", {
      p_actor_user_id: principal.actorId,
      p_client_id: principal.clientId,
      p_limit: limit,
      p_after_position: afterPosition,
      p_after_selection_id: afterSelectionId,
      p_query: query
    }, { deadlineAt })) || { items: [], nextCursor: null };
  }

  async getPersonalLibraryCourseStructure({
    principal,
    courseId,
    section = "modules",
    parentId = null,
    limit = 50,
    afterPosition = null,
    afterId = null,
    deadlineAt = null
  }) {
    return first(await this.rpc("get_personal_library_course_structure", {
      p_actor_user_id: principal.actorId,
      p_client_id: principal.clientId,
      p_course_id: courseId,
      p_section: section,
      p_parent_id: parentId,
      p_limit: limit,
      p_after_position: afterPosition,
      p_after_id: afterId
    }, { deadlineAt }));
  }

  async listPersonalStudyPaths({
    principal,
    limit = 50,
    afterPosition = null,
    afterPathId = null,
    deadlineAt = null
  }) {
    return first(await this.rpc("list_personal_study_paths", {
      p_actor_user_id: principal.actorId,
      p_client_id: principal.clientId,
      p_limit: limit,
      p_after_position: afterPosition,
      p_after_path_id: afterPathId
    }, { deadlineAt })) || {
      unassignedCount: 0,
      items: [],
      nextCursor: null
    };
  }

  async renamePersonalLibraryCourse({
    principal,
    requestId,
    courseId,
    title,
    deadlineAt = null
  }) {
    return first(await this.rpc("rename_personal_library_course", {
      p_actor_user_id: principal.actorId,
      p_client_id: principal.clientId,
      p_request_id: requestId,
      p_course_id: courseId,
      p_title: title
    }, { deadlineAt }));
  }

  async createPersonalStudyPath({
    principal,
    requestId,
    title,
    deadlineAt = null
  }) {
    return first(await this.rpc("create_personal_study_path", {
      p_actor_user_id: principal.actorId,
      p_client_id: principal.clientId,
      p_request_id: requestId,
      p_title: title
    }, { deadlineAt }));
  }

  async renamePersonalStudyPath({
    principal,
    requestId,
    pathId,
    title,
    deadlineAt = null
  }) {
    return first(await this.rpc("rename_personal_study_path", {
      p_actor_user_id: principal.actorId,
      p_client_id: principal.clientId,
      p_request_id: requestId,
      p_path_id: pathId,
      p_title: title
    }, { deadlineAt }));
  }

  async deletePersonalStudyPath({
    principal,
    requestId,
    pathId,
    deadlineAt = null
  }) {
    return first(await this.rpc("delete_personal_study_path", {
      p_actor_user_id: principal.actorId,
      p_client_id: principal.clientId,
      p_request_id: requestId,
      p_path_id: pathId
    }, { deadlineAt }));
  }

  async movePersonalCourseSelection({
    principal,
    requestId,
    selectionId,
    targetPathId,
    deadlineAt = null
  }) {
    return first(await this.rpc("move_personal_course_selection", {
      p_actor_user_id: principal.actorId,
      p_client_id: principal.clientId,
      p_request_id: requestId,
      p_selection_id: selectionId,
      p_target_path_id: targetPathId
    }, { deadlineAt }));
  }

  async listCatalogSubmissionCandidates({ principal, deadlineAt = null }) {
    return first(await this.rpc("list_catalog_submission_candidates_authoring", {
      p_actor_user_id: principal.actorId, p_client_id: principal.clientId
    }, { deadlineAt })) || { items: [] };
  }

  async listMyCatalogSubmissions({ principal, deadlineAt = null }) {
    return first(await this.rpc("list_my_catalog_submissions_authoring", {
      p_actor_user_id: principal.actorId, p_client_id: principal.clientId
    }, { deadlineAt })) || { items: [] };
  }

  async listCatalogSubmissionQueue({ principal, deadlineAt = null }) {
    return first(await this.rpc("list_catalog_submission_queue_authoring", {
      p_actor_user_id: principal.actorId, p_client_id: principal.clientId
    }, { deadlineAt })) || { items: [] };
  }

  async submitCatalogSubmission({ principal, requestId, submissionId, courseId, consent, licenseCode, attribution, provenance, deadlineAt = null }) {
    return first(await this.rpc("submit_personal_course_to_catalog_authoring", {
      p_actor_user_id: principal.actorId, p_client_id: principal.clientId,
      p_request_id: requestId, p_submission_id: submissionId, p_course_id: courseId,
      p_consent: consent, p_license_code: licenseCode,
      p_attribution_text: attribution, p_provenance_text: provenance
    }, { deadlineAt }));
  }

  async withdrawCatalogSubmission({ principal, requestId, submissionId, deadlineAt = null }) {
    return first(await this.rpc("withdraw_catalog_submission_authoring", {
      p_actor_user_id: principal.actorId, p_client_id: principal.clientId,
      p_request_id: requestId, p_submission_id: submissionId
    }, { deadlineAt }));
  }

  async startCatalogSubmissionReview({ principal, requestId, submissionId, deadlineAt = null }) {
    return first(await this.rpc("start_catalog_submission_review_authoring", {
      p_actor_user_id: principal.actorId, p_client_id: principal.clientId,
      p_request_id: requestId, p_submission_id: submissionId
    }, { deadlineAt }));
  }

  async decideCatalogSubmission({ principal, requestId, submissionId, decision, collectionId, contractKey, note, deadlineAt = null }) {
    return first(await this.rpc("decide_catalog_submission_authoring", {
      p_actor_user_id: principal.actorId, p_client_id: principal.clientId,
      p_request_id: requestId, p_submission_id: submissionId, p_decision: decision,
      p_collection_id: collectionId, p_official_contract_key: contractKey, p_note: note
    }, { deadlineAt }));
  }

  async listCatalogCollections({
    principal,
    limit = 50,
    afterPosition = null,
    afterId = null,
    query = "",
    includeRetired = false,
    deadlineAt = null
  }) {
    return first(await this.rpc("list_catalog_collections_admin", {
      p_actor_user_id: principal.actorId,
      p_limit: limit,
      p_after_position: afterPosition,
      p_after_id: afterId,
      p_query: query,
      p_include_retired: includeRetired
    }, { deadlineAt })) || { items: [], nextCursor: null };
  }

  async listCatalogCourses({
    principal,
    collectionId,
    limit = 50,
    afterPosition = null,
    afterId = null,
    query = "",
    deadlineAt = null
  }) {
    return first(await this.rpc("list_catalog_courses_admin", {
      p_actor_user_id: principal.actorId,
      p_collection_id: collectionId,
      p_limit: limit,
      p_after_position: afterPosition,
      p_after_id: afterId,
      p_query: query
    }, { deadlineAt })) || {
      collectionId,
      items: [],
      nextCursor: null
    };
  }

  async getCatalogCourse({
    principal,
    courseId,
    deadlineAt = null
  }) {
    return first(await this.rpc("get_catalog_course_admin", {
      p_actor_user_id: principal.actorId,
      p_course_id: courseId
    }, { deadlineAt }));
  }

  async getCatalogCourseStructure({
    principal,
    courseId,
    section = "modules",
    parentId = null,
    limit = 25,
    afterPosition = null,
    afterId = null,
    deadlineAt = null
  }) {
    return first(await this.rpc("get_catalog_course_structure_admin", {
      p_actor_user_id: principal.actorId,
      p_course_id: courseId,
      p_section: section,
      p_parent_id: parentId,
      p_limit: limit,
      p_after_position: afterPosition,
      p_after_id: afterId
    }, { deadlineAt })) || {
      course: null,
      authoringUpdate: null,
      section,
      parentId,
      items: [],
      nextCursor: null
    };
  }

  async updateCatalogCourseMetadata({
    principal,
    requestId,
    courseId,
    baseRevision,
    title = null,
    goal = null,
    deadlineAt = null
  }) {
    return first(await this.rpc("update_catalog_course_metadata_admin", {
      p_actor_user_id: principal.actorId,
      p_request_id: requestId,
      p_course_id: courseId,
      p_base_revision: baseRevision,
      p_title: title,
      p_goal: goal
    }, { deadlineAt }));
  }

  async createCatalogCollection({
    principal,
    requestId,
    contractKey,
    title,
    description,
    deadlineAt = null
  }) {
    return first(await this.rpc("create_catalog_collection_admin", {
      p_actor_user_id: principal.actorId,
      p_request_id: requestId,
      p_contract_key: contractKey,
      p_title: title,
      p_description: description
    }, { deadlineAt }));
  }

  async renameCatalogCollection({
    principal,
    requestId,
    collectionId,
    baseRevision,
    title,
    description,
    deadlineAt = null
  }) {
    return first(await this.rpc("rename_catalog_collection_admin", {
      p_actor_user_id: principal.actorId,
      p_request_id: requestId,
      p_collection_id: collectionId,
      p_base_revision: baseRevision,
      p_title: title,
      p_description: description
    }, { deadlineAt }));
  }

  async retireCatalogCollection({
    principal,
    requestId,
    collectionId,
    replacementCollectionId,
    baseRevision,
    deadlineAt = null
  }) {
    return first(await this.rpc("retire_catalog_collection_admin", {
      p_actor_user_id: principal.actorId,
      p_request_id: requestId,
      p_collection_id: collectionId,
      p_replacement_collection_id: replacementCollectionId,
      p_base_revision: baseRevision
    }, { deadlineAt }));
  }

  async reorderCatalogCollections({
    principal,
    requestId,
    order,
    deadlineAt = null
  }) {
    return first(await this.rpc("reorder_catalog_collections_admin", {
      p_actor_user_id: principal.actorId,
      p_request_id: requestId,
      p_order: order
    }, { deadlineAt }));
  }

  async moveCatalogCourse({
    principal,
    requestId,
    courseId,
    targetCollectionId,
    baseRevision,
    deadlineAt = null
  }) {
    return first(await this.rpc("move_catalog_course_admin", {
      p_actor_user_id: principal.actorId,
      p_request_id: requestId,
      p_course_id: courseId,
      p_target_collection_id: targetCollectionId,
      p_base_revision: baseRevision
    }, { deadlineAt }));
  }

  async reorderCatalogCourses({
    principal,
    requestId,
    collectionId,
    order,
    deadlineAt = null
  }) {
    return first(await this.rpc("reorder_catalog_courses_admin", {
      p_actor_user_id: principal.actorId,
      p_request_id: requestId,
      p_collection_id: collectionId,
      p_order: order
    }, { deadlineAt }));
  }

  async openCourseRevision({
    principal,
    revisionId,
    target,
    courseId,
    microsequenceId = null,
    cardId = null,
    deadlineAt = null
  }) {
    return first(await this.rpc("open_course_content_revision", {
      p_actor_user_id: principal.actorId,
      p_api_client_id: principal.clientId,
      p_revision_id: revisionId,
      p_target: target,
      p_course_id: courseId,
      p_microsequence_id: microsequenceId,
      p_card_id: cardId
    }, { deadlineAt }));
  }

  async resolvePrivateCourseRevisionTarget({
    principal,
    mutationId,
    courseId,
    microsequenceId = null,
    cardId = null,
    deadlineAt = null
  }) {
    return first(await this.rpc("resolve_private_course_revision_target", {
      p_actor_user_id: principal.actorId,
      p_api_client_id: principal.clientId,
      p_mutation_id: mutationId,
      p_course_id: courseId,
      p_microsequence_id: microsequenceId,
      p_card_id: cardId
    }, { deadlineAt }));
  }

  async getCourseRevision({
    principal,
    revisionId,
    deadlineAt = null
  }) {
    return first(await this.rpc("get_course_content_revision", {
      p_actor_user_id: principal.actorId,
      p_api_client_id: principal.clientId,
      p_revision_id: revisionId
    }, { deadlineAt }));
  }

  async getCourseRevisionFragment({
    principal,
    revisionId,
    deadlineAt = null
  }) {
    return first(await this.rpc("get_course_content_revision_fragment", {
      p_actor_user_id: principal.actorId,
      p_api_client_id: principal.clientId,
      p_revision_id: revisionId
    }, { deadlineAt }));
  }

  async getCourseRevisionDocumentRows({
    principal,
    revisionId,
    deadlineAt = null
  }) {
    return first(await this.rpc("get_course_content_revision_document_rows", {
      p_actor_user_id: principal.actorId,
      p_api_client_id: principal.clientId,
      p_revision_id: revisionId
    }, { deadlineAt }));
  }

  async saveCourseRevisionPatch({
    principal,
    revisionId,
    requestId,
    baseContentHash,
    authoringFragment,
    compiledFragment,
    relationalPatch,
    scopedDiff,
    expectedContentHash,
    deadlineAt = null
  }) {
    return first(await this.rpc("save_course_content_revision_patch", {
      p_actor_user_id: principal.actorId,
      p_api_client_id: principal.clientId,
      p_revision_id: revisionId,
      p_request_id: requestId,
      p_base_content_hash: baseContentHash,
      p_authoring_fragment: authoringFragment,
      p_compiled_fragment: compiledFragment,
      p_relational_patch: relationalPatch,
      p_scoped_diff: scopedDiff,
      p_expected_content_hash: expectedContentHash
    }, { deadlineAt }));
  }

  async applyCourseRevision({
    principal,
    revisionId,
    requestId,
    baseContentHash,
    deadlineAt = null
  }) {
    return first(await this.rpc("apply_course_content_revision", {
      p_actor_user_id: principal.actorId,
      p_api_client_id: principal.clientId,
      p_revision_id: revisionId,
      p_request_id: requestId,
      p_base_content_hash: baseContentHash
    }, { deadlineAt }));
  }

  #runScopeAllowed(principal, run, action) {
    const target = run?.publicationTarget || run?.target || "catalog";
    const scopes = new Set(Array.isArray(principal?.scopes) ? principal.scopes : []);
    if (scopes.has("*")) return true;
    return target === "private"
      ? scopes.has(`authoring:private:${action}`)
      : scopes.has(`authoring:${action}`);
  }

  #assertRunScope(principal, run, action) {
    if (this.#runScopeAllowed(principal, run, action)) return;
    throw new AuthoringApiError(403, "insufficient_scope", "A credencial não permite acessar este destino.");
  }

  async publishRun({ principal, runId, requestId, deadlineAt = null }) {
    return this.authoringEngine.command({
      principal,
      requestId,
      runId,
      command: "publish",
      payload: {},
      deadlineAt
    });
  }


  async importDocument({
    principal,
    requestId,
    target,
    collectionId,
    publicationIntent,
    document,
    apiRequestHash = null,
    deadlineAt = null
  }) {
    if (target !== "catalog") {
      throw new AuthoringApiError(422, "unsupported_target", "A API de autoria importa somente para o catálogo.");
    }
    const identity = `${principal.actorId}:import:${requestId}`;
    const runId = await deterministicRequestUuid(identity);
    return this.command({
      principal,
      runId,
      requestId,
      command: "import_document",
      payload: {
        publicationTarget: target,
        collectionId,
        publicationIntent,
        document,
        ...(apiRequestHash ? { _apiRequestHash: apiRequestHash } : {})
      },
      deadlineAt
    });
  }
}
