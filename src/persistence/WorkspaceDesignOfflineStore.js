import {
  normalizeDesignParameterAssignment
} from "../authoring/instructionalDesignValidation.js";

const CACHE_CONTRACT = "aralearn.workspace-design-cache.v1";
const CACHE_INDEX_CONTRACT = "aralearn.workspace-design-cache-index.v1";
const QUEUE_CONTRACT = "aralearn.workspace-design-queue.v1";
const CACHE_PREFIX = "learning.workspace.design.v1";
const CACHE_INDEX_PREFIX = "learning.workspace.design.index.v1";
const QUEUE_PREFIX = "learning.workspace.design.queue.v1";
const MAX_CACHE_BYTES = 2 * 1024 * 1024;
const MAX_WORKSPACE_CACHE_BYTES = 32 * 1024 * 1024;
const MAX_QUEUE_BYTES = 512 * 1024;
const MAX_QUEUE_OPERATIONS = 100;
const MAX_INDEX_ENTRIES = 10_000;
const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 100;
const LOCK_CONTRACT = "aralearn.workspace-design-lock.v1";
const LOCK_LEASE_MS = 30_000;
const LOCK_RENEW_MS = 5_000;
const LOCK_RETRY_MS = 20;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const SCOPE_KINDS = new Set(["workspace", "course", "module", "lesson", "microsequence"]);
const PRIVATE_REASONING_KEYS = new Set([
  "chainofthought",
  "chainofthoughts",
  "internalmonologue",
  "reasoning",
  "reasoningcontent",
  "reasoningtrace",
  "privatereasoning",
  "hiddenreasoning",
  "cot",
  "prompt",
  "prompts",
  "rawprompt",
  "systemprompt",
  "developerprompt",
  "userprompt",
  "rawrequest",
  "rawresponse",
  "completion",
  "conversation",
  "messages",
  "chatmessages",
  "conversationmessages"
]);
const fallbackLocks = new Map();

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function isoNow(clock) {
  return new Date(clock()).toISOString();
}

function byteLength(value) {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}

function assertIdentifier(value, label, { uuid = false } = {}) {
  const source = text(value);
  const normalized = uuid ? source.toLowerCase() : source;
  if (!normalized || normalized.length > 256 || (uuid && !UUID_PATTERN.test(normalized))) {
    throw new TypeError(`${label} inválido.`);
  }
  return normalized;
}

function assertRevision(value, label = "Revisão") {
  const normalized = Number(value);
  if (!Number.isSafeInteger(normalized) || normalized < 1) {
    throw new TypeError(`${label} inválida.`);
  }
  return normalized;
}

function assertSafePayload(value, path = "$", seen = new Set()) {
  if (value === undefined || typeof value === "function" || typeof value === "bigint"
      || typeof value === "symbol") {
    throw new TypeError(`Valor não serializável em ${path}.`);
  }
  if (typeof value === "number" && !Number.isFinite(value)) {
    throw new TypeError(`Número não finito em ${path}.`);
  }
  if (value === null || typeof value !== "object") return;
  if (seen.has(value)) throw new TypeError(`Estrutura cíclica não permitida em ${path}.`);
  seen.add(value);
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertSafePayload(entry, `${path}[${index}]`, seen));
  } else {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new TypeError(`Somente objetos JSON simples podem ser persistidos em ${path}.`);
    }
    Object.entries(value).forEach(([key, entry]) => {
      const normalizedKey = key.toLowerCase().replace(/[^a-z0-9]/gu, "");
      if (PRIVATE_REASONING_KEYS.has(normalizedKey)) {
        throw new TypeError(`Raciocínio privado não pode ser persistido em ${path}.${key}.`);
      }
      assertSafePayload(entry, `${path}.${key}`, seen);
    });
  }
  seen.delete(value);
}

function normalizeScope(scope, { microsequenceRef = "" } = {}) {
  if (!scope || typeof scope !== "object" || Array.isArray(scope)) {
    throw new TypeError("Escopo de desenho inválido.");
  }
  const kind = text(scope.kind);
  const ref = assertIdentifier(scope.ref, "Referência de escopo");
  if (!SCOPE_KINDS.has(kind)) throw new TypeError("Tipo de escopo de desenho inválido.");
  if (microsequenceRef && (kind !== "microsequence" || ref !== microsequenceRef)) {
    throw new TypeError("A fatia offline deve representar exatamente uma microssequência.");
  }
  return { kind, ref };
}

function normalizeScopePath(scopePath, workspaceId, microsequenceRef) {
  if (!Array.isArray(scopePath) || scopePath.length < 2 || scopePath.length > 5) {
    throw new TypeError("Caminho de resolução offline inválido.");
  }
  const normalized = scopePath.map((scope) => normalizeScope(scope));
  const expectedKinds = ["workspace", "course", "module", "lesson", "microsequence"]
    .slice(0, normalized.length);
  if (normalized.some((scope, index) => scope.kind !== expectedKinds[index]) ||
      normalized[0]?.ref !== workspaceId ||
      normalized.at(-1)?.kind !== "microsequence" ||
      normalized.at(-1)?.ref !== microsequenceRef) {
    throw new TypeError("O caminho deve seguir workspace até a microssequência sem incluir Parte.");
  }
  return normalized;
}

function cacheKey(userId, workspaceId, microsequenceRef) {
  return `${CACHE_PREFIX}:${userId}:${workspaceId}:${microsequenceRef}`;
}

function cacheIndexKey(userId, workspaceId) {
  return `${CACHE_INDEX_PREFIX}:${userId}:${workspaceId}`;
}

function queueKey(userId, workspaceId) {
  return `${QUEUE_PREFIX}:${userId}:${workspaceId}`;
}

function lockKey(userId, workspaceId) {
  return `${LOCK_CONTRACT}:${userId}:${workspaceId}`;
}

function syncStateRow(id, value, updatedAt) {
  return { id, key: id, value: structuredClone(value), updatedAt };
}

function rowValue(row) {
  return row && Object.prototype.hasOwnProperty.call(row, "value")
    ? structuredClone(row.value)
    : null;
}

function normalizeVersionedRef(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${label} inválida.`);
  }
  return {
    id: assertIdentifier(value.id, `${label} id`),
    version: assertIdentifier(value.version, `${label} versão`)
  };
}

function offlineError(message, code) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function assertLeaseActive(lease) {
  if (!lease?.signal?.aborted) return;
  throw lease.signal.reason || offlineError(
    "A trava de sincronização offline expirou.",
    "workspace_design_lock_lost"
  );
}

function normalizeQueue(value, { userId, workspaceId }) {
  if (value === null || value === undefined) {
    return {
      contract: QUEUE_CONTRACT,
      userId,
      workspaceId,
      operations: [],
      updatedAt: ""
    };
  }
  if (value?.contract !== QUEUE_CONTRACT || value.userId !== userId ||
      value.workspaceId !== workspaceId || !Array.isArray(value.operations) ||
      value.operations.length > MAX_QUEUE_OPERATIONS) {
    throw offlineError("A fila offline de desenho está corrompida.", "invalid_design_queue");
  }
  assertSafePayload(value);
  return structuredClone(value);
}

function normalizeIndex(value, { userId, workspaceId }) {
  if (value === null || value === undefined) {
    return {
      contract: CACHE_INDEX_CONTRACT,
      userId,
      workspaceId,
      entries: [],
      updatedAt: ""
    };
  }
  if (value?.contract !== CACHE_INDEX_CONTRACT || value.userId !== userId ||
      value.workspaceId !== workspaceId || !Array.isArray(value.entries) ||
      value.entries.length > MAX_INDEX_ENTRIES) {
    throw offlineError("O índice offline de desenho está corrompido.", "invalid_design_cache_index");
  }
  return structuredClone(value);
}

function normalizeRemoteSlice(value, { userId, workspaceId, microsequenceRef, clock }) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("Fatia remota de desenho inválida.");
  }
  assertSafePayload(value);
  const revision = assertRevision(value.revision);
  const scope = normalizeScope(value.scope || {
    kind: "microsequence",
    ref: microsequenceRef
  }, { microsequenceRef });
  const scopePath = normalizeScopePath(
    value.scopePath || value.resolutionPath,
    workspaceId,
    microsequenceRef
  );
  const cachedAt = isoNow(clock);
  const normalized = {
    contract: CACHE_CONTRACT,
    source: "remote_synced",
    userId,
    workspaceId,
    microsequenceRef,
    revision,
    scope,
    scopePath,
    cachedAt,
    state: structuredClone(value.state ?? value.designState ?? {})
  };
  if (!normalized.state || typeof normalized.state !== "object" || Array.isArray(normalized.state)) {
    throw new TypeError("Estado remoto de desenho inválido.");
  }
  if (byteLength(normalized) > MAX_CACHE_BYTES) {
    throw offlineError(
      "A fatia de desenho excede o limite local; solicite uma leitura mais estreita.",
      "design_cache_slice_too_large"
    );
  }
  return normalized;
}

function normalizeOperation(value, { userId, workspaceId, microsequenceRef, clock }) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("Override offline inválido.");
  }
  if (value.observedResearchLock === true) {
    throw offlineError(
      "O parâmetro está bloqueado pela condição de pesquisa e não pode ser alterado offline.",
      "research_lock_conflict"
    );
  }
  if (!new Set(["author", "manage"]).has(value.observedCapability)) {
    throw offlineError(
      "A última autorização conhecida não permite alterar este parâmetro.",
      "design_override_forbidden"
    );
  }
  const action = text(value.action);
  if (!new Set(["set_manual_override", "restore_auto"]).has(action)) {
    throw new TypeError("Somente override manual ou restauração de Auto podem ser enfileirados.");
  }
  const requestId = assertIdentifier(value.requestId, "Request id", { uuid: true });
  const definitionRef = normalizeVersionedRef(value.definitionRef, "Referência do parâmetro");
  const scope = normalizeScope(value.scope, { microsequenceRef });
  const assignment = action === "set_manual_override"
    ? normalizeDesignParameterAssignment({
        contract: "DesignParameterAssignment@1",
        modelVersion: "1.0.0",
        id: requestId,
        version: "1.0.0",
        definitionRef,
        scope,
        mode: "manual_override",
        value: structuredClone(value.value),
        authority: {
          kind: "author",
          actorRef: `offline:${userId}`,
          locked: false
        },
        rationale: "Override manual pendente de autorização remota.",
        provenanceRefs: [`offline-request:${requestId}`]
      })
    : null;
  const normalized = {
    requestId,
    action,
    userId,
    workspaceId,
    microsequenceRef,
    definitionRef,
    scope,
    expectedRevision: assertRevision(value.expectedRevision),
    assignment: assignment ? {
      mode: assignment.mode,
      value: structuredClone(assignment.value)
    } : null,
    requestFingerprint: stableValue({
      action,
      definitionRef,
      scope,
      assignment: assignment ? { mode: assignment.mode, value: assignment.value } : null
    }),
    status: "pending",
    remoteAuthorizationRequired: true,
    authoritative: false,
    createdAt: isoNow(clock),
    attemptedAt: "",
    errorCode: "",
    errorMessage: ""
  };
  if (action === "set_manual_override" && value.value === undefined) {
    throw new TypeError("O override manual exige um valor explícito.");
  }
  assertSafePayload(normalized);
  return normalized;
}

function randomOwnerId() {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  if (typeof globalThis.crypto?.getRandomValues === "function") {
    const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const value = [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
    return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}`
      + `-${value.slice(16, 20)}-${value.slice(20)}`;
  }
  throw new Error("Web Crypto é necessário para coordenar a autoria offline.");
}

function stableValue(value) {
  if (Array.isArray(value)) return `[${value.map(stableValue).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => (
      `${JSON.stringify(key)}:${stableValue(value[key])}`
    )).join(",")}}`;
  }
  return `${typeof value}:${JSON.stringify(value)}`;
}

function sameReference(left, right) {
  return left?.id === right?.id && left?.version === right?.version;
}

function sameScope(left, right) {
  return left?.kind === right?.kind && left?.ref === right?.ref;
}

function remoteAssignments(context) {
  const direct = context?.assignments || context?.currentAssignments;
  if (Array.isArray(direct)) return direct;
  const stateAssignments = context?.slice?.state?.assignments
    || context?.slice?.state?.currentAssignments;
  return Array.isArray(stateAssignments) ? stateAssignments : null;
}

function confirmsOperation(operation, context, submitResult) {
  const assignments = remoteAssignments(context);
  if (!assignments) return false;
  const slotAssignments = assignments.filter((assignment) => (
    sameReference(assignment?.definitionRef, operation.definitionRef)
    && sameScope(assignment?.scope, operation.scope)
  ));
  if (operation.action === "restore_auto") {
    return !slotAssignments.some((assignment) => assignment?.mode === "manual_override");
  }
  return slotAssignments.some((assignment) => (
    assignment?.mode === "manual_override"
    && stableValue(assignment?.value) === stableValue(operation.assignment.value)
    && (!submitResult?.assignmentRef
      || sameReference(assignment, submitResult.assignmentRef)
      || sameReference(assignment?.assignmentRef, submitResult.assignmentRef))
  ));
}

export class WorkspaceDesignOfflineStore {
  #store;
  #userId;
  #clock;
  #browserLocks;
  #ownerId;

  constructor(store, {
    userId,
    clock = Date.now,
    browserLocks = globalThis.navigator?.locks,
    ownerId = ""
  } = {}) {
    if (!store || typeof store.getSyncState !== "function" ||
        typeof store.putSyncState !== "function") {
      throw new TypeError("O cache de desenho exige o armazenamento relacional da sessão.");
    }
    this.#userId = assertIdentifier(userId, "Usuário", { uuid: true });
    if ("userId" in store && (!store.userId ||
        String(store.userId).toLowerCase() !== this.#userId)) {
      throw new Error("O cache de desenho pertence a outra conta.");
    }
    if (typeof clock !== "function") throw new TypeError("Relógio offline inválido.");
    this.#store = store;
    this.#clock = clock;
    this.#browserLocks = browserLocks;
    this.#ownerId = text(ownerId) || randomOwnerId();
  }

  get userId() {
    return this.#userId;
  }

  async #atomicSyncState(keys, callback) {
    if (typeof this.#store.transaction === "function") {
      return this.#store.transaction(["syncState"], "readwrite", async (transaction) => {
        const values = new Map();
        for (const key of keys) values.set(key, rowValue(await transaction.get("syncState", key)));
        const writes = new Map();
        const result = await callback(values, writes);
        const updatedAt = isoNow(this.#clock);
        for (const [key, value] of writes) {
          if (value === null || value === undefined) await transaction.delete("syncState", key);
          else await transaction.put("syncState", syncStateRow(key, value, updatedAt));
        }
        return result;
      });
    }
    const lockId = `workspace-design-syncstate:${this.#userId}`;
    const previous = fallbackLocks.get(lockId) || Promise.resolve();
    const pending = previous.catch(() => undefined).then(async () => {
      const values = new Map();
      for (const key of keys) values.set(key, await this.#store.getSyncState(key));
      const writes = new Map();
      const result = await callback(values, writes);
      for (const [key, value] of writes) await this.#store.putSyncState(key, value);
      return result;
    });
    fallbackLocks.set(lockId, pending);
    return pending.finally(() => {
      if (fallbackLocks.get(lockId) === pending) fallbackLocks.delete(lockId);
    });
  }

  async cacheRemoteSlice({ workspaceId, microsequenceRef, slice }) {
    const workspace = assertIdentifier(workspaceId, "Workspace", { uuid: true });
    const microsequence = assertIdentifier(microsequenceRef, "Microssequência");
    const normalized = normalizeRemoteSlice(slice, {
      userId: this.#userId,
      workspaceId: workspace,
      microsequenceRef: microsequence,
      clock: this.#clock
    });
    const sliceKey = cacheKey(this.#userId, workspace, microsequence);
    const indexKey = cacheIndexKey(this.#userId, workspace);
    return this.#atomicSyncState([sliceKey, indexKey], async (values, writes) => {
      const previous = values.get(sliceKey);
      if (previous?.contract === CACHE_CONTRACT && Number(previous.revision) > normalized.revision) {
        return false;
      }
      const index = normalizeIndex(values.get(indexKey), {
        userId: this.#userId,
        workspaceId: workspace
      });
      const entries = index.entries.filter((entry) => entry.microsequenceRef !== microsequence);
      const byteSize = byteLength(normalized);
      entries.push({
        microsequenceRef: microsequence,
        revision: normalized.revision,
        cachedAt: normalized.cachedAt,
        byteSize
      });
      let totalBytes = entries.reduce((total, entry) => total + Number(entry.byteSize || 0), 0);
      const oldest = [...entries]
        .filter((entry) => entry.microsequenceRef !== microsequence)
        .sort((left, right) => left.cachedAt.localeCompare(right.cachedAt));
      const evicted = new Set();
      while (totalBytes > MAX_WORKSPACE_CACHE_BYTES && oldest.length) {
        const entry = oldest.shift();
        totalBytes -= Number(entry.byteSize || 0);
        evicted.add(entry.microsequenceRef);
        writes.set(cacheKey(this.#userId, workspace, entry.microsequenceRef), null);
      }
      const retainedEntries = entries.filter((entry) => !evicted.has(entry.microsequenceRef));
      retainedEntries.sort((left, right) => left.microsequenceRef.localeCompare(right.microsequenceRef));
      if (retainedEntries.length > MAX_INDEX_ENTRIES) {
        throw offlineError("O índice offline do workspace atingiu o limite seguro.", "design_cache_full");
      }
      writes.set(sliceKey, normalized);
      writes.set(indexKey, {
        ...index,
        entries: retainedEntries,
        totalBytes,
        updatedAt: normalized.cachedAt
      });
      return true;
    });
  }

  async readRemoteSlice({ workspaceId, microsequenceRef }) {
    const workspace = assertIdentifier(workspaceId, "Workspace", { uuid: true });
    const microsequence = assertIdentifier(microsequenceRef, "Microssequência");
    const value = await this.#store.getSyncState(cacheKey(this.#userId, workspace, microsequence));
    if (value === null || value === undefined) return null;
    if (value?.contract !== CACHE_CONTRACT || value.source !== "remote_synced" ||
        value.userId !== this.#userId || value.workspaceId !== workspace ||
        value.microsequenceRef !== microsequence) {
      throw offlineError("A fatia offline de desenho está corrompida.", "invalid_design_cache");
    }
    assertSafePayload(value);
    return structuredClone(value);
  }

  async listRemoteSlices({ workspaceId, cursor = 0, limit = DEFAULT_PAGE_SIZE } = {}) {
    const workspace = assertIdentifier(workspaceId, "Workspace", { uuid: true });
    const normalizedCursor = Number(cursor);
    const normalizedLimit = Math.min(Number(limit), MAX_PAGE_SIZE);
    if (!Number.isSafeInteger(normalizedCursor) || normalizedCursor < 0 ||
        !Number.isSafeInteger(normalizedLimit) || normalizedLimit < 1) {
      throw new TypeError("Paginação do cache de desenho inválida.");
    }
    const index = normalizeIndex(
      await this.#store.getSyncState(cacheIndexKey(this.#userId, workspace)),
      { userId: this.#userId, workspaceId: workspace }
    );
    const page = index.entries.slice(normalizedCursor, normalizedCursor + normalizedLimit);
    const items = (await Promise.all(page.map((entry) => this.readRemoteSlice({
      workspaceId: workspace,
      microsequenceRef: entry.microsequenceRef
    })))).filter(Boolean);
    const nextCursor = normalizedCursor + page.length < index.entries.length
      ? normalizedCursor + page.length
      : null;
    return { items, nextCursor, total: index.entries.length };
  }

  async queueManualOverride(value) {
    const workspace = assertIdentifier(value?.workspaceId, "Workspace", { uuid: true });
    const microsequence = assertIdentifier(value?.microsequenceRef, "Microssequência");
    const operation = normalizeOperation(value, {
      userId: this.#userId,
      workspaceId: workspace,
      microsequenceRef: microsequence,
      clock: this.#clock
    });
    const key = queueKey(this.#userId, workspace);
    return this.#atomicSyncState([key], async (values, writes) => {
      const queue = normalizeQueue(values.get(key), {
        userId: this.#userId,
        workspaceId: workspace
      });
      const existing = queue.operations.find((entry) => entry.requestId === operation.requestId);
      if (existing) {
        if (existing.requestFingerprint !== operation.requestFingerprint) {
          throw offlineError(
            "O request id já identifica outra alteração de desenho.",
            "design_request_id_reused"
          );
        }
        return structuredClone(existing);
      }
      const operations = [...queue.operations, operation];
      if (operations.length > MAX_QUEUE_OPERATIONS) {
        throw offlineError("A fila offline de desenho atingiu o limite seguro.", "design_queue_full");
      }
      const next = {
        ...queue,
        operations,
        updatedAt: isoNow(this.#clock)
      };
      if (byteLength(next) > MAX_QUEUE_BYTES) {
        throw offlineError("A fila offline de desenho atingiu o limite seguro.", "design_queue_full");
      }
      writes.set(key, next);
      return structuredClone(operation);
    });
  }

  async readQueue({ workspaceId }) {
    const workspace = assertIdentifier(workspaceId, "Workspace", { uuid: true });
    return normalizeQueue(
      await this.#store.getSyncState(queueKey(this.#userId, workspace)),
      { userId: this.#userId, workspaceId: workspace }
    );
  }

  async readProjection({ workspaceId, microsequenceRef }) {
    const workspace = assertIdentifier(workspaceId, "Workspace", { uuid: true });
    const microsequence = assertIdentifier(microsequenceRef, "Microssequência");
    const [remote, queue] = await Promise.all([
      this.readRemoteSlice({ workspaceId: workspace, microsequenceRef: microsequence }),
      this.readQueue({ workspaceId: workspace })
    ]);
    return {
      remote,
      pending: queue.operations.filter((entry) => entry.microsequenceRef === microsequence),
      authoritativeSource: "remote_synced"
    };
  }

  async #updateOperation(workspaceId, requestIdValue, updater) {
    const workspace = assertIdentifier(workspaceId, "Workspace", { uuid: true });
    const requestId = assertIdentifier(requestIdValue, "Request id", { uuid: true });
    const key = queueKey(this.#userId, workspace);
    return this.#atomicSyncState([key], async (values, writes) => {
      const queue = normalizeQueue(values.get(key), {
        userId: this.#userId,
        workspaceId: workspace
      });
      const index = queue.operations.findIndex((entry) => entry.requestId === requestId);
      if (index < 0) return null;
      const nextOperation = await updater(structuredClone(queue.operations[index]));
      const operations = nextOperation === null
        ? queue.operations.filter((_, operationIndex) => operationIndex !== index)
        : queue.operations.map((entry, operationIndex) =>
            operationIndex === index ? nextOperation : entry);
      writes.set(key, operations.length ? {
        ...queue,
        operations,
        updatedAt: isoNow(this.#clock)
      } : null);
      return nextOperation === null ? null : structuredClone(nextOperation);
    });
  }

  markConflict({ workspaceId, requestId, code, message }) {
    return this.#updateOperation(workspaceId, requestId, (operation) => ({
      ...operation,
      status: "conflict",
      attemptedAt: isoNow(this.#clock),
      errorCode: text(code) || "design_override_conflict",
      errorMessage: text(message) || "A alteração precisa ser revista após a sincronização."
    }));
  }

  discardOperation({ workspaceId, requestId }) {
    return this.#updateOperation(workspaceId, requestId, () => null);
  }

  retryConflict({
    workspaceId,
    requestId,
    expectedRevision,
    observedCapability,
    observedResearchLock = false
  }) {
    if (observedResearchLock === true) {
      throw offlineError(
        "O parâmetro está bloqueado pela condição de pesquisa.",
        "research_lock_conflict"
      );
    }
    if (!new Set(["author", "manage"]).has(observedCapability)) {
      throw offlineError(
        "A autorização atual não permite repetir esta alteração.",
        "design_override_forbidden"
      );
    }
    const revision = assertRevision(expectedRevision);
    return this.#updateOperation(workspaceId, requestId, (operation) => {
      if (operation.status !== "conflict") {
        throw offlineError(
          "Somente uma alteração em conflito pode ser reenviada.",
          "design_operation_not_conflicted"
        );
      }
      return {
        ...operation,
        expectedRevision: revision,
        status: "pending",
        attemptedAt: "",
        errorCode: "",
        errorMessage: ""
      };
    });
  }

  async #confirmFromRemote({ operation, slice, submitResult }) {
    const { workspaceId, microsequenceRef, requestId } = operation;
    const revision = assertRevision(slice?.revision);
    if (revision <= operation.expectedRevision
        || !confirmsOperation(operation, { slice }, submitResult)) {
      throw offlineError(
        "O estado remoto não comprova a alteração enviada.",
        "design_confirmation_missing"
      );
    }
    if (!await this.cacheRemoteSlice({ workspaceId, microsequenceRef, slice })) {
      throw offlineError(
        "Uma revisão remota mais recente já substituiu esta confirmação.",
        "design_confirmation_stale"
      );
    }
    const workspace = assertIdentifier(workspaceId, "Workspace", { uuid: true });
    const normalizedRequestId = assertIdentifier(requestId, "Request id", { uuid: true });
    const key = queueKey(this.#userId, workspace);
    await this.#atomicSyncState([key], async (values, writes) => {
      const queue = normalizeQueue(values.get(key), {
        userId: this.#userId,
        workspaceId: workspace
      });
      const confirmed = queue.operations.find((entry) => entry.requestId === normalizedRequestId);
      if (!confirmed) return false;
      if (confirmed.status !== "pending"
          || confirmed.requestFingerprint !== operation.requestFingerprint
          || confirmed.expectedRevision !== operation.expectedRevision) {
        throw offlineError(
          "A intenção local mudou antes da confirmação remota.",
          "design_confirmation_stale"
        );
      }
      const operations = queue.operations
        .filter((entry) => entry.requestId !== normalizedRequestId)
        .map((entry) => entry.status === "pending"
          && entry.expectedRevision === confirmed.expectedRevision
          ? { ...entry, expectedRevision: revision }
          : entry);
      writes.set(key, operations.length ? {
        ...queue,
        operations,
        updatedAt: isoNow(this.#clock)
      } : null);
      return true;
    });
    return this.readProjection({ workspaceId, microsequenceRef });
  }

  async withWorkspaceSyncLock(workspaceId, callback) {
    const workspace = assertIdentifier(workspaceId, "Workspace", { uuid: true });
    if (typeof callback !== "function") throw new TypeError("Callback de sincronização inválido.");
    const name = `aralearn:${queueKey(this.#userId, workspace)}`;
    if (typeof this.#browserLocks?.request === "function") {
      const fencingToken = `${this.#ownerId}:${randomOwnerId()}`;
      return this.#browserLocks.request(name, { mode: "exclusive" }, () => callback({
        signal: null,
        fencingToken
      }));
    }
    if (typeof this.#store.transaction === "function") {
      return this.#withTransactionalLease(workspace, callback);
    }
    const previous = fallbackLocks.get(name) || Promise.resolve();
    const fencingToken = `${this.#ownerId}:${randomOwnerId()}`;
    const pending = previous.catch(() => undefined).then(() => callback({
      signal: null,
      fencingToken
    }));
    fallbackLocks.set(name, pending);
    return pending.finally(() => {
      if (fallbackLocks.get(name) === pending) fallbackLocks.delete(name);
    });
  }

  async #withTransactionalLease(workspaceId, callback) {
    const key = lockKey(this.#userId, workspaceId);
    const fencingToken = `${this.#ownerId}:${randomOwnerId()}`;
    const writeLease = async ({ acquire = false } = {}) => this.#store.transaction(
      ["syncState"],
      "readwrite",
      async (transaction) => {
        const row = await transaction.get("syncState", key);
        const lease = row?.value;
        const now = this.#clock();
        const owned = lease?.contract === LOCK_CONTRACT && lease.ownerId === fencingToken;
        const available = !lease || lease.contract !== LOCK_CONTRACT
          || !Number.isFinite(Number(lease.expiresAt))
          || Number(lease.expiresAt) <= now;
        if (!owned && (!acquire || !available)) return false;
        await transaction.put("syncState", syncStateRow(key, {
          contract: LOCK_CONTRACT,
          ownerId: fencingToken,
          expiresAt: now + LOCK_LEASE_MS
        }, isoNow(this.#clock)));
        return true;
      }
    );
    const release = () => this.#store.transaction(
      ["syncState"],
      "readwrite",
      async (transaction) => {
        const row = await transaction.get("syncState", key);
        if (row?.value?.contract === LOCK_CONTRACT && row.value.ownerId === fencingToken) {
          await transaction.delete("syncState", key);
        }
      }
    );

    while (!await writeLease({ acquire: true })) {
      await new Promise((resolve) => globalThis.setTimeout(resolve, LOCK_RETRY_MS));
    }
    let heartbeat = Promise.resolve();
    let heartbeatError = null;
    const abortController = new AbortController();
    const renew = () => {
      heartbeat = heartbeat.then(async () => {
        if (!await writeLease()) {
          throw offlineError(
            "A trava de sincronização offline expirou.",
            "workspace_design_lock_lost"
          );
        }
      }).catch((error) => {
        heartbeatError ||= error;
        abortController.abort(error);
      });
    };
    const timer = globalThis.setInterval(renew, LOCK_RENEW_MS);
    let result;
    let callbackError = null;
    try {
      result = await callback({ signal: abortController.signal, fencingToken });
    } catch (error) {
      callbackError = error;
    } finally {
      globalThis.clearInterval(timer);
      await heartbeat;
      await release().catch((error) => {
        heartbeatError ||= error;
      });
    }
    if (callbackError) throw callbackError;
    if (heartbeatError) throw heartbeatError;
    return result;
  }

  synchronize({ workspaceId, microsequenceRef, loadRemoteContext, submit }) {
    if (typeof loadRemoteContext !== "function" || typeof submit !== "function") {
      throw new TypeError("A sincronização exige leitura remota e submissão explícitas.");
    }
    return this.withWorkspaceSyncLock(workspaceId, async (lease) => {
      const workspace = assertIdentifier(workspaceId, "Workspace", { uuid: true });
      const microsequence = assertIdentifier(microsequenceRef, "Microssequência");
      const queue = await this.readQueue({ workspaceId: workspace });
      const operations = queue.operations.filter((entry) =>
        entry.microsequenceRef === microsequence && entry.status === "pending");
      const results = [];
      for (const queuedOperation of operations) {
        assertLeaseActive(lease);
        const currentQueue = await this.readQueue({ workspaceId: workspace });
        assertLeaseActive(lease);
        const operation = currentQueue.operations.find((entry) => (
          entry.requestId === queuedOperation.requestId && entry.status === "pending"
        ));
        if (!operation) continue;
        try {
          const context = await loadRemoteContext(structuredClone(operation), {
            signal: lease?.signal || null,
            fencingToken: lease?.fencingToken || ""
          });
          assertLeaseActive(lease);
          if (context?.slice) {
            await this.cacheRemoteSlice({ workspaceId: workspace, microsequenceRef: microsequence,
              slice: context.slice });
          }
          const lockedIds = new Set((context?.lockedDefinitionIds || []).map(String));
          if (context?.canOverride !== true || lockedIds.has(operation.definitionRef.id)) {
            results.push(await this.markConflict({
              workspaceId: workspace,
              requestId: operation.requestId,
              code: lockedIds.has(operation.definitionRef.id)
                ? "research_lock_conflict"
                : "design_override_forbidden",
              message: lockedIds.has(operation.definitionRef.id)
                ? "O parâmetro foi bloqueado pela condição de pesquisa."
                : "Sua autorização atual não permite esta alteração."
            }));
            continue;
          }
          if (Number(context?.revision) !== operation.expectedRevision) {
            results.push(await this.markConflict({
              workspaceId: workspace,
              requestId: operation.requestId,
              code: "workspace_revision_conflict",
              message: "O workspace mudou desde a edição offline."
            }));
            continue;
          }
          const submitResult = await submit(
            structuredClone(operation),
            structuredClone(context),
            {
              signal: lease?.signal || null,
              fencingToken: lease?.fencingToken || ""
            }
          );
          assertLeaseActive(lease);
          if (submitResult?.accepted === false) {
            const rejection = offlineError(
              "O servidor recusou a alteração de desenho.",
              "design_write_rejected"
            );
            rejection.conflict = true;
            throw rejection;
          }
          const submittedRevision = Number(submitResult?.revision);
          if (!Number.isSafeInteger(submittedRevision)
              || submittedRevision <= operation.expectedRevision) {
            throw offlineError(
              "O servidor não confirmou a revisão da alteração.",
              "design_confirmation_missing"
            );
          }
          const confirmed = await loadRemoteContext(structuredClone(operation), {
            signal: lease?.signal || null,
            fencingToken: lease?.fencingToken || ""
          });
          assertLeaseActive(lease);
          if (!confirmed?.slice || Number(confirmed.slice.revision) < submittedRevision
              || !confirmsOperation(operation, confirmed, submitResult)) {
            throw offlineError(
              "O servidor não confirmou a alteração no estado canônico.",
              "design_confirmation_missing"
            );
          }
          await this.#confirmFromRemote({
            operation,
            slice: confirmed.slice,
            submitResult
          });
          results.push({ requestId: operation.requestId, status: "confirmed" });
        } catch (error) {
          const conflict = error?.conflict === true ||
            ["research_lock_conflict", "design_override_forbidden", "workspace_revision_conflict"]
              .includes(error?.code) ||
            (Number(error?.status) >= 400 && Number(error?.status) < 500 &&
              ![408, 429].includes(Number(error?.status)));
          if (conflict) {
            results.push(await this.markConflict({
              workspaceId: workspace,
              requestId: operation.requestId,
              code: error?.code,
              message: error instanceof Error ? error.message : "A alteração entrou em conflito."
            }));
          } else {
            results.push({ requestId: operation.requestId, status: "pending", retryable: true });
          }
        }
      }
      return results;
    });
  }
}

export const WORKSPACE_DESIGN_OFFLINE_LIMITS = Object.freeze({
  maxCacheBytes: MAX_CACHE_BYTES,
  maxWorkspaceCacheBytes: MAX_WORKSPACE_CACHE_BYTES,
  maxQueueBytes: MAX_QUEUE_BYTES,
  maxQueueOperations: MAX_QUEUE_OPERATIONS,
  maxIndexEntries: MAX_INDEX_ENTRIES,
  maxPageSize: MAX_PAGE_SIZE
});
