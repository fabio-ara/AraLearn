function normalizeIndex(value, fallback = 0) {
  return Number.isInteger(value) ? value : fallback;
}

export function resolveIndexedTarget(items, requestedIndex, fallbackIndex = 0) {
  const entries = Array.isArray(items) ? items : [];
  if (!entries.length) {
    return { index: 0, item: null };
  }
  const normalizedFallback = Math.max(0, Math.min(normalizeIndex(fallbackIndex), entries.length - 1));
  const normalizedRequest = normalizeIndex(requestedIndex, normalizedFallback);
  const index = Math.max(0, Math.min(normalizedRequest, entries.length - 1));
  return {
    index,
    item: entries[index] || entries[normalizedFallback] || null
  };
}

export function createContinuePopupState(cardPathKey, blockKey) {
  const normalizedCardPathKey = String(cardPathKey || "").trim();
  const normalizedBlockKey = String(blockKey || "").trim();
  if (!normalizedCardPathKey || !normalizedBlockKey) {
    throw new Error("Identidade inválida para o popup de continuação.");
  }
  return {
    cardPathKey: normalizedCardPathKey,
    blockKey: normalizedBlockKey
  };
}

export function continuePopupMatches(popup, cardPathKey, blockKey) {
  return Boolean(
    popup &&
    popup.cardPathKey === String(cardPathKey || "").trim() &&
    popup.blockKey === String(blockKey || "").trim()
  );
}
