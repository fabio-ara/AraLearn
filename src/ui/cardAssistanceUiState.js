import {
  CARD_CREATION_PLACEMENTS,
  CARD_REPAIR_SCOPES,
  listCardResourceTargets
} from "../assist/cardAssistanceScope.js";

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function referenceKey(selection = {}) {
  return [
    selection.courseKey,
    selection.moduleKey,
    selection.lessonKey,
    selection.microsequenceKey
  ].map(text).join("::");
}

function availableCardIds(cards = [], card = null) {
  const values = Array.isArray(cards) && cards.length ? cards : card ? [card] : [];
  return values.map((item) => text(item?.id)).filter(Boolean);
}

export function createCardAssistanceUiState(selection = {}) {
  const selectedCardKey = text(selection.cardKey);
  return {
    referenceKey: referenceKey(selection),
    operation: "repair",
    repairScope: "card",
    resourceTargetIds: [],
    selectedCardKeys: selectedCardKey ? [selectedCardKey] : [],
    placement: "after_current"
  };
}

export function reconcileCardAssistanceUiState(
  value = {},
  { selection = {}, card = null, cards = [] } = {}
) {
  const key = referenceKey(selection);
  if (text(value.referenceKey) && text(value.referenceKey) !== key) {
    return reconcileCardAssistanceUiState(
      createCardAssistanceUiState(selection),
      { selection, card }
    );
  }
  const operation = value.operation === "create" ? "create" : "repair";
  const repairScope = CARD_REPAIR_SCOPES.includes(value.repairScope)
    ? value.repairScope
    : "card";
  const availableIds = new Set(
    listCardResourceTargets(card).map((target) => target.targetId)
  );
  const availableCards = availableCardIds(cards, card);
  const availableCardSet = new Set(availableCards);
  const hasExplicitCardSelection = Array.isArray(value.selectedCardKeys);
  const requestedCardKeys = (hasExplicitCardSelection
    ? value.selectedCardKeys
    : [])
    .map(text)
    .filter((cardKey) => availableCardSet.has(cardKey));
  const selectedCardKeys = [...new Set(requestedCardKeys)];
  const activeCardKey = text(card?.id || selection.cardKey);
  if (!hasExplicitCardSelection && activeCardKey && availableCardSet.has(activeCardKey)) {
    selectedCardKeys.push(activeCardKey);
  }
  const multipleCards = selectedCardKeys.length > 1;
  const resourceTargetIds = [...new Set(
    (Array.isArray(value.resourceTargetIds) ? value.resourceTargetIds : [])
      .map(text)
      .filter((targetId) => availableIds.has(targetId))
  )];
  const requestedPlacement = CARD_CREATION_PLACEMENTS.includes(value.placement)
    ? value.placement
    : "after_current";
  const placement = !card && ["before_current", "after_current"].includes(requestedPlacement)
    ? "end_current"
    : requestedPlacement;
  return {
    referenceKey: key,
    operation: card || operation === "create" ? operation : "create",
    repairScope: multipleCards ? "card" : repairScope,
    resourceTargetIds: !multipleCards && repairScope === "resources" ? resourceTargetIds : [],
    selectedCardKeys,
    placement
  };
}

export function selectCardAssistanceOperation(
  value = {},
  context = {},
  operation = "repair"
) {
  const normalized = reconcileCardAssistanceUiState(value, context);
  return {
    ...normalized,
    operation: operation === "create" || !context.card ? "create" : "repair"
  };
}

export function selectCardRepairScope(
  value = {},
  context = {},
  repairScope = "card"
) {
  const normalized = reconcileCardAssistanceUiState(value, context);
  const nextScope = CARD_REPAIR_SCOPES.includes(repairScope) ? repairScope : "card";
  return {
    ...normalized,
    operation: context.card ? "repair" : "create",
    repairScope: nextScope,
    resourceTargetIds: nextScope === "resources"
      ? normalized.resourceTargetIds
      : []
  };
}

export function toggleCardAssistanceResource(
  value = {},
  context = {},
  targetId = ""
) {
  const normalized = selectCardRepairScope(value, context, "resources");
  const available = new Set(
    listCardResourceTargets(context.card).map((target) => target.targetId)
  );
  const requested = text(targetId);
  if (!available.has(requested)) return normalized;
  const selected = new Set(normalized.resourceTargetIds);
  if (selected.has(requested)) selected.delete(requested);
  else selected.add(requested);
  return {
    ...normalized,
    resourceTargetIds: [...available].filter((id) => selected.has(id))
  };
}

export function toggleCardAssistanceCard(
  value = {},
  context = {},
  cardKey = ""
) {
  const normalized = reconcileCardAssistanceUiState(value, context);
  const available = new Set(availableCardIds(context.cards, context.card));
  const requested = text(cardKey);
  if (!available.has(requested)) return normalized;
  const selected = new Set(normalized.selectedCardKeys);
  if (selected.has(requested)) selected.delete(requested);
  else selected.add(requested);
  const selectedCardKeys = [...available].filter((id) => selected.has(id));
  return {
    ...normalized,
    operation: "repair",
    repairScope: selectedCardKeys.length > 1 ? "card" : normalized.repairScope,
    resourceTargetIds: selectedCardKeys.length > 1 ? [] : normalized.resourceTargetIds,
    selectedCardKeys
  };
}

export function selectCardCreationPlacement(
  value = {},
  context = {},
  placement = "after_current"
) {
  const normalized = reconcileCardAssistanceUiState(value, context);
  return {
    ...normalized,
    operation: "create",
    placement: CARD_CREATION_PLACEMENTS.includes(placement)
      ? placement
      : "after_current"
  };
}

export function cardAssistanceSelectionIsReady(value = {}, context = {}) {
  const normalized = reconcileCardAssistanceUiState(value, context);
  if (normalized.operation === "create") return true;
  if (!context.card) return false;
  if (!normalized.selectedCardKeys.length) return false;
  if (normalized.selectedCardKeys.length > 1) return normalized.repairScope === "card";
  return normalized.repairScope === "card" || normalized.resourceTargetIds.length > 0;
}

export function cardAssistancePreviewMatchesSelection(preview = null, selection = {}) {
  const saved = preview?.selection || preview?.snapshot?.selection;
  if (!saved) return false;
  return ["courseKey", "moduleKey", "lessonKey", "microsequenceKey"].every(
    (fieldName) => text(saved[fieldName]) === text(selection[fieldName])
  );
}
