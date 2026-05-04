const CARD_HISTORY_STORAGE_KEY = "aralearn.card-history.v1";
const CARD_COMMENT_STORAGE_KEY = "aralearn.card-comments.v1";
const ASSIST_CARD_COMMENT_STORAGE_KEY = "aralearn.assist-card-comments.v1";

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

export function readAssistCommentStorage(storage = globalThis.localStorage) {
  return readJsonMap(storage, ASSIST_CARD_COMMENT_STORAGE_KEY);
}

export function writeAssistCommentStorage(commentMap, storage = globalThis.localStorage) {
  writeJsonMap(storage, ASSIST_CARD_COMMENT_STORAGE_KEY, commentMap);
}
