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
  normalizeCourseSourceChange,
  normalizeCourseSourceCommand,
  normalizeCourseSourcesRead,
  normalizeCourseStudyCitationsRead
} from "../domain/courseSources.js";
import {
  COURSE_ANNOTATION_CACHE_CONTRACT,
  COURSE_ANNOTATION_OUTBOX_CONTRACT
} from "../persistence/CourseAnnotationRepository.js";
import {
  COURSE_ANNOTATION_HANDOFF_CACHE_CONTRACT,
  COURSE_PERSONAL_STATE_CACHE_CONTRACT,
  COURSE_PERSONAL_STATE_LEGACY_CACHE_CONTRACT
} from "../persistence/CoursePersonalStateRepository.js";

const CACHE_PREFIX = "course.v1";
const MAX_ENTITY_PAGES = 100;
const ACCESSIBLE_COURSE_IDS_CACHE_KEY = `${CACHE_PREFIX}.accessible-course-ids`;
const ACCESSIBLE_COURSE_IDS_CONTRACT = "aralearn.accessible-course-ids.v1";
const REVIEW_PAGE_CACHE_KEY = `${CACHE_PREFIX}.review-page`;
const AUTHORING_INSPECTION_PAGE_CONTRACT =
  "aralearn.course-study-unit-inspection-page.v1";
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
      !new Set(["course", "module", "lesson", "didactic_microsequence"]).has(kind) ||
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
  const limit = options.limit ?? 10;
  const hasTargetContext = targetKind !== null || targetId !== null;
  const validTargetContext = targetKind !== null && targetId !== null;
  const legacySourceId = (value) => typeof value === "string" &&
    value.length >= 1 && value.length <= 4_096 && [...value].length <= 2_048 &&
    new TextEncoder().encode(value).byteLength <= 8_192 &&
    ![...value].some((character) => {
      const point = character.codePointAt(0);
      return point < 32 || point >= 127 && point <= 159;
    });
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 1 ||
      !new Set(["catalog", "source", "target"]).has(mode) ||
      (mode === "source") !== legacySourceId(sourceId) ||
      mode === "catalog" && hasTargetContext ||
      mode === "target" && (sourceId !== null || !validTargetContext) ||
      mode === "source" && hasTargetContext && !validTargetContext ||
      (targetKind !== null && !new Set(["plan_item", "study_unit"]).has(targetKind)) ||
      (targetId !== null && !courseSourceOpaqueId(targetId)) ||
      (targetKind === "plan_item" && !UUID_PATTERN.test(targetId)) ||
      (mode === "source" && hasTargetContext && cursor !== null) ||
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
  return command.type === "save_source" || command.type === "retire_source"
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
  if (!value || typeof value !== "object" || Array.isArray(value) ||
      !UUID_PATTERN.test(courseId) || !title ||
      !Number.isSafeInteger(revision) || revision < 1 ||
      !new Set(["owned", "shared"]).has(ownership) ||
      typeof value.canEdit !== "boolean" || value.canEdit !== (ownership === "owned")) {
    throw invalidCourseList();
  }
  return {
    courseId,
    title,
    goal: value?.goal ?? null,
    revision,
    ownership,
    canEdit: value.canEdit,
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
      value.contract !== "aralearn.course-list.v1" ||
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
  return {
    expectedRevision: revision,
    scope: normalizedInspectionScope(scope),
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
    deliverMaterializationRequest = null,
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
    if (deliverMaterializationRequest != null &&
        typeof deliverMaterializationRequest !== "function") {
      throw new TypeError("Entrega ao chat inválida.");
    }
    this.deliverMaterializationRequest = deliverMaterializationRequest;
    this.now = now;
    this.accessibleCourseRefresh = null;
  }

  async #purgeCoursePrivacyCache(courseId, { clearLists = false } = {}) {
    await Promise.all([
      ...(clearLists ? [this.store.deleteCachePrefix(`${this.cachePrefix}.list:`)] : []),
      this.store.deleteCachePrefix(courseCacheKey(courseId, this.cachePrefix)),
      this.store.deleteCachePrefix(instructionalPlanCacheKey(courseId, this.cachePrefix)),
      this.store.deleteCachePrefix(`${this.cachePrefix}.course-design:${courseId}:`),
      this.store.deleteCachePrefix(courseSourcesCachePrefix(courseId, this.cachePrefix)),
      this.store.deleteCachePrefix(authoringOutlineCacheKey(courseId, this.cachePrefix)),
      this.store.deleteCachePrefix(authoringInspectionCacheKey(courseId, this.cachePrefix)),
      this.store.deleteCachePrefix(authoringInspectionPositionKey(courseId, this.cachePrefix)),
      this.store.deleteCachePrefix(`${this.cachePrefix}.entities:${courseId}:`),
      this.store.deleteCachePrefix(`${COURSE_ANNOTATION_CACHE_CONTRACT}:${courseId}`),
      this.store.deleteCachePrefix(`${COURSE_ANNOTATION_OUTBOX_CONTRACT}:${courseId}`),
      this.store.deleteCachePrefix(`${COURSE_ANNOTATION_HANDOFF_CACHE_CONTRACT}:${courseId}`),
      this.store.deleteCachePrefix(`${COURSE_PERSONAL_STATE_CACHE_CONTRACT}:${courseId}`),
      this.store.deleteCachePrefix(`${COURSE_PERSONAL_STATE_LEGACY_CACHE_CONTRACT}:${courseId}`),
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
      if (!retryableReadFailure(error)) throw error;
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
    return page;
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
        instructionalPlanCacheKey(courseId, this.cachePrefix),
        `${this.cachePrefix}.course-design:${courseId}:`,
        courseSourcesCachePrefix(courseId, this.cachePrefix),
        authoringOutlineCacheKey(courseId, this.cachePrefix),
        authoringInspectionCacheKey(courseId, this.cachePrefix),
        authoringInspectionPositionKey(courseId, this.cachePrefix),
        `${this.cachePrefix}.entities:${courseId}:`,
        `${COURSE_PERSONAL_STATE_CACHE_CONTRACT}:${courseId}`,
        REVIEW_PAGE_CACHE_KEY
      ]
      }
    );
    const previousRevision = Number(previous?.revision);
    const currentRevision = Number(result?.revision);
    if (result.offline !== true && Number.isSafeInteger(previousRevision) &&
        Number.isSafeInteger(currentRevision) && previousRevision !== currentRevision) {
      await this.store.deleteCachePrefix(
        `${this.cachePrefix}.entities:${courseId}:${previousRevision}:`
      );
      await Promise.all([
        this.store.deleteCachePrefix(instructionalPlanCacheKey(courseId, this.cachePrefix)),
        this.store.deleteCachePrefix(`${this.cachePrefix}.course-design:${courseId}:`),
        this.store.deleteCachePrefix(courseSourcesCachePrefix(courseId, this.cachePrefix)),
        this.store.deleteCachePrefix(authoringOutlineCacheKey(courseId, this.cachePrefix)),
        this.store.deleteCachePrefix(authoringInspectionCacheKey(courseId, this.cachePrefix))
      ]);
    }
    return result;
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
          `${this.cachePrefix}.entities:${courseId}:`,
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

  async #readVerifiedCachedDocument(courseId, revision, entityPageSize) {
    const cachedCourse = cachedPayload(await this.store.getCache(
      courseCacheKey(courseId, this.cachePrefix)
    ))?.data;
    if (Number(cachedCourse?.revision) !== revision) return null;
    const rows = [];
    const cursors = new Set();
    let cursor = null;
    for (let pageIndex = 0; pageIndex < MAX_ENTITY_PAGES; pageIndex += 1) {
      const page = cachedPayload(await this.store.getCache(
        entityCacheKey(courseId, revision, entityPageSize, cursor, this.cachePrefix)
      ))?.data;
      if (!page || Number(page.revision) !== revision || !Array.isArray(page.items)) return null;
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
            `${this.cachePrefix}.entities:${courseId}:${revision}:`
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

  async loadCourseDocument(courseId, {
    entityPageSize = 500,
    verifiedRevision = null
  } = {}) {
    if (!Number.isSafeInteger(entityPageSize) || entityPageSize < 1 || entityPageSize > 1_000) {
      throw new TypeError("O tamanho da página de entidades é inválido.");
    }
    if (verifiedRevision != null) {
      const revision = Number(verifiedRevision);
      if (!Number.isSafeInteger(revision) || revision < 1) {
        throw new TypeError("A versão verificada do Curso é inválida.");
      }
      const cached = await this.#readVerifiedCachedDocument(
        courseId,
        revision,
        entityPageSize
      );
      if (cached) return cached;
    }
    const course = await this.getCourse(courseId);
    const revision = Number(course?.revision);
    if (!Number.isSafeInteger(revision) || revision < 1) {
      throw new TypeError("A versão do Curso é inválida.");
    }
    const rows = [];
    const cursors = new Set();
    let cursor = null;
    let offline = course.offline === true;
    let stale = course.stale === true;
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
      if (!Array.isArray(page?.items)) {
        throw new TypeError("A página de entidades do Curso é inválida.");
      }
      rows.push(...page.items);
      offline ||= page.offline === true;
      stale ||= page.stale === true;
      if (page.hasMore !== true) {
        return {
          course,
          rows,
          document: composeCourseDocument({
            id: String(course?.courseId || "").trim(),
            title: String(course?.title || "").trim(),
            goal: String(course?.goal || "").trim()
          }, rows),
          offline,
          stale,
          ...(offline ? { readOnly: true } : {})
        };
      }
      if (!page.nextCursor) throw new TypeError("A página omitiu o cursor seguinte.");
      const cursorKey = JSON.stringify(page.nextCursor);
      if (cursors.has(cursorKey)) throw new TypeError("A paginação repetiu o mesmo cursor.");
      cursors.add(cursorKey);
      cursor = page.nextCursor;
    }
    throw new TypeError("O Curso excedeu o limite seguro de páginas.");
  }

  clearCourse(courseId) {
    return this.#purgeCoursePrivacyCache(courseId, { clearLists: true });
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
          authoringInspectionCacheKey(courseId, this.cachePrefix)
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
      if (!cached) throw error;
      return cached;
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

  loadPartMaterialization(courseId, authoringPartId, materializationId) {
    if (typeof this.api.loadPartMaterialization !== "function") {
      throw new TypeError("A API de Cursos não oferece a leitura da materialização.");
    }
    return this.api.loadPartMaterialization(
      courseId,
      authoringPartId,
      materializationId
    );
  }

  async mutateAuthoringPlan({
    requestId,
    courseId,
    expectedCourseRevision,
    expectedPlanVersion,
    operation,
    ...payload
  } = {}) {
    const result = await this.api.mutateAuthoringPlan({
      requestId,
      courseId,
      expectedRevision: expectedCourseRevision,
      expectedPlanVersion,
      planCommand: { type: operation, ...payload }
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

  async advanceAuthoringPartMaterialization(values = {}) {
    const result = await this.api.advanceAuthoringPartMaterialization(values);
    const courseId = values.courseId;
    await Promise.all([
      this.store.deleteCachePrefix(`${this.cachePrefix}.list:`),
      this.store.deleteCachePrefix(courseCacheKey(courseId, this.cachePrefix)),
      this.store.deleteCachePrefix(instructionalPlanCacheKey(courseId, this.cachePrefix)),
      this.store.deleteCachePrefix(`${this.cachePrefix}.course-design:${courseId}:`),
      this.store.deleteCachePrefix(courseSourcesCachePrefix(courseId, this.cachePrefix)),
      this.store.deleteCachePrefix(authoringOutlineCacheKey(courseId, this.cachePrefix)),
      this.store.deleteCachePrefix(authoringInspectionCacheKey(courseId, this.cachePrefix)),
      this.store.deleteCachePrefix(`${this.cachePrefix}.entities:${courseId}:`)
    ]);
    return result;
  }

  requestPartMaterialization(payload) {
    if (!this.deliverMaterializationRequest) {
      throw new Error("Nenhum chat conectado pode receber este pedido.");
    }
    return Promise.resolve(this.deliverMaterializationRequest(structuredClone(payload)));
  }

  createCourse(values) {
    return this.api.createCourse(values);
  }

  getPersonProfile() {
    return this.api.getPersonProfile();
  }

  updatePersonProfile(patch) {
    return this.api.updatePersonProfile(patch);
  }

  listCourseAccess(courseId) {
    return this.api.listCourseAccess(courseId);
  }

  grantCourseAccess(values) {
    return this.api.grantCourseAccess(values);
  }

  revokeCourseAccess(values) {
    return this.api.revokeCourseAccess(values);
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
  instructionalPlanCacheKey as courseInstructionalPlanCacheKey
};
