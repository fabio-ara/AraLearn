import { readStoredObject, writeStoredObject } from "../storage/jsonObjectStore.js";
import { STORAGE_KEYS } from "../core/storageKeys.js";

export function readCommentStorage(storage) {
  return readStoredObject(storage, STORAGE_KEYS.comments);
}

export function writeCommentStorage(commentMap, storage) {
  return writeStoredObject(storage, STORAGE_KEYS.comments, commentMap);
}
