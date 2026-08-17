import { AuthoringApiError } from "./errors.js";
import { decodeJwtClaims } from "./security.js";
import { supabaseServerHeaders } from "./supabaseEnvironment.js";
import { composeCourseDocument } from "../aralearn/runtime/domain/courseEntities.js";
import {
  applyCourseAuthoringPlanCommand,
  normalizeCourseAuthoringPlan,
  normalizeCourseAuthoringPlanCommand
} from "../aralearn/runtime/domain/courseAuthoringPlan.js";

const DEFAULT_RESPONSE_LIMIT_BYTES = 2 * 1024 * 1024;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const MATERIALIZATION_FIELDS = new Set([
  "id", "authoringPartVersion", "channel", "status", "version", "designContext",
  "resultFacts", "startedAt", "updatedAt", "completedAt", "steps", "nextPendingStep"
]);
const MATERIALIZATION_STEP_FIELDS = new Set([
  "id", "position", "kind", "targetDidacticMicrosequenceId", "productionPosition",
  "status", "version", "resultFacts", "updatedAt", "completedAt"
]);

function first(value) {
  return Array.isArray(value) ? value[0] || null : value;
}

function invalidMaterializationRead() {
  throw new AuthoringApiError(
    503,
    "course_service_unavailable",
    "A leitura da materialização da Parte é inválida."
  );
}

function exactRecord(value, fields) {
  return value && typeof value === "object" && !Array.isArray(value) &&
    Object.keys(value).length === fields.size &&
    Object.keys(value).every((field) => fields.has(field));
}

function positiveSafeInteger(value) {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 1;
}

function nonNegativeSafeInteger(value) {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function validTimestamp(value, { nullable = false } = {}) {
  return nullable && value == null ||
    typeof value === "string" && value.length <= 40 && Number.isFinite(Date.parse(value));
}

function jsonRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value);
}

function normalizeMaterializationStep(value) {
  if (!exactRecord(value, MATERIALIZATION_STEP_FIELDS)) invalidMaterializationRead();
  const id = String(value.id || "").trim().toLowerCase();
  const kind = String(value.kind || "").trim();
  const status = String(value.status || "").trim();
  const targetDidacticMicrosequenceId = value.targetDidacticMicrosequenceId == null
    ? null
    : String(value.targetDidacticMicrosequenceId).trim();
  const productionPosition = value.productionPosition == null
    ? null
    : Number(value.productionPosition);
  const didactic = kind === "didactic_microsequence_materialization";
  if (!UUID_PATTERN.test(id) || !nonNegativeSafeInteger(value.position) ||
      !new Set(["context_load", "didactic_microsequence_materialization", "validation"]).has(kind) ||
      !new Set(["pending", "completed", "failed"]).has(status) ||
      !positiveSafeInteger(value.version) || !jsonRecord(value.resultFacts) ||
      !validTimestamp(value.updatedAt) ||
      !validTimestamp(value.completedAt, { nullable: true }) ||
      (status === "pending") !== (value.completedAt == null) ||
      didactic !== (targetDidacticMicrosequenceId != null &&
        targetDidacticMicrosequenceId.length >= 1 &&
        targetDidacticMicrosequenceId.length <= 240 &&
        nonNegativeSafeInteger(productionPosition))) {
    invalidMaterializationRead();
  }
  return {
    id,
    position: Number(value.position),
    kind,
    targetDidacticMicrosequenceId,
    productionPosition,
    status,
    version: Number(value.version),
    resultFacts: structuredClone(value.resultFacts),
    updatedAt: value.updatedAt,
    completedAt: value.completedAt
  };
}

function normalizePartMaterialization(value, { courseId, authoringPartId, materializationId }) {
  const topFields = new Set([
    "contract", "courseId", "courseRevision", "authoringPartId", "materialization"
  ]);
  if (!exactRecord(value, topFields) ||
      value.contract !== "aralearn.course-authoring-part-materialization.v1" ||
      String(value.courseId || "").toLowerCase() !== courseId ||
      String(value.authoringPartId || "").toLowerCase() !== authoringPartId ||
      !positiveSafeInteger(value.courseRevision) ||
      !exactRecord(value.materialization, MATERIALIZATION_FIELDS)) {
    invalidMaterializationRead();
  }
  const source = value.materialization;
  const id = String(source.id || "").trim().toLowerCase();
  const status = String(source.status || "").trim();
  const channel = String(source.channel || "").trim();
  if (id !== materializationId || !UUID_PATTERN.test(id) ||
      !positiveSafeInteger(source.authoringPartVersion) ||
      !new Set(["application", "mcp"]).has(channel) ||
      !new Set(["running", "completed", "failed"]).has(status) ||
      !positiveSafeInteger(source.version) || !jsonRecord(source.designContext) ||
      !jsonRecord(source.resultFacts) ||
      !validTimestamp(source.startedAt) || !validTimestamp(source.updatedAt) ||
      !validTimestamp(source.completedAt, { nullable: true }) ||
      (status === "running") !== (source.completedAt == null) ||
      !Array.isArray(source.steps) || source.steps.length < 1 || source.steps.length > 64) {
    invalidMaterializationRead();
  }
  const steps = source.steps.map(normalizeMaterializationStep);
  if (steps.some((step, index) => step.position !== index) ||
      new Set(steps.map((step) => step.id)).size !== steps.length) {
    invalidMaterializationRead();
  }
  const expectedNext = status === "running" && !steps.some(
    ({ status: stepStatus }) => stepStatus === "failed"
  )
    ? steps.find(({ status: stepStatus }) => stepStatus === "pending") || null
    : null;
  const nextPendingStep = source.nextPendingStep == null
    ? null
    : normalizeMaterializationStep(source.nextPendingStep);
  if ((expectedNext?.id || null) !== (nextPendingStep?.id || null) ||
      nextPendingStep && JSON.stringify(nextPendingStep) !== JSON.stringify(expectedNext)) {
    invalidMaterializationRead();
  }
  return {
    contract: value.contract,
    courseId,
    courseRevision: Number(value.courseRevision),
    authoringPartId,
    materialization: {
      id,
      authoringPartVersion: Number(source.authoringPartVersion),
      channel,
      status,
      version: Number(source.version),
      designContext: structuredClone(source.designContext),
      resultFacts: structuredClone(source.resultFacts),
      startedAt: source.startedAt,
      updatedAt: source.updatedAt,
      completedAt: source.completedAt,
      steps,
      nextPendingStep
    }
  };
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
  if (status === 413 || code === "54000") {
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

function responseTooLarge() {
  return new AuthoringApiError(
    413,
    "course_response_too_large",
    "A resposta do serviço de Cursos excedeu o limite seguro."
  );
}

async function readBoundedResponseText(response, limitBytes) {
  const declared = Number(response.headers.get("content-length") || 0);
  if (Number.isFinite(declared) && declared > limitBytes) {
    await response.body?.cancel?.().catch(() => undefined);
    throw responseTooLarge();
  }
  if (!response.body || typeof response.body.getReader !== "function") {
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > limitBytes) throw responseTooLarge();
    return new TextDecoder().decode(bytes);
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let byteLength = 0;
  let source = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      byteLength += value.byteLength;
      if (byteLength > limitBytes) {
        await reader.cancel().catch(() => undefined);
        throw responseTooLarge();
      }
      source += decoder.decode(value, { stream: true });
    }
    return source + decoder.decode();
  } finally {
    reader.releaseLock();
  }
}

function withDeepLink(value, publicAppUrl, section = "planning") {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const result = structuredClone(value);
  const attach = (course) => {
    const courseId = String(course?.courseId || "").trim();
    return courseId
      ? {
          ...course,
          deepLink: `${publicAppUrl}/#/authoring/courses/${courseId}?section=${section}`
        }
      : course;
  };
  if (Array.isArray(result.items)) result.items = result.items.map(attach);
  if (result.course && typeof result.course === "object") result.course = attach(result.course);
  if (result.courseId) return attach(result);
  return result;
}

function authoringChannel(principal) {
  if (principal?.authenticationKind === "application") return "application";
  if (principal?.authenticationKind === "oauth") return "mcp";
  throw new AuthoringApiError(401, "authentication_required", "A origem da Autoria é inválida.");
}

function editableInstructionalPlan(value) {
  const plan = value?.plan;
  if (!plan || typeof plan !== "object" || Array.isArray(plan)) {
    throw new AuthoringApiError(503, "course_service_unavailable", "O plano do Curso é inválido.");
  }
  return normalizeCourseAuthoringPlan({
    id: plan.id,
    title: plan.title,
    objective: plan.objective,
    audience: plan.audience ?? "",
    scope: plan.scope ?? "",
    authoringGuidance: plan.authoringGuidance ?? "",
    preferredPartCount: plan.preferredPartCount,
    intendedLearningOutcomes: Array.isArray(plan.intendedLearningOutcomes)
      ? plan.intendedLearningOutcomes.map(({ id, position, statement }) => ({ id, position, statement }))
      : [],
    instructionalAnalysisUnits: Array.isArray(plan.instructionalAnalysisUnits)
      ? plan.instructionalAnalysisUnits.map(({ id, position, statement }) => ({ id, position, statement }))
      : [],
    evidenceRequirements: Array.isArray(plan.evidenceRequirements)
      ? plan.evidenceRequirements.map(({ id, position, statement }) => ({ id, position, statement }))
      : [],
    parts: Array.isArray(plan.parts)
      ? plan.parts.map((part) => ({
          id: part.id,
          position: part.position,
          title: part.title,
          intent: part.intent ?? "",
          microsequenceIds: Array.isArray(part.microsequences)
            ? part.microsequences.map(({ id }) => id)
            : []
        }))
      : []
  });
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
   *   requestTimeoutMs?: number,
   *   responseLimitBytes?: number
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
    requestTimeoutMs = 8_000,
    responseLimitBytes = DEFAULT_RESPONSE_LIMIT_BYTES
  } = {}) {
    this.supabaseUrl = requiredUrl(supabaseUrl, "SUPABASE_URL");
    this.oauthIssuer = requiredUrl(oauthIssuer || `${this.supabaseUrl}/auth/v1`, "Issuer OAuth");
    this.serverApiKey = String(serverApiKey || "").trim();
    this.publishableKey = String(publishableKey || "").trim();
    this.publicAppUrl = requiredUrl(publicAppUrl, "URL pública do AraLearn");
    this.fetchImpl = fetchImpl;
    this.attempts = attempts;
    this.requestTimeoutMs = requestTimeoutMs;
    this.responseLimitBytes = Number(responseLimitBytes);
    if (!this.serverApiKey) throw new Error("A chave administrativa do Supabase está ausente.");
    if (!this.publishableKey) throw new Error("A chave pública do Supabase está ausente.");
    if (!Number.isSafeInteger(this.responseLimitBytes) || this.responseLimitBytes < 1) {
      throw new TypeError("O limite de resposta do serviço de Cursos é inválido.");
    }
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
        const source = await readBoundedResponseText(response, this.responseLimitBytes);
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

  async getCourseInstructionalPlan({
    principal,
    courseId,
    recentLimit = 20,
    deadlineAt = null
  }) {
    const result = first(await this.rpc("get_owned_course_instructional_plan_for_actor_v1", {
      p_actor_id: principal.actorId,
      p_course_id: courseId,
      p_recent_limit: recentLimit
    }, { deadlineAt }));
    return withDeepLink(result, this.publicAppUrl, "planning");
  }

  async getCourseAuthoringPartMaterialization({
    principal,
    courseId,
    authoringPartId,
    materializationId,
    deadlineAt = null
  }) {
    const result = first(await this.rpc(
      "get_owned_course_authoring_part_materialization_for_actor_v1",
      {
        p_actor_id: principal.actorId,
        p_course_id: courseId,
        p_authoring_part_id: authoringPartId,
        p_materialization_id: materializationId
      },
      { deadlineAt }
    ));
    return normalizePartMaterialization(result, {
      courseId,
      authoringPartId,
      materializationId
    });
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

  async createCourse({ principal, requestId, title, objective, deadlineAt = null }) {
    const result = first(await this.rpc("create_course_for_actor_v1", {
      p_actor_id: principal.actorId,
      p_title: title,
      p_objective: objective,
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

  async commitCourseInstructionalPlan({
    principal,
    courseId,
    requestId,
    expectedCourseRevision,
    expectedPlanVersion,
    command,
    deadlineAt = null
  }) {
    const normalizedCommand = normalizeCourseAuthoringPlanCommand(command);
    const current = await this.getCourseInstructionalPlan({
      principal,
      courseId,
      recentLimit: 1,
      deadlineAt
    });
    const currentPlan = editableInstructionalPlan(current);
    const matchesFence = Number(current?.courseRevision) === expectedCourseRevision &&
      Number(current?.plan?.version) === expectedPlanVersion;
    const targetPlan = matchesFence
      ? applyCourseAuthoringPlanCommand(currentPlan, normalizedCommand)
      : currentPlan;
    const result = first(await this.rpc("commit_course_instructional_plan_for_actor_v1", {
      p_actor_id: principal.actorId,
      p_course_id: courseId,
      p_expected_course_revision: expectedCourseRevision,
      p_expected_plan_version: expectedPlanVersion,
      p_command: normalizedCommand,
      p_plan: targetPlan,
      p_channel: authoringChannel(principal),
      p_request_id: requestId
    }, { deadlineAt, timeoutMs: 40_000 }));
    return withDeepLink(result, this.publicAppUrl, "planning");
  }

  async advanceCourseAuthoringPartMaterialization({
    principal,
    courseId,
    authoringPartId,
    materializationId,
    requestId,
    expectedCourseRevision,
    expectedMaterializationVersion,
    operation,
    payload,
    deadlineAt = null
  }) {
    const entityChanges = operation === "record_step" && payload?.status === "completed"
      ? payload.entityChanges
      : null;
    if (entityChanges && (entityChanges.upserts.length || entityChanges.deletes.length)) {
      await this.#validateCompositionChangeAtCurrentRevision({
        principal,
        courseId,
        expectedRevision: expectedCourseRevision,
        upserts: entityChanges.upserts,
        deletes: entityChanges.deletes,
        deadlineAt
      });
    }
    const result = first(await this.rpc(
      "advance_course_authoring_part_materialization_for_actor_v1",
      {
        p_actor_id: principal.actorId,
        p_course_id: courseId,
        p_authoring_part_id: authoringPartId,
        p_materialization_id: materializationId,
        p_expected_course_revision: expectedCourseRevision,
        p_expected_materialization_version: expectedMaterializationVersion,
        p_operation: operation,
        p_payload: payload,
        p_channel: authoringChannel(principal),
        p_request_id: requestId
      },
      { deadlineAt, timeoutMs: 40_000 }
    ));
    return withDeepLink(result, this.publicAppUrl, "planning");
  }

  async commitCourseComposition({
    principal,
    courseId,
    requestId,
    expectedRevision,
    upserts = [],
    deletes = [],
    deadlineAt = null
  }) {
    await this.#validateCompositionChangeAtCurrentRevision({
      principal,
      courseId,
      expectedRevision,
      upserts,
      deletes,
      deadlineAt
    });
    const result = first(await this.rpc("commit_course_composition_for_actor_v1", {
      p_actor_id: principal.actorId,
      p_course_id: courseId,
      p_expected_revision: expectedRevision,
      p_upserts: upserts,
      p_deletes: deletes,
      p_request_id: requestId
    }, { deadlineAt, timeoutMs: 40_000 }));
    return withDeepLink(result, this.publicAppUrl);
  }
}
