import { composeCourseDocument } from "../domain/courseEntities.js";
import { UUID_PATTERN } from "../domain/identifiers.js";
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
import {
  normalizeCourseSourcePdfDownload,
  normalizeCourseSourceChange,
  normalizeCourseSourceCommand,
  normalizeCourseSourcesRead,
  normalizeCourseStudyCitationsRead
} from "../domain/courseSources.js";
import {
  normalizeFocalStudyUnitCompositionIntent,
  normalizeCourseMetadata,
  normalizeOwnedCourseCopyRecoveryCommand
} from "../domain/courseComposition.js";
import {
  COURSE_ANNOTATION_CACHE_CONTRACT,
  COURSE_ANNOTATION_OUTBOX_CONTRACT
} from "../persistence/CourseAnnotationRepository.js";
import {
  COURSE_PERSONAL_STATE_CACHE_CONTRACT
} from "../persistence/CoursePersonalStateRepository.js";

const CACHE_PREFIX = "course.v1";
const MAX_ENTITY_PAGES = 100;
const VERIFIED_COMPOSITION_CACHE_CONTRACT =
  "aralearn.course-verified-composition.v1";
const PENDING_COMPOSITION_CACHE_CONTRACT =
  "aralearn.course-confirmed-composition-pending.v1";
const LEGACY_DRAFT_CACHE_KEY = "aralearn.personal-course-copy-edit-pending.v1";
const STUDY_DRAFT_RECOVERY_CACHE_KEY = "course.v1.study-draft-recovery";
const ACCESSIBLE_COURSE_IDS_CACHE_KEY = `${CACHE_PREFIX}.accessible-course-ids`;
const ACCESSIBLE_COURSE_IDS_CONTRACT = "aralearn.accessible-course-ids.v1";
const REVIEW_PAGE_CACHE_KEY = `${CACHE_PREFIX}.review-page`;
const PERSON_PROFILE_CACHE_KEY = "aralearn.person-profile.v2";

function normalizeCachedPersonProfile(value, expectedUserId = null) {
  if (value?.contract !== PERSON_PROFILE_CACHE_KEY ||
      !UUID_PATTERN.test(value.userId || "") ||
      (expectedUserId && value.userId !== expectedUserId) ||
      (value.handle !== null && (typeof value.handle !== "string" ||
        !/^[a-z0-9][a-z0-9._-]{1,28}[a-z0-9]$/u.test(value.handle))) ||
      (value.avatarObjectKey !== null && (typeof value.avatarObjectKey !== "string" ||
        !value.avatarObjectKey.startsWith(`${value.userId}/`))) ||
      typeof value.updatedAt !== "string" || !Number.isFinite(Date.parse(value.updatedAt))) {
    throw new TypeError("Perfil público inválido.");
  }
  return { contract: PERSON_PROFILE_CACHE_KEY, userId: value.userId,
    handle: value.handle, avatarObjectKey: value.avatarObjectKey, updatedAt: value.updatedAt };
}
const AUTHORING_INSPECTION_PAGE_CONTRACT =
  "aralearn.course-study-unit-inspection-page.v2";
const AUTHORING_INSPECTION_POSITION_CONTRACT =
  "aralearn.course-authoring-inspection-position.v1";
const AUTHORING_INSPECTION_CACHE_MAX_PAGES = 4;
const AUTHORING_INSPECTION_CACHE_MAX_BYTES = 8 * 1024 * 1024;
function stableCursor(cursor) {
  if (!cursor) return "start";
  return encodeURIComponent(JSON.stringify(cursor));
}

function listCacheKey(query, cursor, prefix = CACHE_PREFIX) {
  return `${prefix}.list:${encodeURIComponent(String(query || "").trim().toLocaleLowerCase("pt-BR"))}:${stableCursor(cursor)}`;
}

function courseCacheKey(courseId, prefix = CACHE_PREFIX) {
  return `${prefix}.header:${courseId}`;
}

function verifiedCompositionCacheKey(courseId, prefix = CACHE_PREFIX) {
  return `${prefix}.verified-composition:${courseId}`;
}

function pendingCompositionCacheKey(courseId) {
  return `${PENDING_COMPOSITION_CACHE_CONTRACT}:${courseId}`;
}

function instructionalPlanCacheKey(courseId, prefix = CACHE_PREFIX) {
  return `${prefix}.instructional-plan:${courseId}`;
}

function authoringOutlineCacheKey(courseId, prefix = CACHE_PREFIX) {
  return `${prefix}.outline:${courseId}`;
}

function courseSourcesCachePrefix(courseId, prefix = CACHE_PREFIX) {
  return `${prefix}.course-sources:${courseId}:`;
}

function authoringInspectionCacheKey(courseId, prefix = CACHE_PREFIX) {
  return `${prefix}.study-unit-inspection:${courseId}`;
}

function authoringInspectionPositionKey(courseId, prefix = CACHE_PREFIX) {
  return `${prefix}.study-unit-inspection-position:${courseId}`;
}

function authoringInspectionRequestKey(revision, options) {
  return `${revision}:${JSON.stringify(options)}`;
}

function entityCacheKey(courseId, revision, limit, cursor, prefix = CACHE_PREFIX) {
  return `${prefix}.entities:${courseId}:${revision}:${limit}:${stableCursor(cursor)}`;
}

function courseDesignReadOptions(courseId, options = {}) {
  if (!options || typeof options !== "object" || Array.isArray(options) ||
      Object.keys(options).some((field) => !new Set(["scope", "limit", "cursor"]).has(field))) {
    throw new TypeError("Leitura do desenho inválida.");
  }
  const { scope = null, limit = 32, cursor = null } = options;
  const normalizedCourseId = String(courseId || "").trim().toLowerCase();
  const candidate = scope ?? { kind: "course", ref: normalizedCourseId };
  const kind = String(candidate?.kind || "").trim();
  const ref = String(candidate?.ref || "").trim();
  const normalizedLimit = Number(limit);
  const normalizedCursor = cursor == null ? null : String(cursor).trim();
  if (!UUID_PATTERN.test(normalizedCourseId) ||
      !candidate || typeof candidate !== "object" || Array.isArray(candidate) ||
      Object.keys(candidate).length !== 2 ||
      Object.keys(candidate).some((field) => !new Set(["kind", "ref"]).has(field)) ||
      !new Set(["course", "module", "lesson", "didactic_microsequence", "study_unit"]).has(kind) ||
      kind !== candidate.kind || !ref || ref !== candidate.ref || ref.length > 240 ||
      (kind === "course" && ref !== normalizedCourseId) ||
      !Number.isSafeInteger(normalizedLimit) || normalizedLimit < 1 || normalizedLimit > 64 ||
      (cursor != null && (!normalizedCursor || normalizedCursor !== cursor ||
        normalizedCursor.length > 240))) {
    throw new TypeError("Leitura dos parâmetros inválida.");
  }
  return {
    scope: { kind, ref },
    limit: normalizedLimit,
    cursor: normalizedCursor
  };
}

function courseSourceOpaqueId(value, maximum = 240) {
  return typeof value === "string" && value === value.trim() &&
    value.length >= 1 && value.length <= maximum * 2 &&
    [...value].length <= maximum &&
    new TextEncoder().encode(value).byteLength <= maximum * 4 &&
    ![...value].some((character) => {
      const point = character.codePointAt(0);
      return point < 32 || point >= 127 && point <= 159;
    });
}

function courseSourcesReadOptions(courseId, options = {}) {
  const allowed = new Set([
    "expectedRevision", "mode", "sourceId", "targetKind", "targetId", "cursor", "limit"
  ]);
  const normalizedCourseId = String(courseId || "").trim().toLowerCase();
  if (!options || typeof options !== "object" || Array.isArray(options) ||
      Object.keys(options).some((field) => !allowed.has(field)) ||
      !UUID_PATTERN.test(normalizedCourseId)) {
    throw new TypeError("Leitura de Fontes inválida.");
  }
  const expectedRevision = Number(options.expectedRevision);
  const mode = options.mode ?? "catalog";
  const sourceId = options.sourceId ?? null;
  const targetKind = options.targetKind ?? null;
  const targetId = options.targetId ?? null;
  const cursor = options.cursor ?? null;
  const limit = options.limit ?? (mode === "catalog" ? 10 : 1);
  const hasTargetContext = targetKind !== null || targetId !== null;
  const validTargetContext = targetKind !== null && targetId !== null;
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 1 ||
      !new Set(["catalog", "source", "target"]).has(mode) ||
      (mode === "source") !== courseSourceOpaqueId(sourceId) ||
      mode === "catalog" && hasTargetContext ||
      mode === "target" && (sourceId !== null || !validTargetContext) ||
      mode === "source" && hasTargetContext && !validTargetContext ||
      (targetKind !== null && !new Set(["plan_item", "study_unit"]).has(targetKind)) ||
      (targetId !== null && !courseSourceOpaqueId(targetId)) ||
      (targetKind === "plan_item" && !UUID_PATTERN.test(targetId)) ||
      (mode !== "catalog" && (cursor !== null || limit !== 1)) ||
      cursor !== null && (typeof cursor !== "string" || cursor !== cursor.trim() ||
        cursor.length < 1 || cursor.length > 240 ||
        !/^[A-Za-z0-9+/_-]+={0,2}$/u.test(cursor)) ||
      !Number.isSafeInteger(limit) || limit < 1 || limit > 24) {
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

function courseAnchoredAnnotationReadOptions(courseId, value = {}) {
  const allowed = new Set([
    "expectedCourseRevision", "annotationSetVersion", "query", "cursor", "limit"
  ]);
  const normalizedCourseId = String(courseId || "").trim().toLowerCase();
  if (!value || typeof value !== "object" || Array.isArray(value) ||
      Object.keys(value).some((field) => !allowed.has(field)) ||
      !UUID_PATTERN.test(normalizedCourseId)) {
    throw new TypeError("Leitura de observações inválida.");
  }
  return normalizeCourseAnchoredAnnotationReadOptions({
    expectedCourseRevision: value.expectedCourseRevision,
    annotationSetVersion: value.annotationSetVersion ?? null,
    query: value.query ?? {
      mode: "inbox",
      origins: [],
      channels: [],
      states: [],
      categories: [],
      includeUncategorized: true,
      subjectIds: [],
      hierarchy: null,
      annotationId: null
    },
    cursor: value.cursor ?? null,
    limit: value.limit ?? 12
  });
}

function courseSourceCommandSubjectId(command) {
  return command.type === "save_source" || command.type === "retire_source" ||
    command.type === "remove_pdf"
    ? command.sourceId
    : command.type === "save_anchor" || command.type === "retire_anchor"
      ? command.anchorId
      : command.targetId;
}

function retryableReadFailure(error) {
  const rawStatus = error?.status ?? error?.response?.status;
  const status = rawStatus == null || rawStatus === "" ? null : Number(rawStatus);
  const code = String(error?.code || "").toLowerCase();
  const nativeFetchFailure = error instanceof TypeError &&
    /(?:failed to fetch|fetch failed|network|load failed)/iu.test(String(error.message || ""));
  return error?.authRequired !== true && (
    status === 0 || status === 408 || status === 429 || (status != null && status >= 500) ||
    new Set(["request_timeout", "service_unavailable", "network_error"]).has(code) ||
    nativeFetchFailure
  );
}

function courseRevisionConflict(error) {
  const status = Number(error?.status || error?.response?.status || 0);
  const code = String(error?.code || error?.response?.code || "").toUpperCase();
  return status === 409 || code === "40001" || code === "COURSE_REVISION_CHANGED";
}

function courseRevisionChangedError(cause = null) {
  if (String(cause?.code || "").toLowerCase() === "course_revision_changed") return cause;
  const error = new Error("O Curso mudou durante a leitura das citações.");
  error.name = "CourseRevisionChangedError";
  error.status = 409;
  error.code = "course_revision_changed";
  if (cause) error.cause = cause;
  return error;
}

function invalidCourseComposition(message) {
  const error = new TypeError(message);
  error.invalidCourseComposition = true;
  return error;
}

function isInvalidCourseComposition(error) {
  return error?.invalidCourseComposition === true ||
    error?.name === "CourseEntityError" ||
    String(error?.code || "").toLowerCase() === "course_revision_changed";
}

function validCourseEntityPage(page, courseId, revision) {
  return page && typeof page === "object" && !Array.isArray(page) &&
    page.contract === "aralearn.course-entities.v1" &&
    String(page.courseId || "").trim().toLowerCase() === courseId &&
    Number(page.revision) === revision &&
    Array.isArray(page.items) &&
    typeof page.hasMore === "boolean" &&
    (page.hasMore ? page.nextCursor != null : page.nextCursor == null) &&
    page.items.every((row) => !Object.hasOwn(row || {}, "courseId") ||
      String(row.courseId || "").trim().toLowerCase() === courseId);
}

function accessWasRevoked(error) {
  if (courseRevisionConflict(error)) return false;
  const status = Number(error?.status || error?.response?.status || 0);
  const code = String(error?.code || error?.response?.code || "").toUpperCase();
  return error?.authRequired === true || status === 401 || status === 403 || status === 404 ||
    code === "42501" || code === "PT404";
}

function annotationAccessWasRevoked(error) {
  if (courseRevisionConflict(error)) return false;
  const status = Number(error?.status || error?.response?.status || 0);
  const code = String(error?.code || error?.response?.code || "").toUpperCase();
  return error?.authRequired === true || status === 401 || status === 403 ||
    code === "42501" || code === "PT404";
}

function invalidCourseList() {
  return new TypeError("Resposta da lista de Cursos inválida.");
}

function projectListItem(value) {
  const courseId = String(value?.courseId || "").trim().toLowerCase();
  const title = String(value?.title || "").trim();
  const revision = Number(value?.revision);
  const ownership = String(value?.ownership || "").trim();
  const visibility = value.visibility;
  const canObserve = value.canObserve;
  if (!value || typeof value !== "object" || Array.isArray(value) ||
      !UUID_PATTERN.test(courseId) || !title ||
      !Number.isSafeInteger(revision) || revision < 1 ||
      !new Set(["owned", "shared", "public"]).has(ownership) ||
      typeof value.canEdit !== "boolean" || value.canEdit !== (ownership === "owned") ||
      typeof canObserve !== "boolean" || !new Set(["private", "public"]).has(visibility) ||
      !new Set(["restricted", "available"]).has(value.publicFileAccess) ||
      ownership === "public" && visibility !== "public") {
    throw invalidCourseList();
  }
  return {
    courseId,
    title,
    goal: value?.goal ?? null,
    revision,
    ownership,
    canEdit: value.canEdit,
    canObserve,
    visibility,
    publicFileAccess: value.publicFileAccess,
    ...(ownership === "owned" && value.copyOrigin ? { copyOrigin: structuredClone(value.copyOrigin) } : {}),
    moduleCount: value?.moduleCount ?? null,
    lessonCount: value?.lessonCount ?? null,
    topicCount: value?.topicCount ?? null,
    microsequenceCount: value?.microsequenceCount ?? null,
    studyUnitCount: value?.studyUnitCount ?? null,
    completedStudyUnitCount: value?.completedStudyUnitCount ?? 0,
    updatedAt: value?.updatedAt ?? null
  };
}

function normalizeCourseListPage(value) {
  const cursor = value?.nextCursor;
  const cursorIsValid = cursor && typeof cursor === "object" && !Array.isArray(cursor) &&
    typeof cursor.beforeUpdatedAt === "string" && !Number.isNaN(Date.parse(cursor.beforeUpdatedAt)) &&
    UUID_PATTERN.test(String(cursor.beforeId || "").trim().toLowerCase());
  if (!value || typeof value !== "object" || Array.isArray(value) ||
      value.contract !== "aralearn.course-list.v2" ||
      !Array.isArray(value.items) || typeof value.hasMore !== "boolean" ||
      (value.hasMore ? !cursorIsValid : cursor != null)) {
    throw invalidCourseList();
  }
  const items = value.items.map(projectListItem);
  if (new Set(items.map(({ courseId }) => courseId)).size !== items.length) {
    throw invalidCourseList();
  }
  return {
    contract: value.contract,
    items,
    hasMore: value.hasMore,
    nextCursor: cursor
  };
}

function cachedPayload(row) {
  const value = row?.value ?? row;
  return value && typeof value === "object" && !Array.isArray(value)
    ? structuredClone(value)
    : null;
}

function courseIdsFromList(items) {
  if (!Array.isArray(items)) return null;
  const courseIds = new Set();
  for (const item of items) {
    const courseId = String(item?.courseId || "").trim().toLowerCase();
    if (!UUID_PATTERN.test(courseId)) return null;
    courseIds.add(courseId);
  }
  return courseIds;
}

function cachedAccessibleCourseIds(value) {
  if (!value || typeof value !== "object" || Array.isArray(value) ||
      value.contract !== ACCESSIBLE_COURSE_IDS_CONTRACT ||
      !Array.isArray(value.courseIds)) {
    return null;
  }
  const courseIds = courseIdsFromList(value.courseIds.map((courseId) => ({ courseId })));
  if (!courseIds || courseIds.size !== value.courseIds.length) return null;
  return courseIds;
}

function normalizedInspectionScope(value) {
  const kind = String(value?.kind || "").trim();
  const id = value?.id == null ? null : String(value.id).trim();
  if (!new Set([
    "course", "authoring_part", "unassigned", "module", "lesson",
    "didactic_microsequence"
  ]).has(kind) || ((kind === "course" || kind === "unassigned") !== (id === null)) ||
      (id != null && (!id || id.length > 240))) {
    throw new TypeError("Escopo da inspeção inválido.");
  }
  return { kind, id };
}

function normalizeInspectionPage(value) {
  const courseId = String(value?.courseId || "").trim().toLowerCase();
  const courseRevision = Number(value?.courseRevision);
  const pageBytes = Number(value?.pageBytes);
  if (!value || typeof value !== "object" || Array.isArray(value) ||
      value.contract !== AUTHORING_INSPECTION_PAGE_CONTRACT ||
      !UUID_PATTERN.test(courseId) ||
      !Number.isSafeInteger(courseRevision) || courseRevision < 1 ||
      !Array.isArray(value.items) || value.items.length > 24 ||
      typeof value.hasPrevious !== "boolean" || typeof value.hasMore !== "boolean" ||
      !Number.isSafeInteger(pageBytes) || pageBytes < 0 || pageBytes > 1_750_000) {
    throw new TypeError("Página da inspeção inválida.");
  }
  const scope = normalizedInspectionScope(value.scope);
  const studyUnitIds = value.items.map((item) => String(item?.studyUnit?.id || "").trim());
  if (studyUnitIds.some((id) => !id || id.length > 240) ||
      new Set(studyUnitIds).size !== studyUnitIds.length) {
    throw new TypeError("Página da inspeção inválida.");
  }
  const cursor = (cursorValue, expected) => {
    if (!expected) {
      if (cursorValue != null) throw new TypeError("Página da inspeção inválida.");
      return null;
    }
    const studyUnitId = String(cursorValue?.studyUnitId || "").trim();
    if (!studyUnitId || studyUnitId.length > 240 ||
        Object.keys(cursorValue || {}).some((field) => field !== "studyUnitId")) {
      throw new TypeError("Página da inspeção inválida.");
    }
    return { studyUnitId };
  };
  return {
    ...structuredClone(value),
    courseId,
    courseRevision,
    scope,
    previousCursor: cursor(value.previousCursor, value.hasPrevious),
    nextCursor: cursor(value.nextCursor, value.hasMore),
    pageBytes
  };
}

function normalizePendingCompositionSnapshot(value) {
  const allowed = new Set([
    "contract", "requestId", "courseId", "expectedCourseRevision",
    "courseRevision", "expectedStudyUnitVersion", "didacticMicrosequenceId",
    "studyUnit", "studyUnitVersion", "origin", "changed", "updatedAt",
    "savedAt", "inspectionItem", "inspectionScopeOptions"
  ]);
  if (!value || typeof value !== "object" || Array.isArray(value) ||
      value.contract !== PENDING_COMPOSITION_CACHE_CONTRACT ||
      Object.keys(value).length !== allowed.size ||
      Object.keys(value).some((field) => !allowed.has(field)) ||
      typeof value.changed !== "boolean") {
    throw new TypeError("Snapshot confirmado pendente inválido.");
  }
  const intent = normalizeFocalStudyUnitCompositionIntent({
    requestId: value.requestId,
    courseId: value.courseId,
    expectedCourseRevision: value.expectedCourseRevision,
    expectedStudyUnitVersion: value.expectedStudyUnitVersion,
    didacticMicrosequenceId: value.didacticMicrosequenceId,
    studyUnit: value.studyUnit,
    origin: value.origin
  });
  const courseRevision = Number(value.courseRevision);
  const studyUnitVersion = Number(value.studyUnitVersion);
  const expectedCourseRevision = intent.expectedCourseRevision + (value.changed ? 1 : 0);
  const expectedStudyUnitVersion = intent.expectedStudyUnitVersion + (value.changed ? 1 : 0);
  const updatedAt = String(value.updatedAt || "");
  const savedAt = String(value.savedAt || "");
  if (courseRevision !== expectedCourseRevision ||
      studyUnitVersion !== expectedStudyUnitVersion ||
      !updatedAt || Number.isNaN(Date.parse(updatedAt)) ||
      !savedAt || Number.isNaN(Date.parse(savedAt))) {
    throw new TypeError("Snapshot confirmado pendente inválido.");
  }
  let inspectionItem = null;
  let inspectionScopeOptions = null;
  if (value.inspectionItem != null) {
    const item = structuredClone(value.inspectionItem);
    if (!item || typeof item !== "object" || Array.isArray(item) ||
        item.studyUnit?.id !== intent.studyUnit.id ||
        Number(item.version) !== studyUnitVersion ||
        item.curriculumPath?.didacticMicrosequence?.id !==
          intent.didacticMicrosequenceId ||
        typeof item.deepLink !== "string" || !item.deepLink.trim() ||
        typeof item.updatedAt !== "string" || Number.isNaN(Date.parse(item.updatedAt))) {
      throw new TypeError("Item pendente de Conteúdo inválido.");
    }
    const normalizedItemIntent = normalizeFocalStudyUnitCompositionIntent({
      ...intent,
      expectedCourseRevision: courseRevision,
      expectedStudyUnitVersion: studyUnitVersion,
      studyUnit: item.studyUnit
    });
    inspectionItem = {
      ...item,
      studyUnit: normalizedItemIntent.studyUnit,
      version: studyUnitVersion,
      updatedAt: item.updatedAt
    };
    const options = structuredClone(value.inspectionScopeOptions);
    if (!options || typeof options !== "object" || Array.isArray(options) ||
        !Array.isArray(options.authoringParts) ||
        !Number.isSafeInteger(Number(options.unassignedStudyUnitCount)) ||
        Number(options.unassignedStudyUnitCount) < 0) {
      throw new TypeError("Opções pendentes de Conteúdo inválidas.");
    }
    inspectionScopeOptions = options;
  } else if (value.inspectionScopeOptions != null) {
    throw new TypeError("Opções pendentes de Conteúdo sem item.");
  }
  return {
    contract: PENDING_COMPOSITION_CACHE_CONTRACT,
    requestId: intent.requestId,
    courseId: intent.courseId,
    expectedCourseRevision: intent.expectedCourseRevision,
    courseRevision,
    expectedStudyUnitVersion: intent.expectedStudyUnitVersion,
    didacticMicrosequenceId: intent.didacticMicrosequenceId,
    studyUnit: intent.studyUnit,
    studyUnitVersion,
    origin: intent.origin,
    changed: value.changed,
    updatedAt,
    savedAt,
    inspectionItem,
    inspectionScopeOptions
  };
}

function normalizeInspectionPosition(courseId, value) {
  if (value == null) return null;
  const normalizedCourseId = String(courseId || "").trim().toLowerCase();
  const studyUnitId = String(value?.studyUnitId || "").trim();
  const offsetFromStickyTop = Number(value?.offsetFromStickyTop);
  const courseRevision = Number(value?.courseRevision);
  if (!UUID_PATTERN.test(normalizedCourseId) ||
      !value || typeof value !== "object" || Array.isArray(value) ||
      Object.keys(value).some((field) => !new Set([
        "scope", "studyUnitId", "offsetFromStickyTop", "courseRevision"
      ]).has(field)) ||
      !studyUnitId || studyUnitId.length > 240 ||
      !Number.isFinite(offsetFromStickyTop) || Math.abs(offsetFromStickyTop) > 100_000 ||
      !Number.isSafeInteger(courseRevision) || courseRevision < 1) {
    throw new TypeError("Posição da inspeção inválida.");
  }
  return {
    scope: normalizedInspectionScope(value.scope),
    studyUnitId,
    offsetFromStickyTop,
    courseRevision
  };
}

function inspectionRequestOptions({
  expectedRevision,
  scope = { kind: "course", id: null },
  anchorStudyUnitId = null,
  cursor = null,
  direction = "forward",
  limit = 12,
  maxBytes = 512 * 1024
} = {}) {
  const revision = Number(expectedRevision);
  const normalizedDirection = String(direction || "").trim();
  const normalizedAnchor = anchorStudyUnitId == null
    ? null
    : String(anchorStudyUnitId).trim();
  const normalizedCursor = cursor == null
    ? null
    : { studyUnitId: String(cursor?.studyUnitId || "").trim() };
  const normalizedLimit = Number(limit);
  const normalizedMaxBytes = Number(maxBytes);
  if (!Number.isSafeInteger(revision) || revision < 1 ||
      !new Set(["forward", "backward"]).has(normalizedDirection) ||
      (normalizedAnchor != null && (!normalizedAnchor || normalizedAnchor.length > 240)) ||
      (normalizedCursor != null && (
        !normalizedCursor.studyUnitId || normalizedCursor.studyUnitId.length > 240 ||
        Object.keys(cursor || {}).some((field) => field !== "studyUnitId")
      )) ||
      (normalizedAnchor != null && normalizedCursor != null) ||
      !Number.isSafeInteger(normalizedLimit) || normalizedLimit < 1 || normalizedLimit > 24 ||
      !Number.isSafeInteger(normalizedMaxBytes) || normalizedMaxBytes < 64 * 1024 ||
      normalizedMaxBytes > 1_500_000) {
    throw new TypeError("Paginação da inspeção inválida.");
  }
  const normalizedScope = normalizedInspectionScope(scope);
  return {
    expectedRevision: revision,
    scope: normalizedScope,
    anchorStudyUnitId: normalizedAnchor,
    cursor: normalizedCursor,
    direction: normalizedDirection,
    limit: normalizedLimit,
    maxBytes: normalizedMaxBytes
  };
}

function normalizeAuthoringOutline(courseId, value) {
  const normalizedCourseId = String(value?.courseId || "").trim().toLowerCase();
  const revision = Number(value?.revision);
  if (!value || typeof value !== "object" || Array.isArray(value) ||
      normalizedCourseId !== String(courseId || "").trim().toLowerCase() ||
      !UUID_PATTERN.test(normalizedCourseId) ||
      !Number.isSafeInteger(revision) || revision < 1 ||
      !value.outline || typeof value.outline !== "object" || Array.isArray(value.outline) ||
      !Array.isArray(value.outline.modules)) {
    throw new TypeError("Estrutura autoral inválida.");
  }
  return { ...structuredClone(value), courseId: normalizedCourseId, revision };
}

export class CourseController {
  constructor({
    api,
    store,
    ownerOnly = false,
    now = () => new Date().toISOString()
  } = {}) {
    if (!api || typeof api.listCourses !== "function" || typeof api.getCourse !== "function") {
      throw new TypeError("API de Cursos obrigatória.");
    }
    if (!store || typeof store.getCache !== "function" ||
        typeof store.putCache !== "function" ||
        typeof store.deleteCachePrefix !== "function") {
      throw new TypeError("Persistência local obrigatória.");
    }
    this.api = api;
    this.store = store;
    this.ownerOnly = ownerOnly === true;
    this.cachePrefix = this.ownerOnly ? "course-authoring.v1" : CACHE_PREFIX;
    this.now = now;
    this.accessibleCourseRefresh = null;
    this.compositionSourceSnapshots = new Map();
  }

  async #readPendingComposition(courseId) {
    const key = pendingCompositionCacheKey(courseId);
    const cached = cachedPayload(await this.store.getCache(key));
    if (cached == null) return null;
    try {
      return normalizePendingCompositionSnapshot(cached);
    } catch {
      await this.store.putCache(key, null);
      return null;
    }
  }

  #clearPendingComposition(courseId) {
    return this.store.putCache(pendingCompositionCacheKey(courseId), null);
  }

  clearPendingCourseCompositions() {
    return this.store.deleteCachePrefix(
      `${PENDING_COMPOSITION_CACHE_CONTRACT}:`
    );
  }

  async loadStudyDraftRecovery(sourceCourseId = null) {
    const requested = sourceCourseId == null ? null : String(sourceCourseId).trim().toLowerCase();
    if (requested !== null && !UUID_PATTERN.test(requested)) throw new TypeError("Curso inválido.");
    let pending;
    if (typeof this.store.moveCacheValue === "function") {
      const result = await this.store.moveCacheValue(LEGACY_DRAFT_CACHE_KEY, STUDY_DRAFT_RECOVERY_CACHE_KEY);
      pending = cachedPayload(result.value);
      // A second existing snapshot is never overwritten or deleted by migration.
      if (result.conflict && requested && pending?.sourceCourseId !== requested) {
        pending = cachedPayload(await this.store.getCache(LEGACY_DRAFT_CACHE_KEY));
      }
    } else {
      pending = cachedPayload(await this.store.getCache(STUDY_DRAFT_RECOVERY_CACHE_KEY)) ||
        cachedPayload(await this.store.getCache(LEGACY_DRAFT_CACHE_KEY));
    }
    return pending && (requested === null || pending.sourceCourseId === requested)
      ? structuredClone(pending) : null;
  }

  async recoverStudyDraft(sourceCourseId = null) {
    const pending = await this.loadStudyDraftRecovery(sourceCourseId);
    if (!pending) return null;
    let command;
    try {
      command = normalizeOwnedCourseCopyRecoveryCommand(Object.fromEntries([
        "requestId", "sourceCourseId", "expectedSourceCourseRevision", "expectedStudyUnitVersion",
        "didacticMicrosequenceId", "studyUnit", "origin"
      ].map((key) => [key, pending[key]])));
    } catch {
      return { status: "unresolved", targetCourseId: null, pending };
    }
    const result = await this.api.recoverOwnedCourseCopy(command);
    // Read-only evidence never reapplies a write or discards the user's draft.
    return { ...result, pending };
  }

  async clearStudyDraftRecovery(sourceCourseId = null, expectedRequestId = null) {
    const pending = await this.loadStudyDraftRecovery(sourceCourseId);
    if (!pending || expectedRequestId !== null && pending.requestId !== expectedRequestId) return false;
    let removed = false;
    const signature = JSON.stringify(pending);
    for (const key of [STUDY_DRAFT_RECOVERY_CACHE_KEY, LEGACY_DRAFT_CACHE_KEY]) {
      const remove = (cached) => {
        if (JSON.stringify(cachedPayload(cached)) !== signature) return cached;
        removed = true;
        return null;
      };
      if (typeof this.store.updateCache === "function") await this.store.updateCache(key, remove);
    }
    return removed;
  }

  async #readPendingBaseComposition(pending) {
    const prefixes = [...new Set([CACHE_PREFIX, this.cachePrefix])];
    for (const prefix of prefixes) {
      const cached = cachedPayload(await this.store.getCache(
        verifiedCompositionCacheKey(pending.courseId, prefix)
      ));
      const entityPageSize = Number(cached?.entityPageSize);
      if (cached?.contract !== VERIFIED_COMPOSITION_CACHE_CONTRACT ||
          cached.courseId !== pending.courseId ||
          Number(cached.revision) !== pending.expectedCourseRevision ||
          !Number.isSafeInteger(entityPageSize) || entityPageSize < 1 ||
          entityPageSize > 1_000) continue;
      const base = await this.#readVerifiedCachedDocument(
        pending.courseId,
        pending.expectedCourseRevision,
        entityPageSize,
        cached.course,
        prefix
      );
      if (base) return { ...base, entityPageSize, prefix };
    }
    return null;
  }

  async #ensureCompositionRecoveryBase(intent) {
    const reference = {
      courseId: intent.courseId,
      expectedCourseRevision: intent.expectedCourseRevision
    };
    let base = await this.#readPendingBaseComposition(reference);
    if (!base && typeof this.api.getCourseEntities === "function") {
      await this.loadCourseDocument(intent.courseId, {
        verifiedRevision: intent.expectedCourseRevision
      });
      base = await this.#readPendingBaseComposition(reference);
    }
    if (!base) return null;
    const row = base.rows.find((candidate) =>
      candidate?.entityType === "study_unit" &&
      candidate.entityId === intent.studyUnit.id
    );
    if (!row || row.parentId !== intent.didacticMicrosequenceId ||
        Number(row.version) !== intent.expectedStudyUnitVersion) {
      throw new TypeError("A composição local de recuperação não corresponde à Unidade editada.");
    }
    return base;
  }

  async #composePendingCourseDocument(pending) {
    const promotedCache = cachedPayload(await this.store.getCache(
      verifiedCompositionCacheKey(pending.courseId, CACHE_PREFIX)
    ));
    const promotedPageSize = Number(promotedCache?.entityPageSize);
    if (promotedCache?.contract === VERIFIED_COMPOSITION_CACHE_CONTRACT &&
        promotedCache.courseId === pending.courseId &&
        Number(promotedCache.revision) === pending.courseRevision &&
        Number.isSafeInteger(promotedPageSize) && promotedPageSize >= 1 &&
        promotedPageSize <= 1_000) {
      const promoted = await this.#readVerifiedCachedDocument(
        pending.courseId,
        pending.courseRevision,
        promotedPageSize,
        promotedCache.course,
        CACHE_PREFIX
      );
      const rowIndex = promoted?.rows?.findIndex((candidate) =>
        candidate?.entityType === "study_unit" &&
        candidate.entityId === pending.studyUnit.id
      );
      const row = promoted?.rows?.[rowIndex];
      if (promoted && rowIndex >= 0 &&
          row?.parentId === pending.didacticMicrosequenceId &&
          Number(row.version) === pending.studyUnitVersion) {
        const rows = structuredClone(promoted.rows);
        const content = structuredClone(pending.studyUnit);
        delete content.id;
        delete content.position;
        rows[rowIndex] = {
          ...rows[rowIndex],
          position: pending.studyUnit.position,
          content,
          version: pending.studyUnitVersion
        };
        const document = composeCourseDocument({
          id: String(promoted.course.courseId || "").trim(),
          title: String(promoted.course.title || "").trim(),
          goal: String(promoted.course.goal || "").trim()
        }, rows);
        return {
          ...promoted,
          rows,
          document,
          offline: true,
          stale: true,
          readOnly: true,
          pendingConfirmed: true,
          cachedAt: pending.savedAt,
          entityPageSize: promotedPageSize
        };
      }
    }
    const base = await this.#readPendingBaseComposition(pending);
    if (!base) return null;
    const rowIndex = base.rows.findIndex((row) =>
      row?.entityType === "study_unit" && row.entityId === pending.studyUnit.id
    );
    const previous = base.rows[rowIndex];
    if (rowIndex < 0 || previous?.parentId !== pending.didacticMicrosequenceId ||
        Number(previous?.version) !== pending.expectedStudyUnitVersion) return null;
    const content = structuredClone(pending.studyUnit);
    delete content.id;
    delete content.position;
    const rows = structuredClone(base.rows);
    rows[rowIndex] = {
      ...rows[rowIndex],
      position: pending.studyUnit.position,
      content,
      version: pending.studyUnitVersion
    };
    const course = {
      ...structuredClone(base.course),
      revision: pending.courseRevision
    };
    const document = composeCourseDocument({
      id: String(course.courseId || "").trim(),
      title: String(course.title || "").trim(),
      goal: String(course.goal || "").trim()
    }, rows);
    return {
      course,
      rows,
      document,
      offline: true,
      stale: true,
      readOnly: true,
      pendingConfirmed: true,
      cachedAt: pending.savedAt,
      entityPageSize: base.entityPageSize
    };
  }

  async #updateStudyListRevision(pending) {
    const update = (cached) => {
      const payload = cachedPayload(cached);
      if (!payload?.data?.items || !Array.isArray(payload.data.items)) return cached;
      let changed = false;
      const items = payload.data.items.map((item) => {
        if (item?.courseId !== pending.courseId ||
            Number(item.revision) > pending.courseRevision) return item;
        changed = true;
        return {
          ...item,
          revision: pending.courseRevision,
          updatedAt: pending.updatedAt
        };
      });
      if (!changed) return cached;
      return {
        ...cached,
        data: { ...payload.data, items }
      };
    };
    if (typeof this.store.updateCachePrefix === "function") {
      await this.store.updateCachePrefix(`${CACHE_PREFIX}.list:`, update);
      return;
    }
    const key = listCacheKey("", null, CACHE_PREFIX);
    const cached = await this.store.getCache(key);
    if (cached != null) await this.store.putCache(key, update(cached));
  }

  async #promotePendingStudyComposition(pending) {
    const composed = await this.#composePendingCourseDocument(pending);
    if (!composed) return null;
    const prefix = CACHE_PREFIX;
    const pageSize = composed.entityPageSize;
    const entityPrefix = `${prefix}.entities:${pending.courseId}:${pending.courseRevision}:`;
    await this.store.deleteCachePrefix(entityPrefix);
    let cursor = null;
    for (let index = 0; index < composed.rows.length; index += pageSize) {
      const items = composed.rows.slice(index, index + pageSize);
      const hasMore = index + pageSize < composed.rows.length;
      const last = items.at(-1);
      const nextCursor = hasMore
        ? { entityType: last.entityType, entityId: last.entityId }
        : null;
      await this.store.putCache(
        entityCacheKey(pending.courseId, pending.courseRevision, pageSize, cursor, prefix),
        {
          savedAt: pending.savedAt,
          data: {
            contract: "aralearn.course-entities.v1",
            courseId: pending.courseId,
            revision: pending.courseRevision,
            items,
            hasMore,
            nextCursor
          }
        }
      );
      cursor = nextCursor;
    }
    const course = {
      ...structuredClone(composed.course),
      revision: pending.courseRevision
    };
    await this.store.putCache(courseCacheKey(pending.courseId, prefix), {
      savedAt: pending.savedAt,
      data: course
    });
    await this.#promoteVerifiedComposition(
      pending.courseId,
      course,
      pageSize,
      prefix
    );
    await this.#updateStudyListRevision(pending);
    return composed;
  }

  async #capturePendingInspectionRecovery(intent, result) {
    const cached = cachedPayload(await this.store.getCache(
      authoringInspectionCacheKey(intent.courseId, this.cachePrefix)
    ));
    if (cached?.contract === "aralearn.course-authoring-inspection-cache.v1" &&
        Array.isArray(cached.entries)) {
      for (const entry of cached.entries.toReversed()) {
        let page;
        try {
          page = normalizeInspectionPage(entry?.page);
        } catch {
          continue;
        }
        const item = page.items.find((candidate) =>
          candidate?.studyUnit?.id === intent.studyUnit.id &&
          candidate?.curriculumPath?.didacticMicrosequence?.id ===
            intent.didacticMicrosequenceId
        );
        if (!item) continue;
        return {
          inspectionItem: {
            ...structuredClone(item),
            studyUnit: structuredClone(intent.studyUnit),
            version: result.studyUnitVersion,
            updatedAt: result.updatedAt
          },
          inspectionScopeOptions: structuredClone(page.scopeOptions)
        };
      }
    }
    const pendingShape = normalizePendingCompositionSnapshot({
      contract: PENDING_COMPOSITION_CACHE_CONTRACT,
      requestId: intent.requestId,
      courseId: intent.courseId,
      expectedCourseRevision: intent.expectedCourseRevision,
      courseRevision: result.courseRevision,
      expectedStudyUnitVersion: intent.expectedStudyUnitVersion,
      didacticMicrosequenceId: intent.didacticMicrosequenceId,
      studyUnit: intent.studyUnit,
      studyUnitVersion: result.studyUnitVersion,
      origin: intent.origin,
      changed: result.changed,
      updatedAt: result.updatedAt,
      savedAt: this.now(),
      inspectionItem: null,
      inspectionScopeOptions: null
    });
    const base = await this.#readPendingBaseComposition(pendingShape);
    const course = base?.document?.courses?.[0];
    let ordinal = 0;
    for (const [modulePosition, moduleValue] of (course?.modules || []).entries()) {
      for (const [lessonPosition, lesson] of (moduleValue.lessons || []).entries()) {
        for (const [microsequencePosition, microsequence] of
          (lesson.microsequences || []).entries()) {
          for (const studyUnit of microsequence.studyUnits || []) {
            ordinal += 1;
            if (studyUnit.id !== intent.studyUnit.id ||
                microsequence.id !== intent.didacticMicrosequenceId) continue;
            return {
              inspectionItem: {
                studyUnit: structuredClone(intent.studyUnit),
                version: result.studyUnitVersion,
                updatedAt: result.updatedAt,
                ordinal,
                curriculumPath: {
                  module: {
                    id: moduleValue.id,
                    position: modulePosition,
                    title: moduleValue.title
                  },
                  lesson: {
                    id: lesson.id,
                    position: lessonPosition,
                    title: lesson.title
                  },
                  didacticMicrosequence: {
                    id: microsequence.id,
                    position: microsequencePosition,
                    title: microsequence.title
                  }
                },
                authoringPart: null,
                deepLink: `#/authoring/courses/${intent.courseId}` +
                  `?section=content&studyUnitId=${encodeURIComponent(intent.studyUnit.id)}`
              },
              inspectionScopeOptions: {
                authoringParts: [],
                unassignedStudyUnitCount: 1
              }
            };
          }
        }
      }
    }
    return { inspectionItem: null, inspectionScopeOptions: null };
  }

  async #rememberPendingComposition(intent, result) {
    const recovery = await this.#capturePendingInspectionRecovery(intent, result);
    const snapshot = normalizePendingCompositionSnapshot({
      contract: PENDING_COMPOSITION_CACHE_CONTRACT,
      requestId: intent.requestId,
      courseId: intent.courseId,
      expectedCourseRevision: intent.expectedCourseRevision,
      courseRevision: result.courseRevision,
      expectedStudyUnitVersion: intent.expectedStudyUnitVersion,
      didacticMicrosequenceId: intent.didacticMicrosequenceId,
      studyUnit: intent.studyUnit,
      studyUnitVersion: result.studyUnitVersion,
      origin: intent.origin,
      changed: result.changed,
      updatedAt: result.updatedAt,
      savedAt: this.now(),
      ...recovery
    });
    await this.store.putCache(pendingCompositionCacheKey(intent.courseId), snapshot);
    return snapshot;
  }

  #pendingInspectionPage(pending, options) {
    const item = pending?.inspectionItem;
    if (!item || options.expectedRevision !== pending.courseRevision || options.cursor != null ||
        options.anchorStudyUnitId != null &&
          options.anchorStudyUnitId !== pending.studyUnit.id) return null;
    const path = item.curriculumPath;
    const partId = item.authoringPart?.id || null;
    const scopeMatches = options.scope.kind === "course" ||
      options.scope.kind === "unassigned" && partId == null ||
      options.scope.kind === "authoring_part" && partId === options.scope.id ||
      options.scope.kind === "module" && path?.module?.id === options.scope.id ||
      options.scope.kind === "lesson" && path?.lesson?.id === options.scope.id ||
      options.scope.kind === "didactic_microsequence" &&
        path?.didacticMicrosequence?.id === options.scope.id;
    if (!scopeMatches) return null;
    const page = normalizeInspectionPage({
      contract: AUTHORING_INSPECTION_PAGE_CONTRACT,
      courseId: pending.courseId,
      courseRevision: pending.courseRevision,
      scope: options.scope,
      totalCount: 1,
      scopeOptions: structuredClone(pending.inspectionScopeOptions),
      items: [{ ...structuredClone(item), ordinal: 1 }],
      hasPrevious: false,
      hasMore: false,
      previousCursor: null,
      nextCursor: null,
      pageBytes: 0
    });
    page.pageBytes = new TextEncoder().encode(JSON.stringify(page)).byteLength;
    return page;
  }

  async #overlayPendingCourseList(page) {
    const items = await Promise.all(page.items.map(async (item) => {
      if (item.ownership !== "owned" || item.canEdit !== true) return item;
      const pending = await this.#readPendingComposition(item.courseId);
      if (!pending || item.revision > pending.courseRevision) return item;
      return {
        ...item,
        revision: pending.courseRevision,
        updatedAt: pending.updatedAt
      };
    }));
    const changed = items.some((item, index) => item !== page.items[index]);
    return changed ? { ...page, items, stale: true } : page;
  }

  async #overlayPendingCourseHeader(courseId, value) {
    const pending = await this.#readPendingComposition(courseId);
    if (!pending || Number(value?.revision) > pending.courseRevision) return value;
    return {
      ...value,
      revision: pending.courseRevision,
      updatedAt: pending.updatedAt,
      stale: true
    };
  }

  async #inspectionReconcilesPending(page) {
    const pending = await this.#readPendingComposition(page.courseId);
    if (!pending || page.courseRevision < pending.courseRevision) return false;
    if (page.courseRevision === pending.courseRevision) {
      const item = page.items.find(({ studyUnit }) =>
        studyUnit?.id === pending.studyUnit.id
      );
      if (!item || Number(item.version) !== pending.studyUnitVersion ||
          item.curriculumPath?.didacticMicrosequence?.id !==
            pending.didacticMicrosequenceId) return false;
      const reconciled = normalizePendingCompositionSnapshot({
        ...pending,
        studyUnit: item.studyUnit,
        studyUnitVersion: item.version,
        updatedAt: item.updatedAt,
        inspectionItem: pending.inspectionItem
          ? {
              ...structuredClone(pending.inspectionItem),
              studyUnit: structuredClone(item.studyUnit),
              version: item.version,
              updatedAt: item.updatedAt,
              curriculumPath: structuredClone(item.curriculumPath)
            }
          : null,
        inspectionScopeOptions: pending.inspectionItem
          ? pending.inspectionScopeOptions
          : null
      });
      await this.#promotePendingStudyComposition(reconciled);
    } else {
      await Promise.all([
        this.store.deleteCachePrefix(`${CACHE_PREFIX}.list:`),
        this.store.deleteCachePrefix(courseCacheKey(page.courseId, CACHE_PREFIX)),
        this.store.deleteCachePrefix(
          verifiedCompositionCacheKey(page.courseId, CACHE_PREFIX)
        ),
        this.store.deleteCachePrefix(`${CACHE_PREFIX}.entities:${page.courseId}:`)
      ]);
    }
    await this.#clearPendingComposition(page.courseId);
    return true;
  }

  async #purgeCoursePrivacyCache(courseId, { clearLists = false } = {}) {
    for (const [requestId, snapshot] of this.compositionSourceSnapshots) {
      if (snapshot.courseId === courseId) this.compositionSourceSnapshots.delete(requestId);
    }
    await Promise.all([
      ...(clearLists ? [this.store.deleteCachePrefix(`${this.cachePrefix}.list:`)] : []),
      this.store.deleteCachePrefix(courseCacheKey(courseId, this.cachePrefix)),
      this.store.deleteCachePrefix(verifiedCompositionCacheKey(courseId, this.cachePrefix)),
      this.store.deleteCachePrefix(instructionalPlanCacheKey(courseId, this.cachePrefix)),
      this.store.deleteCachePrefix(`${this.cachePrefix}.course-design:${courseId}:`),
      this.store.deleteCachePrefix(courseSourcesCachePrefix(courseId, this.cachePrefix)),
      this.store.deleteCachePrefix(authoringOutlineCacheKey(courseId, this.cachePrefix)),
      this.store.deleteCachePrefix(authoringInspectionCacheKey(courseId, this.cachePrefix)),
      this.store.deleteCachePrefix(authoringInspectionPositionKey(courseId, this.cachePrefix)),
      this.store.deleteCachePrefix(`${this.cachePrefix}.entities:${courseId}:`),
      this.store.deleteCachePrefix(pendingCompositionCacheKey(courseId)),
      this.store.deleteCachePrefix(`${COURSE_ANNOTATION_CACHE_CONTRACT}:${courseId}`),
      this.store.deleteCachePrefix(`${COURSE_ANNOTATION_OUTBOX_CONTRACT}:${courseId}`),
      this.store.deleteCachePrefix(`${COURSE_PERSONAL_STATE_CACHE_CONTRACT}:${courseId}`),
      this.store.deleteCachePrefix(REVIEW_PAGE_CACHE_KEY)
    ]);
  }

  async #replaceAccessibleCourseIds(courseIds) {
    const previous = cachedAccessibleCourseIds(
      await this.store.getCache(ACCESSIBLE_COURSE_IDS_CACHE_KEY)
    );
    if (previous) {
      for (const courseId of previous) {
        if (!courseIds.has(courseId)) {
          await this.#purgeCoursePrivacyCache(courseId);
        }
      }
    }
    await this.store.putCache(ACCESSIBLE_COURSE_IDS_CACHE_KEY, {
      contract: ACCESSIBLE_COURSE_IDS_CONTRACT,
      courseIds: [...courseIds].sort()
    });
  }

  async #observeAccessibleCoursePage(page, { query, cursor }) {
    if (this.ownerOnly || String(query || "").trim() || page?.offline === true) {
      this.accessibleCourseRefresh = null;
      return;
    }
    const pageCourseIds = courseIdsFromList(page?.items);
    if (!pageCourseIds) {
      this.accessibleCourseRefresh = null;
      return;
    }
    if (!cursor) {
      this.accessibleCourseRefresh = { courseIds: pageCourseIds, expectedCursor: null };
    } else {
      if (!this.accessibleCourseRefresh ||
          this.accessibleCourseRefresh.expectedCursor !== stableCursor(cursor)) {
        this.accessibleCourseRefresh = null;
        return;
      }
      for (const courseId of pageCourseIds) {
        this.accessibleCourseRefresh.courseIds.add(courseId);
      }
    }
    if (page.hasMore === true) {
      if (!page.nextCursor) {
        this.accessibleCourseRefresh = null;
        return;
      }
      this.accessibleCourseRefresh.expectedCursor = stableCursor(page.nextCursor);
      return;
    }
    const completeCourseIds = this.accessibleCourseRefresh.courseIds;
    this.accessibleCourseRefresh = null;
    await this.#replaceAccessibleCourseIds(completeCourseIds);
  }

  async #readThrough(key, readRemote, {
    accessSensitive = false,
    allowOffline = true,
    invalidationPrefixes = [],
    normalize = (value) => value
  } = {}) {
    try {
      const remote = normalize(await readRemote());
      await this.store.putCache(key, {
        savedAt: this.now(),
        data: remote
      });
      return { ...structuredClone(remote), offline: false, stale: false };
    } catch (error) {
      if (accessSensitive && accessWasRevoked(error)) {
        await this.store.putCache(key, null);
        await Promise.all(invalidationPrefixes.map((prefix) =>
          this.store.deleteCachePrefix(prefix)
        ));
      }
      if (!allowOffline || !retryableReadFailure(error)) throw error;
      const cached = cachedPayload(await this.store.getCache(key));
      if (!cached?.data) throw error;
      const cachedData = normalize(cached.data);
      return {
        ...structuredClone(cachedData),
        offline: true,
        stale: true,
        cachedAt: cached.savedAt || null,
        readOnly: true
      };
    }
  }

  async listCourses({ query = "", limit = 24, cursor = null } = {}) {
    const key = listCacheKey(query, cursor, this.cachePrefix);
    const page = await this.#readThrough(
      key,
      async () => {
        const page = await this.api.listCourses({
          query,
          limit,
          cursor,
          ownerOnly: this.ownerOnly
        });
        if (!cursor) {
          await this.store.deleteCachePrefix(`${this.cachePrefix}.list:`);
        }
        return page;
      },
      {
        normalize: normalizeCourseListPage
      }
    );
    await this.#observeAccessibleCoursePage(page, { query, cursor });
    return this.#overlayPendingCourseList(page);
  }

  async getCourse(courseId) {
    const key = courseCacheKey(courseId, this.cachePrefix);
    const previous = cachedPayload(await this.store.getCache(key))?.data;
    const result = await this.#readThrough(
      key,
      () => this.api.getCourse(courseId, { ownerOnly: this.ownerOnly }),
      {
      accessSensitive: true,
      invalidationPrefixes: [
        `${this.cachePrefix}.list:`,
        courseCacheKey(courseId, this.cachePrefix),
        verifiedCompositionCacheKey(courseId, this.cachePrefix),
        instructionalPlanCacheKey(courseId, this.cachePrefix),
        `${this.cachePrefix}.course-design:${courseId}:`,
        courseSourcesCachePrefix(courseId, this.cachePrefix),
        authoringOutlineCacheKey(courseId, this.cachePrefix),
        authoringInspectionCacheKey(courseId, this.cachePrefix),
        authoringInspectionPositionKey(courseId, this.cachePrefix),
        `${this.cachePrefix}.entities:${courseId}:`,
        pendingCompositionCacheKey(courseId),
        `${COURSE_PERSONAL_STATE_CACHE_CONTRACT}:${courseId}`,
        REVIEW_PAGE_CACHE_KEY
      ]
      }
    );
    const previousRevision = Number(previous?.revision);
    const currentRevision = Number(result?.revision);
    if (result.offline !== true && Number.isSafeInteger(previousRevision) &&
        Number.isSafeInteger(currentRevision) && previousRevision !== currentRevision) {
      await Promise.all([
        this.store.deleteCachePrefix(instructionalPlanCacheKey(courseId, this.cachePrefix)),
        this.store.deleteCachePrefix(`${this.cachePrefix}.course-design:${courseId}:`),
        this.store.deleteCachePrefix(courseSourcesCachePrefix(courseId, this.cachePrefix)),
        this.store.deleteCachePrefix(authoringOutlineCacheKey(courseId, this.cachePrefix)),
        this.store.deleteCachePrefix(authoringInspectionCacheKey(courseId, this.cachePrefix))
      ]);
    }
    return this.#overlayPendingCourseHeader(courseId, result);
  }

  getCourseEntities(courseId, { revision, cursor = null, limit = 500 } = {}) {
    const key = entityCacheKey(courseId, revision, limit, cursor, this.cachePrefix);
    return this.#readThrough(
      key,
      () => this.api.getCourseEntities(courseId, {
        revision,
        cursor,
        limit,
        ownerOnly: this.ownerOnly
      }),
      {
        accessSensitive: true,
        invalidationPrefixes: [
          `${this.cachePrefix}.list:`,
          courseCacheKey(courseId, this.cachePrefix),
          verifiedCompositionCacheKey(courseId, this.cachePrefix),
          `${this.cachePrefix}.entities:${courseId}:`,
          pendingCompositionCacheKey(courseId),
          `${COURSE_PERSONAL_STATE_CACHE_CONTRACT}:${courseId}`,
          REVIEW_PAGE_CACHE_KEY
        ]
      }
    );
  }

  async getStudyUnitCitations(courseId, studyUnitId, { expectedRevision } = {}) {
    if (typeof this.api.getStudyUnitCitations !== "function") {
      throw new TypeError("A API de Cursos não oferece citações de Estudo.");
    }
    const normalizedCourseId = String(courseId || "").trim().toLowerCase();
    const normalizedStudyUnitId = String(studyUnitId || "").trim();
    const normalizedRevision = Number(expectedRevision);
    if (!UUID_PATTERN.test(normalizedCourseId) ||
        !normalizedStudyUnitId || normalizedStudyUnitId !== studyUnitId ||
        !courseSourceOpaqueId(normalizedStudyUnitId) ||
        !Number.isSafeInteger(normalizedRevision) || normalizedRevision < 1) {
      throw new TypeError("Leitura de citações inválida.");
    }
    try {
      const result = normalizeCourseStudyCitationsRead(
        await this.api.getStudyUnitCitations(
          normalizedCourseId,
          normalizedStudyUnitId,
          { expectedRevision: normalizedRevision }
        )
      );
      if (result.courseRevision !== normalizedRevision) {
        throw courseRevisionChangedError();
      }
      if (result.courseId !== normalizedCourseId ||
          result.studyUnitId !== normalizedStudyUnitId) {
        throw new TypeError("As citações não correspondem à Unidade solicitada.");
      }
      return result;
    } catch (error) {
      const normalizedError = courseRevisionConflict(error)
        ? courseRevisionChangedError(error)
        : error;
      if (accessWasRevoked(normalizedError)) {
        await this.#purgeCoursePrivacyCache(normalizedCourseId, { clearLists: true });
      }
      throw normalizedError;
    }
  }

  async #readVerifiedCachedDocument(
    courseId,
    revision,
    entityPageSize,
    preservedCourse = null,
    prefix = this.cachePrefix
  ) {
    const cachedCourse = preservedCourse || cachedPayload(await this.store.getCache(
      courseCacheKey(courseId, prefix)
    ))?.data;
    if (String(cachedCourse?.courseId || "").trim().toLowerCase() !== courseId ||
        Number(cachedCourse?.revision) !== revision) return null;
    const rows = [];
    const cursors = new Set();
    let cursor = null;
    for (let pageIndex = 0; pageIndex < MAX_ENTITY_PAGES; pageIndex += 1) {
      const page = cachedPayload(await this.store.getCache(
        entityCacheKey(courseId, revision, entityPageSize, cursor, prefix)
      ))?.data;
      if (!validCourseEntityPage(page, courseId, revision)) return null;
      rows.push(...page.items);
      if (page.hasMore !== true) {
        let document;
        try {
          document = composeCourseDocument({
            id: String(cachedCourse.courseId || "").trim(),
            title: String(cachedCourse.title || "").trim(),
            goal: String(cachedCourse.goal || "").trim()
          }, rows);
        } catch {
          await this.store.deleteCachePrefix(
            `${prefix}.entities:${courseId}:${revision}:`
          );
          return null;
        }
        return {
          course: structuredClone(cachedCourse),
          rows,
          document,
          offline: false,
          stale: false,
          cacheVerified: true
        };
      }
      if (!page.nextCursor) return null;
      const cursorKey = JSON.stringify(page.nextCursor);
      if (cursors.has(cursorKey)) return null;
      cursors.add(cursorKey);
      cursor = page.nextCursor;
    }
    return null;
  }

  async #readLastVerifiedComposition(courseId) {
    const key = verifiedCompositionCacheKey(courseId, this.cachePrefix);
    const cached = cachedPayload(await this.store.getCache(key));
    const revision = Number(cached?.revision);
    const entityPageSize = Number(cached?.entityPageSize);
    if (cached?.contract !== VERIFIED_COMPOSITION_CACHE_CONTRACT ||
        String(cached?.courseId || "").trim().toLowerCase() !== courseId ||
        !Number.isSafeInteger(revision) || revision < 1 ||
        !Number.isSafeInteger(entityPageSize) || entityPageSize < 1 ||
        entityPageSize > 1_000) {
      if (cached != null) await this.#clearCacheValueIfUnchanged(key, cached);
      return null;
    }
    const result = await this.#readVerifiedCachedDocument(
      courseId,
      revision,
      entityPageSize,
      cached.course
    );
    if (!result) {
      await this.#clearCacheValueIfUnchanged(key, cached);
      return null;
    }
    return {
      ...result,
      stale: true,
      readOnly: true,
      cachedAt: cached.savedAt || null
    };
  }

  async #clearCacheValueIfUnchanged(key, expected) {
    const signature = JSON.stringify(expected);
    let removed = false;
    const clearExpected = (cached) => {
      const current = cachedPayload(cached);
      if (JSON.stringify(current) !== signature) return cached;
      removed = true;
      return null;
    };
    if (typeof this.store.updateCache === "function") {
      await this.store.updateCache(key, clearExpected);
    } else {
      const current = await this.store.getCache(key);
      const next = clearExpected(current);
      if (removed) await this.store.putCache(key, next);
    }
    return removed;
  }

  async hasVerifiedCourseDocument(courseId, { revision = null } = {}) {
    const normalizedCourseId = String(courseId || "").trim().toLowerCase();
    if (!UUID_PATTERN.test(normalizedCourseId)) {
      throw new TypeError("A identidade do Curso é inválida.");
    }
    const cached = cachedPayload(await this.store.getCache(
      verifiedCompositionCacheKey(normalizedCourseId, this.cachePrefix)
    ));
    const cachedRevision = Number(cached?.revision);
    const entityPageSize = Number(cached?.entityPageSize);
    const expectedRevision = revision == null ? null : Number(revision);
    if (expectedRevision != null &&
        (!Number.isSafeInteger(expectedRevision) || expectedRevision < 1)) {
      throw new TypeError("A versão do Curso é inválida.");
    }
    if (cached?.contract !== VERIFIED_COMPOSITION_CACHE_CONTRACT ||
        String(cached?.courseId || "").trim().toLowerCase() !== normalizedCourseId ||
        !Number.isSafeInteger(cachedRevision) || cachedRevision < 1 ||
        !Number.isSafeInteger(entityPageSize) || entityPageSize < 1 ||
        entityPageSize > 1_000 ||
        (expectedRevision != null && cachedRevision !== expectedRevision)) {
      return false;
    }
    return Boolean(await this.#readVerifiedCachedDocument(
      normalizedCourseId,
      cachedRevision,
      entityPageSize,
      cached.course
    ));
  }

  async #promoteVerifiedComposition(
    courseId,
    course,
    entityPageSize,
    prefix = this.cachePrefix
  ) {
    const key = verifiedCompositionCacheKey(courseId, prefix);
    const revision = Number(course.revision);
    const candidate = {
      contract: VERIFIED_COMPOSITION_CACHE_CONTRACT,
      courseId,
      revision,
      entityPageSize,
      course: structuredClone(course),
      savedAt: this.now()
    };
    let previousRevision = null;
    let promoted = false;
    const choose = (cached) => {
      const previous = cachedPayload(cached);
      previousRevision = Number(previous?.revision);
      if (Number.isSafeInteger(previousRevision) && previousRevision > revision) {
        return cached;
      }
      promoted = true;
      return candidate;
    };
    if (typeof this.store.updateCache === "function") {
      await this.store.updateCache(key, choose);
    } else {
      const current = await this.store.getCache(key);
      const next = choose(current);
      if (promoted) await this.store.putCache(key, next);
    }
    if (promoted && Number.isSafeInteger(previousRevision) &&
        previousRevision !== revision) {
      await this.store.deleteCachePrefix(
        `${prefix}.entities:${courseId}:${previousRevision}:`
      );
    }
    return promoted;
  }

  async loadCourseDocument(courseId, {
    entityPageSize = 500,
    verifiedRevision = null
  } = {}) {
    if (!Number.isSafeInteger(entityPageSize) || entityPageSize < 1 || entityPageSize > 1_000) {
      throw new TypeError("O tamanho da página de entidades é inválido.");
    }
    const pending = await this.#readPendingComposition(courseId);
    const requestedRevision = verifiedRevision == null ? null : Number(verifiedRevision);
    const pendingFallback = pending &&
      (requestedRevision == null || requestedRevision <= pending.courseRevision)
      ? await this.#composePendingCourseDocument(pending)
      : null;
    if (verifiedRevision != null) {
      const revision = requestedRevision;
      if (!Number.isSafeInteger(revision) || revision < 1) {
        throw new TypeError("A versão verificada do Curso é inválida.");
      }
      if (!pendingFallback) {
        const cached = await this.#readVerifiedCachedDocument(
          courseId,
          revision,
          entityPageSize
        );
        if (cached) {
          await this.#promoteVerifiedComposition(courseId, cached.course, entityPageSize);
          if (pending && revision >= pending.courseRevision) {
            await this.#clearPendingComposition(courseId);
          }
          return cached;
        }
      }
    }
    let course;
    try {
      course = await this.getCourse(courseId);
    } catch (error) {
      if (pendingFallback && retryableReadFailure(error)) return pendingFallback;
      throw error;
    }
    const revision = Number(course?.revision);
    if (!Number.isSafeInteger(revision) || revision < 1) {
      throw new TypeError("A versão do Curso é inválida.");
    }
    const rows = [];
    const cursors = new Set();
    let cursor = null;
    let offline = course.offline === true;
    let stale = course.stale === true;
    try {
      for (let pageIndex = 0; pageIndex < MAX_ENTITY_PAGES; pageIndex += 1) {
        const page = await this.getCourseEntities(courseId, {
          revision,
          cursor,
          limit: entityPageSize
        });
        const pageRevision = Number(page?.revision);
        if (pageRevision !== revision) {
          const error = new Error("O Curso mudou durante a leitura; atualize e tente novamente.");
          error.name = "CourseRevisionChangedError";
          error.code = "course_revision_changed";
          error.expectedRevision = revision;
          error.currentRevision = pageRevision || null;
          throw error;
        }
        if (!validCourseEntityPage(page, courseId, revision)) {
          throw invalidCourseComposition("A página de entidades do Curso é inválida.");
        }
        rows.push(...page.items);
        offline ||= page.offline === true;
        stale ||= page.stale === true;
        if (page.hasMore !== true) {
          const document = composeCourseDocument({
            id: String(course?.courseId || "").trim(),
            title: String(course?.title || "").trim(),
            goal: String(course?.goal || "").trim()
          }, rows);
          await this.#promoteVerifiedComposition(courseId, course, entityPageSize);
          if (pending && offline !== true && stale !== true &&
              revision >= pending.courseRevision) {
            await this.#clearPendingComposition(courseId);
          }
          if (pendingFallback && (offline === true || stale === true ||
              revision < pending.courseRevision)) return pendingFallback;
          return {
            course,
            rows,
            document,
            offline,
            stale,
            ...(offline ? { readOnly: true } : {})
          };
        }
        if (!page.nextCursor) {
          throw invalidCourseComposition("A página omitiu o cursor seguinte.");
        }
        const cursorKey = JSON.stringify(page.nextCursor);
        if (cursors.has(cursorKey)) {
          throw invalidCourseComposition("A paginação repetiu o mesmo cursor.");
        }
        cursors.add(cursorKey);
        cursor = page.nextCursor;
      }
      throw invalidCourseComposition("O Curso excedeu o limite seguro de páginas.");
    } catch (error) {
      if (pendingFallback && (retryableReadFailure(error) ||
          isInvalidCourseComposition(error))) return pendingFallback;
      if (!isInvalidCourseComposition(error)) throw error;
      await this.store.deleteCachePrefix(
        `${this.cachePrefix}.entities:${courseId}:${revision}:`
      );
      const preserved = await this.#readLastVerifiedComposition(courseId);
      if (!preserved) throw error;
      await this.store.putCache(courseCacheKey(courseId, this.cachePrefix), {
        savedAt: preserved.cachedAt || this.now(),
        data: structuredClone(preserved.course)
      });
      return preserved;
    }
  }

  clearCourse(courseId, { clearLists = true } = {}) {
    return this.#purgeCoursePrivacyCache(courseId, { clearLists: clearLists !== false });
  }

  loadAuthoringPlan(courseId) {
    const key = instructionalPlanCacheKey(courseId, this.cachePrefix);
    return this.#readThrough(
      key,
      () => this.api.loadAuthoringPlan(courseId),
      {
        accessSensitive: true,
        invalidationPrefixes: [
          `${this.cachePrefix}.list:`,
          courseCacheKey(courseId, this.cachePrefix),
          instructionalPlanCacheKey(courseId, this.cachePrefix),
          `${this.cachePrefix}.course-design:${courseId}:`,
          courseSourcesCachePrefix(courseId, this.cachePrefix),
          pendingCompositionCacheKey(courseId),
          `${this.cachePrefix}.entities:${courseId}:`
        ]
      }
    );
  }

  async loadCourseDesign(courseId, options = {}) {
    if (typeof this.api.loadCourseDesign !== "function") {
      throw new TypeError("A API de Cursos não oferece os parâmetros de Autoria.");
    }
    const normalizedOptions = courseDesignReadOptions(courseId, options);
    const normalizedCourseId = String(courseId).trim().toLowerCase();
    await this.store.deleteCachePrefix(
      `${this.cachePrefix}.course-design:${normalizedCourseId}:`
    );
    try {
      return structuredClone(
        await this.api.loadCourseDesign(normalizedCourseId, normalizedOptions)
      );
    } catch (error) {
      if (accessWasRevoked(error)) {
        await this.#purgeCoursePrivacyCache(normalizedCourseId, { clearLists: true });
      }
      throw error;
    }
  }

  async loadCourseSources(courseId, options = {}) {
    if (!this.ownerOnly || typeof this.api.loadCourseSources !== "function") {
      throw new TypeError("A API de Autoria não oferece o catálogo privado de Fontes.");
    }
    const normalizedCourseId = String(courseId || "").trim().toLowerCase();
    const normalizedOptions = courseSourcesReadOptions(normalizedCourseId, options);
    await this.store.deleteCachePrefix(
      courseSourcesCachePrefix(normalizedCourseId, this.cachePrefix)
    );
    try {
      const result = normalizeCourseSourcesRead(
        await this.api.loadCourseSources(normalizedCourseId, normalizedOptions)
      );
      const expectedQuery = {
        sourceId: normalizedOptions.sourceId,
        targetKind: normalizedOptions.targetKind,
        targetId: normalizedOptions.targetId
      };
      if (result.courseId !== normalizedCourseId ||
          result.courseRevision !== normalizedOptions.expectedRevision ||
          result.mode !== normalizedOptions.mode ||
          result.query.sourceId !== expectedQuery.sourceId ||
          result.query.targetKind !== expectedQuery.targetKind ||
          result.query.targetId !== expectedQuery.targetId ||
          result.nextCursor !== null &&
            !/^[A-Za-z0-9+/_-]+={0,2}$/u.test(result.nextCursor) ||
          normalizedOptions.mode !== "catalog" && (result.items.length > 1 ||
            result.nextCursor !== null) ||
          normalizedOptions.mode === "source" && result.items.some(({ sourceId }) =>
            sourceId !== normalizedOptions.sourceId) ||
          normalizedOptions.mode === "target" &&
            result.items.some(({ targetKind, targetId }) =>
              targetKind !== normalizedOptions.targetKind ||
              targetId !== normalizedOptions.targetId)) {
        throw new TypeError("A leitura de Fontes não corresponde ao pedido.");
      }
      return result;
    } catch (error) {
      if (accessWasRevoked(error)) {
        await this.#purgeCoursePrivacyCache(normalizedCourseId, { clearLists: true });
      }
      throw error;
    }
  }

  async getCourseSourceAttachmentDownload(value = {}) {
    if (typeof this.api.getCourseSourceAttachmentDownload !== "function") {
      throw new TypeError("A API de Cursos não oferece a leitura de anexos de Fonte.");
    }
    if (!value || typeof value !== "object" || Array.isArray(value) ||
        Object.keys(value).some((field) => !new Set([
          "courseId", "expectedCourseRevision", "sourceId", "sourceRevision",
          "contentHash"
        ]).has(field))) {
      throw new TypeError("Leitura do anexo de Fonte inválida.");
    }
    const courseId = String(value.courseId || "").trim().toLowerCase();
    try {
      const result = normalizeCourseSourcePdfDownload(
        await this.api.getCourseSourceAttachmentDownload({
          courseId,
          expectedRevision: value.expectedCourseRevision,
          sourceId: value.sourceId,
          sourceRevision: value.sourceRevision,
          contentHash: value.contentHash
        })
      );
      if (result.courseId !== courseId ||
          result.courseRevision !== value.expectedCourseRevision ||
          result.sourceId !== value.sourceId ||
          result.sourceRevision !== value.sourceRevision ||
          result.attachment.contentHash !== value.contentHash) {
        throw new TypeError("A leitura do anexo não corresponde ao pedido.");
      }
      return result;
    } catch (error) {
      if (accessWasRevoked(error)) {
        await this.#purgeCoursePrivacyCache(courseId, { clearLists: true });
      }
      throw error;
    }
  }

  async loadCourseAnchoredAnnotations(courseId, value = {}) {
    if (!this.ownerOnly || typeof this.api.loadCourseAnchoredAnnotations !== "function") {
      throw new TypeError("A API de Autoria não oferece a inbox de observações.");
    }
    const normalizedCourseId = String(courseId || "").trim().toLowerCase();
    const options = courseAnchoredAnnotationReadOptions(normalizedCourseId, value);
    try {
      const page = normalizeCourseAnchoredAnnotationPage(
        await this.api.loadCourseAnchoredAnnotations(normalizedCourseId, options)
      );
      if (page.courseId !== normalizedCourseId ||
          page.courseRevision !== options.expectedCourseRevision ||
          options.annotationSetVersion !== null &&
            page.annotationSetVersion !== options.annotationSetVersion ||
          JSON.stringify(normalizeCourseAnchoredAnnotationQuery(page.query)) !==
            JSON.stringify(options.query) ||
          page.items.some((annotation) => annotation.courseId !== normalizedCourseId)) {
        throw new TypeError("A leitura de observações não corresponde ao pedido.");
      }
      return page;
    } catch (error) {
      if (annotationAccessWasRevoked(error)) {
        await this.#purgeCoursePrivacyCache(normalizedCourseId, { clearLists: true });
      }
      throw error;
    }
  }

  async loadCourseAuthoringAnalytics(courseId, value = {}) {
    if (!this.ownerOnly || typeof this.api.loadCourseAuthoringAnalytics !== "function") {
      throw new TypeError("A API de Autoria não oferece Analytics.");
    }
    if (!value || typeof value !== "object" || Array.isArray(value) ||
        Object.keys(value).some((field) => !new Set([
          "expectedCourseRevision", "query"
        ]).has(field))) {
      throw new TypeError("Leitura de Analytics inválida.");
    }
    const normalizedCourseId = String(courseId || "").trim().toLowerCase();
    const expectedCourseRevision = Number(value.expectedCourseRevision);
    if (!UUID_PATTERN.test(normalizedCourseId) ||
        !Number.isSafeInteger(expectedCourseRevision) || expectedCourseRevision < 1) {
      throw new TypeError("Leitura de Analytics inválida.");
    }
    const query = normalizeCourseAuthoringAnalyticsQuery(value.query ?? {});
    try {
      const page = normalizeCourseAuthoringAnalyticsPage(
        await this.api.loadCourseAuthoringAnalytics(normalizedCourseId, {
          expectedCourseRevision,
          query
        }),
        { expectedCourseId: normalizedCourseId, expectedQuery: query }
      );
      if (page.course.revision !== expectedCourseRevision) {
        throw new TypeError("O snapshot de Analytics não corresponde ao pedido.");
      }
      return page;
    } catch (error) {
      if (accessWasRevoked(error)) {
        await this.#purgeCoursePrivacyCache(normalizedCourseId, { clearLists: true });
      }
      throw error;
    }
  }

  loadAuthoringOutline(courseId) {
    if (typeof this.api.loadAuthoringOutline !== "function") {
      throw new TypeError("A API de Cursos não oferece a estrutura autoral.");
    }
    const key = authoringOutlineCacheKey(courseId, this.cachePrefix);
    return this.#readThrough(
      key,
      () => this.api.loadAuthoringOutline(courseId),
      {
        accessSensitive: true,
        normalize: (value) => normalizeAuthoringOutline(courseId, value),
        invalidationPrefixes: [
          `${this.cachePrefix}.list:`,
          courseCacheKey(courseId, this.cachePrefix),
          instructionalPlanCacheKey(courseId, this.cachePrefix),
          `${this.cachePrefix}.course-design:${courseId}:`,
          courseSourcesCachePrefix(courseId, this.cachePrefix),
          authoringOutlineCacheKey(courseId, this.cachePrefix),
          authoringInspectionCacheKey(courseId, this.cachePrefix),
          pendingCompositionCacheKey(courseId)
        ]
      }
    );
  }

  async #rememberAuthoringInspectionPage(courseId, requestKey, page) {
    const cacheKey = authoringInspectionCacheKey(courseId, this.cachePrefix);
    const cached = cachedPayload(await this.store.getCache(cacheKey));
    let entries = [];
    if (cached != null) {
      const valid = cached.contract === "aralearn.course-authoring-inspection-cache.v1" &&
        Array.isArray(cached.entries) && cached.entries.every((entry) =>
          entry && typeof entry === "object" && !Array.isArray(entry) &&
          typeof entry.requestKey === "string" && entry.requestKey.length <= 2_000 &&
          Number.isSafeInteger(entry.bytes) && entry.bytes >= 0 &&
          typeof entry.savedAt === "string" && entry.page &&
          typeof entry.page === "object" && !Array.isArray(entry.page)
        );
      if (valid) entries = cached.entries.filter((entry) => entry.requestKey !== requestKey);
    }
    entries.push({
      requestKey,
      bytes: page.pageBytes,
      savedAt: this.now(),
      page: structuredClone(page)
    });
    let totalBytes = entries.reduce((total, entry) => total + entry.bytes, 0);
    while (entries.length > AUTHORING_INSPECTION_CACHE_MAX_PAGES ||
        totalBytes > AUTHORING_INSPECTION_CACHE_MAX_BYTES) {
      const removed = entries.shift();
      totalBytes -= removed.bytes;
    }
    await this.store.putCache(cacheKey, {
      contract: "aralearn.course-authoring-inspection-cache.v1",
      entries
    });
  }

  async #readCachedAuthoringInspectionPage(courseId, requestKey, normalize) {
    const cacheKey = authoringInspectionCacheKey(courseId, this.cachePrefix);
    const cached = cachedPayload(await this.store.getCache(cacheKey));
    if (cached?.contract !== "aralearn.course-authoring-inspection-cache.v1" ||
        !Array.isArray(cached.entries)) return null;
    const entry = cached.entries.find((candidate) => candidate?.requestKey === requestKey);
    if (!entry?.page) return null;
    const page = normalize(entry.page);
    await this.#rememberAuthoringInspectionPage(courseId, requestKey, page);
    return {
      ...structuredClone(page),
      offline: true,
      stale: true
    };
  }

  async loadAuthoringStudyUnits(courseId, options = {}) {
    if (typeof this.api.loadAuthoringStudyUnits !== "function") {
      throw new TypeError("A API de Cursos não oferece a inspeção de Unidades de estudo.");
    }
    const normalizedCourseId = String(courseId || "").trim().toLowerCase();
    if (!UUID_PATTERN.test(normalizedCourseId)) {
      throw new TypeError("Curso inválido.");
    }
    const normalizedOptions = inspectionRequestOptions(options);
    const requestKey = authoringInspectionRequestKey(
      normalizedOptions.expectedRevision,
      normalizedOptions
    );
    const normalize = (value) => {
      const normalized = normalizeInspectionPage(value);
      if (normalized.courseId !== normalizedCourseId ||
          normalized.courseRevision !== normalizedOptions.expectedRevision ||
          JSON.stringify(normalized.scope) !== JSON.stringify(normalizedOptions.scope)) {
        throw new TypeError("Página da inspeção não corresponde ao pedido.");
      }
      return normalized;
    };
    try {
      const page = normalize(
        await this.api.loadAuthoringStudyUnits(normalizedCourseId, normalizedOptions)
      );
      await this.#rememberAuthoringInspectionPage(normalizedCourseId, requestKey, page);
      await this.#inspectionReconcilesPending(page);
      return { ...structuredClone(page), offline: false, stale: false };
    } catch (error) {
      if (accessWasRevoked(error)) {
        await this.#purgeCoursePrivacyCache(normalizedCourseId, { clearLists: true });
      }
      if (!retryableReadFailure(error)) throw error;
      const cached = await this.#readCachedAuthoringInspectionPage(
        normalizedCourseId,
        requestKey,
        normalize
      );
      if (cached) return cached;
      const pending = await this.#readPendingComposition(normalizedCourseId);
      const pendingPage = this.#pendingInspectionPage(pending, normalizedOptions);
      if (!pendingPage) throw error;
      await this.#rememberAuthoringInspectionPage(
        normalizedCourseId,
        requestKey,
        pendingPage
      );
      return { ...structuredClone(pendingPage), offline: true, stale: true };
    }
  }

  async loadAuthoringInspectionPosition(courseId) {
    const normalizedCourseId = String(courseId || "").trim().toLowerCase();
    if (!UUID_PATTERN.test(normalizedCourseId)) throw new TypeError("Curso inválido.");
    const key = authoringInspectionPositionKey(normalizedCourseId, this.cachePrefix);
    const cached = cachedPayload(await this.store.getCache(key));
    if (cached == null) return null;
    try {
      if (cached.contract !== AUTHORING_INSPECTION_POSITION_CONTRACT ||
          cached.courseId !== normalizedCourseId) {
        throw new TypeError("Posição da inspeção inválida.");
      }
      return normalizeInspectionPosition(normalizedCourseId, cached.position);
    } catch {
      await this.store.putCache(key, null);
      return null;
    }
  }

  async saveAuthoringInspectionPosition(courseId, position) {
    const normalizedCourseId = String(courseId || "").trim().toLowerCase();
    if (!UUID_PATTERN.test(normalizedCourseId)) throw new TypeError("Curso inválido.");
    const key = authoringInspectionPositionKey(normalizedCourseId, this.cachePrefix);
    if (position == null) {
      await this.store.putCache(key, null);
      return null;
    }
    const normalized = normalizeInspectionPosition(normalizedCourseId, position);
    await this.store.putCache(key, {
      contract: AUTHORING_INSPECTION_POSITION_CONTRACT,
      courseId: normalizedCourseId,
      position: normalized,
      savedAt: this.now()
    });
    return structuredClone(normalized);
  }


  async commitCourseComposition(value = {}) {
    if (!this.ownerOnly || typeof this.api.commitCourseComposition !== "function") {
      throw new TypeError("A API de Autoria não oferece edição contextual.");
    }
    const intent = normalizeFocalStudyUnitCompositionIntent(value);
    try {
      const signature = JSON.stringify(intent);
      let sourceSnapshot = this.compositionSourceSnapshots.get(intent.requestId);
      if (sourceSnapshot && sourceSnapshot.signature !== signature) {
        throw new TypeError("A identidade da edição já está vinculada a outro conteúdo.");
      }
      if (!sourceSnapshot) {
        const sources = await this.loadCourseSources(intent.courseId, {
          expectedRevision: intent.expectedCourseRevision,
          mode: "target",
          targetKind: "study_unit",
          targetId: intent.studyUnit.id,
          limit: 1
        });
        const attribution = sources.items[0] || null;
        if (sources.items.length > 1 || attribution &&
            attribution.targetVersion !== intent.expectedStudyUnitVersion) {
          throw new TypeError("A proveniência corrente não corresponde à Unidade editada.");
        }
        sourceSnapshot = {
          courseId: intent.courseId,
          signature,
          sourceLinks: structuredClone(attribution?.sourceLinks ?? [])
        };
        if (this.compositionSourceSnapshots.size >= 16) {
          this.compositionSourceSnapshots.delete(
            this.compositionSourceSnapshots.keys().next().value
          );
        }
        this.compositionSourceSnapshots.set(intent.requestId, sourceSnapshot);
      }
      await this.#ensureCompositionRecoveryBase(intent);
      const result = await this.api.commitCourseComposition({
        ...intent,
        sourceLinks: structuredClone(sourceSnapshot.sourceLinks)
      });
      if (!result || typeof result !== "object" || Array.isArray(result) ||
          Object.keys(result).length !== 9 ||
          result.courseId !== intent.courseId ||
          result.studyUnitId !== intent.studyUnit.id ||
          result.studyUnitVersion !== intent.expectedStudyUnitVersion +
            (result.changed === true ? 1 : 0) ||
          result.channel !== "application" || result.origin !== intent.origin) {
        throw new TypeError("A confirmação da edição contextual não corresponde ao pedido.");
      }
      const pending = await this.#rememberPendingComposition(intent, result);
      await this.#promotePendingStudyComposition(pending);
      await Promise.all([
        this.store.deleteCachePrefix(
          instructionalPlanCacheKey(intent.courseId, this.cachePrefix)
        ),
        this.store.deleteCachePrefix(
          `${this.cachePrefix}.course-design:${intent.courseId}:`
        ),
        this.store.deleteCachePrefix(courseSourcesCachePrefix(
          intent.courseId,
          this.cachePrefix
        )),
        this.store.deleteCachePrefix(authoringOutlineCacheKey(
          intent.courseId,
          this.cachePrefix
        )),
        this.store.deleteCachePrefix(
          `${this.cachePrefix}.entities:${intent.courseId}:`
        ),
        this.store.deleteCachePrefix(REVIEW_PAGE_CACHE_KEY)
      ]);
      let reread;
      try {
        reread = await this.loadAuthoringStudyUnits(intent.courseId, {
          expectedRevision: result.courseRevision,
          scope: { kind: "course", id: null },
          anchorStudyUnitId: intent.studyUnit.id,
          direction: "forward",
          limit: 1,
          maxBytes: 64 * 1024
        });
      } catch (error) {
        if (!retryableReadFailure(error)) throw error;
        return {
          ...result,
          studyUnit: structuredClone(intent.studyUnit),
          version: result.studyUnitVersion,
          reconciled: false
        };
      }
      const committed = reread.items[0];
      const normalizedCommitted = committed &&
        normalizeFocalStudyUnitCompositionIntent({
          ...intent,
          expectedCourseRevision: result.courseRevision,
          expectedStudyUnitVersion: committed.version,
          studyUnit: committed.studyUnit
        });
      if (reread.offline !== false || reread.stale !== false) {
        return {
          ...result,
          studyUnit: structuredClone(intent.studyUnit),
          version: result.studyUnitVersion,
          reconciled: false
        };
      }
      if (reread.courseRevision !== result.courseRevision ||
          reread.items.length !== 1 || !normalizedCommitted ||
          normalizedCommitted.studyUnit.id !== intent.studyUnit.id ||
          committed.version !== result.studyUnitVersion ||
          committed.curriculumPath?.didacticMicrosequence?.id !==
            intent.didacticMicrosequenceId) {
        await this.store.putCache(pendingCompositionCacheKey(intent.courseId), pending);
        throw new TypeError("A Unidade relida não corresponde à edição confirmada.");
      }
      await this.#clearPendingComposition(intent.courseId);
      await Promise.all([
        this.store.deleteCachePrefix(`${this.cachePrefix}.list:`),
        this.store.deleteCachePrefix(courseCacheKey(intent.courseId, this.cachePrefix)),
        this.store.deleteCachePrefix(
          verifiedCompositionCacheKey(intent.courseId, this.cachePrefix)
        ),
        this.store.deleteCachePrefix(
          `${this.cachePrefix}.entities:${intent.courseId}:`
        )
      ]);
      return {
        ...result,
        studyUnit: normalizedCommitted.studyUnit,
        version: committed.version,
        reconciled: true
      };
    } catch (error) {
      if (accessWasRevoked(error)) {
        await this.#purgeCoursePrivacyCache(intent.courseId, { clearLists: true });
      }
      throw error;
    }
  }

  async commitCourseStructuralComposition(value = {}) {
    if (!this.ownerOnly || typeof this.api.commitCourseStructuralComposition !== "function") {
      throw new TypeError("A API de Autoria não oferece edição estrutural assistida.");
    }
    if (!value || typeof value !== "object" || Array.isArray(value) ||
        Object.keys(value).some((field) => !new Set([
          "requestId", "courseId", "expectedCourseRevision", "upserts", "deletes", "courseMetadata"
        ]).has(field))) {
      throw new TypeError("Alteração estrutural assistida inválida.");
    }
    const requestId = String(value.requestId || "");
    const courseId = String(value.courseId || "").trim().toLowerCase();
    const expectedCourseRevision = Number(value.expectedCourseRevision);
    const courseMetadata = Object.hasOwn(value, "courseMetadata") ? normalizeCourseMetadata(value.courseMetadata) : null;
    const upserts = Array.isArray(value.upserts) ? structuredClone(value.upserts) : null;
    const deletes = Array.isArray(value.deletes) ? structuredClone(value.deletes) : null;
    if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/u.test(requestId) ||
        !UUID_PATTERN.test(courseId) ||
        !Number.isSafeInteger(expectedCourseRevision) || expectedCourseRevision < 1 ||
        !upserts || !deletes || !upserts.length && !deletes.length && courseMetadata === null ||
        upserts.length > 200 || deletes.length > 200) {
      throw new TypeError("Alteração estrutural assistida inválida.");
    }
    const studyUnitIds = upserts.filter(({ entityType }) => entityType === "study_unit")
      .map(({ entityId }) => String(entityId || ""));
    if (new Set(studyUnitIds).size !== studyUnitIds.length) {
      throw new TypeError("A alteração estrutural repete uma Unidade de estudo.");
    }
    try {
      const signature = JSON.stringify({ kind: "structural", courseId, expectedCourseRevision,
        upserts, deletes, courseMetadata });
      let snapshot = this.compositionSourceSnapshots.get(requestId);
      if (snapshot && snapshot.signature !== signature) {
        throw new TypeError("A identidade da edição já está vinculada a outro conteúdo.");
      }
      if (!snapshot) {
        const sourceAttributionApplications = [];
        for (const studyUnitId of studyUnitIds) {
          const sources = await this.loadCourseSources(courseId, {
            expectedRevision: expectedCourseRevision,
            mode: "target",
            targetKind: "study_unit",
            targetId: studyUnitId,
            limit: 1
          });
          const attribution = sources.items[0] || null;
          if (sources.items.length > 1) {
            throw new TypeError("A proveniência corrente da Unidade é ambígua.");
          }
          sourceAttributionApplications.push({
            studyUnitId,
            sourceLinks: structuredClone(attribution?.sourceLinks ?? [])
          });
        }
        snapshot = { courseId, signature, sourceAttributionApplications };
        if (this.compositionSourceSnapshots.size >= 16) {
          this.compositionSourceSnapshots.delete(this.compositionSourceSnapshots.keys().next().value);
        }
        this.compositionSourceSnapshots.set(requestId, snapshot);
      }
      const sourceAttributionApplications = structuredClone(snapshot.sourceAttributionApplications);
      const result = await this.api.commitCourseStructuralComposition({
        requestId,
        courseId,
        expectedRevision: expectedCourseRevision,
        upserts,
        deletes,
        sourceAttributionApplications,
        ...(courseMetadata === null ? {} : { courseMetadata })
      });
      if (!result || typeof result !== "object" || Array.isArray(result) ||
          result.courseId !== courseId || result.requestId !== requestId ||
          !Number.isSafeInteger(Number(result.courseRevision)) ||
          Number(result.courseRevision) < expectedCourseRevision) {
        throw new TypeError("A confirmação estrutural não corresponde ao pedido.");
      }
      await Promise.all([
        this.store.deleteCachePrefix(`${this.cachePrefix}.list:`),
        this.store.deleteCachePrefix(courseCacheKey(courseId, this.cachePrefix)),
        this.store.deleteCachePrefix(instructionalPlanCacheKey(courseId, this.cachePrefix)),
        this.store.deleteCachePrefix(`${this.cachePrefix}.course-design:${courseId}:`),
        this.store.deleteCachePrefix(courseSourcesCachePrefix(courseId, this.cachePrefix)),
        this.store.deleteCachePrefix(authoringOutlineCacheKey(courseId, this.cachePrefix)),
        this.store.deleteCachePrefix(authoringInspectionCacheKey(courseId, this.cachePrefix)),
        this.store.deleteCachePrefix(`${this.cachePrefix}.entities:${courseId}:`),
        this.store.deleteCachePrefix(REVIEW_PAGE_CACHE_KEY)
      ]);
      return result;
    } catch (error) {
      if (accessWasRevoked(error)) {
        await this.#purgeCoursePrivacyCache(courseId, { clearLists: true });
      }
      throw error;
    }
  }

  async mutateCourseDesign(value = {}) {
    if (typeof this.api.mutateCourseDesign !== "function") {
      throw new TypeError("A API de Cursos não oferece a alteração dos parâmetros.");
    }
    if (!value || typeof value !== "object" || Array.isArray(value) ||
        Object.keys(value).some((field) => !new Set([
          "requestId", "courseId", "expectedCourseRevision", "command"
        ]).has(field))) {
      throw new TypeError("Alteração do desenho inválida.");
    }
    const { requestId, courseId, expectedCourseRevision, command } = value;
    const result = await this.api.mutateCourseDesign({
      requestId,
      courseId,
      expectedRevision: expectedCourseRevision,
      designCommand: command
    });
    await Promise.all([
      this.store.deleteCachePrefix(`${this.cachePrefix}.list:`),
      this.store.deleteCachePrefix(courseCacheKey(courseId, this.cachePrefix)),
      this.store.deleteCachePrefix(instructionalPlanCacheKey(courseId, this.cachePrefix)),
      this.store.deleteCachePrefix(`${this.cachePrefix}.course-design:${courseId}:`),
      this.store.deleteCachePrefix(courseSourcesCachePrefix(courseId, this.cachePrefix)),
      this.store.deleteCachePrefix(authoringOutlineCacheKey(courseId, this.cachePrefix)),
      this.store.deleteCachePrefix(authoringInspectionCacheKey(courseId, this.cachePrefix))
    ]);
    return result;
  }

  async mutateCourseSources(value = {}) {
    if (!this.ownerOnly || typeof this.api.mutateCourseSources !== "function") {
      throw new TypeError("A API de Autoria não oferece alterações de Fontes.");
    }
    if (!value || typeof value !== "object" || Array.isArray(value) ||
        Object.keys(value).some((field) => !new Set([
          "requestId", "courseId", "expectedCourseRevision", "command"
        ]).has(field))) {
      throw new TypeError("Alteração de Fontes inválida.");
    }
    const requestId = String(value.requestId || "");
    const courseId = String(value.courseId || "").trim().toLowerCase();
    const expectedCourseRevision = Number(value.expectedCourseRevision);
    if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/u.test(requestId) ||
        !UUID_PATTERN.test(courseId) ||
        !Number.isSafeInteger(expectedCourseRevision) || expectedCourseRevision < 1) {
      throw new TypeError("Alteração de Fontes inválida.");
    }
    const command = normalizeCourseSourceCommand(value.command);
    const result = normalizeCourseSourceChange(await this.api.mutateCourseSources({
      requestId,
      courseId,
      expectedRevision: expectedCourseRevision,
      sourceCommand: command
    }));
    if (result.courseId !== courseId || result.requestId !== requestId ||
        result.courseRevision !== expectedCourseRevision + (result.changed ? 1 : 0) ||
        result.change != null && (
          result.change.type !== command.type ||
          result.change.subjectId !== courseSourceCommandSubjectId(command)
        )) {
      throw new TypeError("A confirmação de Fontes não corresponde ao comando.");
    }
    await Promise.all([
      this.store.deleteCachePrefix(`${this.cachePrefix}.list:`),
      this.store.deleteCachePrefix(courseCacheKey(courseId, this.cachePrefix)),
      this.store.deleteCachePrefix(instructionalPlanCacheKey(courseId, this.cachePrefix)),
      this.store.deleteCachePrefix(courseSourcesCachePrefix(courseId, this.cachePrefix)),
      this.store.deleteCachePrefix(authoringInspectionCacheKey(courseId, this.cachePrefix)),
      this.store.deleteCachePrefix(`${this.cachePrefix}.entities:${courseId}:`)
    ]);
    return result;
  }

  async uploadCourseSourcePdf(value = {}) {
    if (!this.ownerOnly || typeof this.api.uploadCourseSourcePdf !== "function") {
      throw new TypeError("A API de Autoria não oferece anexos PDF de Fonte.");
    }
    if (!value || typeof value !== "object" || Array.isArray(value) ||
        Object.keys(value).some((field) => !new Set([
          "requestId", "courseId", "expectedCourseRevision", "sourceId",
          "sourceRevision", "file"
        ]).has(field))) {
      throw new TypeError("Envio do anexo de Fonte inválido.");
    }
    const requestId = String(value.requestId || "");
    const courseId = String(value.courseId || "").trim().toLowerCase();
    const expectedCourseRevision = Number(value.expectedCourseRevision);
    if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/u.test(requestId) ||
        !UUID_PATTERN.test(courseId) ||
        !Number.isSafeInteger(expectedCourseRevision) || expectedCourseRevision < 1) {
      throw new TypeError("Envio do anexo de Fonte inválido.");
    }
    const result = normalizeCourseSourceChange(await this.api.uploadCourseSourcePdf({
      requestId,
      courseId,
      expectedRevision: expectedCourseRevision,
      sourceId: value.sourceId,
      sourceRevision: value.sourceRevision,
      file: value.file
    }));
    if (result.courseId !== courseId || result.requestId !== requestId ||
        result.courseRevision !== expectedCourseRevision + (result.changed ? 1 : 0) ||
        result.change != null && (
          result.change.type !== "ingest_pdf" ||
          result.change.subjectId !== value.sourceId ||
          result.change.revision !== value.sourceRevision
        )) {
      throw new TypeError("A confirmação do anexo não corresponde ao envio.");
    }
    await Promise.all([
      this.store.deleteCachePrefix(`${this.cachePrefix}.list:`),
      this.store.deleteCachePrefix(courseCacheKey(courseId, this.cachePrefix)),
      this.store.deleteCachePrefix(instructionalPlanCacheKey(courseId, this.cachePrefix)),
      this.store.deleteCachePrefix(courseSourcesCachePrefix(courseId, this.cachePrefix)),
      this.store.deleteCachePrefix(authoringInspectionCacheKey(courseId, this.cachePrefix)),
      this.store.deleteCachePrefix(`${this.cachePrefix}.entities:${courseId}:`)
    ]);
    return result;
  }

  async mutateCourseAnchoredAnnotations(value = {}) {
    if (!this.ownerOnly || typeof this.api.mutateCourseAnchoredAnnotations !== "function") {
      throw new TypeError("A API de Autoria não oferece alterações de observação.");
    }
    if (!value || typeof value !== "object" || Array.isArray(value) ||
        Object.keys(value).some((field) => !new Set([
          "requestId", "courseId", "expectedCourseRevision", "command"
        ]).has(field))) {
      throw new TypeError("Alteração de observação inválida.");
    }
    const requestId = String(value.requestId || "");
    const courseId = String(value.courseId || "").trim().toLowerCase();
    const command = normalizeCourseAnchoredAnnotationCommand(value.command);
    const requiresCourseRevision = new Set([
      "create_anchored_annotation",
      "correct_anchored_annotation_subjects"
    ]).has(command.type);
    const expectedCourseRevision = value.expectedCourseRevision ?? null;
    if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/u.test(requestId) ||
        !UUID_PATTERN.test(courseId) ||
        requiresCourseRevision && (
          !Number.isSafeInteger(expectedCourseRevision) || expectedCourseRevision < 1
        ) ||
        !requiresCourseRevision && expectedCourseRevision !== null) {
      throw new TypeError("Alteração de observação inválida.");
    }
    try {
      const result = normalizeCourseAnchoredAnnotationChange(
        await this.api.mutateCourseAnchoredAnnotations({
          requestId,
          courseId,
          expectedCourseRevision,
          command
        })
      );
      if (result.courseId !== courseId || result.requestId !== requestId ||
          expectedCourseRevision !== null && (
            result.idempotent
              ? result.courseRevision < expectedCourseRevision
              : result.courseRevision !== expectedCourseRevision
          ) ||
          result.annotation !== null && (
            result.annotation.courseId !== courseId ||
            result.annotation.annotationId !== command.annotationId
          ) ||
          command.type === "create_anchored_annotation" && result.annotation !== null && (
            result.annotation.target.kind !== command.target.kind ||
            result.annotation.target.id !== command.target.id ||
            result.annotation.provenance.origin !== "author" ||
            result.annotation.provenance.channel !== "authoring_interface"
          )) {
        throw new TypeError("A confirmação da observação não corresponde ao comando.");
      }
      await Promise.all([
        this.store.deleteCachePrefix(`${COURSE_ANNOTATION_CACHE_CONTRACT}:${courseId}`),
        this.store.deleteCachePrefix(authoringInspectionCacheKey(courseId, this.cachePrefix))
      ]);
      return result;
    } catch (error) {
      if (annotationAccessWasRevoked(error)) {
        await this.#purgeCoursePrivacyCache(courseId, { clearLists: true });
      }
      throw error;
    }
  }

  createCourse(values) {
    return this.api.createCourse(values);
  }

  getPersonProfile({ allowOffline = true } = {}) {
    return this.#readThrough(PERSON_PROFILE_CACHE_KEY, () => this.api.getPersonProfile(), {
      accessSensitive: true,
      allowOffline,
      normalize: (value) => normalizeCachedPersonProfile(value,
        this.api.authClient?.getSession?.()?.user?.id || null)
    });
  }

  async updatePersonProfile(patch) {
    const response = await this.api.updatePersonProfile(patch);
    const profile = normalizeCachedPersonProfile(response,
      this.api.authClient?.getSession?.()?.user?.id || null);
    await this.store.putCache(PERSON_PROFILE_CACHE_KEY, { savedAt: this.now(), data: profile });
    return response;
  }

  listCourseAccess(courseId) {
    return this.api.listCourseAccess(courseId);
  }

  searchCourseAccessPeople(courseId, options) {
    return this.api.searchCourseAccessPeople(courseId, options);
  }

  async setCourseVisibility(values) {
    const result = await this.api.setCourseVisibility(values);
    await this.#purgeCoursePrivacyCache(values.courseId, { clearLists: true });
    return result;
  }

  async setCourseSourceFileAccess(values) {
    const result = await this.api.setCourseSourceFileAccess(values);
    await this.#purgeCoursePrivacyCache(values.courseId, { clearLists: true });
    return result;
  }

  grantCourseAccess(values) {
    return this.api.grantCourseAccess(values);
  }

  revokeCourseAccess(values) {
    return this.api.revokeCourseAccess(values);
  }

  async maintainCourse(values) {
    if (typeof this.api.maintainCourse !== "function") {
      throw new TypeError("A API de Cursos não oferece o ciclo de vida solicitado.");
    }
    const result = await this.api.maintainCourse(values);
    await this.#purgeCoursePrivacyCache(result.courseId, { clearLists: true });
    return result;
  }

  loadCurrentMaintenance(values) {
    if (typeof this.api.loadCurrentMaintenance !== "function") {
      throw new TypeError("A API de Cursos não oferece Manutenção.");
    }
    return this.api.loadCurrentMaintenance(values);
  }

  executeCurrentMaintenance(values) {
    if (typeof this.api.executeCurrentMaintenance !== "function") {
      throw new TypeError("A API de Cursos não oferece Manutenção.");
    }
    return this.api.executeCurrentMaintenance(values);
  }

  uploadAvatar(file, options) {
    return this.api.uploadAvatar(file, options);
  }

  loadAvatar(objectKey) {
    return this.api.loadAvatar(objectKey);
  }

  deleteOwnAvatar(objectKey) {
    return this.api.deleteOwnAvatar(objectKey);
  }

  deleteMyAccount(values) {
    return this.api.deleteMyAccount(values);
  }
}

export {
  ACCESSIBLE_COURSE_IDS_CACHE_KEY,
  ACCESSIBLE_COURSE_IDS_CONTRACT,
  CACHE_PREFIX as COURSE_CACHE_PREFIX,
  PENDING_COMPOSITION_CACHE_CONTRACT,
  STUDY_DRAFT_RECOVERY_CACHE_KEY,
  pendingCompositionCacheKey as coursePendingCompositionCacheKey,
  instructionalPlanCacheKey as courseInstructionalPlanCacheKey
};
