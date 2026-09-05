import { createUuid, UUID_PATTERN } from "../domain/identifiers.js";
import {
  normalizeCourseAnchoredAnnotationChange,
  normalizeCourseAnchoredAnnotationCommand,
  normalizeCourseAnchoredAnnotationPage,
  normalizeCourseAnchoredAnnotationQuery,
  normalizeCourseAnchoredAnnotationReadOptions
} from "../domain/courseAnchoredAnnotations.js";
import {
  normalizeCourseAuthoringAnalyticsPage,
  normalizeCourseAuthoringAnalyticsQuery
} from "../domain/courseAuthoringAnalytics.js";
import { normalizeCourseDesignCommand } from "../domain/courseDesignParameters.js";
import {
  normalizeAuthoringProfileList, normalizeAuthoringProfileSave, normalizeAuthoringProfileDelete,
  normalizeAuthoringProfileChange, normalizeCourseAuthoringProfileRequest, normalizeCourseAuthoringProfilePreview,
  normalizeCourseAuthoringProfileChange
} from "../domain/authoringProfiles.js";
import {
  normalizeFocalStudyUnitCompositionCommand,
  normalizeFocalStudyUnitCompositionReceipt,
  normalizeCourseMetadata,
  normalizeOwnedCourseCopyRecoveryCommand,
  normalizeOwnedCourseCopyRecoveryReceipt
} from "../domain/courseComposition.js";
import {
  COURSE_SOURCE_PDF_MAX_BYTES,
  COURSE_SOURCE_PDF_MEDIA_TYPE,
  COURSE_SOURCE_CHANGE_CONTRACT,
  normalizeCourseSourcePdfDownload,
  normalizeCourseSourcePdfIngestion,
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
const AVATAR_MAX_BYTES = 512 * 1024;
const AVATAR_EXTENSIONS = Object.freeze({
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp"
});
const AVATAR_OBJECT_KEY = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(?:jpg|png|webp)$/u;
const COURSE_EDGE_RETRY_DELAY_MS = 750;
const COURSE_EDGE_TRANSIENT_STATUSES = new Set([502, 503, 504]);
const COURSE_SOURCE_PDF_TIMEOUT_MS = 145_000;

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
  "course", "module", "lesson", "didactic_microsequence", "study_unit"
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
    command.type === "remove_pdf"
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
    : boundedCourseSourceIdentifier(source.sourceId, "Identidade da Fonte");
  const targetKind = source.targetKind == null ? null : String(source.targetKind).trim();
  const targetId = source.targetId == null
    ? null
    : boundedCourseSourceIdentifier(source.targetId, "Identidade do alvo");
  const cursor = source.cursor == null ? null : String(source.cursor).trim();
  const limit = source.limit == null
    ? mode === "catalog" ? 10 : 1
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
      (mode !== "catalog" && (cursor !== null || limit !== 1)) ||
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

function courseSourcePdfDownloadIdentity(value = {}) {
  const source = exactObject(value, new Set([
    "courseId", "expectedRevision", "sourceId", "sourceRevision", "contentHash"
  ]), "Download do PDF de Fonte");
  const normalized = {
    courseId: uuid(source.courseId, "Curso"),
    expectedRevision: positiveInteger(source.expectedRevision, "Versão do Curso"),
    sourceId: boundedCourseSourceIdentifier(source.sourceId, "Identidade da Fonte"),
    sourceRevision: positiveInteger(source.sourceRevision, "Revisão da Fonte"),
    contentHash: String(source.contentHash || "").trim().toLowerCase()
  };
  if (!SHA256_PATTERN.test(normalized.contentHash)) {
    throw new TypeError("Download do PDF de Fonte inválido.");
  }
  return normalized;
}

function boundCourseSourcePdfDownload(value, request) {
  const download = normalizeCourseSourcePdfDownload(value);
  if (download.courseId !== request.courseId ||
      download.courseRevision !== request.expectedRevision ||
      download.sourceId !== request.sourceId ||
      download.sourceRevision !== request.sourceRevision ||
      download.attachment.contentHash !== request.contentHash) {
    throw new TypeError("O download do PDF não corresponde ao pedido.");
  }
  return download;
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

function courseRequestCanBeReplayed(method, body) {
  return method === "GET" ||
    typeof body?.requestId === "string" && REQUEST_ID_PATTERN.test(body.requestId);
}

function courseApiPath(pathname, query = null) {
  const path = String(pathname || "");
  if (!/^\/v[12]\//u.test(path) && path !== "/app/excluirMinhaConta") {
    throw new TypeError("Rota de Curso inválida.");
  }
  const params = new URLSearchParams();
  if (query !== null) {
    const source = plainObject(query, "Consulta da rota de Curso");
    for (const [name, value] of Object.entries(source)) {
      if (value == null || value === "") continue;
      if (Array.isArray(value)) {
        value.forEach((item) => params.append(name, String(item)));
      } else {
        params.set(name, String(value));
      }
    }
  }
  const suffix = params.toString();
  return `/functions/v1/aralearn-course-api${path}${suffix ? `?${suffix}` : ""}`;
}

function courseResourcePath(courseId, suffix = "") {
  return `/v1/courses/${encodeURIComponent(uuid(courseId, "Curso"))}${suffix}`;
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

function personHandle(value, { prefix = false } = {}) {
  const raw = typeof value === "string" ? value.trim().replace(/^@/u, "") : "";
  const normalized = raw.toLowerCase();
  if (!/^[A-Za-z0-9._-]+$/u.test(raw) || normalized.length < (prefix ? 2 : 3) || normalized.length > 30 ||
      !(prefix ? /^[a-z0-9][a-z0-9._-]*$/u : /^[a-z0-9][a-z0-9._-]*[a-z0-9]$/u).test(normalized)) {
    throw new TypeError("Identificador público inválido.");
  }
  return normalized;
}

export class CourseApiClient {
  constructor({ projectUrl, publishableKey, authClient, visitor = false, fetchImpl = globalThis.fetch } = {}) {
    if (!authClient || typeof authClient.getAccessToken !== "function") {
      throw new TypeError("Cliente de autenticação obrigatório.");
    }
    this.authClient = authClient;
    this.visitor = visitor === true;
    this.fetchImpl = fetchImpl;
    this.http = new SupabaseHttpClient({ projectUrl, publishableKey, fetchImpl });
  }

  #authenticatedAccessToken() {
    if (this.visitor) throw Object.assign(new Error("Entre para realizar esta operação."), {
      code: "AUTH_REQUIRED", status: 401
    });
    return this.authClient.getAccessToken();
  }

  async rpc(name, parameters = {}, options = {}) {
    const publicRead = this.visitor && new Set([
      "list_courses_v1", "get_course_v1", "list_course_entities_v1",
      "get_course_study_citations_v1"
    ]).has(name);
    if (this.visitor && !publicRead) throw Object.assign(
      new Error("Entre para realizar esta operação."), { code: "AUTH_REQUIRED", status: 401 }
    );
    try {
      const accessToken = publicRead ? null : await this.#authenticatedAccessToken();
      if (!accessToken && !publicRead) {
        const error = new Error("Entre novamente para continuar.");
        error.status = 401;
        error.code = "AUTH_REQUIRED";
        throw error;
      }
      return first(await this.http.rpc(name, parameters, { ...options, accessToken }));
    } catch (error) {
      if (!this.visitor && authenticationFailure(error)) {
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

  async requestCourseApi(pathname, {
    method = "GET",
    query = null,
    body = null,
    headers = {},
    timeoutMs = 60_000
  } = {}) {
    const normalizedMethod = String(method || "").toUpperCase();
    if (!new Set(["GET", "POST", "PATCH", "DELETE"]).has(normalizedMethod)) {
      throw new TypeError("Método da rota de Curso inválido.");
    }
    const normalizedBody = body === null ? null : plainObject(body, "Corpo da rota de Curso");
    if (normalizedMethod === "GET" && normalizedBody !== null) {
      throw new TypeError("Leitura de Curso não aceita corpo.");
    }
    const requestHeaders = { ...headers };
    if (typeof normalizedBody?.requestId === "string") {
      requestHeaders["Idempotency-Key"] = requestIdentity(normalizedBody.requestId);
    }
    const publicRead = this.visitor && normalizedMethod === "GET" &&
      /^\/v1\/courses\/[0-9a-f-]{36}\/source-pdf\/download$/u.test(pathname);
    if (this.visitor && !publicRead) throw Object.assign(
      new Error("Entre para realizar esta operação."), { code: "AUTH_REQUIRED", status: 401 }
    );
    try {
      const accessToken = publicRead ? null : await this.#authenticatedAccessToken();
      if (!accessToken && !publicRead) {
        const error = new Error("Entre novamente para continuar.");
        error.status = 401;
        throw error;
      }
      const execute = () => this.http.request(
        courseApiPath(pathname, query),
        {
          method: normalizedMethod,
          ...(normalizedBody === null ? {} : { body: normalizedBody }),
          accessToken,
          headers: requestHeaders,
          timeoutMs
        }
      );
      let response;
      try {
        response = await execute();
      } catch (error) {
        if (!courseRequestCanBeReplayed(normalizedMethod, normalizedBody) ||
            !transientCourseEdgeFailure(error)) {
          throw error;
        }
        await new Promise((resolve) => globalThis.setTimeout(resolve, COURSE_EDGE_RETRY_DELAY_MS));
        response = await execute();
      }
      return response?.data ?? null;
    } catch (error) {
      if (!this.visitor && authenticationFailure(error)) {
        await Promise.resolve(this.authClient.clearSession?.()).catch(() => undefined);
        this.authClient.emit?.("SESSION_INVALID");
        error.authRequired = true;
      }
      throw error;
    }
  }

  loadAuthoringPlan(courseId) {
    return this.requestCourseApi(`${courseResourcePath(courseId)}/instructional-plan`);
  }

  loadCourseDesign(courseId, options = {}) {
    const source = exactObject(
      options,
      new Set(["scope", "limit", "cursor"]),
      "Leitura do desenho"
    );
    const { scope = null, limit = 32, cursor = null } = source;
    const normalizedCourseId = uuid(courseId, "Curso");
    const normalizedScope = courseDesignScope(scope, normalizedCourseId);
    return this.requestCourseApi(`${courseResourcePath(normalizedCourseId)}/course-design`, {
      query: {
        scopeKind: normalizedScope.kind,
        scopeRef: normalizedScope.ref,
        limit: positiveInteger(limit, "Limite de subescopos", { maximum: 64 }),
        cursor: cursor == null ? null : boundedIdentifier(cursor, "Cursor de subescopos")
      }
    });
  }

  listAuthoringProfiles() {
    return this.requestCourseApi("/v1/authoring-profiles").then(normalizeAuthoringProfileList);
  }

  mutateAuthoringProfile(value = {}) {
    const command = normalizeAuthoringProfileSave(value);
    const create = command.expectedRevision === 0;
    const { profileId, ...body } = command;
    return this.requestCourseApi(create ? "/v1/authoring-profiles" : `/v1/authoring-profiles/${profileId}`, {
      method: create ? "POST" : "PATCH", body: create ? command : body
    }).then((result) => normalizeAuthoringProfileChange(result, { ...command, deleted: false }));
  }

  deleteAuthoringProfile(value = {}) {
    const command = normalizeAuthoringProfileDelete(value);
    const { profileId, ...body } = command;
    return this.requestCourseApi(`/v1/authoring-profiles/${profileId}`, {
      method: "DELETE", body
    }).then((result) => normalizeAuthoringProfileChange(result, { ...command, deleted: true }));
  }

  previewCourseAuthoringProfile(value = {}) {
    const command = normalizeCourseAuthoringProfileRequest(value);
    const { courseId, ...body } = command;
    return this.requestCourseApi(`${courseResourcePath(courseId)}/authoring-profile/preview`, {
      method: "POST", body
    }).then((result) => normalizeCourseAuthoringProfilePreview(result, command));
  }

  applyCourseAuthoringProfile(value = {}) {
    const command = normalizeCourseAuthoringProfileRequest(value, { apply: true });
    const { courseId, ...body } = command;
    return this.requestCourseApi(`${courseResourcePath(courseId)}/authoring-profile/applications`, {
      method: "POST", body
    }).then((result) => normalizeCourseAuthoringProfileChange(result, command));
  }

  async loadCourseSources(courseId, options = {}) {
    const normalizedCourseId = uuid(courseId, "Curso");
    const normalized = courseSourcesReadOptions(options);
    const result = normalizeCourseSourcesRead(await this.requestCourseApi(
      `${courseResourcePath(normalizedCourseId)}/sources`,
      { query: normalized }
    ));
    if (result.courseId !== normalizedCourseId ||
        result.courseRevision !== normalized.expectedRevision ||
        result.mode !== normalized.mode ||
        result.query.sourceId !== normalized.sourceId ||
        result.query.targetKind !== normalized.targetKind ||
        result.query.targetId !== normalized.targetId ||
        result.nextCursor !== null && !SOURCE_CURSOR_PATTERN.test(result.nextCursor) ||
        normalized.mode !== "catalog" && (result.items.length > 1 ||
          result.nextCursor !== null) ||
        normalized.mode === "source" && result.items.some(({ sourceId }) =>
          sourceId !== normalized.sourceId) ||
        normalized.mode === "target" && result.items.some(({ targetKind, targetId }) =>
          targetKind !== normalized.targetKind || targetId !== normalized.targetId)) {
      throw new TypeError("A leitura de Fontes não corresponde ao pedido.");
    }
    return result;
  }

  async getCourseSourceAttachmentDownload(value = {}) {
    const request = courseSourcePdfDownloadIdentity(value);
    return boundCourseSourcePdfDownload(
      await this.requestCourseApi(`${courseResourcePath(request.courseId)}/source-pdf/download`, {
        query: {
          expectedRevision: request.expectedRevision,
          sourceId: request.sourceId,
          sourceRevision: request.sourceRevision,
          contentHash: request.contentHash
        }
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
        typeof file?.stream !== "function" || typeof this.fetchImpl !== "function") {
      throw new TypeError("Use um PDF de até 20 MiB.");
    }
    const normalized = {
      requestId: requestIdentity(requestId),
      courseId: uuid(courseId, "Curso"),
      expectedRevision: positiveInteger(expectedRevision, "Versão de estado"),
      sourceId: boundedCourseSourceIdentifier(sourceId, "Identidade da Fonte"),
      sourceRevision: positiveInteger(sourceRevision, "Revisão da Fonte")
    };
    try {
      const accessToken = await this.#authenticatedAccessToken();
      if (!accessToken) {
        throw Object.assign(new Error("Entre novamente para continuar."), {
          status: 401,
          code: "AUTH_REQUIRED"
        });
      }
      const body = new FormData();
      body.set("requestId", normalized.requestId);
      body.set("courseId", normalized.courseId);
      body.set("expectedRevision", String(normalized.expectedRevision));
      body.set("sourceId", normalized.sourceId);
      body.set("sourceRevision", String(normalized.sourceRevision));
      body.set("file", file, typeof file.name === "string" && file.name ? file.name : "fonte.pdf");
      const execute = () => this.http.request(
        "/functions/v1/aralearn-course-api/app/ingerirPdfDaFonte",
        {
          method: "POST",
          body,
          rawBody: true,
          accessToken,
          timeoutMs: COURSE_SOURCE_PDF_TIMEOUT_MS
        }
      );
      let response;
      try {
        response = await execute();
      } catch (error) {
        if (!transientCourseEdgeFailure(error)) throw error;
        await new Promise((resolve) => globalThis.setTimeout(resolve, COURSE_EDGE_RETRY_DELAY_MS));
        response = await execute();
      }
      const ingestion = normalizeCourseSourcePdfIngestion(response?.data ?? null);
      const result = normalizeCourseSourceChange({
        contract: COURSE_SOURCE_CHANGE_CONTRACT,
        courseId: ingestion.courseId,
        courseRevision: ingestion.courseRevision,
        requestId: ingestion.requestId,
        idempotent: ingestion.idempotent,
        changed: ingestion.changed,
        change: ingestion.change
      });
      if (result.courseId !== normalized.courseId ||
          result.requestId !== normalized.requestId ||
          result.courseRevision !== normalized.expectedRevision + (result.changed ? 1 : 0) ||
          result.change !== null && (
            result.change.type !== "ingest_pdf" ||
            result.change.subjectId !== normalized.sourceId ||
            result.change.revision !== normalized.sourceRevision
          )) {
        throw new TypeError("A confirmação da ingestão do PDF não corresponde ao pedido.");
      }
      return result;
    } catch (error) {
      if (!this.visitor && authenticationFailure(error)) {
        await Promise.resolve(this.authClient.clearSession?.()).catch(() => undefined);
        this.authClient.emit?.("SESSION_INVALID");
        error.authRequired = true;
      }
      throw error;
    }
  }

  async loadCourseAnchoredAnnotations(courseId, value = {}) {
    const normalizedCourseId = uuid(courseId, "Curso");
    const options = anchoredAnnotationReadOptions(value);
    const query = options.query;
    const result = await this.requestCourseApi(
      `${courseResourcePath(normalizedCourseId)}/anchored-annotations`,
      {
        query: {
          expectedRevision: options.expectedCourseRevision,
          annotationSetVersion: options.annotationSetVersion,
          mode: query.mode,
          origin: query.origins,
          channel: query.channels,
          state: query.states,
          category: query.categories,
          includeUncategorized: query.includeUncategorized,
          subjectId: query.subjectIds,
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
        }
      }
    );
    return boundAnchoredAnnotationPage(result, {
      courseId: normalizedCourseId,
      options
    });
  }

  async loadCourseAuthoringAnalytics(courseId, value = {}) {
    const normalizedCourseId = uuid(courseId, "Curso");
    const source = exactObject(
      value,
      new Set(["expectedCourseRevision", "query"]),
      "Leitura de Analytics"
    );
    const normalizedQuery = normalizeCourseAuthoringAnalyticsQuery(source.query ?? {});
    const expectedRevision = positiveInteger(
      source.expectedCourseRevision,
      "Versão do Curso"
    );
    const result = normalizeCourseAuthoringAnalyticsPage(
      await this.requestCourseApi(`${courseResourcePath(normalizedCourseId)}/research`, {
        query: {
          expectedRevision,
          scopeKind: normalizedQuery.scope.kind,
          scopeRef: normalizedQuery.scope.ref
        }
      }),
      { expectedCourseId: normalizedCourseId, expectedQuery: normalizedQuery }
    );
    if (result.course.revision !== expectedRevision) {
      throw new TypeError("O snapshot de Analytics não corresponde ao Curso solicitado.");
    }
    return result;
  }

  loadAuthoringOutline(courseId) {
    return this.requestCourseApi(courseResourcePath(courseId), {
      query: { view: "outline" }
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
    const normalizedCourseId = uuid(courseId, "Curso");
    return this.requestCourseApi(
      `/v2/courses/${encodeURIComponent(normalizedCourseId)}/study-units`, {
      query: {
        expectedRevision: positiveInteger(expectedRevision, "Versão do Curso"),
        scopeKind: normalizedScope.kind,
        scopeId: normalizedScope.id,
        anchorStudyUnitId: normalizedAnchor,
        cursorStudyUnitId: normalizedCursor?.studyUnitId ?? null,
        direction: normalizedDirection,
        limit: positiveInteger(limit, "Limite da inspeção", { maximum: 24 }),
        maxBytes: positiveInteger(maxBytes, "Limite de bytes", {
          minimum: 64 * 1024,
          maximum: 1_500_000
        })
      }
      }
    );
  }

  createCourse({
    requestId = createUuid(),
    title,
    objective
  } = {}) {
    return this.requestCourseApi("/v1/courses", {
      method: "POST",
      body: {
        requestId: uuid(requestId, "Identidade da criação"),
        title: requiredText(title, "Título do Curso", 300),
        objective: requiredText(objective, "Objetivo do Curso", 2_000)
      }
    });
  }

  async commitCourseComposition(value = {}) {
    const command = normalizeFocalStudyUnitCompositionCommand(value);
    const { id: studyUnitId, position, ...content } = command.studyUnit;
    const result = await this.requestCourseApi(`${courseResourcePath(command.courseId)}/composition`, {
      method: "POST",
      body: {
        requestId: command.requestId,
        expectedRevision: command.expectedCourseRevision,
        expectedStudyUnitVersion: command.expectedStudyUnitVersion,
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
      }
    });
    return normalizeFocalStudyUnitCompositionReceipt(result, command);
  }

  async commitCourseStructuralComposition(value = {}) {
    const source = exactObject(value, new Set([
      "requestId", "courseId", "expectedRevision", "upserts", "deletes", "courseMetadata",
      "sourceAttributionApplications"
    ]), "Alteração estrutural assistida");
    const courseMetadata = Object.hasOwn(source, "courseMetadata") ? normalizeCourseMetadata(source.courseMetadata) : null;
    const upserts = Array.isArray(source.upserts) ? structuredClone(source.upserts) : null;
    const deletes = Array.isArray(source.deletes) ? structuredClone(source.deletes) : null;
    if (!upserts || !deletes || !upserts.length && !deletes.length && courseMetadata === null ||
        upserts.length > 200 || deletes.length > 200) {
      throw new TypeError("Alteração estrutural assistida inválida.");
    }
    const bounded = boundedJsonObject({ upserts, deletes }, "Alteração estrutural assistida", 480 * 1024);
    const requestId = requestIdentity(source.requestId);
    const courseId = uuid(source.courseId, "Curso");
    const result = await this.requestCourseApi(`${courseResourcePath(courseId)}/composition`, {
      method: "POST",
      body: {
        requestId,
        expectedRevision: positiveInteger(source.expectedRevision, "Versão do Curso"),
        ...(courseMetadata === null ? {} : { courseMetadata }),
        upserts: bounded.upserts,
        deletes: bounded.deletes,
        sourceAttributionApplications: normalizeSourceAttributionApplications(
          source.sourceAttributionApplications
        )
      }
    });
    return {
      ...result,
      requestId: result?.requestId || requestId,
      courseRevision: Number(result?.courseRevision ?? result?.revision)
    };
  }

  async recoverOwnedCourseCopy(value = {}) {
    const command = normalizeOwnedCourseCopyRecoveryCommand(value);
    const { origin, ...body } = command;
    const result = await this.requestCourseApi(
      `${courseResourcePath(command.sourceCourseId)}/copy-recovery`,
      { method: "POST", body: { ...body, applicationOrigin: origin } }
    );
    return normalizeOwnedCourseCopyRecoveryReceipt(result, command);
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
    const normalizedCourseId = uuid(courseId, "Curso");
    return this.requestCourseApi(`${courseResourcePath(normalizedCourseId)}/course-design/changes`, {
      method: "POST",
      body: {
        requestId: requestIdentity(requestId),
        expectedCourseRevision: positiveInteger(expectedRevision, "Versão de estado"),
        command: boundedJsonObject(
          normalizeCourseDesignCommand(designCommand),
          "Comando dos parâmetros",
          32 * 1024
        )
      }
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
    const result = normalizeCourseSourceChange(await this.requestCourseApi(
      `${courseResourcePath(courseId)}/sources/changes`,
      {
        method: "POST",
        body: {
          requestId,
          expectedCourseRevision: expectedRevision,
          command: sourceCommand
        }
      }
    ));
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
    const result = await this.requestCourseApi(
      `${courseResourcePath(mutation.courseId)}/anchored-annotations/changes`,
      {
        method: "POST",
        body: {
          requestId: mutation.requestId,
          expectedCourseRevision: mutation.expectedCourseRevision,
          command: mutation.command
        }
      }
    );
    return boundAnchoredAnnotationChange(result, mutation, {
      expectedOrigin: "author",
      expectedChannel: "authoring_interface"
    });
  }

  getPersonProfile() {
    return this.requestCourseApi("/v2/profile");
  }

  updatePersonProfile(patch) {
    const normalized = plainObject(patch, "Alteração de perfil");
    const allowed = new Set(["handle", "avatarObjectKey"]);
    if (!Object.keys(normalized).length ||
        Object.keys(normalized).some((field) => !allowed.has(field))) {
      throw new TypeError("Alteração de perfil inválida.");
    }
    return this.requestCourseApi("/v2/profile", {
      method: "PATCH",
      body: { ...normalized, ...(Object.hasOwn(normalized, "handle")
        ? { handle: personHandle(normalized.handle) } : {}) }
    });
  }

  listCourseAccess(courseId) {
    return this.requestCourseApi(`${courseResourcePath(courseId)}/access`);
  }

  async searchCourseAccessPeople(courseId, { query, limit = 10 } = {}) {
    const course = uuid(courseId, "Curso");
    const prefix = personHandle(query, { prefix: true });
    const maximum = positiveInteger(limit, "Limite de pessoas", { maximum: 10 });
    const result = await this.requestCourseApi(`${courseResourcePath(course)}/access/people`, {
      query: { query: prefix, limit: maximum }
    });
    if (result?.contract !== "aralearn.course-people-search.v1" || result.courseId !== course ||
        !Array.isArray(result.items) || result.items.length > maximum ||
        typeof result.rateLimited !== "boolean" || result.rateLimited && result.items.length) {
      throw new TypeError("Resultado da busca de pessoas inválido.");
    }
    const items = result.items.map((person) => {
      const userId = uuid(person.userId, "Pessoa");
      const handle = personHandle(person.handle);
      const key = person.avatarObjectKey;
      if (handle !== person.handle || !handle.startsWith(prefix) ||
          key !== null && (!AVATAR_OBJECT_KEY.test(key) || !key.startsWith(`${userId}/`))) {
        throw new TypeError("Pessoa da busca inválida.");
      }
      let avatarUrl = null;
      if (key !== null) {
        const url = new URL(person.avatarUrl);
        if (url.origin !== new URL(this.http.projectUrl).origin || url.username || url.password || url.hash ||
            url.pathname !== `/storage/v1/object/sign/${AVATAR_BUCKET}/${key}` || !url.searchParams.has("token")) {
          throw new TypeError("Avatar da busca inválido.");
        }
        avatarUrl = url.toString();
      } else if (person.avatarUrl !== null) throw new TypeError("Avatar da busca inválido.");
      return { userId, handle, avatarObjectKey: key, avatarUrl };
    });
    if (new Set(items.map(({ userId }) => userId)).size !== items.length) throw new TypeError("Busca repetiu uma pessoa.");
    return { contract: result.contract, courseId: course, items, rateLimited: result.rateLimited };
  }

  grantCourseAccess({ courseId, userId, handle, confirmed, requestId = createUuid() } = {}) {
    if (confirmed !== true) throw new TypeError("Concessão de acesso inválida.");
    return this.requestCourseApi(`${courseResourcePath(courseId)}/access`, {
      method: "POST",
      body: { userId: uuid(userId, "Pessoa"), handle: personHandle(handle), confirmed: true,
        requestId: uuid(requestId, "Identidade da alteração") }
    });
  }

  setCourseVisibility({ courseId, expectedRevision, visibility, publicFileAccess,
    confirmed, requestId = createUuid() } = {}) {
    if (!new Set(["private", "public"]).has(visibility) ||
        !new Set(["restricted", "available"]).has(publicFileAccess) ||
        confirmed !== true) throw new TypeError("Visibilidade inválida.");
    return this.requestCourseApi(`${courseResourcePath(courseId)}/visibility`, {
      method: "PATCH", body: { expectedRevision: positiveInteger(expectedRevision, "Revisão"),
        visibility, publicFileAccess, confirmed: confirmed === true,
        requestId: requestIdentity(requestId) }
    });
  }

  setCourseSourceFileAccess({ courseId, expectedRevision, sourceId, sourceRevision,
    contentHash = null, publicFileAccess, requestId = createUuid() } = {}) {
    if (!new Set(["inherit", "restricted", "available"]).has(publicFileAccess) ||
        contentHash !== null && !/^[a-f0-9]{64}$/u.test(contentHash)) {
      throw new TypeError("Permissão do arquivo inválida.");
    }
    return this.requestCourseApi(`${courseResourcePath(courseId)}/sources/file-access`, {
      method: "PATCH", body: { expectedRevision: positiveInteger(expectedRevision, "Revisão"),
        sourceId: boundedIdentifier(sourceId, "Fonte"),
        sourceRevision: positiveInteger(sourceRevision, "Revisão da fonte"),
        contentHash, publicFileAccess, requestId: requestIdentity(requestId) }
    });
  }

  revokeCourseAccess({
    courseId,
    userId,
    confirmed,
    requestId = createUuid()
  } = {}) {
    if (confirmed !== true) throw new TypeError("Revogação de acesso inválida.");
    return this.requestCourseApi(
      `${courseResourcePath(courseId)}/access/${encodeURIComponent(uuid(userId, "Pessoa"))}`,
      {
        method: "DELETE",
        body: {
          confirmed: true,
          requestId: uuid(requestId, "Identidade da alteração")
        }
      }
    );
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
    const result = await this.requestCourseApi(courseResourcePath(normalizedCourseId), {
      method: "DELETE",
      body: {
        operation: normalizedOperation,
        confirmed: true,
        requestId: normalizedRequestId
      }
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
    return this.requestCourseApi("/v1/maintenance", {
      query: {
        limit: positiveInteger(limit, "Limite da Manutenção", { maximum: 500 })
      }
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
      return this.requestCourseApi("/v1/maintenance/actions", {
        method: "POST",
        body: {
          operation: normalizedOperation,
          limit: positiveInteger(limit, "Limite da retenção", { maximum: 1000 }),
          confirmed: true
        }
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
    return this.requestCourseApi("/v1/maintenance/actions", {
      method: "POST",
      body: {
        operation: normalizedOperation,
        classification: normalizedClassification,
        objectPath: normalizedPath,
        confirmed: true
      }
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
    const accessToken = await this.#authenticatedAccessToken();
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
      if (!this.visitor && authenticationFailure(error)) {
        await Promise.resolve(this.authClient.clearSession?.()).catch(() => undefined);
        this.authClient.emit?.("SESSION_INVALID");
        error.authRequired = true;
      }
      throw error;
    }
  }

  async loadAvatar(objectKey) {
    const accessToken = await this.#authenticatedAccessToken();
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
    const accessToken = await this.#authenticatedAccessToken();
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
      result = await this.requestCourseApi("/app/excluirMinhaConta", {
        method: "POST",
        body: { confirmation }
      });
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
