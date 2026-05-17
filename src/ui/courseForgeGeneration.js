function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

export function resolveCourseForgeGenerationScope(scopeState = {}) {
  const courseKey = text(scopeState?.course?.key);
  const moduleKey = text(scopeState?.moduleValue?.key);
  const lessonKey = text(scopeState?.lesson?.key);

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

export function resolveCourseForgeNavigationTarget({ projectDocument = {}, patch = {}, scopeState = {} } = {}) {
  const projectCourses = Array.isArray(projectDocument?.courses) ? projectDocument.courses : [];
  const target = patch?.target || {};

  let course =
    projectCourses.find((item) => text(item?.key) === text(target?.courseKey || scopeState?.course?.key)) ||
    projectCourses[0] ||
    null;
  let moduleValue =
    (Array.isArray(course?.modules) ? course.modules : []).find(
      (item) => text(item?.key) === text(target?.moduleKey || scopeState?.moduleValue?.key)
    ) ||
    (Array.isArray(course?.modules) ? course.modules[0] : null) ||
    null;
  let lesson =
    (Array.isArray(moduleValue?.lessons) ? moduleValue.lessons : []).find(
      (item) => text(item?.key) === text(target?.lessonKey || scopeState?.lesson?.key)
    ) ||
    (Array.isArray(moduleValue?.lessons) ? moduleValue.lessons[0] : null) ||
    null;

  return {
    courseKey: text(course?.key),
    moduleKey: text(moduleValue?.key),
    lessonKey: text(lesson?.key)
  };
}

export function summarizeCourseForgeTopDownResult(result = {}) {
  const operations = Array.isArray(result?.patch?.operations) ? result.patch.operations.length : 0;
  const events = Array.isArray(result?.patch?.events) ? result.patch.events.length : 0;
  const eventLabel = events === 1 ? "evento auditável" : "eventos auditáveis";
  return {
    message: `Fluxo top-down aplicado com ${operations} operações e ${events} ${eventLabel}.`,
    openActionLabel: "Abrir em Cursos"
  };
}
