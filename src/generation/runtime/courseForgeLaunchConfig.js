import { CODEX_LOCAL_MODEL_ID, isCodexLocalModel } from "../../assist/codexLocalAssistProvider.js";
import { createCodexCliProvider } from "../providers/codexCliProvider.js";
import { createGeminiProvider } from "../providers/geminiProvider.js";
import { createProviderRegistry, resolveProviderFromModelId } from "../providers/providerRegistry.js";

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

const COURSE_FORGE_PHASES_WITH_MODEL_OVERRIDE = Object.freeze([
  "plan_architecture",
  "audit_architecture",
  "repair_architecture",
  "plan_lessons",
  "audit_course_graph",
  "repair_course_graph",
  "plan_microsequences",
  "audit_microsequences",
  "repair_microsequences",
  "answer_locally",
  "build_cards",
  "audit_intervention",
  "audit_prerequisites",
  "audit_assessment_alignment",
  "repair_cards",
  "repair_card_adherence"
]);

export function buildCourseForgePhaseModelOverrides(modelId = "") {
  const trimmedModelId = text(modelId);
  if (!trimmedModelId) {
    return {};
  }
  return Object.fromEntries(COURSE_FORGE_PHASES_WITH_MODEL_OVERRIDE.map((phaseId) => [phaseId, trimmedModelId]));
}

export function resolveCourseForgeTopDownProfileId(modelId = "") {
  return isCodexLocalModel(modelId) ? "codex_all" : "custom";
}

export function createCourseForgeRuntimeProvider({
  selectedModel,
  apiKey = "",
  codexEndpoint = "",
  codexToken = ""
} = {}) {
  const modelId = text(selectedModel);
  if (isCodexLocalModel(modelId)) {
    return createCodexCliProvider({
      endpoint: codexEndpoint,
      token: codexToken,
      modelId: modelId || CODEX_LOCAL_MODEL_ID
    });
  }

  return createGeminiProvider({
    apiKey,
    modelId: modelId || "gemini-2.5-flash"
  });
}

export function resolveCourseForgeLaunchConfig({
  selectedModel,
  apiKey = "",
  codexEndpoint = "",
  codexToken = ""
} = {}) {
  const modelId = text(selectedModel);
  const provider = createCourseForgeRuntimeProvider({
    selectedModel: modelId,
    apiKey,
    codexEndpoint,
    codexToken
  });

  return {
    selectedModel: modelId,
    providerId: resolveProviderFromModelId(modelId),
    provider,
    providerRegistry: createProviderRegistry({ providers: [provider] }),
    selectedTopDownProfileId: resolveCourseForgeTopDownProfileId(modelId),
    phaseModelOverrides: buildCourseForgePhaseModelOverrides(modelId)
  };
}
