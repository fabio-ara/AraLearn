export class CourseStudyBridge {
  constructor({ controller } = {}) {
    if (!controller || typeof controller.listCourses !== "function" ||
        typeof controller.loadCourseDocument !== "function" ||
        typeof controller.clearCourse !== "function") {
      throw new TypeError("Controlador canônico de cursos obrigatório para Estudo.");
    }
    this.controller = controller;
  }

  listAccessibleCourses(options = {}) {
    return this.controller.listCourses(options);
  }

  loadCourseDesign(courseId, options = {}) {
    return this.controller.loadCourseDesign(courseId, options);
  }

  async loadCourse(courseId, options = {}) {
    const result = await this.controller.loadCourseDocument(courseId, options);
    return {
      courseId: result.course.courseId,
      revision: result.course.revision,
      course: result.course,
      rows: result.rows,
      document: result.document,
      offline: result.offline === true,
      stale: result.stale === true,
      ...(result.readOnly === true ? { readOnly: true } : {})
    };
  }

  clearCourse(courseId, options = {}) {
    return this.controller.clearCourse(courseId, options);
  }

  maintainCourse(values) {
    if (typeof this.controller.maintainCourse !== "function") {
      throw new TypeError("O ciclo de vida do curso não está disponível.");
    }
    return this.controller.maintainCourse(values);
  }

  hasOfflineCourse(courseId, options = {}) {
    if (typeof this.controller.hasVerifiedCourseDocument !== "function") {
      return Promise.resolve(false);
    }
    return this.controller.hasVerifiedCourseDocument(courseId, options);
  }

  listCachedCourses(options = {}) {
    return this.controller.listCachedCourses(options);
  }

  checkCourseAccess(courseId) {
    return this.controller.checkCourseAccess(courseId);
  }

  async loadCachedCourse(courseId) {
    const result = await this.controller.loadCachedCourseDocument(courseId);
    return result ? {
      ...result,
      courseId: result.course.courseId,
      revision: result.course.revision
    } : null;
  }

  getCourseSourceAttachmentDownload(values) {
    if (typeof this.controller.getCourseSourceAttachmentDownload !== "function") {
      throw new TypeError("O download de fontes não está disponível.");
    }
    return this.controller.getCourseSourceAttachmentDownload(values);
  }

  loadStudyDraftRecovery(sourceCourseId = null) {
    return this.controller.loadStudyDraftRecovery?.(sourceCourseId) ?? Promise.resolve(null);
  }

  recoverStudyDraft(sourceCourseId = null) {
    return this.controller.recoverStudyDraft?.(sourceCourseId) ?? Promise.resolve(null);
  }

  clearStudyDraftRecovery(sourceCourseId = null, expectedRequestId = null) {
    return this.controller.clearStudyDraftRecovery?.(sourceCourseId, expectedRequestId) ?? Promise.resolve(false);
  }
}
