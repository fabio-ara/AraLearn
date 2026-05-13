import { normalizeMicrosequenceVersionEntry } from "./microsequenceVersionState.js";
import { normalizeStructureVersionEntry, normalizeStructureVersionMap } from "./structureVersionState.js";
import {
  readAssistConfigStorage as readSharedAssistConfigStorage,
  writeAssistConfigStorage as writeSharedAssistConfigStorage
} from "./assistConfigStorage.js";

const CARD_HISTORY_STORAGE_KEY = "aralearn.card-history.v1";
const CARD_COMMENT_STORAGE_KEY = "aralearn.card-comments.v1";
const MICROSEQUENCE_VERSION_STORAGE_KEY = "aralearn.microsequence-versions.v1";
const STRUCTURE_VERSION_STORAGE_KEY = "aralearn.structure-versions.v1";

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
  return readSharedAssistConfigStorage(storage);
}

export function writeAssistConfigStorage(config, storage = globalThis.localStorage) {
  writeSharedAssistConfigStorage(config, storage);
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
