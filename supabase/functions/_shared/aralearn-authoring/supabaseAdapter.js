import { ArtifactGarbageCollector } from "./artifactGarbageCollector.js";
import { AuthoringWorkspaceEngine } from "./workspaceEngine.js";
import { AuthoringApiError } from "./errors.js";
import { decodeJwtClaims } from "./security.js";
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

function stringClaim(value) {
  return typeof value === "string" ? value.trim() : "";
}

function claimAudienceIncludes(audience, expected) {
  return (Array.isArray(audience) ? audience : [audience])
    .some((value) => stringClaim(value) === expected);
}

function assertMcpOAuthClaims(claims, {
  issuer,
  resource,
  nowSeconds = Math.floor(Date.now() / 1000)
}) {
  const oauthClientId = stringClaim(claims?.client_id);
  if (stringClaim(claims?.iss) !== issuer
      || !claimAudienceIncludes(claims?.aud, resource)
      || !oauthClientId
      || stringClaim(claims?.sub) === ""
      || !Number.isFinite(claims?.iat)
      || claims.iat > nowSeconds + 30
      || !Number.isFinite(claims?.exp)
      || claims.exp <= nowSeconds
      || (claims?.nbf != null && (
        !Number.isFinite(claims.nbf)
        || claims.nbf > nowSeconds + 30
      ))) {
    throw new AuthoringApiError(
      401,
      "invalid_oauth_token",
      "O access token não foi emitido para este recurso MCP."
    );
  }
  return { oauthClientId };
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

function structuredDatabaseDetail(body) {
  if (body?.details && typeof body.details === "object"
      && !Array.isArray(body.details)) {
    return body.details;
  }
  if (typeof body?.details !== "string" || body.details.length > 32_768) {
    return null;
  }
  try {
    const parsed = JSON.parse(body.details);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed
      : null;
  } catch {
    return null;
  }
}

function databaseConstraintRule(body) {
  const match = String(body?.message || "")
    .match(/\bconstraint\s+"([A-Za-z_][A-Za-z0-9_]*)"/iu);
  return match?.[1] || null;
}

function isIdempotencyKeyReuse(databaseCode, body) {
  if (databaseCode !== "23505") return false;
  return /\b(?:request|mutation)id\b.{0,120}\b(?:reutilizad[oa]|usad[oa])\b.{0,120}\b(?:diferent\w*|outr[oa])\b/iu
    .test(String(body?.message || ""));
}

function databaseValidationFailure(databaseCode, body) {
  const reason = databaseCode === "23514"
    ? "structural_violation"
    : "invalid_parameter";
  const fallback = databaseCode === "23514"
    ? "A estrutura enviada viola uma regra do contrato."
    : "Os dados enviados são inválidos.";
  const structured = structuredDatabaseDetail(body);
  const rule = typeof structured?.rule === "string"
    ? structured.rule
    : databaseConstraintRule(body);
  return {
    message: safeValidationMessage(body, fallback),
    details: {
      source: "database_validation",
      sqlState: databaseCode,
      reason,
      ...(rule ? { rule } : {}),
      ...(typeof structured?.path === "string"
        ? { path: structured.path }
        : {}),
      ...(Array.isArray(structured?.errors)
        ? { errors: structured.errors }
        : {})
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
  // O SQLSTATE preserva a distinção entre uma identidade OAuth inválida e uma
  // sessão autenticada sem a permissão necessária.
  if (databaseCode === "28000") {
    return new AuthoringApiError(401, "invalid_oauth_token", "Identidade OAuth inválida.");
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
  if (new Set(["AC409", "CS409", "PL409"]).has(databaseCode)) {
    return new AuthoringApiError(
      409,
      "idempotency_key_reused",
      "O requestId já foi usado com outro comando."
    );
  }
  if (isIdempotencyKeyReuse(databaseCode, body)) {
    return new AuthoringApiError(
      409,
      "idempotency_key_reused",
      "O requestId já foi usado com outro comando."
    );
  }
  if (databaseCode === "AS409") {
    return new AuthoringApiError(
      409,
      "active_catalog_submission",
      "Retire ou conclua a submissão editorial ativa antes de retirar o curso privado."
    );
  }
  if (databaseCode === "RS409") {
    return new AuthoringApiError(
      409,
      "catalog_review_in_progress",
      "A revisão anterior já foi assumida; aguarde a decisão editorial ou retire esse envio antes de submeter outra revisão."
    );
  }
  if (databaseCode === "RC409") {
    return new AuthoringApiError(
      409,
      "catalog_review_unavailable",
      "A revisão não está disponível para esta conta; atualize a fila antes de tentar novamente."
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
    return new AuthoringApiError(429, "rate_limited", "Limite temporário do MCP de autoria excedido.");
  }
  if (status === 429) {
    return new AuthoringApiError(429, "rate_limited", "Limite temporário do MCP de autoria excedido.");
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
    oauthIssuer = "",
    serverApiKey,
    publishableKey,
    fetchImpl = globalThis.fetch,
    attempts = 5,
    requestTimeoutMs = 8_000,
    scheduleBackground = /** @type {null | ((task: Promise<unknown>) => void)} */ (null)
  }) {
    this.supabaseUrl = normalizeUrl(supabaseUrl);
    this.oauthIssuer = normalizeUrl(
      oauthIssuer || `${this.supabaseUrl}/auth/v1`
    );
    this.serverApiKey = String(serverApiKey || "").trim();
    this.publishableKey = String(publishableKey || "").trim();
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

  async resolveApplicationUser(jwt, { deadlineAt = null } = {}) {
    const user = await this.#userForJwt(jwt, { deadlineAt });
    return {
      id: String(user.id),
      email: stringClaim(user.email)
    };
  }

  async createActionOAuthClientSetup({
    creatorUserId,
    clientName,
    clientSecretHash
  }, { deadlineAt = null } = {}) {
    return first(await this.rpc("create_authoring_action_oauth_client_setup_v4", {
      p_creator_user_id: creatorUserId,
      p_client_name: clientName,
      p_client_secret_hash: clientSecretHash
    }, { deadlineAt }));
  }

  async linkActionOAuthClient({
    creatorUserId,
    clientId,
    gptId
  }, { deadlineAt = null } = {}) {
    return first(await this.rpc("link_authoring_action_oauth_client_v4", {
      p_creator_user_id: creatorUserId,
      p_client_id: clientId,
      p_gpt_id: gptId
    }, { deadlineAt }));
  }

  async createActionOAuthAuthorization({
    clientId,
    redirectUri,
    state,
    scope
  }, { deadlineAt = null } = {}) {
    return first(await this.rpc("create_authoring_action_oauth_authorization_v4", {
      p_client_id: clientId,
      p_redirect_uri: redirectUri,
      p_state: state,
      p_scope: scope
    }, { deadlineAt }));
  }

  async getActionOAuthAuthorization({
    authorizationId,
    userId
  }, { deadlineAt = null } = {}) {
    return first(await this.rpc("get_authoring_action_oauth_authorization_v4", {
      p_authorization_id: authorizationId,
      p_user_id: userId
    }, { deadlineAt }));
  }

  async decideActionOAuthAuthorization({
    authorizationId,
    userId,
    action,
    codeHash = null
  }, { deadlineAt = null } = {}) {
    const functionName = action === "approve"
      ? "approve_authoring_action_oauth_authorization_v4"
      : "deny_authoring_action_oauth_authorization_v4";
    return first(await this.rpc(functionName, {
      p_authorization_id: authorizationId,
      p_user_id: userId,
      ...(action === "approve" ? { p_code_hash: codeHash } : {})
    }, { deadlineAt }));
  }

  async exchangeActionOAuthCode({
    clientId,
    clientSecretHash,
    codeHash,
    redirectUri,
    accessTokenHash,
    refreshTokenHash,
    grantId
  }, { deadlineAt = null } = {}) {
    return first(await this.rpc("exchange_authoring_action_oauth_code_v4", {
      p_client_id: clientId,
      p_client_secret_hash: clientSecretHash,
      p_code_hash: codeHash,
      p_redirect_uri: redirectUri,
      p_access_token_hash: accessTokenHash,
      p_refresh_token_hash: refreshTokenHash,
      p_grant_id: grantId
    }, { deadlineAt }));
  }

  async exchangeActionOAuthRefresh({
    clientId,
    clientSecretHash,
    refreshTokenHash,
    accessTokenHash,
    newRefreshTokenHash
  }, { deadlineAt = null } = {}) {
    return first(await this.rpc("exchange_authoring_action_oauth_refresh_v4", {
      p_client_id: clientId,
      p_client_secret_hash: clientSecretHash,
      p_refresh_token_hash: refreshTokenHash,
      p_access_token_hash: accessTokenHash,
      p_new_refresh_token_hash: newRefreshTokenHash
    }, { deadlineAt }));
  }

  async resolveActionPrincipal(accessTokenHash, { deadlineAt = null } = {}) {
    const principal = first(await this.rpc(
      "resolve_authoring_action_oauth_principal_v4",
      { p_access_token_hash: accessTokenHash },
      { deadlineAt }
    ));
    if (principal?.status === "rate_limited") {
      throw new AuthoringApiError(
        429,
        "rate_limited",
        "Limite temporário da autoria excedido."
      );
    }
    if (!principal || principal.active === false) {
      throw new AuthoringApiError(401, "invalid_oauth_token", "Identidade OAuth inválida.");
    }
    const scopes = Array.isArray(principal.scopes) ? principal.scopes : [];
    return {
      actorId: principal.actorId || principal.actor_id || principal.actorUserId
        || principal.actor_user_id,
      authenticationKind: "oauth",
      scopes: [...new Set([
        ...scopes,
        "authoring:private:read",
        "authoring:private:write",
        "authoring:private:audit"
      ])],
      rateLimit: principal.rateLimit || principal.rate_limit || null,
      oauthClientId: principal.oauthClientId || principal.oauth_client_id
    };
  }

  async resolvePrincipal(authentication, { deadlineAt = null } = {}) {
    if (authentication?.kind !== "oauth") {
      throw new AuthoringApiError(
        401,
        "oauth_required",
        "O gateway de autoria aceita somente access token OAuth 2.1."
      );
    }
    const user = await this.#userForJwt(authentication.credential, { deadlineAt });
    const claims = decodeJwtClaims(authentication.credential);
    const oauth = assertMcpOAuthClaims(claims, {
      issuer: this.oauthIssuer,
      resource: String(authentication.resource || "").trim()
    });
    if (stringClaim(claims.sub) !== String(user.id)) {
      throw new AuthoringApiError(
        401,
        "invalid_oauth_token",
        "A identidade do access token OAuth não corresponde à sessão validada."
      );
    }
    const principal = first(await this.rpc("resolve_authoring_oauth_principal", {
      p_user_id: user.id
    }, { deadlineAt }));
    if (principal?.status === "rate_limited") {
      throw new AuthoringApiError(
        429,
        "rate_limited",
        "Limite temporário do MCP de autoria excedido."
      );
    }
    if (!principal || principal.active === false) {
      throw new AuthoringApiError(401, "invalid_oauth_token", "Identidade OAuth inválida.");
    }
    const scopes = Array.isArray(principal.scopes) ? principal.scopes : [];
    const resolved = {
      actorId: principal.actorId || principal.actor_id || principal.actorUserId || principal.actor_user_id || user.id,
      authenticationKind: "oauth",
      scopes: [...new Set([
        ...scopes,
        "authoring:private:read",
        "authoring:private:write",
        "authoring:private:audit"
      ])],
      rateLimit: principal.rateLimit || principal.rate_limit || null,
      oauthClientId: oauth.oauthClientId
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

  async listPersonalLibraryCourses({
    principal,
    limit = 50,
    afterPosition = null,
    afterSelectionId = null,
    query = "",
    deadlineAt = null
  }) {
    return first(await this.rpc("list_personal_library_courses", {
      p_owner_id: principal.actorId,
      p_limit: limit,
      p_after_position: afterPosition,
      p_after_selection_id: afterSelectionId,
      p_query: query
    }, { deadlineAt })) || { items: [], nextCursor: null };
  }

  async removePersonalLibraryCourse({
    principal,
    selectionId,
    courseId,
    requestId,
    expectedContentHash,
    deadlineAt = null
  }) {
    return first(await this.rpc("remove_course_from_personal_library_v5", {
      p_actor_id: principal.actorId,
      p_selection_id: selectionId,
      p_course_id: courseId,
      p_request_id: requestId,
      p_expected_content_hash: expectedContentHash
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
    const result = includeRetired
      ? await this.rpc("list_catalog_collections_admin", {
          p_actor_user_id: principal.actorId,
          p_limit: limit,
          p_after_position: afterPosition,
          p_after_id: afterId,
          p_query: query,
          p_include_retired: true
        }, { deadlineAt })
      : await this.rpc("list_authoring_catalog_collections_v4", {
          p_owner_id: principal.actorId,
          p_limit: limit,
          p_after_position: afterPosition,
          p_after_id: afterId,
          p_query: query
        }, { deadlineAt });
    return first(result) || { items: [], nextCursor: null };
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
    return first(await this.rpc("list_authoring_catalog_courses_v4", {
      p_owner_id: principal.actorId,
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

  async searchCatalogCourses({
    principal,
    query,
    limit = 20,
    afterTitle = null,
    afterCourseId = null,
    deadlineAt = null
  }) {
    return first(await this.rpc("search_authoring_catalog_courses_v5", {
      p_owner_id: principal.actorId,
      p_query: query,
      p_limit: limit,
      p_after_title: afterTitle,
      p_after_course_id: afterCourseId
    }, { deadlineAt })) || {
      query,
      items: [],
      nextCursor: null
    };
  }

  async createCatalogCollection({
    principal,
    collectionId,
    requestId,
    contractKey,
    title,
    description,
    deadlineAt = null
  }) {
    return first(await this.rpc("create_catalog_collection_v5", {
      p_actor_id: principal.actorId,
      p_collection_id: collectionId,
      p_request_id: requestId,
      p_contract_key: contractKey,
      p_title: title,
      p_description: description
    }, { deadlineAt }));
  }

  async updateCatalogCollection({
    principal,
    collectionId,
    requestId,
    expectedRevision,
    title,
    description,
    deadlineAt = null
  }) {
    return first(await this.rpc("update_catalog_collection_v5", {
      p_actor_id: principal.actorId,
      p_collection_id: collectionId,
      p_request_id: requestId,
      p_expected_revision: expectedRevision,
      p_title: title,
      p_description: description
    }, { deadlineAt }));
  }

  async retireCatalogCollection({
    principal,
    collectionId,
    requestId,
    expectedRevision,
    replacementCollectionId,
    deadlineAt = null
  }) {
    return first(await this.rpc("retire_catalog_collection_v5", {
      p_actor_id: principal.actorId,
      p_collection_id: collectionId,
      p_request_id: requestId,
      p_expected_revision: expectedRevision,
      p_replacement_collection_id: replacementCollectionId
    }, { deadlineAt }));
  }

  async moveCatalogCourse({
    principal,
    courseId,
    requestId,
    expectedPlacementRevision,
    targetCollectionId,
    position,
    deadlineAt = null
  }) {
    return first(await this.rpc("move_catalog_course_v5", {
      p_actor_id: principal.actorId,
      p_course_id: courseId,
      p_request_id: requestId,
      p_expected_placement_revision: expectedPlacementRevision,
      p_target_collection_id: targetCollectionId,
      p_position: position
    }, { deadlineAt }));
  }

  async removeCatalogCourse({
    principal,
    courseId,
    requestId,
    expectedPlacementRevision,
    expectedContentHash,
    deadlineAt = null
  }) {
    return first(await this.rpc("remove_catalog_course_v5", {
      p_actor_id: principal.actorId,
      p_course_id: courseId,
      p_request_id: requestId,
      p_expected_placement_revision: expectedPlacementRevision,
      p_expected_content_hash: expectedContentHash
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

  async listWorkspaceMicrosequenceCards({
    principal,
    workspaceId,
    microsequencePath,
    limit = 50,
    afterPosition = null,
    afterId = null,
    deadlineAt = null
  }) {
    return first(await this.rpc("list_authoring_workspace_microsequence_cards_v5", {
      p_owner_id: principal.actorId,
      p_workspace_id: workspaceId,
      p_microsequence_path: microsequencePath,
      p_limit: limit,
      p_after_position: afterPosition,
      p_after_id: afterId
    }, { deadlineAt }));
  }

  async getWorkspaceEvents(options) {
    return this.workspaceEngine.events(options);
  }

  async readCourseContent(options) {
    return this.workspaceEngine.readCourse(options);
  }

  async mutateWorkspace(options) {
    return this.workspaceEngine.mutate(options);
  }

  async updateWorkspaceBrief(options) {
    return this.workspaceEngine.updateBrief(options);
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

  async submitCourseForReview(options) {
    return this.workspaceEngine.submitForReview(options);
  }

  async listCatalogReviews(options) {
    return this.workspaceEngine.listReviews(options);
  }

  async readCatalogReview(options) {
    return this.workspaceEngine.readReview(options);
  }

  async claimCatalogReview(options) {
    return this.workspaceEngine.claimReview(options);
  }

  async createCatalogReviewWorkspace(options) {
    return this.workspaceEngine.createReviewWorkspace(options);
  }

  async decideCatalogReview(options) {
    return this.workspaceEngine.decideReview(options);
  }

  async withdrawCatalogReview(options) {
    return this.workspaceEngine.withdrawReview(options);
  }

}
