export const CARD_ASSISTANCE_QUEUE_MAX_ITEMS = 8;
export const CARD_ASSISTANCE_QUEUE_MAX_PROMPT_CHARS = 4000;
export const CARD_ASSISTANCE_QUEUE_MAX_CARD_KEYS = 12;
export const CARD_ASSISTANCE_SYNC_MAX_PATHS = 12;

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeSelection(value = {}) {
  return Object.fromEntries(
    ["courseKey", "moduleKey", "lessonKey", "microsequenceKey", "cardKey"]
      .map((fieldName) => [fieldName, text(value[fieldName])])
  );
}

function normalizeQueueItem(value = {}) {
  const requestId = text(value.requestId);
  const promptText = text(value.promptText);
  const operation = value.operation === "create" ? "create" : "repair";
  const selection = normalizeSelection(value.selection);
  if (!requestId || !promptText || promptText.length > CARD_ASSISTANCE_QUEUE_MAX_PROMPT_CHARS) {
    throw new Error("O pedido offline é inválido ou excede o limite local.");
  }
  if (["courseKey", "moduleKey", "lessonKey", "microsequenceKey"].some(
    (fieldName) => !selection[fieldName]
  )) {
    throw new Error("O pedido offline não possui um contexto válido.");
  }
  const selectedCardKeys = [...new Set(
    (Array.isArray(value.selectedCardKeys) ? value.selectedCardKeys : [])
      .map(text)
      .filter(Boolean)
  )].slice(0, CARD_ASSISTANCE_QUEUE_MAX_CARD_KEYS);
  if (operation === "repair" && !selectedCardKeys.length) {
    throw new Error("O pedido offline não possui cards selecionados.");
  }
  return {
    requestId,
    createdAt: text(value.createdAt) || new Date().toISOString(),
    selection,
    operation,
    promptText,
    selectedCardKeys,
    repairScope: value.repairScope === "resources" ? "resources" : "card",
    resourceTargetIds: (Array.isArray(value.resourceTargetIds)
      ? value.resourceTargetIds
      : []).map(text).filter(Boolean).slice(0, 24),
    placement: text(value.placement) || "after_current"
  };
}

function normalizeSyncPath(value = {}) {
  const path = normalizeSelection(value);
  delete path.cardKey;
  return ["courseKey", "moduleKey", "lessonKey", "microsequenceKey"].every(
    (fieldName) => path[fieldName]
  ) ? path : null;
}

function normalizeReplacement(value = null) {
  const sourceCourseId = text(value?.sourceCourseId);
  const publishedCourseId = text(value?.publishedCourseId);
  return sourceCourseId && publishedCourseId
    ? { sourceCourseId, publishedCourseId }
    : null;
}

export function normalizeCardAssistanceLocalState(value = {}) {
  const queue = [];
  const seen = new Set();
  for (const rawItem of Array.isArray(value.queue) ? value.queue : []) {
    try {
      const item = normalizeQueueItem(rawItem);
      if (seen.has(item.requestId)) continue;
      seen.add(item.requestId);
      queue.push(item);
    } catch {
      // Entradas incompletas nunca se tornam chamadas de provider.
    }
  }
  return {
    contract: "aralearn.card-assistance-local-state.v2",
    queue: queue.slice(-CARD_ASSISTANCE_QUEUE_MAX_ITEMS),
    undo: value.undo?.contract === "aralearn.card-edit-undo.v1"
      ? structuredClone(value.undo)
      : null,
    sync: {
      pendingPaths: [...new Map(
        (Array.isArray(value.sync?.pendingPaths) ? value.sync.pendingPaths : [])
          .map(normalizeSyncPath)
          .filter(Boolean)
          .map((pathValue) => [Object.values(pathValue).join("\u0000"), pathValue])
      ).values()].slice(-CARD_ASSISTANCE_SYNC_MAX_PATHS),
      replacement: normalizeReplacement(value.sync?.replacement)
    }
  };
}

export function enqueueCardAssistanceRequest(value = {}, request = {}) {
  const state = normalizeCardAssistanceLocalState(value);
  const item = normalizeQueueItem(request);
  return {
    ...state,
    queue: [
      ...state.queue.filter((queued) => queued.requestId !== item.requestId),
      item
    ].slice(-CARD_ASSISTANCE_QUEUE_MAX_ITEMS)
  };
}

export function removeQueuedCardAssistanceRequest(value = {}, requestId = "") {
  const state = normalizeCardAssistanceLocalState(value);
  return {
    ...state,
    queue: state.queue.filter((item) => item.requestId !== text(requestId))
  };
}

export function setCardAssistanceUndo(value = {}, undo = null) {
  const state = normalizeCardAssistanceLocalState(value);
  return {
    ...state,
    undo: undo?.contract === "aralearn.card-edit-undo.v1"
      ? structuredClone(undo)
      : null
  };
}

export function markContextualAuthoringSyncPending(value = {}, selection = {}) {
  const state = normalizeCardAssistanceLocalState(value);
  const pending = normalizeSyncPath(selection);
  if (!pending) throw new Error("O reparo local não possui um caminho sincronizável.");
  const key = Object.values(pending).join("\u0000");
  return {
    ...state,
    sync: {
      ...state.sync,
      pendingPaths: [
        ...state.sync.pendingPaths.filter(
          (item) => Object.values(item).join("\u0000") !== key
        ),
        pending
      ].slice(-CARD_ASSISTANCE_SYNC_MAX_PATHS)
    }
  };
}

export function clearContextualAuthoringSync(value = {}) {
  const state = normalizeCardAssistanceLocalState(value);
  return {
    ...state,
    sync: { pendingPaths: [], replacement: null }
  };
}

export function setContextualAuthoringReplacement(value = {}, replacement = null) {
  const state = normalizeCardAssistanceLocalState(value);
  return {
    ...state,
    sync: {
      ...state.sync,
      replacement: normalizeReplacement(replacement)
    }
  };
}
