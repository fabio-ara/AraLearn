import { buildScopedKey } from "../core/ids.js";

export function createMicrosequenceVersion({
  source = "llm",
  mode = "generate",
  userRequest = "",
  cards = [],
  summary = "",
  validationReport = { ok: true, issues: [] }
} = {}) {
  const timestamp = new Date().toISOString();
  return {
    key: buildScopedKey("version", `${mode}-${timestamp}`),
    createdAt: timestamp,
    source,
    mode,
    ...(userRequest ? { userRequest } : {}),
    cards: structuredClone(Array.isArray(cards) ? cards : []),
    summary: typeof summary === "string" ? summary.trim() : "",
    validationReport: structuredClone(validationReport || { ok: true, issues: [] })
  };
}

export function findMicrosequenceVersion(microsequence, versionKey) {
  return (Array.isArray(microsequence?.versions) ? microsequence.versions : []).find((version) => version?.key === versionKey) || null;
}

