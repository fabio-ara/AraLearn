const LEVELS = new Set(["card", "microsequence", "lesson"]);

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeLevel(value) {
  return LEVELS.has(value) ? value : "card";
}

function referenceKey(level, selection = {}) {
  const parts = [
    text(selection.courseKey),
    text(selection.moduleKey),
    text(selection.lessonKey)
  ];
  if (level !== "lesson") parts.push(text(selection.microsequenceKey));
  if (level === "card") parts.push(text(selection.cardKey));
  return [level, ...parts].join("::");
}

function exactIds(values = []) {
  return [...new Set(
    (Array.isArray(values) ? values : [])
      .map(text)
      .filter(Boolean)
  )];
}

function orderedSelection(selectedIds = [], availableIds = []) {
  const selected = new Set(exactIds(selectedIds));
  return exactIds(availableIds).filter((itemId) => selected.has(itemId));
}

function allItemsSelected(level, selectedIds, availableIds) {
  return level !== "card"
    && availableIds.length > 0
    && selectedIds.length === availableIds.length;
}

function normalizeState(value = {}, context = {}) {
  const level = normalizeLevel(context.level || value.level);
  const availableIds = exactIds(context.itemIds);
  const nextReferenceKey = referenceKey(level, context.selection);
  const sameReference = text(value.referenceKey) === nextReferenceKey;
  const requestedKind = sameReference && ["none", "items", "container"].includes(value.kind)
    ? value.kind
    : "none";
  const selectedIds = requestedKind === "container"
    ? [...availableIds]
    : orderedSelection(sameReference ? value.selectedIds : [], availableIds);
  const promoted = requestedKind === "items"
    && allItemsSelected(level, selectedIds, availableIds);
  return {
    contract: "aralearn.bottom-up-assistance-ui.v1",
    level,
    referenceKey: nextReferenceKey,
    containerId: text(context.containerId),
    availableIds,
    kind: promoted ? "container" : requestedKind,
    selectionSource: promoted ? "promoted" : requestedKind === "none" ? "none" : "explicit",
    selectedIds: promoted ? [...availableIds] : selectedIds
  };
}

export function createBottomUpAssistanceUiState(context = {}) {
  return normalizeState({}, context);
}

export function reconcileBottomUpAssistanceUiState(value = {}, context = {}) {
  return normalizeState(value, context);
}

export function toggleBottomUpAssistanceContainer(value = {}, context = {}) {
  const current = normalizeState(value, context);
  if (current.kind === "container") {
    return {
      ...current,
      kind: "none",
      selectionSource: "none",
      selectedIds: []
    };
  }
  return {
    ...current,
    kind: "container",
    selectionSource: "explicit",
    selectedIds: [...current.availableIds]
  };
}

export function toggleBottomUpAssistanceItem(value = {}, context = {}, itemId = "") {
  const current = normalizeState(value, context);
  const targetId = text(itemId);
  if (!targetId || !current.availableIds.includes(targetId)) return current;

  const selected = current.kind === "container"
    ? new Set(current.availableIds)
    : new Set(current.selectedIds);
  if (selected.has(targetId)) selected.delete(targetId);
  else selected.add(targetId);
  const selectedIds = current.availableIds.filter((id) => selected.has(id));
  if (!selectedIds.length) {
    return {
      ...current,
      kind: "none",
      selectionSource: "none",
      selectedIds: []
    };
  }
  if (allItemsSelected(current.level, selectedIds, current.availableIds)) {
    return {
      ...current,
      kind: "container",
      selectionSource: "promoted",
      selectedIds: [...current.availableIds]
    };
  }
  return {
    ...current,
    kind: "items",
    selectionSource: "explicit",
    selectedIds
  };
}

export function bottomUpAssistanceUiSelectionIsReady(value = {}, context = {}) {
  const state = normalizeState(value, context);
  return state.kind === "container" || (state.kind === "items" && state.selectedIds.length > 0);
}

export function bottomUpAssistanceScopeInput(value = {}, context = {}) {
  const state = normalizeState(value, context);
  if (!bottomUpAssistanceUiSelectionIsReady(state, context)) return null;
  return {
    level: state.level,
    kind: state.kind,
    targetIds: state.kind === "container" ? [] : [...state.selectedIds]
  };
}
