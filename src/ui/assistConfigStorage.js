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
  return {
    model: typeof config.model === "string" && config.model.trim() ? config.model.trim() : "gemini-2.5-flash-lite",
    apiKey: typeof config.apiKey === "string" ? config.apiKey : ""
  };
}

export function writeAssistConfigStorage(config, storage = globalThis.localStorage) {
  writeJsonMap(
    storage,
    ASSIST_CONFIG_STORAGE_KEY,
    {
      model: typeof config?.model === "string" ? config.model : "gemini-2.5-flash-lite",
      apiKey: typeof config?.apiKey === "string" ? config.apiKey : ""
    }
  );
}
