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
    selection.microsequenceKey,
    selection.cardKey
  ].map(text).join("::");
}

export function createCardAssistanceUiState(selection = {}) {
  return {
    referenceKey: referenceKey(selection),
    operation: "repair",
    repairScope: "card",
    resourceTargetIds: [],
    placement: "after_current"
  };
}

export function reconcileCardAssistanceUiState(
  value = {},
  { selection = {}, card = null } = {}
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
    repairScope,
    resourceTargetIds: repairScope === "resources" ? resourceTargetIds : [],
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
  return normalized.repairScope === "card" || normalized.resourceTargetIds.length > 0;
}

export function cardAssistancePreviewMatchesSelection(preview = null, selection = {}) {
  const saved = preview?.snapshot?.selection;
  if (!saved) return false;
  return ["courseKey", "moduleKey", "lessonKey", "microsequenceKey", "cardKey"].every(
    (fieldName) => text(saved[fieldName]) === text(selection[fieldName])
  );
}
