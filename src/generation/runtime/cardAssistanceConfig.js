import { DEFAULT_CODEX_LOCAL_ENDPOINT } from "../providers/codexCliConfig.js";
import {
  isCustomProviderSelection,
  isLocalProviderSelection,
  PROVIDER_PROTOCOL_OPTIONS,
  validateRegisteredProviderConfiguration
} from "../providers/providerRegistry.js";
import { DEFAULT_ENGINE_PROFILE_ID } from "../config/engineProfileRegistry.js";
import { createProfileTuning } from "./profileTuning.js";

const DEFAULT_ASSIST_MODEL = "gemini-2.5-flash";

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

export function normalizeAssistConfig(config = {}) {
  const customProfiles = normalizeAssistCustomProfiles(config.customProfiles);
  const selectedProfileId = text(config.selectedProfileId) || text(config.didacticProfileId) || DEFAULT_ENGINE_PROFILE_ID;
  const selectedCustomProfile = customProfiles.find((entry) => entry.id === selectedProfileId) || null;
  const didacticProfileId =
    selectedCustomProfile?.baseProfileId ||
    text(config.didacticProfileId) ||
    selectedProfileId ||
    DEFAULT_ENGINE_PROFILE_ID;
  const providerProtocol = PROVIDER_PROTOCOL_OPTIONS.some((entry) => entry.value === text(config.providerProtocol))
    ? text(config.providerProtocol)
    : "";
  return {
    model: text(config.model) || DEFAULT_ASSIST_MODEL,
    apiKey: typeof config.apiKey === "string" ? config.apiKey.trim() : "",
    baseUrl: typeof config.baseUrl === "string" ? config.baseUrl.trim() : "",
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
    codexToken: typeof config.codexToken === "string" ? config.codexToken.trim() : "",
    providerProtocol,
    customModelId: text(config.customModelId),
    providerEndpoint: text(config.providerEndpoint),
    providerSecret: typeof config.providerSecret === "string" ? config.providerSecret.trim() : ""
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
  const isCustomLocal = isLocalProviderSelection({
    selectedModel: normalizedAssistConfig.model,
    providerProtocol: normalizedAssistConfig.providerProtocol
  });

  let status;
  try {
    status = await checkCodexLocalHealth({
      endpoint: isCustomLocal
        ? normalizedAssistConfig.providerEndpoint || normalizedAssistConfig.codexEndpoint
        : normalizedAssistConfig.codexEndpoint,
      token: isCustomLocal
        ? normalizedAssistConfig.providerSecret || normalizedAssistConfig.codexToken
        : normalizedAssistConfig.codexToken
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

export async function resolveCardAssistanceProviderReadiness({
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
