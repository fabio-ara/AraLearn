import test from "node:test";
import assert from "node:assert/strict";
import { IDBFactory } from "fake-indexeddb";

import { IndexedDbRelationalStore } from "../../src/persistence/IndexedDbRelationalStore.js";
import {
  RelationalSyncEngine,
  SupabaseSyncTransport,
  classifySyncFailure
} from "../../src/sync/RelationalSyncEngine.js";

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

  const first = await engine.synchronize();
  assert.equal(first.pushed.retryable, true);
  assert.equal(first.pulled.cursor, 0);
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
  await store.putSyncState(`sync.bootstrap:${DEVICE_ID}`, true);
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
    async bootstrapReplica() { throw new Error("bootstrap inicial não deve repetir"); },
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

test("membership reativada não baixa snapshot duplicado de curso já materializado", async () => {
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

  assert.equal(result.bootstrappedCourses, 0);
  assert.equal(downloads, 0);
  assert.equal((await store.get("courses", courseId)).title, "Snapshot obsoleto");
  store.close();
});

test("falha entre páginas preserva a página confirmada e retoma do cursor salvo", async () => {
  const store = await createStore();
  const courseId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaab";
  let calls = 0;
  const requestedCursors = [];
  const engine = new RelationalSyncEngine({
    store,
    deviceId: DEVICE_ID,
    transport: {
      async applySyncBatch() { return { accepted: [] }; },
      async pullSyncChanges({ afterSequence }) {
        requestedCursors.push(afterSequence);
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
        if (calls === 2) throw new TypeError("offline na segunda página");
        return { changes: [], nextCursor: 11, hasMore: false };
      }
    }
  });

  await assert.rejects(engine.synchronize(), /segunda página/u);
  assert.equal((await store.get("courses", courseId)).contractKey, "parcial");
  assert.equal((await store.get("syncState", `sync.cursor:${DEVICE_ID}`)).cursor, 10);
  await engine.synchronize();
  assert.deepEqual(requestedCursors, [0, 10, 10]);
  assert.equal((await store.get("syncState", `sync.cursor:${DEVICE_ID}`)).cursor, 11);
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

test("classificação distingue rede, conflito e falhas determinísticas", () => {
  assert.equal(classifySyncFailure(new TypeError("offline")).kind, "retryable");
  assert.equal(
    classifySyncFailure(Object.assign(new Error("JWT expirado"), { status: 401, code: "JWT_EXPIRED" })).kind,
    "auth_required"
  );
  assert.equal(
    classifySyncFailure(Object.assign(new Error("refresh token inválido"), { status: 400, code: "invalid_grant" })).kind,
    "auth_required"
  );
  assert.equal(classifySyncFailure(new Error("Autenticação necessária.")).kind, "auth_required");
  assert.equal(
    classifySyncFailure(Object.assign(new Error("JWT expirado"), { status: 403, code: "JWT_EXPIRED" })).kind,
    "rejected"
  );
  assert.deepEqual(classifySyncFailure(new TypeError("fragmento local malformado")), {
    kind: "rejected",
    status: 0,
    code: "",
    reason: "invalid_payload"
  });
  assert.equal(
    classifySyncFailure(Object.assign(new Error("indisponível"), { status: 503 })).kind,
    "retryable"
  );
  assert.equal(classifySyncFailure(Object.assign(new Error("deadlock"), { code: "40P01" })).kind, "retryable");
  assert.equal(classifySyncFailure(Object.assign(new Error("lock"), { code: "55P03" })).kind, "retryable");
  assert.equal(
    classifySyncFailure(Object.assign(new Error("divergiu"), { status: 409, code: "40001" })).kind,
    "conflict"
  );
  const cases = [
    [{ status: 400, code: "22023", message: "fragmento inválido" }, "invalid_fragment"],
    [{ status: 400, code: "23514", message: "violação estrutural" }, "structural_violation"],
    [{ status: 404, code: "P0002", message: "microssequência removida" }, "entity_missing"],
    [{ status: 403, code: "42501", message: "autorização revogada" }, "authorization_denied"],
    [{ status: 400, code: "23505", message: "mutationId reutilizado com conteúdo incompatível" }, "mutation_id_reuse"]
  ];
  for (const [source, reason] of cases) {
    const error = Object.assign(new Error(source.message), source);
    assert.deepEqual(classifySyncFailure(error), {
      kind: "rejected",
      status: source.status,
      code: source.code,
      reason
    });
  }
});

test("erros determinísticos do replace viram rejeição estruturada e não são relançados", async () => {
  const courseId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const microsequenceId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
  const mutation = outbox("a0000000-0000-4000-8000-000000000001", {
    entityType: "microsequenceCardReplacement",
    entityId: microsequenceId,
    courseId,
    operation: "replace",
    payload: { courseId, microsequenceId, fragment: { cards: [] } }
  });
  const deterministicErrors = [
    Object.assign(new Error("fragmento inválido"), { status: 400, code: "22023" }),
    Object.assign(new Error("violação estrutural"), { status: 400, code: "23514" }),
    Object.assign(new Error("microssequência removida"), { status: 404, code: "P0002" }),
    Object.assign(new Error("autorização revogada"), { status: 403, code: "42501" }),
    Object.assign(new Error("mutationId reutilizado com conteúdo incompatível"), { status: 400, code: "23505" })
  ];
  for (const expectedError of deterministicErrors) {
    const transport = new SupabaseSyncTransport({ async rpc() { throw expectedError; } });
    const response = await transport.applySyncBatch({ deviceId: DEVICE_ID, mutations: [mutation] });
    assert.equal(response.results[0].status, "rejected");
    assert.equal(response.results[0].code, expectedError.code);
  }
});

test("401 no apply_sync_batch preserva a outbox, interrompe o ciclo e volta a enviar após novo login", async () => {
  const store = await createStore();
  const mutation = outbox("a0000000-0000-4000-8000-000000000006");
  await store.put("outbox", mutation);
  const pendingBeforeExpiry = await store.get("outbox", mutation.mutationId);
  let authenticated = false;
  let pushes = 0;
  let pulls = 0;
  const engine = new RelationalSyncEngine({
    store,
    deviceId: DEVICE_ID,
    transport: {
      async applySyncBatch() {
        pushes += 1;
        if (!authenticated) {
          throw Object.assign(new Error("JWT expirado"), { status: 401, code: "JWT_EXPIRED" });
        }
        return { results: [{ mutationId: mutation.mutationId, status: "applied" }] };
      },
      async pullSyncChanges() {
        pulls += 1;
        return { changes: [], nextCursor: 70, hasMore: false };
      }
    }
  });

  const expired = await engine.synchronize();
  assert.equal(expired.authRequired, true);
  assert.equal(expired.pushed.authRequired, true);
  assert.equal(expired.pulled, null);
  assert.equal(pulls, 0);
  assert.deepEqual(await store.get("outbox", mutation.mutationId), pendingBeforeExpiry);

  authenticated = true;
  const resumed = await engine.synchronize();
  assert.equal(resumed.authRequired, undefined);
  assert.equal(resumed.pushed.accepted, 1);
  assert.equal(await store.get("outbox", mutation.mutationId), undefined);
  assert.equal(pushes, 2);
  assert.equal(pulls, 1);
  store.close();
});

test("401 no replace_microsequence_cards é relançado pelo transporte e preserva a mutação composta", async () => {
  const store = await createStore();
  const courseId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaab";
  const microsequenceId = "cccccccc-cccc-4ccc-8ccc-cccccccccccd";
  const mutation = outbox("a0000000-0000-4000-8000-000000000007", {
    courseId,
    entityType: "microsequenceCardReplacement",
    entityId: microsequenceId,
    operation: "replace",
    payload: { courseId, microsequenceId, fragment: { cards: [] } }
  });
  await store.put("outbox", mutation);
  const authError = Object.assign(new Error("sessão inválida"), { status: 401, code: "BAD_JWT" });
  const transport = new SupabaseSyncTransport({
    async rpc(name) {
      assert.equal(name, "replace_microsequence_cards");
      throw authError;
    }
  });
  await assert.rejects(
    () => transport.applySyncBatch({ deviceId: DEVICE_ID, mutations: [mutation] }),
    (error) => classifySyncFailure(error).kind === "auth_required"
  );

  const engine = new RelationalSyncEngine({
    store,
    deviceId: DEVICE_ID,
    transport,
    pageSize: 1
  });
  const result = await engine.synchronize();
  assert.equal(result.authRequired, true);
  assert.equal(result.pulled, null);
  const preserved = await store.get("outbox", mutation.mutationId);
  assert.equal(preserved.status, "pending");
  assert.equal(preserved.attemptCount, 0);
  assert.deepEqual(preserved.payload, mutation.payload);
  store.close();
});

test("rejeição determinística por exceção não impede pull e nunca é reenviada", async () => {
  const store = await createStore();
  const mutation = outbox("a0000000-0000-4000-8000-000000000002");
  await store.put("outbox", mutation);
  let pushes = 0;
  let pulls = 0;
  const engine = new RelationalSyncEngine({
    store,
    deviceId: DEVICE_ID,
    transport: {
      async applySyncBatch() {
        pushes += 1;
        throw Object.assign(new Error("referência inválida"), { status: 400, code: "23503" });
      },
      async pullSyncChanges() {
        pulls += 1;
        return { changes: [], nextCursor: 41, hasMore: false };
      }
    }
  });
  const first = await engine.synchronize();
  assert.equal(first.pushed.rejected, 1);
  assert.equal(first.pulled.cursor, 41);
  assert.equal((await store.get("outbox", mutation.mutationId)).status, "rejected");
  await engine.synchronize();
  assert.equal(pushes, 1);
  assert.equal(pulls, 2);
  store.close();
});

test("falha transitória de push permanece pendente e pull ainda avança quando a conexão responde", async () => {
  const store = await createStore();
  const mutation = outbox("a0000000-0000-4000-8000-000000000003");
  await store.put("outbox", mutation);
  let pulls = 0;
  const engine = new RelationalSyncEngine({
    store,
    deviceId: DEVICE_ID,
    transport: {
      async applySyncBatch() {
        throw Object.assign(new Error("temporariamente indisponível"), { status: 503 });
      },
      async pullSyncChanges() {
        pulls += 1;
        return { changes: [], nextCursor: 52, hasMore: false };
      }
    }
  });
  const result = await engine.synchronize();
  assert.equal(result.pushed.retryable, true);
  assert.equal(result.pulled.cursor, 52);
  assert.equal(pulls, 1);
  const preserved = await store.get("outbox", mutation.mutationId);
  assert.equal(preserved.status, "pending");
  assert.equal(preserved.attemptCount, 1);
  store.close();
});

test("bootstrap aplica snapshot e high-water atomicamente antes do feed incremental", async () => {
  const store = await createStore();
  const userId = "20000000-0000-4000-8000-000000000021";
  const courseId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaacc";
  const membershipId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbdd";
  const moduleId = "cccccccc-cccc-4ccc-8ccc-ccccccccccddee";
  let downloads = 0;
  const cursors = [];
  const engine = new RelationalSyncEngine({
    store,
    deviceId: DEVICE_ID,
    transport: {
      async applySyncBatch() { return { results: [] }; },
      async bootstrapReplica() {
        return {
          snapshot: {
            courses: [{ id: courseId, courseId, contractKey: "bootstrap", revision: 3, deletedAt: null }],
            memberships: [{ id: membershipId, courseId, userId, role: "owner", revision: 1, deletedAt: null }],
            modules: [{ id: moduleId, courseId, contractKey: "m1", position: 0, revision: 2, deletedAt: null }]
          },
          highWaterSequence: 900
        };
      },
      async pullSyncChanges({ afterSequence }) {
        cursors.push(afterSequence);
        return { changes: [], nextCursor: 900, hasMore: false };
      },
      async downloadCourseGraph() { downloads += 1; return {}; }
    }
  });
  const result = await engine.synchronize();
  assert.equal(result.bootstrap.status, "applied");
  assert.equal(result.bootstrap.courseCount, 1);
  assert.deepEqual(cursors, [900]);
  assert.equal(downloads, 0);
  assert.equal((await store.get("courses", courseId)).contractKey, "bootstrap");
  assert.equal((await store.get("modules", moduleId)).courseId, courseId);
  assert.equal((await store.get("syncState", engine.cursorStateId())).cursor, 900);
  store.close();
});

test("bootstrap transitório em dispositivo novo adia o pull em vez de percorrer cursor zero", async () => {
  const store = await createStore();
  let pulls = 0;
  const engine = new RelationalSyncEngine({
    store,
    deviceId: DEVICE_ID,
    transport: {
      async applySyncBatch() { return { results: [] }; },
      async bootstrapReplica() {
        throw Object.assign(new Error("bootstrap indisponível"), { status: 503 });
      },
      async pullSyncChanges() { pulls += 1; return { changes: [], nextCursor: 0, hasMore: false }; }
    }
  });
  const result = await engine.synchronize();
  assert.equal(result.bootstrap.status, "retryable_failure");
  assert.equal(result.pulled, null);
  assert.equal(pulls, 0);
  assert.equal(await store.get("syncState", engine.cursorStateId()), undefined);
  store.close();
});

test("device inativo força novo bootstrap antes de retomar o pull compactado", async () => {
  const store = await createStore();
  const courseId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaee";
  await store.put("syncState", {
    id: `sync.cursor:${DEVICE_ID}`,
    key: `sync.cursor:${DEVICE_ID}`,
    cursor: 5
  });
  await store.putSyncState(`sync.bootstrap:${DEVICE_ID}`, true);
  const requested = [];
  let bootstrapCalls = 0;
  const engine = new RelationalSyncEngine({
    store,
    deviceId: DEVICE_ID,
    transport: {
      async applySyncBatch() { return { results: [] }; },
      async pullSyncChanges({ afterSequence }) {
        requested.push(afterSequence);
        if (requested.length === 1) {
          throw Object.assign(new Error("device inativo"), { status: 400, code: "55000" });
        }
        return { changes: [], nextCursor: 100, hasMore: false };
      },
      async bootstrapReplica() {
        bootstrapCalls += 1;
        return {
          snapshot: {
            courses: [{ id: courseId, courseId, contractKey: "rebootstrap", revision: 7, deletedAt: null }]
          },
          highWaterSequence: 100
        };
      }
    }
  });
  const result = await engine.synchronize();
  assert.equal(bootstrapCalls, 1);
  assert.deepEqual(requested, [5, 100]);
  assert.equal(result.bootstrap.status, "applied");
  assert.equal(result.pulled.cursor, 100);
  assert.equal((await store.get("courses", courseId)).contractKey, "rebootstrap");
  assert.equal(await store.getSyncState(`sync.bootstrap.required:${DEVICE_ID}`), null);
  store.close();
});

test("rebootstrap de device inativo preserva trabalho pendente e exige reconciliação", async () => {
  const store = await createStore();
  const courseId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaff";
  const mutation = outbox("a0000000-0000-4000-8000-000000000004", {
    courseId,
    entityType: "courses",
    entityId: courseId,
    payload: { id: courseId, courseId, contractKey: "local", revision: 2, deletedAt: null }
  });
  await store.put("courses", mutation.payload);
  await store.put("outbox", mutation);
  await store.put("syncState", {
    id: `sync.cursor:${DEVICE_ID}`,
    key: `sync.cursor:${DEVICE_ID}`,
    cursor: 8
  });
  await store.putSyncState(`sync.bootstrap:${DEVICE_ID}`, true);
  let pulls = 0;
  const engine = new RelationalSyncEngine({
    store,
    deviceId: DEVICE_ID,
    uuidFactory: (() => {
      let suffix = 10;
      return () => `a1000000-0000-4000-8000-${String(suffix++).padStart(12, "0")}`;
    })(),
    transport: {
      async applySyncBatch() { return { results: [] }; },
      async pullSyncChanges() {
        pulls += 1;
        throw Object.assign(new Error("device inativo"), { status: 400, code: "55000" });
      },
      async bootstrapReplica() {
        return {
          snapshot: {
            courses: [{ id: courseId, courseId, contractKey: "remoto", revision: 5, deletedAt: null }]
          },
          highWaterSequence: 110
        };
      }
    }
  });
  const result = await engine.synchronize();
  assert.equal(result.bootstrap.status, "reconciliation_required");
  assert.equal(result.pulled, null);
  assert.equal(pulls, 1);
  assert.equal((await store.get("courses", courseId)).contractKey, "local");
  assert.equal((await store.get("syncState", engine.cursorStateId())).cursor, 8);
  assert.equal(await store.getSyncState(`sync.bootstrap.required:${DEVICE_ID}`), true);
  store.close();
});

test("device inativo detectado no push preserva a outbox antes do rebootstrap", async () => {
  const store = await createStore();
  const courseId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaafe";
  const mutation = outbox("a0000000-0000-4000-8000-000000000005", {
    courseId,
    entityType: "courses",
    entityId: courseId,
    payload: { id: courseId, courseId, contractKey: "local-push", revision: 2, deletedAt: null }
  });
  await store.put("courses", mutation.payload);
  await store.put("outbox", mutation);
  await store.put("syncState", {
    id: `sync.cursor:${DEVICE_ID}`,
    key: `sync.cursor:${DEVICE_ID}`,
    cursor: 9
  });
  await store.putSyncState(`sync.bootstrap:${DEVICE_ID}`, true);
  let pushCalls = 0;
  let bootstrapCalls = 0;
  let pullCalls = 0;
  const engine = new RelationalSyncEngine({
    store,
    deviceId: DEVICE_ID,
    uuidFactory: (() => {
      let suffix = 20;
      return () => `a2000000-0000-4000-8000-${String(suffix++).padStart(12, "0")}`;
    })(),
    transport: {
      async applySyncBatch() {
        pushCalls += 1;
        throw Object.assign(new Error("device inativo no push"), { status: 400, code: "55000" });
      },
      async bootstrapReplica() {
        bootstrapCalls += 1;
        return {
          snapshot: {
            courses: [{ id: courseId, courseId, contractKey: "remoto-push", revision: 5, deletedAt: null }]
          },
          highWaterSequence: 120
        };
      },
      async pullSyncChanges() {
        pullCalls += 1;
        return { changes: [], nextCursor: 120, hasMore: false };
      }
    }
  });

  const result = await engine.synchronize();

  assert.equal(pushCalls, 1);
  assert.equal(bootstrapCalls, 1);
  assert.equal(pullCalls, 0);
  assert.equal(result.pushed.bootstrapRequired, true);
  assert.equal(result.bootstrap.status, "reconciliation_required");
  const preserved = await store.get("outbox", mutation.mutationId);
  assert.equal(preserved.status, "pending");
  assert.equal(preserved.attemptCount, 0);
  assert.equal((await store.get("courses", courseId)).contractKey, "local-push");
  assert.equal(await store.getSyncState(`sync.bootstrap.required:${DEVICE_ID}`), true);
  store.close();
});

test("feed de clone com membership e árvore materializa o curso uma única vez", async () => {
  const store = await createStore();
  const userId = "20000000-0000-4000-8000-000000000031";
  const courseId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaadd";
  const membershipId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbee";
  const moduleId = "cccccccc-cccc-4ccc-8ccc-ccccccccccff";
  await store.putSyncState("replica.userId", userId);
  await store.putSyncState(`sync.bootstrap:${DEVICE_ID}`, true);
  let downloads = 0;
  const engine = new RelationalSyncEngine({
    store,
    deviceId: DEVICE_ID,
    transport: {
      async applySyncBatch() { return { results: [] }; },
      async bootstrapReplica() { throw new Error("bootstrap inicial não deve repetir"); },
      async pullSyncChanges() {
        return {
          changes: [
            {
              storeName: "memberships",
              entityId: membershipId,
              courseId,
              revision: 1,
              row: { id: membershipId, courseId, userId, role: "owner", revision: 1, deletedAt: null }
            },
            {
              storeName: "courses",
              entityId: courseId,
              courseId,
              revision: 1,
              row: { id: courseId, courseId, contractKey: "clone", revision: 1, deletedAt: null }
            },
            {
              storeName: "modules",
              entityId: moduleId,
              courseId,
              revision: 1,
              row: { id: moduleId, courseId, position: 0, revision: 1, deletedAt: null }
            }
          ],
          nextCursor: 60,
          hasMore: false
        };
      },
      async downloadCourseGraph() { downloads += 1; throw new Error("snapshot duplicado"); }
    }
  });
  const result = await engine.synchronize({ expectedCourseIds: [courseId] });
  assert.equal(result.bootstrappedCourses, 0);
  assert.equal(downloads, 0);
  assert.equal((await store.get("courses", courseId)).contractKey, "clone");
  assert.equal((await store.get("modules", moduleId)).courseId, courseId);
  store.close();
});

test("UUID devolvido pela clonagem direciona um único snapshot quando a árvore não veio no feed", async () => {
  const store = await createStore();
  const userId = "20000000-0000-4000-8000-000000000032";
  const courseId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaade";
  const membershipId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbeef";
  await store.putSyncState("replica.userId", userId);
  await store.putSyncState(`sync.bootstrap:${DEVICE_ID}`, true);
  let pullCalls = 0;
  let downloads = 0;
  const membership = {
    id: membershipId,
    courseId,
    userId,
    role: "owner",
    revision: 1,
    deletedAt: null
  };
  const engine = new RelationalSyncEngine({
    store,
    deviceId: DEVICE_ID,
    transport: {
      async applySyncBatch() { return { results: [] }; },
      async bootstrapReplica() { throw new Error("bootstrap inicial não deve repetir"); },
      async pullSyncChanges() {
        pullCalls += 1;
        return pullCalls === 1
          ? {
              changes: [{
                storeName: "memberships",
                entityId: membershipId,
                courseId,
                revision: 1,
                row: membership
              }],
              nextCursor: 61,
              hasMore: false
            }
          : { changes: [], nextCursor: 61, hasMore: false };
      },
      async downloadCourseGraph(requestedCourseId) {
        downloads += 1;
        assert.equal(requestedCourseId, courseId);
        return {
          courses: [{
            id: courseId,
            courseId,
            contractKey: "clone-snapshot",
            revision: 1,
            deletedAt: null
          }],
          memberships: [membership]
        };
      }
    }
  });

  const first = await engine.synchronize({ expectedCourseIds: [courseId] });
  assert.equal(first.bootstrappedCourses, 1);
  assert.equal(downloads, 1);
  assert.equal((await store.get("courses", courseId)).contractKey, "clone-snapshot");
  await engine.synchronize();
  assert.equal(downloads, 1);
  store.close();
});

test("pull grande mantém no máximo uma página em aplicação e confirma cursor por página", async () => {
  const store = await createStore();
  const pages = 40;
  const pageSize = 3;
  let page = 0;
  const requested = [];
  const engine = new RelationalSyncEngine({
    store,
    deviceId: DEVICE_ID,
    pageSize,
    transport: {
      async applySyncBatch() { return { results: [] }; },
      async pullSyncChanges({ afterSequence }) {
        requested.push(afterSequence);
        if (page > 0) {
          assert.equal((await store.get("syncState", `sync.cursor:${DEVICE_ID}`)).cursor, page);
        }
        page += 1;
        const courseId = `aaaaaaaa-aaaa-4aaa-8aaa-${String(page).padStart(12, "0")}`;
        return {
          changes: [{
            storeName: "courses",
            entityId: courseId,
            revision: 1,
            row: { id: courseId, courseId, contractKey: `c${page}`, revision: 1, deletedAt: null }
          }],
          nextCursor: page,
          hasMore: page < pages
        };
      }
    }
  });
  const result = await engine.synchronize();
  assert.equal(result.pulled.pages, pages);
  assert.equal(result.pulled.applied, pages);
  assert.equal(requested.length, pages);
  assert.equal((await store.getAll("courses")).length, pages);
  store.close();
});
