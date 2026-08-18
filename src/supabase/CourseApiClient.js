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
  normalizeCourseVariantDetachCommand,
  normalizeCourseVariantRead
} from "../domain/courseVariants.js";
import { normalizeCourseDesignCommand } from "../domain/courseDesignParameters.js";
import {
  normalizeCourseSourceAttributionApplication,
  normalizeCourseSourceChange,
  normalizeCourseSourceCommand,
  normalizeCourseSourcesRead,
  normalizeCourseStudyCitationsRead
} from "../domain/courseSources.js";
import { SupabaseHttpClient } from "./SupabaseHttpClient.js";

const RFC3339 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/u;
const REQUEST_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/u;
const SOURCE_CURSOR_PATTERN = /^[A-Za-z0-9+/_-]+={0,2}$/u;
const AVATAR_BUCKET = "person-avatars";
const AVATAR_MAX_BYTES = 512 * 1024;
const AVATAR_EXTENSIONS = Object.freeze({
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp"
});
const AVATAR_OBJECT_KEY = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(?:jpg|png|webp)$/u;

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
  return command.type === "save_source" || command.type === "retire_source"
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

  async executeCourseAction(name, argumentsValue = {}) {
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
      const response = await this.http.request(
        `/functions/v1/aralearn-course-api/app/${encodeURIComponent(actionName)}`,
        { method: "POST", body, accessToken, timeoutMs: 60_000 }
      );
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

  loadAuthoringOutline(courseId) {
    return this.executeCourseAction("lerCurso", {
      courseId: uuid(courseId, "Curso"),
      view: "outline"
    });
  }

  loadAuthoringStudyUnits(courseId, {
    expectedRevision,
    scope = { kind: "course", id: null },
    anchorStudyUnitId = null,
    cursor: cursorValue = null,
    direction = "forward",
    limit = 12,
    maxBytes = 512 * 1024
  } = {}) {
    const normalizedScope = authoringInspectionScope(scope);
    const normalizedCursor = authoringStudyUnitCursor(cursorValue);
    const normalizedAnchor = anchorStudyUnitId == null
      ? null
      : boundedIdentifier(anchorStudyUnitId, "Unidade de âncora");
    const normalizedDirection = String(direction || "").trim();
    if (!new Set(["forward", "backward"]).has(normalizedDirection) ||
        (normalizedAnchor && normalizedCursor)) {
      throw new TypeError("Paginação da inspeção inválida.");
    }
    return this.executeCourseAction("lerCurso", {
      courseId: uuid(courseId, "Curso"),
      view: "study_units",
      expectedRevision: positiveInteger(expectedRevision, "Versão do Curso"),
      scope: normalizedScope,
      anchorStudyUnitId: normalizedAnchor,
      cursor: normalizedCursor,
      direction: normalizedDirection,
      limit: positiveInteger(limit, "Limite da inspeção", { maximum: 24 }),
      maxBytes: positiveInteger(maxBytes, "Limite de bytes", {
        minimum: 64 * 1024,
        maximum: 1_500_000
      })
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
    if (command.type === "detach_course_variant" &&
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
        command.type === "detach_course_variant" && result.courseId !== command.courseId) {
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
    const userId = uuid(this.authClient.getSession?.()?.user?.id, "Pessoa");
    const accessToken = await this.authClient.getAccessToken();
    if (!accessToken) throw Object.assign(new Error("Entre novamente para continuar."), {
      status: 401,
      code: "AUTH_REQUIRED"
    });
    const objectKeys = [];
    for (let offset = 0; offset < 1_000; offset += 100) {
      const items = await this.http.request(`/storage/v1/object/list/${AVATAR_BUCKET}`, {
        method: "POST",
        body: {
          prefix: `${userId}/`,
          limit: 100,
          offset,
          sortBy: { column: "name", order: "asc" }
        },
        accessToken
      });
      if (!Array.isArray(items)) throw new TypeError("A listagem de avatares é inválida.");
      for (const item of items) {
        const name = String(item?.name || "").trim().toLowerCase();
        const objectKey = name.includes("/") ? name : `${userId}/${name}`;
        if (AVATAR_OBJECT_KEY.test(objectKey)) objectKeys.push(objectKey);
      }
      if (items.length < 100) break;
      if (offset === 900) {
        throw new Error("A conta possui objetos demais para exclusão segura automática.");
      }
    }
    for (let index = 0; index < objectKeys.length; index += 100) {
      await this.http.request(`/storage/v1/object/${AVATAR_BUCKET}`, {
        method: "DELETE",
        body: { prefixes: objectKeys.slice(index, index + 100) },
        accessToken
      });
    }
    return this.rpc("delete_my_account_v1", {
      p_confirmation: confirmation
    }, { timeoutMs: 60_000 });
  }
}
