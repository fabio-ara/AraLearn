import {
  createEmptyProgressDocument,
  validateProgressDocument
} from "../storage/progressStore.js";
import { CoursePersonalStateRepository } from "../persistence/CoursePersonalStateRepository.js";
import { CourseAnnotationRepository } from "../persistence/CourseAnnotationRepository.js";
import { normalizeCourseStudyCitationsRead } from "../domain/courseSources.js";
import { findCourse } from "./CourseStudyNavigation.js";

const COURSE_DOCUMENT_CONTRACT = "aralearn.course.v1";
const MAX_LIST_PAGES = 100;
const REVIEW_PAGE_SIZE = 20;
const REVIEW_PAGE_CACHE_KEY = "course.v1.review-page";
const COURSE_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;

function clone(value) {
  return value == null ? value : structuredClone(value);
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
  constructor({ bridge, api, cache, clock = () => new Date() } = {}) {
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
    this.project = { contract: COURSE_DOCUMENT_CONTRACT, courses: [] };
    this.personalByCourseId = new Map();
    this.annotationsByCourseId = new Map();
    this.loadedCourseById = new Map();
    this.courseList = [];
    this.reviewItems = [];
    this.reviewHasMore = false;
    this.reviewCursor = null;
    this.listRuntimeStatus = { offline: false, stale: false, readOnly: false };
  }

  async initialize() {
    await this.refreshCourses();
    return this.loadProject();
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

  async #purgeRevokedCourses(courseIds) {
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
      this.courseList = this.courseList.filter((item) => item.courseId !== courseId);
      this.reviewItems = this.reviewItems.filter((item) => item.courseId !== courseId);
      await this.bridge.clearCourse(courseId);
    }
    if (revoked.length) {
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
      await this.bridge.clearCourse(courseId);
      this.personalByCourseId.delete(courseId);
      this.loadedCourseById.delete(courseId);
    }
    for (const courseId of this.loadedCourseById.keys()) {
      if (!retained.has(courseId) && !listed.offline) this.loadedCourseById.delete(courseId);
    }
    this.courseList = clone(list);
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

  async loadCourse(courseIdentity) {
    const courseId = this.resolveCourseContractKey(courseIdentity);
    const descriptor = this.courseList.find((item) => item.courseId === courseId);
    if (!descriptor) throw new Error("O Curso solicitado não está acessível.");
    let loaded = this.loadedCourseById.get(courseId);
    if (!loaded || loaded.revision !== descriptor.revision || (
      this.listRuntimeStatus.offline !== true &&
      (loaded.offline === true || loaded.stale === true || loaded.readOnly === true)
    )) {
      const result = await this.bridge.loadCourse(courseId, {
        verifiedRevision: descriptor.revision
      });
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
    }
    let personal = this.personalByCourseId.get(courseId);
    if (!personal) {
      personal = new CoursePersonalStateRepository({
        courseId,
        api: this.api,
        cache: this.cache,
        course: loaded.course,
        clock: this.clock
      });
      await personal.initialize();
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
        clock: this.clock
      });
      await annotations.initialize();
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
      moduleCount: Number(item.moduleCount || 0),
      lessonCount: Number(item.lessonCount || 0),
      microsequenceCount: Number(item.microsequenceCount || 0),
      studyUnitCount: Number(item.studyUnitCount || 0),
      completedStudyUnitCount: Number(item.completedStudyUnitCount || 0),
      updatedAt: item.updatedAt
    }));
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

  setStudyUnitCompleted(reference, completed = true) {
    return this.#personal(reference).setStudyUnitCompleted(reference, completed);
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

  async close() {
    await this.flush();
    for (const annotations of this.annotationsByCourseId.values()) annotations.close();
    this.annotationsByCourseId.clear();
    this.personalByCourseId.clear();
  }
}

export { COURSE_DOCUMENT_CONTRACT as COURSE_STUDY_DOCUMENT_CONTRACT };
