import { defaultUuidFactory } from "../persistence/relationalSchema.js";
import { getOrCreateDeviceId } from "./deviceIdentity.js";

export const SYNC_CURSOR_STATE_PREFIX = "sync.cursor";

const REMOTE_TABLE_TO_STORE = Object.freeze({
  courses: "courses",
  course_memberships: "memberships",
  modules: "modules",
  lessons: "lessons",
  course_guides: "guides",
  guide_items: "guideItems",
  lesson_topics: "topics",
  topic_statements: "topicStatements",
  microsequences: "microsequences",
  microsequence_dependencies: "dependencies",
  microsequence_statements: "microsequenceStatements",
  cards: "cards",
  card_blocks: "blocks",
  block_options: "options",
  block_nodes: "nodes",
  flow_nodes: "flowNodes",
  flow_cases: "flowCases",
  flow_practices: "flowPractices",
  node_practices: "flowPracticeEntries",
  block_edges: "edges",
  block_matrix_items: "matrixItems",
  block_cells: "cells",
  block_points: "points",
  block_lines: "lines",
  block_highlights: "highlights",
  lesson_progress: "lessonProgress",
  card_progress: "cardProgress",
  card_comments: "comments"
});

function array(value) {
  return Array.isArray(value) ? value : [];
}

function firstObject(value) {
  if (Array.isArray(value) && value.length === 1 && value[0] && typeof value[0] === "object") return value[0];
  return value && typeof value === "object" ? value : {};
}

function camelName(value) {
  return String(value || "").replace(/_([a-z])/g, (_match, character) => character.toUpperCase());
}

function camelize(value) {
  if (Array.isArray(value)) return value.map(camelize);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).map(([key, entry]) => [camelName(key), camelize(entry)]));
}

function changeStoreName(change, row) {
  if (change.storeName || change.store_name) return String(change.storeName || change.store_name);
  const remoteName = String(change.tableName || change.table_name || change.entityType || change.entity_type || "");
  if (remoteName === "card_refs") {
    const refKind = row?.refKind || row?.ref_kind;
    return refKind === "source" ? "cardSources" : "cardTopics";
  }
  if (remoteName === "node_practice_items") {
    const itemKind = row?.itemKind || row?.item_kind;
    return {
      option: "flowPracticeOptions",
      variant: "flowPracticeVariants",
      shape_option: "flowShapeOptions"
    }[itemKind] || remoteName;
  }
  return REMOTE_TABLE_TO_STORE[remoteName] || remoteName;
}

function normalizeRemoteChange(rawChange) {
  const rawRow = rawChange?.row ?? rawChange?.payload ?? rawChange?.rowData ?? rawChange?.row_data ?? null;
  const row = camelize(rawRow);
  const storeName = changeStoreName(rawChange || {}, row || rawRow);
  return {
    storeName,
    entityType: storeName,
    entityId: String(rawChange?.entityId || rawChange?.entity_id || row?.id || ""),
    courseId: rawChange?.courseId || rawChange?.course_id || row?.courseId || null,
    operation: rawChange?.operation === "delete" || rawChange?.deletedAt || rawChange?.deleted_at ? "delete" : "upsert",
    revision: Number(rawChange?.revision ?? row?.revision ?? 0),
    updatedAt: rawChange?.updatedAt || rawChange?.updated_at || row?.updatedAt || null,
    deletedAt: rawChange?.deletedAt || rawChange?.deleted_at || row?.deletedAt || null,
    row
  };
}

function normalizePullResponse(rawResponse, previousCursor) {
  const response = firstObject(rawResponse);
  const changes = array(response.changes || response.items || response.data).map(normalizeRemoteChange);
  const nextCursor = Number(
    response.nextCursor ?? response.next_cursor ?? response.nextSequence ?? response.next_sequence ??
      response.cursor ?? changes.at(-1)?.sequence ?? previousCursor
  );
  return {
    changes,
    nextCursor: Number.isFinite(nextCursor) ? nextCursor : previousCursor,
    hasMore: Boolean(response.hasMore ?? response.has_more ?? false)
  };
}

function mutationIdOf(value) {
  return String(value?.mutationId || value?.mutation_id || value?.id || value || "");
}

function normalizePushResponse(rawResponse) {
  const response = firstObject(rawResponse);
  const results = array(response.results || response.mutations);
  const accepted = new Set(
    array(response.acceptedMutationIds || response.accepted_mutation_ids || response.accepted)
      .map(mutationIdOf)
      .filter(Boolean)
  );
  const conflicts = array(response.conflicts).map(camelize);
  const rejected = array(response.rejectedMutationIds || response.rejected_mutation_ids || response.rejected)
    .map((entry) => typeof entry === "object" ? camelize(entry) : { mutationId: mutationIdOf(entry) })
    .filter((entry) => mutationIdOf(entry));
  results.forEach((result) => {
    const id = mutationIdOf(result);
    const status = String(result?.status || "").toLowerCase();
    if (["accepted", "applied", "duplicate", "already_applied"].includes(status) && id) accepted.add(id);
    if (status === "conflict") conflicts.push(camelize(result));
    if (["rejected", "invalid", "forbidden"].includes(status) && id) rejected.push(camelize(result));
  });
  return {
    accepted: [...accepted],
    conflicts,
    rejected: [...new Map(rejected.map((entry) => [mutationIdOf(entry), entry])).values()]
  };
}

function timestamp(clock) {
  const value = clock();
  return value instanceof Date ? value.toISOString() : String(value);
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error || "Falha de sincronização.");
}

export class SupabaseSyncTransport {
  constructor(remoteCatalog) {
    if (!remoteCatalog || typeof remoteCatalog.rpc !== "function") {
      throw new TypeError("Transporte Supabase exige acesso autenticado a RPCs.");
    }
    this.remote = remoteCatalog;
  }

  async applySyncBatch({ deviceId, mutations }) {
    const results = [];
    let regularMutations = [];
    const flushRegular = async () => {
      if (!regularMutations.length) return false;
      const response = firstObject(await this.remote.rpc("apply_sync_batch", {
        p_device_id: deviceId,
        p_mutations: regularMutations.map(({ mutationId, courseId, entityType, entityId, operation, baseRevision, changedFields, payload }) => ({
          mutationId,
          courseId,
          entityType,
          entityId,
          operation: operation === "upsert" ? (Number(baseRevision || 0) === 0 ? "insert" : "update") : operation,
          baseRevision,
          changedFields,
          payload
        }))
      }));
      const batchResults = array(response.results || response.mutations);
      results.push(...batchResults);
      regularMutations = [];
      return batchResults.some((result) => ["conflict", "rejected", "invalid", "forbidden"].includes(
        String(result?.status || "").toLowerCase()
      ));
    };

    for (const mutation of mutations) {
      const isCardReplacement = mutation.entityType === "microsequenceCardReplacement";
      const isCourseDeletion = mutation.entityType === "personalCourseDeletion";
      if (!isCardReplacement && !isCourseDeletion) {
        regularMutations.push(mutation);
        continue;
      }
      // Uma operação composta não pode atravessar um conflito produzido pelo
      // lote granular anterior: ambos compartilham a mesma história local.
      if (await flushRegular()) break;
      try {
        if (isCourseDeletion) {
          const rpcResult = firstObject(await this.remote.rpc("delete_personal_course", {
            p_course_id: mutation.payload?.courseId || mutation.courseId,
            p_base_revision: mutation.baseRevision,
            p_mutation_id: mutation.mutationId
          }));
          const deletionStatus = String(rpcResult.status || "applied").toLowerCase();
          results.push({
            ...camelize(rpcResult),
            mutationId: mutation.mutationId,
            entityType: mutation.entityType,
            entityId: mutation.entityId,
            status: deletionStatus
          });
          if (["conflict", "rejected", "invalid", "forbidden"].includes(deletionStatus)) break;
          continue;
        }
        const rpcResult = firstObject(await this.remote.rpc("replace_microsequence_cards", {
          p_course_id: mutation.payload.courseId,
          p_microsequence_id: mutation.payload.microsequenceId,
          p_fragment: mutation.payload.fragment,
          p_base_revision: mutation.baseRevision,
          p_mutation_id: mutation.mutationId
        }));
        const replacementStatus = String(rpcResult.status || "").toLowerCase();
        if (["conflict", "rejected", "invalid", "forbidden"].includes(replacementStatus)) {
          results.push({
            ...camelize(rpcResult),
            mutationId: mutation.mutationId,
            entityType: mutation.entityType,
            entityId: mutation.entityId,
            courseId: mutation.courseId,
            localRow: mutation.payload,
            status: replacementStatus
          });
          break;
        }
        results.push({
          mutationId: mutation.mutationId,
          entityType: mutation.entityType,
          entityId: mutation.entityId,
          status: "applied"
        });
      } catch (error) {
        if (error?.code === "40001" || error?.status === 409) {
          results.push({
            mutationId: mutation.mutationId,
            entityType: mutation.entityType,
            entityId: mutation.entityId,
            courseId: mutation.courseId,
            baseRevision: mutation.baseRevision,
            status: "conflict",
            reason: "revision_mismatch",
            message: error.message
          });
          break;
        } else {
          throw error;
        }
      }
    }
    await flushRegular();
    return { deviceId, results };
  }

  pullSyncChanges({ deviceId, afterSequence, limit }) {
    return this.remote.rpc("pull_sync_changes", {
      p_device_id: deviceId,
      p_after_sequence: afterSequence,
      p_limit: limit
    });
  }

  downloadCourseGraph(courseId) {
    return this.remote.downloadCourseGraph(courseId);
  }
}

export class RelationalSyncEngine {
  #activeSynchronization = null;

  constructor({
    store,
    transport,
    deviceId = null,
    pageSize = 100,
    clock = () => new Date(),
    uuidFactory = defaultUuidFactory
  } = {}) {
    if (!store || typeof store.listPendingOutbox !== "function" || typeof store.applyRemotePage !== "function") {
      throw new TypeError("RelationalSyncEngine exige um IndexedDbRelationalStore.");
    }
    if (!transport || typeof transport.applySyncBatch !== "function" || typeof transport.pullSyncChanges !== "function") {
      throw new TypeError("Transporte de sincronização inválido.");
    }
    if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 500) {
      throw new TypeError("pageSize deve ser inteiro entre 1 e 500.");
    }
    this.store = store;
    this.transport = transport;
    this.deviceId = deviceId;
    this.pageSize = pageSize;
    this.clock = clock;
    this.uuidFactory = uuidFactory;
  }

  async initialize() {
    this.deviceId ||= await getOrCreateDeviceId(this.store);
    return this;
  }

  cursorStateId() {
    if (!this.deviceId) throw new Error("Motor de sincronização não inicializado.");
    return `${SYNC_CURSOR_STATE_PREFIX}:${this.deviceId}`;
  }

  async currentCursor() {
    const row = await this.store.get("syncState", this.cursorStateId());
    return Number(row?.cursor || row?.value || 0);
  }

  async markPushFailures(entries, error) {
    const now = timestamp(this.clock);
    await this.store.transaction(["outbox"], "readwrite", async (transaction) => {
      for (const entry of entries) {
        const current = await transaction.get("outbox", entry.mutationId);
        if (!current) continue;
        await transaction.put("outbox", {
          ...current,
          status: "pending",
          attemptCount: Number(current.attemptCount || 0) + 1,
          lastError: errorMessage(error),
          updatedAt: now
        });
      }
    });
  }

  async recordPushConflicts(conflicts) {
    if (!conflicts.length) return [];
    const now = timestamp(this.clock);
    return this.store.transaction(["outbox", "conflicts"], "readwrite", async (transaction) => {
      const recorded = [];
      for (const serverConflict of conflicts) {
        const mutationId = mutationIdOf(serverConflict);
        const pending = mutationId ? await transaction.get("outbox", mutationId) : null;
        const entityType = String(serverConflict.entityType || pending?.entityType || "");
        const entityId = String(serverConflict.entityId || pending?.entityId || "");
        if (!entityType || !entityId) continue;
        if (serverConflict.blocked === true) {
          if (pending) {
            await transaction.put("outbox", {
              ...pending,
              status: "pending",
              attemptCount: Number(pending.attemptCount || 0) + 1,
              lastError: String(serverConflict.reason || "Bloqueada por conflito causal"),
              updatedAt: now
            });
          }
          continue;
        }
        const conflict = {
          id: this.uuidFactory(),
          courseId: serverConflict.courseId || pending?.courseId || null,
          entityType,
          entityId,
          mutationId: mutationId || null,
          baseRevision: Number(serverConflict.baseRevision ?? pending?.baseRevision ?? 0),
          remoteRevision: Number(serverConflict.remoteRevision ?? 0),
          canonicalEntityId: serverConflict.canonicalEntityId || null,
          localRow: pending?.payload || serverConflict.localRow || null,
          remoteRow: serverConflict.remoteRow || serverConflict.currentRow || null,
          status: "open",
          createdAt: now,
          updatedAt: now,
          resolvedAt: null,
          resolution: null
        };
        await transaction.put("conflicts", conflict);
        if (pending) {
          await transaction.put("outbox", {
            ...pending,
            status: "conflict",
            attemptCount: Number(pending.attemptCount || 0) + 1,
            lastError: "Conflito de revisão",
            updatedAt: now
          });
        }
        recorded.push(conflict);
      }
      return recorded;
    });
  }

  async recordPushRejections(rejections) {
    if (!rejections.length) return [];
    const now = timestamp(this.clock);
    return this.store.transaction(["outbox"], "readwrite", async (transaction) => {
      const recorded = [];
      for (const rejection of rejections) {
        const mutationId = mutationIdOf(rejection);
        const pending = mutationId ? await transaction.get("outbox", mutationId) : null;
        if (!pending) continue;
        const causallyBlocked = rejection.blocked === true || rejection.rolledBack === true || [
          "causal_batch_blocked",
          "atomic_batch_rolled_back"
        ].includes(String(rejection.reason || ""));
        await transaction.put("outbox", {
          ...pending,
          status: causallyBlocked ? "pending" : "rejected",
          attemptCount: Number(pending.attemptCount || 0) + 1,
          lastError: String(rejection.message || rejection.reason || "Mutação rejeitada pelo servidor"),
          updatedAt: now
        });
        if (!causallyBlocked) recorded.push(mutationId);
      }
      return recorded;
    });
  }

  listConflicts(options = {}) {
    return this.store.listConflicts(options);
  }

  listRejectedMutations(options = {}) {
    return this.store.listRejectedOutbox(options);
  }

  resolveConflict(conflictId, resolution) {
    return this.store.resolveConflict(conflictId, resolution, {
      uuidFactory: this.uuidFactory,
      resolvedAt: timestamp(this.clock)
    });
  }

  async push() {
    let acceptedCount = 0;
    let conflictCount = 0;
    let rejectedCount = 0;
    while (true) {
      const pending = await this.store.listPendingOutbox({ limit: this.pageSize });
      if (!pending.length) break;
      let rawResponse;
      try {
        rawResponse = await this.transport.applySyncBatch({ deviceId: this.deviceId, mutations: pending });
      } catch (error) {
        await this.markPushFailures(pending, error);
        throw error;
      }
      const result = normalizePushResponse(rawResponse);
      const sentIds = new Set(pending.map((entry) => entry.mutationId));
      const accepted = result.accepted.filter((id) => sentIds.has(id));
      await this.store.acknowledgeOutbox(accepted);
      const recorded = await this.recordPushConflicts(result.conflicts);
      const rejected = await this.recordPushRejections(result.rejected);
      acceptedCount += accepted.length;
      conflictCount += recorded.length;
      rejectedCount += rejected.length;
      const handled = accepted.length + recorded.length + rejected.length;
      if (!handled || accepted.length === 0 || pending.length < this.pageSize) break;
    }
    return { accepted: acceptedCount, conflicts: conflictCount, rejected: rejectedCount };
  }

  async pull() {
    let cursor = await this.currentCursor();
    const initialCursor = cursor;
    const pendingChanges = [];
    while (true) {
      const previousCursor = cursor;
      const response = normalizePullResponse(
        await this.transport.pullSyncChanges({
          deviceId: this.deviceId,
          afterSequence: cursor,
          limit: this.pageSize
        }),
        cursor
      );
      if (response.nextCursor < cursor) throw new Error("O servidor retornou um cursor de sincronização regressivo.");
      pendingChanges.push(...response.changes);
      cursor = response.nextCursor;
      if (!response.hasMore) break;
      if (!response.changes.length && response.nextCursor === previousCursor) {
        throw new Error("Paginação remota não avançou o cursor.");
      }
    }
    const result = await this.store.applyRemotePage({
      changes: pendingChanges,
      cursor,
      deviceId: this.deviceId,
      syncStateId: this.cursorStateId(),
      receivedAt: timestamp(this.clock),
      uuidFactory: this.uuidFactory
    });
    return {
      applied: result.applied.length,
      conflicts: result.conflicts.length,
      cursor,
      previousCursor: initialCursor,
      membershipCourseIds: [...new Set(
        pendingChanges
          .filter((change) =>
            change.storeName === "memberships" &&
            change.operation !== "delete" &&
            change.deletedAt == null &&
            change.row?.deletedAt == null
          )
          .map((change) => String(change.courseId || change.row?.courseId || ""))
          .filter(Boolean)
      )]
    };
  }

  async bootstrapMissingCourses(forceCourseIds = []) {
    if (
      typeof this.transport.downloadCourseGraph !== "function" ||
      typeof this.store.replaceCourseSnapshot !== "function"
    ) return 0;
    const userId = await this.store.getSyncState("replica.userId");
    if (!userId) return 0;
    const [memberships, courses] = await Promise.all([
      this.store.getAll("memberships"),
      this.store.getAll("courses")
    ]);
    const availableCourseIds = new Set(
      courses.filter((row) => row.deletedAt == null).map((row) => String(row.id))
    );
    const activeMembershipCourseIds = new Set(
      memberships
        .filter((row) => row.deletedAt == null && row.userId === userId)
        .map((row) => String(row.courseId))
        .filter(Boolean)
    );
    const forced = new Set(forceCourseIds.map(String));
    const missingCourseIds = [...activeMembershipCourseIds].filter(
      (courseId) => !availableCourseIds.has(courseId) || forced.has(courseId)
    );
    for (const courseId of missingCourseIds) {
      const snapshot = firstObject(await this.transport.downloadCourseGraph(courseId));
      await this.store.replaceCourseSnapshot(courseId, snapshot);
    }
    return missingCourseIds.length;
  }

  synchronize() {
    if (this.#activeSynchronization) return this.#activeSynchronization;
    this.#activeSynchronization = this.initialize()
      .then(async () => {
        const pushed = await this.push();
        const pulled = await this.pull();
        const bootstrappedCourses = await this.bootstrapMissingCourses(
          pulled.membershipCourseIds
        );
        return { pushed, pulled, bootstrappedCourses, deviceId: this.deviceId };
      })
      .finally(() => { this.#activeSynchronization = null; });
    return this.#activeSynchronization;
  }
}
