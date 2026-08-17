import { UUID_PATTERN } from "../domain/identifiers.js";

const DATABASE_PREFIX = "aralearn-course-v1";
const DATABASE_VERSION = 1;
const CACHE_STORE = "course_cache";

function requestPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Operação IndexedDB interrompida."));
  });
}

function transactionPromise(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error || new Error("Transação IndexedDB abortada."));
    transaction.onerror = () => reject(transaction.error || new Error("Transação IndexedDB falhou."));
  });
}

function databaseName(userId) {
  const normalized = String(userId || "").trim().toLowerCase();
  if (!UUID_PATTERN.test(normalized)) throw new TypeError("Identidade do usuário inválida.");
  return `${DATABASE_PREFIX}-${normalized}`;
}

function cacheKey(value) {
  const normalized = String(value || "").trim();
  if (!normalized || normalized.length > 1_000) throw new TypeError("Chave de cache inválida.");
  return normalized;
}

export class CourseLocalStore {
  static open(indexedDb, { userId } = {}) {
    if (!indexedDb || typeof indexedDb.open !== "function") {
      throw new TypeError("IndexedDB indisponível.");
    }
    const name = databaseName(userId);
    return new Promise((resolve, reject) => {
      const request = indexedDb.open(name, DATABASE_VERSION);
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(CACHE_STORE)) {
          database.createObjectStore(CACHE_STORE, { keyPath: "key" });
        }
      };
      request.onerror = () => reject(request.error || new Error("Não foi possível abrir o cache de Cursos."));
      request.onblocked = () => reject(new Error("O cache de Cursos está aberto em outra versão do aplicativo."));
      request.onsuccess = () => resolve(new CourseLocalStore({
        indexedDb,
        database: request.result,
        name
      }));
    });
  }

  static deleteDatabase(indexedDb, { userId } = {}) {
    if (!indexedDb || typeof indexedDb.deleteDatabase !== "function") {
      throw new TypeError("IndexedDB indisponível.");
    }
    return requestPromise(indexedDb.deleteDatabase(databaseName(userId)));
  }

  constructor({ indexedDb, database, name }) {
    this.indexedDb = indexedDb;
    this.database = database;
    this.name = name;
    this.invalidated = false;
    this.invalidationListeners = new Set();
    database.onversionchange = () => {
      if (this.invalidated) return;
      this.invalidated = true;
      database.close();
      const error = new Error("O cache de Cursos foi substituído por outra versão.");
      for (const listener of this.invalidationListeners) {
        try {
          listener(error);
        } catch (listenerError) {
          console.error("Falha ao reagir à substituição do cache de Cursos.", listenerError);
        }
      }
    };
  }

  #store(mode) {
    if (this.invalidated) throw new Error("O cache de Cursos foi substituído por outra versão.");
    const transaction = this.database.transaction(CACHE_STORE, mode);
    return { transaction, store: transaction.objectStore(CACHE_STORE) };
  }

  async getCache(key) {
    const { transaction, store } = this.#store("readonly");
    const row = await requestPromise(store.get(cacheKey(key)));
    await transactionPromise(transaction);
    return row ? structuredClone(row.value) : null;
  }

  async putCache(key, value) {
    const normalizedKey = cacheKey(key);
    const { transaction, store } = this.#store("readwrite");
    if (value == null) store.delete(normalizedKey);
    else store.put({ key: normalizedKey, value: structuredClone(value) });
    await transactionPromise(transaction);
  }

  async deleteCachePrefix(prefix) {
    const normalizedPrefix = cacheKey(prefix);
    const { transaction, store } = this.#store("readwrite");
    const request = store.openCursor();
    await new Promise((resolve, reject) => {
      request.onerror = () => reject(request.error || new Error("Não foi possível limpar o cache de Cursos."));
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) {
          resolve();
          return;
        }
        if (String(cursor.key).startsWith(normalizedPrefix)) cursor.delete();
        cursor.continue();
      };
    });
    await transactionPromise(transaction);
  }

  onConnectionInvalidated(listener) {
    if (typeof listener !== "function") throw new TypeError("Listener do cache de Cursos inválido.");
    this.invalidationListeners.add(listener);
    return () => this.invalidationListeners.delete(listener);
  }

  close() {
    this.database.close();
  }
}

export { DATABASE_PREFIX as COURSE_LOCAL_DATABASE_PREFIX };
