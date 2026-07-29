import { DEFAULT_ENGINE_PROFILE_ID } from "../config/engineProfileRegistry.js";
import { CODEX_LOCAL_MODEL_ID } from "../providers/codexCliConfig.js";
import {
  createRegisteredProvider,
  resolveConfiguredModelId
} from "../providers/providerRegistry.js";
import { buildEngineProfileOverrides } from "./profileTuning.js";

export const DEFAULT_GENERATION_MODEL_ID = "gemini-2.5-flash";

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

export function resolveGenerationLaunchConfig({
  selectedModel = DEFAULT_GENERATION_MODEL_ID,
  apiKey = "",
  baseUrl = "",
  didacticProfileId = DEFAULT_ENGINE_PROFILE_ID,
  profileTuning = {},
  codexEndpoint = "",
  codexToken = "",
  providerProtocol = "",
  customModelId = "",
  providerEndpoint = "",
  providerSecret = "",
  provider = null
} = {}) {
  const selectedModelId = text(selectedModel) || DEFAULT_GENERATION_MODEL_ID;
  const modelId = resolveConfiguredModelId({ selectedModel: selectedModelId, customModelId }) || selectedModelId;
  const registered = provider
    ? null
    : createRegisteredProvider({
        selectedModel: selectedModelId,
        apiKey: text(apiKey),
        baseUrl: text(baseUrl),
        codexEndpoint: text(codexEndpoint),
        codexToken: text(codexToken),
        providerProtocol: text(providerProtocol),
        customModelId: text(customModelId),
        providerEndpoint: text(providerEndpoint),
        providerSecret: text(providerSecret)
      });
  const activeProvider = provider || registered.provider;
  if (typeof activeProvider?.generateStructured !== "function") {
    throw new Error("Provider sem saída estruturada para a geração.");
  }
  const didacticPolicy = buildEngineProfileOverrides({ profileTuning }).didacticPolicy;
  return {
    modelId,
    provider: activeProvider,
    protocol: registered?.protocol || "injected",
    endpoint: registered?.endpoint || "",
    didacticProfileId: text(didacticProfileId) || DEFAULT_ENGINE_PROFILE_ID,
    didacticPolicy
  };
}

export function isLocalGenerationModel(modelId = "") {
  return text(modelId) === CODEX_LOCAL_MODEL_ID;
}
