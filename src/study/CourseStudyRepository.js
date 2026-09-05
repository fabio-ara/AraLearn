import {
  createEmptyProgressDocument,
  validateProgressDocument
} from "../storage/progressStore.js";
import {
  CoursePersonalStateRepository,
  COURSE_PERSONAL_STATE_CACHE_CONTRACT,
  validateCoursePersonalState
} from "../persistence/CoursePersonalStateRepository.js";
import { CourseAnnotationRepository } from "../persistence/CourseAnnotationRepository.js";
import { normalizeCourseSourcePdfDownload, normalizeCourseStudyCitationsRead } from "../domain/courseSources.js";
import { findCourse } from "./CourseStudyNavigation.js";

const COURSE_DOCUMENT_CONTRACT = "aralearn.course.v1";
const MAX_LIST_PAGES = 100;
const REVIEW_PAGE_SIZE = 20;
const REVIEW_PAGE_CACHE_KEY = "course.v1.review-page";
const STUDY_NAVIGATION_CACHE_KEY = "course.v1.study-navigation";
const STUDY_NAVIGATION_CONTRACT = "aralearn.course-study-navigation.v1";
const STUDY_NAVIGATION_CHANNEL = "aralearn-course-study-navigation-v1";
const MAX_STUDY_NAVIGATION_POSITIONS = 64;
const COURSE_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const STUDY_NAVIGATION_VIEWS = new Set(["course", "module", "lesson", "microsequence"]);

function clone(value) {
  return value == null ? value : structuredClone(value);
}

function plainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function nowIso(clock) {
  const value = clock();
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new TypeError("Relógio de Estudo inválido.");
  return date.toISOString();
}

function navigationEntityId(value, label) {
  const normalized = String(value || "").trim();
  const containsControlCharacter = [...normalized].some((character) => {
    const codePoint = character.codePointAt(0);
    return codePoint <= 31 || codePoint === 127;
  });
  if (!normalized || normalized.length > 200 || containsControlCharacter) {
    throw new TypeError(`${label} inválido.`);
  }
  return normalized;
}

function emptyStudyNavigation() {
  return {
    contract: STUDY_NAVIGATION_CONTRACT,
    selectedCourseId: null,
    positions: {},
    updatedAt: null
  };
}

function normalizeStudyNavigationPosition(value, courseId) {
  if (!plainObject(value) || Object.keys(value).some((field) =>
    !new Set(["view", "entityPath", "microsequenceMode", "updatedAt"]).has(field))) {
    throw new TypeError("Posição de Estudo inválida.");
  }
  const view = String(value.view || "").trim();
  if (!STUDY_NAVIGATION_VIEWS.has(view) || !Array.isArray(value.entityPath) ||
      value.entityPath.length !== 5) {
    throw new TypeError("Posição de Estudo inválida.");
  }
  const entityPath = value.entityPath.map((item, index) =>
    navigationEntityId(item, `Caminho de Estudo ${index + 1}`));
  if (entityPath[0].toLowerCase() !== courseId) {
    throw new TypeError("A posição pertence a outro curso.");
  }
  entityPath[0] = courseId;
  const microsequenceMode = String(value.microsequenceMode || "play").trim();
  if (!new Set(["play", "overview"]).has(microsequenceMode)) {
    throw new TypeError("Modo de Estudo inválido.");
  }
  const updatedAt = String(value.updatedAt || "").trim();
  if (!updatedAt || !Number.isFinite(new Date(updatedAt).getTime())) {
    throw new TypeError("Data da posição de Estudo inválida.");
  }
  return { view, entityPath, microsequenceMode, updatedAt };
}

function normalizeStudyNavigation(value) {
  if (value == null) return emptyStudyNavigation();
  if (!plainObject(value) || value.contract !== STUDY_NAVIGATION_CONTRACT ||
      !plainObject(value.positions) ||
      Object.keys(value).some((field) =>
        !new Set(["contract", "selectedCourseId", "positions", "updatedAt"]).has(field))) {
    throw new TypeError("Navegação de Estudo inválida.");
  }
  const selectedCourseId = value.selectedCourseId == null
    ? null
    : String(value.selectedCourseId || "").trim().toLowerCase();
  if (selectedCourseId !== null && !COURSE_ID_PATTERN.test(selectedCourseId)) {
    throw new TypeError("Curso selecionado inválido.");
  }
  const entries = Object.entries(value.positions);
  if (entries.length > MAX_STUDY_NAVIGATION_POSITIONS) {
    throw new TypeError("A navegação de Estudo excedeu o limite seguro.");
  }
  const positions = {};
  for (const [rawCourseId, position] of entries) {
    const courseId = String(rawCourseId || "").trim().toLowerCase();
    if (!COURSE_ID_PATTERN.test(courseId) || courseId !== rawCourseId) {
      throw new TypeError("Curso da posição de estudo inválido.");
    }
    positions[courseId] = normalizeStudyNavigationPosition(position, courseId);
  }
  const updatedAt = value.updatedAt == null ? null : String(value.updatedAt || "").trim();
  if (updatedAt !== null && !Number.isFinite(new Date(updatedAt).getTime())) {
    throw new TypeError("Data da navegação de Estudo inválida.");
  }
  return { contract: STUDY_NAVIGATION_CONTRACT, selectedCourseId, positions, updatedAt };
}

function courseIdFromReference(reference) {
  const value = Array.isArray(reference)
    ? reference[0]
    : Array.isArray(reference?.entityPath)
      ? reference.entityPath[0]
      : reference?.courseId;
  return String(value || "").trim().toLowerCase();
}

function studyUnitIdFromReference(reference) {
  const value = Array.isArray(reference)
    ? reference[4]
    : Array.isArray(reference?.entityPath)
      ? reference.entityPath[4]
      : reference?.studyUnitId;
  return String(value || "").trim();
}


function mergeProgress(progressValues) {
  const result = createEmptyProgressDocument();
  for (const progress of progressValues) {
    Object.assign(result.lessons, validateProgressDocument(progress).lessons);
  }
  return result;
}

function descriptorCourse(descriptor) {
  return {
    id: String(descriptor?.courseId || "").trim().toLowerCase(),
    title: String(descriptor?.title || "Curso").trim() || "Curso",
    goal: String(descriptor?.goal || "").trim(),
    modules: []
  };
}

function networkFailure(error) {
  const statusValue = error?.status ?? error?.response?.status;
  const status = statusValue == null ? null : Number(statusValue);
  const code = String(error?.code || "").toUpperCase();
  return status === 0 || status === 408 || status === 429 || status >= 500 ||
    new Set(["REQUEST_TIMEOUT", "NETWORK_ERROR", "FETCH_FAILED", "ETIMEDOUT",
      "ECONNRESET", "ECONNREFUSED", "ENETUNREACH", "EAI_AGAIN"]).has(code) ||
    error?.name === "AbortError" ||
    (error?.name === "TypeError" && /fetch|network|load failed/iu.test(String(error.message || "")));
}

function courseRevisionConflict(error) {
  const status = Number(error?.status || error?.response?.status || 0);
  const code = String(error?.code || error?.response?.code || "").toUpperCase();
  return status === 409 || code === "40001" || code === "COURSE_REVISION_CHANGED";
}

function courseRevisionChangedError(cause = null) {
  if (String(cause?.code || "").toLowerCase() === "course_revision_changed") return cause;
  const error = new Error("O curso mudou durante a leitura das citações.");
  error.name = "CourseRevisionChangedError";
  error.status = 409;
  error.code = "course_revision_changed";
  if (cause) error.cause = cause;
  return error;
}

function courseAccessRevoked(error) {
  if (courseRevisionConflict(error)) return false;
  const status = Number(error?.status || error?.response?.status || 0);
  const code = String(error?.code || error?.response?.code || "").toUpperCase();
  if (new Set([
    "ANNOTATION_NOT_FOUND", "ANCHORED_ANNOTATION_NOT_FOUND", "ANNOTATION_TARGET_NOT_FOUND",
    "COURSE_ANCHORED_ANNOTATION_NOT_FOUND", "COURSE_ANCHORED_ANNOTATION_TARGET_NOT_FOUND",
    "TARGET_NOT_FOUND"
  ]).has(code)) return false;
  return error?.authRequired !== true && status !== 401 && (
    status === 403 || status === 404 || code === "42501" || code === "PT404"
  );
}

export class CourseStudyRepository {
  #studyNavigationChannel = null;
  #studyNavigationListeners = new Set();
  #studyNavigationReload = Promise.resolve();
  #studyNavigationWrite = Promise.resolve();

  constructor({
    bridge,
    api,
    cache,
    visitor = false,
    synchronizationMode = "automatic",
    clock = () => new Date(),
    windowValue = globalThis.window
  } = {}) {
    if (!bridge || typeof bridge.listAccessibleCourses !== "function" ||
        typeof bridge.loadCourse !== "function") {
      throw new TypeError("Ponte canônica de Estudo obrigatória.");
    }
    if (!api || !visitor && (typeof api.loadPersonalState !== "function" ||
        typeof api.mutatePersonalState !== "function")) {
      throw new TypeError("API canônica de cursos obrigatória.");
    }
    if (!cache) throw new TypeError("Cache canônico de cursos obrigatório.");
    this.bridge = bridge;
    this.api = api;
    this.visitor = visitor === true;
    this.cache = cache;
    this.clock = clock;
    this.windowValue = windowValue;
    this.navigatorValue = windowValue?.navigator ?? null;
    this.BroadcastChannelValue = windowValue?.BroadcastChannel;
    this.navigationScope = String(cache.name || "course-cache");
    this.project = { contract: COURSE_DOCUMENT_CONTRACT, courses: [] };
    this.personalByCourseId = new Map();
    this.annotationsByCourseId = new Map();
    this.loadedCourseById = new Map();
    this.courseList = [];
    this.reviewItems = [];
    this.reviewHasMore = false;
    this.reviewCursor = null;
    this.listRuntimeStatus = { offline: false, stale: false, readOnly: false };
    this.studyNavigation = emptyStudyNavigation();
    this.offlineCourseRevisionById = new Map();
    this.setSynchronizationMode(synchronizationMode);
  }

  setSynchronizationMode(mode) {
    if (!new Set(["automatic", "manual"]).has(mode)) throw new TypeError("Modo de sincronização inválido.");
    this.synchronizationMode = mode;
    for (const personal of this.personalByCourseId.values()) personal.setSynchronizationMode(mode);
    for (const annotations of this.annotationsByCourseId.values()) annotations.setSynchronizationMode(mode);
  }

  async initialize() {
    await this.#readStudyNavigation();
    if (typeof this.BroadcastChannelValue === "function") {
      try {
        this.#studyNavigationChannel = new this.BroadcastChannelValue(
          STUDY_NAVIGATION_CHANNEL
        );
        this.#studyNavigationChannel.addEventListener?.("message", (event) => {
          if (event?.data?.scope !== this.navigationScope ||
              event?.data?.type !== "navigation-changed") return;
          this.#studyNavigationReload = this.#studyNavigationReload.then(async () => {
            await this.#readStudyNavigation();
            this.#notifyStudyNavigation();
          }).catch(() => undefined);
        });
      } catch {
        this.#studyNavigationChannel = null;
      }
    }
    await this.refreshCourses();
    const selected = this.studyNavigation.selectedCourseId;
    if (this.synchronizationMode === "manual" && selected &&
        this.courseList.some((item) => item.courseId === selected)) {
      const cached = await this.bridge.loadCachedCourse?.(selected);
      if (cached) await this.loadCourse(selected, { initialResult: cached });
    }
    return this.loadProject();
  }

  async #readStudyNavigation() {
    try {
      this.studyNavigation = normalizeStudyNavigation(
        await this.cache.getCache(STUDY_NAVIGATION_CACHE_KEY)
      );
    } catch {
      await this.cache.putCache(STUDY_NAVIGATION_CACHE_KEY, null);
      this.studyNavigation = emptyStudyNavigation();
    }
    return this.studyNavigation;
  }

  #notifyStudyNavigation() {
    const snapshot = this.loadStudyNavigation();
    for (const listener of this.#studyNavigationListeners) {
      try {
        listener(snapshot);
      } catch (error) {
        console.error("Falha ao atualizar a navegação de Estudo.", error);
      }
    }
  }

  #signalStudyNavigation() {
    try {
      this.#studyNavigationChannel?.postMessage?.({
        type: "navigation-changed",
        scope: this.navigationScope
      });
    } catch {
      // A persistência local continua válida quando a sinalização entre abas falha.
    }
  }

  #enqueueStudyNavigation(operation) {
    const scheduled = this.#studyNavigationWrite.then(operation, operation);
    this.#studyNavigationWrite = scheduled.then(() => undefined, () => undefined);
    return scheduled;
  }

  #pruneStudyNavigation(accessibleCourseIds) {
    const allowed = accessibleCourseIds instanceof Set
      ? accessibleCourseIds
      : new Set(accessibleCourseIds || []);
    return this.#enqueueStudyNavigation(async () => {
      const updatedAt = nowIso(this.clock);
      const previous = JSON.stringify(this.studyNavigation);
      let cacheChanged = false;
      const next = await this.cache.updateCache(STUDY_NAVIGATION_CACHE_KEY, (cached) => {
        let current;
        try {
          current = normalizeStudyNavigation(cached);
        } catch {
          current = emptyStudyNavigation();
        }
        const positions = Object.fromEntries(Object.entries(current.positions)
          .filter(([courseId]) => allowed.has(courseId)));
        const selectedCourseId = allowed.has(current.selectedCourseId)
          ? current.selectedCourseId
          : [...allowed][0] || null;
        const normalized = normalizeStudyNavigation({
          contract: STUDY_NAVIGATION_CONTRACT,
          selectedCourseId,
          positions,
          updatedAt: selectedCourseId === current.selectedCourseId &&
            Object.keys(positions).length === Object.keys(current.positions).length
            ? current.updatedAt
            : updatedAt
        });
        cacheChanged = JSON.stringify(normalized) !== JSON.stringify(current);
        return normalized;
      });
      this.studyNavigation = normalizeStudyNavigation(next);
      const memoryChanged = JSON.stringify(this.studyNavigation) !== previous;
      if (memoryChanged) this.#notifyStudyNavigation();
      if (cacheChanged) this.#signalStudyNavigation();
      return cacheChanged || memoryChanged;
    });
  }

  async #listAllCourses({ cacheOnly = false } = {}) {
    const items = [];
    const cursors = new Set();
    let cursor = null;
    let offline = false;
    let stale = false;
    for (let pageIndex = 0; pageIndex < MAX_LIST_PAGES; pageIndex += 1) {
      const page = cacheOnly
        ? await this.bridge.listCachedCourses({ limit: 50, cursor })
        : await this.bridge.listAccessibleCourses({ limit: 50, cursor });
      if (!Array.isArray(page?.items)) throw new TypeError("A lista de cursos é inválida.");
      items.push(...page.items);
      offline ||= page.offline === true;
      stale ||= page.stale === true;
      if (page.hasMore !== true) return { items, offline, stale };
      if (!page.nextCursor) throw new TypeError("A lista de cursos omitiu o cursor seguinte.");
      const cursorKey = JSON.stringify(page.nextCursor);
      if (cursors.has(cursorKey)) throw new TypeError("A lista de cursos repetiu o cursor.");
      cursors.add(cursorKey);
      cursor = page.nextCursor;
    }
    throw new TypeError("A lista de cursos excedeu o limite seguro de páginas.");
  }

  async #reviewPage(cursor = null) {
    if (this.visitor) {
      const cached = await this.cache.getCache(REVIEW_PAGE_CACHE_KEY);
      return { items: Array.isArray(cached?.items) ? clone(cached.items) : [], hasMore: false, nextCursor: null };
    }
    if (typeof this.api.listCourseReviewItems !== "function") {
      return { items: [], hasMore: false, nextCursor: null };
    }
    const page = await this.api.listCourseReviewItems({ limit: REVIEW_PAGE_SIZE, cursor });
    if (!Array.isArray(page?.items)) throw new TypeError("A página de itens para rever é inválida.");
    if (page.hasMore === true && !page.nextCursor) {
      throw new TypeError("A página de itens para rever omitiu o cursor.");
    }
    if (cursor && page.hasMore === true &&
        JSON.stringify(cursor) === JSON.stringify(page.nextCursor)) {
      throw new TypeError("A página de itens para rever repetiu o cursor.");
    }
    return {
      items: clone(page.items),
      hasMore: page.hasMore === true,
      nextCursor: page.hasMore === true ? clone(page.nextCursor) : null
    };
  }

  #cacheReviewPage() {
    return this.cache.putCache(REVIEW_PAGE_CACHE_KEY, {
      items: clone(this.reviewItems),
      hasMore: this.reviewHasMore,
      nextCursor: clone(this.reviewCursor)
    });
  }

  #rebuildProject() {
    this.project = {
      contract: COURSE_DOCUMENT_CONTRACT,
      courses: this.courseList.map((descriptor) => {
        const loaded = this.loadedCourseById.get(descriptor.courseId);
        return clone(loaded?.course || descriptorCourse(descriptor));
      })
    };
  }

  async #purgeRevokedCourses(courseIds, { clearLists = true } = {}) {
    const revoked = [...new Set(courseIds)];
    for (const courseId of revoked) {
      const personal = this.personalByCourseId.get(courseId);
      if (personal) await personal.clearLocal();
      const annotations = this.annotationsByCourseId.get(courseId);
      if (annotations) {
        await annotations.clearLocal();
        annotations.close();
      }
      this.personalByCourseId.delete(courseId);
      this.annotationsByCourseId.delete(courseId);
      this.loadedCourseById.delete(courseId);
      this.offlineCourseRevisionById.delete(courseId);
      this.courseList = this.courseList.filter((item) => item.courseId !== courseId);
      this.reviewItems = this.reviewItems.filter((item) => item.courseId !== courseId);
      await this.bridge.clearCourse(courseId, { clearLists });
    }
    if (revoked.length) {
      await this.#pruneStudyNavigation(new Set(this.courseList.map((item) => item.courseId)));
      await this.#cacheReviewPage();
      this.#rebuildProject();
    }
  }

  async refreshCourses({ explicit = false } = {}) {
    if (this.synchronizationMode === "manual" && !explicit) {
      if (!this.courseList.length) this.courseList = (await this.#listAllCourses({ cacheOnly: true })).items;
      const cached = await this.cache.getCache(REVIEW_PAGE_CACHE_KEY);
      this.reviewItems = Array.isArray(cached?.items) ? clone(cached.items) : [];
      this.reviewHasMore = cached?.hasMore === true;
      this.reviewCursor = this.reviewHasMore ? clone(cached.nextCursor) : null;
      this.#rebuildProject();
      return this.loadProject();
    }
    const listed = await this.#listAllCourses();
    this.listRuntimeStatus = {
      offline: listed.offline === true,
      stale: listed.stale === true,
      readOnly: listed.offline === true
    };
    const list = listed.items;
    const retained = new Set();
    for (const descriptor of list) {
      retained.add(descriptor.courseId);
      if (this.offlineCourseRevisionById.has(descriptor.courseId) &&
          this.offlineCourseRevisionById.get(descriptor.courseId) !== descriptor.revision) {
        this.offlineCourseRevisionById.delete(descriptor.courseId);
      }
      const loaded = this.loadedCourseById.get(descriptor.courseId);
      if (!listed.offline && loaded && loaded.revision !== descriptor.revision) {
        loaded.offline = false;
        loaded.stale = true;
        loaded.readOnly = true;
      } else if (!listed.offline && loaded) {
        if (loaded.offline === true || loaded.stale === true || loaded.readOnly === true) {
          loaded.stale = true;
          loaded.readOnly = true;
        } else {
          loaded.offline = false;
          loaded.stale = false;
          loaded.readOnly = false;
        }
      }
    }
    if (!listed.offline) {
      const knownCourseIds = new Set([
        ...this.courseList.map((item) => item.courseId),
        ...this.loadedCourseById.keys(),
        ...this.personalByCourseId.keys(),
        ...this.annotationsByCourseId.keys(),
        ...this.offlineCourseRevisionById.keys(),
        ...Object.keys(this.studyNavigation.positions),
        ...(this.studyNavigation.selectedCourseId
          ? [this.studyNavigation.selectedCourseId]
          : [])
      ]);
      const revokedCourseIds = [...knownCourseIds].filter((courseId) =>
        !retained.has(courseId));
      if (revokedCourseIds.length) {
        await this.#purgeRevokedCourses(revokedCourseIds, { clearLists: false });
      }
    }
    for (const [courseId, personal] of this.personalByCourseId) {
      if (retained.has(courseId)) continue;
      if (listed.offline) continue;
      await personal.clearLocal();
      const annotations = this.annotationsByCourseId.get(courseId);
      if (annotations) {
        await annotations.clearLocal();
        annotations.close();
        this.annotationsByCourseId.delete(courseId);
      }
      await this.bridge.clearCourse(courseId, { clearLists: false });
      this.personalByCourseId.delete(courseId);
      this.loadedCourseById.delete(courseId);
    }
    for (const courseId of this.loadedCourseById.keys()) {
      if (!retained.has(courseId) && !listed.offline) {
        this.loadedCourseById.delete(courseId);
        this.offlineCourseRevisionById.delete(courseId);
      }
    }
    this.courseList = clone(list);
    if (!listed.offline) await this.#pruneStudyNavigation(retained);
    if (this.studyNavigation.selectedCourseId &&
        retained.has(this.studyNavigation.selectedCourseId)) {
      await this.refreshCourseOfflineAvailability(this.studyNavigation.selectedCourseId);
    }
    try {
      const page = await this.#reviewPage();
      this.reviewItems = page.items;
      this.reviewHasMore = page.hasMore;
      this.reviewCursor = page.nextCursor;
      await this.#cacheReviewPage();
    } catch (error) {
      if (!networkFailure(error)) throw error;
      const cached = await this.cache.getCache(REVIEW_PAGE_CACHE_KEY);
      this.reviewItems = Array.isArray(cached?.items) ? clone(cached.items) : [];
      this.reviewHasMore = cached?.hasMore === true;
      this.reviewCursor = this.reviewHasMore ? clone(cached?.nextCursor) : null;
    }
    this.reviewItems = this.reviewItems.filter((item) => retained.has(item?.courseId));
    if (!listed.offline) {
      await this.#cacheReviewPage();
    }
    this.#rebuildProject();
    return this.loadProject();
  }

  async maintainCourse({ courseId, operation, confirmed, requestId } = {}) {
    if (this.visitor) throw new Error("Entre na sua conta para gerenciar cursos.");
    if (typeof this.bridge.maintainCourse !== "function") {
      throw new TypeError("O ciclo de vida do curso não está disponível.");
    }
    const result = await this.bridge.maintainCourse({
      courseId,
      operation,
      confirmed,
      requestId
    });
    await this.#purgeRevokedCourses([courseId], { clearLists: true });
    return result;
  }

  async clearLocalCourse(courseIdentity) {
    const courseId = this.resolveCourseContractKey(courseIdentity);
    if (!courseId) throw new TypeError("O curso não está acessível.");
    const personal = this.personalByCourseId.get(courseId);
    if (personal) await personal.clearLocal();
    const annotations = this.annotationsByCourseId.get(courseId);
    if (annotations) {
      await annotations.clearLocal();
      annotations.close();
    }
    this.personalByCourseId.delete(courseId);
    this.annotationsByCourseId.delete(courseId);
    this.loadedCourseById.delete(courseId);
    this.offlineCourseRevisionById.delete(courseId);
    this.reviewItems = this.reviewItems.filter((item) => item.courseId !== courseId);
    await this.bridge.clearCourse(courseId, { clearLists: false });
    await this.clearStudyNavigationPosition?.(courseId);
    await this.#cacheReviewPage();
    this.#rebuildProject();
    return this.loadProject();
  }

  async loadCourseById(courseIdentity) {
    const courseId = String(courseIdentity || "").trim().toLowerCase();
    if (!COURSE_ID_PATTERN.test(courseId)) throw new TypeError("Identidade do curso inválida.");
    let initialResult = null;
    if (!this.courseList.some((item) => item.courseId === courseId)) {
      const result = await this.bridge.loadCourse(courseId);
      initialResult = result;
      if (result.course?.courseId !== courseId || result.document?.courses?.[0]?.id !== courseId) {
        throw new TypeError("O curso recebido não corresponde ao endereço solicitado.");
      }
      this.courseList.push({ ...clone(result.course),
        canEdit: !this.visitor && result.course.ownership === "owned" && result.course.canEdit === true });
      this.#rebuildProject();
    }
    return this.loadCourse(courseId, { initialResult });
  }

  async loadCourse(courseIdentity, { initialResult = null, explicit = false } = {}) {
    const courseId = this.resolveCourseContractKey(courseIdentity);
    const descriptor = this.courseList.find((item) => item.courseId === courseId);
    if (!descriptor) throw new Error("O curso solicitado não está acessível.");
    let loaded = this.loadedCourseById.get(courseId);
    if (!loaded || (explicit || this.synchronizationMode !== "manual") && (loaded.revision !== descriptor.revision || (
      this.listRuntimeStatus.offline !== true &&
      (loaded.offline === true || loaded.stale === true || loaded.readOnly === true)
    ))) {
      let result;
      try {
        result = initialResult ?? await this.bridge.loadCourse(courseId, {
          verifiedRevision: descriptor.revision
        });
      } catch (error) {
        if (courseAccessRevoked(error)) await this.#purgeRevokedCourses([courseId]);
        throw error;
      }
      const course = result.document?.courses?.[0];
      if (!course || course.id !== courseId) {
        throw new TypeError("O documento carregado não corresponde ao curso listado.");
      }
      const resultRevision = Number(result.revision ?? result.course?.revision ?? descriptor.revision);
      if (!Number.isSafeInteger(resultRevision) || resultRevision < 1) {
        throw new TypeError("A versão do documento carregado é inválida.");
      }
      loaded = {
        revision: resultRevision,
        course: clone(course),
        rows: Array.isArray(result.rows) ? clone(result.rows) : [],
        offline: result.offline === true,
        stale: result.stale === true || resultRevision !== descriptor.revision,
        readOnly: result.readOnly === true || result.offline === true ||
          resultRevision !== descriptor.revision
      };
      this.loadedCourseById.set(courseId, loaded);
      if (!loaded.readOnly && result.course?.canEdit === true) {
        descriptor.canEdit = true;
      }
    }
    await this.refreshCourseOfflineAvailability(courseId);
    let personal = this.personalByCourseId.get(courseId);
    if (!personal) {
      personal = new CoursePersonalStateRepository({
        courseId,
        api: this.api,
        cache: this.cache,
        localOnly: this.visitor,
        synchronizationMode: this.synchronizationMode,
        course: loaded.course,
        clock: this.clock
      });
      try {
        await personal.initialize();
      } catch (error) {
        if (courseAccessRevoked(error)) await this.#purgeRevokedCourses([courseId]);
        throw error;
      }
      this.personalByCourseId.set(courseId, personal);
    } else {
      personal.setCourse(loaded.course);
      try {
        await personal.refresh({ cacheOnly: true });
      } catch (error) {
        if (courseAccessRevoked(error)) await this.#purgeRevokedCourses([courseId]);
        throw error;
      }
    }
    let annotations = this.annotationsByCourseId.get(courseId);
    if (!this.visitor && !annotations && typeof this.api.getMyCourseAnchoredAnnotations === "function" &&
        typeof this.api.executeMyCourseAnchoredAnnotationCommand === "function") {
      annotations = new CourseAnnotationRepository({
        courseId,
        courseRevision: loaded.revision,
        api: this.api,
        cache: this.cache,
        clock: this.clock,
        windowValue: this.windowValue,
        navigatorValue: this.navigatorValue,
        synchronizationMode: this.synchronizationMode
      });
      try {
        await annotations.initialize();
      } catch (error) {
        if (courseAccessRevoked(error)) await this.#purgeRevokedCourses([courseId]);
        throw error;
      }
      this.annotationsByCourseId.set(courseId, annotations);
    } else if (annotations) {
      annotations.setCourseRevision(loaded.revision);
    }
    this.#rebuildProject();
    return clone(loaded.course);
  }

  async loadStudyUnitCitations(reference) {
    if (typeof this.api.getStudyUnitCitations !== "function") {
      throw new TypeError("API de citações do Estudo indisponível.");
    }
    const courseId = courseIdFromReference(reference);
    const studyUnitId = studyUnitIdFromReference(reference);
    const descriptor = this.courseList.find((item) => item.courseId === courseId);
    const loaded = this.loadedCourseById.get(courseId);
    const expectedRevision = loaded?.revision || descriptor?.revision;
    if (!COURSE_ID_PATTERN.test(courseId) || !studyUnitId ||
        !Number.isSafeInteger(expectedRevision) || expectedRevision < 1) {
      throw new TypeError("Referência de unidade de estudo inválida para citações.");
    }
    let rawCitations;
    try {
      rawCitations = await this.api.getStudyUnitCitations(
        courseId,
        studyUnitId,
        { expectedRevision }
      );
    } catch (error) {
      const normalizedError = courseRevisionConflict(error)
        ? courseRevisionChangedError(error)
        : error;
      if (courseAccessRevoked(normalizedError)) await this.#purgeRevokedCourses([courseId]);
      throw normalizedError;
    }
    const citations = normalizeCourseStudyCitationsRead(rawCitations);
    if (citations.courseId !== courseId || citations.courseRevision !== expectedRevision ||
        citations.studyUnitId !== studyUnitId) {
      if (citations.courseRevision !== expectedRevision) {
        throw courseRevisionChangedError();
      }
      throw new TypeError("As citações não correspondem à Unidade solicitada.");
    }
    return citations;
  }

  loadProject() {
    return clone(this.project);
  }

  async getStudyCitationAttachmentDownload(reference, citation) {
    const courseId = courseIdFromReference(reference);
    const expectedCourseRevision = this.loadedCourseById.get(courseId)?.revision;
    if (!expectedCourseRevision || citation?.courseRevision !== expectedCourseRevision ||
        typeof this.bridge.getCourseSourceAttachmentDownload !== "function") {
      throw courseRevisionChangedError();
    }
    const result = normalizeCourseSourcePdfDownload(await this.bridge.getCourseSourceAttachmentDownload({
      courseId, expectedCourseRevision, sourceId: citation.sourceId,
      sourceRevision: citation.sourceRevision, contentHash: citation.attachment?.contentHash
    }));
    if (result.courseId !== courseId || result.courseRevision !== expectedCourseRevision ||
        result.sourceId !== citation.sourceId || result.sourceRevision !== citation.sourceRevision ||
        result.attachment.contentHash !== citation.attachment?.contentHash ||
        result.attachment.byteSize !== citation.attachment?.byteSize ||
        result.attachment.mediaType !== citation.attachment?.mediaType) {
      throw new TypeError("O PDF não corresponde à citação consultada.");
    }
    return result;
  }

  saveProject() {
    throw new Error("O Estudo não altera o conteúdo canônico do curso.");
  }

  resolveCourseContractKey(courseIdentity) {
    const requested = String(courseIdentity || "").trim().toLowerCase();
    return this.courseList.some(({ courseId }) => courseId === requested) ? requested : "";
  }

  loadCourseSummaries() {
    return this.courseList.map((item) => ({
      courseId: item.courseId,
      title: item.title,
      revision: item.revision,
      ownership: item.ownership,
      canEdit: !this.visitor && item.ownership === "owned" && item.canEdit === true,
      canObserve: !this.visitor && item.canObserve === true,
      ...(item.ownership === "owned" && item.copyOrigin ? { copyOrigin: clone(item.copyOrigin) } : {}),
      moduleCount: Number(item.moduleCount || 0),
      lessonCount: Number(item.lessonCount || 0),
      microsequenceCount: Number(item.microsequenceCount || 0),
      studyUnitCount: Number(item.studyUnitCount || 0),
      completedStudyUnitCount: Number(item.completedStudyUnitCount || 0),
      availableOffline: this.offlineCourseRevisionById.get(item.courseId) === item.revision,
      updatedAt: item.updatedAt
    }));
  }

  loadStudyNavigation() {
    return clone(this.studyNavigation);
  }

  subscribeToStudyNavigation(listener) {
    if (typeof listener !== "function") {
      throw new TypeError("Listener da navegação de Estudo inválido.");
    }
    this.#studyNavigationListeners.add(listener);
    return () => this.#studyNavigationListeners.delete(listener);
  }

  saveStudyNavigation({ selectedCourseId, position = null } = {}) {
    const normalizedCourseId = String(selectedCourseId || "").trim().toLowerCase();
    if (!this.courseList.some((item) => item.courseId === normalizedCourseId)) {
      throw new TypeError("O curso selecionado não está acessível.");
    }
    return this.#enqueueStudyNavigation(async () => {
      const timestamp = nowIso(this.clock);
      const next = await this.cache.updateCache(STUDY_NAVIGATION_CACHE_KEY, (cached) => {
        let current;
        try {
          current = normalizeStudyNavigation(cached);
        } catch {
          current = emptyStudyNavigation();
        }
        const positions = { ...current.positions };
        if (position !== null) {
          const entityPath = Array.isArray(position?.entityPath)
            ? [...position.entityPath]
            : null;
          positions[normalizedCourseId] = normalizeStudyNavigationPosition({
            view: position?.view,
            entityPath,
            microsequenceMode: position?.microsequenceMode,
            updatedAt: timestamp
          }, normalizedCourseId);
        }
        const trimmedPositions = Object.fromEntries(Object.entries(positions)
          .sort((left, right) => String(right[1].updatedAt).localeCompare(
            String(left[1].updatedAt)
          ))
          .slice(0, MAX_STUDY_NAVIGATION_POSITIONS));
        return normalizeStudyNavigation({
          contract: STUDY_NAVIGATION_CONTRACT,
          selectedCourseId: normalizedCourseId,
          positions: trimmedPositions,
          updatedAt: timestamp
        });
      });
      this.studyNavigation = normalizeStudyNavigation(next);
      this.#notifyStudyNavigation();
      this.#signalStudyNavigation();
      return this.loadStudyNavigation();
    });
  }

  clearStudyNavigationPosition(courseIdentity, { expectedPosition } = {}) {
    const courseId = this.resolveCourseContractKey(courseIdentity);
    if (!courseId) return Promise.resolve(false);
    const hasExpectedPosition = expectedPosition !== undefined;
    const normalizedExpected = hasExpectedPosition
      ? normalizeStudyNavigationPosition(expectedPosition, courseId)
      : null;
    return this.#enqueueStudyNavigation(async () => {
      let cacheChanged = false;
      const previous = JSON.stringify(this.studyNavigation);
      const next = await this.cache.updateCache(STUDY_NAVIGATION_CACHE_KEY, (cached) => {
        let current;
        try {
          current = normalizeStudyNavigation(cached);
        } catch {
          current = emptyStudyNavigation();
        }
        if (!Object.hasOwn(current.positions, courseId)) return current;
        if (hasExpectedPosition && JSON.stringify(current.positions[courseId]) !==
            JSON.stringify(normalizedExpected)) return current;
        const positions = { ...current.positions };
        delete positions[courseId];
        cacheChanged = true;
        return normalizeStudyNavigation({
          ...current,
          positions,
          updatedAt: nowIso(this.clock)
        });
      });
      this.studyNavigation = normalizeStudyNavigation(next);
      const memoryChanged = JSON.stringify(this.studyNavigation) !== previous;
      if (memoryChanged) this.#notifyStudyNavigation();
      if (cacheChanged) this.#signalStudyNavigation();
      return cacheChanged;
    });
  }

  async refreshCourseOfflineAvailability(courseIdentity) {
    const courseId = this.resolveCourseContractKey(courseIdentity);
    const descriptor = this.courseList.find((item) => item.courseId === courseId);
    if (!descriptor) return false;
    let available;
    try {
      available = typeof this.bridge.hasOfflineCourse === "function" &&
        await this.bridge.hasOfflineCourse(courseId, { revision: descriptor.revision }) === true;
    } catch {
      available = false;
    }
    if (available) this.offlineCourseRevisionById.set(courseId, descriptor.revision);
    else this.offlineCourseRevisionById.delete(courseId);
    return available;
  }

  loadStudyUnitCompositionContext(reference) {
    const courseId = courseIdFromReference(reference);
    const studyUnitId = studyUnitIdFromReference(reference);
    const loaded = this.loadedCourseById.get(courseId);
    const row = loaded?.rows?.find((candidate) =>
      candidate?.entityType === "study_unit" && candidate.entityId === studyUnitId
    );
    if (!loaded || !row || !Number.isSafeInteger(row.version) || row.version < 1 ||
        typeof row.parentId !== "string" || !row.parentId) return null;
    return clone({
      courseId,
      courseRevision: loaded.revision,
      didacticMicrosequenceId: row.parentId,
      studyUnitId,
      studyUnitVersion: row.version
    });
  }

  loadStudyDraftRecovery(sourceCourseId = null) {
    if (this.visitor || typeof this.bridge.loadStudyDraftRecovery !== "function") {
      return Promise.resolve(null);
    }
    return this.bridge.loadStudyDraftRecovery(sourceCourseId);
  }

  clearStudyDraftRecovery(sourceCourseId = null, expectedRequestId = null) {
    return this.bridge.clearStudyDraftRecovery?.(sourceCourseId, expectedRequestId) ?? Promise.resolve(false);
  }

  async recoverStudyDraft(sourceCourseId = null) {
    if (this.visitor || typeof this.bridge.recoverStudyDraft !== "function") return null;
    const result = await this.bridge.recoverStudyDraft(sourceCourseId);
    if (result?.targetCourseId && result.status === "confirmed") {
      await this.loadCourseById(result.targetCourseId);
      const descriptor = this.courseList.find((item) => item.courseId === result.targetCourseId);
      if (descriptor?.ownership !== "owned") throw new Error("O curso recuperado não pertence à sua conta.");
      return { ...result, project: this.loadProject() };
    }
    return result;
  }

  loadRuntimeStatus(courseIdentity = "") {
    const courseId = String(courseIdentity || "").trim().toLowerCase();
    const loaded = this.loadedCourseById.get(courseId);
    const personal = this.personalByCourseId.get(courseId);
    let pending = false;
    let personalStatus = null;
    try {
      personalStatus = personal?.snapshot?.();
      if (!courseId) {
        const snapshots = [...this.personalByCourseId.values()].map((value) => value.snapshot());
        personalStatus = {
          pending: snapshots.some((value) => value.pending),
          synchronizing: snapshots.some((value) => value.synchronizing),
          syncError: snapshots.find((value) => value.syncError)?.syncError || null,
          conflict: snapshots.find((value) => value.conflict)?.conflict || null
        };
      }
      pending = personalStatus?.pending === true;
      const annotations = courseId
        ? [this.annotationsByCourseId.get(courseId)].filter(Boolean)
        : [...this.annotationsByCourseId.values()];
      pending ||= annotations.some((value) => value.snapshot().pendingCount > 0);
      if (annotations.some((value) => value.snapshot().failedCount > 0)) {
        personalStatus = { ...personalStatus, syncError: personalStatus?.syncError || "Uma observação precisa ser conferida antes de sincronizar." };
      }
    } catch {
      // O estado pessoal pode terminar de carregar depois do conteúdo offline.
    }
    return clone({
      offline: this.listRuntimeStatus.offline || loaded?.offline === true,
      stale: this.listRuntimeStatus.stale || loaded?.stale === true,
      readOnly: this.listRuntimeStatus.readOnly || loaded?.readOnly === true,
      pending,
      synchronizationMode: this.synchronizationMode,
      synchronizing: personalStatus?.synchronizing === true,
      syncError: personalStatus?.syncError || null,
      conflict: personalStatus?.conflict || null,
      ...(this.visitor ? { visitor: true, localOnly: true } : {})
    });
  }

  #personal(reference) {
    const courseId = courseIdFromReference(reference);
    const personal = this.personalByCourseId.get(courseId);
    if (!personal) throw new Error("O curso do estado pessoal não está carregado.");
    return personal;
  }

  #annotations(reference) {
    if (this.visitor) throw new Error("Entre na sua conta para enviar observações.");
    const courseId = courseIdFromReference(reference);
    const annotations = this.annotationsByCourseId.get(courseId);
    if (!annotations) throw new Error("As observações deste curso não estão disponíveis.");
    return annotations;
  }

  loadProgress() {
    return mergeProgress([...this.personalByCourseId.entries()]
      .filter(([courseId]) => this.loadedCourseById.has(courseId))
      .map(([, personal]) => personal.loadProgress()));
  }

  clearCourseProgress(courseIdentity) {
    return this.#personal({ courseId: courseIdentity }).clearProgress()
      .then(() => {
        const summary = this.courseList.find(({ courseId }) => courseId === courseIdentity);
        if (summary) summary.completedStudyUnitCount = 0;
        return this.loadProgress();
      });
  }

  async clearProgressScope({
    courseId,
    moduleId = "",
    lessonId = "",
    microsequenceId = "",
    studyUnitId = ""
  } = {}) {
    const normalizedCourseId = this.resolveCourseContractKey(courseId);
    if (!normalizedCourseId) throw new Error("O curso do progresso não está acessível.");
    const course = findCourse(this.project, normalizedCourseId);
    if (!course?.modules?.length) throw new Error("Carregue o curso antes de zerar o progresso.");
    const personal = this.#personal({ courseId: normalizedCourseId });
    await personal.clearProgressScope({
      courseId: normalizedCourseId,
      moduleId,
      lessonId,
      microsequenceId,
      studyUnitId
    });
    const completedStudyUnitCount = Object.values(personal.loadProgress().lessons)
      .reduce((total, entry) => total + entry.completedStudyUnitIds.length, 0);
    const summary = this.courseList.find((item) => item.courseId === normalizedCourseId);
    if (summary) summary.completedStudyUnitCount = completedStudyUnitCount;
    return this.loadProgress();
  }

  isStudyUnitCompleted(reference) {
    return this.#personal(reference).isStudyUnitCompleted(reference);
  }

  setStudyUnitCompleted(reference, completed = true, options = {}) {
    return this.#personal(reference).setStudyUnitCompleted(reference, completed, options);
  }

  isStudyUnitMarkedForReview(reference) {
    return this.#personal(reference).isStudyUnitMarkedForReview(reference);
  }

  async setStudyUnitReviewMark(reference, marked) {
    const result = await this.#personal(reference).setStudyUnitReviewMark(reference, marked);
    if (this.visitor) {
      this.reviewItems = this.loadReviewItems().map((item) => ({ ...item, courseId: item.entityPath[0] }));
      await this.#cacheReviewPage();
    }
    return result;
  }

  loadReviewItems() {
    const locallyLoaded = new Set(this.personalByCourseId.keys());
    return [
      ...this.reviewItems.filter((item) => !locallyLoaded.has(item.courseId)),
      ...[...this.personalByCourseId.values()].flatMap((personal) =>
        personal.loadReviewItems())
    ].sort((left, right) =>
      String(right.reviewMarkedAt).localeCompare(String(left.reviewMarkedAt)));
  }

  hasMoreReviewItems() {
    return this.reviewHasMore;
  }

  async loadMoreReviewItems() {
    if (!this.reviewHasMore || !this.reviewCursor) return this.loadReviewItems();
    const page = await this.#reviewPage(this.reviewCursor);
    const seen = new Set(this.reviewItems.map((item) => JSON.stringify(item.entityPath)));
    for (const item of page.items) {
      const key = JSON.stringify(item.entityPath);
      if (!seen.has(key)) this.reviewItems.push(item);
      seen.add(key);
    }
    this.reviewHasMore = page.hasMore;
    this.reviewCursor = page.nextCursor;
    await this.#cacheReviewPage();
    return this.loadReviewItems();
  }

  loadAnnotationsForPath(reference) {
    const annotations = this.annotationsByCourseId.get(courseIdFromReference(reference));
    return annotations ? annotations.loadForTarget(reference) : [];
  }

  async #runAnnotationOperation(reference, operation) {
    const id = courseIdFromReference(reference);
    try {
      return await operation(this.#annotations(reference));
    } catch (error) {
      if (courseAccessRevoked(error)) await this.#purgeRevokedCourses([id]);
      throw error;
    }
  }

  refreshAnnotationsForPath(reference, options = {}) {
    return this.#runAnnotationOperation(reference, (annotations) =>
      annotations.refreshTarget(reference, options));
  }

  createAnnotationForPath(reference, draft) {
    return this.#runAnnotationOperation(reference, (annotations) =>
      annotations.createForTarget(reference, draft));
  }

  reviseAnnotation(reference, annotationId, draft) {
    return this.#runAnnotationOperation(reference, (annotations) =>
      annotations.revise(annotationId, draft));
  }

  withdrawAnnotation(reference, annotationId) {
    return this.#runAnnotationOperation(reference, (annotations) =>
      annotations.withdraw(annotationId));
  }

  discardFailedAnnotation(reference, annotationId) {
    return this.#runAnnotationOperation(reference, (annotations) =>
      annotations.discardFailed(annotationId));
  }

  subscribeToAnnotations(reference, listener) {
    return this.#annotations(reference).subscribe(listener);
  }

  async refreshPersonalState(options = {}) {
    const revokedCourseIds = [];
    for (const [courseId, personal] of this.personalByCourseId) {
      try {
        await personal.refresh(options);
        const completedStudyUnitCount = Object.values(personal.loadCanonicalState().progress.lessons)
          .reduce((total, entry) => total + entry.completedStudyUnitIds.length, 0);
        const summary = this.courseList.find((item) => item.courseId === courseId);
        if (summary) summary.completedStudyUnitCount = completedStudyUnitCount;
      } catch (error) {
        if (!courseAccessRevoked(error)) throw error;
        revokedCourseIds.push(courseId);
      }
    }
    for (const [courseId, annotations] of this.annotationsByCourseId) {
      try {
        await annotations.flush(options);
      } catch (error) {
        if (!courseAccessRevoked(error)) throw error;
        revokedCourseIds.push(courseId);
      }
    }
    await this.#purgeRevokedCourses(revokedCourseIds);
    this.#rebuildProject();
    return this.loadProject();
  }

  loadCourseDesign(courseId, options = {}) {
    if (this.visitor || typeof this.bridge.loadCourseDesign !== "function") {
      throw new TypeError("Os ajustes de autoria exigem uma conta proprietária.");
    }
    return this.bridge.loadCourseDesign(courseId, options);
  }

  async checkAccess() {
    const revokedCourseIds = [];
    for (const courseId of this.loadedCourseById.keys()) {
      try {
        await this.bridge.checkCourseAccess(courseId);
      } catch (error) {
        if (courseAccessRevoked(error)) revokedCourseIds.push(courseId);
        else if (!networkFailure(error)) throw error;
      }
    }
    await this.#purgeRevokedCourses(revokedCourseIds);
    return { changed: revokedCourseIds.length > 0, revokedCourseIds, project: this.loadProject() };
  }

  resolvePersonalStateConflict(courseId, options = {}) {
    return this.#personal({ courseId }).resolveConflict(options);
  }

  async #visitorSnapshot(visitorCache) {
    if (this.visitor || !visitorCache || visitorCache === this.cache ||
        visitorCache.name !== "aralearn-course-v1-visitor" ||
        typeof visitorCache.readCachePrefix !== "function") {
      throw new TypeError("A incorporação exige o compartimento visitante separado da conta.");
    }
    const rows = await visitorCache.readCachePrefix(`${COURSE_PERSONAL_STATE_CACHE_CONTRACT}:`);
    const courses = rows.map(({ value }) => {
      if (value?.contract !== COURSE_PERSONAL_STATE_CACHE_CONTRACT ||
          !COURSE_ID_PATTERN.test(value.courseId)) throw new TypeError("Estado visitante inválido.");
      return { courseId: value.courseId, state: validateCoursePersonalState(value.state) };
    }).filter(({ state }) => Object.keys(state.progress.lessons).length || Object.keys(state.reviewMarks).length)
      .sort((left, right) => left.courseId.localeCompare(right.courseId));
    const bytes = new TextEncoder().encode(JSON.stringify(courses));
    const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
    const snapshotId = [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
    return { snapshotId, courses };
  }

  async previewVisitorState(visitorCache) {
    const snapshot = await this.#visitorSnapshot(visitorCache);
    const courses = [];
    for (const { courseId, state } of snapshot.courses) {
      let descriptor;
      try {
        descriptor = await this.bridge.checkCourseAccess(courseId);
      } catch (error) {
        if (courseAccessRevoked(error)) continue;
        throw error;
      }
      courses.push({ courseId, title: descriptor.title || "Curso",
        completedCount: Object.values(state.progress.lessons).reduce((total, entry) =>
          total + entry.completedStudyUnitIds.length, 0),
        reviewCount: Object.keys(state.reviewMarks).length });
    }
    return { snapshotId: snapshot.snapshotId, courses };
  }

  async adoptVisitorState(visitorCache, { courseIds, expectedSnapshotId } = {}) {
    const snapshot = await this.#visitorSnapshot(visitorCache);
    if (snapshot.snapshotId !== expectedSnapshotId) {
      throw new Error("O estudo visitante mudou. Confira a seleção antes de incorporar.");
    }
    if (!Array.isArray(courseIds) || !courseIds.length || new Set(courseIds).size !== courseIds.length ||
        courseIds.some((id) => !snapshot.courses.some((entry) => entry.courseId === id))) {
      throw new TypeError("Selecione os cursos visitantes que deseja incorporar.");
    }
    for (const courseId of courseIds) {
      const descriptor = await this.bridge.checkCourseAccess(courseId);
      const receiptKey = `course.v1.visitor-adoption:${snapshot.snapshotId}:${courseId}`;
      if (await this.cache.getCache(receiptKey)) continue;
      const personal = this.personalByCourseId.get(courseId) || new CoursePersonalStateRepository({
        courseId, api: this.api, cache: this.cache, synchronizationMode: this.synchronizationMode, clock: this.clock
      });
      await personal.initialize({ refresh: false });
      // Fetch the account baseline before adding visitor work. A failed fetch
      // must not bind an unknown account state to a visitor snapshot.
      await personal.refresh({ explicit: true });
      if (personal.snapshot().syncError) throw new Error("Conecte-se para conferir o estado da conta antes de incorporar.");
      await personal.adoptVisitorState(snapshot.courses.find((entry) => entry.courseId === courseId).state, { receiptKey });
      this.personalByCourseId.set(courseId, personal);
      const summary = this.courseList.find((item) => item.courseId === courseId);
      if (!summary) this.courseList.push(clone(descriptor));
    }
    await this.refreshPersonalState();
    this.#rebuildProject();
    return { snapshotId: snapshot.snapshotId, courseIds: clone(courseIds), project: this.loadProject() };
  }

  async flush(options = {}) {
    await this.#studyNavigationWrite;
    const snapshots = [];
    const revokedCourseIds = [];
    for (const [courseId, personal] of this.personalByCourseId) {
      try {
        snapshots.push(await personal.flush(options));
      } catch (error) {
        if (!courseAccessRevoked(error)) throw error;
        revokedCourseIds.push(courseId);
      }
    }
    for (const [courseId, annotations] of this.annotationsByCourseId) {
      try {
        snapshots.push(await annotations.flush(options));
      } catch (error) {
        if (!courseAccessRevoked(error)) throw error;
        revokedCourseIds.push(courseId);
      }
    }
    await this.#purgeRevokedCourses(revokedCourseIds);
    return snapshots;
  }

  async close({ flush = true } = {}) {
    if (typeof flush !== "boolean") {
      throw new TypeError("Política de encerramento do Estudo inválida.");
    }
    if (flush) await this.flush();
    else await this.#studyNavigationWrite;
    for (const annotations of this.annotationsByCourseId.values()) annotations.close();
    this.annotationsByCourseId.clear();
    this.personalByCourseId.clear();
    this.#studyNavigationChannel?.close?.();
    this.#studyNavigationChannel = null;
    this.#studyNavigationListeners.clear();
  }
}

export {
  COURSE_DOCUMENT_CONTRACT as COURSE_STUDY_DOCUMENT_CONTRACT,
  STUDY_NAVIGATION_CONTRACT as COURSE_STUDY_NAVIGATION_CONTRACT
};
