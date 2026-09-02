import { AuthoringApiError } from "./errors.js";
import { courseUuid, readCourseJsonBody } from "./courseProtocol.js";
import {
  CourseDesignParametersError,
  normalizeCourseDesignCommand
} from "../aralearn/runtime/domain/courseDesignParameters.js";
import {
  CourseSourcesError,
  normalizeCourseSourceCommand,
  normalizeSourceAttributionApplications
} from "../aralearn/runtime/domain/courseSources.js";
import {
  CourseAnchoredAnnotationsError,
  normalizeCourseAnchoredAnnotationCommand,
  normalizeCourseAnchoredAnnotationReadOptions
} from "../aralearn/runtime/domain/courseAnchoredAnnotations.js";
import {
  CourseAuthoringAnalyticsError,
  normalizeCourseAuthoringAnalyticsQuery
} from "../aralearn/runtime/domain/courseAuthoringAnalytics.js";

const REQUEST_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/u;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const RFC3339 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/u;
const ENTITY_TYPES = new Set(["module", "lesson", "topic", "microsequence", "study_unit"]);
const ENTITY_PARENT = Object.freeze({
  module: null,
  lesson: "module",
  topic: "lesson",
  microsequence: "lesson",
  study_unit: "microsequence"
});
const ENTITY_CHILD_FIELDS = Object.freeze({
  module: Object.freeze(["lessons"]),
  lesson: Object.freeze(["topics", "microsequences"]),
  topic: Object.freeze([]),
  microsequence: Object.freeze(["studyUnits"]),
  study_unit: Object.freeze([])
});
const AVATAR_OBJECT_KEY = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(?:jpg|png|webp)$/u;
const ANCHORED_ANNOTATIONS_REQUEST_TARGET_LIMIT_BYTES = 8 * 1024;
const AUTHORING_ANALYTICS_REQUEST_TARGET_LIMIT_BYTES = 8 * 1024;

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

function assertApplicationPrincipal(principal, { write = false } = {}) {
  assertPrincipal(principal, { write });
  if (principal.authenticationKind !== "application") {
    throw new AuthoringApiError(
      403,
      "application_only_operation",
      "Esta operação pertence somente à interface do AraLearn."
    );
  }
}

function positiveInteger(value, field, { defaultValue = null, maximum = Number.MAX_SAFE_INTEGER } = {}) {
  if ((value == null || value === "") && defaultValue != null) return defaultValue;
  const normalized = Number(value);
  if (!Number.isSafeInteger(normalized) || normalized < 1 || normalized > maximum) {
    fail("invalid_pagination", `${field} é inválido.`, { field });
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

function boundedCourseSourceId(value) {
  return typeof value === "string" && value === value.trim() && value.length >= 1 &&
    [...value].length <= 240 && new TextEncoder().encode(value).byteLength <= 960 &&
    !hasControlCharacter(value);
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

function normalizeCourseDesignDomain(normalize) {
  try {
    return normalize();
  } catch (error) {
    if (!(error instanceof CourseDesignParametersError)) throw error;
    throw new AuthoringApiError(422, error.code, error.message, error.details);
  }
}

function normalizeCourseSourcesDomain(normalize) {
  try {
    return normalize();
  } catch (error) {
    if (!(error instanceof CourseSourcesError)) throw error;
    throw new AuthoringApiError(422, error.code, error.message, error.details);
  }
}

function normalizeCourseAnchoredAnnotationsDomain(normalize) {
  try {
    return normalize();
  } catch (error) {
    if (!(error instanceof CourseAnchoredAnnotationsError)) throw error;
    throw new AuthoringApiError(422, error.code, error.message, error.details);
  }
}

function normalizeCourseAuthoringAnalyticsDomain(normalize) {
  try {
    return normalize();
  } catch (error) {
    if (!(error instanceof CourseAuthoringAnalyticsError)) throw error;
    throw new AuthoringApiError(422, error.code, error.message);
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

function courseStudyUnitQuery(request) {
  const url = new URL(request.url);
  const expectedRevision = positiveInteger(
    url.searchParams.get("expectedRevision"),
    "expectedRevision"
  );
  const scopeKind = String(url.searchParams.get("scopeKind") || "course").trim();
  const scopeIdSource = url.searchParams.get("scopeId");
  let scopeId = scopeIdSource == null ? null : scopeIdSource.trim();
  const idlessScope = scopeKind === "course" || scopeKind === "unassigned";
  if (!new Set([
    "course", "authoring_part", "unassigned", "module", "lesson",
    "didactic_microsequence"
  ]).has(scopeKind) || idlessScope !== (scopeId === null) ||
      (scopeId != null && (!scopeId || scopeId !== scopeIdSource || scopeId.length > 240))) {
    fail("invalid_pagination", "O escopo da inspeção é inválido.");
  }
  if (scopeKind === "authoring_part") scopeId = courseUuid(scopeId, "scopeId");
  const anchorStudyUnitId = url.searchParams.get("anchorStudyUnitId");
  const cursorStudyUnitId = url.searchParams.get("cursorStudyUnitId");
  for (const [field, value] of [
    ["anchorStudyUnitId", anchorStudyUnitId],
    ["cursorStudyUnitId", cursorStudyUnitId]
  ]) {
    if (value != null && (!value.trim() || value !== value.trim() || value.length > 240)) {
      fail("invalid_pagination", `${field} é inválido.`, { field });
    }
  }
  if (anchorStudyUnitId != null && cursorStudyUnitId != null) {
    fail("invalid_pagination", "Âncora e cursor são mutuamente exclusivos.");
  }
  const direction = String(url.searchParams.get("direction") || "forward").trim();
  if (!new Set(["forward", "backward"]).has(direction)) {
    fail("invalid_pagination", "direction é inválida.");
  }
  const maxBytes = positiveInteger(url.searchParams.get("maxBytes"), "maxBytes", {
    defaultValue: 512 * 1024,
    maximum: 1_500_000
  });
  if (maxBytes < 64 * 1024) {
    fail("invalid_pagination", "maxBytes é inválido.", { field: "maxBytes" });
  }
  return {
    expectedRevision,
    scopeKind,
    scopeId,
    anchorStudyUnitId,
    cursorStudyUnitId,
    direction,
    limit: positiveInteger(url.searchParams.get("limit"), "limit", {
      defaultValue: 12,
      maximum: 24
    }),
    maxBytes
  };
}

function courseDesignScopeQuery(request, courseId) {
  const url = new URL(request.url);
  const queryFields = [...url.searchParams.keys()];
  const allowedFields = new Set(["scopeKind", "scopeRef", "limit", "cursor"]);
  const unknown = queryFields.find((field) => !allowedFields.has(field));
  if (unknown || new Set(queryFields).size !== queryFields.length) {
    fail(
      "invalid_course_design_query",
      "A leitura do desenho recebeu paginação incompatível.",
      { field: unknown || "query" }
    );
  }
  const scopeKind = String(url.searchParams.get("scopeKind") || "course").trim();
  const scopeRefSource = url.searchParams.get("scopeRef");
  const scopeRef = scopeRefSource == null && scopeKind === "course"
    ? courseId
    : String(scopeRefSource || "").trim();
  if (!new Set([
    "course", "module", "lesson", "didactic_microsequence", "study_unit"
  ]).has(scopeKind) ||
      (url.searchParams.has("scopeKind") && scopeKind !== url.searchParams.get("scopeKind")) ||
      !scopeRef || scopeRef.length > 240 ||
      (scopeRefSource != null && scopeRef !== scopeRefSource) ||
      (scopeKind === "course" && scopeRef !== courseId)) {
    fail("invalid_course_design_scope", "O escopo do desenho é inválido.", { field: "scope" });
  }
  const childCursorSource = url.searchParams.get("cursor");
  const childCursor = childCursorSource == null ? null : childCursorSource.trim();
  if (childCursorSource != null && (!childCursor || childCursor !== childCursorSource ||
      childCursor.length > 240)) {
    fail("invalid_pagination", "cursor é inválido.", { field: "cursor" });
  }
  return {
    scopeKind,
    scopeRef,
    childLimit: positiveInteger(url.searchParams.get("limit"), "limit", {
      defaultValue: 32,
      maximum: 64
    }),
    childCursor
  };
}

function courseSourcesQuery(request) {
  const url = new URL(request.url);
  const fields = [...url.searchParams.keys()];
  const allowed = new Set([
    "expectedRevision", "mode", "sourceId", "targetKind", "targetId", "cursor", "limit"
  ]);
  const unknown = fields.find((field) => !allowed.has(field));
  if (unknown || new Set(fields).size !== fields.length) {
    fail("invalid_course_sources_query", "A leitura de Fontes recebeu campos incompatíveis.", {
      field: unknown || "query"
    });
  }
  const mode = String(url.searchParams.get("mode") || "catalog").trim();
  const sourceId = url.searchParams.get("sourceId");
  const targetKind = url.searchParams.get("targetKind");
  const targetId = url.searchParams.get("targetId");
  const cursor = url.searchParams.get("cursor");
  const boundedId = (value, maximum = 240) => value != null && value === value.trim() &&
    value.length >= 1 && value.length <= maximum * 2 &&
    [...value].length <= maximum &&
    new TextEncoder().encode(value).byteLength <= maximum * 4 &&
    !hasControlCharacter(value);
  const limit = positiveInteger(url.searchParams.get("limit"), "limit", {
    defaultValue: mode === "catalog" ? 10 : 1,
    maximum: 24
  });
  const hasTargetContext = targetKind !== null || targetId !== null;
  const validTargetContext = targetKind !== null && targetId !== null;
  if (!new Set(["catalog", "source", "target"]).has(mode) ||
      (mode === "source") !== boundedCourseSourceId(sourceId) ||
      mode === "catalog" && hasTargetContext ||
      mode === "target" && (sourceId !== null || !validTargetContext) ||
      mode === "source" && hasTargetContext && !validTargetContext ||
      (targetKind !== null && !new Set(["plan_item", "study_unit"]).has(targetKind)) ||
      (targetId !== null && !boundedId(targetId)) ||
      (targetKind === "plan_item" && !UUID_PATTERN.test(targetId)) ||
      (mode !== "catalog" && (cursor !== null || limit !== 1)) ||
      cursor != null && (cursor.length > 240 ||
        !/^[A-Za-z0-9+/_-]+={0,2}$/u.test(cursor))) {
    fail("invalid_course_sources_query", "A consulta de Fontes é inválida.");
  }
  return {
    expectedRevision: positiveInteger(
      url.searchParams.get("expectedRevision"),
      "expectedRevision"
    ),
    mode,
    sourceId,
    targetKind,
    targetId,
    cursor,
    limit
  };
}

function courseSourcePdfDownloadQuery(request) {
  const url = new URL(request.url);
  const fields = [...url.searchParams.keys()];
  const allowed = new Set([
    "expectedRevision", "sourceId", "sourceRevision", "contentHash"
  ]);
  const unknown = fields.find((field) => !allowed.has(field));
  const sourceId = url.searchParams.get("sourceId");
  const contentHash = String(url.searchParams.get("contentHash") || "").trim();
  const sourceRevision = Number(url.searchParams.get("sourceRevision"));
  if (unknown || new Set(fields).size !== fields.length ||
      !boundedCourseSourceId(sourceId) || !/^[a-f0-9]{64}$/u.test(contentHash) ||
      !Number.isSafeInteger(sourceRevision) || sourceRevision < 1) {
    fail("invalid_course_source_pdf_download", "O download do PDF de Fonte é inválido.", {
      field: unknown || "query"
    });
  }
  return {
    expectedRevision: positiveInteger(
      url.searchParams.get("expectedRevision"),
      "expectedRevision"
    ),
    sourceId,
    sourceRevision,
    contentHash
  };
}

function courseAnchoredAnnotationsQuery(request, courseId) {
  const url = new URL(request.url);
  if (new TextEncoder().encode(`${url.pathname}${url.search}`).byteLength >
      ANCHORED_ANNOTATIONS_REQUEST_TARGET_LIMIT_BYTES) {
    fail(
      "course_anchored_annotations_query_too_large",
      "Os filtros de observação excedem o limite transportável de 8 KiB.",
      null,
      414
    );
  }
  const fields = [...url.searchParams.keys()];
  const listFields = new Set(["origin", "channel", "state", "category", "subjectId"]);
  const allowed = new Set([
    "expectedRevision", "annotationSetVersion", "mode", ...listFields,
    "includeUncategorized", "targetKind", "targetId", "includeDescendants",
    "annotationId", "cursor", "limit"
  ]);
  const unknown = fields.find((field) => !allowed.has(field));
  const duplicatedScalar = [...new Set(fields)].find((field) =>
    !listFields.has(field) && url.searchParams.getAll(field).length > 1
  );
  if (unknown || duplicatedScalar) {
    fail(
      "invalid_course_anchored_annotation_query",
      "A leitura de observações recebeu filtros incompatíveis.",
      { field: unknown || duplicatedScalar }
    );
  }
  const boolean = (field, defaultValue) => {
    const value = url.searchParams.get(field);
    if (value == null) return defaultValue;
    if (value === "true") return true;
    if (value === "false") return false;
    fail(
      "invalid_course_anchored_annotation_query",
      `${field} é inválido.`,
      { field }
    );
  };
  const targetKind = url.searchParams.get("targetKind");
  const targetId = url.searchParams.get("targetId");
  const hierarchyPresent = targetKind !== null || targetId !== null;
  if (hierarchyPresent && (targetKind === null || targetId === null) ||
      !hierarchyPresent && url.searchParams.has("includeDescendants")) {
    fail(
      "invalid_course_anchored_annotation_query",
      "O filtro hierárquico está incompleto.",
      { field: "target" }
    );
  }
  const rawAnnotationSetVersion = url.searchParams.get("annotationSetVersion");
  const annotationSetVersion = rawAnnotationSetVersion === null
    ? null
    : rawAnnotationSetVersion === ""
      ? Number.NaN
      : Number(rawAnnotationSetVersion);
  const query = {
    mode: url.searchParams.has("mode") ? url.searchParams.get("mode") : "inbox",
    origins: url.searchParams.getAll("origin"),
    channels: url.searchParams.getAll("channel"),
    states: url.searchParams.getAll("state"),
    categories: url.searchParams.getAll("category"),
    includeUncategorized: boolean("includeUncategorized", true),
    subjectIds: url.searchParams.getAll("subjectId"),
    hierarchy: hierarchyPresent
      ? {
          target: { kind: targetKind, id: targetId },
          includeDescendants: boolean("includeDescendants", false)
        }
      : null,
    annotationId: url.searchParams.get("annotationId")
  };
  const options = normalizeCourseAnchoredAnnotationsDomain(() =>
    normalizeCourseAnchoredAnnotationReadOptions({
      expectedCourseRevision: Number(url.searchParams.get("expectedRevision")),
      annotationSetVersion,
      query,
      cursor: url.searchParams.get("cursor"),
      limit: url.searchParams.has("limit")
        ? Number(url.searchParams.get("limit"))
        : 12
    })
  );
  if (options.query.hierarchy?.target.kind === "course" &&
      options.query.hierarchy.target.id !== courseId) {
    fail(
      "invalid_course_anchored_annotation_query",
      "O filtro hierárquico não identifica este Curso.",
      { field: "targetId" }
    );
  }
  return options;
}

function courseAuthoringAnalyticsQuery(request) {
  const url = new URL(request.url);
  if (new TextEncoder().encode(`${url.pathname}${url.search}`).byteLength >
      AUTHORING_ANALYTICS_REQUEST_TARGET_LIMIT_BYTES) {
    fail(
      "course_authoring_analytics_query_too_large",
      "O escopo de Analytics excede o limite transportável de 8 KiB.",
      null,
      414
    );
  }
  const fields = [...url.searchParams.keys()];
  const allowed = new Set(["expectedRevision", "scopeKind", "scopeRef"]);
  const unknown = fields.find((field) => !allowed.has(field));
  const duplicatedScalar = [...new Set(fields)].find((field) =>
    url.searchParams.getAll(field).length > 1);
  if (unknown || duplicatedScalar ||
      url.searchParams.getAll("expectedRevision").length !== 1) {
    fail(
      "invalid_course_authoring_analytics_query",
      "A leitura de Analytics recebeu um escopo incompatível.",
      { field: unknown || duplicatedScalar || "expectedRevision" }
    );
  }
  const query = normalizeCourseAuthoringAnalyticsDomain(() =>
    normalizeCourseAuthoringAnalyticsQuery({
      scope: {
        kind: url.searchParams.get("scopeKind") || "course",
        ref: url.searchParams.get("scopeRef")
      }
    })
  );
  return {
    expectedCourseRevision: positiveInteger(
      url.searchParams.get("expectedRevision"),
      "expectedRevision"
    ),
    query
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

function validateEntity(value, index, validateCourseEntityContent) {
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
      !Number.isSafeInteger(position) || position < (identity.entityType === "study_unit" ? 1 : 0) ||
      !value.content || typeof value.content !== "object" || Array.isArray(value.content) ||
      invalidContentField) {
    fail("invalid_course_entity", "A posição ou o conteúdo da entidade é inválido.", { index });
  }
  const content = { ...value.content };
  if (["module", "lesson", "microsequence", "study_unit"].includes(identity.entityType)) {
    content.title = text(value.content.title, "content.title", {
      maximum: 300,
      allowLayoutWhitespace: true
    });
  }
  const validation = validateCourseEntityContent(identity.entityType, {
    id: identity.entityId,
    position,
    ...content
  });
  if (!validation.valid) {
    fail(
      "invalid_course_contract",
      "A entidade não satisfaz o contrato didático do Curso.",
      { index, errors: validation.errors.slice(0, 12) }
    );
  }
  const normalizedContent = { ...validation.normalized };
  delete normalizedContent.id;
  delete normalizedContent.position;
  return { ...identity, parentType, parentId, position, content: normalizedContent };
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


async function validateCompositionChange(body, request) {
  exactFields(body, new Set([
    "requestId", "expectedRevision", "upserts", "deletes",
    "sourceAttributionApplications", "expectedStudyUnitVersion", "applicationOrigin"
  ]));
  const expectedRevision = positiveInteger(body.expectedRevision, "expectedRevision");
  if (!Array.isArray(body.upserts) || !Array.isArray(body.deletes)) {
    fail("invalid_course_command", "Upserts e exclusões precisam ser listas.");
  }
  const { validateCourseEntityContent } = await import(
    "../aralearn/runtime/domain/courseEntities.js"
  );
  const upserts = body.upserts.map((value, index) =>
    validateEntity(value, index, validateCourseEntityContent)
  );
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
  const sourceAttributionApplications = normalizeCourseSourcesDomain(() =>
    normalizeSourceAttributionApplications(body.sourceAttributionApplications)
  );
  const studyUnitIds = upserts
    .filter(({ entityType }) => entityType === "study_unit")
    .map(({ entityId }) => entityId)
    .sort((left, right) => left.localeCompare(right, "en"));
  const attributedIds = sourceAttributionApplications
    .map(({ studyUnitId }) => studyUnitId)
    .sort((left, right) => left.localeCompare(right, "en"));
  if (JSON.stringify(studyUnitIds) !== JSON.stringify(attributedIds)) {
    fail(
      "course_source_attribution_content_mismatch",
      "Cada Unidade inserida ou alterada precisa de uma aplicação de proveniência exata."
    );
  }
  return {
    requestId: requestIdFrom(request, body),
    expectedRevision,
    expectedStudyUnitVersion: body.expectedStudyUnitVersion == null
      ? null
      : positiveInteger(body.expectedStudyUnitVersion, "expectedStudyUnitVersion"),
    applicationOrigin: body.applicationOrigin == null
      ? null
      : (() => {
          if (!new Set(["manual", "provider_assistance"]).has(body.applicationOrigin)) {
            fail(
              "invalid_course_composition_origin",
              "applicationOrigin precisa identificar uma origem conhecida.",
              { field: "applicationOrigin" }
            );
          }
          return body.applicationOrigin;
        })(),
    upserts,
    deletes,
    sourceAttributionApplications
  };
}

async function validatePersonalCourseCopyEdit(body, request, sourceCourseId) {
  exactFields(body, new Set([
    "requestId", "sourceCourseId", "expectedSourceCourseRevision",
    "expectedStudyUnitVersion", "didacticMicrosequenceId", "studyUnit",
    "applicationOrigin"
  ]));
  const bodySourceCourseId = courseUuid(body.sourceCourseId, "sourceCourseId");
  if (bodySourceCourseId !== sourceCourseId) {
    fail(
      "course_identifier_mismatch",
      "O Curso informado não corresponde ao endpoint.",
      { field: "sourceCourseId" }
    );
  }
  const didacticMicrosequenceId = text(
    body.didacticMicrosequenceId,
    "didacticMicrosequenceId",
    { maximum: 240 }
  );
  const applicationOrigin = body.applicationOrigin;
  if (!new Set(["manual", "provider_assistance"]).has(applicationOrigin)) {
    fail(
      "invalid_course_composition_origin",
      "applicationOrigin precisa identificar uma origem conhecida.",
      { field: "applicationOrigin" }
    );
  }
  const { validateCourseEntityContent } = await import(
    "../aralearn/runtime/domain/courseEntities.js"
  );
  const validation = validateCourseEntityContent("study_unit", body.studyUnit);
  if (!validation.valid) {
    fail(
      "invalid_course_contract",
      "A Unidade não satisfaz o contrato didático do Curso.",
      { errors: validation.errors.slice(0, 12) }
    );
  }
  return {
    requestId: requestIdFrom(request, body),
    expectedSourceCourseRevision: positiveInteger(
      body.expectedSourceCourseRevision,
      "expectedSourceCourseRevision"
    ),
    expectedStudyUnitVersion: positiveInteger(
      body.expectedStudyUnitVersion,
      "expectedStudyUnitVersion"
    ),
    didacticMicrosequenceId,
    studyUnit: validation.normalized,
    applicationOrigin
  };
}

function validateCourseSourceChange(body, request) {
  exactFields(body, new Set([
    "requestId", "expectedCourseRevision", "command"
  ]));
  return {
    requestId: requestIdFrom(request, body),
    expectedCourseRevision: positiveInteger(
      body.expectedCourseRevision,
      "expectedCourseRevision"
    ),
    command: normalizeCourseSourcesDomain(() => normalizeCourseSourceCommand(
      jsonObject(body.command, "command", 192 * 1024)
    ))
  };
}

function validateCourseAnchoredAnnotationChange(body, request, courseId) {
  exactFields(body, new Set([
    "requestId", "expectedCourseRevision", "command"
  ]));
  const command = normalizeCourseAnchoredAnnotationsDomain(() =>
    normalizeCourseAnchoredAnnotationCommand(
      jsonObject(body.command, "command", 32 * 1024)
    )
  );
  const requiresCourseRevision = new Set([
    "create_anchored_annotation",
    "correct_anchored_annotation_subjects"
  ]).has(command.type);
  if (command.type === "create_anchored_annotation" &&
      command.target.kind === "course" && command.target.id !== courseId) {
    fail(
      "invalid_course_anchored_annotation_command",
      "O alvo da observação não identifica este Curso.",
      { field: "command.target.id" }
    );
  }
  let expectedCourseRevision = null;
  if (requiresCourseRevision) {
    expectedCourseRevision = positiveInteger(
      body.expectedCourseRevision,
      "expectedCourseRevision"
    );
  } else if (body.expectedCourseRevision !== null) {
    fail(
      "invalid_course_anchored_annotation_command",
      "Este comando usa somente a versão da observação.",
      { field: "expectedCourseRevision" }
    );
  }
  return {
    requestId: requestIdFrom(request, body),
    expectedCourseRevision,
    command
  };
}

async function validateCourseDesignChange(body, request, courseId) {
  exactFields(body, new Set([
    "requestId", "expectedCourseRevision", "command"
  ]));
  const { RESOURCE_PACKAGE_REGISTRY } = await import(
    "../aralearn/runtime/resources/catalog/resourceCatalog.js"
  );
  const knownComponentRefs = RESOURCE_PACKAGE_REGISTRY.listCatalog().map(
    ({ id, version }) => `${id}@${version}`
  );
  const command = normalizeCourseDesignDomain(() => normalizeCourseDesignCommand(
    jsonObject(body.command, "command", 32 * 1024),
    { knownComponentRefs }
  ));
  if (command.scope?.kind === "course" && command.scope.ref !== courseId) {
    fail(
      "invalid_course_design_scope",
      "O escopo do comando não identifica este Curso.",
      { field: "command.scope.ref" }
    );
  }
  return {
    requestId: requestIdFrom(request, body),
    expectedCourseRevision: positiveInteger(
      body.expectedCourseRevision,
      "expectedCourseRevision"
    ),
    command
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

function validateCourseLifecycle(body, request) {
  exactFields(body, new Set(["requestId", "operation", "confirmed"]));
  const operation = text(body.operation, "operation", { maximum: 40 });
  if (!new Set(["delete_owned_course", "leave_shared_course"]).has(operation) ||
      body.confirmed !== true) {
    fail("invalid_course_lifecycle", "A operação de ciclo de vida do Curso é inválida.");
  }
  return {
    requestId: requestIdFrom(request, body),
    operation,
    confirmed: true
  };
}

function maintenanceQuery(request) {
  const url = new URL(request.url);
  if ([...url.searchParams.keys()].some((field) => field !== "limit") ||
      url.searchParams.getAll("limit").length > 1) {
    fail("invalid_maintenance_query", "A consulta de Manutenção é inválida.");
  }
  return {
    limit: positiveInteger(url.searchParams.get("limit"), "limit", {
      defaultValue: 100,
      maximum: 500
    })
  };
}

function validateMaintenanceAction(body) {
  exactFields(body, new Set([
    "operation", "confirmed", "limit", "classification", "objectPath"
  ]));
  const operation = text(body.operation, "operation", { maximum: 40 });
  if (!new Set(["run_retention", "remove_orphan_object"]).has(operation) ||
      body.confirmed !== true) {
    fail("invalid_maintenance_action", "A ação de Manutenção é inválida.");
  }
  if (operation === "run_retention") {
    if (body.classification != null || body.objectPath != null) {
      fail("invalid_maintenance_action", "A retenção não recebe um objeto de resíduo.");
    }
    return {
      operation,
      confirmed: true,
      limit: positiveInteger(body.limit, "limit", { maximum: 1000 })
    };
  }
  if (body.limit != null) {
    fail("invalid_maintenance_action", "A remoção de resíduo não recebe limite.");
  }
  const classification = text(body.classification, "classification", { maximum: 80 });
  const objectPath = text(body.objectPath, "objectPath", { maximum: 500 });
  if (!new Set([
    "avatar_owner_missing", "avatar_profile_unlinked",
    "pdf_course_missing", "pdf_unlinked"
  ]).has(classification)) {
    fail("invalid_maintenance_action", "A classe de resíduo não pode ser removida.");
  }
  return { operation, confirmed: true, classification, objectPath };
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
  if (route.name === "getCurrentMaintenance") {
    assertApplicationPrincipal(principal);
    return {
      requestId: null,
      data: await adapter.getCurrentMaintenance({
        principal,
        ...maintenanceQuery(request),
        deadlineAt
      })
    };
  }
  if (route.name === "executeCurrentMaintenance") {
    assertApplicationPrincipal(principal, { write: true });
    return {
      requestId: null,
      data: await adapter.executeCurrentMaintenance({
        principal,
        ...validateMaintenanceAction(await readCourseJsonBody(request)),
        deadlineAt
      })
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
  if (route.name === "getCourseDesign") {
    assertPrincipal(principal);
    return {
      requestId: null,
      data: await adapter.getCourseDesign({
        principal,
        courseId: route.courseId,
        ...courseDesignScopeQuery(request, route.courseId),
        deadlineAt
      })
    };
  }
  if (route.name === "getCourseSources") {
    assertPrincipal(principal);
    return {
      requestId: null,
      data: await adapter.getCourseSources({
        principal,
        courseId: route.courseId,
        ...courseSourcesQuery(request),
        deadlineAt
      })
    };
  }
  if (route.name === "getCourseSourcePdfDownload") {
    assertPrincipal(principal);
    return {
      requestId: null,
      data: await adapter.getCourseSourcePdfDownload({
        principal,
        courseId: route.courseId,
        ...courseSourcePdfDownloadQuery(request),
        deadlineAt
      })
    };
  }
  if (route.name === "getCourseAnchoredAnnotations") {
    assertPrincipal(principal);
    const options = courseAnchoredAnnotationsQuery(request, route.courseId);
    return {
      requestId: null,
      data: await adapter.getCourseAnchoredAnnotations({
        principal,
        courseId: route.courseId,
        ...options,
        deadlineAt
      })
    };
  }
  if (route.name === "getCourseAuthoringAnalytics") {
    assertPrincipal(principal);
    return {
      requestId: null,
      data: await adapter.getCourseAuthoringAnalytics({
        principal,
        courseId: route.courseId,
        ...courseAuthoringAnalyticsQuery(request),
        deadlineAt
      })
    };
  }
  if (route.name === "listCourseStudyUnits") {
    assertPrincipal(principal);
    return {
      requestId: null,
      data: await adapter.listCourseStudyUnits({
        principal,
        courseId: route.courseId,
        ...courseStudyUnitQuery(request),
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
  if (route.name === "maintainCourse") {
    assertApplicationPrincipal(principal, { write: true });
    const value = validateCourseLifecycle(await readCourseJsonBody(request), request);
    return {
      requestId: value.requestId,
      data: await adapter.maintainCourse({
        principal,
        courseId: route.courseId,
        ...value,
        deadlineAt
      })
    };
  }
  if (route.name === "applyCourseDesignCommand") {
    assertPrincipal(principal, { write: true });
    const value = await validateCourseDesignChange(
      await readCourseJsonBody(request),
      request,
      route.courseId
    );
    return {
      requestId: value.requestId,
      data: await adapter.applyCourseDesignCommand({
        principal,
        courseId: route.courseId,
        ...value,
        deadlineAt
      })
    };
  }
  if (route.name === "executeCourseSourceCommand") {
    assertPrincipal(principal, { write: true });
    const value = validateCourseSourceChange(
      await readCourseJsonBody(request),
      request
    );
    return {
      requestId: value.requestId,
      data: await adapter.executeCourseSourceCommand({
        principal,
        courseId: route.courseId,
        ...value,
        deadlineAt
      })
    };
  }
  if (route.name === "executeCourseAnchoredAnnotationCommand") {
    assertPrincipal(principal, { write: true });
    const value = validateCourseAnchoredAnnotationChange(
      await readCourseJsonBody(request),
      request,
      route.courseId
    );
    return {
      requestId: value.requestId,
      data: await adapter.executeCourseAnchoredAnnotationCommand({
        principal,
        courseId: route.courseId,
        ...value,
        deadlineAt
      })
    };
  }
  if (route.name === "commitPersonalCourseCopyEdit") {
    assertApplicationPrincipal(principal, { write: true });
    const value = await validatePersonalCourseCopyEdit(
      await readCourseJsonBody(request),
      request,
      route.sourceCourseId
    );
    return {
      requestId: value.requestId,
      data: await adapter.commitPersonalCourseCopyEdit({
        principal,
        sourceCourseId: route.sourceCourseId,
        ...value,
        deadlineAt
      })
    };
  }
  if (route.name === "commitCourseComposition") {
    assertPrincipal(principal, { write: true });
    const value = await validateCompositionChange(await readCourseJsonBody(request), request);
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
