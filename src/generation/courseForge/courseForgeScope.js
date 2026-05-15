function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

export function resolveCourseForgeScope(intent = {}) {
  const scope = intent?.scope || {};
  const level = text(scope.level) || "project";
  return {
    level,
    courseKey: text(scope.courseKey),
    moduleKey: text(scope.moduleKey),
    lessonKey: text(scope.lessonKey),
    microsequenceKey: text(scope.microsequenceKey)
  };
}

export function patchTargetWithinScope(scope = {}, target = {}) {
  const level = text(scope.level) || "project";
  if (level === "project") {
    return true;
  }
  if (level === "course") {
    return text(scope.courseKey) && text(scope.courseKey) === text(target.courseKey);
  }
  if (level === "module") {
    return (
      text(scope.courseKey) === text(target.courseKey) &&
      text(scope.moduleKey) === text(target.moduleKey)
    );
  }
  if (level === "lesson") {
    return (
      text(scope.courseKey) === text(target.courseKey) &&
      text(scope.moduleKey) === text(target.moduleKey) &&
      text(scope.lessonKey) === text(target.lessonKey)
    );
  }
  if (level === "microsequence") {
    return (
      text(scope.courseKey) === text(target.courseKey) &&
      text(scope.moduleKey) === text(target.moduleKey) &&
      text(scope.lessonKey) === text(target.lessonKey) &&
      text(scope.microsequenceKey) === text(target.microsequenceKey)
    );
  }
  return false;
}
