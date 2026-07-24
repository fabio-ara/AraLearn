function sortObjectKeys(value) {
  if (Array.isArray(value)) return value.map(sortObjectKeys);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .filter((key) => value[key] !== undefined)
      .map((key) => [key, sortObjectKeys(value[key])])
  );
}

export function canonicalJsonStringify(value) {
  return JSON.stringify(sortObjectKeys(value));
}
