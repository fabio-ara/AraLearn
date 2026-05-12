import { normalizeMicrosequenceVersionEntry } from "./microsequenceVersionState.js";
import { normalizeStructureVersionEntry, normalizeStructureVersionMap } from "./structureVersionState.js";

const CARD_HISTORY_STORAGE_KEY = "aralearn.card-history.v1";
const CARD_COMMENT_STORAGE_KEY = "aralearn.card-comments.v1";
const ASSIST_CONFIG_STORAGE_KEY = "aralearn.assist-config";
const MICROSEQUENCE_VERSION_STORAGE_KEY = "aralearn.microsequence-versions.v1";
const STRUCTURE_VERSION_STORAGE_KEY = "aralearn.structure-versions.v1";
const ASSIST_PREVIEW_STORAGE_KEY = "aralearn.assist-previews.v1";

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

export function readHistoryStorage(storage = globalThis.localStorage) {
  return readJsonMap(storage, CARD_HISTORY_STORAGE_KEY);
}

export function writeHistoryStorage(historyMap, storage = globalThis.localStorage) {
  writeJsonMap(storage, CARD_HISTORY_STORAGE_KEY, historyMap);
}

export function readCommentStorage(storage = globalThis.localStorage) {
  return readJsonMap(storage, CARD_COMMENT_STORAGE_KEY);
}

export function writeCommentStorage(commentMap, storage = globalThis.localStorage) {
  writeJsonMap(storage, CARD_COMMENT_STORAGE_KEY, commentMap);
}

export function readAssistConfigStorage(storage = globalThis.localStorage) {
  const config = readJsonMap(storage, ASSIST_CONFIG_STORAGE_KEY);
  return {
    model: typeof config.model === "string" && config.model.trim() ? config.model.trim() : "gemini-2.5-flash",
    apiKey: typeof config.apiKey === "string" ? config.apiKey : ""
  };
}

export function writeAssistConfigStorage(config, storage = globalThis.localStorage) {
  writeJsonMap(
    storage,
    ASSIST_CONFIG_STORAGE_KEY,
    {
      model: typeof config?.model === "string" ? config.model : "gemini-2.5-flash",
      apiKey: typeof config?.apiKey === "string" ? config.apiKey : ""
    }
  );
}

export function readMicrosequenceVersionStorage(storage = globalThis.localStorage) {
  const rawMap = readJsonMap(storage, MICROSEQUENCE_VERSION_STORAGE_KEY);
  return Object.fromEntries(
    Object.entries(rawMap)
      .map(([key, entry]) => [key, normalizeMicrosequenceVersionEntry(entry)])
      .filter(([, entry]) => Array.isArray(entry.versions) && entry.versions.length > 0)
  );
}

export function writeMicrosequenceVersionStorage(versionMap, storage = globalThis.localStorage) {
  writeJsonMap(storage, MICROSEQUENCE_VERSION_STORAGE_KEY, versionMap);
}

export function readStructureVersionStorage(storage = globalThis.localStorage) {
  const rawMap = readJsonMap(storage, STRUCTURE_VERSION_STORAGE_KEY);
  return normalizeStructureVersionMap(
    Object.fromEntries(
      Object.entries(rawMap)
        .map(([key, entry]) => [key, normalizeStructureVersionEntry(entry)])
        .filter(([, entry]) => Array.isArray(entry.versions) && entry.versions.length > 0)
    )
  );
}

export function writeStructureVersionStorage(versionMap, storage = globalThis.localStorage) {
  normalizeStructureVersionMap(versionMap);
  writeJsonMap(storage, STRUCTURE_VERSION_STORAGE_KEY, versionMap);
}

function normalizeAssistPreviewEntry(entry) {
  if (!entry || typeof entry !== "object") {
    return null;
  }

  const title = typeof entry.title === "string" && entry.title.trim() ? entry.title.trim() : "Microssequência";
  const tags = Array.isArray(entry.tags)
    ? entry.tags.map((item) => String(item || "").trim()).filter(Boolean)
    : [];
  const cards = Array.isArray(entry.cards)
    ? entry.cards.filter((item) => item && typeof item === "object").map((item) => ({ ...item }))
    : [];
  const updatedAt = typeof entry.updatedAt === "string" && entry.updatedAt.trim() ? entry.updatedAt.trim() : "";

  if (!cards.length) {
    return null;
  }

  return { title, tags, cards, updatedAt };
}

export function readAssistPreviewStorage(storage = globalThis.localStorage) {
  const rawMap = readJsonMap(storage, ASSIST_PREVIEW_STORAGE_KEY);
  return Object.fromEntries(
    Object.entries(rawMap)
      .map(([key, entry]) => [key, normalizeAssistPreviewEntry(entry)])
      .filter(([, entry]) => entry)
  );
}

export function writeAssistPreviewStorage(previewMap, storage = globalThis.localStorage) {
  writeJsonMap(storage, ASSIST_PREVIEW_STORAGE_KEY, previewMap);
}
