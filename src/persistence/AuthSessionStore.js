const DATABASE_NAME = "aralearn-auth-v1";
const DATABASE_VERSION = 1;
const SESSION_STORE = "session_state";

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

function stateKey(value) {
  const normalized = String(value || "").trim();
  if (!normalized || normalized.length > 512) throw new TypeError("Chave de sessão inválida.");
  return normalized;
}

export class AuthSessionStore {
  static open(indexedDb) {
    if (!indexedDb || typeof indexedDb.open !== "function") {
      throw new TypeError("IndexedDB indisponível.");
    }
    return new Promise((resolve, reject) => {
      const request = indexedDb.open(DATABASE_NAME, DATABASE_VERSION);
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(SESSION_STORE)) {
          database.createObjectStore(SESSION_STORE, { keyPath: "key" });
        }
      };
      request.onerror = () => reject(request.error || new Error("Não foi possível abrir a sessão local."));
      request.onblocked = () => reject(new Error("A sessão local está aberta em outra versão do aplicativo."));
      request.onsuccess = () => resolve(new AuthSessionStore({ database: request.result }));
    });
  }

  static deleteDatabase(indexedDb) {
    if (!indexedDb || typeof indexedDb.deleteDatabase !== "function") {
      throw new TypeError("IndexedDB indisponível.");
    }
    return requestPromise(indexedDb.deleteDatabase(DATABASE_NAME));
  }

  constructor({ database }) {
    this.database = database;
    this.invalidated = false;
    this.invalidationListeners = new Set();
    database.onversionchange = () => {
      if (this.invalidated) return;
      this.invalidated = true;
      database.close();
      const error = new Error("A sessão local foi substituída por outra versão.");
      for (const listener of this.invalidationListeners) {
        try {
          listener(error);
        } catch (listenerError) {
          console.error("Falha ao reagir à substituição da sessão local.", listenerError);
        }
      }
    };
  }

  #store(mode) {
    if (this.invalidated) throw new Error("A sessão local foi substituída por outra versão.");
    const transaction = this.database.transaction(SESSION_STORE, mode);
    return { transaction, store: transaction.objectStore(SESSION_STORE) };
  }

  async getSyncState(key) {
    const { transaction, store } = this.#store("readonly");
    const row = await requestPromise(store.get(stateKey(key)));
    await transactionPromise(transaction);
    return row ? structuredClone(row.value) : null;
  }

  async putSyncState(key, value) {
    const normalizedKey = stateKey(key);
    const { transaction, store } = this.#store("readwrite");
    if (value == null) store.delete(normalizedKey);
    else store.put({ key: normalizedKey, value: structuredClone(value) });
    await transactionPromise(transaction);
  }

  onConnectionInvalidated(listener) {
    if (typeof listener !== "function") throw new TypeError("Listener de sessão inválido.");
    this.invalidationListeners.add(listener);
    return () => this.invalidationListeners.delete(listener);
  }

  close() {
    this.database.close();
  }
}

export { DATABASE_NAME as AUTH_SESSION_DATABASE_NAME };
