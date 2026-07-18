import test from "node:test";
import assert from "node:assert/strict";
import { IDBFactory } from "fake-indexeddb";

import { IndexedDbRelationalStore } from "../../src/persistence/IndexedDbRelationalStore.js";
import { RelationalSyncEngine, SupabaseSyncTransport } from "../../src/sync/RelationalSyncEngine.js";

const DEVICE_ID = "11111111-1111-4111-8111-111111111111";
const CONFLICT_ID = "22222222-2222-4222-8222-222222222222";

async function createStore() {
  return IndexedDbRelationalStore.open(new IDBFactory());
}

function outbox(mutationId, overrides = {}) {
  return {
    mutationId,
    courseId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    entityType: "blocks",
    entityId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    operation: "upsert",
    baseRevision: 1,
    changedFields: ["value"],
    payload: {
      id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      courseId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      value: "local",
      revision: 2,
      deletedAt: null
    },
    status: "pending",
    attemptCount: 0,
    createdAt: "2026-07-18T00:00:00.000Z",
    updatedAt: "2026-07-18T00:00:00.000Z",
    ...overrides
  };
}

test("push confirma mutação idempotente e repetição após falha não duplica a outbox", async () => {
  const store = await createStore();
  await store.put("outbox", outbox("33333333-3333-4333-8333-333333333333"));
  let attempts = 0;
  const transport = {
    async applySyncBatch({ mutations }) {
      attempts += 1;
      assert.equal(mutations.length, 1);
      if (attempts === 1) throw new TypeError("offline");
      return { results: [{ mutationId: mutations[0].mutationId, status: "duplicate" }] };
    },
    async pullSyncChanges() { return { changes: [], nextCursor: 0, hasMore: false }; }
  };
  const engine = new RelationalSyncEngine({ store, transport, deviceId: DEVICE_ID });

  await assert.rejects(engine.synchronize(), /offline/);
  const retryEntry = await store.get("outbox", "33333333-3333-4333-8333-333333333333");
  assert.equal(retryEntry.status, "pending");
  assert.equal(retryEntry.attemptCount, 1);
  await engine.synchronize();
  assert.equal(await store.get("outbox", retryEntry.mutationId), undefined);
  assert.equal(attempts, 2);
  store.close();
});

test("pull incremental pagina, aplica tombstone e persiste cursor atomicamente", async () => {
  const store = await createStore();
  const courseId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  await store.put("courses", { id: courseId, courseId, contractKey: "curso", revision: 1, deletedAt: null });
  const pages = [
    {
      changes: [{
        storeName: "courses",
        entityId: courseId,
        operation: "upsert",
        revision: 2,
        row: { id: courseId, courseId, contractKey: "curso", title: "Remoto", revision: 2, deletedAt: null }
      }],
      nextCursor: 7,
      hasMore: true
    },
    {
      changes: [{
        storeName: "courses",
        entityId: courseId,
        operation: "delete",
        revision: 3,
        deletedAt: "2026-07-18T01:00:00.000Z",
        row: { id: courseId, courseId, contractKey: "curso", title: "Remoto", revision: 3 }
      }],
      nextCursor: 8,
      hasMore: false
    }
  ];
  const requestedCursors = [];
  const transport = {
    async applySyncBatch() { return { accepted: [] }; },
    async pullSyncChanges({ afterSequence }) {
      requestedCursors.push(afterSequence);
      return pages.shift();
    }
  };
  const engine = new RelationalSyncEngine({ store, transport, deviceId: DEVICE_ID });
  const result = await engine.synchronize();

  assert.deepEqual(requestedCursors, [0, 7]);
  assert.equal(result.pulled.cursor, 8);
  assert.equal((await store.get("courses", courseId)).deletedAt, "2026-07-18T01:00:00.000Z");
  assert.equal((await store.get("syncState", `sync.cursor:${DEVICE_ID}`)).cursor, 8);
  store.close();
});

test("membership tardia inicializa snapshot da árvore mesmo com cursor global avançado", async () => {
  const store = await createStore();
  const userId = "20000000-0000-4000-8000-000000000001";
  const courseId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaab";
  const membershipId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbc";
  const moduleId = "cccccccc-cccc-4ccc-8ccc-cccccccccccd";
  await store.putSyncState("replica.userId", userId);
  let downloads = 0;
  const membership = {
    id: membershipId,
    courseId,
    userId,
    role: "learner",
    position: 1,
    revision: 1,
    deletedAt: null
  };
  const transport = {
    async applySyncBatch() { return { results: [] }; },
    async pullSyncChanges() {
      return {
        changes: [{
          storeName: "memberships",
          entityId: membershipId,
          operation: "upsert",
          revision: 1,
          row: membership
        }],
        nextCursor: 500,
        hasMore: false
      };
    },
    async downloadCourseGraph(requestedCourseId) {
      downloads += 1;
      assert.equal(requestedCourseId, courseId);
      return {
        schemaVersion: 1,
        courses: [{ id: courseId, courseId, contractKey: "curso-tardio", revision: 3, deletedAt: null }],
        memberships: [membership],
        modules: [{ id: moduleId, courseId, contractKey: "modulo", position: 0, revision: 2, deletedAt: null }]
      };
    }
  };
  const engine = new RelationalSyncEngine({ store, transport, deviceId: DEVICE_ID });

  const result = await engine.synchronize();

  assert.equal(result.bootstrappedCourses, 1);
  assert.equal(downloads, 1);
  assert.equal((await store.get("courses", courseId)).contractKey, "curso-tardio");
  assert.equal((await store.get("modules", moduleId)).courseId, courseId);
  assert.equal((await store.get("syncState", engine.cursorStateId())).cursor, 500);
  store.close();
});

test("membership reativada substitui snapshot histórico mesmo se o curso local ainda existe", async () => {
  const store = await createStore();
  const userId = "20000000-0000-4000-8000-000000000011";
  const courseId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaabb";
  const membershipId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbcc";
  await store.putSyncState("replica.userId", userId);
  await store.put("courses", {
    id: courseId,
    courseId,
    contractKey: "curso-antigo",
    title: "Snapshot obsoleto",
    revision: 1,
    deletedAt: null
  });
  await store.put("memberships", {
    id: membershipId,
    courseId,
    userId,
    role: "learner",
    revision: 2,
    deletedAt: "2026-07-17T00:00:00.000Z"
  });
  let downloads = 0;
  const activeMembership = {
    id: membershipId,
    courseId,
    userId,
    role: "learner",
    position: 0,
    revision: 3,
    deletedAt: null
  };
  const engine = new RelationalSyncEngine({
    store,
    deviceId: DEVICE_ID,
    transport: {
      async applySyncBatch() { return { results: [] }; },
      async pullSyncChanges() {
        return {
          changes: [{
            storeName: "memberships",
            entityId: membershipId,
            courseId,
            operation: "upsert",
            revision: 3,
            row: activeMembership
          }],
          nextCursor: 700,
          hasMore: false
        };
      },
      async downloadCourseGraph() {
        downloads += 1;
        return {
          schemaVersion: 1,
          courses: [{
            id: courseId,
            courseId,
            contractKey: "curso-atual",
            title: "Snapshot atual",
            revision: 9,
            deletedAt: null
          }],
          memberships: [activeMembership]
        };
      }
    }
  });

  const result = await engine.synchronize();

  assert.equal(result.bootstrappedCourses, 1);
  assert.equal(downloads, 1);
  assert.equal((await store.get("courses", courseId)).title, "Snapshot atual");
  store.close();
});

test("falha entre páginas não expõe árvore parcial nem avança o cursor", async () => {
  const store = await createStore();
  const courseId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaab";
  let calls = 0;
  const engine = new RelationalSyncEngine({
    store,
    deviceId: DEVICE_ID,
    transport: {
      async applySyncBatch() { return { accepted: [] }; },
      async pullSyncChanges() {
        calls += 1;
        if (calls === 1) {
          return {
            changes: [{
              storeName: "courses",
              entityId: courseId,
              operation: "upsert",
              revision: 1,
              row: { id: courseId, courseId, contractKey: "parcial", revision: 1, deletedAt: null }
            }],
            nextCursor: 10,
            hasMore: true
          };
        }
        throw new TypeError("offline na segunda página");
      }
    }
  });

  await assert.rejects(engine.synchronize(), /segunda página/u);
  assert.equal(await store.get("courses", courseId), undefined);
  assert.equal(await store.get("syncState", `sync.cursor:${DEVICE_ID}`), undefined);
  store.close();
});

test("revisão divergente preserva linha local e registra cópias local e remota", async () => {
  const store = await createStore();
  const mutation = outbox("44444444-4444-4444-8444-444444444444");
  await store.put("blocks", mutation.payload);
  await store.put("outbox", mutation);
  const transport = {
    async applySyncBatch() {
      return {
        conflicts: [{
          mutationId: mutation.mutationId,
          entityType: "blocks",
          entityId: mutation.entityId,
          baseRevision: 1,
          remoteRevision: 2,
          remoteRow: { ...mutation.payload, value: "remoto" }
        }]
      };
    },
    async pullSyncChanges() { return { changes: [], nextCursor: 0, hasMore: false }; }
  };
  const engine = new RelationalSyncEngine({
    store,
    transport,
    deviceId: DEVICE_ID,
    uuidFactory: () => CONFLICT_ID
  });
  const result = await engine.synchronize();

  assert.equal(result.pushed.conflicts, 1);
  assert.equal((await store.get("blocks", mutation.entityId)).value, "local");
  assert.equal((await store.get("outbox", mutation.mutationId)).status, "conflict");
  const conflict = await store.get("conflicts", CONFLICT_ID);
  assert.equal(conflict.localRow.value, "local");
  assert.equal(conflict.remoteRow.value, "remoto");
  const resolution = await engine.resolveConflict(CONFLICT_ID, "keepLocal");
  assert.equal(resolution.conflict.status, "resolved");
  assert.equal(resolution.conflict.resolution, "keepLocal");
  assert.equal(await store.get("outbox", mutation.mutationId), undefined);
  const replacement = await store.get("outbox", resolution.queuedMutation.mutationId);
  assert.equal(replacement.status, "pending");
  assert.equal(replacement.baseRevision, 2);
  assert.equal(replacement.payload.value, "local");
  store.close();
});

test("rollback atômico mantém mutações causais bloqueadas pendentes", async () => {
  const store = await createStore();
  const parent = outbox("45454545-4545-4454-8454-454545454545", {
    sequence: 1,
    entityType: "modules",
    entityId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa01",
    payload: {
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa01",
      courseId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      title: "local",
      revision: 2
    }
  });
  const child = outbox("46464646-4646-4464-8464-464646464646", {
    sequence: 2,
    entityType: "lessons",
    entityId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa02",
    payload: {
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa02",
      courseId: parent.courseId,
      moduleId: parent.entityId,
      revision: 2
    }
  });
  await store.putMany("outbox", [parent, child]);
  const engine = new RelationalSyncEngine({
    store,
    deviceId: DEVICE_ID,
    uuidFactory: () => CONFLICT_ID,
    transport: {
      async applySyncBatch() {
        return {
          results: [
            {
              mutationId: parent.mutationId,
              entityType: parent.entityType,
              entityId: parent.entityId,
              status: "conflict",
              baseRevision: 1,
              remoteRevision: 3,
              remoteRow: { ...parent.payload, title: "remoto", revision: 3 }
            },
            {
              mutationId: child.mutationId,
              entityType: child.entityType,
              entityId: child.entityId,
              status: "conflict",
              reason: "causal_batch_blocked",
              blocked: true,
              rolledBack: false
            }
          ]
        };
      },
      async pullSyncChanges() { return { changes: [], nextCursor: 0, hasMore: false }; }
    }
  });

  const result = await engine.synchronize();
  assert.equal(result.pushed.conflicts, 1);
  assert.equal((await store.get("outbox", parent.mutationId)).status, "conflict");
  assert.equal((await store.get("outbox", child.mutationId)).status, "pending");
  assert.deepEqual(await store.listPendingOutbox(), []);
  assert.equal((await store.listConflicts()).length, 1);
  store.close();
});

test("duas chamadas simultâneas compartilham o mesmo ciclo de sincronização", async () => {
  const store = await createStore();
  let pulls = 0;
  const transport = {
    async applySyncBatch() { return { accepted: [] }; },
    async pullSyncChanges() {
      pulls += 1;
      return { changes: [], nextCursor: 0, hasMore: false };
    }
  };
  const engine = new RelationalSyncEngine({ store, transport, deviceId: DEVICE_ID });
  const first = engine.synchronize();
  const second = engine.synchronize();
  assert.equal(first, second);
  await first;
  assert.equal(pulls, 1);
  store.close();
});

test("transporte traduz upsert para insert ou update no contrato SQL", async () => {
  const calls = [];
  const transport = new SupabaseSyncTransport({
    async rpc(name, parameters) {
      calls.push({ name, parameters });
      return {};
    }
  });
  await transport.applySyncBatch({
    deviceId: DEVICE_ID,
    mutations: [
      outbox("55555555-5555-4555-8555-555555555555", { baseRevision: 0 }),
      outbox("66666666-6666-4666-8666-666666666666", { baseRevision: 4 })
    ]
  });
  assert.equal(calls[0].name, "apply_sync_batch");
  assert.deepEqual(calls[0].parameters.p_mutations.map((entry) => entry.operation), ["insert", "update"]);
});

test("substituição de cards usa RPC composta idempotente em vez de linhas parciais", async () => {
  const calls = [];
  const transport = new SupabaseSyncTransport({
    async rpc(name, parameters) {
      calls.push({ name, parameters });
      return {};
    }
  });
  const mutation = outbox("77777777-7777-4777-8777-777777777777", {
    entityType: "microsequenceCardReplacement",
    entityId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    operation: "replace",
    baseRevision: 5,
    payload: {
      courseId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      microsequenceId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      fragment: { cards: [{ id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd" }] }
    }
  });

  const response = await transport.applySyncBatch({ deviceId: DEVICE_ID, mutations: [mutation] });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].name, "replace_microsequence_cards");
  assert.equal(calls[0].parameters.p_mutation_id, mutation.mutationId);
  assert.equal(calls[0].parameters.p_base_revision, 5);
  assert.deepEqual(calls[0].parameters.p_fragment, mutation.payload.fragment);
  assert.equal(response.results[0].status, "applied");
});

test("conflito no replace bloqueia mutações filhas posteriores no mesmo push", async () => {
  const calls = [];
  const courseId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const microsequenceId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
  const cardId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
  const transport = new SupabaseSyncTransport({
    async rpc(name, parameters) {
      calls.push({ name, parameters });
      if (name === "replace_microsequence_cards") {
        return { status: "conflict", remoteRevision: 6 };
      }
      throw new Error("A mutação filha não pode atravessar o conflito composto.");
    }
  });
  const replacement = outbox("99999999-9999-4999-8999-999999999991", {
    sequence: 1,
    entityType: "microsequenceCardReplacement",
    entityId: microsequenceId,
    courseId,
    operation: "replace",
    baseRevision: 5,
    payload: {
      courseId,
      microsequenceId,
      fragment: { cards: [{ id: cardId, courseId, microsequenceId }] }
    }
  });
  const child = outbox("99999999-9999-4999-8999-999999999992", {
    sequence: 2,
    entityType: "cards",
    entityId: cardId,
    courseId,
    operation: "delete",
    baseRevision: 1,
    payload: { id: cardId, courseId, microsequenceId }
  });

  const result = await transport.applySyncBatch({
    deviceId: DEVICE_ID,
    mutations: [replacement, child]
  });

  assert.deepEqual(calls.map((call) => call.name), ["replace_microsequence_cards"]);
  assert.equal(result.results.length, 1);
  assert.equal(result.results[0].status, "conflict");
  assert.equal(result.results[0].mutationId, replacement.mutationId);
});

test("conflito granular bloqueia replace composto posterior no mesmo push", async () => {
  const calls = [];
  const courseId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const microsequenceId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
  const granular = outbox("99999999-9999-4999-8999-999999999993", {
    sequence: 1,
    entityType: "blocks",
    entityId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
    courseId,
    baseRevision: 1
  });
  const replacement = outbox("99999999-9999-4999-8999-999999999994", {
    sequence: 2,
    entityType: "microsequenceCardReplacement",
    entityId: microsequenceId,
    courseId,
    operation: "replace",
    baseRevision: 5,
    payload: { courseId, microsequenceId, fragment: { cards: [] } }
  });
  const transport = new SupabaseSyncTransport({
    async rpc(name, parameters) {
      calls.push({ name, parameters });
      if (name === "apply_sync_batch") {
        return {
          results: [{ mutationId: granular.mutationId, status: "conflict", remoteRevision: 2 }]
        };
      }
      throw new Error("O replace não pode atravessar o conflito granular.");
    }
  });

  const result = await transport.applySyncBatch({
    deviceId: DEVICE_ID,
    mutations: [granular, replacement]
  });

  assert.deepEqual(calls.map((call) => call.name), ["apply_sync_batch"]);
  assert.deepEqual(result.results.map((entry) => entry.mutationId), [granular.mutationId]);
});

test("mutação rejeitada permanece preservada, mas sai da fila automática", async () => {
  const store = await createStore();
  const mutation = outbox("88888888-8888-4888-8888-888888888888");
  await store.put("outbox", mutation);
  let calls = 0;
  const engine = new RelationalSyncEngine({
    store,
    deviceId: DEVICE_ID,
    transport: {
      async applySyncBatch() {
        calls += 1;
        return { results: [{ mutationId: mutation.mutationId, status: "rejected", message: "Payload inválido" }] };
      },
      async pullSyncChanges() { return { changes: [], nextSequence: 9, hasMore: false }; }
    }
  });
  const result = await engine.synchronize();
  const preserved = await store.get("outbox", mutation.mutationId);
  assert.equal(preserved.status, "rejected");
  assert.equal(preserved.lastError, "Payload inválido");
  assert.equal(result.pushed.rejected, 1);
  assert.equal(result.pulled.cursor, 9);
  await engine.synchronize();
  assert.equal(calls, 1);
  store.close();
});
