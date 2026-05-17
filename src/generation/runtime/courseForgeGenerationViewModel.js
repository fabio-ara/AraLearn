import { isCodexLocalModel } from "../../assist/codexLocalAssistProvider.js";

const GENERATION_PANEL_ACTIONS = new Set([
  "open-generation-panel-global",
  "open-generation-panel-course",
  "open-generation-panel-module",
  "open-generation-panel-lesson"
]);

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

export function resolveGenerationPanelScopeFromAction({ action, dataset = {}, selection = {} } = {}) {
  if (!GENERATION_PANEL_ACTIONS.has(action)) {
    return null;
  }

  if (action === "open-generation-panel-global") {
    return {};
  }

  const courseKey = dataset.courseKey || selection.courseKey || "";
  const moduleKey = dataset.moduleKey || selection.moduleKey || "";
  const lessonKey = dataset.lessonKey || selection.lessonKey || "";

  if (action === "open-generation-panel-course") {
    return courseKey ? { courseKey } : null;
  }

  if (action === "open-generation-panel-module") {
    return courseKey && moduleKey ? { courseKey, moduleKey } : null;
  }

  if (action === "open-generation-panel-lesson") {
    return courseKey && moduleKey && lessonKey ? { courseKey, moduleKey, lessonKey } : null;
  }

  return null;
}

export function resolveGenerationAssistMode() {
  return "generate-top-down-structure";
}

export async function resolveCourseForgeProviderReadiness({
  selectedModel,
  codexEndpoint = "",
  codexToken = "",
  checkCodexLocalHealth
} = {}) {
  const modelId = text(selectedModel);
  if (!isCodexLocalModel(modelId)) {
    return { ok: true, error: "", data: null };
  }
  if (typeof checkCodexLocalHealth !== "function") {
    return {
      ok: false,
      error: "Validação do provider local indisponível.",
      data: null
    };
  }
  return checkCodexLocalHealth({
    endpoint: codexEndpoint,
    token: codexToken
  });
}

export function resolveGenerationScopeState({
  draft = {},
  projectDocument = {},
  visibleCourses = [],
  findCourse,
  findModule,
  findLesson
} = {}) {
  const course = draft.courseKey ? findCourse?.(projectDocument, draft.courseKey) || null : null;
  const modules = course?.modules || [];
  const moduleValue = draft.moduleKey ? findModule?.(projectDocument, draft.courseKey, draft.moduleKey) || null : null;
  const lessons = moduleValue?.lessons || [];
  const lesson = draft.lessonKey ? findLesson?.(projectDocument, draft.courseKey, draft.moduleKey, draft.lessonKey) || null : null;
  const hasPrompt = !!text(draft.promptText);
  const hasAttachments = Array.isArray(draft.attachments) && draft.attachments.length > 0;
  const hasInputSource = hasPrompt || hasAttachments;
  const pressedFieldsFilled =
    (!draft.courseFixed || !!text(draft.courseInput)) &&
    (!draft.moduleFixed || !!text(draft.moduleInput)) &&
    (!draft.lessonFixed || !!text(draft.lessonInput));
  const invalidFixedHierarchy = (draft.moduleFixed && !course) || (draft.lessonFixed && !moduleValue);

  let actionLabel = "criar curso completo";
  let actionHelpText = "";
  let actionSummary = "Curso, módulos e lições";
  let actionIconName = "folder";
  let panelTitle = "Gerar estrutura";
  let panelSubtitle = "";
  let submitLabel = "Gerar estrutura";

  if (draft.courseFixed) {
    if (!course) {
      actionLabel = "criar este curso, módulos e lições";
      actionSummary = "Curso, módulos e lições";
      actionIconName = "folder";
    } else if (!draft.moduleFixed) {
      actionLabel = "criar módulos e lições neste curso";
      actionSummary = "Módulos e lições neste curso";
      actionIconName = "module";
    } else if (!moduleValue) {
      actionLabel = "criar este módulo e suas lições";
      actionSummary = "Módulo e lições";
      actionIconName = "module";
    } else if (!draft.lessonFixed) {
      actionLabel = "criar lições neste módulo";
      actionSummary = "Lições neste módulo";
      actionIconName = "lesson";
    } else {
      actionLabel = "criar/atualizar esta lição e suas microssequências";
      actionSummary = "Lição, microssequências e cards";
      actionIconName = "lesson";
    }
  }

  return {
    courses: visibleCourses,
    course,
    modules,
    moduleValue,
    lessons,
    lesson,
    moduleToggleEnabled: !!course,
    moduleInputEnabled: !!course && draft.moduleFixed,
    lessonToggleEnabled: !!moduleValue,
    lessonInputEnabled: !!moduleValue && draft.lessonFixed,
    canSubmit: hasInputSource && pressedFieldsFilled && !invalidFixedHierarchy,
    actionLabel,
    actionHelpText,
    actionSummary,
    actionIconName,
    generationMode: resolveGenerationAssistMode(),
    panelTitle,
    panelSubtitle,
    submitLabel,
    hasPrompt,
    hasAttachments,
    hasInputSource,
    pressedFieldsFilled,
    invalidFixedHierarchy
  };
}
