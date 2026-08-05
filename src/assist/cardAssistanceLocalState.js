export const CARD_ASSISTANCE_SYNC_MAX_PATHS = 64;
export const CARD_ASSISTANCE_LOCAL_STATE_CONTRACT =
  "aralearn.card-assistance-local-state.v4";
export const CARD_ASSISTANCE_UNDO_CONTRACT =
  "aralearn.contextual-authoring-undo.v1";

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeSelection(value = {}) {
  return Object.fromEntries(
    ["courseKey", "moduleKey", "lessonKey", "microsequenceKey", "cardKey"]
      .map((fieldName) => [fieldName, text(value[fieldName])])
  );
}

function normalizeSyncPath(value = {}) {
  const path = normalizeSelection(value);
  delete path.cardKey;
  return ["courseKey", "moduleKey", "lessonKey", "microsequenceKey"].every(
    (fieldName) => path[fieldName]
  ) ? path : null;
}

function normalizeExpectedRevision(value) {
  if (value === null || value === undefined || value === "") return null;
  const revision = text(value);
  if (!revision) throw new Error("O estado local não possui uma revisão válida.");
  return revision;
}

function requiredUndoPath(value = {}, fieldName) {
  const resolved = text(value[fieldName]);
  if (!resolved) throw new Error(`A reversão não possui ${fieldName}.`);
  return resolved;
}

export function normalizeCardAssistanceUndo(value = null) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  if (value.contract !== CARD_ASSISTANCE_UNDO_CONTRACT) {
    throw new Error("A reversão contextual não segue o contrato atual.");
  }
  const kind = text(value.kind);
  if (!new Set(["microsequence", "lesson"]).has(kind)) {
    throw new Error("A reversão contextual possui um recorte inválido.");
  }
  const normalized = {
    contract: CARD_ASSISTANCE_UNDO_CONTRACT,
    kind,
    courseKey: requiredUndoPath(value, "courseKey"),
    moduleKey: requiredUndoPath(value, "moduleKey"),
    lessonKey: requiredUndoPath(value, "lessonKey"),
    expectedRevision: normalizeExpectedRevision(value.expectedRevision)
  };
  const cardKey = text(value.cardKey);
  if (cardKey) normalized.cardKey = cardKey;
  if (kind === "microsequence") {
    normalized.microsequenceKey = requiredUndoPath(value, "microsequenceKey");
    if (!value.beforeMicrosequence || typeof value.beforeMicrosequence !== "object") {
      throw new Error("A reversão da microssequência não possui o conteúdo anterior.");
    }
    normalized.beforeMicrosequence = structuredClone(value.beforeMicrosequence);
  } else {
    const microsequenceKey = text(value.microsequenceKey);
    if (microsequenceKey) normalized.microsequenceKey = microsequenceKey;
    if (!value.beforeLesson || typeof value.beforeLesson !== "object") {
      throw new Error("A reversão da lição não possui o conteúdo anterior.");
    }
    normalized.beforeLesson = structuredClone(value.beforeLesson);
  }
  return normalized;
}

function normalizePendingPaths(values = []) {
  if (!Array.isArray(values)) return [];
  const pendingPaths = [...new Map(
    values
      .map(normalizeSyncPath)
      .filter(Boolean)
      .map((pathValue) => [Object.values(pathValue).join("\u0000"), pathValue])
  ).values()];
  if (pendingPaths.length > CARD_ASSISTANCE_SYNC_MAX_PATHS) {
    const error = new Error(
      `A alteração alcança mais de ${CARD_ASSISTANCE_SYNC_MAX_PATHS} microssequências e não pode ser sincronizada como um único comando.`
    );
    error.code = "card_assistance_sync_scope_too_large";
    throw error;
  }
  return pendingPaths;
}

export function normalizeCardAssistanceLocalState(value = {}) {
  const current = value?.contract === CARD_ASSISTANCE_LOCAL_STATE_CONTRACT
    ? value
    : {};
  return {
    contract: CARD_ASSISTANCE_LOCAL_STATE_CONTRACT,
    undo: normalizeCardAssistanceUndo(current.undo),
    sync: {
      pendingPaths: normalizePendingPaths(current.sync?.pendingPaths),
      expectedRevision: normalizeExpectedRevision(current.sync?.expectedRevision)
    }
  };
}

export function setCardAssistanceUndo(value = {}, undo = null) {
  const state = normalizeCardAssistanceLocalState(value);
  return {
    ...state,
    undo: normalizeCardAssistanceUndo(undo)
  };
}

export function markContextualAuthoringSyncPending(value = {}, selection = {}) {
  const state = normalizeCardAssistanceLocalState(value);
  const pending = normalizeSyncPath(selection);
  if (!pending) throw new Error("O reparo local não possui um caminho sincronizável.");
  const key = Object.values(pending).join("\u0000");
  const pendingPaths = [
    ...state.sync.pendingPaths.filter(
      (item) => Object.values(item).join("\u0000") !== key
    ),
    pending
  ];
  if (pendingPaths.length > CARD_ASSISTANCE_SYNC_MAX_PATHS) {
    const error = new Error(
      `A alteração alcança mais de ${CARD_ASSISTANCE_SYNC_MAX_PATHS} microssequências e precisa ser dividida.`
    );
    error.code = "card_assistance_sync_scope_too_large";
    throw error;
  }
  return {
    ...state,
    sync: {
      ...state.sync,
      pendingPaths
    }
  };
}

export function clearContextualAuthoringSync(value = {}) {
  const state = normalizeCardAssistanceLocalState(value);
  return {
    ...state,
    sync: { pendingPaths: [], expectedRevision: null }
  };
}
