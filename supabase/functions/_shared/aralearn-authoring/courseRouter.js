import { AuthoringApiError } from "./errors.js";
import { courseUuid, readCourseJsonBody } from "./courseProtocol.js";

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

function nonNegativeInteger(value, field, { maximum = Number.MAX_SAFE_INTEGER } = {}) {
  const normalized = Number(value);
  if (!Number.isSafeInteger(normalized) || normalized < 0 || normalized > maximum) {
    fail("invalid_course_command", `${field} é inválido.`, { field });
  }
  return normalized;
}

function hasControlCharacter(value, allowLayoutWhitespace = false) {
  return Array.from(value).some((character) => {
    const codePoint = character.codePointAt(0);
    if (codePoint >= 127 && codePoint <= 159) return true;
    if (codePoint >= 32) return false;
    return !allowLayoutWhitespace || ![9, 10, 13].includes(codePoint);
  });
}

function text(value, field, {
  maximum,
  optional = false,
  trim = true,
  allowLayoutWhitespace = false
} = {}) {
  if (value == null && optional) return null;
  const source = typeof value === "string" ? value : "";
  const normalized = trim ? source.trim() : source;
  if ((!normalized && !optional) || normalized.length > maximum ||
      hasControlCharacter(normalized, allowLayoutWhitespace)) {
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

function jsonObject(value, field, maximumBytes) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail("invalid_course_command", `${field} precisa ser um objeto.`, { field });
  }
  let normalized;
  try {
    normalized = structuredClone(value);
  } catch {
    fail("invalid_course_command", `${field} precisa conter somente dados JSON.`, { field });
  }
  if (new TextEncoder().encode(JSON.stringify(normalized)).byteLength > maximumBytes) {
    fail("payload_too_large", `${field} excede o limite.`, { field }, 413);
  }
  return normalized;
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
  const content = { ...value.content };
  if (["module", "lesson", "microsequence"].includes(identity.entityType)) {
    content.title = text(value.content.title, "content.title", {
      maximum: 300,
      allowLayoutWhitespace: true
    });
  }
  return { ...identity, parentType, parentId, position, content };
}

function validateCreate(body, request) {
  exactFields(body, new Set(["requestId", "title", "objective"]));
  return {
    requestId: requestIdFrom(request, body),
    title: text(body.title, "title", { maximum: 300, allowLayoutWhitespace: true }),
    objective: text(body.objective, "objective", {
      maximum: 2_000,
      allowLayoutWhitespace: true
    })
  };
}

function validateCompositionChange(body, request) {
  exactFields(body, new Set(["requestId", "expectedRevision", "upserts", "deletes"]));
  const expectedRevision = positiveInteger(body.expectedRevision, "expectedRevision");
  if (!Array.isArray(body.upserts) || !Array.isArray(body.deletes)) {
    fail("invalid_course_command", "Upserts e exclusões precisam ser listas.");
  }
  const upserts = body.upserts.map(validateEntity);
  const deletes = body.deletes.map(validateEntityIdentity);
  if (!upserts.length && !deletes.length) {
    fail("invalid_course_command", "Informe entidades para inserir, alterar ou excluir.");
  }
  if (upserts.length > 200 || deletes.length > 200) {
    fail("invalid_course_command", "A alteração excede 200 entidades por grupo.");
  }
  if (new TextEncoder().encode(JSON.stringify({ upserts, deletes })).byteLength > 480 * 1024) {
    fail("payload_too_large", "A alteração de entidades excede o limite.", null, 413);
  }
  return {
    requestId: requestIdFrom(request, body),
    expectedRevision,
    upserts,
    deletes
  };
}

function validateInstructionalPlanChange(body, request) {
  exactFields(body, new Set([
    "requestId", "expectedCourseRevision", "expectedPlanVersion", "command"
  ]));
  return {
    requestId: requestIdFrom(request, body),
    expectedCourseRevision: positiveInteger(
      body.expectedCourseRevision,
      "expectedCourseRevision"
    ),
    expectedPlanVersion: positiveInteger(body.expectedPlanVersion, "expectedPlanVersion"),
    command: jsonObject(body.command, "command", 32 * 1024)
  };
}

function validateMaterializationStep(value, index) {
  const step = jsonObject(value, `steps[${index}]`, 4 * 1024);
  exactFields(step, new Set([
    "id", "position", "kind", "targetDidacticMicrosequenceId", "productionPosition"
  ]));
  const kind = text(step.kind, `steps[${index}].kind`, { maximum: 48 });
  if (!new Set([
    "context_load", "didactic_microsequence_materialization", "validation"
  ]).has(kind)) {
    fail("invalid_course_command", "O tipo da etapa de materialização é inválido.", { index });
  }
  const targetDidacticMicrosequenceId = step.targetDidacticMicrosequenceId == null
    ? null
    : text(step.targetDidacticMicrosequenceId, `steps[${index}].targetDidacticMicrosequenceId`, {
        maximum: 240
      });
  const productionPosition = step.productionPosition == null
    ? null
    : nonNegativeInteger(step.productionPosition, `steps[${index}].productionPosition`, {
        maximum: 63
      });
  if ((kind === "didactic_microsequence_materialization") !==
      (targetDidacticMicrosequenceId !== null && productionPosition !== null)) {
    fail("invalid_course_command", "O alvo da etapa de materialização é inválido.", { index });
  }
  return {
    id: courseUuid(step.id, `steps[${index}].id`),
    position: nonNegativeInteger(step.position, `steps[${index}].position`, { maximum: 63 }),
    kind,
    targetDidacticMicrosequenceId,
    productionPosition
  };
}

function validateEntityChanges(value) {
  const changes = jsonObject(value, "payload.entityChanges", 256 * 1024);
  exactFields(changes, new Set(["upserts", "deletes"]));
  if (!Array.isArray(changes.upserts) || !Array.isArray(changes.deletes)) {
    fail("invalid_course_command", "As alterações da etapa precisam ser listas.");
  }
  const upserts = changes.upserts.map(validateEntity);
  const deletes = changes.deletes.map(validateEntityIdentity);
  if (upserts.length > 64 || deletes.length > 64 || upserts.length + deletes.length > 64) {
    fail("invalid_course_command", "A etapa excede 64 alterações de entidade.");
  }
  return { upserts, deletes };
}

function validateMaterializationChange(body, request) {
  exactFields(body, new Set([
    "requestId", "expectedCourseRevision", "expectedMaterializationVersion",
    "operation", "payload"
  ]));
  const operation = text(body.operation, "operation", { maximum: 20 });
  if (!new Set(["start", "record_step", "finish"]).has(operation)) {
    fail("invalid_course_command", "A operação de materialização é inválida.");
  }
  const expectedMaterializationVersion = nonNegativeInteger(
    body.expectedMaterializationVersion,
    "expectedMaterializationVersion"
  );
  const payload = jsonObject(body.payload, "payload", 512 * 1024);
  if (operation === "start") {
    exactFields(payload, new Set(["authoringPartVersion", "designContext", "steps"]));
    if (expectedMaterializationVersion !== 0 || !Array.isArray(payload.steps) ||
        payload.steps.length < 1 || payload.steps.length > 64) {
      fail("invalid_course_command", "O início da materialização é inválido.");
    }
    const steps = payload.steps.map(validateMaterializationStep);
    if (new Set(steps.map(({ id }) => id)).size !== steps.length ||
        new Set(steps.map(({ position }) => position)).size !== steps.length ||
        steps.some(({ position }, index) => position !== index)) {
      fail("invalid_course_command", "As etapas precisam ter identidades e posições únicas.");
    }
    return {
      requestId: requestIdFrom(request, body),
      expectedCourseRevision: positiveInteger(
        body.expectedCourseRevision,
        "expectedCourseRevision"
      ),
      expectedMaterializationVersion,
      operation,
      payload: {
        authoringPartVersion: positiveInteger(
          payload.authoringPartVersion,
          "payload.authoringPartVersion"
        ),
        designContext: jsonObject(payload.designContext, "payload.designContext", 64 * 1024),
        steps
      }
    };
  }
  if (expectedMaterializationVersion < 1) {
    fail("invalid_course_command", "A versão da materialização precisa ser corrente.");
  }
  if (operation === "record_step") {
    exactFields(payload, new Set([
      "stepId", "expectedStepVersion", "status", "resultFacts", "entityChanges"
    ]));
    const status = text(payload.status, "payload.status", { maximum: 20 });
    if (!new Set(["completed", "failed"]).has(status)) {
      fail("invalid_course_command", "O estado da etapa é inválido.");
    }
    return {
      requestId: requestIdFrom(request, body),
      expectedCourseRevision: positiveInteger(
        body.expectedCourseRevision,
        "expectedCourseRevision"
      ),
      expectedMaterializationVersion,
      operation,
      payload: {
        stepId: courseUuid(payload.stepId, "payload.stepId"),
        expectedStepVersion: positiveInteger(
          payload.expectedStepVersion,
          "payload.expectedStepVersion"
        ),
        status,
        resultFacts: jsonObject(payload.resultFacts, "payload.resultFacts", 16 * 1024),
        entityChanges: validateEntityChanges(payload.entityChanges)
      }
    };
  }
  exactFields(payload, new Set(["status", "resultFacts"]));
  const status = text(payload.status, "payload.status", { maximum: 20 });
  if (!new Set(["completed", "failed"]).has(status)) {
    fail("invalid_course_command", "O estado final da materialização é inválido.");
  }
  return {
    requestId: requestIdFrom(request, body),
    expectedCourseRevision: positiveInteger(
      body.expectedCourseRevision,
      "expectedCourseRevision"
    ),
    expectedMaterializationVersion,
    operation,
    payload: {
      status,
      resultFacts: jsonObject(payload.resultFacts, "payload.resultFacts", 16 * 1024)
    }
  };
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
  if (route.name === "getCourseInstructionalPlan") {
    assertPrincipal(principal);
    const recentLimit = positiveInteger(
      new URL(request.url).searchParams.get("recentLimit"),
      "recentLimit",
      { defaultValue: 20, maximum: 50 }
    );
    return {
      requestId: null,
      data: await adapter.getCourseInstructionalPlan({
        principal,
        courseId: route.courseId,
        recentLimit,
        deadlineAt
      })
    };
  }
  if (route.name === "getCourseAuthoringPartMaterialization") {
    assertPrincipal(principal);
    return {
      requestId: null,
      data: await adapter.getCourseAuthoringPartMaterialization({
        principal,
        courseId: route.courseId,
        authoringPartId: route.authoringPartId,
        materializationId: route.materializationId,
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
  if (route.name === "commitCourseInstructionalPlan") {
    assertPrincipal(principal, { write: true });
    const value = validateInstructionalPlanChange(await readCourseJsonBody(request), request);
    return {
      requestId: value.requestId,
      data: await adapter.commitCourseInstructionalPlan({
        principal,
        courseId: route.courseId,
        ...value,
        deadlineAt
      })
    };
  }
  if (route.name === "advanceCourseAuthoringPartMaterialization") {
    assertPrincipal(principal, { write: true });
    const value = validateMaterializationChange(await readCourseJsonBody(request), request);
    return {
      requestId: value.requestId,
      data: await adapter.advanceCourseAuthoringPartMaterialization({
        principal,
        courseId: route.courseId,
        authoringPartId: route.authoringPartId,
        materializationId: route.materializationId,
        ...value,
        deadlineAt
      })
    };
  }
  if (route.name === "commitCourseComposition") {
    assertPrincipal(principal, { write: true });
    const value = validateCompositionChange(await readCourseJsonBody(request), request);
    return {
      requestId: value.requestId,
      data: await adapter.commitCourseComposition({
        principal,
        courseId: route.courseId,
        ...value,
        deadlineAt
      })
    };
  }
  throw new AuthoringApiError(404, "not_found", "Caso de uso de Curso inexistente.");
}
