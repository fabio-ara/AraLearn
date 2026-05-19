import { DEFAULT_CODEX_LOCAL_ENDPOINT, isCodexLocalModel } from "../providers/codexCliConfig.js";
import { DEFAULT_ENGINE_PROFILE_ID } from "../config/engineProfileRegistry.js";
import { createProfileTuning } from "./profileTuning.js";
import {
  applyGenerationScope,
  setGenerationDraftInput,
  syncGenerationDraftHierarchy,
  toggleGenerationDraftLevel
} from "./generationDraftState.js";
import {
  buildGenerationSuccessState,
  buildOpenGeneratedCourseViewState,
  resolveOpenGeneratedCourseTarget
} from "./generationNavigation.js";
import {
  buildAppliedGeneration,
  prepareStructureGeneration
} from "./generationRuntime.js";
import {
  resolveGenerationProviderReadiness,
  resolveGenerationScopeState
} from "./generationViewModel.js";
import { createGenerationProgressState } from "./progressViewModel.js";
import { generateStructureProjectDocument } from "./projectGenerationRuntime.js";

const DEFAULT_ASSIST_MODEL = "gemini-2.5-flash";
const INVALID_STRUCTURE_REQUEST_MESSAGE =
  "Informe texto e/ou anexo e preencha apenas os níveis fixados válidos antes de gerar a estrutura.";

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeAssistCustomProfiles(customProfiles = []) {
  return (Array.isArray(customProfiles) ? customProfiles : [])
    .map((entry, index) => {
      const id = text(entry?.id) || `custom-profile-${index + 1}`;
      const label = text(entry?.label) || `Meu perfil ${index + 1}`;
      const baseProfileId = text(entry?.baseProfileId) || DEFAULT_ENGINE_PROFILE_ID;
      return {
        id,
        label,
        baseProfileId,
        profileTuning: createProfileTuning(
          baseProfileId,
          entry?.profileTuning && typeof entry.profileTuning === "object" ? entry.profileTuning : {}
        )
      };
    })
    .filter((entry, index, items) => items.findIndex((item) => item.id === entry.id) === index);
}

function cloneGenerationDraft(draft = {}) {
  return {
    courseFixed: draft.courseFixed === true,
    moduleFixed: draft.moduleFixed === true,
    lessonFixed: draft.lessonFixed === true,
    courseInput: typeof draft.courseInput === "string" ? draft.courseInput : "",
    courseKey: text(draft.courseKey),
    moduleInput: typeof draft.moduleInput === "string" ? draft.moduleInput : "",
    moduleKey: text(draft.moduleKey),
    lessonInput: typeof draft.lessonInput === "string" ? draft.lessonInput : "",
    lessonKey: text(draft.lessonKey),
    includeTopics: Array.isArray(draft.includeTopics) ? draft.includeTopics.map((item) => text(item)).filter(Boolean) : [],
    excludeTopics: Array.isArray(draft.excludeTopics) ? draft.excludeTopics.map((item) => text(item)).filter(Boolean) : [],
    pendingIncludeTopic: typeof draft.pendingIncludeTopic === "string" ? draft.pendingIncludeTopic : "",
    pendingExcludeTopic: typeof draft.pendingExcludeTopic === "string" ? draft.pendingExcludeTopic : "",
    promptText: typeof draft.promptText === "string" ? draft.promptText : "",
    attachments: Array.isArray(draft.attachments) ? [...draft.attachments] : [],
    lastResult: draft.lastResult || null,
    isSubmitting: draft.isSubmitting === true,
    errorMessage: typeof draft.errorMessage === "string" ? draft.errorMessage : "",
    progress: createGenerationProgressState(draft.progress || {})
  };
}

export function normalizeAssistConfig(config = {}) {
  const customProfiles = normalizeAssistCustomProfiles(config.customProfiles);
  const selectedProfileId = text(config.selectedProfileId) || text(config.didacticProfileId) || DEFAULT_ENGINE_PROFILE_ID;
  const selectedCustomProfile = customProfiles.find((entry) => entry.id === selectedProfileId) || null;
  const didacticProfileId = selectedCustomProfile?.baseProfileId || text(config.didacticProfileId) || selectedProfileId || DEFAULT_ENGINE_PROFILE_ID;
  return {
    model: text(config.model) || DEFAULT_ASSIST_MODEL,
    apiKey: typeof config.apiKey === "string" ? config.apiKey.trim() : "",
    selectedProfileId: selectedCustomProfile?.id || didacticProfileId,
    didacticProfileId,
    profileTuning: createProfileTuning(
      didacticProfileId,
      config.profileTuning && typeof config.profileTuning === "object"
        ? config.profileTuning
        : selectedCustomProfile?.profileTuning || {}
    ),
    customProfiles,
    codexEndpoint: text(config.codexEndpoint) || DEFAULT_CODEX_LOCAL_ENDPOINT,
    codexToken: typeof config.codexToken === "string" ? config.codexToken.trim() : ""
  };
}

export function applyAssistConfigPatch({ assistConfig = {}, patch = {} } = {}) {
  const nextAssistConfig = normalizeAssistConfig({
    ...assistConfig,
    ...patch
  });
  return {
    assistConfig: nextAssistConfig,
    assistConfigDraft: structuredClone(nextAssistConfig)
  };
}

export function createCodexCliSetupStatus(nextStatus = {}) {
  return {
    ok: nextStatus.ok === true,
    checking: nextStatus.checking === true,
    error: typeof nextStatus.error === "string" ? nextStatus.error : "",
    data: nextStatus.data && typeof nextStatus.data === "object" ? nextStatus.data : null
  };
}

export async function checkCodexCliConnection({ assistConfig = {}, checkCodexLocalHealth } = {}) {
  const normalizedAssistConfig = normalizeAssistConfig(assistConfig);

  let status;
  try {
    status = await checkCodexLocalHealth({
      endpoint: normalizedAssistConfig.codexEndpoint,
      token: normalizedAssistConfig.codexToken
    });
  } catch (error) {
    status = {
      ok: false,
      error: error instanceof Error ? error.message : "Falha ao validar o endpoint local.",
      status: 0
    };
  }

  return {
    status,
    setupStatus: createCodexCliSetupStatus({
      ok: status.ok,
      checking: false,
      error: status.ok ? "" : status.error || "Bridge local não encontrado.",
      data: status.ok ? status.data : null
    })
  };
}

export function buildGenerationResultClearedState({
  draft = {},
  pendingGeneratedNavigation = null
} = {}) {
  const nextDraft = cloneGenerationDraft(draft);
  nextDraft.errorMessage = "";
  nextDraft.lastResult = null;
  nextDraft.progress = createGenerationProgressState();
  return {
    draft: nextDraft,
    pendingGeneratedNavigation: null
  };
}

export function applyGenerationPanelScopeState({
  draft = {},
  scope = {},
  projectDocument = {},
  visibleCourses = [],
  findCourse,
  findModule,
  findLesson
} = {}) {
  const scopedDraft = applyGenerationScope({
    draft,
    scope,
    projectDocument,
    visibleCourses,
    findCourse,
    findModule,
    findLesson
  });
  return buildGenerationResultClearedState({
    draft: scopedDraft,
    pendingGeneratedNavigation: null
  });
}

export function buildOpenedGenerationPanelState(options = {}) {
  const nextState = applyGenerationPanelScopeState(options);
  return {
    ...nextState,
    generationPanelOpen: true,
    entityEditor: null
  };
}

export function buildClosedGenerationPanelState({
  draft = {},
  preserveGeneratedResult = true,
  pendingGeneratedNavigation = null
} = {}) {
  const nextState = preserveGeneratedResult
    ? {
        draft: cloneGenerationDraft(draft),
        pendingGeneratedNavigation
      }
    : buildGenerationResultClearedState({
        draft,
        pendingGeneratedNavigation
      });
  return {
    ...nextState,
    generationPanelOpen: false
  };
}

export function resolveGenerationScopeViewState({
  draft = {},
  projectDocument = {},
  visibleCourses = [],
  findCourse,
  findModule,
  findLesson
} = {}) {
  return resolveGenerationScopeState({
    draft,
    projectDocument,
    visibleCourses,
    findCourse,
    findModule,
    findLesson
  });
}

export function buildGenerationLevelState({
  draft = {},
  level = "",
  projectDocument = {},
  visibleCourses = [],
  findCourse,
  findModule,
  findLesson
} = {}) {
  const scopeState = resolveGenerationScopeViewState({
    draft,
    projectDocument,
    visibleCourses,
    findCourse,
    findModule,
    findLesson
  });
  const nextDraft = toggleGenerationDraftLevel({
    draft,
    level,
    scopeState,
    visibleCourses
  });
  return buildGenerationResultClearedState({
    draft: nextDraft,
    pendingGeneratedNavigation: null
  });
}

export function buildGenerationInputState({
  draft = {},
  level = "",
  value = "",
  visibleCourses = []
} = {}) {
  const nextDraft = setGenerationDraftInput({
    draft,
    level,
    value,
    visibleCourses
  });
  return buildGenerationResultClearedState({
    draft: nextDraft,
    pendingGeneratedNavigation: null
  });
}

export function resolveOpenGeneratedLessonState({
  pendingGeneratedNavigation = null,
  lastResult = null
} = {}) {
  const openTarget = resolveOpenGeneratedCourseTarget({
    pendingGeneratedNavigation,
    lastResult
  });
  if (!openTarget.ok) {
    return {
      ok: false,
      errorMessage: openTarget.errorMessage
    };
  }

  const nextOpenState = buildOpenGeneratedCourseViewState(openTarget.target);
  return {
    ok: true,
    ...nextOpenState
  };
}

export async function executeStructureGeneration({
  draft = {},
  assistConfig = {},
  projectDocument = {},
  visibleCourses = [],
  findCourse,
  findModule,
  findLesson,
  checkCodexLocalHealth,
  ingestAttachments,
  onProgress,
  provider
} = {}) {
  const syncedDraft = syncGenerationDraftHierarchy({
    draft,
    visibleCourses
  });
  const scopeState = resolveGenerationScopeViewState({
    draft: syncedDraft,
    projectDocument,
    visibleCourses,
    findCourse,
    findModule,
    findLesson
  });

  if (!scopeState.canSubmit) {
    return {
      status: "invalid",
      draft: {
        ...syncedDraft,
        isSubmitting: false,
        errorMessage: INVALID_STRUCTURE_REQUEST_MESSAGE
      },
      pendingGeneratedNavigation: null
    };
  }

  const readiness = await resolveGenerationProviderReadiness({
    selectedModel: assistConfig.model,
    codexEndpoint: assistConfig.codexEndpoint,
    codexToken: assistConfig.codexToken,
    checkCodexLocalHealth
  });

  if (!readiness.ok && isCodexLocalModel(assistConfig.model)) {
    return {
      status: "provider-unready",
      draft: {
        ...syncedDraft,
        isSubmitting: false,
        errorMessage: "",
        lastResult: null
      },
      pendingGeneratedNavigation: null,
      shouldOpenCodexCliSetup: true,
      codexCliSetupStatus: createCodexCliSetupStatus({
        ok: false,
        checking: false,
        error: readiness.error || "O bridge local não está ativo.",
        data: readiness.data ?? null
      })
    };
  }

  try {
    const generationResult = await generateStructureProjectDocument({
      draft: syncedDraft,
      scopeState,
      projectDocument,
      assistConfig,
      ingestAttachments,
      provider,
      onProgress
    });
    const applied = buildAppliedGeneration({
      generationResult,
      ingestedAttachments: { warnings: [] },
      scopeState
    });
    const successState = buildGenerationSuccessState({
      draft: syncedDraft,
      applied
    });

    return {
      status: "success",
      draft: {
        ...successState.draft,
        isSubmitting: false
      },
      selection: successState.selection,
      pendingGeneratedNavigation: successState.pendingGeneratedNavigation,
      generationResult
    };
  } catch (error) {
    return {
      status: "error",
      draft: {
        ...syncedDraft,
        isSubmitting: false,
        lastResult: null,
        errorMessage: error instanceof Error ? error.message : "Falha ao gerar a estrutura."
      },
      pendingGeneratedNavigation: null
    };
  }
}
