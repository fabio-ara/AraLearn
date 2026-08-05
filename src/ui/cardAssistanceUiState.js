import {
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
    selection.microsequenceKey,
    selection.cardKey
  ].map(text).join("::");
}

export function createCardAssistanceUiState(selection = {}) {
  const cardKey = text(selection.cardKey);
  return {
    referenceKey: referenceKey(selection),
    operation: "repair",
    repairScope: "resources",
    wholeCardSelected: false,
    resourceTargetIds: [],
    selectedCardKeys: cardKey ? [cardKey] : []
  };
}

export function reconcileCardAssistanceUiState(
  value = {},
  { selection = {}, card = null } = {}
) {
  const key = referenceKey(selection);
  if (text(value.referenceKey) && text(value.referenceKey) !== key) {
    return reconcileCardAssistanceUiState(createCardAssistanceUiState(selection), {
      selection,
      card
    });
  }
  const cardKey = text(card?.id || selection.cardKey);
  const wholeCardSelected = value.wholeCardSelected === true;
  const repairScope = wholeCardSelected ? "card" : "resources";
  const availableTargetIds = new Set(
    listCardResourceTargets(card).map((target) => target.targetId)
  );
  const resourceTargetIds = !wholeCardSelected
    ? [...new Set(
        (Array.isArray(value.resourceTargetIds) ? value.resourceTargetIds : [])
          .map(text)
          .filter((targetId) => availableTargetIds.has(targetId))
      )]
    : [];
  return {
    referenceKey: key,
    operation: "repair",
    repairScope,
    wholeCardSelected,
    resourceTargetIds,
    selectedCardKeys: cardKey ? [cardKey] : []
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
    repairScope: nextScope,
    wholeCardSelected: nextScope === "card",
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
  const available = listCardResourceTargets(context.card).map((target) => target.targetId);
  const requested = text(targetId);
  if (!available.includes(requested)) return normalized;
  const selected = new Set(normalized.resourceTargetIds);
  if (selected.has(requested)) selected.delete(requested);
  else selected.add(requested);
  return {
    ...normalized,
    wholeCardSelected: false,
    repairScope: "resources",
    resourceTargetIds: available.filter((id) => selected.has(id))
  };
}

export function toggleCardAssistanceWholeCard(value = {}, context = {}) {
  const normalized = reconcileCardAssistanceUiState(value, context);
  const wholeCardSelected = !normalized.wholeCardSelected;
  return {
    ...normalized,
    wholeCardSelected,
    repairScope: wholeCardSelected ? "card" : "resources",
    resourceTargetIds: []
  };
}

export function cardAssistanceSelectionIsReady(value = {}, context = {}) {
  const normalized = reconcileCardAssistanceUiState(value, context);
  if (!context.card || normalized.selectedCardKeys.length !== 1) return false;
  return normalized.wholeCardSelected || normalized.resourceTargetIds.length > 0;
}
