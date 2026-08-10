export const CARD_ASSISTANCE_SYNC_MAX_PATHS = 64;
export const CONTEXTUAL_AUTHORING_SYNC_MAX_METADATA = 64;
export const CARD_ASSISTANCE_LOCAL_STATE_CONTRACT =
  "aralearn.card-assistance-local-state.v4";
export const CARD_ASSISTANCE_UNDO_CONTRACT =
  "aralearn.contextual-authoring-undo.v2";

const INVERSE_PATCH_MAX_DEPTH = 48;
const INVERSE_PATCH_MAX_NODES = 20_000;

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
  if (!["courseKey", "moduleKey", "lessonKey", "microsequenceKey"].every(
    (fieldName) => path[fieldName]
  )) return null;
  if (Object.hasOwn(value, "baseCards")) {
    if (!Array.isArray(value.baseCards) || value.baseCards.length > 500) {
      throw new Error("A base de cards da sincronização contextual é inválida.");
    }
    const ids = value.baseCards.map((card) => text(card?.id));
    if (ids.some((id) => !id) || new Set(ids).size !== ids.length) {
      throw new Error("A base de cards da sincronização contextual possui identidades inválidas.");
    }
    path.baseCards = structuredClone(value.baseCards);
  }
  if (Object.hasOwn(value, "baseMetadata")) {
    if (!isRecord(value.baseMetadata)) {
      throw new Error("A base de metadados da sincronização contextual é inválida.");
    }
    path.baseMetadata = structuredClone(value.baseMetadata);
  }
  if (Object.hasOwn(value, "basePosition")) {
    const position = Number(value.basePosition);
    if (!Number.isSafeInteger(position) || position < 0) {
      throw new Error("A posição-base da sincronização contextual é inválida.");
    }
    path.basePosition = position;
  }
  if (value.textOnly === true) path.textOnly = true;
  return path;
}

function syncPathKey(value = {}) {
  return ["courseKey", "moduleKey", "lessonKey", "microsequenceKey"]
    .map((fieldName) => text(value[fieldName]))
    .join("\u0000");
}

function normalizePendingMetadataEntry(value = {}) {
  const entityType = text(value.entityType);
  const expectedPathLength = {
    course: 1,
    module: 2,
    lesson: 3,
    microsequence: 4
  }[entityType];
  const entityPath = Array.isArray(value.entityPath)
    ? value.entityPath.map(text)
    : [];
  const allowedFields = new Set(["title", "goal"]);
  const hasMetadataRecords = isRecord(value.baseMetadata) && isRecord(value.metadata);
  const baseFields = hasMetadataRecords ? Object.keys(value.baseMetadata) : [];
  const nextFields = hasMetadataRecords ? Object.keys(value.metadata) : [];
  if (!expectedPathLength || entityPath.length !== expectedPathLength || entityPath.some((id) => !id) ||
      !hasMetadataRecords ||
      baseFields.length !== nextFields.length ||
      baseFields.some((field) => !allowedFields.has(field) || !nextFields.includes(field))) return null;
  return {
    entityType,
    entityPath,
    baseMetadata: structuredClone(value.baseMetadata),
    metadata: structuredClone(value.metadata)
  };
}

function metadataEntryKey(value = {}) {
  return `${text(value.entityType)}\u0000${(value.entityPath || []).map(text).join("\u0000")}`;
}

function normalizePendingMetadata(values = []) {
  if (!Array.isArray(values)) return [];
  const entries = [...new Map(values
    .map(normalizePendingMetadataEntry)
    .filter(Boolean)
    .map((entry) => [metadataEntryKey(entry), entry])).values()];
  if (entries.length > CONTEXTUAL_AUTHORING_SYNC_MAX_METADATA) {
    throw new Error(
      `A alteração alcança mais de ${CONTEXTUAL_AUTHORING_SYNC_MAX_METADATA} rótulos e precisa ser dividida.`
    );
  }
  return entries;
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

function isRecord(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function entityArrayIds(value) {
  if (!Array.isArray(value)) return null;
  const ids = value.map((item) => isRecord(item) ? text(item.id) : "");
  return ids.every(Boolean) && new Set(ids).size === ids.length ? ids : null;
}

function sameScalar(left, right) {
  return Object.is(left, right);
}

function buildInversePatch(before, after, depth = 0) {
  if (depth > INVERSE_PATCH_MAX_DEPTH) {
    return { type: "replace", value: structuredClone(before) };
  }
  if (sameScalar(before, after)) return null;
  if (Array.isArray(before) && Array.isArray(after)) {
    const beforeIds = entityArrayIds(before);
    const afterIds = entityArrayIds(after);
    if (beforeIds && afterIds) {
      const beforeById = new Map(before.map((item) => [text(item.id), item]));
      const afterById = new Map(after.map((item) => [text(item.id), item]));
      const createdIds = afterIds.filter((id) => !beforeById.has(id));
      const removedItems = beforeIds
        .filter((id) => !afterById.has(id))
        .map((id) => structuredClone(beforeById.get(id)));
      const changes = beforeIds
        .filter((id) => afterById.has(id))
        .map((id) => ({
          id,
          patch: buildInversePatch(beforeById.get(id), afterById.get(id), depth + 1)
        }))
        .filter((entry) => entry.patch);
      const orderChanged = beforeIds.length !== afterIds.length ||
        beforeIds.some((id, index) => afterIds[index] !== id);
      if (!createdIds.length && !removedItems.length && !changes.length && !orderChanged) {
        return null;
      }
      return Object.fromEntries(Object.entries({
        type: "id-array",
        createdIds,
        removedItems,
        changes,
        beforeOrder: orderChanged ? beforeIds : undefined
      }).filter(([, value]) => value !== undefined));
    }
    return { type: "replace", value: structuredClone(before) };
  }
  if (isRecord(before) && isRecord(after)) {
    const fields = {};
    for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
      if (!Object.hasOwn(before, key)) {
        fields[key] = { type: "remove" };
        continue;
      }
      if (!Object.hasOwn(after, key)) {
        fields[key] = { type: "replace", value: structuredClone(before[key]) };
        continue;
      }
      const patch = buildInversePatch(before[key], after[key], depth + 1);
      if (patch) fields[key] = patch;
    }
    return Object.keys(fields).length ? { type: "object", fields } : null;
  }
  return { type: "replace", value: structuredClone(before) };
}

function normalizeInversePatch(value, state = { nodes: 0 }, depth = 0) {
  if (!isRecord(value) || depth > INVERSE_PATCH_MAX_DEPTH) {
    throw new Error("A reversão contextual possui uma alteração inversa inválida.");
  }
  state.nodes += 1;
  if (state.nodes > INVERSE_PATCH_MAX_NODES) {
    throw new Error("A reversão contextual excede o tamanho estrutural permitido.");
  }
  if (value.type === "remove") return { type: "remove" };
  if (value.type === "replace") {
    if (!Object.hasOwn(value, "value")) {
      throw new Error("A reversão contextual não informa o valor anterior.");
    }
    return { type: "replace", value: structuredClone(value.value) };
  }
  if (value.type === "object") {
    if (!isRecord(value.fields)) {
      throw new Error("A reversão contextual não possui campos válidos.");
    }
    return {
      type: "object",
      fields: Object.fromEntries(Object.entries(value.fields).map(([key, patch]) => [
        key,
        normalizeInversePatch(patch, state, depth + 1)
      ]))
    };
  }
  if (value.type === "id-array") {
    const createdIds = Array.isArray(value.createdIds) ? value.createdIds.map(text) : [];
    const removedItems = Array.isArray(value.removedItems)
      ? value.removedItems.map((item) => structuredClone(item))
      : [];
    const changes = Array.isArray(value.changes)
      ? value.changes.map((entry) => ({
        id: text(entry?.id),
        patch: normalizeInversePatch(entry?.patch, state, depth + 1)
      }))
      : [];
    const beforeOrder = value.beforeOrder === undefined
      ? undefined
      : Array.isArray(value.beforeOrder) ? value.beforeOrder.map(text) : null;
    const allIds = [
      ...createdIds,
      ...removedItems.map((item) => text(item?.id)),
      ...changes.map((entry) => entry.id),
      ...(beforeOrder || [])
    ];
    if (
      allIds.some((id) => !id) ||
      new Set(createdIds).size !== createdIds.length ||
      beforeOrder === null ||
      (beforeOrder && new Set(beforeOrder).size !== beforeOrder.length)
    ) {
      throw new Error("A reversão contextual possui identidades inválidas.");
    }
    return Object.fromEntries(Object.entries({
      type: "id-array",
      createdIds,
      removedItems,
      changes,
      beforeOrder
    }).filter(([, entry]) => entry !== undefined));
  }
  throw new Error("A reversão contextual possui um tipo de alteração inválido.");
}

function applyInversePatch(current, patch) {
  if (patch.type === "replace") return structuredClone(patch.value);
  if (patch.type === "object") {
    if (!isRecord(current)) {
      throw new Error("O conteúdo atual não corresponde à reversão contextual.");
    }
    const restored = structuredClone(current);
    for (const [key, fieldPatch] of Object.entries(patch.fields)) {
      if (fieldPatch.type === "remove") delete restored[key];
      else restored[key] = applyInversePatch(restored[key], fieldPatch);
    }
    return restored;
  }
  if (patch.type === "id-array") {
    const currentIds = entityArrayIds(current);
    if (!currentIds) {
      throw new Error("A coleção atual não corresponde à reversão contextual.");
    }
    const byId = new Map(current.map((item) => [text(item.id), structuredClone(item)]));
    patch.createdIds.forEach((id) => byId.delete(id));
    patch.removedItems.forEach((item) => byId.set(text(item.id), structuredClone(item)));
    patch.changes.forEach(({ id, patch: itemPatch }) => {
      if (!byId.has(id)) {
        throw new Error("Um item alterado não existe mais para ser desfeito.");
      }
      byId.set(id, applyInversePatch(byId.get(id), itemPatch));
    });
    if (patch.beforeOrder) {
      if (patch.beforeOrder.some((id) => !byId.has(id))) {
        throw new Error("A ordem anterior não pode ser restaurada.");
      }
      const restoredIds = [...patch.beforeOrder];
      const restoredIdSet = new Set(restoredIds);
      currentIds.forEach((id) => {
        if (byId.has(id) && !restoredIdSet.has(id)) {
          restoredIds.push(id);
          restoredIdSet.add(id);
        }
      });
      byId.keys().forEach((id) => {
        if (!restoredIdSet.has(id)) restoredIds.push(id);
      });
      return restoredIds.map((id) => byId.get(id));
    }
    return currentIds.filter((id) => byId.has(id)).map((id) => byId.get(id));
  }
  throw new Error("A reversão contextual não pode ser aplicada.");
}

export function createContextualAuthoringInversePatch(before, after) {
  const patch = buildInversePatch(before, after);
  if (!patch) throw new Error("Não existe alteração contextual para desfazer.");
  return normalizeInversePatch(patch);
}

export function applyContextualAuthoringInversePatch(current, inversePatch) {
  return applyInversePatch(current, normalizeInversePatch(inversePatch));
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
  if (!Array.isArray(value.affectedMicrosequenceIds) || !value.affectedMicrosequenceIds.length) {
    throw new Error("A reversão contextual não informa as microssequências afetadas.");
  }
  normalized.affectedMicrosequenceIds = [...new Set(
    value.affectedMicrosequenceIds.map(text).filter(Boolean)
  )];
  if (!normalized.affectedMicrosequenceIds.length) {
    throw new Error("A reversão contextual não informa as microssequências afetadas.");
  }
  normalized.inversePatch = normalizeInversePatch(value.inversePatch);
  if (kind === "microsequence") {
    normalized.microsequenceKey = requiredUndoPath(value, "microsequenceKey");
  } else {
    const microsequenceKey = text(value.microsequenceKey);
    if (microsequenceKey) normalized.microsequenceKey = microsequenceKey;
  }
  return normalized;
}

function normalizePendingPaths(values = []) {
  if (!Array.isArray(values)) return [];
  const pendingPaths = [...new Map(
    values
      .map(normalizeSyncPath)
      .filter(Boolean)
      .map((pathValue) => [syncPathKey(pathValue), pathValue])
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
  const sync = {
    pendingPaths: normalizePendingPaths(current.sync?.pendingPaths),
    pendingMetadata: normalizePendingMetadata(current.sync?.pendingMetadata),
    expectedRevision: normalizeExpectedRevision(current.sync?.expectedRevision)
  };
  if (["pending", "conflict"].includes(current.sync?.status)) {
    sync.status = current.sync.status;
    sync.errorMessage = text(current.sync.errorMessage);
  }
  return {
    contract: CARD_ASSISTANCE_LOCAL_STATE_CONTRACT,
    undo: normalizeCardAssistanceUndo(current.undo),
    sync
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
  const key = syncPathKey(pending);
  const current = state.sync.pendingPaths.find((item) => syncPathKey(item) === key) || null;
  const combined = current
    ? normalizeSyncPath({
        ...pending,
        textOnly: current.textOnly === true && pending.textOnly === true,
        ...(current.baseCards ? { baseCards: current.baseCards } : {}),
        ...(current.baseMetadata ? { baseMetadata: current.baseMetadata } : {}),
        ...(Number.isSafeInteger(current.basePosition)
          ? { basePosition: current.basePosition }
          : {})
      })
    : pending;
  const pendingPaths = [
    ...state.sync.pendingPaths.filter(
      (item) => syncPathKey(item) !== key
    ),
    combined
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
      pendingPaths,
      status: "pending",
      errorMessage: ""
    }
  };
}

export function markContextualAuthoringMetadataPending(value = {}, operation = {}) {
  const state = normalizeCardAssistanceLocalState(value);
  const pending = normalizePendingMetadataEntry(operation);
  if (!pending) throw new Error("A edição de metadados não possui um alvo sincronizável.");
  const key = metadataEntryKey(pending);
  const current = state.sync.pendingMetadata.find(
    (item) => metadataEntryKey(item) === key
  ) || null;
  const pendingMetadata = [
    ...state.sync.pendingMetadata.filter((item) => metadataEntryKey(item) !== key),
    current
      ? { ...pending, baseMetadata: structuredClone(current.baseMetadata) }
      : pending
  ];
  if (pendingMetadata.length > CONTEXTUAL_AUTHORING_SYNC_MAX_METADATA) {
    throw new Error(
      `A alteração alcança mais de ${CONTEXTUAL_AUTHORING_SYNC_MAX_METADATA} rótulos e precisa ser dividida.`
    );
  }
  return {
    ...state,
    sync: {
      ...state.sync,
      pendingMetadata,
      status: "pending",
      errorMessage: ""
    }
  };
}

export function setContextualAuthoringSyncStatus(value = {}, {
  status = "pending",
  errorMessage = ""
} = {}) {
  const state = normalizeCardAssistanceLocalState(value);
  if (!["pending", "conflict"].includes(status)) {
    throw new Error("O estado da sincronização contextual é inválido.");
  }
  if (!state.sync.pendingPaths.length && !state.sync.pendingMetadata.length) {
    return clearContextualAuthoringSync(state);
  }
  return {
    ...state,
    sync: {
      ...state.sync,
      status,
      errorMessage: text(errorMessage)
    }
  };
}

export function clearContextualAuthoringSync(value = {}) {
  const state = normalizeCardAssistanceLocalState(value);
  return {
    ...state,
    sync: { pendingPaths: [], pendingMetadata: [], expectedRevision: null }
  };
}
