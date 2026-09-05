const STORAGE_KEY = "aralearn.ui.study-synchronization";

function normalize(value) {
  return value === "manual" ? "manual" : "automatic";
}

export function createStudySynchronizationPreference({
  storage = globalThis.localStorage,
  eventTarget = globalThis
} = {}) {
  const read = () => {
    try { return normalize(storage?.getItem(STORAGE_KEY)); }
    catch { return "manual"; }
  };
  let mode = read();
  const listeners = new Set();
  const update = (value) => {
    const next = normalize(value);
    if (next === mode) return mode;
    mode = next;
    for (const listener of listeners) listener(mode);
    return mode;
  };
  const onStorage = (event) => {
    if (event.key !== STORAGE_KEY && event.key !== null) return;
    update(read());
  };
  eventTarget.addEventListener?.("storage", onStorage);
  return Object.freeze({
    get: () => mode,
    set(value) {
      if (!["automatic", "manual"].includes(value)) {
        throw new TypeError("Preferência de sincronização inválida.");
      }
      if (!storage) throw new Error("Não foi possível salvar a preferência neste dispositivo.");
      storage.setItem(STORAGE_KEY, value);
      return update(value);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    destroy() {
      eventTarget.removeEventListener?.("storage", onStorage);
      listeners.clear();
    }
  });
}
