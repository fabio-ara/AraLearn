const DATABASE_NAME = "aralearn";
const DATABASE_VERSION = 1;
const STORE_NAME = "state";

function openDatabase(indexedDb) {
  return new Promise((resolve, reject) => {
    const request = indexedDb.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME);
      }
    };
    request.onerror = () => reject(request.error || new Error("Não foi possível abrir o banco local."));
    request.onsuccess = () => resolve(request.result);
  });
}

function readAll(database) {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readonly");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAllKeys();
    request.onerror = () => reject(request.error || new Error("Não foi possível ler o banco local."));
    request.onsuccess = () => {
      const keys = request.result || [];
      const values = store.getAll();
      values.onerror = () => reject(values.error || new Error("Não foi possível ler o banco local."));
      values.onsuccess = () => resolve(new Map(keys.map((key, index) => [String(key), String(values.result[index] ?? "")])));
    };
  });
}

function write(database, operation, key, value) {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    if (operation === "set") store.put(String(value), String(key));
    if (operation === "remove") store.delete(String(key));
    if (operation === "clear") store.clear();
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error || new Error("Não foi possível salvar no banco local."));
    transaction.onabort = () => reject(transaction.error || new Error("A gravação local foi interrompida."));
  });
}

export async function createBrowserIndexedDbStore(indexedDb = globalThis.indexedDB) {
  if (!indexedDb || typeof indexedDb.open !== "function") {
    throw new Error("IndexedDB não está disponível neste navegador.");
  }

  const database = await openDatabase(indexedDb);
  const memory = await readAll(database);
  let pendingWrite = Promise.resolve();

  function enqueue(operation, key, value) {
    pendingWrite = pendingWrite.then(() => write(database, operation, key, value));
    return pendingWrite;
  }

  return {
    getItem(key) {
      return memory.has(String(key)) ? memory.get(String(key)) : null;
    },
    setItem(key, value) {
      memory.set(String(key), String(value));
      void enqueue("set", key, value);
    },
    removeItem(key) {
      memory.delete(String(key));
      void enqueue("remove", key);
    },
    clear() {
      memory.clear();
      void enqueue("clear");
    },
    async flush() {
      await pendingWrite;
    }
  };
}
