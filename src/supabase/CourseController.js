import { composeCourseDocument } from "../domain/courseEntities.js";
import { UUID_PATTERN } from "../domain/identifiers.js";
import { COURSE_PERSONAL_STATE_CACHE_CONTRACT } from
  "../persistence/CoursePersonalStateRepository.js";

const CACHE_PREFIX = "course.v1";
const MAX_ENTITY_PAGES = 100;
const ACCESSIBLE_COURSE_IDS_CACHE_KEY = `${CACHE_PREFIX}.accessible-course-ids`;
const ACCESSIBLE_COURSE_IDS_CONTRACT = "aralearn.accessible-course-ids.v1";
const REVIEW_PAGE_CACHE_KEY = `${CACHE_PREFIX}.review-page`;

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

function entityCacheKey(courseId, revision, limit, cursor, prefix = CACHE_PREFIX) {
  return `${prefix}.entities:${courseId}:${revision}:${limit}:${stableCursor(cursor)}`;
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

function accessWasRevoked(error) {
  const status = Number(error?.status || error?.response?.status || 0);
  const code = String(error?.code || error?.response?.code || "").toUpperCase();
  return error?.authRequired === true || status === 401 || status === 403 || status === 404 ||
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
      this.store.deleteCachePrefix(`${this.cachePrefix}.entities:${courseId}:`),
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
        return {
          course: structuredClone(cachedCourse),
          rows,
          document: composeCourseDocument({
            id: String(cachedCourse.courseId || "").trim(),
            title: String(cachedCourse.title || "").trim(),
            goal: String(cachedCourse.goal || "").trim()
          }, rows),
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
          `${this.cachePrefix}.entities:${courseId}:`
        ]
      }
    );
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
      this.store.deleteCachePrefix(instructionalPlanCacheKey(courseId, this.cachePrefix))
    ]);
    return result;
  }

  async advanceAuthoringPartMaterialization(values = {}) {
    const result = await this.api.advanceAuthoringPartMaterialization(values);
    const courseId = values.courseId;
    await Promise.all([
      this.store.deleteCachePrefix(`${this.cachePrefix}.list:`),
      this.store.deleteCachePrefix(courseCacheKey(courseId, this.cachePrefix)),
      this.store.deleteCachePrefix(instructionalPlanCacheKey(courseId, this.cachePrefix)),
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
