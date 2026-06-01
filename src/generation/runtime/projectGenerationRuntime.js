import { createCodexCliProvider } from "../providers/codexCliProvider.js";
import { createGeminiProvider } from "../providers/geminiProvider.js";
import { createOpenAiCompatibleProvider } from "../providers/openAiCompatibleProvider.js";
import { DEEPSEEK_BASE_URL, isDeepSeekModelId } from "../providers/deepSeekPolicy.js";
import { addPracticeToMicrosequence } from "../bottomUp/addPracticeToMicrosequence.js";
import { createBranchMicrosequence } from "../bottomUp/createBranchMicrosequence.js";
import { generateMicrosequenceCards } from "../bottomUp/generateMicrosequenceCards.js";
import { generateNextMicrosequence } from "../bottomUp/generateNextMicrosequence.js";
import { improveMicrosequenceVersion } from "../bottomUp/improveMicrosequenceVersion.js";
import { createEmptyProjectDocument } from "../../domain/aralearnProject.js";
import { planCourseFromScope } from "../topDown/planCourseFromScope.js";

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function uniqueList(values = []) {
  return [...new Set((Array.isArray(values) ? values : []).map((item) => text(item)).filter(Boolean))];
}

function normalizePreferredResource(value = "") {
  const normalized = text(value);
  const lowered = normalized.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  return lowered === "automatico" || lowered === "automatic" ? "" : normalized;
}

function selectedSourceIds(attachedSources = []) {
  return uniqueList(
    (Array.isArray(attachedSources) ? attachedSources : []).map((item) => item?.id || item?.sourceId)
  );
}

function selectedExtraResources(preparedIntervention = {}, draft = {}) {
  return uniqueList([
    preparedIntervention?.requestContext?.preferredResource,
    normalizePreferredResource(draft?.preferredContainer)
  ]);
}

function resolveAssistBaseUrl(assistConfig = {}) {
  if (text(assistConfig.baseUrl || assistConfig.apiBaseUrl)) {
    return text(assistConfig.baseUrl || assistConfig.apiBaseUrl);
  }
  return isDeepSeekModelId(assistConfig.model) ? DEEPSEEK_BASE_URL : "";
}

export function resolveGenerationProviderRuntime(assistConfig = {}) {
  const modelId = text(assistConfig.model) || "gemini-2.5-flash";
  if (modelId.startsWith("codex")) {
    return {
      modelId,
      provider: createCodexCliProvider({
        endpoint: text(assistConfig.codexEndpoint),
        token: text(assistConfig.codexToken)
      }),
      providerOptions: {
        endpoint: text(assistConfig.codexEndpoint),
        token: text(assistConfig.codexToken)
      }
    };
  }
  if (modelId.startsWith("openai-compatible") || modelId.startsWith("openai:") || isDeepSeekModelId(modelId)) {
    return {
      modelId,
      provider: createOpenAiCompatibleProvider({
        baseUrl: resolveAssistBaseUrl(assistConfig),
        apiKey: text(assistConfig.apiKey)
      }),
      providerOptions: {
        baseUrl: resolveAssistBaseUrl(assistConfig),
        apiKey: text(assistConfig.apiKey)
      }
    };
  }
  return {
    modelId,
    provider: createGeminiProvider({
      apiKey: text(assistConfig.apiKey)
    }),
    providerOptions: {
      apiKey: text(assistConfig.apiKey)
    }
  };
}

function resolveProvider(provider, assistConfig = {}) {
  if (provider) {
    const runtime = resolveGenerationProviderRuntime(assistConfig);
    return {
      provider,
      modelId: runtime.modelId,
      providerOptions: runtime.providerOptions
    };
  }
  return resolveGenerationProviderRuntime(assistConfig);
}

const STRUCTURE_PROGRESS_PHASE_IDS = Object.freeze([
  "normalize_intent",
  "index_sources",
  "build_assessment_profile",
  "plan_architecture",
  "compile_patch",
  "validate_patch",
  "apply_patch",
  "final_report"
]);

function emitStructurePhase(onProgress, phaseId, type, patch = {}) {
  onProgress?.({
    type,
    phaseId,
    phaseIds: STRUCTURE_PROGRESS_PHASE_IDS,
    phaseCount: STRUCTURE_PROGRESS_PHASE_IDS.length,
    ...patch
  });
}

function buildScopeContract({ draft = {}, scopeState = {} } = {}) {
  const courseTitle = text(scopeState?.course?.title || draft.courseInput) || "Curso";
  const moduleTitle = text(scopeState?.moduleValue?.title || draft.moduleInput) || "Módulo";
  const lessonTitle = text(scopeState?.lesson?.title || draft.lessonInput) || "Lição";
  const include = uniqueList(draft.includeTopics);
  const exclude = uniqueList(draft.excludeTopics);
  return {
    schemaVersion: "aralearn.scope.v1",
    course: {
      title: courseTitle,
      goal: text(draft.promptText) || `Organizar ${courseTitle}.`,
      evidencePriority: ["exercise_list"]
    },
    modules: [
      {
        title: moduleTitle,
        include: include.length ? include : [lessonTitle],
        exclude,
        notes: text(draft.promptText),
        assessmentStyle: "mixed"
      }
    ]
  };
}

function buildPatchTargetFromProject(projectDocument = {}) {
  const course = projectDocument.courses?.[0] || null;
  const moduleValue = course?.modules?.[0] || null;
  const lesson = moduleValue?.lessons?.[0] || null;
  return {
    courseKey: course?.id || "",
    moduleKey: moduleValue?.id || "",
    lessonKey: lesson?.id || ""
  };
}

function resolveMicrosequenceAction(draft = {}) {
  if (text(draft.actionIntent) === "next_planned") {
    return "next_planned";
  }
  if (text(draft.actionIntent) === "branch_after_current") {
    return "branch";
  }
  if (text(draft.operationMode) === "repair") {
    return "repair";
  }
  return "generate";
}

export async function generateStructureProjectDocument({
  draft = {},
  scopeState = {},
  projectDocument = createEmptyProjectDocument(),
  assistConfig = {},
  provider,
  onProgress
} = {}) {
  const runtime = resolveProvider(provider, assistConfig);
  emitStructurePhase(onProgress, "normalize_intent", "phase_started");
  const scopeContract = buildScopeContract({ draft, scopeState });
  emitStructurePhase(onProgress, "normalize_intent", "phase_completed");
  emitStructurePhase(onProgress, "index_sources", "phase_started");
  emitStructurePhase(onProgress, "index_sources", "phase_completed");
  emitStructurePhase(onProgress, "build_assessment_profile", "phase_started");
  emitStructurePhase(onProgress, "build_assessment_profile", "phase_completed");
  emitStructurePhase(onProgress, "plan_architecture", "phase_started", { modelId: runtime.modelId });
  const result = await planCourseFromScope({
    scopeContract,
    provider: runtime.provider,
    modelId: runtime.modelId,
    providerOptions: runtime.providerOptions,
    project: projectDocument
  });
  emitStructurePhase(onProgress, "plan_architecture", "phase_completed", { modelId: runtime.modelId });
  emitStructurePhase(onProgress, "compile_patch", "phase_started");
  const target = buildPatchTargetFromProject(result.project);
  emitStructurePhase(onProgress, "compile_patch", "phase_completed");
  emitStructurePhase(onProgress, "validate_patch", "phase_started");
  emitStructurePhase(onProgress, "validate_patch", "phase_completed");
  emitStructurePhase(onProgress, "apply_patch", "phase_started");
  emitStructurePhase(onProgress, "apply_patch", "phase_completed");
  emitStructurePhase(onProgress, "final_report", "phase_started");
  emitStructurePhase(onProgress, "final_report", "phase_completed");
  return {
    scopeContract: result.scopeContract,
    plannedCourse: result.plannedCourse,
    patch: {
      ...result.patch,
      target
    },
    projectDocument: result.project,
    summary: {
      message: "Estrutura planejada no contrato v3.",
      openActionLabel: "Abrir curso"
    }
  };
}

export async function generateMicrosequenceProjectDocument({
  selection = {},
  draft = {},
  assistConfig = {},
  projectDocument = createEmptyProjectDocument(),
  provider,
  preparedIntervention = {},
  resumeState = null,
  onProgress
} = {}) {
  const runtime = resolveProvider(provider, assistConfig);
  const action = resolveMicrosequenceAction(draft);
  const attachedSources = Array.isArray(preparedIntervention?.ingestedAttachments?.attachments)
    ? preparedIntervention.ingestedAttachments.attachments
    : [];
  const common = {
    project: projectDocument,
    selection,
    provider: runtime.provider,
    modelId: runtime.modelId,
    providerOptions: runtime.providerOptions,
    userRequest: text(preparedIntervention?.promptText) || text(draft.promptText),
    source: "llm",
    onProgress,
    resumeState
  };
  common.attachedSources = attachedSources;
  common.userSelectedSourceIds = selectedSourceIds(attachedSources);
  common.userSelectedExtraResourceTypes = selectedExtraResources(preparedIntervention, draft);
  common.requestContext = preparedIntervention?.requestContext || null;

  onProgress?.({ phase: "bottom-up", message: "Gerando cards." });

  const result =
    action === "next_planned"
      ? await generateNextMicrosequence(common)
      : action === "branch"
        ? await createBranchMicrosequence(common)
        : action === "repair"
          ? await improveMicrosequenceVersion({
              ...common,
              reason: text(preparedIntervention?.promptText) || text(draft.promptText) || "Melhorar a microssequência atual."
            })
          : draft.requestedGenerationDepth === "deep"
            ? await addPracticeToMicrosequence(common)
            : await generateMicrosequenceCards(common);

  if (result?.blockedBy) {
    const blockedByLabel = text(result.blockedByTitle) || text(result.blockedBy);
    onProgress?.({
      stage: "prepare",
      status: "failed",
      message: `A próxima microssequência ainda depende de "${blockedByLabel}".`,
      resumeFrom: "prepare"
    });
    throw new Error(`A próxima microssequência ainda depende de "${blockedByLabel}".`);
  }

  const target = {
    courseKey: selection.courseKey,
    moduleKey: selection.moduleKey,
    lessonKey: selection.lessonKey,
    microsequenceKey: result.selection?.microsequenceKey || selection.microsequenceKey
  };

  return {
    ...result,
    patch: {
      kind: "update-microsequence",
      target
    },
    projectDocument: result.project,
    summary: {
      message: "Microssequência gerada no contrato v3.",
      openActionLabel: "Abrir microssequência"
    }
  };
}
