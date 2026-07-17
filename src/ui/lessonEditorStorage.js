import {
  readAssistConfigStorage as readSharedAssistConfigStorage,
  writeAssistConfigStorage as writeSharedAssistConfigStorage
} from "./assistConfigStorage.js";

const CARD_COMMENT_STORAGE_KEY = "aralearn.card-comments.v1";

function defaultStorage() {
  return globalThis.AraLearnStorage;
}

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

export function readCommentStorage(storage = defaultStorage()) {
  return readJsonMap(storage, CARD_COMMENT_STORAGE_KEY);
}

export function writeCommentStorage(commentMap, storage = defaultStorage()) {
  writeJsonMap(storage, CARD_COMMENT_STORAGE_KEY, commentMap);
}

export function readAssistConfigStorage(storage = defaultStorage()) {
  return readSharedAssistConfigStorage(storage);
}

export function writeAssistConfigStorage(config, storage = defaultStorage()) {
  writeSharedAssistConfigStorage(config, storage);
}
