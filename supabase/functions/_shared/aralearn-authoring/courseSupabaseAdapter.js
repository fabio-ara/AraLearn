import { AuthoringApiError } from "./errors.js";
import { decodeJwtClaims } from "./security.js";
import { supabaseServerHeaders } from "./supabaseEnvironment.js";
import { composeCourseDocument } from "../aralearn/runtime/domain/courseEntities.js";

function first(value) {
  return Array.isArray(value) ? value[0] || null : value;
}

function requiredUrl(value, label) {
  const source = String(value || "").trim().replace(/\/+$/u, "");
  if (!source) throw new Error(`${label} ausente.`);
  return source;
}

function claimText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function audienceIncludes(audience, expected) {
  return (Array.isArray(audience) ? audience : [audience])
    .some((value) => claimText(value) === expected);
}

function assertMcpClaims(claims, { issuer, resource, now = Math.floor(Date.now() / 1_000) }) {
  const clientId = claimText(claims?.client_id);
  if (claimText(claims?.iss) !== issuer ||
      !audienceIncludes(claims?.aud, resource) ||
      !clientId || !claimText(claims?.sub) ||
      !Number.isFinite(claims?.iat) || claims.iat > now + 30 ||
      !Number.isFinite(claims?.exp) || claims.exp <= now ||
      (claims?.nbf != null && (!Number.isFinite(claims.nbf) || claims.nbf > now + 30))) {
    throw new AuthoringApiError(
      401,
      "invalid_oauth_token",
      "O access token não foi emitido para este recurso MCP."
    );
  }
  return clientId;
}

function retryableStatus(status) {
  return status === 408 || status === 429 || status >= 500;
}

function databaseError(status, body) {
  const code = String(body?.code || "");
  if (status === 401 || code === "28000") {
    return new AuthoringApiError(401, "authentication_required", "Sessão inválida ou expirada.");
  }
  if (status === 403 || code === "42501") {
    return new AuthoringApiError(403, "not_authorized", "A operação não foi autorizada.");
  }
  if (code === "PT404") {
    return new AuthoringApiError(404, "not_found", "O Curso não foi encontrado.");
  }
  if (code === "40001") {
    return new AuthoringApiError(
      409,
      "stale_course_state",
      "O Curso mudou; releia o estado e tente novamente."
    );
  }
  if (status === 409 || code === "23505") {
    return new AuthoringApiError(409, "conflict", "A operação conflita com o estado existente.");
  }
  if (status === 413) {
    return new AuthoringApiError(413, "payload_too_large", "A alteração excede o limite aceito.");
  }
  if (status === 422 || code === "22023" || code === "23514") {
    return new AuthoringApiError(422, "invalid_course_command", "Os dados do Curso são inválidos.");
  }
  if (status === 429) {
    return new AuthoringApiError(429, "rate_limited", "Limite temporário excedido.");
  }
  return new AuthoringApiError(
    status >= 500 ? 503 : status || 500,
    "course_service_unavailable",
    "O serviço de Cursos não concluiu a operação."
  );
}

function withDeepLink(value, publicAppUrl) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const result = structuredClone(value);
  const attach = (course) => {
    const courseId = String(course?.courseId || "").trim();
    return courseId
      ? {
          ...course,
          deepLink: `${publicAppUrl}/#/authoring/courses/${courseId}?section=structure`
        }
      : course;
  };
  if (Array.isArray(result.items)) result.items = result.items.map(attach);
  if (result.course && typeof result.course === "object") result.course = attach(result.course);
  if (result.courseId) return attach(result);
  return result;
}

function entityKey(value) {
  return `${String(value?.entityType || "")}\u0000${String(value?.entityId || "")}`;
}

function applyEntityChanges(rows, upserts, deletes) {
  const byId = new Map(rows.map((row) => [entityKey(row), structuredClone(row)]));
  const removed = new Set(deletes.map(entityKey));
  let changed = true;
  while (changed) {
    changed = false;
    for (const [key, row] of byId) {
      if (removed.has(key) || row.parentType == null) continue;
      if (removed.has(`${row.parentType}\u0000${row.parentId}`)) {
        removed.add(key);
        changed = true;
      }
    }
  }
  for (const key of removed) byId.delete(key);
  for (const upsert of upserts) byId.set(entityKey(upsert), structuredClone(upsert));
  return [...byId.values()];
}

export class CourseSupabaseAdapter {
  /**
   * @param {{
   *   supabaseUrl?: string,
   *   oauthIssuer?: string,
   *   serverApiKey?: string,
   *   publishableKey?: string,
   *   publicAppUrl?: string,
   *   fetchImpl?: typeof globalThis.fetch,
   *   attempts?: number,
   *   requestTimeoutMs?: number
   * }} [options]
   */
  constructor({
    supabaseUrl,
    oauthIssuer = "",
    serverApiKey,
    publishableKey,
    publicAppUrl,
    fetchImpl = globalThis.fetch,
    attempts = 3,
    requestTimeoutMs = 8_000
  } = {}) {
    this.supabaseUrl = requiredUrl(supabaseUrl, "SUPABASE_URL");
    this.oauthIssuer = requiredUrl(oauthIssuer || `${this.supabaseUrl}/auth/v1`, "Issuer OAuth");
    this.serverApiKey = String(serverApiKey || "").trim();
    this.publishableKey = String(publishableKey || "").trim();
    this.publicAppUrl = requiredUrl(publicAppUrl, "URL pública do AraLearn");
    this.fetchImpl = fetchImpl;
    this.attempts = attempts;
    this.requestTimeoutMs = requestTimeoutMs;
    if (!this.serverApiKey) throw new Error("A chave administrativa do Supabase está ausente.");
    if (!this.publishableKey) throw new Error("A chave pública do Supabase está ausente.");
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
        throw new AuthoringApiError(503, "service_timeout", "O prazo da operação terminou.");
      }
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), Math.max(1, Math.min(timeoutMs, remaining)));
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
        const error = databaseError(response.status, body);
        lastError = error;
        if (!retry || !retryableStatus(response.status) || attempt === this.attempts) throw error;
      } catch (error) {
        const normalized = controller.signal.aborted
          ? new AuthoringApiError(503, "service_timeout", "O Supabase não respondeu a tempo.")
          : error instanceof AuthoringApiError
            ? error
            : new AuthoringApiError(503, "course_service_unavailable", "Não foi possível alcançar o Supabase.");
        lastError = normalized;
        if (!retry || !new Set(["service_timeout", "course_service_unavailable"]).has(normalized.code) ||
            attempt === this.attempts) throw normalized;
      } finally {
        clearTimeout(timer);
      }
      await new Promise((resolve) => setTimeout(resolve, attempt * 100));
    }
    throw lastError;
  }

  rpc(functionName, payload, options = {}) {
    return this.#request(`${this.supabaseUrl}/rest/v1/rpc/${functionName}`, {
      method: "POST",
      headers: supabaseServerHeaders(this.serverApiKey),
      body: JSON.stringify(payload)
    }, options);
  }

  async #userForJwt(jwt, { deadlineAt = null } = {}) {
    const user = await this.#request(`${this.supabaseUrl}/auth/v1/user`, {
      method: "GET",
      headers: {
        apikey: this.publishableKey,
        Authorization: `Bearer ${jwt}`
      }
    }, { retry: false, deadlineAt });
    if (!user?.id) {
      throw new AuthoringApiError(401, "authentication_required", "Sessão inválida ou expirada.");
    }
    return user;
  }

  async resolveApplicationPrincipal(jwt, { deadlineAt = null } = {}) {
    const user = await this.#userForJwt(jwt, { deadlineAt });
    return {
      actorId: String(user.id),
      authenticationKind: "application",
      scopes: ["authoring:read", "authoring:write"]
    };
  }

  async resolvePrincipal(authentication, { deadlineAt = null } = {}) {
    if (authentication?.kind !== "oauth") {
      throw new AuthoringApiError(401, "oauth_required", "Conecte sua conta para usar a autoria.");
    }
    const user = await this.#userForJwt(authentication.credential, { deadlineAt });
    const claims = decodeJwtClaims(authentication.credential);
    const oauthClientId = assertMcpClaims(claims, {
      issuer: this.oauthIssuer,
      resource: String(authentication.resource || "").trim()
    });
    if (claimText(claims.sub) !== String(user.id)) {
      throw new AuthoringApiError(401, "invalid_oauth_token", "O token não corresponde à sessão.");
    }
    return {
      actorId: String(user.id),
      authenticationKind: "oauth",
      scopes: ["authoring:read", "authoring:write"],
      oauthClientId
    };
  }

  async listCourses({
    principal,
    query = "",
    limit = 24,
    beforeUpdatedAt = null,
    beforeId = null,
    deadlineAt = null
  }) {
    const result = first(await this.rpc("list_owned_courses_for_actor_v1", {
      p_actor_id: principal.actorId,
      p_query: query || null,
      p_limit: limit,
      p_before_updated_at: beforeUpdatedAt,
      p_before_id: beforeId
    }, { deadlineAt }));
    return withDeepLink(result, this.publicAppUrl);
  }

  async getPersonProfile({ principal, deadlineAt = null }) {
    return first(await this.rpc("get_person_profile_for_actor_v1", {
      p_actor_id: principal.actorId
    }, { deadlineAt }));
  }

  async updatePersonProfile({ principal, patch, deadlineAt = null }) {
    return first(await this.rpc("update_person_profile_for_actor_v1", {
      p_actor_id: principal.actorId,
      p_patch: patch
    }, { deadlineAt }));
  }

  async getCourse({ principal, courseId, includeOutline = true, deadlineAt = null }) {
    const result = first(await this.rpc("get_owned_course_for_actor_v1", {
      p_actor_id: principal.actorId,
      p_course_id: courseId,
      p_include_outline: includeOutline
    }, { deadlineAt }));
    return withDeepLink(result, this.publicAppUrl);
  }

  async listCourseEntities({
    principal,
    courseId,
    expectedRevision,
    limit = 50,
    afterEntityType = null,
    afterEntityId = null,
    deadlineAt = null
  }) {
    return first(await this.rpc("list_owned_course_entities_for_actor_v1", {
      p_actor_id: principal.actorId,
      p_course_id: courseId,
      p_expected_revision: expectedRevision,
      p_limit: limit,
      p_after_entity_type: afterEntityType,
      p_after_entity_id: afterEntityId
    }, { deadlineAt }));
  }

  async listCourseAccess({ principal, courseId, deadlineAt = null }) {
    return first(await this.rpc("list_course_access_for_actor_v1", {
      p_actor_id: principal.actorId,
      p_course_id: courseId
    }, { deadlineAt }));
  }

  async manageCourseAccess({
    principal,
    courseId,
    operation,
    email = null,
    targetUserId = null,
    confirmed,
    requestId,
    deadlineAt = null
  }) {
    return first(await this.rpc("manage_course_access_for_actor_v1", {
      p_actor_id: principal.actorId,
      p_course_id: courseId,
      p_operation: operation,
      p_target_email: email,
      p_target_user_id: targetUserId,
      p_confirmed: confirmed,
      p_request_id: requestId
    }, { deadlineAt }));
  }

  async createCourse({ principal, requestId, title, goal, brief = "", deadlineAt = null }) {
    const result = first(await this.rpc("create_course_for_actor_v1", {
      p_actor_id: principal.actorId,
      p_title: title,
      p_goal: goal,
      p_brief: brief,
      p_request_id: requestId
    }, { deadlineAt }));
    return withDeepLink(result, this.publicAppUrl);
  }

  async #validateCompositionChangeAtCurrentRevision({
    principal,
    courseId,
    expectedRevision,
    upserts,
    deletes,
    deadlineAt
  }) {
    const course = await this.getCourse({
      principal,
      courseId,
      includeOutline: false,
      deadlineAt
    });
    if (Number(course?.revision) !== expectedRevision) {
      // O banco consulta o receipt antes da cerca de revisão. Encaminhar a
      // mesma requisição permite replay idempotente; uma requisição realmente
      // obsoleta continua falhando no CAS da própria transação.
      return false;
    }
    const rows = [];
    const seenCursors = new Set();
    let afterEntityType = null;
    let afterEntityId = null;
    for (let pageIndex = 0; pageIndex < 100; pageIndex += 1) {
      const page = await this.listCourseEntities({
        principal,
        courseId,
        expectedRevision,
        limit: 500,
        afterEntityType,
        afterEntityId,
        deadlineAt
      });
      if (!Array.isArray(page?.items)) {
        throw new AuthoringApiError(503, "course_service_unavailable", "A leitura do Curso ficou incompleta.");
      }
      rows.push(...page.items);
      if (page.hasMore !== true) break;
      const cursor = page.nextCursor;
      const cursorKey = JSON.stringify(cursor);
      if (!cursor?.entityType || !cursor?.entityId || seenCursors.has(cursorKey)) {
        throw new AuthoringApiError(503, "course_service_unavailable", "A paginação do Curso ficou inconsistente.");
      }
      seenCursors.add(cursorKey);
      afterEntityType = cursor.entityType;
      afterEntityId = cursor.entityId;
      if (pageIndex === 99) {
        throw new AuthoringApiError(413, "course_too_large", "O Curso excede o limite seguro de validação.");
      }
    }
    try {
      composeCourseDocument({
        id: courseId,
        title: String(course?.title || "").trim(),
        goal: String(course?.goal || "").trim()
      }, applyEntityChanges(rows, upserts, deletes));
    } catch {
      throw new AuthoringApiError(
        422,
        "invalid_course_contract",
        "A alteração produziria um Curso incompatível com o Estudo."
      );
    }
    return true;
  }

  async commitCourseChanges({
    principal,
    courseId,
    requestId,
    expectedRevision,
    operation,
    title,
    goal,
    brief,
    authoringState,
    upserts = [],
    deletes = [],
    deadlineAt = null
  }) {
    if (operation === "commit_entities") {
      await this.#validateCompositionChangeAtCurrentRevision({
        principal,
        courseId,
        expectedRevision,
        upserts,
        deletes,
        deadlineAt
      });
    }
    const result = first(await this.rpc("commit_course_changes_for_actor_v1", {
      p_actor_id: principal.actorId,
      p_course_id: courseId,
      p_expected_revision: expectedRevision,
      p_operation: operation,
      p_title: title ?? null,
      p_goal: goal ?? null,
      p_brief: brief ?? null,
      p_authoring_state: authoringState ?? null,
      p_upserts: upserts,
      p_deletes: deletes,
      p_request_id: requestId
    }, { deadlineAt, timeoutMs: 40_000 }));
    return withDeepLink(result, this.publicAppUrl);
  }
}
