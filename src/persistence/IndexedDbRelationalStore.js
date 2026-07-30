import { RelationalTransaction } from "./RelationalTransaction.js";
import { assertValidRelationalCourse } from "./validateRelationalCourse.js";

// O namespace anterior permaneceu aberto em instalações já atualizadas e podia
// deixar o Chrome em estado "connection is closing" antes do bootstrap. Esta
// geração é deliberadamente isolada: a réplica oficial é reconstruída do
// servidor, sem depender de nem disputar a conexão do namespace encerrado.
export const RELATIONAL_DATABASE_NAME = "aralearn-relational-v4-r2";
export const RELATIONAL_DATABASE_VERSION = 2;

const index = (name, keyPath, options = {}) => ({ name, keyPath, options });
const OUTBOX_SEQUENCE_STATE_ID = "outbox.sequence";
const REPLICA_USER_STATE_ID = "replica.userId";
const CATALOG_REPLICA_STATE_PREFIX = "catalog.replica";
const LOCAL_AUTHORING_STATE_PREFIX = "authoring.localDraft";
const SUPABASE_USER_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

const UNRESOLVED_OUTBOX_STATUSES = new Set(["pending", "inflight", "rejected", "blocked"]);

export class CatalogReplicaReconciliationRequiredError extends Error {
  constructor(courseId, mutationIds) {
    super("A atualização do curso foi adiada para preservar alterações locais ainda não resolvidas.");
    this.name = "CatalogReplicaReconciliationRequiredError";
    this.code = "catalog_replica_reconciliation_required";
    this.courseId = courseId;
    this.mutationIds = [...mutationIds];
    this.catalogReplicaReconciliationRequired = true;
  }
}

export class LocalCourseDraftNotFoundError extends Error {
  constructor(courseId) {
    super("Não existe um localDraft ativo para restaurar neste curso.");
    this.name = "LocalCourseDraftNotFoundError";
    this.code = "local_course_draft_not_found";
    this.courseId = courseId;
  }
}

export class LocalCourseDraftChangedError extends Error {
  constructor(courseId, expectedRevision, actualRevision) {
    super("O localDraft mudou desde a consulta e não pode ser descartado com segurança.");
    this.name = "LocalCourseDraftChangedError";
    this.code = "local_course_draft_changed";
    this.courseId = courseId;
    this.expectedRevision = expectedRevision;
    this.actualRevision = actualRevision;
  }
}

export class OfficialCourseRevisionChangedError extends Error {
  constructor(courseId, expectedRevision, actualRevision = null) {
    super("A revisão oficial selecionada mudou e a restauração precisa ser refeita.");
    this.name = "OfficialCourseRevisionChangedError";
    this.code = "official_course_revision_changed";
    this.courseId = courseId;
    this.expectedRevision = structuredClone(expectedRevision);
    this.actualRevision = actualRevision == null ? null : structuredClone(actualRevision);
    this.retryable = true;
    this.courseSelectionStale = true;
  }
}

export class IndexedDbConnectionReplacedError extends Error {
  constructor(cause = null) {
    super("A conexão local foi substituída por outra aba ou por uma atualização do aplicativo.");
    this.name = "IndexedDbConnectionReplacedError";
    this.code = "indexeddb_connection_replaced";
    this.retryable = true;
    if (cause) this.cause = cause;
  }
}

export const SYNCED_PERSONAL_STORE_NAMES = Object.freeze([
  "courseSelections",
  "lessonProgress",
  "cardProgress",
  "comments",
  "studyPaths",
  "studyPathCourses"
]);


function outboxSequence(entry) {
  const explicit = Number(entry?.sequence);
  if (Number.isFinite(explicit)) return explicit;
  const createdAt = Date.parse(entry?.createdAt || "");
  return Number.isFinite(createdAt) ? createdAt : Number.MAX_SAFE_INTEGER;
}

function compareOutbox(left, right) {
  return outboxSequence(left) - outboxSequence(right) ||
    String(left?.createdAt || "").localeCompare(String(right?.createdAt || "")) ||
    String(left?.mutationId || "").localeCompare(String(right?.mutationId || ""));
}

function isUnresolvedOutboxEntry(entry) {
  return UNRESOLVED_OUTBOX_STATUSES.has(String(entry?.status || ""));
}

const COMMON_ENTITY_INDEXES = [index("byCourseId", "courseId")];

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
      index("byStatus", "status"),
      index("byContractKey", "contractKey")
    ]
  },
  modules: {
    keyPath: "id",
    indexes: [
      index("byCourseId", "courseId"),
      index("byCoursePosition", ["courseId", "position"]),
      index("byCourseContractKey", ["courseId", "contractKey"])
    ]
  },
  guides: {
    keyPath: "id",
    indexes: [index("byOwner", ["ownerType", "ownerId"]), ...COMMON_ENTITY_INDEXES]
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
  cardSources: { keyPath: "id", indexes: positionedChildIndexes("CardId", "cardId") },
  cardTopics: { keyPath: "id", indexes: positionedChildIndexes("CardId", "cardId") },
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
  matrixItems: { keyPath: "id", indexes: positionedChildIndexes("BlockId", "blockId") },
  points: { keyPath: "id", indexes: positionedChildIndexes("BlockId", "blockId") },
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
  flowCases: { keyPath: "id", indexes: positionedChildIndexes("FlowNodeId", "flowNodeId") },
  flowPractices: {
    keyPath: "id",
    indexes: [
      index("byOwnerId", "ownerId"),
      index("byOwner", ["ownerType", "ownerId"]),
      ...COMMON_ENTITY_INDEXES
    ]
  },
  flowPracticeEntries: { keyPath: "id", indexes: positionedChildIndexes("PracticeId", "practiceId") },
  flowPracticeOptions: { keyPath: "id", indexes: positionedChildIndexes("EntryId", "entryId") },
  flowPracticeVariants: { keyPath: "id", indexes: positionedChildIndexes("EntryId", "entryId") },
  flowShapeOptions: { keyPath: "id", indexes: positionedChildIndexes("PracticeId", "practiceId") },
  courseSelections: {
    keyPath: "id",
    indexes: [
      index("byCourseId", "courseId"),
      index("byUserId", "userId"),
      index("byCourseAndUser", ["courseId", "userId"]),
      index("byUpdatedAt", "updatedAt"),
      index("byDeletedAt", "deletedAt")
    ]
  },
  lessonProgress: {
    keyPath: "id",
    indexes: [
      index("bySelectionId", "selectionId"),
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
      index("bySelectionId", "selectionId"),
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
      index("bySelectionId", "selectionId"),
      index("byCardId", "cardId"),
      index("byUserId", "userId"),
      index("byUserAndCard", ["userId", "cardId"]),
      index("byCourseId", "courseId"),
      index("byUpdatedAt", "updatedAt"),
      index("byDeletedAt", "deletedAt")
    ]
  },
  studyPaths: {
    keyPath: "id",
    indexes: [
      index("byOwnerId", "ownerId"),
      index("byOwnerPosition", ["ownerId", "position"]),
      index("byUpdatedAt", "updatedAt"),
      index("byDeletedAt", "deletedAt")
    ]
  },
  studyPathCourses: {
    keyPath: "id",
    indexes: [
      index("byPathId", "pathId"),
      index("byPathPosition", ["pathId", "position"]),
      index("bySelectionId", "selectionId"),
      index("byOwnerSelection", ["ownerId", "selectionId"], { unique: true }),
      index("byCourseId", "courseId"),
      index("byOwnerId", "ownerId"),
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
  }
});

export const RELATIONAL_STORE_NAMES = Object.freeze(Object.keys(RELATIONAL_STORE_DEFINITIONS));

export const PROJECT_ROW_STORE_NAMES = Object.freeze(
  RELATIONAL_STORE_NAMES.filter((name) => ![
    ...SYNCED_PERSONAL_STORE_NAMES,
    "outbox",
    "syncState"
  ].includes(name))
);

export const OFFICIAL_COURSE_STORE_NAMES = Object.freeze(
  PROJECT_ROW_STORE_NAMES.filter((name) => name !== "projectMeta")
);

const REMOTE_CHANGE_STORE_SET = new Set([
  ...SYNCED_PERSONAL_STORE_NAMES,
  ...OFFICIAL_COURSE_STORE_NAMES
]);

function rowCourseId(storeName, row) {
  return String(storeName === "courses" ? row?.id || "" : row?.courseId || "");
}

function normalizeOfficialCourseGraph(courseId, graph) {
  if (!graph || typeof graph !== "object" || Array.isArray(graph)) {
    throw new TypeError("Grafo relacional oficial inválido.");
  }
  const normalized = Object.fromEntries(OFFICIAL_COURSE_STORE_NAMES.map((storeName) => {
    const rows = graph[storeName] ?? [];
    if (!Array.isArray(rows)) throw new TypeError(`Grafo oficial inválido em ${storeName}.`);
    const clonedRows = rows.map((row) => structuredClone(row));
    clonedRows.forEach((row) => {
      if (!row?.id || rowCourseId(storeName, row) !== courseId) {
        throw new Error(`Linha de ${storeName} fora do curso oficial solicitado.`);
      }
    });
    return [storeName, clonedRows];
  }));
  if (normalized.courses.length !== 1 || String(normalized.courses[0].id) !== courseId) {
    throw new Error("O grafo oficial precisa conter exatamente o curso solicitado.");
  }
  return normalized;
}

function validateOfficialCourseGraph(normalizedRows) {
  const course = normalizedRows.courses[0];
  const projectId = String(course?.projectId || "");
  const hasScope = course?.contractScope != null;
  assertValidRelationalCourse({
    projectMeta: [{
      id: projectId,
      contract: "aralearn.contract",
      version: 4,
      kind: "project",
      scope: hasScope ? course.contractScope : null,
      hasScope,
      updatedAt: null,
      deletedAt: null
    }],
    ...normalizedRows
  });
}

function normalizePersonalSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) {
    throw new TypeError("Snapshot pessoal da réplica inválido.");
  }
  return Object.fromEntries(SYNCED_PERSONAL_STORE_NAMES.map((storeName) => {
    const rows = snapshot[storeName] ?? [];
    if (!Array.isArray(rows)) throw new TypeError(`Snapshot pessoal inválido em ${storeName}.`);
    rows.forEach((row) => {
      if (!row?.id) throw new Error(`Linha de ${storeName} sem identidade persistente.`);
    });
    return [storeName, rows.map((row) => structuredClone(row))];
  }));
}

function normalizeManifestEntry(entry) {
  const courseId = String(entry?.courseId || entry?.course_id || "");
  if (!courseId) throw new Error("Manifesto contém curso sem UUID.");
  const publicationSeq = Number(entry?.publicationSeq ?? entry?.publication_seq ?? 0);
  return {
    courseId,
    publicationSeq: Number.isSafeInteger(publicationSeq) && publicationSeq >= 0 ? publicationSeq : 0,
    contentHash: String(entry?.contentHash || entry?.content_hash || "")
  };
}

export function localCourseAuthoringStateId(courseId) {
  return `${LOCAL_AUTHORING_STATE_PREFIX}:${String(courseId || "")}`;
}

function localCourseDraftFromRow(row, courseId) {
  if (!row || row.value?.status !== "dirty") return null;
  const value = row.value;
  const revision = String(value.revision || "").trim();
  if (!revision) {
    throw new Error("O localDraft persistido não possui uma revisão canônica válida.");
  }
  return {
    courseId,
    status: "dirty",
    revision,
    basePublicationSeq: Number(value.basePublicationSeq || 0),
    baseContentHash: String(value.baseContentHash || ""),
    createdAt: String(value.createdAt || ""),
    updatedAt: String(value.updatedAt || "")
  };
}

async function deleteCourseContent(transaction, courseId) {
  for (const storeName of OFFICIAL_COURSE_STORE_NAMES) {
    if (storeName === "courses") {
      await transaction.delete(storeName, courseId);
      continue;
    }
    const rows = await transaction.getAllByIndex(storeName, "byCourseId", courseId);
    for (const row of rows) await transaction.delete(storeName, row.id);
  }
  await transaction.delete("syncState", `${CATALOG_REPLICA_STATE_PREFIX}:${courseId}`);
  await transaction.delete("syncState", localCourseAuthoringStateId(courseId));
}

async function deletePersonalCourseState(transaction, courseId) {
  for (const storeName of ["lessonProgress", "cardProgress", "comments", "studyPathCourses"]) {
    const rows = await transaction.getAllByIndex(storeName, "byCourseId", courseId);
    for (const row of rows) await transaction.delete(storeName, row.id);
  }
  const outboxRows = await transaction.getAllByIndex("outbox", "byCourseId", courseId);
  for (const row of outboxRows) await transaction.delete("outbox", row.mutationId);
}

async function pruneOrphanedPersonalCourseState(transaction, courseId, normalizedRows) {
  const validLessonIds = new Set(normalizedRows.lessons.map((row) => String(row.id)));
  const validCardIds = new Set(normalizedRows.cards.map((row) => String(row.id)));
  for (const [storeName, targetField, validIds] of [
    ["lessonProgress", "lessonId", validLessonIds],
    ["cardProgress", "cardId", validCardIds],
    ["comments", "cardId", validCardIds]
  ]) {
    const rows = await transaction.getAllByIndex(storeName, "byCourseId", courseId);
    for (const row of rows) {
      if (validIds.has(String(row?.[targetField] || ""))) continue;
      await transaction.delete(storeName, row.id);
    }
  }
}

async function unresolvedCourseMutationIds(transaction, courseId) {
  return (await transaction.getAllByIndex("outbox", "byCourseId", courseId))
    .filter(isUnresolvedOutboxEntry)
    .sort(compareOutbox)
    .map((row) => String(row.mutationId));
}

async function writeOfficialCourseReplica(
  transaction,
  courseId,
  normalizedRows,
  { publicationSeq, contentHash, receivedAt }
) {
  await deleteCourseContent(transaction, courseId);
  for (const storeName of OFFICIAL_COURSE_STORE_NAMES) {
    await transaction.putMany(storeName, normalizedRows[storeName]);
  }
  await pruneOrphanedPersonalCourseState(transaction, courseId, normalizedRows);
  const stateId = `${CATALOG_REPLICA_STATE_PREFIX}:${courseId}`;
  await transaction.put("syncState", {
    id: stateId,
    key: stateId,
    courseId,
    value: {
      publicationSeq: Number(publicationSeq || 0),
      contentHash: String(contentHash || "")
    },
    updatedAt: receivedAt
  });
}

function sameKeyPath(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function ensureStoreIndexes(store, definition) {
  for (const entry of definition.indexes || []) {
    const current = store.indexNames.contains(entry.name) ? store.index(entry.name) : null;
    const compatible = current &&
      sameKeyPath(current.keyPath, entry.keyPath) &&
      current.unique === Boolean(entry.options?.unique) &&
      current.multiEntry === Boolean(entry.options?.multiEntry);
    if (compatible) continue;
    if (current) store.deleteIndex(entry.name);
    store.createIndex(entry.name, entry.keyPath, entry.options);
  }
}

function ensureRelationalSchema(database, transaction) {
  for (const [storeName, definition] of Object.entries(RELATIONAL_STORE_DEFINITIONS)) {
    const existingStore = database.objectStoreNames.contains(storeName)
      ? transaction.objectStore(storeName)
      : null;
    const store = existingStore
      ? sameKeyPath(existingStore.keyPath, definition.keyPath)
        ? existingStore
        : (() => {
        database.deleteObjectStore(storeName);
        return database.createObjectStore(storeName, { keyPath: definition.keyPath });
      })()
      : database.createObjectStore(storeName, { keyPath: definition.keyPath });
    ensureStoreIndexes(store, definition);
  }
}

function openDatabase(indexedDb, databaseName) {
  return new Promise((resolve, reject) => {
    const request = indexedDb.open(databaseName, RELATIONAL_DATABASE_VERSION);
    request.addEventListener("upgradeneeded", () => {
      ensureRelationalSchema(request.result, request.transaction);
    });
    let blockedTimer = null;
    request.addEventListener("blocked", () => {
      // A aba que recebeu versionchange fecha sua conexão antes da próxima
      // abertura. Aguardar evita exibir uma falha transitória ao usuário.
      blockedTimer ||= globalThis.setTimeout(() => reject(
        new Error("A abertura do banco relacional continua bloqueada por outra instância.")
      ), 3_000);
    }, { once: true });
    request.addEventListener("error", () => reject(
      request.error || new Error("Não foi possível abrir o banco relacional.")
    ), { once: true });
    request.addEventListener("success", () => {
      if (blockedTimer) globalThis.clearTimeout(blockedTimer);
      resolve(request.result);
    }, { once: true });
  });
}

function normalizeStoreNames(storeNames) {
  const normalized = [...new Set((Array.isArray(storeNames) ? storeNames : [storeNames]).map(String))];
  if (!normalized.length) throw new Error("Informe ao menos um object store para a transação.");
  normalized.forEach((storeName) => {
    if (!Object.prototype.hasOwnProperty.call(RELATIONAL_STORE_DEFINITIONS, storeName)) {
      throw new Error(`Object store relacional desconhecido: "${storeName}".`);
    }
  });
  return normalized;
}

function databaseIsClosing(error) {
  return error?.name === "InvalidStateError" && /(?:connection|database).*(?:clos|close)/iu.test(
    String(error?.message || "")
  );
}

export function relationalDatabaseNameForUser(userId) {
  if (userId === null || userId === undefined || userId === "") return RELATIONAL_DATABASE_NAME;
  const normalizedUserId = String(userId).trim().toLowerCase();
  if (!SUPABASE_USER_ID_PATTERN.test(normalizedUserId)) {
    throw new TypeError("A réplica local exige o UUID autenticado do usuário.");
  }
  return `${RELATIONAL_DATABASE_NAME}:user:${normalizedUserId}`;
}

export class IndexedDbRelationalStore {
  #database;
  #closed = false;
  #connectionInvalidated = false;
  #connectionInvalidationListeners = new Set();
  #userId;

  constructor(database, { userId = null } = {}) {
    if (!database || typeof database.transaction !== "function") {
      throw new TypeError("Banco IndexedDB relacional inválido.");
    }
    this.#database = database;
    this.#userId = userId ? String(userId).toLowerCase() : null;
    database.addEventListener("versionchange", () => this.#invalidateConnection(), { once: true });
  }

  static async open(indexedDb = globalThis.indexedDB, { userId = null } = {}) {
    if (!indexedDb || typeof indexedDb.open !== "function") {
      throw new Error("IndexedDB não está disponível neste ambiente.");
    }
    const databaseName = relationalDatabaseNameForUser(userId);
    return new IndexedDbRelationalStore(await openDatabase(indexedDb, databaseName), { userId });
  }

  get name() { return this.#database.name; }
  get version() { return this.#database.version; }
  get objectStoreNames() { return Array.from(this.#database.objectStoreNames); }
  get userId() { return this.#userId; }

  #assertOpen() {
    if (this.#closed) throw new Error("O banco relacional já está fechado.");
    if (this.#connectionInvalidated) throw new IndexedDbConnectionReplacedError();
  }

  #invalidateConnection(cause = null) {
    if (this.#closed || this.#connectionInvalidated) return;
    this.#connectionInvalidated = true;
    try { this.#database.close(); } catch { /* A conexão já pode estar fechando. */ }
    const error = new IndexedDbConnectionReplacedError(cause);
    this.#connectionInvalidationListeners.forEach((listener) => {
      try { listener(error); } catch (listenerError) {
        console.error("Falha ao reagir à substituição da conexão local.", listenerError);
      }
    });
  }

  beginTransaction(storeNames, mode = "readonly") {
    this.#assertOpen();
    const normalizedNames = normalizeStoreNames(storeNames);
    try {
      return new RelationalTransaction(
        this.#database.transaction(normalizedNames, mode),
        normalizedNames
      );
    } catch (error) {
      if (databaseIsClosing(error)) {
        this.#invalidateConnection(error);
        throw new IndexedDbConnectionReplacedError(error);
      }
      throw error;
    }
  }

  onConnectionInvalidated(listener) {
    if (typeof listener !== "function") throw new TypeError("Listener de conexão IndexedDB inválido.");
    this.#connectionInvalidationListeners.add(listener);
    return () => this.#connectionInvalidationListeners.delete(listener);
  }

  async transaction(storeNames, mode, callback) {
    if (typeof callback !== "function") throw new TypeError("A transação relacional exige um callback.");
    const transaction = this.beginTransaction(storeNames, mode);
    try {
      const result = await callback(transaction);
      transaction.commit();
      await transaction.done();
      return result;
    } catch (error) {
      try { transaction.abort(); } catch { /* A falha pode já ter abortado a transação. */ }
      await transaction.done().catch(() => undefined);
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
    if (storeName === "outbox" && !Number.isFinite(Number(value?.sequence))) {
      return this.#putOutboxWithSequence([value]).then((keys) => keys[0]);
    }
    return this.transaction([storeName], "readwrite", (transaction) => transaction.put(storeName, value));
  }

  delete(storeName, key) {
    return this.transaction([storeName], "readwrite", (transaction) => transaction.delete(storeName, key));
  }

  putMany(storeName, values) {
    if (!Array.isArray(values)) throw new TypeError("putMany exige uma lista de linhas.");
    if (storeName === "outbox" && values.some((value) => !Number.isFinite(Number(value?.sequence)))) {
      return this.#putOutboxWithSequence(values);
    }
    return this.transaction([storeName], "readwrite", (transaction) => transaction.putMany(storeName, values));
  }

  async #putOutboxWithSequence(values) {
    if (!Array.isArray(values)) throw new TypeError("A outbox exige uma lista de mutações.");
    return this.transaction(["outbox", "syncState"], "readwrite", async (transaction) => {
      const state = await transaction.get("syncState", OUTBOX_SEQUENCE_STATE_ID);
      const existing = await transaction.getAll("outbox");
      let nextSequence = Math.max(
        Number(state?.value || 0),
        ...existing.map((row) => Number(row.sequence || 0)).filter(Number.isFinite)
      );
      const normalized = values.map((value) => {
        const explicit = Number(value?.sequence);
        if (Number.isSafeInteger(explicit) && explicit > 0) {
          nextSequence = Math.max(nextSequence, explicit);
          return value;
        }
        nextSequence += 1;
        return { ...value, sequence: nextSequence };
      });
      const keys = await transaction.putMany("outbox", normalized);
      await transaction.put("syncState", {
        id: OUTBOX_SEQUENCE_STATE_ID,
        key: OUTBOX_SEQUENCE_STATE_ID,
        value: nextSequence,
        updatedAt: new Date().toISOString()
      });
      return keys;
    });
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
    await this.put("syncState", {
      id,
      key: id,
      value: structuredClone(value),
      updatedAt: new Date().toISOString()
    });
    return structuredClone(value);
  }

  async bindReplicaToUser(userId) {
    const normalizedUserId = String(userId || "").trim().toLowerCase();
    relationalDatabaseNameForUser(normalizedUserId);
    if (!this.#userId || this.#userId !== normalizedUserId) {
      throw new Error("A réplica deve ser aberta no banco físico do usuário antes de ser vinculada.");
    }
    const currentUserId = await this.getSyncState(REPLICA_USER_STATE_ID);
    if (currentUserId && currentUserId !== normalizedUserId) {
      throw new Error("O banco relacional pertence a outra conta e não pode ser reutilizado.");
    }
    await this.putSyncState(REPLICA_USER_STATE_ID, normalizedUserId);
    return currentUserId !== normalizedUserId;
  }

  async getOfficialCourseReplicaState(courseId) {
    return this.getSyncState(`${CATALOG_REPLICA_STATE_PREFIX}:${String(courseId || "")}`);
  }

  async getLocalCourseDraft(courseId) {
    const normalizedCourseId = String(courseId || "").trim();
    if (!normalizedCourseId) throw new TypeError("O UUID do curso é obrigatório.");
    return (await this.getLocalCourseDrafts([normalizedCourseId]))[0];
  }

  async getLocalCourseDrafts(courseIds) {
    if (!Array.isArray(courseIds)) {
      throw new TypeError("A consulta de localDrafts exige uma lista de cursos.");
    }
    const normalizedCourseIds = courseIds.map((courseId) => {
      const normalizedCourseId = String(courseId || "").trim();
      if (!normalizedCourseId) throw new TypeError("O UUID do curso é obrigatório.");
      return normalizedCourseId;
    });
    return this.transaction(["syncState"], "readonly", async (transaction) =>
      Promise.all(normalizedCourseIds.map(async (courseId) => localCourseDraftFromRow(
        await transaction.get("syncState", localCourseAuthoringStateId(courseId)),
        courseId
      )))
    );
  }

  async replaceOfficialCourseReplica(courseId, graph, {
    publicationSeq = 0,
    contentHash = "",
    receivedAt = new Date().toISOString(),
    validate = true
  } = {}) {
    const normalizedCourseId = String(courseId || "");
    if (!normalizedCourseId) throw new TypeError("O UUID do curso oficial é obrigatório.");
    const normalizedRows = normalizeOfficialCourseGraph(normalizedCourseId, graph);
    if (validate) validateOfficialCourseGraph(normalizedRows);
    const stores = [
      ...OFFICIAL_COURSE_STORE_NAMES,
      "lessonProgress",
      "cardProgress",
      "comments",
      "outbox",
      "syncState"
    ];
    await this.transaction(stores, "readwrite", async (transaction) => {
      const blockingMutationIds = await unresolvedCourseMutationIds(transaction, normalizedCourseId);
      const localAuthoringState = await transaction.get(
        "syncState",
        localCourseAuthoringStateId(normalizedCourseId)
      );
      if (blockingMutationIds.length || localAuthoringState?.value?.status === "dirty") {
        throw new CatalogReplicaReconciliationRequiredError(
          normalizedCourseId,
          localAuthoringState?.value?.status === "dirty"
            ? [...blockingMutationIds, localAuthoringState.id]
            : blockingMutationIds
        );
      }
      await writeOfficialCourseReplica(
        transaction,
        normalizedCourseId,
        normalizedRows,
        { publicationSeq, contentHash, receivedAt }
      );
    });
    return {
      status: "applied",
      courseId: normalizedCourseId,
      publicationSeq: Number(publicationSeq || 0),
      contentHash: String(contentHash || ""),
      rowCount: Object.values(normalizedRows).reduce((total, rows) => total + rows.length, 0)
    };
  }

  async discardLocalCourseDraft(courseId, graph, {
    expectedRevision,
    expectedSelectionId,
    expectedPublicationSeq,
    expectedContentHash,
    expectedCourseOrigin,
    receivedAt = new Date().toISOString(),
    validate = true
  } = {}) {
    const normalizedCourseId = String(courseId || "").trim();
    if (!normalizedCourseId) throw new TypeError("O UUID do curso é obrigatório.");
    const normalizedExpectedRevision = String(expectedRevision || "").trim();
    if (!normalizedExpectedRevision) {
      throw new TypeError("A restauração exige a revisão consultada do localDraft.");
    }
    const normalizedExpectedSelectionId = String(expectedSelectionId || "").trim();
    if (!normalizedExpectedSelectionId) {
      throw new TypeError("A restauração exige a seleção oficial consultada.");
    }
    const normalizedExpectedPublicationSeq = Number(expectedPublicationSeq);
    if (!Number.isSafeInteger(normalizedExpectedPublicationSeq) ||
        normalizedExpectedPublicationSeq < 0) {
      throw new TypeError("A restauração exige a sequência oficial consultada.");
    }
    const normalizedExpectedContentHash = String(expectedContentHash || "").trim();
    if (!/^[a-f0-9]{64}$/u.test(normalizedExpectedContentHash)) {
      throw new TypeError("A restauração exige o hash imutável oficial consultado.");
    }
    const normalizedExpectedCourseOrigin = String(expectedCourseOrigin || "").trim();
    if (!["catalog", "private"].includes(normalizedExpectedCourseOrigin)) {
      throw new TypeError("A restauração exige origem catalog ou private.");
    }
    const normalizedRows = normalizeOfficialCourseGraph(normalizedCourseId, graph);
    if (validate) validateOfficialCourseGraph(normalizedRows);
    const stores = [
      ...OFFICIAL_COURSE_STORE_NAMES,
      "courseSelections",
      "lessonProgress",
      "cardProgress",
      "comments",
      "outbox",
      "syncState"
    ];
    const discardedDraft = await this.transaction(stores, "readwrite", async (transaction) => {
      const activeSelections = (await transaction.getAllByIndex(
        "courseSelections",
        "byCourseId",
        normalizedCourseId
      )).filter((row) => row?.deletedAt == null && (
        !this.#userId || String(row?.userId || "").toLowerCase() === this.#userId
      ));
      const selection = activeSelections.find((row) =>
        String(row?.id || "") === normalizedExpectedSelectionId
      ) || null;
      const expectedOfficialRevision = {
        selectionId: normalizedExpectedSelectionId,
        publicationSeq: normalizedExpectedPublicationSeq,
        contentHash: normalizedExpectedContentHash,
        courseOrigin: normalizedExpectedCourseOrigin
      };
      const actualOfficialRevision = selection
        ? {
            selectionId: String(selection.id || ""),
            publicationSeq: Number(selection.publicationSeq || 0),
            contentHash: String(selection.contentHash || ""),
            courseOrigin: String(selection.courseOrigin || "")
          }
        : activeSelections[0]
          ? {
              selectionId: String(activeSelections[0].id || ""),
              publicationSeq: Number(activeSelections[0].publicationSeq || 0),
              contentHash: String(activeSelections[0].contentHash || ""),
              courseOrigin: String(activeSelections[0].courseOrigin || "")
            }
          : null;
      if (!selection ||
          actualOfficialRevision.publicationSeq !== normalizedExpectedPublicationSeq ||
          actualOfficialRevision.contentHash !== normalizedExpectedContentHash ||
          actualOfficialRevision.courseOrigin !== normalizedExpectedCourseOrigin) {
        throw new OfficialCourseRevisionChangedError(
          normalizedCourseId,
          expectedOfficialRevision,
          actualOfficialRevision
        );
      }
      const draftRow = await transaction.get(
        "syncState",
        localCourseAuthoringStateId(normalizedCourseId)
      );
      const draft = localCourseDraftFromRow(draftRow, normalizedCourseId);
      if (!draft) throw new LocalCourseDraftNotFoundError(normalizedCourseId);
      if (draft.revision !== normalizedExpectedRevision) {
        throw new LocalCourseDraftChangedError(
          normalizedCourseId,
          normalizedExpectedRevision,
          draft.revision
        );
      }
      const blockingMutationIds = await unresolvedCourseMutationIds(
        transaction,
        normalizedCourseId
      );
      if (blockingMutationIds.length) {
        throw new CatalogReplicaReconciliationRequiredError(
          normalizedCourseId,
          blockingMutationIds
        );
      }
      await writeOfficialCourseReplica(
        transaction,
        normalizedCourseId,
        normalizedRows,
        {
          publicationSeq: normalizedExpectedPublicationSeq,
          contentHash: normalizedExpectedContentHash,
          receivedAt
        }
      );
      return draft;
    });
    return {
      status: "restored",
      courseId: normalizedCourseId,
      selectionId: normalizedExpectedSelectionId,
      publicationSeq: normalizedExpectedPublicationSeq,
      contentHash: normalizedExpectedContentHash,
      courseOrigin: normalizedExpectedCourseOrigin,
      rowCount: Object.values(normalizedRows).reduce((total, rows) => total + rows.length, 0),
      discardedDraft
    };
  }

  async removeOfficialCourseReplica(courseId, {
    removePersonalState = false,
    removeSelection = false
  } = {}) {
    const normalizedCourseId = String(courseId || "");
    const stores = [
      ...OFFICIAL_COURSE_STORE_NAMES,
      "syncState",
      ...(removeSelection ? ["courseSelections"] : []),
      ...(removePersonalState
        ? ["lessonProgress", "cardProgress", "comments", "studyPathCourses", "outbox"]
        : [])
    ];
    await this.transaction(stores, "readwrite", async (transaction) => {
      if (removeSelection) {
        const selections = await transaction.getAllByIndex(
          "courseSelections",
          "byCourseId",
          normalizedCourseId
        );
        for (const selection of selections) {
          await transaction.delete("courseSelections", selection.id);
        }
      }
      await deleteCourseContent(transaction, normalizedCourseId);
      if (removePersonalState) await deletePersonalCourseState(transaction, normalizedCourseId);
      await transaction.delete("syncState", `catalog.removalPending:${normalizedCourseId}`);
    });
  }

  async pruneOfficialCourseReplicas(selectedCourseIds) {
    const selected = new Set((selectedCourseIds || []).map(String));
    const courses = await this.getAll("courses");
    const staleIds = [...new Set(courses.map((row) => String(row.id)))].filter((id) => !selected.has(id));
    if (!staleIds.length) return [];
    const removedIds = [];
    await this.transaction([
      ...OFFICIAL_COURSE_STORE_NAMES,
      "lessonProgress",
      "cardProgress",
      "comments",
      "studyPathCourses",
      "outbox",
      "syncState"
    ], "readwrite", async (transaction) => {
      for (const courseId of staleIds) {
        const unresolved = (await transaction.getAllByIndex("outbox", "byCourseId", courseId))
          .filter(isUnresolvedOutboxEntry);
        const localDraft = localCourseDraftFromRow(
          await transaction.get("syncState", localCourseAuthoringStateId(courseId)),
          courseId
        );
        if (unresolved.length || localDraft) continue;
        await deleteCourseContent(transaction, courseId);
        await deletePersonalCourseState(transaction, courseId);
        await transaction.delete("syncState", `catalog.removalPending:${courseId}`);
        removedIds.push(courseId);
      }
    });
    return removedIds;
  }

  async applyReplicaBootstrap({
    snapshot,
    selectedCourses = [],
    highWaterSequence,
    deviceId,
    syncStateId,
    receivedAt = new Date().toISOString()
  } = {}) {
    const highWater = Number(highWaterSequence);
    if (!Number.isSafeInteger(highWater) || highWater < 0) {
      throw new TypeError("O bootstrap exige um high-water sequence válido.");
    }
    if (!deviceId || !syncStateId) throw new TypeError("O bootstrap exige dispositivo e cursor.");
    const normalizedRows = normalizePersonalSnapshot(snapshot);
    const manifest = selectedCourses.map(normalizeManifestEntry);
    const selectedCourseIds = new Set(manifest.map((entry) => entry.courseId));
    normalizedRows.courseSelections = normalizedRows.courseSelections
      .filter((row) => selectedCourseIds.has(String(row.courseId || "")));
    for (const storeName of ["lessonProgress", "cardProgress", "comments", "studyPathCourses"]) {
      normalizedRows[storeName] = normalizedRows[storeName]
        .filter((row) => selectedCourseIds.has(String(row.courseId || "")));
    }
    return this.transaction(
      [...SYNCED_PERSONAL_STORE_NAMES, "outbox", "syncState"],
      "readwrite",
      async (transaction) => {
        const unresolved = (await transaction.getAll("outbox"))
          .filter(isUnresolvedOutboxEntry);
        if (unresolved.length) {
          return { status: "local_changes_pending", highWaterSequence: highWater };
        }
        for (const storeName of SYNCED_PERSONAL_STORE_NAMES) {
          await transaction.clear(storeName);
          await transaction.putMany(storeName, normalizedRows[storeName]);
        }
        await transaction.put("syncState", {
          id: syncStateId,
          key: syncStateId,
          cursor: highWater,
          deviceId,
          updatedAt: receivedAt
        });
        await transaction.put("syncState", {
          id: `sync.bootstrap:${deviceId}`,
          key: `sync.bootstrap:${deviceId}`,
          value: true,
          cursor: highWater,
          deviceId,
          updatedAt: receivedAt
        });
        await transaction.put("syncState", {
          id: "catalog.selectedManifest",
          key: "catalog.selectedManifest",
          value: manifest,
          updatedAt: receivedAt
        });
        await transaction.delete("syncState", `sync.bootstrap.required:${deviceId}`);
        return {
          status: "applied",
          highWaterSequence: highWater,
          selectedCourses: manifest,
          rowCount: Object.values(normalizedRows).reduce((total, rows) => total + rows.length, 0)
        };
      }
    );
  }

  async listPendingOutbox({ courseId, limit = 100 } = {}) {
    if (!Number.isInteger(limit) || limit < 1) throw new TypeError("O limite da outbox deve ser positivo.");
    return (await this.getAll("outbox"))
      .filter((row) => row.status === "pending")
      .filter((row) => courseId === undefined || String(row.courseId || "") === String(courseId))
      .sort(compareOutbox)
      .slice(0, limit);
  }

  async acknowledgeOutbox(mutationIds, { remove = true, acknowledgedAt = new Date().toISOString() } = {}) {
    const ids = [...new Set((mutationIds || []).map(String).filter(Boolean))];
    if (!ids.length) return [];
    return this.transaction(["outbox"], "readwrite", async (transaction) => {
      const acknowledged = [];
      for (const mutationId of ids) {
        const row = await transaction.get("outbox", mutationId);
        if (!row) continue;
        if (remove) await transaction.delete("outbox", mutationId);
        else await transaction.put("outbox", { ...row, status: "acknowledged", acknowledgedAt, updatedAt: acknowledgedAt });
        acknowledged.push(mutationId);
      }
      return acknowledged;
    });
  }

  async listRejectedOutbox({ courseId } = {}) {
    return (await this.getAll("outbox"))
      .filter((row) => row.status === "rejected")
      .filter((row) => courseId === undefined || String(row.courseId || "") === String(courseId))
      .sort(compareOutbox);
  }

  async discardRejectedMutation(mutationId) {
    const id = String(mutationId || "");
    const entry = await this.get("outbox", id);
    if (!entry || entry.status !== "rejected") return null;
    return this.transaction(["outbox"], "readwrite", async (transaction) => {
      const current = await transaction.get("outbox", id);
      if (!current || current.status !== "rejected") return null;
      await transaction.delete("outbox", id);
      return { ...structuredClone(current), rollbackApplied: false };
    });
  }

  async applyRemotePage({
    changes,
    cursor,
    deviceId = null,
    syncStateId = `${deviceId || "device"}:personal`,
    receivedAt = new Date().toISOString()
  } = {}) {
    if (!Array.isArray(changes)) throw new TypeError("A página remota exige uma lista de alterações.");
    const normalized = changes.map((change) => {
      const storeName = String(change?.storeName || change?.entityType || "");
      if (!REMOTE_CHANGE_STORE_SET.has(storeName)) {
        throw new Error(`O feed da réplica não aceita a entidade "${storeName}".`);
      }
      const row = change.row || change.payload || null;
      const entityId = String(change.entityId || row?.id || "");
      if (!entityId) throw new Error("Alteração remota sem entityId.");
      return {
        ...change,
        storeName,
        entityId,
        row,
        operation: change.operation === "delete" || !row || change.deletedAt || row?.deletedAt
          ? "delete"
          : "upsert"
      };
    });
    const stores = [...new Set([
      ...SYNCED_PERSONAL_STORE_NAMES,
      ...OFFICIAL_COURSE_STORE_NAMES,
      "outbox",
      "syncState"
    ])];
    return this.transaction(stores, "readwrite", async (transaction) => {
      const outboxRows = await transaction.getAll("outbox");
      const pendingKeys = new Set(outboxRows
        .filter(isUnresolvedOutboxEntry)
        .map((row) => `${row.entityType}:${row.entityId}`));
      const applied = [];
      const skipped = [];
      for (const change of normalized) {
        const key = `${change.storeName}:${change.entityId}`;
        if (pendingKeys.has(key)) {
          skipped.push(key);
          continue;
        }
        const changeCourseId = String(change.courseId || change.row?.courseId || "");
        if (change.operation === "delete") {
          await transaction.delete(change.storeName, change.entityId);
          if (change.storeName === "courseSelections" && changeCourseId) {
            const unresolved = outboxRows.filter((row) =>
              String(row.courseId || "") === changeCourseId &&
              isUnresolvedOutboxEntry(row)
            );
            const localDraft = localCourseDraftFromRow(
              await transaction.get(
                "syncState",
                localCourseAuthoringStateId(changeCourseId)
              ),
              changeCourseId
            );
            if (unresolved.length || localDraft) {
              await transaction.put("syncState", {
                id: `catalog.removalPending:${changeCourseId}`,
                key: `catalog.removalPending:${changeCourseId}`,
                courseId: changeCourseId,
                value: {
                  mutationIds: [
                    ...unresolved.map((row) => String(row.mutationId)),
                    ...(localDraft ? [localCourseAuthoringStateId(changeCourseId)] : [])
                  ],
                  ...(localDraft ? { localDraftRevision: localDraft.revision } : {})
                },
                updatedAt: receivedAt
              });
            } else {
              await deleteCourseContent(transaction, changeCourseId);
              await deletePersonalCourseState(transaction, changeCourseId);
              await transaction.delete("syncState", `catalog.removalPending:${changeCourseId}`);
              outboxRows
                .filter((row) => String(row.courseId || "") === changeCourseId)
                .forEach((row) => pendingKeys.delete(`${row.entityType}:${row.entityId}`));
            }
          }
        } else {
          await transaction.put(change.storeName, { ...structuredClone(change.row), id: change.entityId });
        }
        applied.push({ storeName: change.storeName, entityId: change.entityId });
      }
      await transaction.put("syncState", {
        id: syncStateId,
        key: syncStateId,
        cursor,
        deviceId,
        updatedAt: receivedAt
      });
      return { applied, skipped, cursor };
    });
  }

  async readStores(storeNames = PROJECT_ROW_STORE_NAMES) {
    const normalized = normalizeStoreNames(storeNames);
    return this.transaction(normalized, "readonly", async (transaction) => Object.fromEntries(
      await Promise.all(normalized.map(async (storeName) => [storeName, await transaction.getAll(storeName)]))
    ));
  }

  async flush() { this.#assertOpen(); }

  close() {
    if (!this.#closed) {
      this.#closed = true;
      this.#connectionInvalidationListeners.clear();
      this.#database.close();
    }
  }

  static deleteDatabase(indexedDb = globalThis.indexedDB, { userId = null } = {}) {
    if (!indexedDb || typeof indexedDb.deleteDatabase !== "function") {
      throw new Error("IndexedDB não está disponível neste ambiente.");
    }
    return new Promise((resolve, reject) => {
      const request = indexedDb.deleteDatabase(relationalDatabaseNameForUser(userId));
      request.addEventListener("success", () => resolve(), { once: true });
      request.addEventListener("blocked", () => reject(
        new Error("A remoção do banco relacional foi bloqueada.")
      ), { once: true });
      request.addEventListener("error", () => reject(
        request.error || new Error("Não foi possível remover o banco relacional.")
      ), { once: true });
    });
  }
}

export async function createIndexedDbRelationalStore(indexedDb = globalThis.indexedDB, options = {}) {
  return IndexedDbRelationalStore.open(indexedDb, options);
}
