import { contractToRelationalRows } from "./contractToRelationalRows.js";
import { RELATIONAL_ROW_COLLECTIONS } from "./relationalSchema.js";

const NON_DOMAIN_FIELDS = new Set(["updatedAt", "deletedAt", "projectId"]);
const BROAD_SCOPE_REFERENCES = new Set(["projectId", "courseId", "moduleId", "lessonId"]);
const CONTRACT_IDENTITY_TREE = Object.freeze([
  {
    field: "courses",
    segment: "course",
    children: [{
      field: "modules",
      segment: "module",
      children: [{
        field: "lessons",
        segment: "lesson",
        children: [
          { field: "topics", segment: "topic", children: [] },
          {
            field: "microsequences",
            segment: "micro",
            children: [{ field: "cards", segment: "card", children: [] }]
          }
        ]
      }]
    }]
  }
]);

function normalizedContractValue(value) {
  if (Array.isArray(value)) {
    return value.map(normalizedContractValue);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, normalizedContractValue(value[key])])
    );
  }
  return value;
}

function contractRenameFingerprint(value) {
  return JSON.stringify(normalizedContractValue(
    Object.fromEntries(Object.entries(value || {}).filter(([key]) => key !== "id"))
  ));
}

function pairContractEntities(previousValues, nextValues) {
  const previousEntries = previousValues.map((value, index) => ({
    value,
    index,
    contractKey: String(value?.id ?? "")
  }));
  const nextEntries = nextValues.map((value, index) => ({
    value,
    index,
    contractKey: String(value?.id ?? "")
  }));
  const pairedPrevious = new Set();
  const pairedNext = new Set();
  const pairs = [];
  const nextByContractKey = new Map();

  nextEntries.forEach((entry) => {
    const group = nextByContractKey.get(entry.contractKey) || [];
    group.push(entry);
    nextByContractKey.set(entry.contractKey, group);
  });
  previousEntries.forEach((previousEntry) => {
    const candidates = nextByContractKey.get(previousEntry.contractKey) || [];
    if (candidates.length !== 1) return;
    const nextEntry = candidates[0];
    if (pairedNext.has(nextEntry.index)) return;
    pairedPrevious.add(previousEntry.index);
    pairedNext.add(nextEntry.index);
    pairs.push([previousEntry, nextEntry]);
  });

  const previousByFingerprint = new Map();
  const nextByFingerprint = new Map();
  const groupByFingerprint = (entries, paired, target) => {
    entries.filter((entry) => !paired.has(entry.index)).forEach((entry) => {
      const fingerprint = contractRenameFingerprint(entry.value);
      const group = target.get(fingerprint) || [];
      group.push(entry);
      target.set(fingerprint, group);
    });
  };
  groupByFingerprint(previousEntries, pairedPrevious, previousByFingerprint);
  groupByFingerprint(nextEntries, pairedNext, nextByFingerprint);
  previousByFingerprint.forEach((previousGroup, fingerprint) => {
    const nextGroup = nextByFingerprint.get(fingerprint) || [];
    if (previousGroup.length !== 1 || nextGroup.length !== 1) return;
    pairs.push([previousGroup[0], nextGroup[0]]);
  });

  return pairs.sort((left, right) => left[0].index - right[0].index);
}

function appendIdentityPath(parentPath, segment, contractKey) {
  const entry = `${segment}:${contractKey}`;
  return parentPath ? `${parentPath}/${entry}` : entry;
}

function collectContractIdentityAliases(
  previousParent,
  nextParent,
  previousParentPath = "",
  nextParentPath = "",
  definitions = CONTRACT_IDENTITY_TREE,
  aliases = []
) {
  definitions.forEach((definition) => {
    const previousValues = Array.isArray(previousParent?.[definition.field])
      ? previousParent[definition.field]
      : [];
    const nextValues = Array.isArray(nextParent?.[definition.field])
      ? nextParent[definition.field]
      : [];
    pairContractEntities(previousValues, nextValues).forEach(([previousEntry, nextEntry]) => {
      if (!previousEntry.contractKey || !nextEntry.contractKey) return;
      const previousPath = appendIdentityPath(
        previousParentPath,
        definition.segment,
        previousEntry.contractKey
      );
      const nextPath = appendIdentityPath(
        nextParentPath,
        definition.segment,
        nextEntry.contractKey
      );
      if (previousEntry.contractKey !== nextEntry.contractKey) {
        aliases.push({ previousPath, nextPath });
      }
      collectContractIdentityAliases(
        previousEntry.value,
        nextEntry.value,
        previousPath,
        nextPath,
        definition.children,
        aliases
      );
    });
  });
  return aliases;
}

function identityMapRead(identityMap, key) {
  return identityMap instanceof Map ? identityMap.get(key) : identityMap?.[key];
}

function identityMapWrite(identityMap, key, value) {
  if (identityMap instanceof Map) {
    identityMap.set(key, value);
  } else if (identityMap && typeof identityMap === "object") {
    identityMap[key] = value;
  }
}

function identityMapDelete(identityMap, key, expectedValue) {
  if (identityMapRead(identityMap, key) !== expectedValue) return;
  if (identityMap instanceof Map) {
    identityMap.delete(key);
  } else if (identityMap && typeof identityMap === "object") {
    delete identityMap[key];
  }
}

function cloneIdentityMap(identityMap) {
  if (identityMap instanceof Map) return new Map(identityMap);
  if (identityMap && typeof identityMap === "object") return { ...identityMap };
  return new Map();
}

function replaceIdentityMap(identityMap, nextIdentityMap) {
  if (identityMap instanceof Map && nextIdentityMap instanceof Map) {
    identityMap.clear();
    nextIdentityMap.forEach((value, key) => identityMap.set(key, value));
  } else if (identityMap && typeof identityMap === "object") {
    Object.keys(identityMap).forEach((key) => delete identityMap[key]);
    Object.assign(identityMap, nextIdentityMap);
  }
}

function aliasForIdentityKey(identityKey, aliases) {
  return aliases
    .filter(
      ({ previousPath }) =>
        identityKey === previousPath || identityKey.startsWith(`${previousPath}/`)
    )
    .sort((left, right) => right.previousPath.length - left.previousPath.length)[0] || null;
}

function migrateIdentityAliases(identityMap, previousRows, aliases) {
  if (!aliases.length) return;
  const moves = Object.values(normalizeRows(previousRows))
    .flat()
    .filter((row) => row?.deletedAt == null && row?.identityKey && row?.id)
    .map((row) => {
      const alias = aliasForIdentityKey(row.identityKey, aliases);
      if (!alias) return null;
      return {
        previousKey: row.identityKey,
        nextKey: `${alias.nextPath}${row.identityKey.slice(alias.previousPath.length)}`,
        id: row.id
      };
    })
    .filter(Boolean);

  moves.forEach(({ previousKey, id }) => identityMapDelete(identityMap, previousKey, id));
  moves.forEach(({ nextKey, id }) => identityMapWrite(identityMap, nextKey, id));
}

function clone(value) {
  return value == null ? value : structuredClone(value);
}

function normalizedValue(value, allowedFields = null) {
  if (Array.isArray(value)) {
    return value.map((entry) => normalizedValue(entry));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .filter((key) => !NON_DOMAIN_FIELDS.has(key))
        .filter((key) => allowedFields === null || allowedFields.has(key))
        .sort()
        .map((key) => [key, normalizedValue(value[key])])
    );
  }
  return value;
}

function rowsEqual(left, right) {
  const domainFields = new Set(
    Object.keys(right || {}).filter((fieldName) => !NON_DOMAIN_FIELDS.has(fieldName))
  );
  return (
    JSON.stringify(normalizedValue(left, domainFields)) ===
    JSON.stringify(normalizedValue(right, domainFields))
  );
}

function changedFields(previousRow, nextRow) {
  const fields = new Set(Object.keys(nextRow || previousRow || {}));
  return [...fields]
    .filter((fieldName) => !NON_DOMAIN_FIELDS.has(fieldName))
    .filter(
      (fieldName) =>
        JSON.stringify(normalizedValue(previousRow?.[fieldName])) !==
        JSON.stringify(normalizedValue(nextRow?.[fieldName]))
    )
    .sort();
}

function normalizeRows(rows = {}) {
  return Object.fromEntries(
    RELATIONAL_ROW_COLLECTIONS.map((storeName) => [
      storeName,
      Array.isArray(rows?.[storeName]) ? rows[storeName] : []
    ])
  );
}

function indexById(rows) {
  return new Map(rows.map((row) => [row.id, row]));
}

function rowMatchesIdentity(row, requestedId, segments = []) {
  if (!requestedId) return false;
  if (
    row.id === requestedId ||
    row.contractKey === requestedId ||
    row.identityKey === requestedId
  ) {
    return true;
  }
  return segments.some((segment) =>
    row.identityKey?.endsWith(`/${segment}:${requestedId}`) ||
    row.identityKey === `${segment}:${requestedId}`
  );
}

function expandScopedRows(rows, initialIds) {
  const scopedIds = new Set(initialIds);
  let expanded = true;
  while (expanded) {
    expanded = false;
    for (const collectionRows of Object.values(rows)) {
      for (const row of collectionRows) {
        if (scopedIds.has(row.id)) continue;
        const belongsToScope = Object.entries(row).some(
          ([fieldName, value]) =>
            fieldName.endsWith("Id") &&
            !BROAD_SCOPE_REFERENCES.has(fieldName) &&
            scopedIds.has(value)
        );
        if (belongsToScope) {
          scopedIds.add(row.id);
          expanded = true;
        }
      }
    }
  }
  return scopedIds;
}

function scopeMicrosequenceRows(rows, scope) {
  if (!scope || scope.type !== "microsequence") {
    return null;
  }
  const requestedId = String(scope.id || scope.microsequenceId || scope.contractKey || "");
  if (!requestedId) {
    throw new Error("O escopo de microssequência exige id ou contractKey.");
  }

  const microsequences = rows.microsequences.filter((row) =>
    rowMatchesIdentity(row, requestedId, ["micro", "microsequence"])
  );
  if (!microsequences.length) {
    return new Set();
  }

  const microsequenceIds = new Set(microsequences.map((row) => row.id));
  const scopedIds = scope.cardsOnly
    ? new Set(
        rows.cards
          .filter((row) => microsequenceIds.has(row.microsequenceId))
          .map((row) => row.id)
      )
    : new Set(microsequenceIds);
  return expandScopedRows(rows, scopedIds);
}

function scopeMicrosequenceInsertionRows(rows, scope) {
  if (!scope || scope.type !== "microsequence-insertion") return null;
  const requestedId = String(scope.id || scope.microsequenceId || scope.contractKey || "");
  const requestedLessonId = String(scope.lessonId || scope.lessonKey || "");
  if (!requestedId || !requestedLessonId) {
    throw new Error(
      "O escopo de inserção exige as identidades da lição e da microssequência."
    );
  }
  const lessonIds = new Set(
    rows.lessons
      .filter((row) => rowMatchesIdentity(row, requestedLessonId, ["lesson"]))
      .map((row) => row.id)
  );
  const targetMicrosequenceIds = new Set(
    rows.microsequences
      .filter((row) =>
        lessonIds.has(row.lessonId) &&
        rowMatchesIdentity(row, requestedId, ["micro", "microsequence"])
      )
      .map((row) => row.id)
  );
  const targetIds = expandScopedRows(rows, targetMicrosequenceIds);
  const siblingIds = new Set(
    rows.microsequences
      .filter((row) =>
        lessonIds.has(row.lessonId) &&
        !targetMicrosequenceIds.has(row.id)
      )
      .map((row) => row.id)
  );
  return {
    ids: new Set([...targetIds, ...siblingIds]),
    targetIds,
    siblingIds
  };
}

function insertionMutationIsAllowed(mutation, previousScope, nextScope) {
  const targetIds = new Set([
    ...(previousScope?.targetIds || []),
    ...(nextScope?.targetIds || [])
  ]);
  if (targetIds.has(mutation.entityId)) return true;
  const siblingIds = new Set([
    ...(previousScope?.siblingIds || []),
    ...(nextScope?.siblingIds || [])
  ]);
  return siblingIds.has(mutation.entityId) &&
    mutation.storeName === "microsequences" &&
    mutation.operation === "upsert" &&
    mutation.changedFields.length > 0 &&
    mutation.changedFields.every((fieldName) => fieldName === "position");
}

function mutationInScope(mutation, scopedIds) {
  return scopedIds === null || scopedIds.has(mutation.entityId);
}

function mergePersistedMetadata(previousRow, nextRow) {
  if (!previousRow) return nextRow;
  return {
    ...previousRow,
    ...nextRow,
    updatedAt: previousRow.updatedAt ?? null,
    deletedAt: null
  };
}

export class ProjectDocumentDiffer {
  constructor({ identityMap = new Map(), uuidFactory } = {}) {
    this.identityMap = identityMap;
    this.uuidFactory = uuidFactory;
  }

  normalize(document) {
    const nextIdentityMap = cloneIdentityMap(this.identityMap);
    const rows = contractToRelationalRows(document, {
      identityMap: nextIdentityMap,
      ...(this.uuidFactory ? { uuidFactory: this.uuidFactory } : {})
    });
    replaceIdentityMap(this.identityMap, nextIdentityMap);
    return rows;
  }

  diff(previousDocument, nextDocument, options = {}) {
    const previousRows = options.previousRows || this.normalize(previousDocument);
    const aliases = collectContractIdentityAliases(previousDocument, nextDocument);
    const nextIdentityMap = cloneIdentityMap(this.identityMap);
    if (aliases.length) migrateIdentityAliases(nextIdentityMap, previousRows, aliases);
    const nextRows = contractToRelationalRows(nextDocument, {
      identityMap: nextIdentityMap,
      ...(this.uuidFactory ? { uuidFactory: this.uuidFactory } : {})
    });
    const result = this.diffRows(previousRows, nextRows, options);
    replaceIdentityMap(this.identityMap, nextIdentityMap);
    return result;
  }

  diffRows(previousRowsInput, nextRowsInput, { scope = null } = {}) {
    const previousRows = normalizeRows(previousRowsInput);
    const nextRows = normalizeRows(nextRowsInput);
    const previousInsertionScope = scopeMicrosequenceInsertionRows(previousRows, scope);
    const nextInsertionScope = scopeMicrosequenceInsertionRows(nextRows, scope);
    const previousScope = previousInsertionScope?.ids ??
      scopeMicrosequenceRows(previousRows, scope);
    const nextScope = nextInsertionScope?.ids ??
      scopeMicrosequenceRows(nextRows, scope);
    const scopedIds =
      previousScope === null && nextScope === null
        ? null
        : new Set([...(previousScope || []), ...(nextScope || [])]);
    const mutations = [];
    const outOfScopeMutations = [];

    for (const storeName of RELATIONAL_ROW_COLLECTIONS) {
      const beforeById = indexById(previousRows[storeName]);
      const afterById = indexById(nextRows[storeName]);
      const ids = new Set([...beforeById.keys(), ...afterById.keys()]);

      for (const entityId of ids) {
        const previousRow = beforeById.get(entityId) || null;
        const rawNextRow = afterById.get(entityId) || null;
        const nextRow = rawNextRow ? mergePersistedMetadata(previousRow, rawNextRow) : null;
        const operation = nextRow ? "upsert" : "delete";

        if (previousRow?.deletedAt && !nextRow) continue;
        if (previousRow && nextRow && rowsEqual(previousRow, nextRow)) continue;

        const mutation = {
          storeName,
          entityType: storeName,
          entityId,
          courseId: nextRow?.courseId ?? previousRow?.courseId ?? null,
          operation,
          previousRow: clone(previousRow),
          nextRow: clone(nextRow),
          changedFields: changedFields(previousRow, nextRow)
        };
        if (
          mutationInScope(mutation, scopedIds) &&
          (
            scope?.type !== "microsequence-insertion" ||
            insertionMutationIsAllowed(
              mutation,
              previousInsertionScope,
              nextInsertionScope
            )
          )
        ) {
          mutations.push(mutation);
        } else {
          outOfScopeMutations.push(mutation);
        }
      }
    }

    const enforceableOutOfScopeMutations = outOfScopeMutations.filter(
      (mutation) => mutation.storeName !== "projectMeta"
    );
    if ((scope?.cardsOnly || scope?.rejectOutOfScope) && enforceableOutOfScopeMutations.length) {
      const changedEntities = enforceableOutOfScopeMutations
        .map((mutation) => `${mutation.storeName}:${mutation.entityId}`)
        .slice(0, 5)
        .join(", ");
      throw new Error(
        scope?.cardsOnly
          ? `A substituição de cards tentou alterar entidades fora da microssequência: ${changedEntities}.`
          : scope?.type === "microsequence-insertion"
            ? `A inserção da microssequência tentou alterar entidades externas: ${changedEntities}.`
            : `A atualização da microssequência tentou alterar entidades externas: ${changedEntities}.`
      );
    }

    return {
      mutations,
      previousRows,
      nextRows,
      scope: scope ? clone(scope) : null,
      outOfScopeMutations
    };
  }

  replaceMicrosequenceCards(previousDocument, nextDocument, microsequenceId, options = {}) {
    return this.diff(previousDocument, nextDocument, {
      ...options,
      scope: { type: "microsequence", id: microsequenceId, cardsOnly: true }
    });
  }

  replaceMicrosequence(previousDocument, nextDocument, microsequenceId, options = {}) {
    return this.diff(previousDocument, nextDocument, {
      ...options,
      scope: {
        type: "microsequence",
        id: microsequenceId,
        cardsOnly: false,
        rejectOutOfScope: true
      }
    });
  }

  insertMicrosequence(
    previousDocument,
    nextDocument,
    { lessonId, microsequenceId } = {},
    options = {}
  ) {
    return this.diff(previousDocument, nextDocument, {
      ...options,
      scope: {
        type: "microsequence-insertion",
        id: microsequenceId,
        lessonId,
        rejectOutOfScope: true
      }
    });
  }
}
