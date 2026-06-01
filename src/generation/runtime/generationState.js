function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

export function resolveGenerationScope(scopeState = {}) {
  const courseKey = text(scopeState?.course?.id);
  const moduleKey = text(scopeState?.moduleValue?.id);
  const lessonKey = text(scopeState?.lesson?.id);

  if (courseKey && moduleKey && lessonKey) {
    return {
      level: "lesson",
      courseKey,
      moduleKey,
      lessonKey
    };
  }
  if (courseKey && moduleKey) {
    return {
      level: "module",
      courseKey,
      moduleKey
    };
  }
  if (courseKey) {
    return {
      level: "course",
      courseKey
    };
  }
  return {
    level: "project"
  };
}

export function resolveGenerationNavigationTarget({ projectDocument = {}, patch = {}, scopeState = {} } = {}) {
  const projectCourses = Array.isArray(projectDocument?.courses) ? projectDocument.courses : [];
  const target = patch?.target || {};

  const course =
    projectCourses.find((item) => text(item?.id) === text(target?.courseKey || scopeState?.course?.id)) ||
    projectCourses[0] ||
    null;
  const moduleValue =
    (Array.isArray(course?.modules) ? course.modules : []).find(
      (item) => text(item?.id) === text(target?.moduleKey || scopeState?.moduleValue?.id)
    ) ||
    (Array.isArray(course?.modules) ? course.modules[0] : null) ||
    null;
  const lesson =
    (Array.isArray(moduleValue?.lessons) ? moduleValue.lessons : []).find(
      (item) => text(item?.id) === text(target?.lessonKey || scopeState?.lesson?.id)
    ) ||
    (Array.isArray(moduleValue?.lessons) ? moduleValue.lessons[0] : null) ||
    null;

  return {
    courseKey: text(course?.id),
    moduleKey: text(moduleValue?.id),
    lessonKey: text(lesson?.id)
  };
}

export function summarizeTopDownResult(result = {}) {
  if (result?.summary && typeof result.summary === "object") {
    return {
      message: text(result.summary.message) || "Estrutura top-down aplicada.",
      openActionLabel: text(result.summary.openActionLabel) || ""
    };
  }
  const operations = Array.isArray(result?.patch?.operations) ? result.patch.operations.length : 0;
  const events = Array.isArray(result?.patch?.events) ? result.patch.events.length : 0;
  const eventLabel = events === 1 ? "evento auditável" : "eventos auditáveis";
  return {
    message: `Fluxo top-down aplicado com ${operations} operações e ${events} ${eventLabel}.`,
    openActionLabel: "Abrir em Cursos"
  };
}
