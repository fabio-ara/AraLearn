export function createBrowserLocalStorageStore(storage = globalThis.localStorage) {
  if (!storage || typeof storage.getItem !== "function" || typeof storage.setItem !== "function") {
    throw new Error("Armazenamento local indisponível.");
  }

  return {
    getItem(key) {
      return storage.getItem(key);
    },
    setItem(key, value) {
      storage.setItem(key, String(value));
    },
    removeItem(key) {
      storage.removeItem(key);
    },
    clear() {
      storage.clear();
    }
  };
}
