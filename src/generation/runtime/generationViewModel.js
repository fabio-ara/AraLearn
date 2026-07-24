import {
  isCustomProviderSelection,
  isLocalProviderSelection,
  validateRegisteredProviderConfiguration
} from "../providers/providerRegistry.js";

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

export async function resolveGenerationProviderReadiness({
  selectedModel,
  providerProtocol = "",
  customModelId = "",
  apiKey = "",
  baseUrl = "",
  codexEndpoint = "",
  codexToken = "",
  providerEndpoint = "",
  providerSecret = "",
  provider = null,
  checkCodexLocalHealth
} = {}) {
  const modelId = text(selectedModel);
  if (provider) {
    return { ok: true, error: "", data: null };
  }
  let validated;
  try {
    validated = validateRegisteredProviderConfiguration({
      selectedModel: modelId,
      providerProtocol,
      customModelId,
      apiKey,
      baseUrl,
      codexEndpoint,
      codexToken,
      providerEndpoint,
      providerSecret
    });
  } catch (error) {
    return {
      ok: false,
      configurationError: true,
      error: error instanceof Error ? error.message : "Configuração inválida do serviço de linguagem.",
      data: null
    };
  }
  if (!isLocalProviderSelection({ selectedModel: modelId, providerProtocol })) {
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
    endpoint: validated.endpoint,
    token: isCustomProviderSelection(modelId) ? providerSecret : codexToken
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
  const includeTopics = Array.isArray(draft.includeTopics) ? draft.includeTopics.filter((item) => text(item)) : [];
  const excludeTopics = Array.isArray(draft.excludeTopics) ? draft.excludeTopics.filter((item) => text(item)) : [];
  const hasPrompt = !!text(draft.promptText);
  const hasAttachments = Array.isArray(draft.attachments) && draft.attachments.length > 0;
  const hasStructuredScope = includeTopics.length > 0 || excludeTopics.length > 0;
  const hasInputSource = hasPrompt || hasAttachments || hasStructuredScope || !!text(draft.lessonInput);
  const courseInputFilled = !!text(draft.courseInput);
  const moduleInputFilled = !!text(draft.moduleInput);
  const lessonInputFilled = !!text(draft.lessonInput);
  const requiredFieldsFilled = courseInputFilled && moduleInputFilled;
  const invalidFixedHierarchy = !courseInputFilled || !moduleInputFilled;

  let actionLabel = "criar este curso e planejar o primeiro módulo";
  let actionHelpText = "Descreva o módulo com chips do que entra e do que não entra.";
  let actionSummary = "Curso novo + módulo planejado";
  let actionIconName = "folder";
  let panelTitle = "Gerar estrutura";
  let panelSubtitle = "";
  let submitLabel = "Gerar estrutura";

  if (courseInputFilled && !course) {
    actionLabel = moduleInputFilled
      ? "criar este curso e este módulo"
      : "criar este curso";
    actionSummary = moduleInputFilled ? "Curso novo + módulo planejado" : "Curso novo";
    actionIconName = "folder";
  } else if (course && !moduleInputFilled) {
    actionLabel = "complementar este curso com um módulo novo ou existente";
    actionSummary = "Curso existente";
    actionHelpText = "Escolha ou digite um módulo para complementar a árvore existente.";
    actionIconName = "folder";
  } else if (course && moduleInputFilled && !moduleValue) {
    actionLabel = "criar este módulo neste curso";
    actionSummary = "Curso existente + módulo novo";
    actionHelpText = "Os módulos já existentes aparecem abaixo como contexto.";
    actionIconName = "module";
  } else if (course && moduleValue && !lessonInputFilled) {
    actionLabel = "complementar este módulo";
    actionSummary = "Módulo existente + novas lições";
    actionHelpText = "Use os chips do escopo para orientar o que entra e o que não entra.";
    actionIconName = "module";
  } else if (course && moduleValue && lessonInputFilled && !lesson) {
    actionLabel = "criar esta lição neste módulo";
    actionSummary = "Módulo existente + lição nova";
    actionIconName = "lesson";
  } else if (course && moduleValue && lesson) {
    actionLabel = "complementar esta lição e planejar suas microssequências";
    actionSummary = "Lição existente + microssequências planejadas";
    actionIconName = "lesson";
  }

  return {
    courses: visibleCourses,
    course,
    modules,
    moduleValue,
    lessons,
    lesson,
    moduleToggleEnabled: true,
    moduleInputEnabled: courseInputFilled,
    lessonToggleEnabled: true,
    lessonInputEnabled: courseInputFilled && moduleInputFilled,
    canSubmit: requiredFieldsFilled && hasInputSource && !invalidFixedHierarchy,
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
    pressedFieldsFilled: requiredFieldsFilled,
    invalidFixedHierarchy
  };
}
