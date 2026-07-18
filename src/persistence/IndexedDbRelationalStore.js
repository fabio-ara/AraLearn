import { RelationalTransaction } from "./RelationalTransaction.js";
import { defaultUuidFactory } from "./relationalSchema.js";

export const RELATIONAL_DATABASE_NAME = "aralearn-relational-v1";
export const RELATIONAL_DATABASE_VERSION = 1;

const index = (name, keyPath, options = {}) => ({ name, keyPath, options });

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

const NON_DEPENDENCY_ID_FIELDS = new Set([
  "id",
  "sourceEntityId",
  "projectId",
  "userId",
  "mutationId",
  "deviceId"
]);
const OUTBOX_SEQUENCE_STATE_ID = "outbox.sequence";

function outboxSequence(entry) {
  const explicit = Number(entry?.sequence);
  if (Number.isFinite(explicit)) return explicit;
  const timestamp = Date.parse(entry?.createdAt || "");
  return Number.isFinite(timestamp) ? timestamp : Number.MAX_SAFE_INTEGER;
}

function referencedEntityIds(entry) {
  return Object.entries(entry?.payload || {})
    .filter(([fieldName, value]) =>
      fieldName.endsWith("Id") &&
      !NON_DEPENDENCY_ID_FIELDS.has(fieldName) &&
      typeof value === "string" &&
      value.length > 0
    )
    .map(([, value]) => value);
}

function compositeEntityIds(entry) {
  if (entry?.entityType === "personalCourseDeletion") {
    return new Set([
      entry.entityId,
      entry?.payload?.courseId,
      ...(entry?.payload?.affectedEntities || []).map((row) => row?.entityId)
    ].filter(Boolean).map(String));
  }
  if (entry?.entityType !== "microsequenceCardReplacement") return new Set();
  const covered = new Set([
    entry.entityId,
    entry?.payload?.microsequenceId
  ].filter(Boolean).map(String));
  [entry?.payload?.fragment, entry?.payload?.previousFragment].forEach((fragment) => {
    if (!fragment || typeof fragment !== "object") return;
    Object.values(fragment).forEach((rows) => {
      if (!Array.isArray(rows)) return;
      rows.forEach((row) => {
        if (row?.id) covered.add(String(row.id));
      });
    });
  });
  return covered;
}

function entryDependsOn(candidate, blocker) {
  if (outboxSequence(candidate) <= outboxSequence(blocker)) return false;
  if (candidate.entityId === blocker.entityId) return true;
  if (referencedEntityIds(candidate).includes(blocker.entityId)) return true;
  const candidateCompositeIds = compositeEntityIds(candidate);
  if (candidateCompositeIds.has(String(blocker.entityId))) return true;
  const compositeIds = compositeEntityIds(blocker);
  return compositeIds.has(String(candidate.entityId)) ||
    referencedEntityIds(candidate).some((entityId) => compositeIds.has(String(entityId)));
}

function causalDescendants(entries, roots) {
  const descendants = new Set();
  const blockers = [...roots];
  let changed = true;
  while (changed) {
    changed = false;
    entries.forEach((candidate) => {
      if (descendants.has(candidate) || roots.includes(candidate)) return;
      if (!blockers.some((blocker) => entryDependsOn(candidate, blocker))) return;
      descendants.add(candidate);
      blockers.push(candidate);
      changed = true;
    });
  }
  return descendants;
}

function fragmentStoreRows(fragment) {
  if (!fragment || typeof fragment !== "object") return [];
  return Object.entries(fragment).flatMap(([storeName, rows]) => {
    if (!Object.prototype.hasOwnProperty.call(RELATIONAL_STORE_DEFINITIONS, storeName)) return [];
    if (["outbox", "syncState", "conflicts"].includes(storeName) || !Array.isArray(rows)) return [];
    return rows.filter((row) => row?.id).map((row) => ({ storeName, row }));
  });
}

async function rollbackOutboxEntry(transaction, entry) {
  if (entry?.entityType === "personalCourseDeletion") {
    for (const metadata of entry.payload?.affectedEntities || []) {
      if (!metadata?.storeName || !metadata?.entityId) continue;
      const current = await transaction.get(metadata.storeName, metadata.entityId);
      if (!current) continue;
      await transaction.put(metadata.storeName, {
        ...current,
        revision: Number(metadata.previousRevision || 0),
        updatedAt: metadata.previousUpdatedAt ?? null,
        deletedAt: metadata.previousDeletedAt ?? null
      });
    }
    for (const rollback of entry.payload?.rollbackRows || []) {
      if (!rollback?.storeName || !rollback?.entityId) continue;
      if (rollback.previousRow) {
        await transaction.put(rollback.storeName, structuredClone(rollback.previousRow));
      } else {
        await transaction.delete(rollback.storeName, rollback.entityId);
      }
    }
    return;
  }
  if (entry?.entityType === "microsequenceCardReplacement") {
    const currentRows = fragmentStoreRows(entry.payload?.fragment);
    const previousRows = fragmentStoreRows(entry.payload?.previousFragment);
    if (!entry.payload?.previousFragment) {
      throw new Error("O conflito composto não possui snapshot anterior para restauração segura.");
    }
    for (const { storeName, row } of currentRows) {
      await transaction.delete(storeName, row.id);
    }
    for (const { storeName, row } of previousRows) {
      await transaction.put(storeName, structuredClone(row));
    }
    return;
  }
  const storeName = String(entry?.entityType || "");
  if (!Object.prototype.hasOwnProperty.call(RELATIONAL_STORE_DEFINITIONS, storeName)) return;
  if (["outbox", "syncState", "conflicts"].includes(storeName)) return;
  if (Object.prototype.hasOwnProperty.call(entry, "previousRow")) {
    if (entry.previousRow) await transaction.put(storeName, structuredClone(entry.previousRow));
    else await transaction.delete(storeName, entry.entityId);
    return;
  }
  if (Number(entry?.baseRevision || 0) === 0) {
    await transaction.delete(storeName, entry.entityId);
    return;
  }
  throw new Error(`A mutação ${entry?.mutationId || "desconhecida"} não possui snapshot para rollback seguro.`);
}

function replaceEntityReference(value, previousId, canonicalId, fieldName = "") {
  if (Array.isArray(value)) {
    return value.map((entry) => replaceEntityReference(entry, previousId, canonicalId));
  }
  if (!value || typeof value !== "object") {
    return (
      typeof value === "string" &&
      value === previousId &&
      (fieldName === "entityId" || fieldName.endsWith("Id"))
    ) ? canonicalId : value;
  }
  return Object.fromEntries(Object.entries(value).map(([key, entry]) => [
    key,
    replaceEntityReference(entry, previousId, canonicalId, key)
  ]));
}

async function remapEntityReferences(transaction, previousId, canonicalId) {
  if (!canonicalId || canonicalId === previousId) return;
  for (const storeName of RELATIONAL_STORE_NAMES) {
    if (["outbox", "syncState", "conflicts"].includes(storeName)) continue;
    const rows = await transaction.getAll(storeName);
    for (const row of rows) {
      if (row.id === previousId) continue;
      const remapped = replaceEntityReference(row, previousId, canonicalId);
      if (stableJson(remapped) !== stableJson(row)) await transaction.put(storeName, remapped);
    }
  }
  for (const storeName of ["outbox", "conflicts"]) {
    const rows = await transaction.getAll(storeName);
    for (const row of rows) {
      const remapped = replaceEntityReference(row, previousId, canonicalId);
      if (stableJson(remapped) !== stableJson(row)) await transaction.put(storeName, remapped);
    }
  }
}

function compositeAffectedChangeIndexes(entry, changes) {
  const coveredIds = compositeEntityIds(entry);
  const affected = new Set();
  if (entry?.entityType === "personalCourseDeletion") {
    changes.forEach((change, index) => {
      const changeCourseId = change.courseId ?? change.row?.courseId ?? change.payload?.courseId;
      if (String(changeCourseId || "") === String(entry.courseId || entry.payload?.courseId || "")) {
        affected.add(index);
        coveredIds.add(String(change.entityId));
      }
    });
  }
  let expanded = true;
  while (expanded) {
    expanded = false;
    changes.forEach((change, index) => {
      if (affected.has(index)) return;
      const references = referencedEntityIds({ payload: change.row || change.payload || {} });
      if (!coveredIds.has(String(change.entityId)) && !references.some((id) => coveredIds.has(String(id)))) {
        return;
      }
      affected.add(index);
      coveredIds.add(String(change.entityId));
      expanded = true;
    });
  }
  return affected;
}

function orderOutboxEntries(entries) {
  const nodes = entries.map((entry, index) => ({ entry, index, dependencies: new Set() }));
  const byEntityId = new Map();
  nodes.forEach((node) => {
    if (!byEntityId.has(node.entry.entityId)) byEntityId.set(node.entry.entityId, []);
    byEntityId.get(node.entry.entityId).push(node);
  });
  byEntityId.forEach((entityNodes) => {
    entityNodes.sort((left, right) => outboxSequence(left.entry) - outboxSequence(right.entry));
    for (let index = 1; index < entityNodes.length; index += 1) {
      entityNodes[index].dependencies.add(entityNodes[index - 1]);
    }
  });

  nodes.forEach((composite) => {
    const covered = compositeEntityIds(composite.entry);
    if (!covered.size) return;
    const compositeSequence = outboxSequence(composite.entry);
    nodes.forEach((candidate) => {
      if (candidate === composite || !covered.has(String(candidate.entry.entityId))) return;
      if (outboxSequence(candidate.entry) < compositeSequence) {
        composite.dependencies.add(candidate);
      } else {
        candidate.dependencies.add(composite);
      }
    });
  });

  nodes.forEach((node) => {
    if (node.entry.operation === "delete") return;
    referencedEntityIds(node.entry).forEach((entityId) => {
      const parent = (byEntityId.get(entityId) || []).find(
        (candidate) => candidate.entry.operation !== "delete"
      );
      if (parent && parent !== node) node.dependencies.add(parent);
    });
  });
  nodes.forEach((parent) => {
    if (parent.entry.operation !== "delete") return;
    nodes.forEach((child) => {
      if (
        child.entry.operation === "delete" &&
        child !== parent &&
        referencedEntityIds(child.entry).includes(parent.entry.entityId)
      ) {
        parent.dependencies.add(child);
      }
    });
  });

  const compare = (left, right) => {
    const operationDelta = Number(left.entry.operation !== "delete") - Number(right.entry.operation !== "delete");
    return operationDelta ||
      outboxSequence(left.entry) - outboxSequence(right.entry) ||
      left.index - right.index;
  };
  const ordered = [];
  const completed = new Set();
  const visiting = new Set();
  const visit = (node) => {
    if (completed.has(node)) return;
    if (visiting.has(node)) return;
    visiting.add(node);
    [...node.dependencies].sort(compare).forEach(visit);
    visiting.delete(node);
    completed.add(node);
    ordered.push(node.entry);
  };
  [...nodes].sort(compare).forEach(visit);
  return ordered;
}

const COMMON_ENTITY_INDEXES = [
  index("byCourseId", "courseId"),
  index("bySourceEntityId", "sourceEntityId"),
  index("byUpdatedAt", "updatedAt"),
  index("byDeletedAt", "deletedAt")
];

const positionedChildIndexes = (parentName, parentKey) => [
  index(`by${parentName}`, parentKey),
  index(`by${parentName}Position`, [parentKey, "position"]),
  ...COMMON_ENTITY_INDEXES
];

export const RELATIONAL_STORE_DEFINITIONS = Object.freeze({
  projectMeta: {
    keyPath: "id",
    indexes: [index("byUpdatedAt", "updatedAt")]
  },
  courses: {
    keyPath: "id",
    indexes: [
      index("byOwnerId", "ownerId"),
      index("byKind", "kind"),
      index("byStatus", "status"),
      index("byContractKey", "contractKey"),
      index("bySourceEntityId", "sourceEntityId"),
      index("byUpdatedAt", "updatedAt"),
      index("byDeletedAt", "deletedAt")
    ]
  },
  memberships: {
    keyPath: "id",
    indexes: [
      index("byCourseId", "courseId"),
      index("byUserId", "userId"),
      index("byCourseAndUser", ["courseId", "userId"]),
      index("byUpdatedAt", "updatedAt"),
      index("byDeletedAt", "deletedAt")
    ]
  },
  modules: {
    keyPath: "id",
    indexes: [
      index("byCourseId", "courseId"),
      index("byCoursePosition", ["courseId", "position"]),
      index("byCourseContractKey", ["courseId", "contractKey"]),
      ...COMMON_ENTITY_INDEXES.slice(1)
    ]
  },
  guides: {
    keyPath: "id",
    indexes: [
      index("byOwner", ["ownerType", "ownerId"]),
      ...COMMON_ENTITY_INDEXES
    ]
  },
  guideItems: {
    keyPath: "id",
    indexes: [
      index("byGuideId", "guideId"),
      index("byGuideItemTypePosition", ["guideId", "itemType", "position"]),
      ...COMMON_ENTITY_INDEXES
    ]
  },
  lessons: {
    keyPath: "id",
    indexes: [
      index("byModuleId", "moduleId"),
      index("byModulePosition", ["moduleId", "position"]),
      index("byModuleContractKey", ["moduleId", "contractKey"]),
      ...COMMON_ENTITY_INDEXES
    ]
  },
  topics: {
    keyPath: "id",
    indexes: [
      index("byLessonId", "lessonId"),
      index("byLessonPosition", ["lessonId", "position"]),
      index("byLessonContractKey", ["lessonId", "contractKey"]),
      ...COMMON_ENTITY_INDEXES
    ]
  },
  topicStatements: {
    keyPath: "id",
    indexes: [
      index("byTopicId", "topicId"),
      index("byTopicStatementTypePosition", ["topicId", "statementType", "position"]),
      ...COMMON_ENTITY_INDEXES
    ]
  },
  microsequences: {
    keyPath: "id",
    indexes: [
      index("byLessonId", "lessonId"),
      index("byLessonPosition", ["lessonId", "position"]),
      index("byLessonContractKey", ["lessonId", "contractKey"]),
      index("byBranchOfId", "branchOfId"),
      ...COMMON_ENTITY_INDEXES
    ]
  },
  microsequenceStatements: {
    keyPath: "id",
    indexes: [
      index("byMicrosequenceId", "microsequenceId"),
      index("byMicrosequenceStatementTypePosition", ["microsequenceId", "statementType", "position"]),
      ...COMMON_ENTITY_INDEXES
    ]
  },
  dependencies: {
    keyPath: "id",
    indexes: [
      index("byMicrosequenceId", "microsequenceId"),
      index("byDependsOnMicrosequenceId", "dependsOnMicrosequenceId"),
      index("byDependencyPair", ["microsequenceId", "dependsOnMicrosequenceId"]),
      ...COMMON_ENTITY_INDEXES
    ]
  },
  cards: {
    keyPath: "id",
    indexes: [
      index("byMicrosequenceId", "microsequenceId"),
      index("byMicrosequencePosition", ["microsequenceId", "position"]),
      index("byLessonId", "lessonId"),
      index("byMicrosequenceContractKey", ["microsequenceId", "contractKey"]),
      ...COMMON_ENTITY_INDEXES
    ]
  },
  cardSources: {
    keyPath: "id",
    indexes: positionedChildIndexes("CardId", "cardId")
  },
  cardTopics: {
    keyPath: "id",
    indexes: positionedChildIndexes("CardId", "cardId")
  },
  blocks: {
    keyPath: "id",
    indexes: [
      index("byCardId", "cardId"),
      index("byCardRegionPosition", ["cardId", "region", "position"]),
      ...COMMON_ENTITY_INDEXES
    ]
  },
  options: {
    keyPath: "id",
    indexes: [
      index("byCardId", "cardId"),
      index("byBlockId", "blockId"),
      index("byBlockPosition", ["blockId", "position"]),
      index("byBlockContractKey", ["blockId", "contractKey"]),
      ...COMMON_ENTITY_INDEXES
    ]
  },
  nodes: {
    keyPath: "id",
    indexes: [
      index("byBlockId", "blockId"),
      index("byBlockPosition", ["blockId", "position"]),
      index("byParentNodeId", "parentNodeId"),
      ...COMMON_ENTITY_INDEXES
    ]
  },
  edges: {
    keyPath: "id",
    indexes: [
      index("byBlockId", "blockId"),
      index("byBlockPosition", ["blockId", "position"]),
      index("byFromNodeId", "fromNodeId"),
      index("byToNodeId", "toNodeId"),
      ...COMMON_ENTITY_INDEXES
    ]
  },
  cells: {
    keyPath: "id",
    indexes: [
      index("byBlockId", "blockId"),
      index("byMatrixItemId", "matrixItemId"),
      index("byBlockPosition", ["blockId", "position"]),
      index("byBlockCell", ["blockId", "cellKind", "rowIndex", "columnIndex"]),
      ...COMMON_ENTITY_INDEXES
    ]
  },
  matrixItems: {
    keyPath: "id",
    indexes: positionedChildIndexes("BlockId", "blockId")
  },
  points: {
    keyPath: "id",
    indexes: positionedChildIndexes("BlockId", "blockId")
  },
  lines: {
    keyPath: "id",
    indexes: [
      index("byBlockId", "blockId"),
      index("byBlockPosition", ["blockId", "position"]),
      index("byFromPointId", "fromPointId"),
      index("byToPointId", "toPointId"),
      ...COMMON_ENTITY_INDEXES
    ]
  },
  highlights: {
    keyPath: "id",
    indexes: [
      index("byBlockId", "blockId"),
      index("byMatrixItemId", "matrixItemId"),
      index("byBlockPosition", ["blockId", "position"]),
      ...COMMON_ENTITY_INDEXES
    ]
  },
  flowNodes: {
    keyPath: "id",
    indexes: [
      index("byBlockId", "blockId"),
      index("byParentNodeId", "parentNodeId"),
      index("byParentCaseId", "parentCaseId"),
      index("byBlockPosition", ["blockId", "position"]),
      ...COMMON_ENTITY_INDEXES
    ]
  },
  flowCases: {
    keyPath: "id",
    indexes: positionedChildIndexes("FlowNodeId", "flowNodeId")
  },
  flowPractices: {
    keyPath: "id",
    indexes: [
      index("byOwnerId", "ownerId"),
      index("byOwner", ["ownerType", "ownerId"]),
      ...COMMON_ENTITY_INDEXES
    ]
  },
  flowPracticeEntries: {
    keyPath: "id",
    indexes: positionedChildIndexes("PracticeId", "practiceId")
  },
  flowPracticeOptions: {
    keyPath: "id",
    indexes: positionedChildIndexes("EntryId", "entryId")
  },
  flowPracticeVariants: {
    keyPath: "id",
    indexes: positionedChildIndexes("EntryId", "entryId")
  },
  flowShapeOptions: {
    keyPath: "id",
    indexes: positionedChildIndexes("PracticeId", "practiceId")
  },
  lessonProgress: {
    keyPath: "id",
    indexes: [
      index("byLessonId", "lessonId"),
      index("byUserId", "userId"),
      index("byUserAndLesson", ["userId", "lessonId"]),
      index("byCourseId", "courseId"),
      index("byLastActivityAt", "lastActivityAt"),
      index("byUpdatedAt", "updatedAt"),
      index("byDeletedAt", "deletedAt")
    ]
  },
  cardProgress: {
    keyPath: "id",
    indexes: [
      index("byCardId", "cardId"),
      index("byLessonId", "lessonId"),
      index("byUserId", "userId"),
      index("byUserAndCard", ["userId", "cardId"]),
      index("byCourseId", "courseId"),
      index("byLastActivityAt", "lastActivityAt"),
      index("byUpdatedAt", "updatedAt"),
      index("byDeletedAt", "deletedAt")
    ]
  },
  comments: {
    keyPath: "id",
    indexes: [
      index("byCardId", "cardId"),
      index("byUserId", "userId"),
      index("byUserAndCard", ["userId", "cardId"]),
      index("byCourseId", "courseId"),
      index("byUpdatedAt", "updatedAt"),
      index("byDeletedAt", "deletedAt")
    ]
  },
  outbox: {
    keyPath: "mutationId",
    indexes: [
      index("byStatus", "status"),
      index("byStatusCreatedAt", ["status", "createdAt"]),
      index("byCourseId", "courseId"),
      index("byEntity", ["entityType", "entityId"]),
      index("byCreatedAt", "createdAt")
    ]
  },
  syncState: {
    keyPath: "id",
    indexes: [index("byCourseId", "courseId"), index("byDeviceId", "deviceId")]
  },
  conflicts: {
    keyPath: "id",
    indexes: [
      index("byStatus", "status"),
      index("byCourseId", "courseId"),
      index("byEntity", ["entityType", "entityId"]),
      index("byCreatedAt", "createdAt")
    ]
  },
  entityMappings: {
    keyPath: "id",
    indexes: [
      index("byIdentityKey", "identityKey"),
      index("byEntityType", "entityType"),
      index("byCourseId", "courseId"),
      index("byContractKey", "contractKey")
    ]
  }
});

export const RELATIONAL_STORE_NAMES = Object.freeze(Object.keys(RELATIONAL_STORE_DEFINITIONS));

export const PROJECT_ROW_STORE_NAMES = Object.freeze(
  RELATIONAL_STORE_NAMES.filter(
    (name) => ![
      "memberships",
      "lessonProgress",
      "cardProgress",
      "comments",
      "outbox",
      "syncState",
      "conflicts"
    ].includes(name)
  )
);

const COURSE_SNAPSHOT_STORE_NAMES = Object.freeze([
  ...PROJECT_ROW_STORE_NAMES.filter((name) => name !== "projectMeta"),
  "memberships",
  "lessonProgress",
  "cardProgress",
  "comments"
]);

function openDatabase(indexedDb) {
  return new Promise((resolve, reject) => {
    const request = indexedDb.open(RELATIONAL_DATABASE_NAME, RELATIONAL_DATABASE_VERSION);
    request.addEventListener("upgradeneeded", () => {
      const database = request.result;
      for (const [storeName, definition] of Object.entries(RELATIONAL_STORE_DEFINITIONS)) {
        const store = database.objectStoreNames.contains(storeName)
          ? request.transaction.objectStore(storeName)
          : database.createObjectStore(storeName, { keyPath: definition.keyPath });
        for (const entry of definition.indexes || []) {
          if (!store.indexNames.contains(entry.name)) {
            store.createIndex(entry.name, entry.keyPath, entry.options);
          }
        }
      }
    });
    request.addEventListener(
      "blocked",
      () => reject(new Error("A abertura do banco relacional foi bloqueada por outra instância.")),
      { once: true }
    );
    request.addEventListener(
      "error",
      () => reject(request.error || new Error("Não foi possível abrir o banco relacional.")),
      { once: true }
    );
    request.addEventListener("success", () => resolve(request.result), { once: true });
  });
}

function normalizeStoreNames(storeNames) {
  const normalized = [...new Set((Array.isArray(storeNames) ? storeNames : [storeNames]).map(String))];
  if (!normalized.length) {
    throw new Error("Informe ao menos um object store para a transação.");
  }
  normalized.forEach((storeName) => {
    if (!Object.prototype.hasOwnProperty.call(RELATIONAL_STORE_DEFINITIONS, storeName)) {
      throw new Error(`Object store relacional desconhecido: "${storeName}".`);
    }
  });
  return normalized;
}

export class IndexedDbRelationalStore {
  #database;
  #closed = false;

  constructor(database) {
    if (!database || typeof database.transaction !== "function") {
      throw new TypeError("Banco IndexedDB relacional inválido.");
    }
    this.#database = database;
    database.addEventListener("versionchange", () => this.close(), { once: true });
  }

  static async open(indexedDb = globalThis.indexedDB) {
    if (!indexedDb || typeof indexedDb.open !== "function") {
      throw new Error("IndexedDB não está disponível neste ambiente.");
    }
    return new IndexedDbRelationalStore(await openDatabase(indexedDb));
  }

  get name() {
    return this.#database.name;
  }

  get version() {
    return this.#database.version;
  }

  get objectStoreNames() {
    return Array.from(this.#database.objectStoreNames);
  }

  #assertOpen() {
    if (this.#closed) {
      throw new Error("O banco relacional já está fechado.");
    }
  }

  beginTransaction(storeNames, mode = "readonly") {
    this.#assertOpen();
    const normalizedNames = normalizeStoreNames(storeNames);
    const transaction = this.#database.transaction(normalizedNames, mode);
    return new RelationalTransaction(transaction, normalizedNames);
  }

  async transaction(storeNames, mode, callback) {
    if (typeof callback !== "function") {
      throw new TypeError("A transação relacional exige um callback.");
    }
    const relationalTransaction = this.beginTransaction(storeNames, mode);
    try {
      const result = await callback(relationalTransaction);
      relationalTransaction.commit();
      await relationalTransaction.done();
      return result;
    } catch (error) {
      try {
        relationalTransaction.abort();
      } catch {
        // A própria falha pode já ter abortado a transação.
      }
      await relationalTransaction.done().catch(() => undefined);
      throw error;
    }
  }

  get(storeName, key) {
    return this.transaction([storeName], "readonly", (transaction) => transaction.get(storeName, key));
  }

  getAll(storeName, query = undefined, count = undefined) {
    return this.transaction([storeName], "readonly", (transaction) =>
      transaction.getAll(storeName, query, count)
    );
  }

  getAllByIndex(storeName, indexName, query = undefined, count = undefined) {
    return this.transaction([storeName], "readonly", (transaction) =>
      transaction.getAllByIndex(storeName, indexName, query, count)
    );
  }

  put(storeName, value) {
    return this.transaction([storeName], "readwrite", (transaction) => transaction.put(storeName, value));
  }

  delete(storeName, key) {
    return this.transaction([storeName], "readwrite", (transaction) =>
      transaction.delete(storeName, key)
    );
  }

  putMany(storeName, values) {
    return this.transaction([storeName], "readwrite", (transaction) =>
      transaction.putMany(storeName, values)
    );
  }

  async getSyncState(key) {
    const row = await this.get("syncState", String(key));
    return row && Object.prototype.hasOwnProperty.call(row, "value")
      ? structuredClone(row.value)
      : null;
  }

  async putSyncState(key, value) {
    const id = String(key || "");
    if (!id) throw new TypeError("A chave de syncState não pode ser vazia.");
    if (value === null || value === undefined) {
      await this.delete("syncState", id);
      return null;
    }
    const row = {
      id,
      key: id,
      value: structuredClone(value),
      updatedAt: new Date().toISOString()
    };
    await this.put("syncState", row);
    return structuredClone(value);
  }

  async bindReplicaToUser(userId, session) {
    const normalizedUserId = String(userId || "");
    if (!normalizedUserId) throw new TypeError("A réplica exige um userId autenticado.");
    const stateId = "replica.userId";
    const currentUserId = await this.getSyncState(stateId);
    if (currentUserId === normalizedUserId) return false;
    const updatedAt = new Date().toISOString();
    await this.transaction(RELATIONAL_STORE_NAMES, "readwrite", async (transaction) => {
      for (const storeName of RELATIONAL_STORE_NAMES) {
        await transaction.clear(storeName);
      }
      await transaction.put("syncState", {
        id: "auth.session",
        key: "auth.session",
        value: structuredClone(session),
        updatedAt
      });
      await transaction.put("syncState", {
        id: stateId,
        key: stateId,
        value: normalizedUserId,
        updatedAt
      });
    });
    return true;
  }

  async replaceCourseSnapshot(courseId, snapshot) {
    const normalizedCourseId = String(courseId || "");
    if (!normalizedCourseId || !snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) {
      throw new TypeError("Snapshot relacional de curso inválido.");
    }
    const normalizedRows = Object.fromEntries(
      COURSE_SNAPSHOT_STORE_NAMES.map((storeName) => {
        const rows = snapshot[storeName] ?? [];
        if (!Array.isArray(rows)) throw new TypeError(`Snapshot inválido em ${storeName}.`);
        rows.forEach((row) => {
          const rowCourseId = storeName === "courses" ? row?.id : row?.courseId;
          if (!row?.id || String(rowCourseId || "") !== normalizedCourseId) {
            throw new Error(`Linha de ${storeName} fora do curso do snapshot.`);
          }
        });
        return [storeName, rows.map((row) => structuredClone(row))];
      })
    );
    await this.transaction(COURSE_SNAPSHOT_STORE_NAMES, "readwrite", async (transaction) => {
      for (const storeName of COURSE_SNAPSHOT_STORE_NAMES) {
        const existing = await transaction.getAll(storeName);
        for (const row of existing) {
          const rowCourseId = storeName === "courses" ? row?.id : row?.courseId;
          if (String(rowCourseId || "") === normalizedCourseId) {
            await transaction.delete(storeName, row.id);
          }
        }
        await transaction.putMany(storeName, normalizedRows[storeName]);
      }
    });
    return Object.fromEntries(
      Object.entries(normalizedRows).map(([storeName, rows]) => [storeName, rows.map((row) => structuredClone(row))])
    );
  }

  async listPendingOutbox({ courseId, limit = 100 } = {}) {
    if (!Number.isInteger(limit) || limit < 1) {
      throw new TypeError("O limite da outbox deve ser inteiro positivo.");
    }
    const rows = await this.getAll("outbox");
    const blockerRows = rows.filter((row) => ["conflict", "rejected"].includes(row.status));
    const pendingRows = rows
      .filter((row) => row.status === "pending")
      .filter((row) => courseId === undefined || row.courseId === courseId);
    const blockedRows = causalDescendants(pendingRows, blockerRows);
    return orderOutboxEntries(
      pendingRows.filter((row) => !blockedRows.has(row))
    ).slice(0, limit);
  }

  async acknowledgeOutbox(mutationIds, { remove = true, acknowledgedAt = new Date().toISOString() } = {}) {
    if (!Array.isArray(mutationIds) || mutationIds.some((id) => !id)) {
      throw new TypeError("A confirmação da outbox exige mutationIds válidos.");
    }
    const uniqueIds = [...new Set(mutationIds.map(String))];
    return this.transaction(["outbox"], "readwrite", async (transaction) => {
      const acknowledged = [];
      for (const mutationId of uniqueIds) {
        const row = await transaction.get("outbox", mutationId);
        if (!row) continue;
        if (remove) {
          await transaction.delete("outbox", mutationId);
        } else {
          await transaction.put("outbox", {
            ...row,
            status: "acknowledged",
            acknowledgedAt,
            updatedAt: acknowledgedAt
          });
        }
        acknowledged.push(mutationId);
      }
      return acknowledged;
    });
  }

  async listConflicts({ status = "open", courseId } = {}) {
    const rows = await this.getAll("conflicts");
    return rows
      .filter((row) => status === undefined || row.status === status)
      .filter((row) => courseId === undefined || row.courseId === courseId)
      .sort((left, right) => String(left.createdAt).localeCompare(String(right.createdAt)));
  }

  async listRejectedOutbox({ courseId } = {}) {
    const rows = await this.getAll("outbox");
    return rows
      .filter((row) => row.status === "rejected")
      .filter((row) => courseId === undefined || row.courseId === courseId)
      .sort((left, right) => outboxSequence(left) - outboxSequence(right));
  }

  async resolveConflict(
    conflictId,
    resolution,
    {
      resolvedAt = new Date().toISOString(),
      uuidFactory = defaultUuidFactory
    } = {}
  ) {
    if (!new Set(["acceptRemote", "keepLocal"]).has(resolution)) {
      throw new TypeError("A resolução deve ser acceptRemote ou keepLocal.");
    }
    const conflict = await this.get("conflicts", conflictId);
    if (!conflict || conflict.status !== "open") {
      throw new Error("Conflito aberto não encontrado.");
    }
    const storeName = String(conflict.entityType || "");
    const compositeReplacement = storeName === "microsequenceCardReplacement";
    const compositeDeletion = storeName === "personalCourseDeletion";
    const compositeMutation = compositeReplacement || compositeDeletion;
    if (!compositeMutation && !Object.prototype.hasOwnProperty.call(RELATIONAL_STORE_DEFINITIONS, storeName)) {
      throw new Error(`Entidade do conflito desconhecida: "${storeName}".`);
    }
    if (!compositeMutation && ["outbox", "syncState", "conflicts"].includes(storeName)) {
      throw new Error("Conflito aponta para store interno.");
    }

    return this.transaction(
      RELATIONAL_STORE_NAMES,
      "readwrite",
      async (transaction) => {
        const currentConflict = await transaction.get("conflicts", conflictId);
        if (!currentConflict || currentConflict.status !== "open") {
          throw new Error("O conflito já foi resolvido.");
        }
        const conflictedMutation = currentConflict.mutationId
          ? await transaction.get("outbox", currentConflict.mutationId)
          : null;
        const allOutbox = await transaction.getAll("outbox");
        const descendants = conflictedMutation
          ? causalDescendants(allOutbox, [conflictedMutation])
          : new Set();
        const resolutionRemoteChanges = Array.isArray(currentConflict.remoteChanges)
          ? [...currentConflict.remoteChanges]
          : [];
        if (resolution === "acceptRemote") {
          const discardedEntries = [
            ...descendants,
            ...(conflictedMutation ? [conflictedMutation] : [])
          ].sort((left, right) => outboxSequence(right) - outboxSequence(left));
          for (const discarded of discardedEntries) {
            if (discarded === conflictedMutation && !compositeMutation) continue;
            await rollbackOutboxEntry(transaction, discarded);
          }
          for (const descendant of descendants) {
            await transaction.delete("outbox", descendant.mutationId);
          }
          const discardedMutationIds = new Set(discardedEntries.map((entry) => entry.mutationId));
          const relatedConflicts = await transaction.getAll("conflicts");
          for (const related of relatedConflicts) {
            if (
              related.id === currentConflict.id ||
              related.status !== "open" ||
              !discardedMutationIds.has(related.mutationId)
            ) continue;
            if (Array.isArray(related.remoteChanges)) {
              resolutionRemoteChanges.push(...related.remoteChanges);
            }
            await transaction.put("conflicts", {
              ...related,
              status: "resolved",
              resolution: "acceptRemote",
              resolvedAt,
              updatedAt: resolvedAt
            });
          }
        }
        if (currentConflict.mutationId) await transaction.delete("outbox", currentConflict.mutationId);

        let queuedMutation = null;
        if (compositeDeletion && resolution === "keepLocal") {
          const sequenceState = await transaction.get("syncState", OUTBOX_SEQUENCE_STATE_ID);
          const nextSequence = Number(sequenceState?.value || 0) + 1;
          queuedMutation = {
            ...(conflictedMutation || {}),
            mutationId: uuidFactory(),
            sequence: Number(conflictedMutation?.sequence || nextSequence),
            courseId: currentConflict.courseId ?? currentConflict.localRow?.courseId ?? null,
            entityType: storeName,
            entityId: currentConflict.entityId,
            operation: "delete",
            baseRevision: Number(currentConflict.remoteRevision || 0),
            changedFields: [],
            payload: structuredClone(currentConflict.localRow || conflictedMutation?.payload || {}),
            status: "pending",
            attemptCount: 0,
            lastError: null,
            createdAt: resolvedAt,
            updatedAt: resolvedAt
          };
          await transaction.add("outbox", queuedMutation);
          if (!conflictedMutation?.sequence) {
            await transaction.put("syncState", {
              id: OUTBOX_SEQUENCE_STATE_ID,
              key: OUTBOX_SEQUENCE_STATE_ID,
              value: nextSequence,
              updatedAt: resolvedAt
            });
          }
        } else if (compositeReplacement && resolution === "keepLocal") {
          const sequenceState = await transaction.get("syncState", OUTBOX_SEQUENCE_STATE_ID);
          const nextSequence = Number(sequenceState?.value || 0) + 1;
          const replacementSequence = Number(conflictedMutation?.sequence || nextSequence);
          queuedMutation = {
            mutationId: uuidFactory(),
            sequence: replacementSequence,
            courseId: currentConflict.courseId ?? currentConflict.localRow?.courseId ?? null,
            entityType: storeName,
            entityId: currentConflict.entityId,
            operation: "replace",
            baseRevision: Number(currentConflict.remoteRevision || 0),
            changedFields: [],
            payload: structuredClone(currentConflict.localRow),
            status: "pending",
            attemptCount: 0,
            lastError: null,
            createdAt: resolvedAt,
            updatedAt: resolvedAt
          };
          await transaction.add("outbox", queuedMutation);
          if (!conflictedMutation?.sequence) {
            await transaction.put("syncState", {
              id: OUTBOX_SEQUENCE_STATE_ID,
              key: OUTBOX_SEQUENCE_STATE_ID,
              value: nextSequence,
              updatedAt: resolvedAt
            });
          }
        } else if (compositeDeletion && resolution === "acceptRemote") {
          const remoteChanges = [...new Map(
            resolutionRemoteChanges.map((entry) => [`${entry.storeName}:${entry.entityId}`, entry])
          ).values()];
          for (const change of remoteChanges) {
            if (!Object.prototype.hasOwnProperty.call(RELATIONAL_STORE_DEFINITIONS, change.storeName)) {
              throw new Error(`Store remoto desconhecido no conflito de exclusão: "${change.storeName}".`);
            }
            await transaction.put(change.storeName, structuredClone(change.row));
          }
          if (currentConflict.remoteRow) {
            await transaction.put("courses", structuredClone(currentConflict.remoteRow));
          }
        } else if (compositeReplacement && resolution === "acceptRemote") {
          const remoteChanges = [...new Map(
            resolutionRemoteChanges.map((entry) => [`${entry.storeName}:${entry.entityId}`, entry])
          ).values()];
          if (!remoteChanges.length) {
            throw new Error("Sincronize a versão remota completa antes de aceitar este conflito composto.");
          }
          for (const change of remoteChanges) {
            if (!Object.prototype.hasOwnProperty.call(RELATIONAL_STORE_DEFINITIONS, change.storeName)) {
              throw new Error(`Store remoto desconhecido no conflito composto: "${change.storeName}".`);
            }
            await transaction.put(change.storeName, structuredClone(change.row));
          }
        } else if (!compositeMutation && resolution === "acceptRemote") {
          const canonicalEntityId = String(
            currentConflict.canonicalEntityId || currentConflict.remoteRow?.id || currentConflict.entityId
          );
          const currentRow = await transaction.get(storeName, currentConflict.entityId);
          const currentRevision = Number(currentRow?.revision || 0);
          const conflictRemoteRevision = Number(currentConflict.remoteRevision || 0);
          const currentRevisionBelongsToLocalBranch = [...descendants].some(
            (row) => row.entityType === storeName && row.entityId === currentConflict.entityId
          );
          if (currentRevision > conflictRemoteRevision && !currentRevisionBelongsToLocalBranch) {
            throw new Error(
              "A versão remota registrada neste conflito ficou obsoleta; sincronize antes de resolver."
            );
          }
          const remoteRow = {
            ...(currentConflict.remoteRow || currentConflict.localRow || {}),
            id: canonicalEntityId,
            ...(!currentConflict.remoteRow ? {
              revision: Number(currentConflict.remoteRevision || 0),
              updatedAt: resolvedAt,
              deletedAt: resolvedAt
            } : {})
          };
          if (canonicalEntityId !== currentConflict.entityId) {
            await remapEntityReferences(
              transaction,
              currentConflict.entityId,
              canonicalEntityId
            );
            await transaction.delete(storeName, currentConflict.entityId);
          }
          await transaction.put(storeName, remoteRow);
          for (const change of resolutionRemoteChanges) {
            await transaction.put(change.storeName, structuredClone(change.row));
          }
        } else if (!compositeMutation) {
          const sequenceState = await transaction.get("syncState", OUTBOX_SEQUENCE_STATE_ID);
          const nextSequence = Number(sequenceState?.value || 0) + 1;
          const sameEntityDescendants = [...descendants]
            .filter((row) => row.entityType === storeName && row.entityId === currentConflict.entityId)
            .sort((left, right) => outboxSequence(left) - outboxSequence(right));
          const latestLocalPayload = sameEntityDescendants.at(-1)?.payload;
          for (const descendant of sameEntityDescendants) {
            await transaction.delete("outbox", descendant.mutationId);
            descendants.delete(descendant);
          }
          const remoteRevision = Number(currentConflict.remoteRevision || 0);
          const canonicalEntityId = String(
            currentConflict.canonicalEntityId || currentConflict.remoteRow?.id || currentConflict.entityId
          );
          const localRow = {
            ...(latestLocalPayload || currentConflict.localRow || {}),
            id: canonicalEntityId,
            revision: Math.max(Number(currentConflict.localRow?.revision || 0), remoteRevision + 1),
            updatedAt: resolvedAt
          };
          if (canonicalEntityId !== currentConflict.entityId) {
            await remapEntityReferences(
              transaction,
              currentConflict.entityId,
              canonicalEntityId
            );
            await transaction.delete(storeName, currentConflict.entityId);
          }
          await transaction.put(storeName, localRow);
          queuedMutation = {
            mutationId: uuidFactory(),
            sequence: Number(conflictedMutation?.sequence || nextSequence),
            courseId: currentConflict.courseId ?? localRow.courseId ?? null,
            entityType: storeName,
            entityId: canonicalEntityId,
            operation: localRow.deletedAt ? "delete" : "upsert",
            baseRevision: remoteRevision,
            changedFields: Object.keys(localRow)
              .filter((fieldName) => !["revision", "updatedAt", "deletedAt"].includes(fieldName))
              .sort(),
            payload: structuredClone(localRow),
            status: "pending",
            attemptCount: 0,
            lastError: null,
            createdAt: resolvedAt,
            updatedAt: resolvedAt
          };
          await transaction.add("outbox", queuedMutation);
          if (!conflictedMutation?.sequence) {
            await transaction.put("syncState", {
              id: OUTBOX_SEQUENCE_STATE_ID,
              key: OUTBOX_SEQUENCE_STATE_ID,
              value: nextSequence,
              updatedAt: resolvedAt
            });
          }
        }

        const resolvedConflict = {
          ...currentConflict,
          status: "resolved",
          resolution,
          resolvedAt,
          updatedAt: resolvedAt,
          replacementMutationId: queuedMutation?.mutationId || null
        };
        await transaction.put("conflicts", resolvedConflict);
        return { conflict: resolvedConflict, queuedMutation };
      }
    );
  }

  async applyRemotePage({
    changes,
    cursor,
    courseId = null,
    deviceId = null,
    syncStateId = `${deviceId || "device"}:${courseId || "all"}`,
    receivedAt = new Date().toISOString(),
    uuidFactory = defaultUuidFactory
  } = {}) {
    if (!Array.isArray(changes)) {
      throw new TypeError("A página remota exige uma lista de alterações.");
    }
    const normalizedChanges = changes.map((change) => {
      const storeName = String(change?.storeName || change?.entityType || "");
      if (!Object.prototype.hasOwnProperty.call(RELATIONAL_STORE_DEFINITIONS, storeName)) {
        throw new Error(`Entidade remota desconhecida: "${storeName}".`);
      }
      if (["outbox", "syncState", "conflicts"].includes(storeName)) {
        throw new Error(`A página remota não pode gravar o store interno "${storeName}".`);
      }
      const row = change.row || change.payload;
      const entityId = String(change.entityId || row?.id || "");
      if (!entityId) throw new Error("Alteração remota sem entityId.");
      return { ...change, storeName, entityId, row };
    });
    const storeNames = [...new Set([
      ...normalizedChanges.map((change) => change.storeName),
      "outbox",
      "conflicts",
      "syncState"
    ])];

    return this.transaction(storeNames, "readwrite", async (transaction) => {
      const pending = (await transaction.getAll("outbox")).filter(
        (row) => ["pending", "inflight", "conflict"].includes(row.status)
      );
      const compositeStates = pending
        .filter((row) => [
          "microsequenceCardReplacement",
          "personalCourseDeletion"
        ].includes(row.entityType))
        .map((mutation) => {
          const affected = compositeAffectedChangeIndexes(mutation, normalizedChanges);
          const aggregateRevisions = [...affected]
            .map((index) => normalizedChanges[index])
            .filter((change) =>
              change.entityId === mutation.entityId &&
              change.storeName === (
                mutation.entityType === "personalCourseDeletion" ? "courses" : "microsequences"
              )
            )
            .map((change) => Number(change.revision ?? change.row?.revision ?? 0));
          return {
            mutation,
            affected,
            aggregateRevision: aggregateRevisions.length ? Math.max(...aggregateRevisions) : null
          };
        });
      const openConflicts = (await transaction.getAll("conflicts")).filter(
        (row) => row.status === "open" && row.mutationId
      );
      const conflictsByMutationId = new Map(
        openConflicts.map((row) => [row.mutationId, row])
      );
      const applied = [];
      const conflicts = [];
      for (const [changeIndex, change] of normalizedChanges.entries()) {
        const currentRow = await transaction.get(change.storeName, change.entityId);
        const remoteRow = change.operation === "delete"
          ? {
              ...(change.row || currentRow || {}),
              id: change.entityId,
              revision: Number(change.revision ?? change.row?.revision ?? currentRow?.revision ?? 0),
              updatedAt: change.updatedAt || receivedAt,
              deletedAt: change.deletedAt || change.row?.deletedAt || receivedAt
            }
          : { ...change.row, id: change.entityId };
        if (!remoteRow || Object.keys(remoteRow).length === 1) {
          throw new Error(`Alteração remota sem payload para ${change.storeName}:${change.entityId}.`);
        }
        const pendingMutation = pending.find(
          (row) => row.entityType === change.storeName && row.entityId === change.entityId
        );
        const currentRevision = Number(currentRow?.revision || 0);
        const remoteRevision = Number(remoteRow.revision || 0);
        if (pendingMutation) {
          const pendingBaseRevision = Number(pendingMutation.baseRevision || 0);
          // Um feed até a revisão de base apenas confirma o estado sobre o qual
          // a edição local foi criada; aplicá-lo ou tratá-lo como divergência
          // faria a própria sincronização conflitar consigo mesma.
          if (remoteRevision <= pendingBaseRevision) continue;
          const previousConflict = conflictsByMutationId.get(pendingMutation.mutationId);
          const conflict = {
            ...(previousConflict || {}),
            id: previousConflict?.id || uuidFactory(),
            courseId: change.courseId ?? remoteRow.courseId ?? currentRow?.courseId ?? courseId,
            entityType: change.storeName,
            entityId: change.entityId,
            mutationId: pendingMutation.mutationId,
            baseRevision: pendingBaseRevision,
            remoteRevision,
            localRow: previousConflict?.localRow || currentRow || pendingMutation.payload || null,
            remoteRow,
            status: "open",
            createdAt: previousConflict?.createdAt || receivedAt,
            updatedAt: receivedAt,
            resolvedAt: null,
            resolution: null
          };
          await transaction.put("conflicts", conflict);
          await transaction.put("outbox", {
            ...pendingMutation,
            status: "conflict",
            lastError: "Conflito de revisão",
            updatedAt: receivedAt
          });
          conflictsByMutationId.set(pendingMutation.mutationId, conflict);
          conflicts.push(conflict);
          continue;
        }
        const compositeState = compositeStates.find((state) => state.affected.has(changeIndex));
        if (compositeState) {
          const pendingBaseRevision = Number(compositeState.mutation.baseRevision || 0);
          if (
            compositeState.aggregateRevision !== null &&
            compositeState.aggregateRevision <= pendingBaseRevision
          ) {
            continue;
          }
          const previousConflict = conflictsByMutationId.get(compositeState.mutation.mutationId);
          const remoteChange = {
            storeName: change.storeName,
            entityId: change.entityId,
            operation: change.operation || (remoteRow.deletedAt ? "delete" : "upsert"),
            row: remoteRow
          };
          const remoteChanges = [
            ...(Array.isArray(previousConflict?.remoteChanges) ? previousConflict.remoteChanges : []),
            remoteChange
          ];
          const uniqueRemoteChanges = [...new Map(
            remoteChanges.map((entry) => [`${entry.storeName}:${entry.entityId}`, entry])
          ).values()];
          const conflict = {
            ...(previousConflict || {}),
            id: previousConflict?.id || uuidFactory(),
            courseId: change.courseId ?? remoteRow.courseId ?? compositeState.mutation.courseId ?? courseId,
            entityType: compositeState.mutation.entityType,
            entityId: compositeState.mutation.entityId,
            mutationId: compositeState.mutation.mutationId,
            baseRevision: pendingBaseRevision,
            remoteRevision: Number(
              compositeState.aggregateRevision ?? previousConflict?.remoteRevision ?? remoteRevision
            ),
            localRow: previousConflict?.localRow || compositeState.mutation.payload,
            remoteRow: (
              change.entityId === compositeState.mutation.entityId &&
              ["microsequences", "courses"].includes(change.storeName)
            ) ? remoteRow : previousConflict?.remoteRow || null,
            remoteChanges: uniqueRemoteChanges,
            status: "open",
            createdAt: previousConflict?.createdAt || receivedAt,
            updatedAt: receivedAt,
            resolvedAt: null,
            resolution: null
          };
          await transaction.put("conflicts", conflict);
          await transaction.put("outbox", {
            ...compositeState.mutation,
            status: "conflict",
            lastError: compositeState.mutation.entityType === "personalCourseDeletion"
              ? "Conflito de revisão na exclusão do curso"
              : "Conflito de revisão da microssequência",
            updatedAt: receivedAt
          });
          conflictsByMutationId.set(compositeState.mutation.mutationId, conflict);
          if (!previousConflict) conflicts.push(conflict);
          continue;
        }
        if (
          !currentRow ||
          remoteRevision > currentRevision ||
          (remoteRevision === currentRevision && stableJson(currentRow) !== stableJson(remoteRow))
        ) {
          await transaction.put(change.storeName, remoteRow);
          applied.push({ storeName: change.storeName, row: remoteRow });
        }
      }
      await transaction.put("syncState", {
        id: syncStateId,
        courseId,
        deviceId,
        cursor,
        updatedAt: receivedAt
      });
      return { applied, conflicts, cursor };
    });
  }

  async readStores(storeNames = PROJECT_ROW_STORE_NAMES) {
    const normalizedNames = normalizeStoreNames(storeNames);
    return this.transaction(normalizedNames, "readonly", async (transaction) => {
      const entries = await Promise.all(
        normalizedNames.map(async (storeName) => [storeName, await transaction.getAll(storeName)])
      );
      return Object.fromEntries(entries);
    });
  }

  async flush() {
    this.#assertOpen();
  }

  close() {
    if (!this.#closed) {
      this.#database.close();
      this.#closed = true;
    }
  }

  static deleteDatabase(indexedDb = globalThis.indexedDB) {
    if (!indexedDb || typeof indexedDb.deleteDatabase !== "function") {
      throw new Error("IndexedDB não está disponível neste ambiente.");
    }
    return new Promise((resolve, reject) => {
      const request = indexedDb.deleteDatabase(RELATIONAL_DATABASE_NAME);
      request.addEventListener("success", () => resolve(), { once: true });
      request.addEventListener(
        "blocked",
        () => reject(new Error("A remoção do banco relacional foi bloqueada.")),
        { once: true }
      );
      request.addEventListener(
        "error",
        () => reject(request.error || new Error("Não foi possível remover o banco relacional.")),
        { once: true }
      );
    });
  }
}

export async function createIndexedDbRelationalStore(indexedDb = globalThis.indexedDB) {
  return IndexedDbRelationalStore.open(indexedDb);
}
