import { DEFAULT_ENGINE_PROFILE_ID } from "../config/engineProfileRegistry.js";
import { CODEX_LOCAL_MODEL_ID, isCodexLocalModel } from "../providers/codexCliConfig.js";
import { createCodexCliProvider } from "../providers/codexCliProvider.js";
import { DEEPSEEK_BASE_URL, isDeepSeekModelId } from "../providers/deepSeekPolicy.js";
import { createGeminiProvider } from "../providers/geminiProvider.js";
import { createOpenAiCompatibleProvider } from "../providers/openAiCompatibleProvider.js";
import { buildEngineProfileOverrides } from "./profileTuning.js";

export const DEFAULT_GENERATION_MODEL_ID = "gemini-2.5-flash";

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function createProvider({ modelId, apiKey, baseUrl, codexEndpoint, codexToken }) {
  if (isCodexLocalModel(modelId)) {
    return createCodexCliProvider({
      endpoint: codexEndpoint,
      token: codexToken
    });
  }
  if (isDeepSeekModelId(modelId)) {
    return createOpenAiCompatibleProvider({
      apiKey,
      baseUrl: text(baseUrl) || DEEPSEEK_BASE_URL
    });
  }
  if (modelId.startsWith("gemini-")) {
    return createGeminiProvider({ apiKey });
  }
  throw new Error(`Modelo de geração não suportado: "${modelId}".`);
}

export function resolveGenerationLaunchConfig({
  selectedModel = DEFAULT_GENERATION_MODEL_ID,
  apiKey = "",
  baseUrl = "",
  didacticProfileId = DEFAULT_ENGINE_PROFILE_ID,
  profileTuning = {},
  codexEndpoint = "",
  codexToken = "",
  provider = null
} = {}) {
  const modelId = text(selectedModel) || DEFAULT_GENERATION_MODEL_ID;
  const activeProvider = provider || createProvider({
    modelId,
    apiKey: text(apiKey),
    baseUrl: text(baseUrl),
    codexEndpoint: text(codexEndpoint),
    codexToken: text(codexToken)
  });
  if (typeof activeProvider?.generateText !== "function") {
    throw new Error("Provider sem canal textual para a geração.");
  }
  const didacticPolicy = buildEngineProfileOverrides({ profileTuning }).didacticPolicy;
  return {
    modelId,
    provider: activeProvider,
    didacticProfileId: text(didacticProfileId) || DEFAULT_ENGINE_PROFILE_ID,
    didacticPolicy
  };
}

export function isLocalGenerationModel(modelId = "") {
  return text(modelId) === CODEX_LOCAL_MODEL_ID;
}
