import { RELATIONAL_STORE_DEFINITIONS } from "./IndexedDbRelationalStore.js";
import {
  defaultUuidFactory,
  RELATIONAL_ROW_COLLECTIONS
} from "./relationalSchema.js";

const OUTBOX_SEQUENCE_STATE_ID = "outbox.sequence";

export const PERSONAL_STATE_OUTBOX_STORE_NAMES = Object.freeze([
  "lessonProgress",
  "cardProgress",
  "comments",
  "studyPaths",
  "studyPathCourses"
]);

export const PERSONAL_CONTENT_OUTBOX_STORE_NAMES = Object.freeze(
  RELATIONAL_ROW_COLLECTIONS.filter((storeName) => storeName !== "projectMeta")
);

// A seleção comum continua apontando para a árvore única do catálogo e não
// gera qualquer mutação de conteúdo. Estas coleções só entram na outbox depois
// que uma autoria explícita criou um curso pessoal independente (copy-on-write).
export const PERSONAL_OUTBOX_STORE_NAMES = Object.freeze([
  ...PERSONAL_STATE_OUTBOX_STORE_NAMES,
  ...PERSONAL_CONTENT_OUTBOX_STORE_NAMES
]);

const PERSONAL_OUTBOX_STORE_SET = new Set(PERSONAL_OUTBOX_STORE_NAMES);
const PERSONAL_CONTENT_OUTBOX_STORE_SET = new Set(PERSONAL_CONTENT_OUTBOX_STORE_NAMES);
const LOCAL_METADATA_FIELDS = new Set([
  "updatedAt",
  "deletedAt",
  "projectId"
]);

const RECONSTRUCTION_FIELDS = Object.freeze({
  lessonProgress: ["courseId", "selectionId", "lessonId"],
  cardProgress: ["courseId", "selectionId", "cardId"],
  comments: ["courseId", "selectionId", "cardId"]
});

const COMPLETE_STATE_PATCH_FIELDS = Object.freeze({
  lessonProgress: ["cursor", "firstViewedAt", "completedAt", "lastActivityAt"],
  cardProgress: [
    "firstViewedAt", "completedAt", "attempts", "lastResult", "lastActivityAt"
  ],
  comments: ["body"],
  studyPaths: ["title", "position"],
  studyPathCourses: ["pathId", "selectionId", "courseId", "position"]
});

const REMOTE_PAYLOAD_FIELDS = Object.freeze({
  lessonProgress: [
    "courseId", "selectionId", "lessonId",
    "cursor", "firstViewedAt", "completedAt", "lastActivityAt"
  ],
  cardProgress: [
    "courseId", "selectionId", "cardId",
    "firstViewedAt", "completedAt", "attempts", "lastResult", "lastActivityAt"
  ],
  comments: ["courseId", "selectionId", "cardId", "body"],
  studyPaths: ["title", "position"],
  studyPathCourses: ["pathId", "selectionId", "courseId", "position"]
});

function clone(value) {
  return value == null ? value : structuredClone(value);
}

function timestamp(clock) {
  const value = clock();
  return value instanceof Date ? value.toISOString() : String(value);
}

function normalizedValue(value) {
  if (Array.isArray(value)) return value.map(normalizedValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value).sort().map((key) => [key, normalizedValue(value[key])])
    );
  }
  return value;
}

function rowChangedFields(previousRow, nextRow) {
  const fields = new Set([
    ...Object.keys(previousRow || {}),
    ...Object.keys(nextRow || {})
  ]);
  return [...fields]
    .filter((fieldName) => !LOCAL_METADATA_FIELDS.has(fieldName))
    .filter((fieldName) =>
      JSON.stringify(normalizedValue(previousRow?.[fieldName])) !==
      JSON.stringify(normalizedValue(nextRow?.[fieldName]))
    )
    .sort();
}

function assertMutation(mutation) {
  if (!mutation || typeof mutation !== "object") {
    throw new TypeError("Mutação pessoal inválida.");
  }
  if (!Object.prototype.hasOwnProperty.call(RELATIONAL_STORE_DEFINITIONS, mutation.storeName)) {
    throw new Error(`Object store relacional desconhecido: "${mutation.storeName}".`);
  }
  if (!PERSONAL_OUTBOX_STORE_SET.has(mutation.storeName)) {
    throw new Error(
      `A entidade "${mutation.storeName}" não pertence ao estado pessoal sincronizável.`
    );
  }
  if (!mutation.entityId) throw new Error("Mutação pessoal sem entityId.");
  if (!new Set(["upsert", "delete"]).has(mutation.operation)) {
    throw new Error(`Operação pessoal desconhecida: "${mutation.operation}".`);
  }
  if (mutation.operation === "upsert" && !mutation.nextRow) {
    throw new Error("Mutação upsert sem nextRow.");
  }
}

function nextChangedFields(mutation, currentRow) {
  if (mutation.operation === "delete") return [];
  const calculated = rowChangedFields(currentRow, mutation.nextRow);
  let selected = calculated;
  if (Array.isArray(mutation.changedFields)) {
    const declared = new Set(
      mutation.changedFields.map(String).filter((name) => !LOCAL_METADATA_FIELDS.has(name))
    );
    const omitted = calculated.filter((fieldName) => !declared.has(fieldName));
    if (omitted.length) {
      throw new Error(
        `changedFields omite campos realmente alterados em ${mutation.storeName}: ${omitted.join(", ")}.`
      );
    }
    selected = calculated;
  }
  if (!currentRow || !selected.length) return selected;
  const completeFields = COMPLETE_STATE_PATCH_FIELDS[mutation.storeName] || [];
  return [...new Set([
    ...selected,
    ...completeFields.filter((fieldName) =>
      Object.prototype.hasOwnProperty.call(mutation.nextRow || {}, fieldName)
    )
  ])].sort();
}

function materializeRow(mutation, currentRow, changedFields, now) {
  if (mutation.operation === "delete") return null;
  const persistedRow = {
    ...clone(currentRow || {}),
    ...clone(mutation.nextRow),
    id: String(mutation.entityId),
    updatedAt: now,
    deletedAt: null
  };
  changedFields.forEach((fieldName) => {
    if (!Object.prototype.hasOwnProperty.call(mutation.nextRow, fieldName)) {
      delete persistedRow[fieldName];
    }
  });
  delete persistedRow.projectId;
  return persistedRow;
}

function mutationPayload(mutation, persistedRow, previousRow, changedFields, now) {
  if (mutation.operation === "delete") {
    const source = previousRow || {};
    return Object.fromEntries(
      Object.entries({
        id: String(mutation.entityId),
        courseId: mutation.courseId ?? source.courseId ?? null,
        userId: source.userId ?? null,
        ownerId: source.ownerId ?? null,
        deletedAt: now
      }).filter(([, value]) => value !== null && value !== undefined)
    );
  }
  if (!previousRow) {
    const insertFields = REMOTE_PAYLOAD_FIELDS[mutation.storeName] ||
      (PERSONAL_CONTENT_OUTBOX_STORE_SET.has(mutation.storeName)
        ? Object.keys(persistedRow || {}).filter((fieldName) => !LOCAL_METADATA_FIELDS.has(fieldName))
        : []);
    return Object.fromEntries(insertFields
      .filter((fieldName) => Object.prototype.hasOwnProperty.call(persistedRow || {}, fieldName))
      .map((fieldName) => [fieldName, clone(persistedRow[fieldName])]));
  }
  const payloadFields = [...new Set([
    ...changedFields,
    ...(RECONSTRUCTION_FIELDS[mutation.storeName] || [])
  ])];
  return Object.fromEntries(payloadFields
    .filter((fieldName) => Object.prototype.hasOwnProperty.call(persistedRow || {}, fieldName))
    .map((fieldName) => [fieldName, clone(persistedRow[fieldName])]));
}

function makeOutboxEntry(
  mutation,
  persistedRow,
  currentRow,
  changedFields,
  mutationId,
  sequence,
  now
) {
  const previousRow = clone(currentRow ?? mutation.previousRow ?? null);
  const courseId = mutation.courseId ?? persistedRow?.courseId ?? previousRow?.courseId ??
    (mutation.storeName === "courses" ? mutation.entityId : null);
  const protocolChangedFields = previousRow
    ? changedFields
    : (COMPLETE_STATE_PATCH_FIELDS[mutation.storeName] || [])
      .filter((fieldName) => Object.prototype.hasOwnProperty.call(persistedRow || {}, fieldName));
  return {
    mutationId,
    sequence,
    courseId,
    entityType: mutation.storeName,
    entityId: String(mutation.entityId),
    operation: mutation.operation === "delete"
      ? "delete"
      : previousRow
        ? "update"
        : "insert",
    changedFields: [...protocolChangedFields],
    previousRow,
    payload: mutationPayload(mutation, persistedRow, previousRow, protocolChangedFields, now),
    status: "pending",
    attemptCount: 0,
    lastError: null,
    createdAt: now,
    updatedAt: now
  };
}

export class DomainMutationService {
  constructor({
    store,
    clock = () => new Date(),
    uuidFactory = defaultUuidFactory,
    onLocalCommit = null
  } = {}) {
    if (!store || typeof store.transaction !== "function") {
      throw new TypeError("DomainMutationService exige um store relacional.");
    }
    this.store = store;
    this.clock = clock;
    this.uuidFactory = uuidFactory;
    this.onLocalCommit = typeof onLocalCommit === "function" ? onLocalCommit : null;
  }

  async applyRowChange(storeName, previousRow, nextRow) {
    const row = nextRow || previousRow;
    if (!row?.id) throw new Error("A alteração de linha exige um id persistente.");
    return this.applyMutations([{
      storeName,
      entityType: storeName,
      entityId: row.id,
      courseId: row.courseId ?? (storeName === "courses" ? row.id : null),
      operation: nextRow ? "upsert" : "delete",
      previousRow: clone(previousRow),
      nextRow: clone(nextRow),
      changedFields: nextRow ? rowChangedFields(previousRow, nextRow) : []
    }]);
  }

  async applyMutations(mutations) {
    if (!Array.isArray(mutations)) {
      throw new TypeError("applyMutations exige uma lista de mutações.");
    }
    mutations.forEach(assertMutation);
    if (!mutations.length) return { appliedRows: [], outboxEntries: [] };

    const storeNames = [...new Set([
      ...mutations.map((mutation) => mutation.storeName),
      "outbox",
      "syncState"
    ])];
    const now = timestamp(this.clock);
    const result = await this.store.transaction(storeNames, "readwrite", async (transaction) => {
      const appliedRows = [];
      const outboxEntries = [];
      const sequenceState = await transaction.get("syncState", OUTBOX_SEQUENCE_STATE_ID);
      const existingOutbox = await transaction.getAll("outbox");
      let nextSequence = Math.max(
        Number(sequenceState?.value || 0),
        ...existingOutbox.map((row) => Number(row.sequence || 0)).filter(Number.isFinite)
      );

      for (const mutation of mutations) {
        const currentRow = await transaction.get(mutation.storeName, mutation.entityId);
        const changedFields = nextChangedFields(mutation, currentRow);
        if (mutation.operation === "upsert" && currentRow && changedFields.length === 0) continue;
        if (mutation.operation === "delete" && !currentRow && !mutation.previousRow) continue;

        const persistedRow = materializeRow(mutation, currentRow, changedFields, now);
        if (persistedRow) await transaction.put(mutation.storeName, persistedRow);
        else await transaction.delete(mutation.storeName, mutation.entityId);

        nextSequence += 1;
        const outboxEntry = makeOutboxEntry(
          mutation,
          persistedRow,
          currentRow,
          changedFields,
          mutation.mutationId || this.uuidFactory(),
          nextSequence,
          now
        );
        await transaction.add("outbox", outboxEntry);
        outboxEntries.push(outboxEntry);
        appliedRows.push({
          storeName: mutation.storeName,
          entityId: String(mutation.entityId),
          row: clone(persistedRow)
        });
      }

      if (outboxEntries.length) {
        await transaction.put("syncState", {
          id: OUTBOX_SEQUENCE_STATE_ID,
          key: OUTBOX_SEQUENCE_STATE_ID,
          value: nextSequence,
          updatedAt: now
        });
      }
      return { appliedRows, outboxEntries };
    });

    if (result.appliedRows.length && this.onLocalCommit) {
      await this.onLocalCommit(clone(result));
    }
    return result;
  }
}
