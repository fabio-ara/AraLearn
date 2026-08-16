import test from "node:test";
import assert from "node:assert/strict";
import { IDBFactory } from "fake-indexeddb";

import { IndexedDbRelationalStore } from "../../src/persistence/IndexedDbRelationalStore.js";
import {
  WorkspaceDesignOfflineStore,
  WORKSPACE_DESIGN_OFFLINE_LIMITS
} from "../../src/persistence/WorkspaceDesignOfflineStore.js";

const USER_A = "10000000-0000-4000-8000-000000000001";
const USER_B = "20000000-0000-4000-8000-000000000002";
const WORKSPACE = "30000000-0000-4000-8000-000000000003";
const OTHER_WORKSPACE = "30000000-0000-4000-8000-000000000004";
const MICROSEQUENCE = "microsequence-001";
const REQUEST_A = "40000000-0000-4000-8000-000000000004";
const REQUEST_B = "50000000-0000-4000-8000-000000000005";

async function open(indexedDb, userId = USER_A) {
  const relational = await IndexedDbRelationalStore.open(indexedDb, { userId });
  await relational.bindReplicaToUser(userId);
  return {
    relational,
    offline: new WorkspaceDesignOfflineStore(relational, {
      userId,
      clock: () => Date.parse("2026-08-15T19:30:00.000Z"),
      browserLocks: null
    })
  };
}

function scopePath(microsequenceRef = MICROSEQUENCE, workspaceRef = WORKSPACE) {
  return [
    { kind: "workspace", ref: workspaceRef },
    { kind: "course", ref: "course-001" },
    { kind: "module", ref: "module-001" },
    { kind: "lesson", ref: "lesson-001" },
    { kind: "microsequence", ref: microsequenceRef }
  ];
}

function remoteSlice(
  revision = 7,
  state = {},
  microsequenceRef = MICROSEQUENCE,
  workspaceRef = WORKSPACE
) {
  return {
    revision,
    scope: { kind: "microsequence", ref: microsequenceRef },
    scopePath: scopePath(microsequenceRef, workspaceRef),
    state: {
      analysisStatus: "resolved",
      effectiveSnapshot: {
        id: `snapshot-${microsequenceRef}`,
        version: "1",
        resolvedValues: []
      },
      ...state
    }
  };
}

function override(overrides = {}) {
  return {
    workspaceId: WORKSPACE,
    microsequenceRef: MICROSEQUENCE,
    requestId: REQUEST_A,
    expectedRevision: 7,
    action: "set_manual_override",
    definitionRef: { id: "representation_fallback_policy", version: "1.0.0" },
    scope: { kind: "microsequence", ref: MICROSEQUENCE },
    value: { kind: "enum", value: "allow_versatile_with_limitation" },
    observedCapability: "author",
    observedResearchLock: false,
    ...overrides
  };
}

function confirmedAssignment(operation, id = `assignment-${operation.requestId}`) {
  return {
    id,
    version: "1.0.0",
    definitionRef: structuredClone(operation.definitionRef),
    scope: structuredClone(operation.scope),
    mode: "manual_override",
    value: structuredClone(operation.assignment?.value ?? operation.value)
  };
}

test("a última fatia remota continua disponível offline e isolada por usuário", async (context) => {
  const indexedDb = new IDBFactory();
  const first = await open(indexedDb, USER_A);
  const second = await open(indexedDb, USER_B);
  context.after(() => { first.relational.close(); second.relational.close(); });

  assert.equal(await first.offline.cacheRemoteSlice({
    workspaceId: WORKSPACE,
    microsequenceRef: MICROSEQUENCE,
    slice: remoteSlice()
  }), true);
  assert.equal((await first.offline.readRemoteSlice({
    workspaceId: WORKSPACE,
    microsequenceRef: MICROSEQUENCE
  })).source, "remote_synced");
  assert.equal(await second.offline.readRemoteSlice({
    workspaceId: WORKSPACE,
    microsequenceRef: MICROSEQUENCE
  }), null);

  assert.equal(await first.offline.cacheRemoteSlice({
    workspaceId: WORKSPACE,
    microsequenceRef: MICROSEQUENCE,
    slice: remoteSlice(6)
  }), false, "uma resposta atrasada não rebaixa a revisão canônica");
  assert.equal((await first.offline.readRemoteSlice({
    workspaceId: WORKSPACE,
    microsequenceRef: MICROSEQUENCE
  })).revision, 7);
});

test("override pendente fica separado e nunca altera o snapshot remoto", async (context) => {
  const { relational, offline } = await open(new IDBFactory());
  context.after(() => relational.close());
  await offline.cacheRemoteSlice({
    workspaceId: WORKSPACE,
    microsequenceRef: MICROSEQUENCE,
    slice: remoteSlice()
  });

  const queued = await offline.queueManualOverride(override());
  assert.equal(queued.status, "pending");
  assert.equal(queued.authoritative, false);
  assert.equal(queued.remoteAuthorizationRequired, true);

  const projection = await offline.readProjection({
    workspaceId: WORKSPACE,
    microsequenceRef: MICROSEQUENCE
  });
  assert.equal(projection.authoritativeSource, "remote_synced");
  assert.equal(projection.remote.revision, 7);
  assert.equal(projection.remote.state.effectiveSnapshot.resolvedValues.length, 0);
  assert.equal(projection.pending.length, 1);
  assert.deepEqual(projection.pending[0].assignment.value, {
    kind: "enum",
    value: "allow_versatile_with_limitation"
  });
});

test("request id é idempotente somente para o mesmo payload", async (context) => {
  const { relational, offline } = await open(new IDBFactory());
  context.after(() => relational.close());
  const original = override({
    definitionRef: { id: "accepted_performance_forms", version: "1.0.0" },
    value: { kind: "set", values: ["a", "b"] }
  });
  const first = await offline.queueManualOverride(original);
  const repeated = await offline.queueManualOverride(original);
  assert.equal(repeated.requestFingerprint, first.requestFingerprint);
  await assert.rejects(
    offline.queueManualOverride(override({
      definitionRef: { id: "accepted_performance_forms", version: "1.0.0" },
      value: { kind: "set", values: ["a,string:b"] }
    })),
    (error) => error.code === "design_request_id_reused"
  );
  assert.equal((await offline.readQueue({ workspaceId: WORKSPACE })).operations.length, 1);
});

test("restaurar Auto é permitido, mas locks e operações privilegiadas não entram na fila", async (context) => {
  const { relational, offline } = await open(new IDBFactory());
  context.after(() => relational.close());

  const restored = await offline.queueManualOverride(override({
    action: "restore_auto",
    value: undefined
  }));
  assert.equal(restored.assignment, null);
  await assert.rejects(
    offline.queueManualOverride(override({
      requestId: REQUEST_B,
      observedResearchLock: true
    })),
    (error) => error.code === "research_lock_conflict"
  );
  await assert.rejects(
    offline.queueManualOverride(override({
      requestId: REQUEST_B,
      observedCapability: "read"
    })),
    (error) => error.code === "design_override_forbidden"
  );
  await assert.rejects(
    offline.queueManualOverride(override({
      requestId: REQUEST_B,
      action: "create_resource_set"
    })),
    /Somente override manual/u
  );
});

test("sincronização relê revisão, capacidade e locks e preserva conflitos", async (context) => {
  const { relational, offline } = await open(new IDBFactory());
  context.after(() => relational.close());
  await offline.queueManualOverride(override());
  let submitted = false;

  const result = await offline.synchronize({
    workspaceId: WORKSPACE,
    microsequenceRef: MICROSEQUENCE,
    loadRemoteContext: async () => ({
      revision: 7,
      canOverride: true,
      lockedDefinitionIds: ["representation_fallback_policy"],
      slice: remoteSlice()
    }),
    submit: async () => { submitted = true; }
  });

  assert.equal(submitted, false);
  assert.equal(result[0].status, "conflict");
  assert.equal(result[0].errorCode, "research_lock_conflict");
  assert.equal((await offline.readQueue({ workspaceId: WORKSPACE })).operations.length, 1);
});

test("confirmação só remove a fila depois de armazenar o estado remoto novo", async (context) => {
  const { relational, offline } = await open(new IDBFactory());
  context.after(() => relational.close());
  await offline.cacheRemoteSlice({
    workspaceId: WORKSPACE,
    microsequenceRef: MICROSEQUENCE,
    slice: remoteSlice()
  });
  await offline.queueManualOverride(override());
  let reads = 0;

  const result = await offline.synchronize({
    workspaceId: WORKSPACE,
    microsequenceRef: MICROSEQUENCE,
    loadRemoteContext: async () => {
      reads += 1;
      return reads === 1
        ? { revision: 7, canOverride: true, lockedDefinitionIds: [], slice: remoteSlice() }
        : {
            revision: 8,
            canOverride: true,
            lockedDefinitionIds: [],
            slice: remoteSlice(8, {
              assignments: [confirmedAssignment(override())],
              effectiveSnapshot: {
                id: "snapshot-new",
                version: "2",
                resolvedValues: [{ definitionRef: {
                  id: "representation_fallback_policy",
                  version: "1.0.0"
                } }]
              }
            })
          };
    },
    submit: async (operation, remote) => {
      assert.equal(operation.expectedRevision, remote.revision);
      return { revision: 8 };
    }
  });

  assert.deepEqual(result, [{ requestId: REQUEST_A, status: "confirmed" }]);
  const projection = await offline.readProjection({
    workspaceId: WORKSPACE,
    microsequenceRef: MICROSEQUENCE
  });
  assert.equal(projection.remote.revision, 8);
  assert.equal(projection.remote.state.effectiveSnapshot.id, "snapshot-new");
  assert.deepEqual(projection.pending, []);
  assert.equal(offline.confirmFromRemote, undefined, "confirmação forte não é API pública");
});

test("resposta perdida é recuperada pelo mesmo request mesmo após a revisão avançar", async (context) => {
  const { relational, offline } = await open(new IDBFactory());
  context.after(() => relational.close());
  const original = override();
  await offline.queueManualOverride(original);
  const assignment = confirmedAssignment(original);
  let submitted = 0;

  const result = await offline.synchronize({
    workspaceId: WORKSPACE,
    microsequenceRef: MICROSEQUENCE,
    loadRemoteContext: async () => ({
      revision: 9,
      canOverride: true,
      lockedDefinitionIds: [],
      slice: remoteSlice(9, {
        assignments: [assignment],
        effectiveSnapshot: {
          id: "snapshot-after-lost-response",
          version: "1.0.9",
          resolvedValues: [{
            definitionRef: structuredClone(original.definitionRef),
            value: structuredClone(original.value)
          }]
        }
      })
    }),
    submit: async (operation) => {
      submitted += 1;
      assert.equal(operation.expectedRevision, 7);
      return {
        accepted: true,
        revision: 9,
        assignmentRef: { id: assignment.id, version: assignment.version }
      };
    }
  });

  assert.equal(submitted, 1, "a recuperação precisa alcançar o ledger remoto");
  assert.deepEqual(result, [{ requestId: REQUEST_A, status: "confirmed" }]);
  assert.deepEqual((await offline.readQueue({ workspaceId: WORKSPACE })).operations, []);
});

test("Auto confirmado remove conflito anterior incerto do mesmo parâmetro", async (context) => {
  const { relational, offline } = await open(new IDBFactory());
  context.after(() => relational.close());
  const manual = override();
  await offline.cacheRemoteSlice({
    workspaceId: WORKSPACE,
    microsequenceRef: MICROSEQUENCE,
    slice: remoteSlice()
  });
  await offline.queueManualOverride(manual);
  await offline.synchronize({
    workspaceId: WORKSPACE,
    microsequenceRef: MICROSEQUENCE,
    loadRemoteContext: async () => ({
      revision: 7,
      canOverride: true,
      lockedDefinitionIds: [],
      slice: remoteSlice(7, { assignments: [] })
    }),
    submit: async () => {
      throw Object.assign(new Error("Resposta remota incerta."), { status: 503 });
    }
  });
  assert.ok((await offline.readQueue({ workspaceId: WORKSPACE })).operations[0].remoteAttemptedAt);
  await offline.queueManualOverride(override({
    requestId: REQUEST_B,
    action: "restore_auto",
    value: undefined
  }));

  const result = await offline.synchronize({
    workspaceId: WORKSPACE,
    microsequenceRef: MICROSEQUENCE,
    loadRemoteContext: async () => ({
      revision: 8,
      canOverride: true,
      lockedDefinitionIds: [],
      slice: remoteSlice(8, { assignments: [] })
    }),
    submit: async (operation) => {
      if (operation.action === "set_manual_override") {
        const error = new Error("A revisão avançou enquanto a resposta era incerta.");
        error.code = "workspace_revision_conflict";
        error.conflict = true;
        throw error;
      }
      return { accepted: true, revision: 8 };
    }
  });

  assert.deepEqual(result.map(({ status }) => status), ["conflict", "confirmed"]);
  assert.deepEqual((await offline.readQueue({ workspaceId: WORKSPACE })).operations, []);
  const projection = await offline.readProjection({
    workspaceId: WORKSPACE,
    microsequenceRef: MICROSEQUENCE
  });
  assert.deepEqual(projection.pending, []);
  assert.deepEqual(projection.remote.state.assignments, []);
});

test("duas operações da mesma base avançam em sequência sem conflito artificial", async (context) => {
  const { relational, offline } = await open(new IDBFactory());
  context.after(() => relational.close());
  const secondOperation = override({
    requestId: REQUEST_B,
    definitionRef: { id: "accepted_performance_forms", version: "1.0.0" },
    value: { kind: "set", values: ["constructed_response"] }
  });
  await offline.queueManualOverride(override());
  await offline.queueManualOverride(secondOperation);
  let revision = 7;
  const assignments = [];

  const results = await offline.synchronize({
    workspaceId: WORKSPACE,
    microsequenceRef: MICROSEQUENCE,
    loadRemoteContext: async () => ({
      revision,
      canOverride: true,
      lockedDefinitionIds: [],
      slice: remoteSlice(revision, { assignments: structuredClone(assignments) })
    }),
    submit: async (operation) => {
      assert.equal(operation.expectedRevision, revision);
      const assignment = confirmedAssignment(operation);
      assignments.push(assignment);
      revision += 1;
      return {
        accepted: true,
        revision,
        assignmentRef: { id: assignment.id, version: assignment.version }
      };
    }
  });

  assert.deepEqual(results.map(({ status }) => status), ["confirmed", "confirmed"]);
  assert.equal(revision, 9);
  assert.deepEqual((await offline.readQueue({ workspaceId: WORKSPACE })).operations, []);
});

test("resposta recusada ou mudança alheia não apaga o override pendente", async (context) => {
  const { relational, offline } = await open(new IDBFactory());
  context.after(() => relational.close());
  await offline.queueManualOverride(override());
  const refused = await offline.synchronize({
    workspaceId: WORKSPACE,
    microsequenceRef: MICROSEQUENCE,
    loadRemoteContext: async () => ({
      revision: 7,
      canOverride: true,
      lockedDefinitionIds: [],
      slice: remoteSlice()
    }),
    submit: async () => ({ accepted: false, revision: 8 })
  });
  assert.equal(refused[0].status, "conflict");
  assert.equal(refused[0].errorCode, "design_write_rejected");
  assert.equal((await offline.readQueue({ workspaceId: WORKSPACE })).operations.length, 1);

  const nextRequest = "60000000-0000-4000-8000-000000000006";
  await offline.queueManualOverride(override({ requestId: nextRequest }));
  let reads = 0;
  const unrelated = await offline.synchronize({
    workspaceId: WORKSPACE,
    microsequenceRef: MICROSEQUENCE,
    loadRemoteContext: async () => {
      reads += 1;
      return {
        revision: reads === 1 ? 7 : 8,
        canOverride: true,
        lockedDefinitionIds: [],
        slice: remoteSlice(reads === 1 ? 7 : 8, { assignments: [] })
      };
    },
    submit: async () => ({ accepted: true, revision: 8 })
  });
  assert.equal(unrelated[0].status, "pending");
  assert.ok((await offline.readQueue({ workspaceId: WORKSPACE })).operations.some(
    ({ requestId }) => requestId === nextRequest
  ));
});

test("conflito pode ser reenviado com revisão atual ou descartado explicitamente", async (context) => {
  const { relational, offline } = await open(new IDBFactory());
  context.after(() => relational.close());
  await offline.queueManualOverride(override());
  await offline.markConflict({
    workspaceId: WORKSPACE,
    requestId: REQUEST_A,
    code: "workspace_revision_conflict",
    message: "Revisão mudou."
  });
  const retried = await offline.retryConflict({
    workspaceId: WORKSPACE,
    requestId: REQUEST_A,
    expectedRevision: 8,
    observedCapability: "author"
  });
  assert.equal(retried.status, "pending");
  assert.equal(retried.expectedRevision, 8);
  assert.equal(retried.errorCode, "");
  assert.equal(await offline.discardOperation({
    workspaceId: WORKSPACE,
    requestId: REQUEST_A
  }), null);
  assert.deepEqual((await offline.readQueue({ workspaceId: WORKSPACE })).operations, []);
});

test("fila multi-instância usa a transação IndexedDB sem perder operações", async (context) => {
  const indexedDb = new IDBFactory();
  const first = await open(indexedDb);
  const secondRelational = await IndexedDbRelationalStore.open(indexedDb, { userId: USER_A });
  const second = new WorkspaceDesignOfflineStore(secondRelational, {
    userId: USER_A,
    browserLocks: null
  });
  context.after(() => { first.relational.close(); secondRelational.close(); });

  await Promise.all([
    first.offline.queueManualOverride(override()),
    second.queueManualOverride(override({
      requestId: REQUEST_B,
      definitionRef: { id: "accepted_performance_forms", version: "1.0.0" },
      value: { kind: "set", values: ["constructed_response"] }
    }))
  ]);
  const queue = await first.offline.readQueue({ workspaceId: WORKSPACE });
  assert.deepEqual(queue.operations.map((entry) => entry.requestId).sort(), [REQUEST_A, REQUEST_B]);
});

test("lease transacional serializa sincronizações entre instâncias", async (context) => {
  const indexedDb = new IDBFactory();
  const firstRelational = await IndexedDbRelationalStore.open(indexedDb, { userId: USER_A });
  await firstRelational.bindReplicaToUser(USER_A);
  const secondRelational = await IndexedDbRelationalStore.open(indexedDb, { userId: USER_A });
  const first = new WorkspaceDesignOfflineStore(firstRelational, {
    userId: USER_A,
    browserLocks: null,
    clock: Date.now,
    ownerId: "tab-first"
  });
  const second = new WorkspaceDesignOfflineStore(secondRelational, {
    userId: USER_A,
    browserLocks: null,
    clock: Date.now,
    ownerId: "tab-second"
  });
  context.after(() => { firstRelational.close(); secondRelational.close(); });
  const order = [];
  let releaseFirst;
  let signalEntered;
  const entered = new Promise((resolve) => { signalEntered = resolve; });
  const gate = new Promise((resolve) => { releaseFirst = resolve; });
  const firstRun = first.withWorkspaceSyncLock(WORKSPACE, async () => {
    order.push("first:start");
    signalEntered();
    await gate;
    order.push("first:end");
  });
  await entered;
  const secondRun = second.withWorkspaceSyncLock(WORKSPACE, async () => {
    order.push("second:start");
  });
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.deepEqual(order, ["first:start"]);
  releaseFirst();
  await Promise.all([firstRun, secondRun]);
  assert.deepEqual(order, ["first:start", "first:end", "second:start"]);
});

test("cache grande permanece fatiado e paginado por microssequência", async (context) => {
  const { relational, offline } = await open(new IDBFactory());
  context.after(() => relational.close());
  const total = 140;
  for (let index = 0; index < total; index += 1) {
    const microsequenceRef = `microsequence-${String(index).padStart(4, "0")}`;
    await offline.cacheRemoteSlice({
      workspaceId: WORKSPACE,
      microsequenceRef,
      slice: remoteSlice(7, { marker: index }, microsequenceRef)
    });
  }

  const first = await offline.listRemoteSlices({ workspaceId: WORKSPACE, limit: 100 });
  const second = await offline.listRemoteSlices({
    workspaceId: WORKSPACE,
    cursor: first.nextCursor,
    limit: 100
  });
  assert.equal(first.items.length, WORKSPACE_DESIGN_OFFLINE_LIMITS.maxPageSize);
  assert.equal(first.total, total);
  assert.equal(second.items.length, 40);
  assert.equal(second.nextCursor, null);
});

test("orçamento total do workspace remove primeiro a fatia mais antiga", async (context) => {
  const { relational, offline } = await open(new IDBFactory());
  context.after(() => relational.close());
  const payload = "x".repeat(1_980_000);
  for (let index = 0; index < 17; index += 1) {
    const microsequenceRef = `budget-${String(index).padStart(2, "0")}`;
    await offline.cacheRemoteSlice({
      workspaceId: WORKSPACE,
      microsequenceRef,
      slice: remoteSlice(7, { payload }, microsequenceRef)
    });
  }
  const listed = await offline.listRemoteSlices({ workspaceId: WORKSPACE, limit: 100 });
  assert.ok(listed.total < 17);
  assert.ok(listed.items.every(({ microsequenceRef }) => microsequenceRef !== "budget-00"));
  assert.ok(listed.items.some(({ microsequenceRef }) => microsequenceRef === "budget-16"));
  assert.equal(
    await offline.readRemoteSlice({ workspaceId: WORKSPACE, microsequenceRef: "budget-00" }),
    null
  );
});

test("cache rejeita raciocínio privado e fatias monolíticas", async (context) => {
  const { relational, offline } = await open(new IDBFactory());
  context.after(() => relational.close());
  await assert.rejects(
    offline.cacheRemoteSlice({
      workspaceId: WORKSPACE,
      microsequenceRef: MICROSEQUENCE,
      slice: remoteSlice(7, { chainOfThought: "não persistir" })
    }),
    /Raciocínio privado/u
  );
  await assert.rejects(
    offline.cacheRemoteSlice({
      workspaceId: WORKSPACE,
      microsequenceRef: MICROSEQUENCE,
      slice: remoteSlice(7, { messages: [{ role: "assistant", content: "não persistir" }] })
    }),
    /não pode ser persistido/u
  );
  for (const unsafeState of [
    { system_prompt: "não persistir" },
    { raw_prompt: "não persistir" },
    { chat_messages: [] },
    { invalid: undefined },
    { invalid: Number.NaN },
    { invalid: new Date() },
    { invalid: new Map() }
  ]) {
    await assert.rejects(offline.cacheRemoteSlice({
      workspaceId: WORKSPACE,
      microsequenceRef: MICROSEQUENCE,
      slice: remoteSlice(7, unsafeState)
    }));
  }
  await assert.rejects(
    offline.cacheRemoteSlice({
      workspaceId: OTHER_WORKSPACE,
      microsequenceRef: MICROSEQUENCE,
      slice: remoteSlice()
    }),
    /caminho deve seguir/u
  );
  await assert.rejects(
    offline.cacheRemoteSlice({
      workspaceId: WORKSPACE,
      microsequenceRef: MICROSEQUENCE,
      slice: remoteSlice(7, { oversized: "x".repeat(
        WORKSPACE_DESIGN_OFFLINE_LIMITS.maxCacheBytes
      ) })
    }),
    (error) => error.code === "design_cache_slice_too_large"
  );
});

test("referências de domínio preservam maiúsculas e minúsculas", async () => {
  const values = new Map();
  const store = {
    async getSyncState(key) {
      return values.has(key) ? structuredClone(values.get(key)) : null;
    },
    async putSyncState(key, value) {
      if (value === null) values.delete(key);
      else values.set(key, structuredClone(value));
    }
  };
  const offline = new WorkspaceDesignOfflineStore(store, {
    userId: USER_A,
    browserLocks: null
  });
  const microsequenceRef = "Micro-A";
  await offline.cacheRemoteSlice({
    workspaceId: WORKSPACE.toUpperCase(),
    microsequenceRef,
    slice: remoteSlice(7, {}, microsequenceRef)
  });
  const cached = await offline.readRemoteSlice({ workspaceId: WORKSPACE, microsequenceRef });
  assert.equal(cached.microsequenceRef, microsequenceRef);
  assert.equal(cached.scopePath.at(-1).ref, microsequenceRef);
  const queued = await offline.queueManualOverride(override({
    workspaceId: WORKSPACE.toUpperCase(),
    microsequenceRef,
    scope: { kind: "microsequence", ref: microsequenceRef },
    definitionRef: { id: "Representation_Fallback_Policy", version: "V1" }
  }));
  assert.deepEqual(queued.definitionRef, {
    id: "Representation_Fallback_Policy",
    version: "V1"
  });
});

test("réplica relacional não vinculada é recusada", async (context) => {
  const relational = await IndexedDbRelationalStore.open(new IDBFactory());
  context.after(() => relational.close());
  assert.throws(() => new WorkspaceDesignOfflineStore(relational, {
    userId: USER_A,
    browserLocks: null
  }), /outra conta/u);
});

test("fallback sem transação também protege o índice compartilhado", async () => {
  const values = new Map();
  const memoryStore = {
    async getSyncState(key) {
      await Promise.resolve();
      return values.has(key) ? structuredClone(values.get(key)) : null;
    },
    async putSyncState(key, value) {
      await Promise.resolve();
      if (value === null) values.delete(key);
      else values.set(key, structuredClone(value));
    }
  };
  const offline = new WorkspaceDesignOfflineStore(memoryStore, {
    userId: USER_A,
    browserLocks: null
  });
  const firstRef = "microsequence-fallback-a";
  const secondRef = "microsequence-fallback-b";
  await Promise.all([
    offline.cacheRemoteSlice({
      workspaceId: WORKSPACE,
      microsequenceRef: firstRef,
      slice: remoteSlice(7, {}, firstRef)
    }),
    offline.cacheRemoteSlice({
      workspaceId: WORKSPACE,
      microsequenceRef: secondRef,
      slice: remoteSlice(7, {}, secondRef)
    })
  ]);
  const listed = await offline.listRemoteSlices({ workspaceId: WORKSPACE });
  assert.equal(listed.total, 2);
  assert.deepEqual(listed.items.map(({ microsequenceRef }) => microsequenceRef), [
    firstRef,
    secondRef
  ]);
});

test("índice de filas evita varrer todas as fatias após a migração", async () => {
  const values = new Map();
  let scans = 0;
  const store = {
    userId: USER_A,
    async getSyncState(key) { return values.get(key) ?? null; },
    async putSyncState(key, value) {
      if (value == null) values.delete(key);
      else values.set(key, structuredClone(value));
    },
    async getAll() { scans += 1; return []; }
  };
  const offline = new WorkspaceDesignOfflineStore(store, {
    userId: USER_A,
    clock: () => Date.parse("2026-08-15T19:30:00.000Z"),
    browserLocks: null
  });

  await offline.queueManualOverride(override());
  assert.deepEqual(await offline.listQueuedWorkspaces(), [{
    workspaceId: WORKSPACE,
    pendingCount: 1,
    conflictCount: 0
  }]);
  assert.equal(scans, 0);

  await offline.cancelPendingOverrideForSlot({
    workspaceId: WORKSPACE,
    microsequenceRef: MICROSEQUENCE,
    definitionRef: { id: "representation_fallback_policy", version: "1.0.0" },
    scope: { kind: "microsequence", ref: MICROSEQUENCE }
  });
  assert.deepEqual(await offline.listQueuedWorkspaces(), []);
  assert.equal(scans, 0);
});
