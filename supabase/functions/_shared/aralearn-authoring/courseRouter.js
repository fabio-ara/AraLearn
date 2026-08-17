import { AuthoringApiError } from "./errors.js";
import { readCourseJsonBody } from "./courseProtocol.js";
import { normalizeCourseAuthoringState } from "./courseAuthoringState.js";

const REQUEST_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/u;
const RFC3339 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/u;
const ENTITY_TYPES = new Set(["module", "lesson", "topic", "microsequence", "card"]);
const ENTITY_PARENT = Object.freeze({
  module: null,
  lesson: "module",
  topic: "lesson",
  microsequence: "lesson",
  card: "microsequence"
});
const ENTITY_CHILD_FIELDS = Object.freeze({
  module: Object.freeze(["lessons"]),
  lesson: Object.freeze(["topics", "microsequences"]),
  topic: Object.freeze([]),
  microsequence: Object.freeze(["cards"]),
  card: Object.freeze([])
});
const AVATAR_OBJECT_KEY = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(?:jpg|png|webp)$/u;

function fail(code, message, details = null, status = 422) {
  throw new AuthoringApiError(status, code, message, details);
}

function scopes(principal) {
  return new Set(Array.isArray(principal?.scopes) ? principal.scopes : []);
}

function assertPrincipal(principal, { write = false } = {}) {
  if (!principal?.actorId) {
    throw new AuthoringApiError(401, "authentication_required", "Entre novamente para continuar.");
  }
  if (!write) return;
  const available = scopes(principal);
  if (available.has("authoring:write")) return;
  throw new AuthoringApiError(403, "insufficient_scope", "A sessão não permite alterar Cursos.");
}

function positiveInteger(value, field, { defaultValue = null, maximum = Number.MAX_SAFE_INTEGER } = {}) {
  if ((value == null || value === "") && defaultValue != null) return defaultValue;
  const normalized = Number(value);
  if (!Number.isSafeInteger(normalized) || normalized < 1 || normalized > maximum) {
    fail("invalid_pagination", `${field} é inválido.`, { field });
  }
  return normalized;
}

function text(value, field, { maximum, optional = false, trim = true } = {}) {
  if (value == null && optional) return null;
  const source = typeof value === "string" ? value : "";
  const normalized = trim ? source.trim() : source;
  if ((!normalized && !optional) || normalized.length > maximum) {
    fail("invalid_course_command", `${field} é inválido.`, { field });
  }
  return normalized;
}

function requestIdFrom(request, body) {
  const header = String(request.headers.get("idempotency-key") || "").trim();
  const bodyValue = String(body.requestId || "").trim();
  if (header && bodyValue && header !== bodyValue) {
    fail("request_id_mismatch", "Idempotency-Key e requestId precisam ser iguais.");
  }
  const value = bodyValue || header;
  if (!REQUEST_ID.test(value)) fail("invalid_request_id", "requestId é inválido.");
  return value;
}

function exactFields(value, allowed) {
  const unknown = Object.keys(value).find((field) => !allowed.has(field));
  if (unknown) fail("unknown_course_command_field", `O campo ${unknown} não pertence ao comando.`, { field: unknown });
}

function authoringState(value) {
  try {
    return normalizeCourseAuthoringState(value);
  } catch {
    fail("invalid_course_command", "authoringState é inválido.", {
      field: "authoringState"
    });
  }
}

function courseListQuery(request) {
  const url = new URL(request.url);
  const query = String(url.searchParams.get("query") || "").trim();
  if (query.length > 120) fail("invalid_pagination", "query é longa demais.");
  const beforeUpdatedAt = url.searchParams.get("beforeUpdatedAt");
  const beforeId = url.searchParams.get("beforeId");
  if ((beforeUpdatedAt == null) !== (beforeId == null)) {
    fail("invalid_pagination", "O cursor de Cursos está incompleto.");
  }
  if (beforeUpdatedAt != null && (!RFC3339.test(beforeUpdatedAt) ||
      !Number.isFinite(Date.parse(beforeUpdatedAt)))) {
    fail("invalid_pagination", "beforeUpdatedAt é inválido.");
  }
  return {
    query,
    limit: positiveInteger(url.searchParams.get("limit"), "limit", {
      defaultValue: 24,
      maximum: 50
    }),
    beforeUpdatedAt,
    beforeId
  };
}

function courseEntityQuery(request) {
  const url = new URL(request.url);
  const expectedRevision = positiveInteger(
    url.searchParams.get("expectedRevision"),
    "expectedRevision"
  );
  const afterEntityType = url.searchParams.get("afterEntityType");
  const afterEntityId = url.searchParams.get("afterEntityId");
  if ((afterEntityType == null) !== (afterEntityId == null) ||
      (afterEntityType != null && !ENTITY_TYPES.has(afterEntityType)) ||
      (afterEntityId != null && (!afterEntityId.trim() ||
        afterEntityId !== afterEntityId.trim() || afterEntityId.length > 240))) {
    fail("invalid_pagination", "O cursor de entidades é inválido.");
  }
  return {
    expectedRevision,
    limit: positiveInteger(url.searchParams.get("limit"), "limit", {
      defaultValue: 50,
      maximum: 100
    }),
    afterEntityType,
    afterEntityId
  };
}

function validateEntityIdentity(value, index) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail("invalid_course_entity", "A identidade da entidade é inválida.", { index });
  }
  exactFields(value, new Set(["entityType", "entityId"]));
  const entityType = text(value.entityType, "entityType", { maximum: 40 });
  const entityId = text(value.entityId, "entityId", { maximum: 240 });
  if (!ENTITY_TYPES.has(entityType)) fail("invalid_course_entity", "entityType é inválido.", { index });
  return { entityType, entityId };
}

function validateEntity(value, index) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail("invalid_course_entity", "A entidade do Curso é inválida.", { index });
  }
  exactFields(value, new Set([
    "entityType", "entityId", "parentType", "parentId", "position", "content"
  ]));
  const identity = validateEntityIdentity({
    entityType: value.entityType,
    entityId: value.entityId
  }, index);
  const parentType = value.parentType == null
    ? null
    : text(value.parentType, "parentType", { maximum: 40 });
  const parentId = value.parentId == null
    ? null
    : text(value.parentId, "parentId", { maximum: 240 });
  const position = Number(value.position);
  const expectedParent = ENTITY_PARENT[identity.entityType];
  const invalidContentField = value.content && typeof value.content === "object" &&
    !Array.isArray(value.content)
    ? ["id", "position", ...ENTITY_CHILD_FIELDS[identity.entityType]]
      .find((field) => Object.hasOwn(value.content, field))
    : null;
  if (parentType !== expectedParent || (parentType === null) !== (parentId === null) ||
      !Number.isSafeInteger(position) || position < (identity.entityType === "card" ? 1 : 0) ||
      !value.content || typeof value.content !== "object" || Array.isArray(value.content) ||
      invalidContentField) {
    fail("invalid_course_entity", "A posição ou o conteúdo da entidade é inválido.", { index });
  }
  return { ...identity, parentType, parentId, position, content: value.content };
}

function validateCreate(body, request) {
  exactFields(body, new Set(["requestId", "title", "goal", "brief"]));
  return {
    requestId: requestIdFrom(request, body),
    title: text(body.title, "title", { maximum: 300 }),
    goal: text(body.goal, "goal", { maximum: 2_000 }),
    brief: body.brief == null ? "" : text(body.brief, "brief", {
      maximum: 16_384,
      optional: true,
      trim: false
    })
  };
}

function validateChange(body, request) {
  exactFields(body, new Set([
    "requestId", "expectedRevision", "operation", "title", "goal", "brief",
    "authoringState", "upserts", "deletes"
  ]));
  const requestId = requestIdFrom(request, body);
  const expectedRevision = positiveInteger(body.expectedRevision, "expectedRevision");
  const operation = text(body.operation, "operation", { maximum: 40 });
  if (operation === "update_metadata") {
    const supplied = ["title", "goal", "brief", "authoringState"].filter((field) => Object.hasOwn(body, field));
    if (!supplied.length) fail("invalid_course_command", "Informe ao menos um metadado para alterar.");
    return {
      requestId,
      expectedRevision,
      operation,
      ...(Object.hasOwn(body, "title") ? { title: text(body.title, "title", { maximum: 300 }) } : {}),
      ...(Object.hasOwn(body, "goal") ? { goal: text(body.goal, "goal", { maximum: 2_000 }) } : {}),
      ...(Object.hasOwn(body, "brief") ? { brief: text(body.brief, "brief", {
        maximum: 16_384,
        optional: true,
        trim: false
      }) } : {}),
      ...(Object.hasOwn(body, "authoringState")
        ? { authoringState: authoringState(body.authoringState) }
        : {})
    };
  }
  if (operation !== "commit_entities") {
    fail("invalid_course_command", "operation é inválida.", { field: "operation" });
  }
  const upserts = Array.isArray(body.upserts) ? body.upserts.map(validateEntity) : [];
  const deletes = Array.isArray(body.deletes) ? body.deletes.map(validateEntityIdentity) : [];
  if (!upserts.length && !deletes.length) {
    fail("invalid_course_command", "Informe entidades para inserir, alterar ou excluir.");
  }
  if (upserts.length > 200 || deletes.length > 200) {
    fail("invalid_course_command", "A alteração excede 200 entidades por grupo.");
  }
  if (new TextEncoder().encode(JSON.stringify({ upserts, deletes })).byteLength > 480 * 1024) {
    fail("payload_too_large", "A alteração de entidades excede o limite.", null, 413);
  }
  return { requestId, expectedRevision, operation, upserts, deletes };
}

function validateProfileUpdate(body) {
  exactFields(body, new Set(["displayName", "avatarObjectKey"]));
  const supplied = ["displayName", "avatarObjectKey"].filter((field) =>
    Object.hasOwn(body, field)
  );
  if (!supplied.length) {
    fail("invalid_person_profile", "Informe ao menos um dado do perfil.");
  }
  const patch = {};
  if (Object.hasOwn(body, "displayName")) {
    patch.displayName = text(body.displayName, "displayName", { maximum: 120 });
  }
  if (Object.hasOwn(body, "avatarObjectKey")) {
    if (body.avatarObjectKey === null) {
      patch.avatarObjectKey = null;
    } else {
      const objectKey = text(body.avatarObjectKey, "avatarObjectKey", { maximum: 80 });
      if (!AVATAR_OBJECT_KEY.test(objectKey)) {
        fail("invalid_person_profile", "O objeto do avatar é inválido.");
      }
      patch.avatarObjectKey = objectKey;
    }
  }
  return patch;
}

function validateAccessChange(body, request, operation) {
  if (operation === "grant_access") {
    exactFields(body, new Set(["requestId", "email", "confirmed"]));
  } else {
    exactFields(body, new Set(["requestId", "confirmed"]));
  }
  if (body.confirmed !== true) {
    fail("access_confirmation_required", "Confirme explicitamente a alteração de acesso.");
  }
  const result = {
    requestId: requestIdFrom(request, body),
    operation,
    confirmed: true
  };
  if (operation === "grant_access") {
    const email = text(body.email, "email", { maximum: 254 });
    if (!/^[^\s@]+@[^\s@]+$/u.test(email)) {
      fail("invalid_course_access", "Informe o e-mail exato da pessoa.");
    }
    result.email = email.toLowerCase();
  }
  return result;
}

export async function executeCourseRoute({ request, route, adapter, principal, deadlineAt = null }) {
  if (!adapter) throw new TypeError("Adaptador de Curso obrigatório.");
  if (route.name === "getPersonProfile") {
    assertPrincipal(principal);
    return {
      requestId: null,
      data: await adapter.getPersonProfile({ principal, deadlineAt })
    };
  }
  if (route.name === "updatePersonProfile") {
    assertPrincipal(principal, { write: true });
    return {
      requestId: null,
      data: await adapter.updatePersonProfile({
        principal,
        patch: validateProfileUpdate(await readCourseJsonBody(request)),
        deadlineAt
      })
    };
  }
  if (route.name === "listCourses") {
    assertPrincipal(principal);
    return {
      requestId: null,
      data: await adapter.listCourses({ principal, ...courseListQuery(request), deadlineAt })
    };
  }
  if (route.name === "getCourse") {
    assertPrincipal(principal);
    const view = String(new URL(request.url).searchParams.get("view") || "outline");
    if (!new Set(["summary", "outline"]).has(view)) {
      fail("invalid_course_view", "view é inválida.");
    }
    return {
      requestId: null,
      data: await adapter.getCourse({
        principal,
        courseId: route.courseId,
        includeOutline: view === "outline",
        deadlineAt
      })
    };
  }
  if (route.name === "listCourseEntities") {
    assertPrincipal(principal);
    return {
      requestId: null,
      data: await adapter.listCourseEntities({
        principal,
        courseId: route.courseId,
        ...courseEntityQuery(request),
        deadlineAt
      })
    };
  }
  if (route.name === "listCourseAccess") {
    assertPrincipal(principal);
    return {
      requestId: null,
      data: await adapter.listCourseAccess({
        principal,
        courseId: route.courseId,
        deadlineAt
      })
    };
  }
  if (route.name === "grantCourseAccess") {
    assertPrincipal(principal, { write: true });
    const value = validateAccessChange(
      await readCourseJsonBody(request),
      request,
      "grant_access"
    );
    return {
      requestId: value.requestId,
      data: await adapter.manageCourseAccess({
        principal,
        courseId: route.courseId,
        ...value,
        deadlineAt
      })
    };
  }
  if (route.name === "revokeCourseAccess") {
    assertPrincipal(principal, { write: true });
    const value = validateAccessChange(
      await readCourseJsonBody(request),
      request,
      "revoke_access"
    );
    return {
      requestId: value.requestId,
      data: await adapter.manageCourseAccess({
        principal,
        courseId: route.courseId,
        targetUserId: route.userId,
        ...value,
        deadlineAt
      })
    };
  }
  if (route.name === "createCourse") {
    assertPrincipal(principal, { write: true });
    const value = validateCreate(await readCourseJsonBody(request), request);
    return {
      requestId: value.requestId,
      data: await adapter.createCourse({ principal, ...value, deadlineAt })
    };
  }
  if (route.name === "commitCourseChanges") {
    assertPrincipal(principal, { write: true });
    const value = validateChange(await readCourseJsonBody(request), request);
    return {
      requestId: value.requestId,
      data: await adapter.commitCourseChanges({
        principal,
        courseId: route.courseId,
        ...value,
        deadlineAt
      })
    };
  }
  throw new AuthoringApiError(404, "not_found", "Caso de uso de Curso inexistente.");
}
