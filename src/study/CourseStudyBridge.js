export class CourseStudyBridge {
  constructor({ controller } = {}) {
    if (!controller || typeof controller.listCourses !== "function" ||
        typeof controller.loadCourseDocument !== "function" ||
        typeof controller.clearCourse !== "function") {
      throw new TypeError("Controlador canônico de Cursos obrigatório para Estudo.");
    }
    this.controller = controller;
  }

  listAccessibleCourses(options = {}) {
    return this.controller.listCourses(options);
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

  hasOfflineCourse(courseId, options = {}) {
    if (typeof this.controller.hasVerifiedCourseDocument !== "function") {
      return Promise.resolve(false);
    }
    return this.controller.hasVerifiedCourseDocument(courseId, options);
  }

  commitPersonalCourseCopyEdit(value) {
    if (typeof this.controller.commitPersonalCourseCopyEdit !== "function") {
      throw new TypeError("A edição em cópia pessoal não está disponível.");
    }
    return this.controller.commitPersonalCourseCopyEdit(value);
  }

  loadPendingPersonalCopyEdit(sourceCourseId = null) {
    if (typeof this.controller.loadPendingPersonalCopyEdit !== "function") {
      return Promise.resolve(null);
    }
    return this.controller.loadPendingPersonalCopyEdit(sourceCourseId);
  }

  retryPendingPersonalCopyEdit(sourceCourseId = null) {
    if (typeof this.controller.retryPendingPersonalCopyEdit !== "function") {
      throw new TypeError("A retomada da cópia pessoal não está disponível.");
    }
    return this.controller.retryPendingPersonalCopyEdit(sourceCourseId);
  }

  clearPendingPersonalCopyEdit(sourceCourseId = null, expectedRequestId = null) {
    if (typeof this.controller.clearPendingPersonalCopyEdit !== "function") {
      return Promise.resolve(false);
    }
    return this.controller.clearPendingPersonalCopyEdit(
      sourceCourseId,
      expectedRequestId
    );
  }
}
