import {
  OFFICIAL_COURSE_STORE_NAMES,
  SYNCED_PERSONAL_STORE_NAMES
} from "../persistence/IndexedDbRelationalStore.js";
import { PERSONAL_OUTBOX_STORE_NAMES } from "../persistence/DomainMutationService.js";
import { contractToRelationalRows } from "../persistence/contractToRelationalRows.js";
import { deterministicUuid } from "../persistence/deterministicUuid.js";
import { validateProjectDocument } from "../domain/aralearnProject.js";
import { canonicalRevisionHash } from "../storage/canonicalRevision.js";
import { getOrCreateDeviceId } from "./deviceIdentity.js";

export const SYNC_CURSOR_STATE_PREFIX = "sync.cursor";

const PERSONAL_FEED_STORE_SET = new Set(SYNCED_PERSONAL_STORE_NAMES);
const PERSONAL_OUTBOX_STORE_SET = new Set(PERSONAL_OUTBOX_STORE_NAMES);
const OFFICIAL_COURSE_STORE_SET = new Set(OFFICIAL_COURSE_STORE_NAMES);
const REPLICA_FEED_STORE_SET = PERSONAL_FEED_STORE_SET;

function sequentialUuid(index) {
  return `00000000-0000-8000-8000-${String(index).padStart(12, "0")}`;
}

async function revisionDocumentToRows(document, courseId) {
  const identityKeys = [];
  contractToRelationalRows(document, {
    uuidFactory(identityKey) {
      identityKeys.push(String(identityKey));
      return sequentialUuid(identityKeys.length);
    }
  });
  const identityMap = new Map(await Promise.all(
    [...new Set(identityKeys)].map(async (identityKey) => [
      identityKey,
      await deterministicUuid(`aralearn:revision:${courseId}:${identityKey}`)
    ])
  ));
  identityMap.set(`course:${document.courses[0].id}`, courseId);
  return contractToRelationalRows(document, { identityMap });
}

const REMOTE_TABLE_TO_STORE = Object.freeze({
  user_course_selections: "courseSelections",
  lesson_progress: "lessonProgress",
  card_progress: "cardProgress",
  card_comments: "comments",
  study_paths: "studyPaths",
  study_path_courses: "studyPathCourses"
});

function array(value) {
  return Array.isArray(value) ? value : [];
}

function firstObject(value) {
  if (Array.isArray(value) && value.length === 1 && value[0] && typeof value[0] === "object") {
    return value[0];
  }
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function camelName(value) {
  return String(value || "").replace(/_([a-z])/g, (_match, character) => character.toUpperCase());
}

function camelizeRow(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  return Object.fromEntries(Object.entries(value).map(([key, entry]) => [camelName(key), entry]));
}

function storeNameForRemote(remoteName) {
  const normalizedName = String(remoteName || "");
  if (PERSONAL_FEED_STORE_SET.has(normalizedName) || OFFICIAL_COURSE_STORE_SET.has(normalizedName)) {
    return normalizedName;
  }
  return REMOTE_TABLE_TO_STORE[normalizedName] || normalizedName;
}

function normalizeRowsByStore(rawRows, allowedStores, { strict = false } = {}) {
  const normalized = Object.fromEntries([...allowedStores].map((storeName) => [storeName, []]));
  const source = firstObject(rawRows);
  const seenStores = new Set();
  for (const [remoteName, rows] of Object.entries(source)) {
    if (remoteName === "schemaVersion" || remoteName === "schema_version") continue;
    if (remoteName === "projectMeta" || remoteName === "project_meta") {
      if (strict && !Array.isArray(rows)) {
        throw new Error("O metadado de projeto do grafo oficial está em formato inválido.");
      }
      continue;
    }
    if (!Array.isArray(rows)) {
      if (strict) throw new Error(`O grafo oficial retornou ${remoteName} em formato inválido.`);
      continue;
    }
    for (const rawRow of rows) {
      const row = camelizeRow(rawRow);
      const storeName = storeNameForRemote(remoteName);
      if (!allowedStores.has(storeName)) {
        if (strict) throw new Error(`O grafo oficial retornou a coleção desconhecida "${remoteName}".`);
        continue;
      }
      seenStores.add(storeName);
      normalized[storeName].push(row);
    }
    if (!rows.length) {
      const storeName = storeNameForRemote(remoteName);
      if (allowedStores.has(storeName)) seenStores.add(storeName);
    }
  }
  if (strict) {
    const missing = [...allowedStores].filter((storeName) => !seenStores.has(storeName));
    if (missing.length) {
      throw new Error(`O grafo oficial não retornou as coleções: ${missing.join(", ")}.`);
    }
  }
  return normalized;
}

function normalizeRemoteChange(rawChange) {
  const rawRow = rawChange?.row ?? rawChange?.payload ?? rawChange?.rowData ?? rawChange?.row_data ?? null;
  const row = camelizeRow(rawRow);
  const declaredStore = rawChange?.storeName || rawChange?.store_name;
  const remoteName = declaredStore || rawChange?.tableName || rawChange?.table_name ||
    rawChange?.entityType || rawChange?.entity_type || "";
  const storeName = storeNameForRemote(remoteName);
  if (!REPLICA_FEED_STORE_SET.has(storeName)) {
    throw new Error(`O feed da réplica retornou a entidade não permitida "${storeName}".`);
  }
  const entityId = String(rawChange?.entityId || rawChange?.entity_id || row?.id || "");
  if (!entityId) throw new Error("Alteração remota sem entityId.");
  const operation = String(rawChange?.operation || "").toLowerCase() === "delete" ||
    rawChange?.deletedAt || rawChange?.deleted_at || row?.deletedAt
    ? "delete"
    : "upsert";
  return {
    storeName,
    entityType: storeName,
    entityId,
    courseId: rawChange?.courseId || rawChange?.course_id || row?.courseId || null,
    operation,
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
      response.cursor ?? previousCursor
  );
  return {
    changes,
    nextCursor: Number.isSafeInteger(nextCursor) && nextCursor >= 0 ? nextCursor : previousCursor,
    hasMore: Boolean(response.hasMore ?? response.has_more ?? false)
  };
}

function mutationIdOf(value) {
  return String(value?.mutationId || value?.mutation_id || value?.id || value || "");
}

function normalizePushResponse(rawResponse, pending) {
  const response = firstObject(rawResponse);
  const results = array(response.results || response.mutations);
  const status = String(response.status || "").toLowerCase();
  const authRequired = response.authRequired === true || response.auth_required === true ||
    status === SYNC_FAILURE_KIND.AUTH_REQUIRED ||
    results.some((result) => String(result?.status || "").toLowerCase() === SYNC_FAILURE_KIND.AUTH_REQUIRED);
  const accepted = new Set(
    array(response.acceptedMutationIds || response.accepted_mutation_ids || response.accepted)
      .map(mutationIdOf)
      .filter(Boolean)
  );
  const rejected = array(response.rejectedMutationIds || response.rejected_mutation_ids || response.rejected)
    .map((entry) => typeof entry === "object" ? camelizeRow(entry) : { mutationId: mutationIdOf(entry) })
    .filter((entry) => mutationIdOf(entry));
  const retryable = [];
  results.forEach((result) => {
    const normalized = camelizeRow(result);
    const id = mutationIdOf(normalized);
    const resultStatus = String(normalized?.status || "").toLowerCase();
    if (["accepted", "applied", "duplicate", "already_applied"].includes(resultStatus) && id) {
      accepted.add(id);
    } else if (["rejected", "invalid", "forbidden"].includes(resultStatus) && id) {
      rejected.push(normalized);
    } else if (["retryable", "temporary_failure"].includes(resultStatus) && id) {
      retryable.push(normalized);
    }
  });
  if (!results.length && !accepted.size && !rejected.length && !retryable.length &&
      ["accepted", "applied", "duplicate", "already_applied"].includes(status)) {
    pending.forEach((entry) => accepted.add(entry.mutationId));
  }
  return {
    accepted: [...accepted],
    rejected: [...new Map(rejected.map((entry) => [mutationIdOf(entry), entry])).values()],
    retryable: [...new Map(retryable.map((entry) => [mutationIdOf(entry), entry])).values()],
    authRequired
  };
}

function normalizeManifestEntry(entry) {
  const courseId = String(entry?.courseId || entry?.course_id || "");
  if (!courseId) return null;
  const publicationSeq = Number(entry?.publicationSeq ?? entry?.publication_seq ?? 0);
  return {
    courseId,
    publicationSeq: Number.isSafeInteger(publicationSeq) && publicationSeq >= 0 ? publicationSeq : 0,
    contentHash: String(entry?.contentHash || entry?.content_hash || "")
  };
}

function normalizeBootstrapResponse(rawResponse) {
  const response = firstObject(rawResponse);
  const snapshot = normalizeRowsByStore(
    response.snapshot || response.rows || response.replica || {},
    PERSONAL_FEED_STORE_SET
  );
  const highWaterSequence = Number(
    response.highWaterSequence ?? response.high_water_sequence ?? response.highWater ?? response.high_water ?? 0
  );
  if (!Number.isSafeInteger(highWaterSequence) || highWaterSequence < 0) {
    throw new Error("O bootstrap retornou um high-water sequence inválido.");
  }
  const hasExplicitManifest = Object.hasOwn(response, "selectedCourses") ||
    Object.hasOwn(response, "selected_courses");
  const explicitManifest = array(response.selectedCourses ?? response.selected_courses)
    .map(normalizeManifestEntry)
    .filter(Boolean);
  const derivedManifest = snapshot.courseSelections
    .filter((row) => row.deletedAt == null)
    .map(normalizeManifestEntry)
    .filter(Boolean);
  const manifest = hasExplicitManifest ? explicitManifest : derivedManifest;
  return {
    snapshot,
    selectedCourses: [...new Map(manifest.map((entry) => [entry.courseId, entry])).values()],
    highWaterSequence
  };
}

function normalizeGraphResponse(rawResponse, requestedCourseId) {
  const response = firstObject(rawResponse);
  const graph = normalizeRowsByStore(
    response.graph || response.snapshot || response.rows || response,
    OFFICIAL_COURSE_STORE_SET,
    { strict: true }
  );
  const courseId = String(
    response.courseId || response.course_id || graph.courses?.[0]?.id || requestedCourseId || ""
  );
  if (!courseId || courseId !== String(requestedCourseId || "")) {
    throw new Error("O servidor retornou o grafo de outro curso.");
  }
  const publicationSeq = Number(
    response.publicationSeq ?? response.publication_seq ?? graph.courses?.[0]?.publicationSeq ?? 0
  );
  return {
    courseId,
    publicationSeq: Number.isSafeInteger(publicationSeq) && publicationSeq >= 0 ? publicationSeq : 0,
    contentHash: String(
      response.contentHash || response.content_hash || graph.courses?.[0]?.contentHash || ""
    ),
    graph
  };
}

function timestamp(clock) {
  const value = clock();
  return value instanceof Date ? value.toISOString() : String(value);
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error || "Falha de sincronização.");
}

function staleCourseSelectionError(error, courseId) {
  const status = Number(error?.status ?? error?.response?.status ?? 0);
  if (status !== 403) return error;
  const stale = new Error("A seleção do curso mudou durante a sincronização.", { cause: error });
  stale.name = "StaleCourseSelectionError";
  stale.status = status;
  stale.code = String(error?.code || error?.response?.code || "42501");
  stale.courseId = courseId;
  stale.courseSelectionStale = true;
  return stale;
}

export const SYNC_FAILURE_KIND = Object.freeze({
  RETRYABLE: "retryable",
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
  return error?.authRequired === true || status === 401 || AUTHENTICATION_FAILURE_CODES.has(code) ||
    /(?:\bjwt\b.*\b(?:invalid|expired|malformed)\b|\b(?:invalid|expired)\b.*\bjwt\b|\b(?:refresh token|token de refresh)\b.*\b(?:invalid|expired|missing|not found|already used|inv[aá]lido|expirado|ausente)\b|\b(?:session|sess[aã]o)\b.*\b(?:invalid|expired|missing|not found|inv[aá]lida|expirada|ausente)\b|\bauthentication required\b|\bautentica(?:ção|cao) necess[aá]ria\b)/u.test(message);
}

function failureReason(error, code, status) {
  const message = errorMessage(error).toLowerCase();
  if (error instanceof TypeError) return "invalid_payload";
  if (code === "42501" || status === 403) return "authorization_denied";
  if (code === "23503") return "invalid_reference";
  if (code === "23514") return "structural_violation";
  if (["P0002", "02000"].includes(code) || status === 404 || status === 410) return "entity_missing";
  if (message.includes("mutation") && message.includes("reutil")) return "mutation_id_reuse";
  if (status === 400 || status === 422 || status === 409 || code.startsWith("22")) return "invalid_payload";
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
  if (
    error?.retryable === true || networkTypeError || error?.name === "AbortError" ||
    (status === 0 && ["REQUEST_TIMEOUT", "NETWORK_ERROR", "ECONNRESET", "ETIMEDOUT"].includes(code)) ||
    [408, 425, 429].includes(status) || status >= 500 ||
    [
      "40001", "40P01", "55P03", "57014", "57P01", "57P02", "57P03",
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

export class SupabaseSyncTransport {
  constructor(remoteCatalog) {
    if (!remoteCatalog || typeof remoteCatalog.rpc !== "function") {
      throw new TypeError("Transporte Supabase exige acesso autenticado a RPCs.");
    }
    this.remote = remoteCatalog;
  }

  applySyncBatch({ deviceId, mutations }) {
    mutations.forEach((mutation) => {
      if (!PERSONAL_OUTBOX_STORE_SET.has(mutation.entityType)) {
        throw new TypeError(`A outbox não aceita a entidade "${mutation.entityType}".`);
      }
    });
    return this.remote.rpc("apply_sync_batch", {
      p_device_id: deviceId,
      p_mutations: mutations.map(({
        mutationId,
        sequence,
        courseId,
        entityType,
        entityId,
        operation,
        changedFields,
        payload
      }) => ({
        mutationId,
        sequence,
        courseId,
        entityType,
        entityId,
        operation,
        changedFields,
        payload
      }))
    });
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

  downloadCourseRevision(courseId, revisionHash) {
    if (typeof this.remote.downloadCourseRevision !== "function") return null;
    return this.remote.downloadCourseRevision(courseId, revisionHash);
  }
}

export class RelationalSyncEngine {
  #activeSynchronization = null;
  #operationProgress = null;
  #deferredCatalogUpdates = [];

  constructor({
    store,
    transport,
    deviceId = null,
    pageSize = 100,
    clock = () => new Date(),
    onProgress = null
  } = {}) {
    if (!store || typeof store.listPendingOutbox !== "function" || typeof store.applyRemotePage !== "function") {
      throw new TypeError("RelationalSyncEngine exige um IndexedDbRelationalStore.");
    }
    if (!transport || typeof transport.applySyncBatch !== "function" ||
        typeof transport.pullSyncChanges !== "function") {
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
    this.onProgress = typeof onProgress === "function" ? onProgress : null;
  }

  reportProgress(progress) {
    this.onProgress?.(progress);
    if (this.#operationProgress && this.#operationProgress !== this.onProgress) {
      this.#operationProgress(progress);
    }
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
    if (!entries.length) return;
    const now = timestamp(this.clock);
    await this.store.transaction(["outbox"], "readwrite", async (transaction) => {
      for (const entry of entries) {
        const current = await transaction.get("outbox", entry.mutationId);
        if (!current || current.status !== "pending") continue;
        await transaction.put("outbox", {
          ...current,
          attemptCount: Number(current.attemptCount || 0) + 1,
          lastError: errorMessage(error),
          updatedAt: now
        });
      }
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
        if (!pending || pending.status !== "pending") continue;
        await transaction.put("outbox", {
          ...pending,
          status: "rejected",
          attemptCount: Number(pending.attemptCount || 0) + 1,
          rejectionCode: String(rejection.code || ""),
          rejectionReason: String(rejection.reason || "deterministic_failure"),
          rejectedAt: now,
          lastError: String(rejection.message || rejection.reason || "Mutação rejeitada pelo servidor"),
          updatedAt: now
        });
        recorded.push(mutationId);
      }
      return recorded;
    });
  }

  listRejectedMutations(options = {}) {
    return this.store.listRejectedOutbox(options);
  }

  listPendingMutations(options = {}) {
    return this.store.listPendingOutbox(options);
  }

  async confirmSelectedCourseRemoval(courseId) {
    await this.store.removeOfficialCourseReplica(courseId, {
      removePersonalState: true,
      removeSelection: true
    });
  }

  async discardRejectedMutation(mutationId) {
    const discarded = await this.store.discardRejectedMutation(mutationId);
    if (discarded && this.deviceId) {
      await this.store.putSyncState(`sync.bootstrap.required:${this.deviceId}`, true);
    }
    return discarded;
  }

  async push() {
    let acceptedCount = 0;
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
            rejected: rejectedCount,
            bootstrapRequired: true,
            failure,
            message: errorMessage(error)
          };
        }
        const rejected = await this.recordPushRejections([{
          mutationId: pending[0].mutationId,
          code: failure.code,
          reason: failure.reason,
          message: errorMessage(error)
        }]);
        rejectedCount += rejected.length;
        continue;
      }

      const result = normalizePushResponse(rawResponse, pending);
      if (result.authRequired) {
        return {
          accepted: acceptedCount,
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
      const sent = new Map(pending.map((entry) => [entry.mutationId, entry]));
      const accepted = result.accepted.filter((id) => sent.has(id));
      const rejected = result.rejected.filter((entry) => sent.has(mutationIdOf(entry)));
      const retryable = result.retryable
        .map((entry) => sent.get(mutationIdOf(entry)))
        .filter(Boolean);
      await this.store.acknowledgeOutbox(accepted);
      const recorded = await this.recordPushRejections(rejected);
      if (retryable.length) {
        const error = new Error("O servidor pediu nova tentativa para parte da outbox.");
        error.retryable = true;
        await this.markPushFailures(retryable, error);
        throw error;
      }
      acceptedCount += accepted.length;
      rejectedCount += recorded.length;
      if (accepted.length + recorded.length === 0) {
        const error = new Error("O servidor não confirmou o lote idempotente.");
        error.retryable = true;
        await this.markPushFailures(pending, error);
        throw error;
      }
    }
    return {
      accepted: acceptedCount,
      rejected: rejectedCount
    };
  }

  async pull() {
    let cursor = await this.currentCursor();
    const initialCursor = cursor;
    let appliedCount = 0;
    let skippedCount = 0;
    let pageCount = 0;
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
      if (response.nextCursor < cursor) throw new Error("O servidor retornou um cursor regressivo.");
      cursor = response.nextCursor;
      const result = await this.store.applyRemotePage({
        changes: response.changes,
        cursor,
        deviceId: this.deviceId,
        syncStateId: this.cursorStateId(),
        receivedAt: timestamp(this.clock)
      });
      appliedCount += result.applied.length;
      skippedCount += result.skipped.length;
      pageCount += 1;
      if (!response.hasMore) break;
      if (!response.changes.length && response.nextCursor === previousCursor) {
        throw new Error("A paginação remota não avançou o cursor.");
      }
    }
    return {
      applied: appliedCount,
      skipped: skippedCount,
      pages: pageCount,
      cursor,
      previousCursor: initialCursor
    };
  }

  async bootstrapReplicaIfNeeded({ force = false } = {}) {
    if (typeof this.transport.bootstrapReplica !== "function") return { status: "unavailable" };
    const required = await this.store.getSyncState(`sync.bootstrap.required:${this.deviceId}`);
    const completed = await this.store.getSyncState(`sync.bootstrap:${this.deviceId}`);
    if (!force && !required && completed) {
      return { status: "already_bootstrapped", cursor: await this.currentCursor() };
    }
    const response = normalizeBootstrapResponse(
      await this.transport.bootstrapReplica({ deviceId: this.deviceId })
    );
    return this.store.applyReplicaBootstrap({
      snapshot: response.snapshot,
      selectedCourses: response.selectedCourses,
      highWaterSequence: response.highWaterSequence,
      deviceId: this.deviceId,
      syncStateId: this.cursorStateId(),
      receivedAt: timestamp(this.clock)
    });
  }

  async selectedCourseManifest() {
    const rows = await this.store.getAll("courseSelections");
    return rows
      .filter((row) => row.deletedAt == null)
      .map(normalizeManifestEntry)
      .filter(Boolean)
      .sort((left, right) => left.courseId.localeCompare(right.courseId));
  }

  async reconcileSelectedCourseReplicas(manifest = null, expectedCourseIds = []) {
    const selected = Array.isArray(manifest) ? manifest : await this.selectedCourseManifest();
    const selectedByCourse = new Map(selected.map((entry) => [entry.courseId, entry]));
    expectedCourseIds.map(String).filter(Boolean).forEach((courseId) => {
      if (!selectedByCourse.has(courseId)) {
        selectedByCourse.set(courseId, { courseId, publicationSeq: 0, contentHash: "" });
      }
    });
    const unique = [...selectedByCourse.values()];
    if (unique.length && typeof this.transport.downloadCourseRevision !== "function") {
      throw new Error("O transporte não permite baixar revisões selecionadas.");
    }
    this.#deferredCatalogUpdates = [];
    await this.store.pruneOfficialCourseReplicas(unique.map((entry) => entry.courseId));
    let updated = 0;
    for (const [index, entry] of unique.entries()) {
      const [course, localState] = await Promise.all([
        this.store.get("courses", entry.courseId),
        this.store.getOfficialCourseReplicaState(entry.courseId)
      ]);
      const localPublicationSeq = Number(localState?.publicationSeq || 0);
      const samePublication = localPublicationSeq === entry.publicationSeq;
      const hasRemoteHash = Boolean(entry.contentHash);
      const sameHash = hasRemoteHash && String(localState?.contentHash || "") === entry.contentHash;
      if (course && (sameHash || (!hasRemoteHash && samePublication))) continue;

      const startPercent = 70 + Math.round((index / Math.max(unique.length, 1)) * 24);
      this.reportProgress({
        percent: startPercent,
        message: unique.length > 1
          ? `Baixando curso ${index + 1} de ${unique.length}…`
          : "Baixando o curso…"
      });
      let rawGraph;
      try {
        if (!/^[a-f0-9]{64}$/u.test(entry.contentHash)) {
          throw new Error("O manifesto não informa uma revisão imutável válida.");
        }
        const revisionDocument = await this.transport.downloadCourseRevision(
          entry.courseId,
          entry.contentHash
        );
        const validation = validateProjectDocument(revisionDocument);
        if (!validation.ok || revisionDocument.courses?.length !== 1) {
          throw new Error("A revisão baixada viola o contrato AraLearn v3.");
        }
        const downloadedHash = await canonicalRevisionHash(revisionDocument);
        if (downloadedHash !== entry.contentHash) {
          throw new Error("O hash da revisão baixada não corresponde ao manifesto.");
        }
        rawGraph = {
          graph: await revisionDocumentToRows(revisionDocument, entry.courseId),
          publicationSeq: entry.publicationSeq,
          contentHash: downloadedHash
        };
      } catch (error) {
        throw staleCourseSelectionError(error, entry.courseId);
      }
      const response = normalizeGraphResponse(rawGraph, entry.courseId);
      this.reportProgress({
        percent: 70 + Math.round(((index + 0.75) / Math.max(unique.length, 1)) * 24),
        message: unique.length > 1
          ? `Validando curso ${index + 1} de ${unique.length}…`
          : "Validando o curso…"
      });
      try {
        await this.store.replaceOfficialCourseReplica(entry.courseId, response.graph, {
          publicationSeq: response.publicationSeq || entry.publicationSeq,
          contentHash: response.contentHash || entry.contentHash,
          receivedAt: timestamp(this.clock)
        });
      } catch (error) {
        if (error?.catalogReplicaReconciliationRequired !== true) throw error;
        this.#deferredCatalogUpdates.push({
          courseId: entry.courseId,
          mutationIds: array(error.mutationIds).map(String)
        });
        continue;
      }
      updated += 1;
    }
    return updated;
  }

  authRequiredResult({ pushed = null, bootstrap = null, pulled = null } = {}) {
    return {
      pushed,
      bootstrap,
      pulled,
      updatedCourses: 0,
      deviceId: this.deviceId,
      authRequired: true
    };
  }

  synchronize({ expectedCourseIds = [], onProgress = null } = {}) {
    if (!Array.isArray(expectedCourseIds)) {
      throw new TypeError("expectedCourseIds deve ser uma lista.");
    }
    if (this.#activeSynchronization) return this.#activeSynchronization;
    this.#operationProgress = typeof onProgress === "function" ? onProgress : null;
    this.reportProgress({ percent: 12, message: "Preparando a sincronização…" });
    this.#activeSynchronization = this.initialize().then(async () => {
      this.reportProgress({ percent: 20, message: "Enviando alterações pendentes…" });
      let pushed;
      try {
        pushed = await this.push();
      } catch (error) {
        const failure = classifySyncFailure(error);
        if (failure.kind !== SYNC_FAILURE_KIND.RETRYABLE) throw error;
        pushed = {
          accepted: 0,
          rejected: 0,
          retryable: true,
          failure,
          message: errorMessage(error)
        };
      }
      if (pushed.authRequired) return this.authRequiredResult({ pushed });

      this.reportProgress({ percent: 36, message: "Preparando este dispositivo…" });
      let bootstrap;
      try {
        bootstrap = await this.bootstrapReplicaIfNeeded({ force: pushed.bootstrapRequired === true });
      } catch (error) {
        const failure = classifySyncFailure(error);
        if (failure.kind === SYNC_FAILURE_KIND.AUTH_REQUIRED) {
          return this.authRequiredResult({
            pushed,
            bootstrap: { status: SYNC_FAILURE_KIND.AUTH_REQUIRED, failure, message: errorMessage(error) }
          });
        }
        if (failure.kind !== SYNC_FAILURE_KIND.RETRYABLE) throw error;
        return {
          pushed,
          bootstrap: { status: "retryable_failure", failure, message: errorMessage(error) },
          pulled: null,
          updatedCourses: 0,
          deviceId: this.deviceId,
          retryable: true
        };
      }
      if (bootstrap.status === "local_changes_pending") {
        return {
          pushed,
          bootstrap,
          pulled: null,
          updatedCourses: 0,
          deviceId: this.deviceId
        };
      }

      this.reportProgress({ percent: 52, message: "Buscando alterações…" });
      let pulled;
      try {
        pulled = await this.pull();
      } catch (error) {
        let currentError = error;
        let failure = classifySyncFailure(error);
        if (failure.kind === SYNC_FAILURE_KIND.BOOTSTRAP_REQUIRED) {
          try {
            bootstrap = await this.bootstrapReplicaIfNeeded({ force: true });
            if (bootstrap.status === "local_changes_pending") {
              return {
                pushed,
                bootstrap,
                pulled: null,
                updatedCourses: 0,
                deviceId: this.deviceId
              };
            }
            pulled = await this.pull();
          } catch (retryError) {
            currentError = retryError;
            failure = classifySyncFailure(retryError);
          }
        }
        if (!pulled && failure.kind === SYNC_FAILURE_KIND.AUTH_REQUIRED) {
          return this.authRequiredResult({ pushed, bootstrap, pulled: {
            status: SYNC_FAILURE_KIND.AUTH_REQUIRED,
            failure,
            message: errorMessage(currentError)
          } });
        }
        if (!pulled && failure.kind === SYNC_FAILURE_KIND.RETRYABLE) {
          return {
            pushed,
            bootstrap,
            pulled: { status: "retryable_failure", failure, message: errorMessage(currentError) },
            updatedCourses: 0,
            deviceId: this.deviceId,
            retryable: true
          };
        }
        if (!pulled) throw currentError;
      }

      this.reportProgress({ percent: 68, message: "Atualizando cursos…" });
      let updatedCourses;
      try {
        updatedCourses = await this.reconcileSelectedCourseReplicas(null, expectedCourseIds);
      } catch (error) {
        let currentError = error;
        if (error?.courseSelectionStale === true) {
          try {
            pulled = await this.pull();
            updatedCourses = await this.reconcileSelectedCourseReplicas();
          } catch (refreshError) {
            currentError = refreshError;
          }
        }
        if (updatedCourses !== undefined) {
          this.reportProgress({ percent: 100, message: "Sincronização concluída." });
          return {
            pushed,
            bootstrap,
            pulled,
            updatedCourses,
            deviceId: this.deviceId,
            catalogUpdatesDeferred: structuredClone(this.#deferredCatalogUpdates)
          };
        }
        const failure = classifySyncFailure(currentError);
        if (failure.kind === SYNC_FAILURE_KIND.AUTH_REQUIRED) {
          return this.authRequiredResult({ pushed, bootstrap, pulled });
        }
        if (failure.kind !== SYNC_FAILURE_KIND.RETRYABLE) throw currentError;
        return {
          pushed,
          bootstrap,
          pulled,
          updatedCourses: 0,
          deviceId: this.deviceId,
          retryable: true,
          courseDownloadFailure: { failure, message: errorMessage(currentError) }
        };
      }
      this.reportProgress({ percent: 100, message: "Sincronização concluída." });
      return {
        pushed,
        bootstrap,
        pulled,
        updatedCourses,
        deviceId: this.deviceId,
        catalogUpdatesDeferred: structuredClone(this.#deferredCatalogUpdates)
      };
    }).finally(() => {
      this.#activeSynchronization = null;
      this.#operationProgress = null;
    });
    return this.#activeSynchronization;
  }
}
