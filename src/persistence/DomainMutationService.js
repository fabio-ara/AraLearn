import { ProjectDocumentDiffer } from "./ProjectDocumentDiffer.js";
import { RELATIONAL_STORE_DEFINITIONS } from "./IndexedDbRelationalStore.js";
import { defaultUuidFactory } from "./relationalSchema.js";

const LOCAL_ONLY_STORE_NAMES = new Set(["projectMeta", "entityMappings"]);
const OUTBOX_SEQUENCE_STATE_ID = "outbox.sequence";
const NON_DOMAIN_FIELDS = new Set(["revision", "updatedAt", "deletedAt", "projectId"]);

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
    .filter((fieldName) => !NON_DOMAIN_FIELDS.has(fieldName))
    .filter((fieldName) =>
      JSON.stringify(normalizedValue(previousRow?.[fieldName])) !==
      JSON.stringify(normalizedValue(nextRow?.[fieldName]))
    )
    .sort();
}

function mutationPayload(mutation, persistedRow) {
  if (
    mutation.operation !== "upsert" ||
    !mutation.previousRow ||
    Number(mutation.baseRevision || 0) === 0
  ) {
    return clone(persistedRow);
  }
  return Object.fromEntries(
    [...new Set(mutation.changedFields || [])]
      .filter((fieldName) => !NON_DOMAIN_FIELDS.has(fieldName))
      .sort()
      .map((fieldName) => [
        fieldName,
        Object.prototype.hasOwnProperty.call(persistedRow || {}, fieldName)
          ? clone(persistedRow[fieldName])
          : null
      ])
  );
}

function assertMutation(mutation) {
  if (!mutation || typeof mutation !== "object") {
    throw new TypeError("Mutação relacional inválida.");
  }
  if (!Object.prototype.hasOwnProperty.call(RELATIONAL_STORE_DEFINITIONS, mutation.storeName)) {
    throw new Error(`Object store relacional desconhecido: "${mutation.storeName}".`);
  }
  if (["outbox", "syncState", "conflicts"].includes(mutation.storeName)) {
    throw new Error(`O store interno "${mutation.storeName}" não aceita mutações de domínio.`);
  }
  if (!mutation.entityId) {
    throw new Error("Mutação relacional sem entityId.");
  }
  if (!new Set(["upsert", "delete"]).has(mutation.operation)) {
    throw new Error(`Operação relacional desconhecida: "${mutation.operation}".`);
  }
  if (mutation.operation === "upsert" && !mutation.nextRow) {
    throw new Error("Mutação upsert sem nextRow.");
  }
}

function makeConflict({ mutation, currentRow, now, uuidFactory }) {
  return {
    id: uuidFactory(),
    courseId: mutation.courseId ?? currentRow?.courseId ?? null,
    entityType: mutation.entityType || mutation.storeName,
    entityId: mutation.entityId,
    mutationId: mutation.mutationId ?? null,
    baseRevision: Number(mutation.baseRevision || 0),
    remoteRevision: Number(currentRow?.revision || 0),
    localRow: clone(mutation.nextRow || mutation.previousRow),
    remoteRow: clone(currentRow),
    status: "open",
    createdAt: now,
    updatedAt: now,
    resolvedAt: null,
    resolution: null
  };
}

function materializeRow(mutation, currentRow, now) {
  const baseRow =
    mutation.operation === "delete"
      ? currentRow || mutation.previousRow
      : mutation.nextRow;
  if (!baseRow) return null;
  const persistedRow = {
    ...clone(baseRow),
    id: mutation.entityId,
    revision: Number(currentRow?.revision || 0) + 1,
    updatedAt: now,
    deletedAt: mutation.operation === "delete" ? now : null
  };
  if (
    mutation.courseId != null ||
    Object.prototype.hasOwnProperty.call(baseRow, "courseId") ||
    Object.prototype.hasOwnProperty.call(currentRow || {}, "courseId")
  ) {
    persistedRow.courseId = mutation.courseId ?? baseRow.courseId ?? currentRow?.courseId ?? null;
  }
  return persistedRow;
}

function makeOutboxEntry(mutation, persistedRow, mutationId, sequence, now) {
  return {
    mutationId,
    sequence,
    courseId: mutation.courseId ?? persistedRow?.courseId ?? null,
    entityType: mutation.entityType || mutation.storeName,
    entityId: mutation.entityId,
    operation: mutation.operation,
    baseRevision: Number(mutation.baseRevision || 0),
    changedFields: [...(mutation.changedFields || [])],
    previousRow: clone(mutation.previousRow),
    payload: mutationPayload(mutation, persistedRow),
    status: "pending",
    attemptCount: 0,
    lastError: null,
    createdAt: now,
    updatedAt: now
  };
}

function normalizeCompositeOutboxes(compositeOutbox, compositeOutboxes) {
  if (Array.isArray(compositeOutboxes)) return compositeOutboxes.filter(Boolean);
  return compositeOutbox ? [compositeOutbox] : [];
}

function compositeCoversMutation(composite, mutation) {
  if (composite?.coversCourse === true) {
    return String(composite.courseId || "") === String(mutation.courseId || "");
  }
  if (Array.isArray(composite?.coveredMutationKeys)) {
    return composite.coveredMutationKeys.includes(`${mutation.storeName}:${mutation.entityId}`);
  }
  return true;
}

function outboxSequence(entry) {
  return Number(entry?.sequence || 0);
}

function mutationKey(entry) {
  return `${entry?.entityType || entry?.storeName}:${entry?.entityId}`;
}

function fragmentRows(fragment) {
  return Object.entries(fragment || {}).flatMap(([storeName, rows]) =>
    Array.isArray(rows)
      ? rows.filter((row) => row?.id).map((row) => ({ storeName, row }))
      : []
  );
}

function rollbackRowsFromEntries(entries) {
  const rollbackRows = new Map();
  [...entries]
    .sort((left, right) => outboxSequence(left) - outboxSequence(right))
    .forEach((entry) => {
      if (entry.entityType === "microsequenceCardReplacement") {
        const previous = new Map(
          fragmentRows(entry.payload?.previousFragment)
            .map(({ storeName, row }) => [`${storeName}:${row.id}`, { storeName, entityId: row.id, previousRow: row }])
        );
        fragmentRows(entry.payload?.fragment).forEach(({ storeName, row }) => {
          const key = `${storeName}:${row.id}`;
          if (!previous.has(key)) previous.set(key, { storeName, entityId: row.id, previousRow: null });
        });
        previous.forEach((value, key) => {
          if (!rollbackRows.has(key)) rollbackRows.set(key, clone(value));
        });
        return;
      }
      const key = mutationKey(entry);
      if (!rollbackRows.has(key)) {
        rollbackRows.set(key, {
          storeName: entry.entityType,
          entityId: entry.entityId,
          previousRow: clone(entry.previousRow ?? null)
        });
      }
    });
  return [...rollbackRows.values()];
}

function rewindFragment(fragment, rollbackRows) {
  const next = clone(fragment || {});
  rollbackRows.forEach(({ storeName, entityId, previousRow }) => {
    if (!Array.isArray(next[storeName])) return;
    next[storeName] = next[storeName].filter((row) => row.id !== entityId);
    if (previousRow) next[storeName].push(clone(previousRow));
  });
  return next;
}

export class DomainMutationService {
  constructor({
    store,
    differ,
    clock = () => new Date(),
    uuidFactory = defaultUuidFactory,
    onLocalCommit = null
  } = {}) {
    if (!store || typeof store.transaction !== "function") {
      throw new TypeError("DomainMutationService exige um store relacional.");
    }
    this.store = store;
    this.differ = differ || new ProjectDocumentDiffer({ uuidFactory });
    this.clock = clock;
    this.uuidFactory = uuidFactory;
    this.onLocalCommit = typeof onLocalCommit === "function" ? onLocalCommit : null;
  }

  async applyDocumentChange(previousDocument, nextDocument, options = {}) {
    const diff = this.differ.diff(previousDocument, nextDocument, options);
    const result = await this.applyMutations(diff.mutations, options);
    return { ...diff, ...result };
  }

  async replaceMicrosequenceCards(
    previousDocument,
    nextDocument,
    microsequenceId,
    options = {}
  ) {
    const diff = this.differ.replaceMicrosequenceCards(
      previousDocument,
      nextDocument,
      microsequenceId,
      options
    );
    const result = await this.applyMutations(diff.mutations, options);
    return { ...diff, ...result };
  }

  async applyRowChange(storeName, previousRow, nextRow, options = {}) {
    const row = nextRow || previousRow;
    if (!row?.id) {
      throw new Error("A alteração de linha exige um id persistente.");
    }
    const operation = nextRow ? "upsert" : "delete";
    return this.applyMutations(
      [{
        storeName,
        entityType: storeName,
        entityId: row.id,
        courseId: row.courseId ?? null,
        operation,
        baseRevision: Number(previousRow?.revision || 0),
        previousRow: clone(previousRow),
        nextRow: clone(nextRow),
        changedFields: nextRow ? rowChangedFields(previousRow, nextRow) : []
      }],
      options
    );
  }

  async applyMutations(
    mutations,
    { enforceRevision = false, compositeOutbox = null, compositeOutboxes = null } = {}
  ) {
    if (!Array.isArray(mutations)) {
      throw new TypeError("applyMutations exige uma lista de mutações.");
    }
    mutations.forEach(assertMutation);
    if (!mutations.length) {
      return { appliedRows: [], outboxEntries: [], conflicts: [] };
    }

    const storeNames = [...new Set([
      ...mutations.map((mutation) => mutation.storeName),
      "outbox",
      "conflicts",
      "syncState"
    ])];
    const now = timestamp(this.clock);
    const compositeEntries = normalizeCompositeOutboxes(compositeOutbox, compositeOutboxes);

    const result = await this.store.transaction(storeNames, "readwrite", async (transaction) => {
      const appliedRows = [];
      const outboxEntries = [];
      const conflicts = [];
      const appliedComposites = new Set();
      const sequenceState = await transaction.get("syncState", OUTBOX_SEQUENCE_STATE_ID);
      let nextSequence = Number(sequenceState?.value || 0);

      for (const mutation of mutations) {
        const currentRow = await transaction.get(mutation.storeName, mutation.entityId);
        const currentRevision = Number(currentRow?.revision || 0);
        const expectedRevision = Number(mutation.baseRevision || 0);
        if (enforceRevision && currentRevision !== expectedRevision) {
          const conflict = makeConflict({
            mutation,
            currentRow,
            now,
            uuidFactory: this.uuidFactory
          });
          await transaction.put("conflicts", conflict);
          conflicts.push(conflict);
          continue;
        }

        const persistedRow = materializeRow(mutation, currentRow, now);
        if (!persistedRow) continue;
        await transaction.put(mutation.storeName, persistedRow);
        appliedRows.push({ storeName: mutation.storeName, row: persistedRow });
        const coveringComposite = compositeEntries.find((entry) =>
          compositeCoversMutation(entry, mutation)
        );
        if (coveringComposite) appliedComposites.add(coveringComposite);
        if (!coveringComposite && !LOCAL_ONLY_STORE_NAMES.has(mutation.storeName)) {
          const mutationId = mutation.mutationId || this.uuidFactory();
          nextSequence += 1;
          const outboxEntry = makeOutboxEntry(
            mutation,
            persistedRow,
            mutationId,
            nextSequence,
            now
          );
          await transaction.add("outbox", outboxEntry);
          outboxEntries.push(outboxEntry);
        }
      }

      for (const compositeEntry of compositeEntries) {
        if (!appliedComposites.has(compositeEntry)) continue;
        if (compositeEntry.supersedesCoveredMutations) {
          const coveredKeys = new Set(compositeEntry.coveredMutationKeys || []);
          const courseEntries = compositeEntry.courseId
            ? await transaction.getAllByIndex("outbox", "byCourseId", compositeEntry.courseId)
            : await transaction.getAll("outbox");
          const supersededEntries = courseEntries.filter((entry) =>
            ["pending", "inflight"].includes(entry.status) &&
            (
              coveredKeys.has(mutationKey(entry)) ||
              (
                entry.entityType === "microsequenceCardReplacement" &&
                entry.entityId === compositeEntry.entityId
              )
            )
          );
          if (supersededEntries.length) {
            const previousComposite = [...supersededEntries]
              .filter((entry) => entry.entityType === "microsequenceCardReplacement")
              .sort((left, right) => outboxSequence(left) - outboxSequence(right))[0];
            const rollbackRows = rollbackRowsFromEntries(supersededEntries);
            compositeEntry.payload.previousFragment = previousComposite?.payload?.previousFragment
              ? clone(previousComposite.payload.previousFragment)
              : rewindFragment(compositeEntry.payload.previousFragment, rollbackRows);
            if (previousComposite) {
              compositeEntry.baseRevision = Number(previousComposite.baseRevision || 0);
            }
            const supersededIds = new Set(supersededEntries.map((entry) => entry.mutationId));
            for (const entry of supersededEntries) {
              await transaction.delete("outbox", entry.mutationId);
            }
            const relatedConflicts = await transaction.getAllByIndex(
              "conflicts",
              "byCourseId",
              compositeEntry.courseId
            );
            for (const conflict of relatedConflicts) {
              if (conflict.status !== "open" || !supersededIds.has(conflict.mutationId)) continue;
              await transaction.put("conflicts", {
                ...conflict,
                status: "resolved",
                resolution: "superseded",
                resolvedAt: now,
                updatedAt: now
              });
            }
          }
        }
        if (compositeEntry.supersedesCourseMutations && compositeEntry.courseId) {
          const supersededEntries = await transaction.getAllByIndex(
            "outbox",
            "byCourseId",
            compositeEntry.courseId
          );
          const rollbackRows = rollbackRowsFromEntries(supersededEntries);
          if (rollbackRows.length) {
            compositeEntry.payload.rollbackRows = rollbackRows;
          }
          for (const entry of supersededEntries) {
            await transaction.delete("outbox", entry.mutationId);
          }
          const relatedConflicts = await transaction.getAllByIndex(
            "conflicts",
            "byCourseId",
            compositeEntry.courseId
          );
          for (const conflict of relatedConflicts) {
            if (conflict.status !== "open") continue;
            await transaction.put("conflicts", {
              ...conflict,
              status: "resolved",
              resolution: "course_deleted",
              resolvedAt: now,
              updatedAt: now
            });
          }
        }
        nextSequence += 1;
        const mutationId = compositeEntry.mutationId || this.uuidFactory();
        const outboxEntry = {
          mutationId,
          sequence: nextSequence,
          courseId: compositeEntry.courseId ?? null,
          entityType: compositeEntry.entityType,
          entityId: compositeEntry.entityId,
          operation: compositeEntry.operation,
          baseRevision: Number(compositeEntry.baseRevision || 0),
          changedFields: [...(compositeEntry.changedFields || [])],
          payload: clone(compositeEntry.payload),
          status: "pending",
          attemptCount: 0,
          lastError: null,
          createdAt: now,
          updatedAt: now
        };
        await transaction.add("outbox", outboxEntry);
        outboxEntries.push(outboxEntry);
      }

      if (outboxEntries.length) {
        await transaction.put("syncState", {
          id: OUTBOX_SEQUENCE_STATE_ID,
          key: OUTBOX_SEQUENCE_STATE_ID,
          value: nextSequence,
          updatedAt: now
        });
      }

      return { appliedRows, outboxEntries, conflicts };
    });
    if (result.outboxEntries.length) this.onLocalCommit?.(result);
    return result;
  }

  async recordConflict({
    storeName,
    entityId,
    courseId = null,
    baseRevision = 0,
    localRow = null,
    remoteRow = null,
    mutationId = null
  }) {
    const now = timestamp(this.clock);
    const conflict = makeConflict({
      mutation: {
        storeName,
        entityType: storeName,
        entityId,
        courseId,
        baseRevision,
        nextRow: localRow,
        mutationId
      },
      currentRow: remoteRow,
      now,
      uuidFactory: this.uuidFactory
    });
    await this.store.put("conflicts", conflict);
    return conflict;
  }
}
