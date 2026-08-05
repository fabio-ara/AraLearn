import { DEFAULT_ENGINE_PROFILE_ID } from "../config/engineProfileRegistry.js";
import {
  createRegisteredProvider,
  resolveConfiguredModelId
} from "../providers/providerRegistry.js";
import { buildCardAssistanceProfileOverrides } from "./profileTuning.js";

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

export function resolveCardAssistanceLaunchConfig({
  selectedModel = "",
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
  const selectedModelId = text(selectedModel);
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
    throw new Error("Provider sem saída estruturada para a assistência de card.");
  }
  const didacticPolicy = buildCardAssistanceProfileOverrides({ profileTuning }).didacticPolicy;
  return {
    modelId,
    provider: activeProvider,
    protocol: registered?.protocol || "injected",
    endpoint: registered?.endpoint || "",
    didacticProfileId: text(didacticProfileId) || DEFAULT_ENGINE_PROFILE_ID,
    didacticPolicy
  };
}
