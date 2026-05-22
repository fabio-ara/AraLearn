import { CODEX_LOCAL_MODEL_ID, isCodexLocalModel } from "../providers/codexCliConfig.js";
import { createCodexCliProvider } from "../providers/codexCliProvider.js";
import { createGeminiProvider } from "../providers/geminiProvider.js";
import { createOpenAiCompatibleProvider } from "../providers/openAiCompatibleProvider.js";
import { DEEPSEEK_BASE_URL, isDeepSeekModelId } from "../providers/deepSeekPolicy.js";
import { createProviderRegistry, resolveProviderFromModelId } from "../providers/providerRegistry.js";
import { DEFAULT_ENGINE_PROFILE_ID } from "../config/engineProfileRegistry.js";
import { buildEngineProfileOverrides } from "./profileTuning.js";

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

export function buildPhaseModelOverrides(modelId = "") {
  const trimmedModelId = text(modelId);
  if (!trimmedModelId) {
    return {};
  }
  return Object.fromEntries(COURSE_FORGE_PHASES_WITH_MODEL_OVERRIDE.map((phaseId) => [phaseId, trimmedModelId]));
}

export function resolveTopDownProfileId(modelId = "") {
  return isCodexLocalModel(modelId) ? "codex_all" : "custom";
}

export function resolveDidacticProfileId(profileId = "") {
  return text(profileId) || DEFAULT_ENGINE_PROFILE_ID;
}

export function createGenerationRuntimeProvider({
  selectedModel,
  apiKey = "",
  baseUrl = "",
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
  if (modelId.startsWith("openai-compatible") || modelId.startsWith("openai:") || isDeepSeekModelId(modelId)) {
    return createOpenAiCompatibleProvider({
      apiKey,
      baseUrl: text(baseUrl) || (isDeepSeekModelId(modelId) ? DEEPSEEK_BASE_URL : "")
    });
  }

  return createGeminiProvider({
    apiKey,
    modelId: modelId || "gemini-2.5-flash"
  });
}

export function resolveGenerationLaunchConfig({
  selectedModel,
  apiKey = "",
  baseUrl = "",
  didacticProfileId = "",
  profileTuning = {},
  codexEndpoint = "",
  codexToken = ""
} = {}) {
  const modelId = text(selectedModel);
  const provider = createGenerationRuntimeProvider({
    selectedModel: modelId,
    apiKey,
    baseUrl,
    codexEndpoint,
    codexToken
  });

  return {
    selectedModel: modelId,
    providerId: resolveProviderFromModelId(modelId),
    provider,
    providerRegistry: createProviderRegistry({ providers: [provider] }),
    selectedTopDownProfileId: resolveTopDownProfileId(modelId),
    didacticProfileId: resolveDidacticProfileId(didacticProfileId),
    engineProfileOverrides: buildEngineProfileOverrides({ profileTuning }),
    phaseModelOverrides: buildPhaseModelOverrides(modelId)
  };
}
