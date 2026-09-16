export function normalizeEditorialOrigin(value) {
  if (value === "gpt") return "ai";
  if (![null, "human", "ai"].includes(value)) throw new TypeError("Origem editorial inválida.");
  return value;
}

export function normalizeEditorialInterventions(value) {
  if (!value || typeof value !== "object" || Array.isArray(value) ||
      !Number.isSafeInteger(value.human) || value.human < 0 ||
      !Number.isSafeInteger(value.ai) || value.ai < 0 || typeof value.historyComplete !== "boolean" ||
      Object.keys(value).some(key => !["human", "ai", "historyComplete", "lastOrigin", "actorId", "channel"].includes(key))) {
    throw new TypeError("Contagens editoriais inválidas.");
  }
  if (Object.hasOwn(value, "lastOrigin")) normalizeEditorialOrigin(value.lastOrigin);
  return { ...value, ...(Object.hasOwn(value, "lastOrigin") ? { lastOrigin: normalizeEditorialOrigin(value.lastOrigin) } : {}) };
}
