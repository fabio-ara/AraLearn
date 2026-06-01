import { parsePipeList } from "./slotParser.js";

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalize(value = "") {
  return text(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function tokenMatch(source = "", signal = "") {
  const signalTokens = normalize(signal).split(/[^a-z0-9_]+/u).filter((item) => item.length >= 2);
  if (!signalTokens.length) {
    return source.includes(normalize(signal));
  }
  return signalTokens.some((token) => source.includes(token));
}

function collectStrings(value, bucket = []) {
  if (typeof value === "string") {
    bucket.push(value);
    return bucket;
  }
  if (!value || typeof value !== "object") {
    return bucket;
  }
  if (Array.isArray(value)) {
    value.forEach((item) => collectStrings(item, bucket));
    return bucket;
  }
  Object.values(value).forEach((item) => collectStrings(item, bucket));
  return bucket;
}

export function buildScopePacket({
  guide = {},
  microsequence = {},
  userRequest = "",
  path = {},
  sources = []
} = {}) {
  return {
    guide: structuredClone(guide || {}),
    microsequence: structuredClone(microsequence || {}),
    userRequest: text(userRequest),
    path: structuredClone(path || {}),
    sources: Array.isArray(sources) ? structuredClone(sources) : []
  };
}

export function detectExcludedTerms(value, scopePacket = {}) {
  const excluded = Array.isArray(scopePacket?.guide?.exclude) ? scopePacket.guide.exclude : [];
  const source = normalize(collectStrings(value).join(" "));
  return excluded.filter((term) => {
    const token = normalize(term);
    return token && source.includes(token);
  });
}

export function validateTextAgainstScope(value, scopePacket = {}) {
  const excludedMatches = detectExcludedTerms(value, scopePacket);
  return {
    ok: excludedMatches.length === 0,
    excludedMatches
  };
}

export function validateCardScope(card = {}, scopePacket = {}) {
  const result = validateTextAgainstScope(card, scopePacket);
  return {
    ok: result.ok,
    errors: result.excludedMatches.map((term) => `Termo excluído encontrado: ${term}.`)
  };
}

export function validateCovers(cards = [], scopePacket = {}) {
  const includes = Array.isArray(scopePacket?.guide?.include) ? scopePacket.guide.include : [];
  const coverSignals = Array.isArray(scopePacket?.microsequence?.covers) ? scopePacket.microsequence.covers : [];
  const source = normalize(
    [
      scopePacket?.microsequence?.title,
      scopePacket?.microsequence?.goal,
      ...(Array.isArray(cards) ? cards : [])
    ]
      .flatMap((card) => collectStrings(card))
      .join(" ")
  );
  const missing = [...new Set([...includes, ...coverSignals])]
    .filter(Boolean)
    .filter((item) => !tokenMatch(source, item));
  return {
    ok: missing.length === 0,
    missing
  };
}

export function buildScopeErrors(scopeChecks = {}) {
  const errors = [];
  if (Array.isArray(scopeChecks.cardErrors)) {
    errors.push(...scopeChecks.cardErrors);
  }
  if (Array.isArray(scopeChecks.missingCovers) && scopeChecks.missingCovers.length) {
    errors.push(`Cobertura insuficiente: ${scopeChecks.missingCovers.join(", ")}.`);
  }
  return errors;
}
