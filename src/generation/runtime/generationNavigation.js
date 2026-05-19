function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

export function resolvePendingGenerationNavigation(applied = {}) {
  return {
    courseKey: text(applied.courseKey),
    moduleKey: text(applied.moduleKey) || null,
    lessonKey: text(applied.lessonKey) || null
  };
}

export function buildGenerationSuccessState({ draft = {}, applied = {} } = {}) {
  return {
    draft: {
      ...draft,
      promptText: "",
      attachments: [],
      lastResult: applied
    },
    selection: {
      courseKey: text(applied.courseKey),
      moduleKey: text(applied.moduleKey) || null,
      lessonKey: text(applied.lessonKey) || null,
      microsequenceKey: null,
      cardKey: null,
      cardIndex: 0
    },
    pendingGeneratedNavigation: resolvePendingGenerationNavigation(applied)
  };
}

export function resolveOpenGeneratedCourseTarget({
  pendingGeneratedNavigation = null,
  lastResult = null
} = {}) {
  const target = pendingGeneratedNavigation || lastResult || null;
  if (!target?.courseKey || !target?.moduleKey || !target?.lessonKey) {
    return {
      ok: false,
      errorMessage: "Nenhuma estrutura nova foi gerada para abrir em Cursos."
    };
  }

  return {
    ok: true,
    target: {
      courseKey: text(target.courseKey),
      moduleKey: text(target.moduleKey),
      lessonKey: text(target.lessonKey),
      firstMicrosequenceKey: text(target.firstMicrosequenceKey) || null
    }
  };
}

export function buildOpenGeneratedCourseViewState(target = {}) {
  return {
    selection: {
      courseKey: text(target.courseKey),
      moduleKey: text(target.moduleKey),
      lessonKey: text(target.lessonKey),
      microsequenceKey: null,
      cardKey: null,
      cardIndex: 0
    },
    viewState: {
      homeTab: "courses",
      generationPanelOpen: false,
      view: "lesson",
      entityEditor: null,
      microsequenceMode: "play",
      pendingGeneratedNavigation: null
    },
    focusTarget: {
      view: "lesson",
      courseKey: text(target.courseKey),
      moduleKey: text(target.moduleKey),
      lessonKey: text(target.lessonKey),
      microsequenceKey: text(target.firstMicrosequenceKey) || null
    }
  };
}
