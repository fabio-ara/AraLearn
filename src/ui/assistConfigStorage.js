import { DEFAULT_CODEX_LOCAL_ENDPOINT } from "../generation/providers/codexCliConfig.js";
import { normalizeAssistConfig } from "../generation/runtime/generationEditorRuntime.js";

const ASSIST_CONFIG_STORAGE_KEY = "aralearn.assist-config";

function readJsonMap(storage, key) {
  if (!storage || typeof storage.getItem !== "function") {
    return {};
  }

  try {
    const rawValue = storage.getItem(key);
    if (!rawValue) {
      return {};
    }

    const parsed = JSON.parse(rawValue);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeJsonMap(storage, key, value) {
  if (!storage || typeof storage.setItem !== "function") {
    return;
  }

  try {
    storage.setItem(key, JSON.stringify(value));
  } catch {
    // Evita quebrar a UI se a quota local estiver indisponível.
  }
}

export function readAssistConfigStorage(storage = globalThis.localStorage) {
  const config = readJsonMap(storage, ASSIST_CONFIG_STORAGE_KEY);
  return normalizeAssistConfig({
    ...config,
    codexEndpoint:
      typeof config.codexEndpoint === "string" && config.codexEndpoint.trim()
        ? config.codexEndpoint.trim()
        : DEFAULT_CODEX_LOCAL_ENDPOINT,
    codexToken: typeof config.codexToken === "string" ? config.codexToken : ""
  });
}

export function writeAssistConfigStorage(config, storage = globalThis.localStorage) {
  const normalized = normalizeAssistConfig(config || {});
  writeJsonMap(
    storage,
    ASSIST_CONFIG_STORAGE_KEY,
    {
      model: normalized.model,
      apiKey: normalized.apiKey,
      selectedProfileId: normalized.selectedProfileId,
      didacticProfileId: normalized.didacticProfileId,
      profileTuning: normalized.profileTuning,
      customProfiles: normalized.customProfiles,
      codexEndpoint: normalized.codexEndpoint || DEFAULT_CODEX_LOCAL_ENDPOINT,
      codexToken: normalized.codexToken
    }
  );
}
