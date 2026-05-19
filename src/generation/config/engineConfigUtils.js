export function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

export function normalizeArray(value) {
  return Array.isArray(value) ? value : [];
}

export function mergeRecords(base = {}, overrides = {}) {
  const result = { ...structuredClone(base || {}) };
  Object.entries(overrides || {}).forEach(([key, value]) => {
    if (Array.isArray(value)) {
      result[key] = structuredClone(value);
      return;
    }
    if (value && typeof value === "object") {
      result[key] = mergeRecords(result[key] || {}, value);
      return;
    }
    result[key] = value;
  });
  return result;
}

export function freezeRecord(record) {
  return Object.freeze(structuredClone(record));
}
