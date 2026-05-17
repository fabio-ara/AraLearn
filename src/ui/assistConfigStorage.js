import { DEFAULT_CODEX_LOCAL_ENDPOINT } from "../generation/providers/codexCliConfig.js";
import { DEFAULT_ENGINE_PROFILE_ID } from "../generation/config/engineProfileRegistry.js";
import { createCourseForgeProfileTuning } from "../generation/runtime/courseForgeProfileTuning.js";

const ASSIST_CONFIG_STORAGE_KEY = "aralearn.assist-config";
const DEFAULT_ASSIST_MODEL = "gemini-2.5-flash";

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
  return {
    model: typeof config.model === "string" && config.model.trim() ? config.model.trim() : DEFAULT_ASSIST_MODEL,
    apiKey: typeof config.apiKey === "string" ? config.apiKey : "",
    didacticProfileId:
      typeof config.didacticProfileId === "string" && config.didacticProfileId.trim()
        ? config.didacticProfileId.trim()
        : DEFAULT_ENGINE_PROFILE_ID,
    profileTuning: createCourseForgeProfileTuning(
      typeof config.didacticProfileId === "string" && config.didacticProfileId.trim()
        ? config.didacticProfileId.trim()
        : DEFAULT_ENGINE_PROFILE_ID,
      config.profileTuning && typeof config.profileTuning === "object"
        ? config.profileTuning
        : {
            guardrailsText: typeof config.customPromptGuidance === "string" ? config.customPromptGuidance : ""
          }
    ),
    codexEndpoint:
      typeof config.codexEndpoint === "string" && config.codexEndpoint.trim()
        ? config.codexEndpoint.trim()
        : DEFAULT_CODEX_LOCAL_ENDPOINT,
    codexToken: typeof config.codexToken === "string" ? config.codexToken : ""
  };
}

export function writeAssistConfigStorage(config, storage = globalThis.localStorage) {
  writeJsonMap(
    storage,
    ASSIST_CONFIG_STORAGE_KEY,
    {
      model: typeof config?.model === "string" && config.model.trim() ? config.model.trim() : DEFAULT_ASSIST_MODEL,
      apiKey: typeof config?.apiKey === "string" ? config.apiKey : "",
      didacticProfileId:
        typeof config?.didacticProfileId === "string" && config.didacticProfileId.trim()
          ? config.didacticProfileId.trim()
          : DEFAULT_ENGINE_PROFILE_ID,
      profileTuning: createCourseForgeProfileTuning(
        typeof config?.didacticProfileId === "string" && config.didacticProfileId.trim()
          ? config.didacticProfileId.trim()
          : DEFAULT_ENGINE_PROFILE_ID,
        config?.profileTuning && typeof config.profileTuning === "object" ? config.profileTuning : {}
      ),
      codexEndpoint:
        typeof config?.codexEndpoint === "string" && config.codexEndpoint.trim()
          ? config.codexEndpoint.trim()
          : DEFAULT_CODEX_LOCAL_ENDPOINT,
      codexToken: typeof config?.codexToken === "string" ? config.codexToken : ""
    }
  );
}
