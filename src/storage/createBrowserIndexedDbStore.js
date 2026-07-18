export const DATABASE_NAME = "aralearn";
const DATABASE_VERSION = 1;
const STORE_NAME = "state";

export class IndexedDbStoreError extends Error {
  constructor(message, { operation, key = null, cause = null } = {}) {
    super(message, cause ? { cause } : undefined);
    this.name = "IndexedDbStoreError";
    this.operation = operation;
    this.key = key;
  }
}

function storeError(message, operation, cause, key = null) {
  return new IndexedDbStoreError(message, { operation, key, cause });
}

function openDatabase(indexedDb) {
  return new Promise((resolve, reject) => {
    const request = indexedDb.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME);
      }
    };
    request.onblocked = () => reject(storeError("A abertura do banco local foi bloqueada por outra instância.", "open"));
    request.onerror = () => reject(storeError("Não foi possível abrir o banco local.", "open", request.error));
    request.onsuccess = () => resolve(request.result);
  });
}

export function deleteBrowserIndexedDbDatabase(indexedDb = globalThis.indexedDB) {
  if (!indexedDb || typeof indexedDb.deleteDatabase !== "function") {
    throw new Error("IndexedDB não está disponível neste navegador.");
  }
  return new Promise((resolve, reject) => {
    const request = indexedDb.deleteDatabase(DATABASE_NAME);
    request.onblocked = () => reject(storeError("A limpeza do banco local foi bloqueada por outra instância.", "delete"));
    request.onerror = () => reject(storeError("Não foi possível limpar o banco local.", "delete", request.error));
    request.onsuccess = () => resolve();
  });
}

function readAll(database) {
  return new Promise((resolve, reject) => {
    const memory = new Map();
    const transaction = database.transaction(STORE_NAME, "readonly");
    const request = transaction.objectStore(STORE_NAME).openCursor();
    let settled = false;

    const fail = (cause) => {
      if (settled) return;
      settled = true;
      reject(storeError("Não foi possível ler o banco local.", "read", cause));
    };

    request.onerror = () => fail(request.error);
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) return;
      memory.set(String(cursor.key), String(cursor.value ?? ""));
      cursor.continue();
    };
    transaction.onabort = () => fail(transaction.error);
    transaction.onerror = () => fail(transaction.error);
    transaction.oncomplete = () => {
      if (settled) return;
      settled = true;
      resolve(memory);
    };
  });
}

function writeEntries(database, operation, entries = []) {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    const objectStore = transaction.objectStore(STORE_NAME);
    const firstKey = entries[0]?.[0] ?? null;

    try {
      if (operation === "set") {
        entries.forEach(([key, value]) => objectStore.put(String(value), String(key)));
      } else if (operation === "remove") {
        entries.forEach(([key]) => objectStore.delete(String(key)));
      } else if (operation === "clear") {
        objectStore.clear();
      } else {
        throw new Error(`Operação local inválida: "${operation}".`);
      }
    } catch (error) {
      transaction.abort();
      reject(storeError("Não foi possível salvar no banco local.", operation, error, firstKey));
      return;
    }

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(storeError("Não foi possível salvar no banco local.", operation, transaction.error, firstKey));
    transaction.onabort = () => reject(storeError("A gravação local foi interrompida.", operation, transaction.error, firstKey));
  });
}

export async function createBrowserIndexedDbStore(
  indexedDb = globalThis.indexedDB,
  { onError = null } = {}
) {
  if (!indexedDb || typeof indexedDb.open !== "function") {
    throw new Error("IndexedDB não está disponível neste navegador.");
  }
  if (onError !== null && typeof onError !== "function") {
    throw new TypeError("O observador de erros do IndexedDB deve ser uma função.");
  }

  const database = await openDatabase(indexedDb);
  let memory;
  try {
    memory = await readAll(database);
  } catch (error) {
    database.close();
    throw error;
  }
  let queueTail = Promise.resolve();
  let lastError = null;
  const unflushedErrors = [];
  let closed = false;

  function report(error) {
    lastError = error;
    unflushedErrors.push(error);
    onError?.(error);
  }

  database.onversionchange = () => {
    database.close();
    closed = true;
    report(storeError("O banco local foi fechado porque sua estrutura mudou em outra instância.", "versionchange"));
  };

  function assertOpen() {
    if (closed) {
      throw storeError("O banco local já está fechado.", "closed");
    }
  }

  function enqueue(operation, entries = []) {
    assertOpen();
    const result = queueTail.then(async () => {
      await writeEntries(database, operation, entries);
      if (operation === "set") {
        entries.forEach(([key, value]) => memory.set(key, value));
      } else if (operation === "remove") {
        entries.forEach(([key]) => memory.delete(key));
      } else if (operation === "clear") {
        memory.clear();
      }
    });
    result.catch(report);
    queueTail = result.catch(() => undefined);
    return result;
  }

  return {
    getItem(key) {
      assertOpen();
      return memory.has(String(key)) ? memory.get(String(key)) : null;
    },
    setItem(key, value) {
      const normalizedKey = String(key);
      const normalizedValue = String(value);
      return enqueue("set", [[normalizedKey, normalizedValue]]);
    },
    setItems(entries) {
      if (!Array.isArray(entries) || entries.some((entry) => !Array.isArray(entry) || entry.length < 2)) {
        throw new TypeError("Itens inválidos para gravação local.");
      }
      const normalizedEntries = entries.map(([key, value]) => [String(key), String(value)]);
      return enqueue("set", normalizedEntries);
    },
    removeItem(key) {
      const normalizedKey = String(key);
      return enqueue("remove", [[normalizedKey]]);
    },
    clear() {
      return enqueue("clear");
    },
    getLastError() {
      return lastError;
    },
    async flush() {
      await queueTail;
      if (unflushedErrors.length) {
        const error = unflushedErrors[0];
        unflushedErrors.length = 0;
        throw error;
      }
    },
    async close() {
      try {
        await this.flush();
      } finally {
        database.close();
        closed = true;
      }
    }
  };
}
