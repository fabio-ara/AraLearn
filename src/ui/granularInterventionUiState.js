const SCOPE_MODES = new Set(["microsequence", "card", "blocks"]);

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function blockIndexes(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value
    .map((item) => Number(item))
    .filter((item) => Number.isInteger(item) && item >= 0))]
    .sort((left, right) => left - right);
}

export function createGranularAssistScope() {
  return {
    mode: "microsequence",
    cardKey: "",
    blockIndexes: []
  };
}

export function reconcileGranularAssistScope(scope = {}, card = null) {
  const cardKey = text(card?.id);
  const mode = SCOPE_MODES.has(text(scope?.mode)) ? text(scope.mode) : "microsequence";
  if (!cardKey) return createGranularAssistScope();

  const isSameCard = !text(scope?.cardKey) || text(scope.cardKey) === cardKey;
  if (!isSameCard) {
    return {
      ...createGranularAssistScope(),
      cardKey
    };
  }

  const blocks = card?.resource === "composite" && Array.isArray(card.blocks)
    ? card.blocks
    : [];
  const selected = blockIndexes(scope?.blockIndexes)
    .filter((blockIndex) => blockIndex < blocks.length);
  const normalizedMode = mode === "blocks" && !blocks.length ? "card" : mode;

  return {
    mode: normalizedMode,
    cardKey,
    blockIndexes: normalizedMode === "blocks" ? selected : []
  };
}

export function selectGranularAssistScope(scope = {}, card = null, mode = "microsequence") {
  const normalized = reconcileGranularAssistScope(scope, card);
  const requestedMode = SCOPE_MODES.has(text(mode)) ? text(mode) : "microsequence";
  if (requestedMode === "blocks" && (
    card?.resource !== "composite" || !Array.isArray(card?.blocks) || !card.blocks.length
  )) {
    return normalized;
  }
  return {
    ...normalized,
    mode: requestedMode,
    blockIndexes: requestedMode === "blocks" ? normalized.blockIndexes : []
  };
}

export function toggleGranularAssistBlock(scope = {}, card = null, blockIndex) {
  const normalized = selectGranularAssistScope(scope, card, "blocks");
  const index = Number(blockIndex);
  if (!Number.isInteger(index) || index < 0 || index >= (card?.blocks?.length || 0)) {
    return normalized;
  }
  const selected = new Set(normalized.blockIndexes);
  if (selected.has(index)) selected.delete(index);
  else selected.add(index);
  return {
    ...normalized,
    blockIndexes: [...selected].sort((left, right) => left - right)
  };
}

export function buildGranularTargetFromAssistScope(scope = {}, card = null) {
  const normalized = reconcileGranularAssistScope(scope, card);
  if (normalized.mode === "microsequence") return null;
  if (!normalized.cardKey) return null;
  if (normalized.mode === "card") {
    return {
      level: "card",
      cardKey: normalized.cardKey
    };
  }
  if (!normalized.blockIndexes.length) return null;
  return {
    level: "blocks",
    cardKey: normalized.cardKey,
    blockIndexes: normalized.blockIndexes
  };
}

export function granularAssistScopeIsReady(scope = {}, card = null) {
  const normalized = reconcileGranularAssistScope(scope, card);
  return normalized.mode === "microsequence" || Boolean(
    buildGranularTargetFromAssistScope(normalized, card)
  );
}

export function granularPreviewMatchesSelection(preview = null, selection = {}) {
  if (!preview?.scopeSnapshot?.selection || !preview?.scopeSnapshot?.target) return false;
  const savedSelection = preview.scopeSnapshot.selection;
  return ["courseKey", "moduleKey", "lessonKey", "microsequenceKey"].every(
    (fieldName) => text(savedSelection[fieldName]) === text(selection?.[fieldName])
  ) && text(preview.scopeSnapshot.target.cardKey) === text(selection?.cardKey);
}
