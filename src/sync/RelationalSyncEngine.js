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
  const authRequired = response.authRequired === true || response.auth_required === true ||
    String(response.status || "").toLowerCase() === SYNC_FAILURE_KIND.AUTH_REQUIRED ||
    results.some((result) => String(result?.status || "").toLowerCase() === SYNC_FAILURE_KIND.AUTH_REQUIRED);
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
    rejected: [...new Map(rejected.map((entry) => [mutationIdOf(entry), entry])).values()],
    authRequired
  };
}

function timestamp(clock) {
  const value = clock();
  return value instanceof Date ? value.toISOString() : String(value);
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error || "Falha de sincronização.");
}

export const SYNC_FAILURE_KIND = Object.freeze({
  RETRYABLE: "retryable",
  CONFLICT: "conflict",
  REJECTED: "rejected",
  AUTH_REQUIRED: "auth_required",
  BOOTSTRAP_REQUIRED: "bootstrap_required"
});

const AUTHENTICATION_FAILURE_CODES = new Set([
  "AUTH_REQUIRED",
  "BAD_JWT",
  "INVALID_JWT",
  "JWT_EXPIRED",
  "JWT_INVALID",
  "INVALID_TOKEN",
  "INVALID_GRANT",
  "SESSION_NOT_FOUND",
  "NO_SESSION",
  "REFRESH_TOKEN_NOT_FOUND",
  "REFRESH_TOKEN_EXPIRED",
  "REFRESH_TOKEN_ALREADY_USED",
  "PGRST301"
]);

function isAuthenticationFailure({ status, code, message, error }) {
  if (status === 403 && error?.authRequired !== true) return false;
  return error?.authRequired === true ||
    status === 401 ||
    AUTHENTICATION_FAILURE_CODES.has(code) ||
    /(?:\bjwt\b.*\b(?:invalid|expired|malformed)\b|\b(?:invalid|expired)\b.*\bjwt\b|\b(?:refresh token|token de refresh)\b.*\b(?:invalid|expired|missing|not found|already used|inv[aá]lido|expirado|ausente)\b|\b(?:session|sess[aã]o)\b.*\b(?:invalid|expired|missing|not found|inv[aá]lida|expirada|ausente)\b|\bauthentication required\b|\bautentica(?:ção|cao) necess[aá]ria\b)/u.test(message);
}

function failureReason(error, code, status) {
  const normalizedMessage = errorMessage(error).toLowerCase();
  if (error instanceof TypeError) return "invalid_payload";
  if (code === "42501" || status === 401 || status === 403) return "authorization_denied";
  if (code === "23503") return "invalid_reference";
  if (code === "23514") return "structural_violation";
  if (["P0002", "02000"].includes(code) || status === 404 || status === 410) return "entity_missing";
  if (normalizedMessage.includes("mutation") && normalizedMessage.includes("reutil")) {
    return "mutation_id_reuse";
  }
  if (normalizedMessage.includes("fragment")) return "invalid_fragment";
  if (status === 400 || status === 422 || code.startsWith("22")) return "invalid_payload";
  if (status === 409 || code === "40001") return "revision_mismatch";
  return "deterministic_failure";
}

export function classifySyncFailure(error) {
  const status = Number(error?.status ?? error?.response?.status ?? 0);
  const code = String(error?.code || error?.response?.code || "").toUpperCase();
  const message = errorMessage(error).toLowerCase();
  const networkTypeError = error instanceof TypeError &&
    /(?:failed to fetch|fetch failed|network|offline|load failed|connection|socket)/u.test(message);
  if (isAuthenticationFailure({ status, code, message, error })) {
    return { kind: SYNC_FAILURE_KIND.AUTH_REQUIRED, status, code, reason: "authentication_required" };
  }
  if (code === "55000") {
    return { kind: SYNC_FAILURE_KIND.BOOTSTRAP_REQUIRED, status, code, reason: "bootstrap_required" };
  }
  if (status === 409 || code === "40001") {
    return { kind: SYNC_FAILURE_KIND.CONFLICT, status, code, reason: "revision_mismatch" };
  }
  if (
    networkTypeError ||
    error?.name === "AbortError" ||
    status === 0 && ["REQUEST_TIMEOUT", "NETWORK_ERROR", "ECONNRESET", "ETIMEDOUT"].includes(code) ||
    [408, 425, 429].includes(status) ||
    status >= 500 ||
    [
      "40P01", "55P03", "57014", "57P01", "57P02", "57P03",
      "08000", "08001", "08003", "08006"
    ].includes(code)
  ) {
    return { kind: SYNC_FAILURE_KIND.RETRYABLE, status, code, reason: "temporary_failure" };
  }
  return {
    kind: SYNC_FAILURE_KIND.REJECTED,
    status,
    code,
    reason: failureReason(error, code, status)
  };
}

function snapshotStoreName(remoteName, row) {
  return changeStoreName({ tableName: remoteName }, row);
}

function normalizeReplicaSnapshot(rawSnapshot) {
  const snapshot = firstObject(rawSnapshot);
  const normalized = {};
  Object.entries(snapshot).forEach(([remoteName, rawRows]) => {
    if (!Array.isArray(rawRows)) return;
    rawRows.forEach((rawRow) => {
      const row = camelize(rawRow);
      const storeName = snapshotStoreName(remoteName, row);
      if (!normalized[storeName]) normalized[storeName] = [];
      normalized[storeName].push(row);
    });
  });
  return normalized;
}

function normalizeBootstrapResponse(rawResponse) {
  const response = firstObject(rawResponse);
  const highWaterSequence = Number(
    response.highWaterSequence ?? response.high_water_sequence ?? response.highWater ?? response.high_water ?? 0
  );
  return {
    snapshot: normalizeReplicaSnapshot(response.snapshot || response.rows || response.replica || {}),
    highWaterSequence
  };
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
      if (!regularMutations.length) return { blocked: false, authRequired: false };
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
      return {
        blocked: batchResults.some((result) => ["conflict", "rejected", "invalid", "forbidden"].includes(
          String(result?.status || "").toLowerCase()
        )),
        authRequired: response.authRequired === true || response.auth_required === true ||
          String(response.status || "").toLowerCase() === SYNC_FAILURE_KIND.AUTH_REQUIRED ||
          batchResults.some((result) => String(result?.status || "").toLowerCase() === SYNC_FAILURE_KIND.AUTH_REQUIRED)
      };
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
      const regularResult = await flushRegular();
      if (regularResult.authRequired) return { deviceId, results, authRequired: true };
      if (regularResult.blocked) break;
      try {
        if (isCourseDeletion) {
          const rpcResult = firstObject(await this.remote.rpc("delete_personal_course", {
            p_course_id: mutation.payload?.courseId || mutation.courseId,
            p_base_revision: mutation.baseRevision,
            p_mutation_id: mutation.mutationId
          }));
          const deletionStatus = String(rpcResult.status || "applied").toLowerCase();
          if (deletionStatus === SYNC_FAILURE_KIND.AUTH_REQUIRED) {
            results.push({
              ...camelize(rpcResult),
              mutationId: mutation.mutationId,
              entityType: mutation.entityType,
              entityId: mutation.entityId,
              status: deletionStatus
            });
            return { deviceId, results, authRequired: true };
          }
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
        if (replacementStatus === SYNC_FAILURE_KIND.AUTH_REQUIRED) {
          results.push({
            ...camelize(rpcResult),
            mutationId: mutation.mutationId,
            entityType: mutation.entityType,
            entityId: mutation.entityId,
            courseId: mutation.courseId,
            localRow: mutation.payload,
            status: replacementStatus
          });
          return { deviceId, results, authRequired: true };
        }
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
        const failure = classifySyncFailure(error);
        if (failure.kind === SYNC_FAILURE_KIND.CONFLICT) {
          results.push({
            mutationId: mutation.mutationId,
            entityType: mutation.entityType,
            entityId: mutation.entityId,
            courseId: mutation.courseId,
            baseRevision: mutation.baseRevision,
            status: "conflict",
            code: failure.code,
            reason: failure.reason,
            message: error.message
          });
          break;
        } else if (
          failure.kind === SYNC_FAILURE_KIND.RETRYABLE ||
          failure.kind === SYNC_FAILURE_KIND.AUTH_REQUIRED
        ) {
          throw error;
        } else {
          results.push({
            mutationId: mutation.mutationId,
            entityType: mutation.entityType,
            entityId: mutation.entityId,
            courseId: mutation.courseId,
            status: "rejected",
            code: failure.code,
            reason: failure.reason,
            message: errorMessage(error)
          });
          break;
        }
      }
    }
    const regularResult = await flushRegular();
    return { deviceId, results, authRequired: regularResult.authRequired };
  }

  pullSyncChanges({ deviceId, afterSequence, limit }) {
    return this.remote.rpc("pull_sync_changes", {
      p_device_id: deviceId,
      p_after_sequence: afterSequence,
      p_limit: limit
    });
  }

  bootstrapReplica({ deviceId }) {
    return this.remote.rpc("bootstrap_replica", { p_device_id: deviceId }, { timeoutMs: 60_000 });
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
    uuidFactory = defaultUuidFactory,
    onProgress = null
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
    this.onProgress = typeof onProgress === "function" ? onProgress : null;
  }

  reportProgress(progress) {
    this.onProgress?.(progress);
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
          rejectionCode: causallyBlocked ? null : String(rejection.code || ""),
          rejectionReason: causallyBlocked ? null : String(rejection.reason || "deterministic_failure"),
          rejectedAt: causallyBlocked ? null : now,
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

  discardRejectedMutation(mutationId, options = {}) {
    return this.store.discardRejectedMutation(mutationId, options);
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
        const failure = classifySyncFailure(error);
        if (failure.kind === SYNC_FAILURE_KIND.AUTH_REQUIRED) {
          return {
            accepted: acceptedCount,
            conflicts: conflictCount,
            rejected: rejectedCount,
            authRequired: true,
            failure,
            message: errorMessage(error)
          };
        }
        if (failure.kind === SYNC_FAILURE_KIND.RETRYABLE) {
          await this.markPushFailures(pending, error);
          throw error;
        }
        if (failure.kind === SYNC_FAILURE_KIND.BOOTSTRAP_REQUIRED) {
          await this.store.putSyncState(`sync.bootstrap.required:${this.deviceId}`, true);
          return {
            accepted: acceptedCount,
            conflicts: conflictCount,
            rejected: rejectedCount,
            bootstrapRequired: true,
            failure,
            message: errorMessage(error)
          };
        }
        const first = pending[0];
        if (failure.kind === SYNC_FAILURE_KIND.CONFLICT) {
          const recorded = await this.recordPushConflicts([{
            mutationId: first.mutationId,
            entityType: first.entityType,
            entityId: first.entityId,
            courseId: first.courseId,
            baseRevision: first.baseRevision,
            status: "conflict",
            code: failure.code,
            reason: failure.reason,
            message: errorMessage(error)
          }]);
          conflictCount += recorded.length;
        } else {
          const rejected = await this.recordPushRejections([{
            mutationId: first.mutationId,
            status: "rejected",
            code: failure.code,
            reason: failure.reason,
            message: errorMessage(error)
          }]);
          rejectedCount += rejected.length;
        }
        continue;
      }
      const result = normalizePushResponse(rawResponse);
      if (result.authRequired) {
        return {
          accepted: acceptedCount,
          conflicts: conflictCount,
          rejected: rejectedCount,
          authRequired: true,
          failure: {
            kind: SYNC_FAILURE_KIND.AUTH_REQUIRED,
            status: 401,
            code: "AUTH_REQUIRED",
            reason: "authentication_required"
          },
          message: "A sessão Supabase precisa ser renovada."
        };
      }
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
    let appliedCount = 0;
    let conflictCount = 0;
    let pageCount = 0;
    const membershipCourseIds = new Set();
    while (true) {
      const previousCursor = cursor;
      let rawResponse;
      try {
        rawResponse = await this.transport.pullSyncChanges({
          deviceId: this.deviceId,
          afterSequence: cursor,
          limit: this.pageSize
        });
      } catch (error) {
        if (classifySyncFailure(error).kind === SYNC_FAILURE_KIND.BOOTSTRAP_REQUIRED) {
          await this.store.putSyncState(`sync.bootstrap.required:${this.deviceId}`, true);
        }
        throw error;
      }
      const response = normalizePullResponse(rawResponse, cursor);
      if (response.nextCursor < cursor) throw new Error("O servidor retornou um cursor de sincronização regressivo.");
      response.changes
        .filter((change) =>
          change.storeName === "memberships" &&
          change.operation !== "delete" &&
          change.deletedAt == null &&
          change.row?.deletedAt == null
        )
        .map((change) => String(change.courseId || change.row?.courseId || ""))
        .filter(Boolean)
        .forEach((courseId) => membershipCourseIds.add(courseId));
      cursor = response.nextCursor;
      const result = await this.store.applyRemotePage({
        changes: response.changes,
        cursor,
        deviceId: this.deviceId,
        syncStateId: this.cursorStateId(),
        receivedAt: timestamp(this.clock),
        uuidFactory: this.uuidFactory
      });
      appliedCount += result.applied.length;
      conflictCount += result.conflicts.length;
      pageCount += 1;
      if (!response.hasMore) break;
      if (!response.changes.length && response.nextCursor === previousCursor) {
        throw new Error("Paginação remota não avançou o cursor.");
      }
    }
    return {
      applied: appliedCount,
      conflicts: conflictCount,
      pages: pageCount,
      cursor,
      previousCursor: initialCursor,
      membershipCourseIds: [...membershipCourseIds]
    };
  }

  async bootstrapReplicaIfNeeded({ force = false } = {}) {
    if (
      typeof this.transport.bootstrapReplica !== "function" ||
      typeof this.store.applyReplicaBootstrap !== "function"
    ) return { status: "unavailable" };
    const bootstrapRequired = await this.store.getSyncState(`sync.bootstrap.required:${this.deviceId}`);
    const bootstrapState = await this.store.getSyncState(`sync.bootstrap:${this.deviceId}`);
    if (!force && !bootstrapRequired && bootstrapState) {
      return { status: "already_bootstrapped", cursor: await this.currentCursor() };
    }
    const currentCursor = await this.currentCursor();
    if (!force && !bootstrapRequired && currentCursor > 0) {
      await this.store.putSyncState(`sync.bootstrap:${this.deviceId}`, true);
      return { status: "already_materialized", cursor: currentCursor };
    }
    const response = normalizeBootstrapResponse(
      await this.transport.bootstrapReplica({ deviceId: this.deviceId })
    );
    return this.store.applyReplicaBootstrap({
      snapshot: response.snapshot,
      highWaterSequence: response.highWaterSequence,
      deviceId: this.deviceId,
      syncStateId: this.cursorStateId(),
      receivedAt: timestamp(this.clock),
      uuidFactory: this.uuidFactory
    });
  }

  async bootstrapMissingCourses(candidateCourseIds = null) {
    if (
      typeof this.transport.downloadCourseGraph !== "function" ||
      typeof this.store.replaceCourseSnapshot !== "function"
    ) return 0;
    const userId = await this.store.getSyncState("replica.userId");
    if (!userId) return 0;
    this.reportProgress({ percent: 68, message: "Verificando os cursos desta conta…" });
    const [memberships, courses, modules] = await Promise.all([
      this.store.getAll("memberships"),
      this.store.getAll("courses"),
      this.store.getAll("modules")
    ]);
    const activeCourseIds = new Set(
      courses.filter((row) => row.deletedAt == null).map((row) => String(row.id))
    );
    // A clone feed intentionally carries the course and membership rows only.
    // Treating the course header as a complete local copy leaves the learner
    // with a course card that has no modules. Published personal copies always
    // have at least one module, so it is a durable completion marker.
    const materializedCourseIds = new Set(
      modules
        .filter((row) => row.deletedAt == null && activeCourseIds.has(String(row.courseId)))
        .map((row) => String(row.courseId))
    );
    const activeMembershipCourseIds = new Set(
      memberships
        .filter((row) => row.deletedAt == null && row.userId === userId)
        .map((row) => String(row.courseId))
        .filter(Boolean)
    );
    const candidates = Array.isArray(candidateCourseIds) && candidateCourseIds.length
      ? new Set(candidateCourseIds.map(String))
      : null;
    const missingCourseIds = [...activeMembershipCourseIds]
      .filter((courseId) => !candidates || candidates.has(courseId))
      .filter(
      (courseId) => !materializedCourseIds.has(courseId)
    );
    const total = missingCourseIds.length;
    for (const [index, courseId] of missingCourseIds.entries()) {
      const startPercent = 70 + Math.round((index / Math.max(total, 1)) * 22);
      this.reportProgress({
        percent: startPercent,
        message: total > 1
          ? `Baixando curso ${index + 1} de ${total} para este dispositivo…`
          : "Baixando o curso para este dispositivo…"
      });
      const snapshot = firstObject(await this.transport.downloadCourseGraph(courseId));
      this.reportProgress({
        percent: Math.min(95, startPercent + 12),
        message: total > 1
          ? `Salvando curso ${index + 1} de ${total} neste dispositivo…`
          : "Salvando o curso neste dispositivo…"
      });
      const result = await this.store.replaceCourseSnapshot(courseId, snapshot, {
        receivedAt: timestamp(this.clock),
        uuidFactory: this.uuidFactory
      });
      if (result.status !== "applied") return missingCourseIds.indexOf(courseId);
    }
    return missingCourseIds.length;
  }

  authRequiredResult({ pushed, bootstrap = null, pulled = null } = {}) {
    return {
      pushed,
      bootstrap,
      pulled,
      bootstrappedCourses: 0,
      deviceId: this.deviceId,
      authRequired: true
    };
  }

  synchronize({ expectedCourseIds = [] } = {}) {
    if (!Array.isArray(expectedCourseIds)) {
      throw new TypeError("expectedCourseIds deve ser uma lista.");
    }
    if (this.#activeSynchronization) return this.#activeSynchronization;
    this.reportProgress({ percent: 12, message: "Preparando a sincronização…" });
    this.#activeSynchronization = this.initialize()
      .then(async () => {
        this.reportProgress({ percent: 20, message: "Enviando alterações pendentes…" });
        let pushed;
        try {
          pushed = await this.push();
        } catch (error) {
          const failure = classifySyncFailure(error);
          if (failure.kind !== SYNC_FAILURE_KIND.RETRYABLE) throw error;
          pushed = {
            accepted: 0,
            conflicts: 0,
            rejected: 0,
            retryable: true,
            failure,
            message: errorMessage(error)
          };
        }
        if (pushed.authRequired) return this.authRequiredResult({ pushed });
        this.reportProgress({ percent: 36, message: "Conferindo a réplica deste dispositivo…" });
        let bootstrap;
        try {
          bootstrap = await this.bootstrapReplicaIfNeeded();
        } catch (error) {
          const failure = classifySyncFailure(error);
          if (failure.kind === SYNC_FAILURE_KIND.AUTH_REQUIRED) {
            return this.authRequiredResult({
              pushed,
              bootstrap: { status: SYNC_FAILURE_KIND.AUTH_REQUIRED, failure, message: errorMessage(error) }
            });
          }
          if (failure.kind !== SYNC_FAILURE_KIND.RETRYABLE) throw error;
          bootstrap = {
            status: "retryable_failure",
            failure,
            message: errorMessage(error)
          };
        }
        if (["reconciliation_required", "retryable_failure"].includes(bootstrap.status)) {
          return {
            pushed,
            bootstrap,
            pulled: null,
            bootstrappedCourses: 0,
            deviceId: this.deviceId
          };
        }
        let pulled;
        try {
          this.reportProgress({ percent: 52, message: "Buscando alterações no Supabase…" });
          pulled = await this.pull();
        } catch (error) {
          const failure = classifySyncFailure(error);
          if (failure.kind === SYNC_FAILURE_KIND.AUTH_REQUIRED) {
            return this.authRequiredResult({
              pushed,
              bootstrap,
              pulled: { status: SYNC_FAILURE_KIND.AUTH_REQUIRED, failure, message: errorMessage(error) }
            });
          }
          if (failure.kind !== SYNC_FAILURE_KIND.BOOTSTRAP_REQUIRED) throw error;
          try {
            bootstrap = await this.bootstrapReplicaIfNeeded({ force: true });
          } catch (bootstrapError) {
            const failure = classifySyncFailure(bootstrapError);
            if (failure.kind === SYNC_FAILURE_KIND.AUTH_REQUIRED) {
              return this.authRequiredResult({
                pushed,
                bootstrap: { status: SYNC_FAILURE_KIND.AUTH_REQUIRED, failure, message: errorMessage(bootstrapError) }
              });
            }
            if (failure.kind !== SYNC_FAILURE_KIND.RETRYABLE) throw bootstrapError;
            bootstrap = {
              status: "retryable_failure",
              failure,
              message: errorMessage(bootstrapError)
            };
          }
          if (["reconciliation_required", "retryable_failure"].includes(bootstrap.status)) {
            return {
              pushed,
              bootstrap,
              pulled: null,
              bootstrappedCourses: 0,
              deviceId: this.deviceId
            };
          }
          try {
            pulled = await this.pull();
          } catch (retryPullError) {
            const failure = classifySyncFailure(retryPullError);
            if (failure.kind === SYNC_FAILURE_KIND.AUTH_REQUIRED) {
              return this.authRequiredResult({
                pushed,
                bootstrap,
                pulled: { status: SYNC_FAILURE_KIND.AUTH_REQUIRED, failure, message: errorMessage(retryPullError) }
              });
            }
            throw retryPullError;
          }
        }
        let bootstrappedCourses;
        try {
          this.reportProgress({ percent: 66, message: "Preparando os cursos para estudo…" });
          bootstrappedCourses = await this.bootstrapMissingCourses([
            ...new Set([
              ...pulled.membershipCourseIds,
              ...expectedCourseIds.map(String).filter(Boolean)
            ])
          ]);
        } catch (error) {
          const failure = classifySyncFailure(error);
          if (failure.kind === SYNC_FAILURE_KIND.AUTH_REQUIRED) {
            return this.authRequiredResult({
              pushed,
              bootstrap,
              pulled: { ...pulled, authRequired: true, failure, message: errorMessage(error) }
            });
          }
          throw error;
        }
        this.reportProgress({ percent: 100, message: "Cursos atualizados. Abrindo o AraLearn…" });
        return { pushed, bootstrap, pulled, bootstrappedCourses, deviceId: this.deviceId };
      })
      .finally(() => { this.#activeSynchronization = null; });
    return this.#activeSynchronization;
  }
}
