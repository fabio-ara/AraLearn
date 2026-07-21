export function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

export function normalizeWhitespace(value) {
  return text(value).replace(/\s+/g, " ").trim();
}

export function normalizeLabel(value) {
  return normalizeWhitespace(value);
}

export function normalizeLabelToken(value) {
  return normalizeLabel(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

export function slugify(value) {
  return normalizeLabelToken(value)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

export function uniqueStrings(values = []) {
  const seen = new Set();
  const result = [];
  for (const value of Array.isArray(values) ? values : []) {
    const normalized = normalizeWhitespace(value);
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}
