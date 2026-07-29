import { GRANULAR_MUTATION_INTENTS } from "../assist/interventionScopeGuard.js";

const SCOPE_MODES = new Set(["microsequence", "card", "blocks"]);

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function blockIds(value, card) {
  if (!Array.isArray(value)) return [];
  const order = new Map(
    (Array.isArray(card?.blocks) ? card.blocks : [])
      .map((block, index) => [text(block?.id), index])
      .filter(([id]) => id)
  );
  return [...new Set(value.map(text).filter((id) => order.has(id)))]
    .sort((left, right) => order.get(left) - order.get(right));
}

function mutationIntent(value) {
  const normalized = text(value);
  return GRANULAR_MUTATION_INTENTS.includes(normalized)
    ? normalized
    : "rewrite_content";
}

export function createGranularAssistScope() {
  return {
    mode: "microsequence",
    cardKey: "",
    blockIds: [],
    intent: "rewrite_content"
  };
}

export function reconcileGranularAssistScope(scope = {}, card = null) {
  const cardKey = text(card?.id);
  const mode = SCOPE_MODES.has(text(scope?.mode)) ? text(scope.mode) : "microsequence";
  if (!cardKey) return createGranularAssistScope();
  if (text(scope?.cardKey) && text(scope.cardKey) !== cardKey) {
    return {
      ...createGranularAssistScope(),
      cardKey
    };
  }
  const blocks = card?.resource === "composite" && Array.isArray(card.blocks)
    ? card.blocks
    : [];
  const normalizedMode = mode === "blocks" && !blocks.length ? "card" : mode;
  const intent = mutationIntent(scope?.intent);
  return {
    mode: normalizedMode,
    cardKey,
    blockIds: normalizedMode === "blocks" ? blockIds(scope?.blockIds, card) : [],
    intent: normalizedMode === "blocks" && intent === "rebuild_card"
      ? "rewrite_content"
      : intent
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
    blockIds: requestedMode === "blocks" ? normalized.blockIds : [],
    intent: requestedMode === "blocks" && normalized.intent === "rebuild_card"
      ? "rewrite_content"
      : normalized.intent
  };
}

export function selectGranularMutationIntent(scope = {}, card = null, intent = "rewrite_content") {
  const normalized = reconcileGranularAssistScope(scope, card);
  const nextIntent = mutationIntent(intent);
  if (normalized.mode === "blocks" && nextIntent === "rebuild_card") {
    return normalized;
  }
  return { ...normalized, intent: nextIntent };
}

export function toggleGranularAssistBlock(scope = {}, card = null, blockReference) {
  const normalized = selectGranularAssistScope(scope, card, "blocks");
  const blocks = Array.isArray(card?.blocks) ? card.blocks : [];
  const targetId = Number.isInteger(Number(blockReference))
    ? text(blocks[Number(blockReference)]?.id)
    : text(blockReference);
  if (!targetId || !blocks.some((block) => text(block?.id) === targetId)) {
    return normalized;
  }
  const selected = new Set(normalized.blockIds);
  if (selected.has(targetId)) selected.delete(targetId);
  else selected.add(targetId);
  return {
    ...normalized,
    blockIds: blockIds([...selected], card)
  };
}

export function buildGranularTargetFromAssistScope(scope = {}, card = null) {
  const normalized = reconcileGranularAssistScope(scope, card);
  if (normalized.mode === "microsequence" || !normalized.cardKey) return null;
  if (normalized.mode === "card") {
    return {
      level: "card",
      cardKey: normalized.cardKey,
      intent: normalized.intent
    };
  }
  if (!normalized.blockIds.length) return null;
  return {
    level: "blocks",
    cardKey: normalized.cardKey,
    blockIds: normalized.blockIds,
    intent: normalized.intent
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
