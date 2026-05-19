import { buildScopedKey } from "../core/ids.js";
import { normalizeLabel, normalizeLabelToken } from "../core/text.js";

export function createScopeTerm(label) {
  const safeLabel = normalizeLabel(label);
  const normalizedLabel = normalizeLabelToken(label);
  return {
    id: buildScopedKey("scope", safeLabel || normalizedLabel || "term"),
    label: safeLabel,
    normalizedLabel
  };
}

export function normalizeScopeTermLabel(label) {
  return normalizeLabelToken(label);
}

function toScopeTermValue(item) {
  if (item && typeof item === "object" && !Array.isArray(item)) {
    return {
      id: typeof item.id === "string" ? item.id.trim() : "",
      label: typeof item.label === "string" ? item.label : ""
    };
  }
  return {
    id: "",
    label: String(item || "")
  };
}

export function normalizeScopeTermList(labels = []) {
  const seen = new Set();
  const result = [];
  for (const rawValue of Array.isArray(labels) ? labels : []) {
    const input = toScopeTermValue(rawValue);
    const term = createScopeTerm(input.label);
    if (!term.label || !term.normalizedLabel || seen.has(term.normalizedLabel)) {
      continue;
    }
    seen.add(term.normalizedLabel);
    result.push({
      ...term,
      ...(input.id ? { id: input.id } : {})
    });
  }
  return result;
}
