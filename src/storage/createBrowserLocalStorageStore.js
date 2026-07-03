export function createBrowserLocalStorageStore(storage = globalThis.localStorage) {
  if (!storage || typeof storage.getItem !== "function" || typeof storage.setItem !== "function") {
    throw new Error("Armazenamento local indisponível.");
  }

  const memoryFallback = new Map();

  return {
    getItem(key) {
      if (memoryFallback.has(key)) {
        return memoryFallback.get(key);
      }
      return storage.getItem(key);
    },
    setItem(key, value) {
      const normalized = String(value);
      try {
        storage.setItem(key, normalized);
        memoryFallback.delete(key);
      } catch {
        memoryFallback.set(key, normalized);
      }
    },
    removeItem(key) {
      memoryFallback.delete(key);
      try {
        storage.removeItem(key);
      } catch {
        // Mantém o fallback em memória como fonte de verdade da sessão atual.
      }
    },
    clear() {
      memoryFallback.clear();
      try {
        storage.clear();
      } catch {
        // Mantém a sessão funcional mesmo sem acesso pleno ao armazenamento persistente.
      }
    }
  };
}
