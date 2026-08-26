import {
  createEmptyProgressDocument,
  validateProgressDocument
} from "../storage/progressStore.js";
import { CoursePersonalStateRepository } from "../persistence/CoursePersonalStateRepository.js";
import { CourseAnnotationRepository } from "../persistence/CourseAnnotationRepository.js";
import { normalizeCourseStudyCitationsRead } from "../domain/courseSources.js";
import { createUuid } from "../domain/identifiers.js";
import {
  exactStudyUnitSelection,
  findCourse,
  selectionForCourse
} from "./CourseStudyNavigation.js";

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

function selectionForStudyUnitIdentity(project, courseId, studyUnitId) {
  const course = findCourse(project, courseId);
  for (const moduleValue of course?.modules || []) {
    for (const lesson of moduleValue.lessons || []) {
      for (const microsequence of lesson.microsequences || []) {
        const studyUnitIndex = (microsequence.studyUnits || [])
          .findIndex(({ id }) => id === studyUnitId);
        if (studyUnitIndex >= 0) {
          return {
            courseId,
            moduleId: moduleValue.id,
            lessonId: lesson.id,
            microsequenceId: microsequence.id,
            studyUnitId,
            studyUnitIndex
          };
        }
      }
    }
  }
  return null;
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
    throw new TypeError("A posição pertence a outro Curso.");
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
      throw new TypeError("Curso da posição de Estudo inválido.");
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
  const error = new Error("O Curso mudou durante a leitura das citações.");
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
    clock = () => new Date(),
    windowValue = globalThis.window
  } = {}) {
    if (!bridge || typeof bridge.listAccessibleCourses !== "function" ||
        typeof bridge.loadCourse !== "function") {
      throw new TypeError("Ponte canônica de Estudo obrigatória.");
    }
    if (!api || typeof api.loadPersonalState !== "function" ||
        typeof api.mutatePersonalState !== "function") {
      throw new TypeError("API canônica de Cursos obrigatória.");
    }
    if (!cache) throw new TypeError("Cache canônico de Cursos obrigatório.");
    this.bridge = bridge;
    this.api = api;
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

  async #listAllCourses() {
    const items = [];
    const cursors = new Set();
    let cursor = null;
    let offline = false;
    let stale = false;
    for (let pageIndex = 0; pageIndex < MAX_LIST_PAGES; pageIndex += 1) {
      const page = await this.bridge.listAccessibleCourses({ limit: 50, cursor });
      if (!Array.isArray(page?.items)) throw new TypeError("A lista de Cursos é inválida.");
      items.push(...page.items);
      offline ||= page.offline === true;
      stale ||= page.stale === true;
      if (page.hasMore !== true) return { items, offline, stale };
      if (!page.nextCursor) throw new TypeError("A lista de Cursos omitiu o cursor seguinte.");
      const cursorKey = JSON.stringify(page.nextCursor);
      if (cursors.has(cursorKey)) throw new TypeError("A lista de Cursos repetiu o cursor.");
      cursors.add(cursorKey);
      cursor = page.nextCursor;
    }
    throw new TypeError("A lista de Cursos excedeu o limite seguro de páginas.");
  }

  async #reviewPage(cursor = null) {
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

  async refreshCourses() {
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
    if (typeof this.bridge.maintainCourse !== "function") {
      throw new TypeError("O ciclo de vida do Curso não está disponível.");
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
    if (!courseId) throw new TypeError("O Curso não está acessível.");
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

  async loadCourse(courseIdentity) {
    const courseId = this.resolveCourseContractKey(courseIdentity);
    const descriptor = this.courseList.find((item) => item.courseId === courseId);
    if (!descriptor) throw new Error("O Curso solicitado não está acessível.");
    let loaded = this.loadedCourseById.get(courseId);
    if (!loaded || loaded.revision !== descriptor.revision || (
      this.listRuntimeStatus.offline !== true &&
      (loaded.offline === true || loaded.stale === true || loaded.readOnly === true)
    )) {
      let result;
      try {
        result = await this.bridge.loadCourse(courseId, {
          verifiedRevision: descriptor.revision
        });
      } catch (error) {
        if (courseAccessRevoked(error)) await this.#purgeRevokedCourses([courseId]);
        throw error;
      }
      const course = result.document?.courses?.[0];
      if (!course || course.id !== courseId) {
        throw new TypeError("O documento carregado não corresponde ao Curso listado.");
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
    }
    let annotations = this.annotationsByCourseId.get(courseId);
    if (!annotations && typeof this.api.getMyCourseAnchoredAnnotations === "function" &&
        typeof this.api.executeMyCourseAnchoredAnnotationCommand === "function") {
      annotations = new CourseAnnotationRepository({
        courseId,
        courseRevision: loaded.revision,
        api: this.api,
        cache: this.cache,
        clock: this.clock,
        windowValue: this.windowValue,
        navigatorValue: this.navigatorValue
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
      throw new TypeError("Referência de Unidade de estudo inválida para citações.");
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

  saveProject() {
    throw new Error("O Estudo não altera o conteúdo canônico do Curso.");
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
      canEdit: item.ownership === "owned" && item.canEdit === true,
      canDerive: item.canDerive === true,
      isPersonalCopy: item.isPersonalCopy === true,
      personalCopyCourseId: item.personalCopyCourseId ?? null,
      ...(item.sourceCourseId == null ? {} : {
        sourceCourseId: item.sourceCourseId,
        sourceCourseRevision: item.sourceCourseRevision
      }),
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
      throw new TypeError("O Curso selecionado não está acessível.");
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

  loadPendingPersonalCopyEdit(sourceCourseId = null) {
    if (typeof this.bridge.loadPendingPersonalCopyEdit !== "function") {
      return Promise.resolve(null);
    }
    return this.bridge.loadPendingPersonalCopyEdit(sourceCourseId);
  }

  clearPendingPersonalCopyEdit(sourceCourseId = null, expectedRequestId = null) {
    if (typeof this.bridge.clearPendingPersonalCopyEdit !== "function") {
      return Promise.resolve(false);
    }
    return this.bridge.clearPendingPersonalCopyEdit(
      sourceCourseId,
      expectedRequestId
    );
  }

  async transitionToPersonalCopy(receipt, sourceSelection = receipt?.sourceSelection) {
    if (!plainObject(receipt) || !plainObject(sourceSelection)) {
      throw new TypeError("Transição para a cópia pessoal inválida.");
    }
    if (receipt.changed !== true) {
      return {
        project: this.loadProject(),
        selection: clone(sourceSelection)
      };
    }
    const sourceCourseId = String(receipt.sourceCourseId || "").trim().toLowerCase();
    const targetCourseId = String(receipt.courseId || "").trim().toLowerCase();
    const sourceDescriptor = this.courseList.find((item) =>
      item.courseId === sourceCourseId);
    const existing = this.courseList.find((item) => item.courseId === targetCourseId);
    const receivedCourse = receipt.document?.courses?.[0];
    if (!COURSE_ID_PATTERN.test(sourceCourseId) || !COURSE_ID_PATTERN.test(targetCourseId) ||
        targetCourseId === sourceCourseId ||
        !sourceDescriptor && !existing && receivedCourse?.id !== targetCourseId ||
        !Number.isSafeInteger(receipt.courseRevision) || receipt.courseRevision < 1 ||
        String(sourceSelection.courseId || "").trim().toLowerCase() !== sourceCourseId ||
        String(sourceSelection.studyUnitId || "").trim() !== receipt.studyUnitId) {
      throw new TypeError("Transição para a cópia pessoal inválida.");
    }
    if (sourceDescriptor) {
      sourceDescriptor.personalCopyCourseId = targetCourseId;
      sourceDescriptor.canDerive = false;
    }
    const targetDescriptor = {
      ...clone(sourceDescriptor || {}),
      ...clone(existing || {}),
      courseId: targetCourseId,
      title: existing?.title || receivedCourse?.title || sourceDescriptor?.title || "Curso",
      goal: existing?.goal ?? receivedCourse?.goal ?? sourceDescriptor?.goal ?? null,
      revision: receipt.courseRevision,
      ownership: "owned",
      canEdit: receipt.readOnly !== true,
      canDerive: false,
      isPersonalCopy: true,
      personalCopyCourseId: null,
      sourceCourseId,
      sourceCourseRevision: receipt.sourceCourseRevision,
      completedStudyUnitCount: Number(existing?.completedStudyUnitCount || 0),
      updatedAt: receipt.updatedAt
    };
    if (existing) Object.assign(existing, targetDescriptor);
    else this.courseList.unshift(targetDescriptor);

    const hasPromotedComposition = receivedCourse?.id === targetCourseId &&
      Array.isArray(receipt.rows);
    if (hasPromotedComposition) {
      const loaded = {
        revision: receipt.courseRevision,
        course: clone(receivedCourse),
        rows: clone(receipt.rows),
        offline: receipt.offline === true,
        stale: receipt.stale === true || receipt.reconciled === false,
        readOnly: receipt.readOnly === true || receipt.reconciled === false
      };
      this.loadedCourseById.set(targetCourseId, loaded);
      let personalStateConfirmed = false;
      if (!this.personalByCourseId.has(targetCourseId)) {
        const personal = new CoursePersonalStateRepository({
          courseId: targetCourseId,
          api: this.api,
          cache: this.cache,
          course: loaded.course,
          clock: this.clock
        });
        try {
          await personal.initialize({ refresh: true });
          this.personalByCourseId.set(targetCourseId, personal);
          personalStateConfirmed = true;
        } catch (error) {
          if (networkFailure(error)) this.personalByCourseId.set(targetCourseId, personal);
          // O snapshot curricular confirmado continua utilizável; o estado pessoal retoma depois.
        }
      } else {
        try {
          await this.personalByCourseId.get(targetCourseId).refresh();
          personalStateConfirmed = true;
        } catch (error) {
          if (!networkFailure(error)) throw error;
        }
      }
      const targetPersonal = this.personalByCourseId.get(targetCourseId);
      if (targetPersonal && personalStateConfirmed) {
        const completedStudyUnitCount = Object.values(targetPersonal.loadProgress().lessons)
          .reduce((total, entry) => total + entry.completedStudyUnitIds.length, 0);
        targetDescriptor.completedStudyUnitCount = completedStudyUnitCount;
        const targetSummary = this.courseList.find(({ courseId }) =>
          courseId === targetCourseId);
        if (targetSummary) targetSummary.completedStudyUnitCount = completedStudyUnitCount;
      }
      if (!this.annotationsByCourseId.has(targetCourseId) &&
          typeof this.api.getMyCourseAnchoredAnnotations === "function" &&
          typeof this.api.executeMyCourseAnchoredAnnotationCommand === "function") {
        const annotations = new CourseAnnotationRepository({
          courseId: targetCourseId,
          courseRevision: loaded.revision,
          api: this.api,
          cache: this.cache,
          clock: this.clock,
          windowValue: this.windowValue,
          navigatorValue: this.navigatorValue
        });
        try {
          await annotations.initialize();
          this.annotationsByCourseId.set(targetCourseId, annotations);
        } catch (error) {
          if (networkFailure(error)) {
            this.annotationsByCourseId.set(targetCourseId, annotations);
          } else {
            annotations.close();
          }
        }
      }
    }
    this.#rebuildProject();
    if (!hasPromotedComposition) await this.loadCourse(targetCourseId);
    const path = [
      targetCourseId,
      sourceSelection.moduleId,
      sourceSelection.lessonId,
      sourceSelection.microsequenceId,
      sourceSelection.studyUnitId
    ];
    const selection = exactStudyUnitSelection(this.project, path) ||
      selectionForStudyUnitIdentity(this.project, targetCourseId, receipt.studyUnitId) ||
      selectionForCourse(this.project, targetCourseId);
    if (!selection) {
      throw new TypeError("A cópia pessoal confirmada não está mais acessível.");
    }
    return {
      project: this.loadProject(),
      selection
    };
  }

  async commitPersonalCourseCopyEdit(value = {}) {
    if (typeof this.bridge.commitPersonalCourseCopyEdit !== "function") {
      throw new TypeError("A edição em cópia pessoal não está disponível.");
    }
    if (!plainObject(value) || !plainObject(value.sourceSelection)) {
      throw new TypeError("Edição em cópia pessoal inválida.");
    }
    const sourceSelection = {
      courseId: value.sourceSelection.courseId,
      moduleId: value.sourceSelection.moduleId,
      lessonId: value.sourceSelection.lessonId,
      microsequenceId: value.sourceSelection.microsequenceId,
      studyUnitId: value.sourceSelection.studyUnitId
    };
    const receipt = await this.bridge.commitPersonalCourseCopyEdit({
      requestId: value.requestId ?? createUuid(),
      sourceCourseId: value.sourceCourseId,
      expectedSourceCourseRevision: value.expectedSourceCourseRevision,
      expectedStudyUnitVersion: value.expectedStudyUnitVersion,
      didacticMicrosequenceId: value.didacticMicrosequenceId,
      studyUnit: value.studyUnit,
      origin: value.applicationOrigin,
      targetId: value.targetId,
      sourceSelection,
      ...(value.replacesPendingRequestId
        ? { replacesPendingRequestId: value.replacesPendingRequestId }
        : {})
    });
    const transitioned = await this.transitionToPersonalCopy(receipt, sourceSelection);
    return { ...receipt, ...transitioned };
  }

  async retryPendingPersonalCopyEdit(sourceCourseId = null) {
    if (typeof this.bridge.retryPendingPersonalCopyEdit !== "function") {
      throw new TypeError("A retomada da cópia pessoal não está disponível.");
    }
    const receipt = await this.bridge.retryPendingPersonalCopyEdit(sourceCourseId);
    if (!receipt) return null;
    const transitioned = await this.transitionToPersonalCopy(
      receipt,
      receipt.sourceSelection
    );
    return { ...receipt, ...transitioned };
  }

  loadRuntimeStatus(courseIdentity = "") {
    const courseId = String(courseIdentity || "").trim().toLowerCase();
    const loaded = this.loadedCourseById.get(courseId);
    return clone({
      offline: this.listRuntimeStatus.offline || loaded?.offline === true,
      stale: this.listRuntimeStatus.stale || loaded?.stale === true,
      readOnly: this.listRuntimeStatus.readOnly || loaded?.readOnly === true
    });
  }

  #personal(reference) {
    const courseId = courseIdFromReference(reference);
    const personal = this.personalByCourseId.get(courseId);
    if (!personal) throw new Error("O Curso do estado pessoal não está carregado.");
    return personal;
  }

  #annotations(reference) {
    const courseId = courseIdFromReference(reference);
    const annotations = this.annotationsByCourseId.get(courseId);
    if (!annotations) throw new Error("As observações deste Curso não estão disponíveis.");
    return annotations;
  }

  loadProgress() {
    return mergeProgress([...this.personalByCourseId.values()].map((personal) =>
      personal.loadProgress()));
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
    if (!normalizedCourseId) throw new Error("O Curso do progresso não está acessível.");
    const course = findCourse(this.project, normalizedCourseId);
    if (!course?.modules?.length) throw new Error("Carregue o Curso antes de zerar o progresso.");
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

  setStudyUnitReviewMark(reference, marked) {
    return this.#personal(reference).setStudyUnitReviewMark(reference, marked);
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

  refreshAnnotationsForPath(reference) {
    return this.#runAnnotationOperation(reference, (annotations) =>
      annotations.refreshTarget(reference));
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

  async refreshPersonalState() {
    const revokedCourseIds = [];
    for (const [courseId, personal] of this.personalByCourseId) {
      try {
        await personal.refresh();
        const completedStudyUnitCount = Object.values(personal.loadProgress().lessons)
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
        await annotations.flush();
      } catch (error) {
        if (!courseAccessRevoked(error)) throw error;
        revokedCourseIds.push(courseId);
      }
    }
    await this.#purgeRevokedCourses(revokedCourseIds);
    this.#rebuildProject();
    return this.loadProject();
  }

  async flush() {
    await this.#studyNavigationWrite;
    const snapshots = [];
    const revokedCourseIds = [];
    for (const [courseId, personal] of this.personalByCourseId) {
      try {
        snapshots.push(await personal.flush());
      } catch (error) {
        if (!courseAccessRevoked(error)) throw error;
        revokedCourseIds.push(courseId);
      }
    }
    for (const [courseId, annotations] of this.annotationsByCourseId) {
      try {
        snapshots.push(await annotations.flush());
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
