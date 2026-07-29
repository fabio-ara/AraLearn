import { ArtifactGarbageCollector } from "./artifactGarbageCollector.js";
import { AuthoringWorkspaceEngine } from "./workspaceEngine.js";
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
    scheduleBackground = /** @type {null | ((task: Promise<unknown>) => void)} */ (null)
  }) {
    this.supabaseUrl = normalizeUrl(supabaseUrl);
    this.serverApiKey = String(serverApiKey || "").trim();
    this.publishableKey = String(publishableKey || "").trim();
    this.integrationKeySecret = String(integrationKeySecret || "");
    this.fetchImpl = fetchImpl;
    this.attempts = attempts;
    this.requestTimeoutMs = requestTimeoutMs;
    this.scheduleBackground = scheduleBackground;
    this.nextMaintenanceAttemptAt = 0;
    if (!this.serverApiKey) throw new Error("A chave administrativa do Supabase está ausente no servidor.");
    if (!this.publishableKey) throw new Error("A chave pública do Supabase está ausente no servidor.");
    this.workspaceEngine = new AuthoringWorkspaceEngine({
      supabaseUrl: this.supabaseUrl,
      serverApiKey: this.serverApiKey,
      fetchImpl: this.fetchImpl,
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

  async createWorkspace(options) {
    return this.workspaceEngine.create(options);
  }

  async listWorkspaces(options) {
    return this.workspaceEngine.list(options);
  }

  async getWorkspace(options) {
    return this.workspaceEngine.get(options);
  }

  async getWorkspaceHistory(options) {
    return this.workspaceEngine.history(options);
  }

  async readCourseContent(options) {
    return this.workspaceEngine.readCourse(options);
  }

  async mutateWorkspace(options) {
    return this.workspaceEngine.mutate(options);
  }

  async importCourseIntoWorkspace(options) {
    return this.workspaceEngine.importCourse(options);
  }

  async publishWorkspaceCourse(options) {
    return this.workspaceEngine.publish(options);
  }

  async deleteWorkspace(options) {
    return this.workspaceEngine.delete(options);
  }

}
