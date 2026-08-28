import { createUuid, UUID_PATTERN } from "../domain/identifiers.js";
import { normalizeCourseAuthoringPlanCommand } from "../domain/courseAuthoringPlan.js";
import {
  normalizeCourseAnchoredAnnotationChange,
  normalizeCourseAnchoredAnnotationCommand,
  normalizeCourseAnchoredAnnotationPage,
  normalizeCourseAnchoredAnnotationQuery,
  normalizeCourseAnchoredAnnotationReadOptions
} from "../domain/courseAnchoredAnnotations.js";
import {
  normalizeCourseAuditCycleChange,
  normalizeCourseAuditCycleCommand,
  normalizeCourseAuditCyclePage,
  normalizeCourseAuditCycleQuery,
  normalizeCourseAuditCycleReadOptions
} from "../domain/courseAuditCycle.js";
import {
  normalizeCourseVariantChange,
  normalizeCourseVariantCommand,
  normalizeCourseVariantComparison,
  normalizeCourseVariantComparisonList,
  normalizeCourseVariantDetachCommand,
  normalizeCourseVariantRead
} from "../domain/courseVariants.js";
import {
  normalizeCourseAuthoringAnalyticsPage,
  normalizeCourseAuthoringAnalyticsQuery
} from "../domain/courseAuthoringAnalytics.js";
import { normalizeCourseDesignCommand } from "../domain/courseDesignParameters.js";
import {
  normalizeFocalStudyUnitCompositionCommand,
  normalizeFocalStudyUnitCompositionReceipt,
  normalizePersonalCourseCopyEditCommand,
  normalizePersonalCourseCopyEditReceipt
} from "../domain/courseComposition.js";
import {
  COURSE_SOURCE_PDF_MAX_BYTES,
  COURSE_SOURCE_PDF_MEDIA_TYPE,
  normalizeCourseSourceAttachmentAccess,
  normalizeCourseSourceAttributionApplication,
  normalizeSourceAttributionApplications,
  normalizeCourseSourceChange,
  normalizeCourseSourceCommand,
  normalizeCourseSourcesRead,
  normalizeCourseStudyCitationsRead
} from "../domain/courseSources.js";
import { SupabaseHttpClient } from "./SupabaseHttpClient.js";

const RFC3339 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/u;
const REQUEST_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/u;
const SOURCE_CURSOR_PATTERN = /^[A-Za-z0-9+/_-]+={0,2}$/u;
const SHA256_PATTERN = /^[a-f0-9]{64}$/u;
const AVATAR_BUCKET = "person-avatars";
const COURSE_SOURCE_ATTACHMENT_BUCKET = "course-source-pdfs";
const COURSE_SOURCE_PDF_STORAGE_PATH = new RegExp(
  `^${UUID_PATTERN.source.slice(1, -1)}/[a-f0-9]{64}\\.pdf$`,
  "u"
);
const AVATAR_MAX_BYTES = 512 * 1024;
const AVATAR_EXTENSIONS = Object.freeze({
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp"
});
const AVATAR_OBJECT_KEY = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(?:jpg|png|webp)$/u;
const COURSE_EDGE_RETRY_DELAY_MS = 750;
const COURSE_EDGE_TRANSIENT_STATUSES = new Set([502, 503, 504]);

function first(value) {
  return Array.isArray(value) && value.length === 1 ? value[0] : value;
}

function uuid(value, label) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!UUID_PATTERN.test(normalized)) throw new TypeError(`${label} inválido.`);
  return normalized;
}

function positiveInteger(value, label, { minimum = 1, maximum = Number.MAX_SAFE_INTEGER } = {}) {
  const normalized = Number(value);
  if (!Number.isSafeInteger(normalized) || normalized < minimum || normalized > maximum) {
    throw new TypeError(`${label} inválido.`);
  }
  return normalized;
}

function cursor(value, label) {
  if (value == null) return null;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${label} inválido.`);
  }
  const beforeUpdatedAt = String(value.beforeUpdatedAt || "").trim();
  const beforeId = uuid(value.beforeId, `${label}: identidade`);
  if (!RFC3339.test(beforeUpdatedAt) || !Number.isFinite(Date.parse(beforeUpdatedAt))) {
    throw new TypeError(`${label}: data inválida.`);
  }
  return { beforeUpdatedAt, beforeId };
}

function entityCursor(value) {
  if (value == null) return null;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("Cursor de entidades inválido.");
  }
  if (Object.keys(value).length !== 2 ||
      Object.keys(value).some((field) => !new Set(["entityType", "entityId"]).has(field))) {
    throw new TypeError("Cursor de entidades inválido.");
  }
  const entityType = String(value.entityType || "").trim();
  const entityId = String(value.entityId || "").trim();
  if (!new Set(["module", "lesson", "topic", "microsequence", "study_unit"]).has(entityType) ||
      !entityId || entityId.length > 240) {
    throw new TypeError("Cursor de entidades inválido.");
  }
  return { entityType, entityId };
}

const AUTHORING_INSPECTION_SCOPE_KINDS = new Set([
  "course",
  "authoring_part",
  "unassigned",
  "module",
  "lesson",
  "didactic_microsequence"
]);
const COURSE_DESIGN_SCOPE_KINDS = new Set([
  "course", "module", "lesson", "didactic_microsequence"
]);
const COURSE_SOURCE_MODES = new Set(["catalog", "source", "target"]);
const COURSE_SOURCE_TARGET_KINDS = new Set(["plan_item", "study_unit"]);

function boundedIdentifier(value, label, { maximum = 240 } = {}) {
  const normalized = String(value || "").trim();
  if (!normalized || normalized !== value || normalized.length > maximum ||
      hasControlCharacter(normalized)) {
    throw new TypeError(`${label} inválida.`);
  }
  return normalized;
}

function boundedLegacySourceId(value, label) {
  if (typeof value !== "string" || value.length < 1 || value.length > 4_096 ||
      [...value].length > 2_048 || new TextEncoder().encode(value).byteLength > 8_192 ||
      hasControlCharacter(value)) {
    throw new TypeError(`${label} inválida.`);
  }
  return value;
}

function boundedCourseSourceIdentifier(value, label, { maximum = 240 } = {}) {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!normalized || normalized !== value || normalized.length > maximum * 2 ||
      [...normalized].length > maximum ||
      new TextEncoder().encode(normalized).byteLength > maximum * 4 ||
      hasControlCharacter(normalized)) {
    throw new TypeError(`${label} inválida.`);
  }
  return normalized;
}

function requestIdentity(value) {
  if (typeof value !== "string" || value !== value.trim() ||
      !REQUEST_ID_PATTERN.test(value)) {
    throw new TypeError("Identidade da alteração inválida.");
  }
  return value;
}

function courseSourceCommandSubjectId(command) {
  return command.type === "save_source" || command.type === "retire_source" ||
    command.type === "attach_pdf"
    ? command.sourceId
    : command.type === "save_anchor" || command.type === "retire_anchor"
      ? command.anchorId
      : command.targetId;
}

function authoringInspectionScope(value = { kind: "course", id: null }) {
  const source = exactObject(value, new Set(["kind", "id"]), "Escopo da inspeção");
  const kind = String(source.kind || "").trim();
  if (!AUTHORING_INSPECTION_SCOPE_KINDS.has(kind)) {
    throw new TypeError("Escopo da inspeção inválido.");
  }
  if (kind === "course" || kind === "unassigned") {
    if (source.id != null) throw new TypeError("Escopo da inspeção inválido.");
    return { kind, id: null };
  }
  const id = kind === "authoring_part"
    ? uuid(source.id, "Parte da inspeção")
    : boundedIdentifier(source.id, "Identidade do escopo");
  return { kind, id };
}

function authoringStudyUnitCursor(value) {
  if (value == null) return null;
  const source = exactObject(value, new Set(["studyUnitId"]), "Cursor da inspeção");
  if (Object.keys(source).length !== 1) throw new TypeError("Cursor da inspeção inválido.");
  return { studyUnitId: boundedIdentifier(source.studyUnitId, "Unidade do cursor") };
}

function courseDesignScope(value, courseId) {
  const candidate = value ?? { kind: "course", ref: courseId };
  const source = exactObject(candidate, new Set(["kind", "ref"]), "Escopo dos parâmetros");
  if (Object.keys(source).length !== 2) {
    throw new TypeError("Escopo dos parâmetros inválido.");
  }
  const kind = String(source.kind || "").trim();
  if (!COURSE_DESIGN_SCOPE_KINDS.has(kind) || kind !== source.kind) {
    throw new TypeError("Escopo dos parâmetros inválido.");
  }
  const ref = boundedIdentifier(source.ref, "Referência do escopo");
  if (ref !== source.ref || (kind === "course" && ref !== courseId)) {
    throw new TypeError("Escopo dos parâmetros inválido.");
  }
  return { kind, ref };
}

function courseSourcesReadOptions(value = {}) {
  const source = exactObject(value, new Set([
    "expectedRevision", "mode", "sourceId", "targetKind", "targetId", "cursor", "limit"
  ]), "Leitura de Fontes");
  const expectedRevision = positiveInteger(
    source.expectedRevision,
    "Versão do Curso"
  );
  const mode = source.mode == null ? "catalog" : String(source.mode).trim();
  const sourceId = source.sourceId == null
    ? null
    : boundedLegacySourceId(source.sourceId, "Identidade da Fonte");
  const targetKind = source.targetKind == null ? null : String(source.targetKind).trim();
  const targetId = source.targetId == null
    ? null
    : boundedCourseSourceIdentifier(source.targetId, "Identidade do alvo");
  const cursor = source.cursor == null ? null : String(source.cursor).trim();
  const limit = source.limit == null
    ? 10
    : positiveInteger(source.limit, "Limite de Fontes", { maximum: 24 });
  const hasTargetContext = targetKind !== null || targetId !== null;
  const validTargetContext = targetKind !== null && targetId !== null;
  if (!COURSE_SOURCE_MODES.has(mode) || mode !== (source.mode ?? "catalog") ||
      (mode === "source") !== (sourceId !== null) ||
      mode === "catalog" && hasTargetContext ||
      mode === "target" && (sourceId !== null || !validTargetContext) ||
      mode === "source" && hasTargetContext && !validTargetContext ||
      (targetKind !== null && !COURSE_SOURCE_TARGET_KINDS.has(targetKind)) ||
      (targetKind === "plan_item" && !UUID_PATTERN.test(targetId)) ||
      (mode === "source" && hasTargetContext && cursor !== null) ||
      (source.cursor != null && (
        cursor !== source.cursor || cursor.length > 240 || !SOURCE_CURSOR_PATTERN.test(cursor)
      ))) {
    throw new TypeError("Leitura de Fontes inválida.");
  }
  return {
    expectedRevision,
    mode,
    sourceId,
    targetKind,
    targetId,
    cursor,
    limit
  };
}

function courseSourceAttachmentIdentity(value = {}, {
  operation,
  requireSize = false
} = {}) {
  const allowed = new Set([
    "courseId", "expectedRevision", "sourceId", "sourceRevision",
    "contentHash", "byteSize", "mediaType"
  ]);
  const source = exactObject(value, allowed, "Acesso ao anexo de Fonte");
  const normalized = {
    courseId: uuid(source.courseId, "Curso"),
    expectedRevision: positiveInteger(source.expectedRevision, "Versão do Curso"),
    sourceId: boundedLegacySourceId(source.sourceId, "Identidade da Fonte"),
    sourceRevision: positiveInteger(source.sourceRevision, "Revisão da Fonte"),
    contentHash: String(source.contentHash || "").trim().toLowerCase(),
    byteSize: source.byteSize == null ? null : positiveInteger(
      source.byteSize,
      "Tamanho do anexo",
      { maximum: COURSE_SOURCE_PDF_MAX_BYTES }
    ),
    mediaType: source.mediaType == null
      ? null
      : String(source.mediaType).trim().toLowerCase()
  };
  if (!SHA256_PATTERN.test(normalized.contentHash) ||
      requireSize && normalized.byteSize === null ||
      requireSize && normalized.mediaType !== COURSE_SOURCE_PDF_MEDIA_TYPE ||
      !requireSize && (normalized.byteSize !== null || normalized.mediaType !== null)) {
    throw new TypeError("Acesso ao anexo de Fonte inválido.");
  }
  return { operation, ...normalized };
}

function boundCourseSourceAttachmentAccess(value, request) {
  const access = normalizeCourseSourceAttachmentAccess(value);
  if (access.operation !== request.operation || access.courseId !== request.courseId ||
      access.courseRevision !== request.expectedRevision ||
      access.sourceId !== request.sourceId ||
      access.sourceRevision !== request.sourceRevision ||
      access.attachment.contentHash !== request.contentHash ||
      request.byteSize !== null && access.attachment.byteSize !== request.byteSize ||
      request.mediaType !== null && access.attachment.mediaType !== request.mediaType) {
    throw new TypeError("O acesso ao anexo não corresponde ao pedido.");
  }
  return access;
}

function bytesToHex(value) {
  return [...new Uint8Array(value)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function pdfHeaderIsValid(value) {
  const bytes = new Uint8Array(value, 0, Math.min(5, value.byteLength));
  return bytes.length === 5 && bytes[0] === 0x25 && bytes[1] === 0x50 &&
    bytes[2] === 0x44 && bytes[3] === 0x46 && bytes[4] === 0x2d;
}

function storageObjectExists(status, body) {
  const message = String(body?.message || body?.error || body || "").toLowerCase();
  return status === 409 || status === 400 &&
    /(?:already exists|resource exists|duplicate)/u.test(message);
}

function timestamp(value, label) {
  const normalized = String(value || "").trim();
  if (!RFC3339.test(normalized) || !Number.isFinite(Date.parse(normalized))) {
    throw new TypeError(`${label} inválida.`);
  }
  return normalized;
}

function exactObject(value, fields, label) {
  if (!value || typeof value !== "object" || Array.isArray(value) ||
      Object.keys(value).some((field) => !fields.has(field))) {
    throw new TypeError(`${label} inválido.`);
  }
  return value;
}

function hasControlCharacter(value, allowLayoutWhitespace = false) {
  return Array.from(value).some((character) => {
    const codePoint = character.codePointAt(0);
    if (codePoint >= 127 && codePoint <= 159) return true;
    if (codePoint >= 32) return false;
    return !allowLayoutWhitespace || ![9, 10, 13].includes(codePoint);
  });
}

function requiredText(value, label, maximum) {
  const normalized = String(value || "").trim();
  if (!normalized || normalized.length > maximum ||
      hasControlCharacter(normalized, true)) {
    throw new TypeError(`${label} inválido.`);
  }
  return normalized;
}

function reviewCursor(value) {
  if (value == null) return null;
  const source = exactObject(value, new Set([
    "beforeMarkedAt", "beforeCourseId", "beforeStudyUnitId"
  ]), "Cursor da fila Rever");
  if (Object.keys(source).length !== 3) {
    throw new TypeError("Cursor da fila Rever inválido.");
  }
  const beforeStudyUnitId = String(source.beforeStudyUnitId || "").trim();
  if (!beforeStudyUnitId || beforeStudyUnitId.length > 240 ||
      hasControlCharacter(beforeStudyUnitId)) {
    throw new TypeError("Cursor da fila Rever inválido.");
  }
  return {
    beforeMarkedAt: timestamp(source.beforeMarkedAt, "Data da fila Rever"),
    beforeCourseId: uuid(source.beforeCourseId, "Curso da fila Rever"),
    beforeStudyUnitId
  };
}

function normalizeReviewItem(value) {
  const source = exactObject(value, new Set([
    "courseId", "studyUnitId", "title", "context", "entityPath", "reviewMarkedAt"
  ]), "Item da fila Rever");
  if (Object.keys(source).length !== 6 || !Array.isArray(source.entityPath) ||
      source.entityPath.length !== 5) {
    throw new TypeError("Item da fila Rever inválido.");
  }
  const courseId = uuid(source.courseId, "Curso da fila Rever");
  const studyUnitId = String(source.studyUnitId || "").trim();
  const title = String(source.title || "").trim();
  const context = String(source.context || "").trim();
  const entityPath = source.entityPath.map((identity) => String(identity || "").trim());
  if (!studyUnitId || studyUnitId.length > 240 || !title || title.length > 500 ||
      !context || context.length > 1_000 ||
      entityPath.some((identity) => !identity || identity.length > 240) ||
      entityPath[0].toLowerCase() !== courseId || entityPath[4] !== studyUnitId) {
    throw new TypeError("Item da fila Rever inválido.");
  }
  return {
    courseId,
    studyUnitId,
    title,
    context,
    entityPath,
    reviewMarkedAt: timestamp(source.reviewMarkedAt, "Marcação para Rever")
  };
}

function normalizeReviewPage(value) {
  const source = exactObject(value, new Set([
    "contract", "items", "hasMore", "nextCursor"
  ]), "Página da fila Rever");
  if (Object.keys(source).length !== 4 ||
      source.contract !== "aralearn.course-review-list.v1" ||
      !Array.isArray(source.items) || typeof source.hasMore !== "boolean") {
    throw new TypeError("Página da fila Rever inválida.");
  }
  const items = source.items.map(normalizeReviewItem);
  const identities = new Set(items.map((item) => `${item.courseId}\u0000${item.studyUnitId}`));
  if (identities.size !== items.length || (source.hasMore && items.length === 0)) {
    throw new TypeError("Página da fila Rever inválida.");
  }
  const nextCursor = source.hasMore ? reviewCursor(source.nextCursor) : null;
  if (!source.hasMore && source.nextCursor != null) {
    throw new TypeError("Página da fila Rever inválida.");
  }
  return {
    contract: source.contract,
    items,
    hasMore: source.hasMore,
    nextCursor
  };
}

function plainObject(value, label) {
  const prototype = value && typeof value === "object" ? Object.getPrototypeOf(value) : null;
  if (!value || typeof value !== "object" || Array.isArray(value) ||
      (prototype !== Object.prototype && prototype !== null)) {
    throw new TypeError(`${label} inválido.`);
  }
  return structuredClone(value);
}

function boundedJsonObject(value, label, maximumBytes) {
  const normalized = plainObject(value, label);
  if (new TextEncoder().encode(JSON.stringify(normalized)).byteLength > maximumBytes) {
    throw new TypeError(`${label} excede o limite.`);
  }
  return normalized;
}

function normalizedMaterializationCommand(value) {
  const command = boundedJsonObject(value, "Comando de materialização", 512 * 1024);
  const operation = String(command.operation || "").trim();
  const base = [
    "operation", "authoringPartId", "materializationId",
    "expectedMaterializationVersion"
  ];
  const operationFields = operation === "start"
    ? ["authoringPartVersion", "steps"]
    : operation === "record_step"
      ? [
          "stepId", "expectedStepVersion", "status", "resultFacts",
          "entityChanges", "designApplication", "sourceAttributionApplication"
        ]
      : operation === "finish"
        ? ["status", "resultFacts"]
        : [];
  const fields = new Set([...base, ...operationFields]);
  if (!operationFields.length || [...fields].some((field) => !Object.hasOwn(command, field)) ||
      Object.keys(command).some((field) => !fields.has(field))) {
    throw new TypeError("Comando de materialização inválido.");
  }
  if (operation === "record_step") {
    command.sourceAttributionApplication = command.sourceAttributionApplication == null
      ? null
      : normalizeCourseSourceAttributionApplication(command.sourceAttributionApplication);
  }
  return command;
}

function authenticationFailure(error) {
  const status = Number(error?.status || error?.response?.status || 0);
  const code = String(error?.code || "").toUpperCase();
  return status === 401 || new Set([
    "AUTH_REQUIRED",
    "BAD_JWT",
    "INVALID_JWT",
    "JWT_EXPIRED",
    "PGRST301"
  ]).has(code);
}

function transientCourseEdgeFailure(error) {
  return COURSE_EDGE_TRANSIENT_STATUSES.has(Number(error?.status || 0)) &&
    !String(error?.code || "").trim();
}

function courseActionCanBeReplayed(actionName, body) {
  return actionName === "lerCurso" ||
    typeof body?.requestId === "string" && REQUEST_ID_PATTERN.test(body.requestId);
}

function courseRevisionChangedError(cause = null) {
  const error = new Error("O Curso mudou durante a leitura das citações.");
  error.name = "CourseRevisionChangedError";
  error.status = 409;
  error.code = "course_revision_changed";
  if (cause) error.cause = cause;
  return error;
}

function courseRevisionConflict(error) {
  const status = Number(error?.status || error?.response?.status || 0);
  const code = String(error?.code || error?.response?.code || "").toUpperCase();
  return status === 409 || code === "40001" || code === "COURSE_REVISION_CHANGED";
}

function storageObjectPath(objectKey) {
  const normalized = String(objectKey || "").trim().toLowerCase();
  if (!AVATAR_OBJECT_KEY.test(normalized)) {
    throw new TypeError("Objeto de avatar inválido.");
  }
  return normalized.split("/").map(encodeURIComponent).join("/");
}

function accountDeletionMayBeAmbiguous(error) {
  const status = Number(error?.status ?? error?.response?.status ?? 0);
  const code = String(error?.code || error?.response?.code || "").trim().toLowerCase();
  return status === 0 || status === 408 || status === 429 || status >= 500 ||
    new Set([
      "request_timeout",
      "service_timeout",
      "course_service_unavailable",
      "account_deletion_in_progress"
    ]).has(code);
}

function accountDeletionInProgressError(cause = null) {
  const error = new Error(
    "A exclusão pode já ter sido concluída ou ainda aguardar a etapa final; " +
    "tente novamente para confirmar ou concluir."
  );
  error.name = "AccountDeletionInProgressError";
  error.status = 503;
  error.code = "account_deletion_in_progress";
  if (cause) error.cause = cause;
  return error;
}

function courseSourcePdfStoragePath(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!COURSE_SOURCE_PDF_STORAGE_PATH.test(normalized)) {
    throw new TypeError("Objeto PDF de Fonte inválido.");
  }
  return normalized.split("/").map(encodeURIComponent).join("/");
}

function defaultAnchoredAnnotationQuery(mode = "inbox") {
  return {
    mode,
    origins: [],
    channels: [],
    states: [],
    categories: [],
    includeUncategorized: true,
    subjectIds: [],
    hierarchy: null,
    annotationId: null
  };
}

function anchoredAnnotationReadOptions(value = {}) {
  const source = exactObject(value, new Set([
    "expectedCourseRevision", "annotationSetVersion", "query", "cursor", "limit"
  ]), "Leitura de observações");
  return normalizeCourseAnchoredAnnotationReadOptions({
    expectedCourseRevision: source.expectedCourseRevision,
    annotationSetVersion: source.annotationSetVersion ?? null,
    query: source.query ?? defaultAnchoredAnnotationQuery(),
    cursor: source.cursor ?? null,
    limit: source.limit ?? 12
  });
}

function anchoredAnnotationMutation(value = {}) {
  const source = exactObject(value, new Set([
    "requestId", "courseId", "expectedCourseRevision", "command"
  ]), "Alteração de observação");
  const command = normalizeCourseAnchoredAnnotationCommand(source.command);
  const requiresCourseRevision = new Set([
    "create_anchored_annotation",
    "correct_anchored_annotation_subjects"
  ]).has(command.type);
  const expectedCourseRevision = source.expectedCourseRevision ?? null;
  if (requiresCourseRevision) {
    positiveInteger(expectedCourseRevision, "Versão do Curso");
  } else if (expectedCourseRevision !== null) {
    throw new TypeError("Este comando usa somente a versão da observação.");
  }
  return {
    requestId: requestIdentity(source.requestId ?? createUuid()),
    courseId: uuid(source.courseId, "Curso"),
    expectedCourseRevision,
    command
  };
}

function boundAnchoredAnnotationPage(value, { courseId, options }) {
  const page = normalizeCourseAnchoredAnnotationPage(value);
  if (page.courseId !== courseId ||
      page.courseRevision !== options.expectedCourseRevision ||
      options.annotationSetVersion !== null &&
        page.annotationSetVersion !== options.annotationSetVersion ||
      JSON.stringify(normalizeCourseAnchoredAnnotationQuery(page.query)) !==
        JSON.stringify(options.query) ||
      page.items.some((annotation) => annotation.courseId !== courseId)) {
    throw new TypeError("A leitura de observações não corresponde ao pedido.");
  }
  return page;
}

function boundAnchoredAnnotationChange(value, mutation, {
  expectedOrigin = null,
  expectedChannel = null
} = {}) {
  const change = normalizeCourseAnchoredAnnotationChange(value);
  const annotation = change.annotation;
  if (change.courseId !== mutation.courseId || change.requestId !== mutation.requestId ||
      mutation.expectedCourseRevision !== null && (
        change.idempotent
          ? change.courseRevision < mutation.expectedCourseRevision
          : change.courseRevision !== mutation.expectedCourseRevision
      ) ||
      annotation !== null && (
        annotation.courseId !== mutation.courseId ||
        annotation.annotationId !== mutation.command.annotationId
      ) ||
      mutation.command.type === "create_anchored_annotation" && annotation !== null && (
        annotation.target.kind !== mutation.command.target.kind ||
        annotation.target.id !== mutation.command.target.id ||
        expectedOrigin !== null && annotation.provenance.origin !== expectedOrigin ||
        expectedChannel !== null && annotation.provenance.channel !== expectedChannel
      )) {
    throw new TypeError("A confirmação da observação não corresponde ao comando.");
  }
  return change;
}

function defaultAuditCycleQuery() {
  return {
    mode: "findings",
    targetStudyUnitId: null,
    findingId: null,
    correctionId: null,
    auditRunId: null,
    states: [],
    dimensions: [],
    severities: [],
    annotationIds: []
  };
}

function auditCycleReadOptions(value = {}) {
  const source = exactObject(value, new Set([
    "expectedCourseRevision", "auditSetVersion", "query", "cursor", "limit"
  ]), "Leitura de auditoria");
  return normalizeCourseAuditCycleReadOptions({
    expectedCourseRevision: source.expectedCourseRevision,
    auditSetVersion: source.auditSetVersion ?? null,
    query: source.query ?? defaultAuditCycleQuery(),
    cursor: source.cursor ?? null,
    limit: source.limit ?? 12
  });
}

function auditCycleMutation(value = {}) {
  const source = exactObject(value, new Set([
    "requestId", "courseId", "expectedCourseRevision", "command"
  ]), "Alteração de auditoria");
  return {
    requestId: requestIdentity(source.requestId ?? createUuid()),
    courseId: uuid(source.courseId, "Curso"),
    expectedCourseRevision: positiveInteger(
      source.expectedCourseRevision,
      "Versão do Curso"
    ),
    command: normalizeCourseAuditCycleCommand(source.command)
  };
}

function boundAuditCyclePage(value, { courseId, options }) {
  const page = normalizeCourseAuditCyclePage(value);
  if (page.courseId !== courseId ||
      page.courseRevision !== options.expectedCourseRevision ||
      options.auditSetVersion !== null &&
        page.auditSetVersion !== options.auditSetVersion ||
      JSON.stringify(normalizeCourseAuditCycleQuery(page.query)) !==
        JSON.stringify(options.query)) {
    throw new TypeError("A leitura de auditoria não corresponde ao pedido.");
  }
  return page;
}

function boundAuditCycleChange(value, mutation) {
  const change = normalizeCourseAuditCycleChange(value);
  const changesCourseContent = new Set([
    "apply_authoring_correction",
    "rollback_authoring_correction"
  ]).has(mutation.command.type);
  const expectedRevision = mutation.expectedCourseRevision +
    (changesCourseContent && change.changed && !change.idempotent ? 1 : 0);
  if (change.courseId !== mutation.courseId ||
      change.requestId !== mutation.requestId ||
      change.change !== null && change.change.type !== mutation.command.type ||
      (change.idempotent
        ? change.courseRevision < mutation.expectedCourseRevision
        : change.courseRevision !== expectedRevision) ||
      mutation.command.findingId != null && change.finding != null &&
        change.finding.findingId !== mutation.command.findingId ||
      mutation.command.correctionId != null && change.correction != null &&
        change.correction.correctionId !== mutation.command.correctionId) {
    throw new TypeError("A confirmação da auditoria não corresponde ao comando.");
  }
  return change;
}

function personalStateEnvelope(value, courseId) {
  if (value === null) return null;
  const envelope = exactObject(value, new Set([
    "contract", "courseId", "revision", "state", "updatedAt"
  ]), "Estado pessoal remoto");
  const state = exactObject(envelope.state, new Set([
    "version", "progress", "reviewMarks"
  ]), "Estado pessoal remoto");
  if (Object.keys(envelope).length !== 5 || Object.keys(state).length !== 3 ||
      envelope.contract !== "aralearn.course-personal-state.v2" ||
      uuid(envelope.courseId, "Curso do estado pessoal") !== courseId ||
      positiveInteger(envelope.revision, "Revisão do estado pessoal") !== envelope.revision ||
      state.version !== 2 || !state.progress || typeof state.progress !== "object" ||
      Array.isArray(state.progress) || !state.reviewMarks ||
      typeof state.reviewMarks !== "object" || Array.isArray(state.reviewMarks)) {
    throw new TypeError("Estado pessoal remoto inválido.");
  }
  timestamp(envelope.updatedAt, "Atualização do estado pessoal");
  return structuredClone(envelope);
}

function personalStateMutationResult(value, courseId, expectedRevision) {
  const result = exactObject(value, new Set([
    "courseId", "revision", "updatedAt", "idempotent"
  ]), "Confirmação do estado pessoal");
  if (Object.keys(result).length !== 4 ||
      uuid(result.courseId, "Curso confirmado") !== courseId ||
      !Number.isSafeInteger(result.revision) || result.revision <= expectedRevision ||
      (!result.idempotent && result.revision !== expectedRevision + 1) ||
      typeof result.idempotent !== "boolean") {
    throw new TypeError("Confirmação do estado pessoal inválida.");
  }
  timestamp(result.updatedAt, "Atualização confirmada do estado pessoal");
  return structuredClone(result);
}

export class CourseApiClient {
  constructor({ projectUrl, publishableKey, authClient, fetchImpl = globalThis.fetch } = {}) {
    if (!authClient || typeof authClient.getAccessToken !== "function") {
      throw new TypeError("Cliente de autenticação obrigatório.");
    }
    this.authClient = authClient;
    this.fetchImpl = fetchImpl;
    this.http = new SupabaseHttpClient({ projectUrl, publishableKey, fetchImpl });
  }

  async rpc(name, parameters = {}, options = {}) {
    try {
      const accessToken = await this.authClient.getAccessToken();
      if (!accessToken) {
        const error = new Error("Entre novamente para continuar.");
        error.status = 401;
        error.code = "AUTH_REQUIRED";
        throw error;
      }
      return first(await this.http.rpc(name, parameters, { ...options, accessToken }));
    } catch (error) {
      if (authenticationFailure(error)) {
        await Promise.resolve(this.authClient.clearSession?.()).catch(() => undefined);
        this.authClient.emit?.("SESSION_INVALID");
        error.authRequired = true;
      }
      throw error;
    }
  }

  listCourses({
    query = "",
    limit = 24,
    cursor: cursorValue = null,
    ownerOnly = false
  } = {}) {
    const normalizedQuery = String(query || "").trim();
    if (normalizedQuery.length > 120) throw new TypeError("Busca de Cursos longa demais.");
    const normalizedCursor = cursor(cursorValue, "Cursor de Cursos");
    return this.rpc(ownerOnly ? "list_owned_courses_v1" : "list_courses_v1", {
      p_query: normalizedQuery || null,
      p_limit: positiveInteger(limit, "Limite de Cursos", { maximum: 50 }),
      p_before_updated_at: normalizedCursor?.beforeUpdatedAt || null,
      p_before_id: normalizedCursor?.beforeId || null
    });
  }

  async listCourseReviewItems({ limit = 100, cursor: cursorValue = null } = {}) {
    const normalizedCursor = reviewCursor(cursorValue);
    return normalizeReviewPage(await this.rpc("list_course_review_items_v1", {
      p_limit: positiveInteger(limit, "Limite da fila Rever", { maximum: 100 }),
      p_before_marked_at: normalizedCursor?.beforeMarkedAt || null,
      p_before_course_id: normalizedCursor?.beforeCourseId || null,
      p_before_study_unit_id: normalizedCursor?.beforeStudyUnitId || null
    }));
  }

  getCourse(courseId, { ownerOnly = false } = {}) {
    return this.rpc(ownerOnly ? "get_owned_course_v1" : "get_course_v1", {
      p_course_id: uuid(courseId, "Curso")
    });
  }

  getCourseEntities(courseId, {
    revision,
    cursor: cursorValue = null,
    limit = 500,
    ownerOnly = false
  } = {}) {
    const normalizedCursor = entityCursor(cursorValue);
    return this.rpc(
      ownerOnly ? "list_owned_course_entities_v1" : "list_course_entities_v1",
      {
      p_course_id: uuid(courseId, "Curso"),
      p_expected_revision: positiveInteger(revision, "Versão de estado"),
      p_limit: positiveInteger(limit, "Limite de entidades", { maximum: 1_000 }),
      p_after_entity_type: normalizedCursor?.entityType || null,
      p_after_entity_id: normalizedCursor?.entityId || null
      },
      { timeoutMs: 60_000 }
    );
  }

  async getStudyUnitCitations(courseId, studyUnitId, { expectedRevision } = {}) {
    const normalizedCourseId = uuid(courseId, "Curso");
    const normalizedStudyUnitId = boundedCourseSourceIdentifier(
      studyUnitId,
      "Identidade da Unidade de estudo"
    );
    const normalizedRevision = positiveInteger(expectedRevision, "Versão do Curso");
    let rawResult;
    try {
      rawResult = await this.rpc("get_course_study_citations_v1", {
        p_course_id: normalizedCourseId,
        p_expected_revision: normalizedRevision,
        p_study_unit_id: normalizedStudyUnitId
      });
    } catch (error) {
      if (courseRevisionConflict(error)) throw courseRevisionChangedError(error);
      throw error;
    }
    const result = normalizeCourseStudyCitationsRead(rawResult);
    if (result.courseRevision !== normalizedRevision) {
      throw courseRevisionChangedError();
    }
    if (result.courseId !== normalizedCourseId ||
        result.studyUnitId !== normalizedStudyUnitId) {
      throw new TypeError("As citações não correspondem ao Curso solicitado.");
    }
    return result;
  }

  async getMyCourseAnchoredAnnotations(courseId, value = {}) {
    const normalizedCourseId = uuid(courseId, "Curso");
    const options = anchoredAnnotationReadOptions(value);
    const query = options.query;
    if (query.mode !== "target" || query.hierarchy?.target.kind !== "study_unit" ||
        query.hierarchy.includeDescendants || query.annotationId !== null ||
        query.origins.length || query.channels.length || query.states.length ||
        query.categories.length || query.subjectIds.length || !query.includeUncategorized) {
      throw new TypeError("A leitura de Estudo aceita somente a observação da Unidade atual.");
    }
    const result = await this.rpc("get_my_course_anchored_annotations_v1", {
      p_course_id: normalizedCourseId,
      p_expected_course_revision: options.expectedCourseRevision,
      p_annotation_set_version: options.annotationSetVersion,
      p_target_kind: query.hierarchy.target.kind,
      p_target_id: query.hierarchy.target.id,
      p_cursor: options.cursor,
      p_limit: options.limit
    });
    return boundAnchoredAnnotationPage(result, {
      courseId: normalizedCourseId,
      options
    });
  }

  async executeMyCourseAnchoredAnnotationCommand(value = {}) {
    const mutation = anchoredAnnotationMutation(value);
    if (!new Set([
      "create_anchored_annotation",
      "revise_anchored_annotation",
      "withdraw_anchored_annotation"
    ]).has(mutation.command.type) ||
        mutation.command.type === "create_anchored_annotation" &&
          mutation.command.target.kind !== "study_unit") {
      throw new TypeError("O comando de observação não pertence à experiência de Estudo.");
    }
    const result = await this.rpc("execute_my_course_anchored_annotation_command_v1", {
      p_course_id: mutation.courseId,
      p_expected_course_revision: mutation.expectedCourseRevision,
      p_command: mutation.command,
      p_request_id: mutation.requestId
    });
    return boundAnchoredAnnotationChange(result, mutation, {
      expectedOrigin: "learner",
      expectedChannel: "study_interface"
    });
  }

  async loadPersonalState(courseId) {
    const normalizedCourseId = uuid(courseId, "Curso");
    const result = await this.rpc("load_course_personal_state_v2", {
      p_course_id: normalizedCourseId
    });
    return personalStateEnvelope(result, normalizedCourseId);
  }

  async mutatePersonalState({ courseId, expectedRevision, operations, requestId = createUuid() }) {
    if (!Array.isArray(operations) || operations.length < 1 || operations.length > 512) {
      throw new TypeError("Operações do estado pessoal inválidas.");
    }
    const normalizedOperations = structuredClone(operations);
    for (const operation of normalizedOperations) {
      const kind = operation?.kind;
      const allowed = new Set(kind === "set"
        ? ["kind", "collection", "path", "value"]
        : ["kind", "collection", "path"]);
      if (!operation || typeof operation !== "object" || Array.isArray(operation) ||
          Object.keys(operation).some((field) => !allowed.has(field)) ||
          Object.keys(operation).length !== allowed.size ||
          !new Set(["set", "delete"]).has(kind) ||
          !new Set(["progress.lessons", "reviewMarks"]).has(operation.collection) ||
          typeof operation.path !== "string" || operation.path !== operation.path.trim() ||
          !operation.path || [...operation.path].length > 240 ||
          new TextEncoder().encode(operation.path).byteLength > 960 ||
          hasControlCharacter(operation.path)) {
        throw new TypeError("Operações do estado pessoal inválidas.");
      }
    }
    if (new TextEncoder().encode(JSON.stringify(normalizedOperations)).byteLength > 65_536) {
      throw new TypeError("Operações do estado pessoal excedem o limite.");
    }
    const normalizedCourseId = uuid(courseId, "Curso");
    const normalizedExpectedRevision = positiveInteger(
      expectedRevision,
      "Versão do estado pessoal",
      {
        minimum: 0
      }
    );
    const result = await this.rpc("mutate_course_personal_state_v2", {
      p_course_id: normalizedCourseId,
      p_expected_revision: normalizedExpectedRevision,
      p_operations: normalizedOperations,
      p_request_id: uuid(requestId, "Identidade da alteração")
    });
    return personalStateMutationResult(
      result,
      normalizedCourseId,
      normalizedExpectedRevision
    );
  }

  async executeCourseAction(name, argumentsValue = {}, { headers = {} } = {}) {
    const actionName = String(name || "").trim();
    if (!/^[a-z][A-Za-z0-9]{2,79}$/u.test(actionName)) {
      throw new TypeError("Operação de Curso inválida.");
    }
    const body = plainObject(argumentsValue, "Argumentos da operação");
    try {
      const accessToken = await this.authClient.getAccessToken();
      if (!accessToken) {
        const error = new Error("Entre novamente para continuar.");
        error.status = 401;
        throw error;
      }
      const execute = () => this.http.request(
        `/functions/v1/aralearn-course-api/app/${encodeURIComponent(actionName)}`,
        { method: "POST", body, accessToken, headers, timeoutMs: 60_000 }
      );
      let response;
      try {
        response = await execute();
      } catch (error) {
        if (!courseActionCanBeReplayed(actionName, body) ||
            !transientCourseEdgeFailure(error)) {
          throw error;
        }
        await new Promise((resolve) => globalThis.setTimeout(resolve, COURSE_EDGE_RETRY_DELAY_MS));
        response = await execute();
      }
      return response?.data ?? null;
    } catch (error) {
      if (authenticationFailure(error)) {
        await Promise.resolve(this.authClient.clearSession?.()).catch(() => undefined);
        this.authClient.emit?.("SESSION_INVALID");
        error.authRequired = true;
      }
      throw error;
    }
  }

  loadAuthoringPlan(courseId) {
    return this.executeCourseAction("lerCurso", {
      courseId: uuid(courseId, "Curso"),
      view: "instructional_plan"
    });
  }

  loadCourseDesign(courseId, options = {}) {
    const source = exactObject(
      options,
      new Set(["scope", "limit", "cursor"]),
      "Leitura do desenho"
    );
    const { scope = null, limit = 32, cursor = null } = source;
    const normalizedCourseId = uuid(courseId, "Curso");
    return this.executeCourseAction("lerCurso", {
      courseId: normalizedCourseId,
      view: "course_design",
      scope: courseDesignScope(scope, normalizedCourseId),
      limit: positiveInteger(limit, "Limite de subescopos", { maximum: 64 }),
      cursor: cursor == null ? null : boundedIdentifier(cursor, "Cursor de subescopos")
    });
  }

  async loadCourseSources(courseId, options = {}) {
    const normalizedCourseId = uuid(courseId, "Curso");
    const normalized = courseSourcesReadOptions(options);
    const result = normalizeCourseSourcesRead(await this.executeCourseAction("lerCurso", {
      courseId: normalizedCourseId,
      view: "course_sources",
      ...normalized
    }));
    if (result.courseId !== normalizedCourseId ||
        result.courseRevision !== normalized.expectedRevision ||
        result.mode !== normalized.mode ||
        result.query.sourceId !== normalized.sourceId ||
        result.query.targetKind !== normalized.targetKind ||
        result.query.targetId !== normalized.targetId ||
        result.nextCursor !== null && !SOURCE_CURSOR_PATTERN.test(result.nextCursor) ||
        normalized.mode === "source" && result.items.some(({ sourceId }) =>
          sourceId !== normalized.sourceId) ||
        normalized.mode === "target" && result.items.some(({ targetKind, targetId }) =>
          targetKind !== normalized.targetKind || targetId !== normalized.targetId)) {
      throw new TypeError("A leitura de Fontes não corresponde ao pedido.");
    }
    return result;
  }

  async prepareCourseSourceAttachmentUpload(value = {}) {
    const request = courseSourceAttachmentIdentity(value, {
      operation: "prepare_upload",
      requireSize: true
    });
    return boundCourseSourceAttachmentAccess(
      await this.executeCourseAction("lerCurso", {
        courseId: request.courseId,
        view: "course_source_attachment",
        attachmentOperation: request.operation,
        expectedRevision: request.expectedRevision,
        sourceId: request.sourceId,
        sourceRevision: request.sourceRevision,
        contentHash: request.contentHash,
        byteSize: request.byteSize,
        mediaType: request.mediaType
      }),
      request
    );
  }

  async getCourseSourceAttachmentDownload(value = {}) {
    const request = courseSourceAttachmentIdentity(value, {
      operation: "download"
    });
    return boundCourseSourceAttachmentAccess(
      await this.executeCourseAction("lerCurso", {
        courseId: request.courseId,
        view: "course_source_attachment",
        attachmentOperation: request.operation,
        expectedRevision: request.expectedRevision,
        sourceId: request.sourceId,
        sourceRevision: request.sourceRevision,
        contentHash: request.contentHash
      }),
      request
    );
  }

  async uploadCourseSourcePdf({
    requestId = createUuid(),
    courseId,
    expectedRevision,
    sourceId,
    sourceRevision,
    file
  } = {}) {
    const size = Number(file?.size);
    const mediaType = String(file?.type || "").trim().toLowerCase();
    if (mediaType !== COURSE_SOURCE_PDF_MEDIA_TYPE ||
        !Number.isSafeInteger(size) || size < 1 || size > COURSE_SOURCE_PDF_MAX_BYTES ||
        typeof file?.arrayBuffer !== "function" ||
        !globalThis.crypto?.subtle || typeof this.fetchImpl !== "function") {
      throw new TypeError("Use um PDF de até 20 MiB.");
    }
    const bytes = await file.arrayBuffer();
    if (!(bytes instanceof ArrayBuffer) || bytes.byteLength !== size || !pdfHeaderIsValid(bytes)) {
      throw new TypeError("O arquivo não contém um PDF válido.");
    }
    const contentHash = bytesToHex(await globalThis.crypto.subtle.digest("SHA-256", bytes));
    const access = await this.prepareCourseSourceAttachmentUpload({
      courseId,
      expectedRevision,
      sourceId,
      sourceRevision,
      contentHash,
      byteSize: size,
      mediaType
    });
    if (access.uploadRequired) {
      const accessToken = await this.authClient.getAccessToken();
      if (!accessToken) {
        throw Object.assign(new Error("Entre novamente para continuar."), {
          status: 401,
          code: "AUTH_REQUIRED"
        });
      }
      try {
        await this.http.request(
          `/storage/v1/object/${COURSE_SOURCE_ATTACHMENT_BUCKET}/` +
            courseSourcePdfStoragePath(access.attachment.storagePath),
          {
            method: "POST",
            headers: {
              "Content-Type": mediaType,
              "cache-control": "3600",
              "x-upsert": "false"
            },
            body: file,
            rawBody: true,
            accessToken,
            timeoutMs: 60_000
          }
        );
      } catch (error) {
        if (!storageObjectExists(Number(error?.status || 0), error?.response)) {
          if (authenticationFailure(error)) {
            await Promise.resolve(this.authClient.clearSession?.()).catch(() => undefined);
            this.authClient.emit?.("SESSION_INVALID");
            error.authRequired = true;
          }
          throw error;
        }
      }
    }
    return this.mutateCourseSources({
      requestId,
      courseId,
      expectedRevision,
      sourceCommand: {
        type: "attach_pdf",
        sourceId,
        sourceRevision,
        attachment: access.attachment
      }
    });
  }

  async loadCourseAnchoredAnnotations(courseId, value = {}) {
    const normalizedCourseId = uuid(courseId, "Curso");
    const options = anchoredAnnotationReadOptions(value);
    const query = options.query;
    const result = await this.executeCourseAction("lerCurso", {
      courseId: normalizedCourseId,
      view: "anchored_annotations",
      expectedRevision: options.expectedCourseRevision,
      annotationSetVersion: options.annotationSetVersion,
      mode: query.mode,
      origins: query.origins,
      channels: query.channels,
      states: query.states,
      categories: query.categories,
      includeUncategorized: query.includeUncategorized,
      subjectIds: query.subjectIds,
      ...(query.hierarchy === null
        ? {}
        : {
            targetKind: query.hierarchy.target.kind,
            targetId: query.hierarchy.target.id,
            includeDescendants: query.hierarchy.includeDescendants
          }),
      ...(query.annotationId === null ? {} : { annotationId: query.annotationId }),
      cursor: options.cursor,
      limit: options.limit
    });
    return boundAnchoredAnnotationPage(result, {
      courseId: normalizedCourseId,
      options
    });
  }

  async loadCourseAuditCycle(courseId, value = {}) {
    const normalizedCourseId = uuid(courseId, "Curso");
    const options = auditCycleReadOptions(value);
    const query = options.query;
    const argumentsValue = {
      courseId: normalizedCourseId,
      view: "audit_cycle",
      expectedRevision: options.expectedCourseRevision,
      auditSetVersion: options.auditSetVersion,
      mode: query.mode,
      limit: options.limit
    };
    if (query.mode === "context") {
      argumentsValue.targetStudyUnitId = query.targetStudyUnitId;
      argumentsValue.annotationIds = query.annotationIds;
    } else if (query.mode === "findings") {
      if (query.targetStudyUnitId !== null) {
        argumentsValue.targetStudyUnitId = query.targetStudyUnitId;
      }
      argumentsValue.states = query.states;
      argumentsValue.dimensions = query.dimensions;
      argumentsValue.severities = query.severities;
      argumentsValue.cursor = options.cursor;
    } else if (query.mode === "runs") {
      if (query.targetStudyUnitId !== null) {
        argumentsValue.targetStudyUnitId = query.targetStudyUnitId;
      }
      argumentsValue.cursor = options.cursor;
    } else if (query.findingId !== null) {
      argumentsValue.findingId = query.findingId;
      if (query.correctionId !== null) {
        argumentsValue.correctionId = query.correctionId;
      }
    } else {
      argumentsValue.auditRunId = query.auditRunId;
    }
    const result = await this.executeCourseAction("lerCurso", argumentsValue);
    return boundAuditCyclePage(result, {
      courseId: normalizedCourseId,
      options
    });
  }

  async loadCourseVariantComparison(courseId, value = {}) {
    const normalizedCourseId = uuid(courseId, "Curso");
    const options = normalizeCourseVariantRead(exactObject(
      value,
      new Set(["comparisonSetId", "expectedCourseRevision"]),
      "Leitura de variantes"
    ));
    const result = normalizeCourseVariantComparison(await this.executeCourseAction("lerCurso", {
      courseId: normalizedCourseId,
      view: "variant_comparison",
      comparisonSetId: options.comparisonSetId,
      expectedRevision: options.expectedCourseRevision
    }));
    if (result.comparisonSetId !== options.comparisonSetId ||
        result.source.courseId !== normalizedCourseId ||
        result.source.currentCourseRevision !== options.expectedCourseRevision) {
      throw new TypeError("A comparação de variantes não corresponde ao pedido.");
    }
    return result;
  }

  async listCourseVariantComparisons(courseId, expectedCourseRevision) {
    const normalizedCourseId = uuid(courseId, "Curso");
    const revision = positiveInteger(expectedCourseRevision, "Versão do Curso");
    const result = normalizeCourseVariantComparisonList(await this.executeCourseAction("lerCurso", {
      courseId: normalizedCourseId,
      view: "variant_comparisons",
      expectedRevision: revision
    }));
    if (result.sourceCourseId !== normalizedCourseId || result.sourceCourseRevision !== revision) {
      throw new TypeError("A lista de variantes não corresponde ao Curso solicitado.");
    }
    return result;
  }

  async loadCourseAuthoringAnalytics(courseId, value = {}) {
    const normalizedCourseId = uuid(courseId, "Curso");
    const source = exactObject(
      value,
      new Set(["expectedCourseRevision", "query"]),
      "Leitura de Pesquisa"
    );
    const normalizedQuery = normalizeCourseAuthoringAnalyticsQuery(source.query ?? {});
    const expectedRevision = positiveInteger(
      source.expectedCourseRevision,
      "Versão do Curso"
    );
    const result = normalizeCourseAuthoringAnalyticsPage(
      await this.executeCourseAction("lerCurso", {
        courseId: normalizedCourseId,
        view: "research",
        expectedRevision,
        datasets: normalizedQuery.datasets,
        channels: normalizedQuery.channels,
        origins: normalizedQuery.origins,
        states: normalizedQuery.states,
        from: normalizedQuery.from,
        to: normalizedQuery.to,
        limit: normalizedQuery.limit,
        cursor: normalizedQuery.cursor
      }),
      { expectedCourseId: normalizedCourseId, expectedQuery: normalizedQuery }
    );
    if (result.courseRevision !== expectedRevision) {
      throw new TypeError("A página de Pesquisa não corresponde ao Curso solicitado.");
    }
    return result;
  }

  loadAuthoringOutline(courseId) {
    return this.executeCourseAction("lerCurso", {
      courseId: uuid(courseId, "Curso"),
      view: "outline"
    });
  }

  loadAuthoringStudyUnits(courseId, {
    expectedRevision,
    scope = { kind: "course", id: null },
    inspectionFocusId = null,
    anchorStudyUnitId = null,
    cursor: cursorValue = null,
    direction = "forward",
    limit = 12,
    maxBytes = 512 * 1024
  } = {}) {
    const normalizedScope = authoringInspectionScope(scope);
    const normalizedInspectionFocusId = inspectionFocusId == null
      ? null
      : uuid(inspectionFocusId, "Foco de inspeção");
    const normalizedCursor = authoringStudyUnitCursor(cursorValue);
    const normalizedAnchor = anchorStudyUnitId == null
      ? null
      : boundedIdentifier(anchorStudyUnitId, "Unidade de âncora");
    const normalizedDirection = String(direction || "").trim();
    if (!new Set(["forward", "backward"]).has(normalizedDirection) ||
        (normalizedAnchor && normalizedCursor) ||
        normalizedInspectionFocusId !== null && (
          normalizedScope.kind !== "course" || normalizedScope.id !== null || normalizedAnchor !== null
        )) {
      throw new TypeError("Paginação da inspeção inválida.");
    }
    return this.executeCourseAction("lerCurso", {
      courseId: uuid(courseId, "Curso"),
      view: "study_units",
      expectedRevision: positiveInteger(expectedRevision, "Versão do Curso"),
      ...(normalizedInspectionFocusId === null
        ? { scope: normalizedScope, anchorStudyUnitId: normalizedAnchor }
        : { inspectionFocusId: normalizedInspectionFocusId }),
      cursor: normalizedCursor,
      direction: normalizedDirection,
      limit: positiveInteger(limit, "Limite da inspeção", { maximum: 24 }),
      maxBytes: positiveInteger(maxBytes, "Limite de bytes", {
        minimum: 64 * 1024,
        maximum: 1_500_000
      })
    }, {
      headers: {
        Accept: "application/vnd.aralearn.course-study-unit-inspection.v2+json"
      }
    });
  }

  loadPartMaterialization(courseId, authoringPartId, materializationId) {
    return this.executeCourseAction("lerCurso", {
      courseId: uuid(courseId, "Curso"),
      view: "part_materialization",
      authoringPartId: uuid(authoringPartId, "Parte de autoria"),
      materializationId: uuid(materializationId, "Materialização")
    });
  }

  createCourse({
    requestId = createUuid(),
    title,
    objective
  } = {}) {
    return this.executeCourseAction("criarCurso", {
      requestId: uuid(requestId, "Identidade da criação"),
      title: requiredText(title, "Título do Curso", 300),
      objective: requiredText(objective, "Objetivo do Curso", 2_000)
    });
  }

  async commitCourseComposition(value = {}) {
    const command = normalizeFocalStudyUnitCompositionCommand(value);
    const { id: studyUnitId, position, ...content } = command.studyUnit;
    const result = await this.executeCourseAction("alterarCurso", {
      requestId: command.requestId,
      courseId: command.courseId,
      expectedRevision: command.expectedCourseRevision,
      expectedStudyUnitVersion: command.expectedStudyUnitVersion,
      operation: "commit_course_composition",
      upserts: [{
        entityType: "study_unit",
        entityId: studyUnitId,
        parentType: "microsequence",
        parentId: command.didacticMicrosequenceId,
        position,
        content
      }],
      deletes: [],
      sourceAttributionApplications: [{
        studyUnitId,
        sourceLinks: command.sourceLinks
      }],
      applicationOrigin: command.origin
    });
    return normalizeFocalStudyUnitCompositionReceipt(result, command);
  }

  async commitCourseStructuralComposition(value = {}) {
    const source = exactObject(value, new Set([
      "requestId", "courseId", "expectedRevision", "upserts", "deletes",
      "sourceAttributionApplications"
    ]), "Alteração estrutural assistida");
    const upserts = Array.isArray(source.upserts) ? structuredClone(source.upserts) : null;
    const deletes = Array.isArray(source.deletes) ? structuredClone(source.deletes) : null;
    if (!upserts || !deletes || !upserts.length && !deletes.length ||
        upserts.length > 200 || deletes.length > 200) {
      throw new TypeError("Alteração estrutural assistida inválida.");
    }
    const bounded = boundedJsonObject({ upserts, deletes }, "Alteração estrutural assistida", 480 * 1024);
    const requestId = requestIdentity(source.requestId);
    const result = await this.executeCourseAction("alterarCurso", {
      requestId,
      courseId: uuid(source.courseId, "Curso"),
      expectedRevision: positiveInteger(source.expectedRevision, "Versão do Curso"),
      operation: "commit_course_composition",
      upserts: bounded.upserts,
      deletes: bounded.deletes,
      sourceAttributionApplications: normalizeSourceAttributionApplications(
        source.sourceAttributionApplications
      )
    });
    return {
      ...result,
      requestId: result?.requestId || requestId,
      courseRevision: Number(result?.courseRevision ?? result?.revision)
    };
  }

  async commitPersonalCourseCopyEdit(value = {}) {
    const command = normalizePersonalCourseCopyEditCommand(value);
    let result;
    try {
      result = await this.executeCourseAction("criarCopiaPessoalDoCurso", {
        requestId: command.requestId,
        sourceCourseId: command.sourceCourseId,
        expectedSourceCourseRevision: command.expectedSourceCourseRevision,
        expectedStudyUnitVersion: command.expectedStudyUnitVersion,
        didacticMicrosequenceId: command.didacticMicrosequenceId,
        studyUnit: command.studyUnit,
        applicationOrigin: command.origin
      });
    } catch (error) {
      if (String(error?.code || "").toLowerCase() === "personal_copy_exists") {
        const candidate = String(
          error?.details?.targetCourseId ??
          error?.response?.details?.targetCourseId ??
          error?.response?.error?.details?.targetCourseId ?? ""
        ).trim().toLowerCase();
        if (UUID_PATTERN.test(candidate)) error.targetCourseId = candidate;
      }
      throw error;
    }
    return normalizePersonalCourseCopyEditReceipt(result, command);
  }

  mutateAuthoringPlan({
    requestId = createUuid(),
    courseId,
    expectedRevision,
    expectedPlanVersion,
    planCommand
  } = {}) {
    return this.executeCourseAction("alterarCurso", {
      requestId: uuid(requestId, "Identidade da alteração"),
      courseId: uuid(courseId, "Curso"),
      expectedRevision: positiveInteger(expectedRevision, "Versão de estado"),
      expectedPlanVersion: positiveInteger(expectedPlanVersion, "Versão do plano"),
      operation: "update_instructional_plan",
      planCommand: normalizeCourseAuthoringPlanCommand(
        plainObject(planCommand, "Comando do plano")
      )
    });
  }

  mutateCourseDesign(value = {}) {
    const source = exactObject(
      value,
      new Set(["requestId", "courseId", "expectedRevision", "designCommand"]),
      "Alteração do desenho"
    );
    const {
      requestId = createUuid(),
      courseId,
      expectedRevision,
      designCommand
    } = source;
    return this.executeCourseAction("alterarCurso", {
      requestId: requestIdentity(requestId),
      courseId: uuid(courseId, "Curso"),
      expectedRevision: positiveInteger(expectedRevision, "Versão de estado"),
      operation: "update_course_design",
      designCommand: boundedJsonObject(
        normalizeCourseDesignCommand(designCommand),
        "Comando dos parâmetros",
        32 * 1024
      )
    });
  }

  async mutateCourseSources(value = {}) {
    const source = exactObject(
      value,
      new Set(["requestId", "courseId", "expectedRevision", "sourceCommand"]),
      "Alteração de Fontes"
    );
    const requestId = requestIdentity(source.requestId ?? createUuid());
    const courseId = uuid(source.courseId, "Curso");
    const expectedRevision = positiveInteger(source.expectedRevision, "Versão de estado");
    const sourceCommand = normalizeCourseSourceCommand(source.sourceCommand);
    const result = normalizeCourseSourceChange(await this.executeCourseAction("alterarCurso", {
      requestId,
      courseId,
      expectedRevision,
      operation: "update_course_sources",
      sourceCommand
    }));
    if (result.courseId !== courseId || result.requestId !== requestId ||
        result.courseRevision !== expectedRevision + (result.changed ? 1 : 0) ||
        result.change != null && (
          result.change.type !== sourceCommand.type ||
          result.change.subjectId !== courseSourceCommandSubjectId(sourceCommand)
        )) {
      throw new TypeError("A confirmação de Fontes não corresponde ao comando.");
    }
    return result;
  }

  async mutateCourseAnchoredAnnotations(value = {}) {
    const mutation = anchoredAnnotationMutation(value);
    const result = await this.executeCourseAction("alterarCurso", {
      requestId: mutation.requestId,
      courseId: mutation.courseId,
      ...(mutation.expectedCourseRevision === null
        ? {}
        : { expectedRevision: mutation.expectedCourseRevision }),
      operation: "update_anchored_annotations",
      annotationCommand: mutation.command
    });
    return boundAnchoredAnnotationChange(result, mutation, {
      expectedOrigin: "author",
      expectedChannel: "authoring_interface"
    });
  }

  async mutateCourseAuditCycle(value = {}) {
    const mutation = auditCycleMutation(value);
    const result = await this.executeCourseAction("alterarCurso", {
      requestId: mutation.requestId,
      courseId: mutation.courseId,
      expectedRevision: mutation.expectedCourseRevision,
      operation: "update_audit_cycle",
      auditCommand: mutation.command
    });
    return boundAuditCycleChange(result, mutation);
  }

  async mutateCourseVariants(value = {}) {
    const source = exactObject(value, new Set([
      "requestId", "courseId", "expectedCourseRevision", "command"
    ]), "Alteração de variantes");
    const requestId = requestIdentity(source.requestId ?? createUuid());
    const courseId = uuid(source.courseId, "Curso");
    const command = source.command?.type === "create_comparison_variants"
      ? normalizeCourseVariantCommand(source.command)
      : normalizeCourseVariantDetachCommand(source.command);
    if (command.type === "create_comparison_variants" &&
        source.expectedCourseRevision !== command.expectedCourseRevision) {
      throw new TypeError("A revisão da variante não corresponde ao invólucro.");
    }
    if (command.type === "detach_comparison_variant" &&
        source.expectedCourseRevision !== undefined && source.expectedCourseRevision !== null) {
      throw new TypeError("A desvinculação não recebe revisão de Curso.");
    }
    const result = normalizeCourseVariantChange(await this.executeCourseAction("alterarCurso", {
      requestId,
      courseId,
      ...(command.type === "create_comparison_variants"
        ? { expectedRevision: command.expectedCourseRevision }
        : {}),
      operation: "update_course_variants",
      variantCommand: command
    }));
    if (result.sourceCourseId !== courseId ||
        result.comparisonSetId !== command.comparisonSetId ||
        command.type === "create_comparison_variants" &&
          result.members.length !== command.variants.length ||
        command.type === "detach_comparison_variant" && result.courseId !== command.courseId) {
      throw new TypeError("A confirmação de variantes não corresponde ao comando.");
    }
    return result;
  }

  advanceAuthoringPartMaterialization({
    requestId = createUuid(),
    courseId,
    expectedRevision,
    materializationCommand
  } = {}) {
    return this.executeCourseAction("alterarCurso", {
      requestId: uuid(requestId, "Identidade da alteração"),
      courseId: uuid(courseId, "Curso"),
      expectedRevision: positiveInteger(expectedRevision, "Versão de estado"),
      operation: "advance_part_materialization",
      materializationCommand: normalizedMaterializationCommand(materializationCommand)
    });
  }

  getPersonProfile() {
    return this.executeCourseAction("gerirPessoas", {
      operation: "read_profile"
    });
  }

  updatePersonProfile(patch) {
    const normalized = plainObject(patch, "Alteração de perfil");
    const allowed = new Set(["displayName", "avatarObjectKey"]);
    if (!Object.keys(normalized).length ||
        Object.keys(normalized).some((field) => !allowed.has(field))) {
      throw new TypeError("Alteração de perfil inválida.");
    }
    return this.executeCourseAction("gerirPessoas", {
      operation: "update_profile",
      ...normalized
    });
  }

  listCourseAccess(courseId) {
    return this.executeCourseAction("gerirPessoas", {
      operation: "list_access",
      courseId: uuid(courseId, "Curso")
    });
  }

  grantCourseAccess({
    courseId,
    email,
    confirmed,
    requestId = createUuid()
  } = {}) {
    const normalizedEmail = String(email || "").trim().toLowerCase();
    if (confirmed !== true || normalizedEmail.length > 254 ||
        !/^[^\s@]+@[^\s@]+$/u.test(normalizedEmail)) {
      throw new TypeError("Concessão de acesso inválida.");
    }
    return this.executeCourseAction("gerirPessoas", {
      operation: "grant_access",
      courseId: uuid(courseId, "Curso"),
      email: normalizedEmail,
      confirmed: true,
      requestId: uuid(requestId, "Identidade da alteração")
    });
  }

  revokeCourseAccess({
    courseId,
    userId,
    confirmed,
    requestId = createUuid()
  } = {}) {
    if (confirmed !== true) throw new TypeError("Revogação de acesso inválida.");
    return this.executeCourseAction("gerirPessoas", {
      operation: "revoke_access",
      courseId: uuid(courseId, "Curso"),
      userId: uuid(userId, "Pessoa"),
      confirmed: true,
      requestId: uuid(requestId, "Identidade da alteração")
    });
  }

  async maintainCourse({
    courseId,
    operation,
    confirmed,
    requestId = createUuid()
  } = {}) {
    const normalizedOperation = String(operation || "").trim();
    if (confirmed !== true || !new Set([
      "delete_owned_course", "leave_shared_course"
    ]).has(normalizedOperation)) {
      throw new TypeError("Operação de ciclo de vida do Curso inválida.");
    }
    const normalizedCourseId = uuid(courseId, "Curso");
    const normalizedRequestId = requestIdentity(requestId);
    const result = await this.executeCourseAction("manterCursos", {
      courseId: normalizedCourseId,
      operation: normalizedOperation,
      confirmed: true,
      requestId: normalizedRequestId
    });
    if (!result || typeof result !== "object" || Array.isArray(result) ||
        result.contract !== "aralearn.course-lifecycle.v1" ||
        result.courseId !== normalizedCourseId ||
        result.operation !== normalizedOperation ||
        result.requestId !== normalizedRequestId ||
        typeof result.changed !== "boolean" ||
        typeof result.fileCleanupPending !== "boolean" ||
        !new Set(["completed", "already_absent"]).has(result.status)) {
      throw new TypeError("A confirmação do ciclo de vida do Curso é inválida.");
    }
    return structuredClone(result);
  }

  loadCurrentMaintenance({ limit = 100 } = {}) {
    return this.executeCourseAction("manterAraLearn", {
      operation: "inspect",
      limit: positiveInteger(limit, "Limite da Manutenção", { maximum: 500 })
    });
  }

  executeCurrentMaintenance({
    operation,
    limit = null,
    classification = null,
    objectPath = null,
    confirmed
  } = {}) {
    const normalizedOperation = String(operation || "").trim();
    if (confirmed !== true || !new Set([
      "run_retention", "remove_orphan_object"
    ]).has(normalizedOperation)) {
      throw new TypeError("Ação de Manutenção inválida.");
    }
    if (normalizedOperation === "run_retention") {
      return this.executeCourseAction("manterAraLearn", {
        operation: normalizedOperation,
        limit: positiveInteger(limit, "Limite da retenção", { maximum: 1000 }),
        confirmed: true
      });
    }
    const normalizedClassification = String(classification || "").trim();
    const normalizedPath = String(objectPath || "").trim();
    if (!new Set([
      "avatar_owner_missing", "avatar_profile_unlinked",
      "pdf_course_missing", "pdf_unlinked"
    ]).has(normalizedClassification) || !normalizedPath || normalizedPath.length > 500) {
      throw new TypeError("Resíduo de Manutenção inválido.");
    }
    return this.executeCourseAction("manterAraLearn", {
      operation: normalizedOperation,
      classification: normalizedClassification,
      objectPath: normalizedPath,
      confirmed: true
    });
  }

  async uploadAvatar(file, { objectId = createUuid() } = {}) {
    const size = Number(file?.size);
    const contentType = String(file?.type || "").trim().toLowerCase();
    const extension = AVATAR_EXTENSIONS[contentType];
    const userId = uuid(this.authClient.getSession?.()?.user?.id, "Pessoa");
    if (!extension || !Number.isSafeInteger(size) || size < 1 || size > AVATAR_MAX_BYTES) {
      throw new TypeError("Use uma imagem JPEG, PNG ou WebP de até 512 KiB.");
    }
    const objectKey = `${userId}/${uuid(objectId, "Identidade do avatar")}.${extension}`;
    const accessToken = await this.authClient.getAccessToken();
    if (!accessToken) {
      const error = new Error("Entre novamente para continuar.");
      error.status = 401;
      error.code = "AUTH_REQUIRED";
      throw error;
    }
    try {
      await this.http.request(
        `/storage/v1/object/${AVATAR_BUCKET}/${storageObjectPath(objectKey)}`,
        {
          method: "POST",
          body: file,
          rawBody: true,
          accessToken,
          headers: {
            "Content-Type": contentType,
            "x-upsert": "false"
          }
        }
      );
      return { objectKey, contentType, size };
    } catch (error) {
      if (authenticationFailure(error)) {
        await Promise.resolve(this.authClient.clearSession?.()).catch(() => undefined);
        this.authClient.emit?.("SESSION_INVALID");
        error.authRequired = true;
      }
      throw error;
    }
  }

  async loadAvatar(objectKey) {
    const accessToken = await this.authClient.getAccessToken();
    if (!accessToken) throw Object.assign(new Error("Entre novamente para continuar."), {
      status: 401,
      code: "AUTH_REQUIRED"
    });
    return this.http.request(
      `/storage/v1/object/authenticated/${AVATAR_BUCKET}/${storageObjectPath(objectKey)}`,
      { accessToken, responseType: "blob" }
    );
  }

  async deleteOwnAvatar(objectKey) {
    const normalized = String(objectKey || "").trim().toLowerCase();
    const userId = uuid(this.authClient.getSession?.()?.user?.id, "Pessoa");
    storageObjectPath(normalized);
    if (!normalized.startsWith(`${userId}/`)) {
      throw new TypeError("Somente o próprio avatar pode ser removido.");
    }
    const accessToken = await this.authClient.getAccessToken();
    if (!accessToken) throw Object.assign(new Error("Entre novamente para continuar."), {
      status: 401,
      code: "AUTH_REQUIRED"
    });
    return this.http.request(`/storage/v1/object/${AVATAR_BUCKET}`, {
      method: "DELETE",
      body: { prefixes: [normalized] },
      accessToken
    });
  }

  async deleteMyAccount({ confirmation } = {}) {
    if (confirmation !== "EXCLUIR MINHA CONTA") {
      throw new TypeError("A confirmação de exclusão da conta é inválida.");
    }
    let result;
    try {
      result = await this.executeCourseAction("excluirMinhaConta", { confirmation });
    } catch (error) {
      if (!accountDeletionMayBeAmbiguous(error)) throw error;
      if (error?.code === "account_deletion_in_progress") throw error;
      throw accountDeletionInProgressError(error);
    }
    if (!result || typeof result !== "object" || Array.isArray(result) ||
        Object.keys(result).length !== 2 ||
        result.contract !== "aralearn.account-deletion.v1" || result.status !== "deleted") {
      throw accountDeletionInProgressError(
        new TypeError("A confirmação de exclusão da conta é inválida.")
      );
    }
    return structuredClone(result);
  }
}
