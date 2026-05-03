export function createKeyValueMemoryStore(initialEntries = {}) {
  const map = new Map(Object.entries(initialEntries));

  return {
    getItem(key) {
      return map.has(key) ? map.get(key) : null;
    },
    setItem(key, value) {
      map.set(key, String(value));
    },
    removeItem(key) {
      map.delete(key);
    },
    clear() {
      map.clear();
    },
    dump() {
      return Object.fromEntries(map.entries());
    }
  };
}
