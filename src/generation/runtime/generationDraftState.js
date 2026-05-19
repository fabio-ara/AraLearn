import { createGenerationProgressState } from "./progressViewModel.js";

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeComparableText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function cloneDraft(draft = {}) {
  return {
    courseFixed: draft.courseFixed === true,
    moduleFixed: draft.moduleFixed === true,
    lessonFixed: draft.lessonFixed === true,
    courseInput: text(draft.courseInput),
    courseKey: text(draft.courseKey),
    moduleInput: text(draft.moduleInput),
    moduleKey: text(draft.moduleKey),
    lessonInput: text(draft.lessonInput),
    lessonKey: text(draft.lessonKey),
    includeTopics: Array.isArray(draft.includeTopics) ? draft.includeTopics.map(text).filter(Boolean) : [],
    excludeTopics: Array.isArray(draft.excludeTopics) ? draft.excludeTopics.map(text).filter(Boolean) : [],
    pendingIncludeTopic: text(draft.pendingIncludeTopic),
    pendingExcludeTopic: text(draft.pendingExcludeTopic),
    promptText: typeof draft.promptText === "string" ? draft.promptText : "",
    attachments: Array.isArray(draft.attachments) ? [...draft.attachments] : [],
    lastResult: draft.lastResult || null,
    isSubmitting: draft.isSubmitting === true,
    errorMessage: typeof draft.errorMessage === "string" ? draft.errorMessage : "",
    progress: createGenerationProgressState(draft.progress || {})
  };
}

function resolveHierarchyInputMatch(items, inputValue) {
  const normalizedInput = normalizeComparableText(inputValue);
  if (!normalizedInput) {
    return null;
  }

  return (
    (items || []).find((item) => {
      const labels = [item?.title, item?.key].map((value) => normalizeComparableText(value)).filter(Boolean);
      return labels.includes(normalizedInput);
    }) || null
  );
}

export function syncGenerationDraftHierarchy({ draft = {}, visibleCourses = [] } = {}) {
  const nextDraft = cloneDraft(draft);

  if (!nextDraft.courseFixed) {
    nextDraft.courseInput = "";
    nextDraft.courseKey = "";
    nextDraft.moduleFixed = false;
    nextDraft.moduleInput = "";
    nextDraft.moduleKey = "";
    nextDraft.lessonFixed = false;
    nextDraft.lessonInput = "";
    nextDraft.lessonKey = "";
    return nextDraft;
  }

  const course = resolveHierarchyInputMatch(visibleCourses, nextDraft.courseInput);
  nextDraft.courseKey = text(course?.key);

  if (!course) {
    nextDraft.moduleKey = "";
    nextDraft.lessonKey = "";
    return nextDraft;
  }

  if (!nextDraft.moduleFixed) {
    nextDraft.moduleInput = "";
    nextDraft.moduleKey = "";
    nextDraft.lessonFixed = false;
    nextDraft.lessonInput = "";
    nextDraft.lessonKey = "";
    return nextDraft;
  }

  const moduleValue = resolveHierarchyInputMatch(course.modules || [], nextDraft.moduleInput);
  nextDraft.moduleKey = text(moduleValue?.key);

  if (!moduleValue) {
    nextDraft.lessonKey = "";
    return nextDraft;
  }

  if (!nextDraft.lessonFixed) {
    nextDraft.lessonInput = "";
    nextDraft.lessonKey = "";
    return nextDraft;
  }

  const lesson = resolveHierarchyInputMatch(moduleValue.lessons || [], nextDraft.lessonInput);
  nextDraft.lessonKey = text(lesson?.key);
  return nextDraft;
}

export function applyGenerationScope({
  draft = {},
  scope = {},
  projectDocument = {},
  findCourse,
  findModule,
  findLesson,
  visibleCourses = []
} = {}) {
  const nextDraft = cloneDraft(draft);
  const course = scope.courseKey ? findCourse?.(projectDocument, scope.courseKey) || null : null;
  const moduleValue = course && scope.moduleKey ? findModule?.(projectDocument, course.key, scope.moduleKey) || null : null;
  const lesson =
    course && moduleValue && scope.lessonKey ? findLesson?.(projectDocument, course.key, moduleValue.key, scope.lessonKey) || null : null;

  nextDraft.courseFixed = Boolean(course);
  nextDraft.courseInput = course?.title || "";
  nextDraft.courseKey = text(course?.key);
  nextDraft.moduleFixed = Boolean(moduleValue);
  nextDraft.moduleInput = moduleValue?.title || "";
  nextDraft.moduleKey = text(moduleValue?.key);
  nextDraft.lessonFixed = Boolean(lesson);
  nextDraft.lessonInput = lesson?.title || "";
  nextDraft.lessonKey = text(lesson?.key);

  return syncGenerationDraftHierarchy({
    draft: nextDraft,
    visibleCourses
  });
}

export function toggleGenerationDraftLevel({
  draft = {},
  level = "",
  scopeState = {},
  visibleCourses = []
} = {}) {
  const nextDraft = cloneDraft(draft);

  if (level === "course") {
    const willEnable = !nextDraft.courseFixed;
    nextDraft.courseFixed = willEnable;
    if (!willEnable) {
      nextDraft.courseInput = "";
      nextDraft.courseKey = "";
    }
  } else if (level === "module") {
    if (!scopeState.moduleToggleEnabled) {
      return nextDraft;
    }
    const willEnable = !nextDraft.moduleFixed;
    nextDraft.moduleFixed = willEnable;
    if (!willEnable) {
      nextDraft.moduleInput = "";
      nextDraft.moduleKey = "";
    }
  } else if (level === "lesson") {
    if (!scopeState.lessonToggleEnabled) {
      return nextDraft;
    }
    const willEnable = !nextDraft.lessonFixed;
    nextDraft.lessonFixed = willEnable;
    if (!willEnable) {
      nextDraft.lessonInput = "";
      nextDraft.lessonKey = "";
    }
  }

  return syncGenerationDraftHierarchy({
    draft: nextDraft,
    visibleCourses
  });
}

export function setGenerationDraftInput({
  draft = {},
  level = "",
  value = "",
  visibleCourses = []
} = {}) {
  const nextDraft = cloneDraft(draft);

  if (level === "course") {
    nextDraft.courseInput = value;
    nextDraft.courseFixed = !!text(value);
  } else if (level === "module") {
    nextDraft.moduleInput = value;
    nextDraft.moduleFixed = !!text(value);
  } else if (level === "lesson") {
    nextDraft.lessonInput = value;
    nextDraft.lessonFixed = !!text(value);
  }

  return syncGenerationDraftHierarchy({
    draft: nextDraft,
    visibleCourses
  });
}

