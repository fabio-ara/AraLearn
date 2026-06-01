import { buildScopedKey } from "../core/ids.js";

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeCardToken(card, index = 0) {
  return text(card?.id) || `card-${Number(card?.position) || index + 1}`;
}

function ensureUniqueCardIds(cards = []) {
  const seen = new Set();
  return (Array.isArray(cards) ? cards : []).map((card, index) => {
    const baseId = normalizeCardToken(card, index);
    let nextId = baseId;
    let counter = 2;
    while (seen.has(nextId)) {
      nextId = `${baseId}-${counter}`;
      counter += 1;
    }
    seen.add(nextId);
    return {
      ...structuredClone(card),
      id: nextId
    };
  });
}

export function createMicrosequenceVersion({
  source = "llm",
  action = "generate",
  request = "",
  cards = [],
  summary = "",
  validation = { ok: true, issues: [] }
} = {}) {
  const timestamp = new Date().toISOString();
  return {
    id: buildScopedKey("version", `${action}-${timestamp}`),
    createdAt: timestamp,
    source,
    action,
    request,
    cards: ensureUniqueCardIds(cards),
    summary: typeof summary === "string" ? summary.trim() : "",
    validation: structuredClone(validation || { ok: true, issues: [] })
  };
}

export function findMicrosequenceVersion(microsequence, versionId) {
  return (Array.isArray(microsequence?.versions) ? microsequence.versions : []).find((version) => version?.id === versionId) || null;
}
