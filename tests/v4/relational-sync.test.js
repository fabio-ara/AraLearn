import test from "node:test";
import assert from "node:assert/strict";
import { IDBFactory } from "fake-indexeddb";

import { IndexedDbRelationalStore } from "../../src/persistence/IndexedDbRelationalStore.js";
import {
  RelationalSyncEngine,
  SupabaseSyncTransport,
  SYNC_FAILURE_KIND,
  classifySyncFailure
} from "../../src/sync/RelationalSyncEngine.js";

const USER = "10000000-0000-4000-8000-000000000001";
const DEVICE = "20000000-0000-4000-8000-000000000002";
const COURSE = "30000000-0000-4000-8000-000000000003";
const SELECTION = "40000000-0000-4000-8000-000000000004";
const MUTATION = "50000000-0000-4000-8000-000000000005";

function selection() {
  return {
    id: SELECTION,
    userId: USER,
    courseId: COURSE,
    courseOrigin: "catalog",
    publicationSeq: 1,
    contentHash: "a".repeat(64),
    updatedAt: "2026-08-07T12:00:00.000Z",
    deletedAt: null
  };
}

function selectionMutation() {
  return {
    mutationId: MUTATION,
    sequence: 1,
    courseId: COURSE,
    entityType: "courseSelections",
    entityId: SELECTION,
    operation: "insert",
    changedFields: ["courseId"],
    payload: { courseId: COURSE },
    previousRow: null,
    status: "pending",
    attemptCount: 0,
    createdAt: "2026-08-07T12:00:00.000Z",
    updatedAt: "2026-08-07T12:00:00.000Z"
  };
}

async function openStore() {
  const store = await IndexedDbRelationalStore.open(new IDBFactory(), { userId: USER });
  await store.bindReplicaToUser(USER);
  return store;
}

test("transporte envia somente courseSelections para apply_sync_batch", async () => {
  const calls = [];
  const transport = new SupabaseSyncTransport({
    async rpc(name, parameters) {
      calls.push({ name, parameters });
      return { status: "applied", results: [] };
    }
  });
  await transport.applySyncBatch({ deviceId: DEVICE, mutations: [selectionMutation()] });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].name, "apply_sync_batch");
  assert.deepEqual(calls[0].parameters.p_mutations.map((item) => item.entityType), [
    "courseSelections"
  ]);

  await assert.rejects(
    transport.applySyncBatch({
      deviceId: DEVICE,
      mutations: [{ ...selectionMutation(), entityType: "cardProgress" }]
    }),
    /outbox não aceita a entidade "cardProgress"/u
  );
});

test("bootstrap e pull materializam somente a seleção leve", async (context) => {
  const store = await openStore();
  context.after(() => store.close());
  const transport = {
    async applySyncBatch() { return { status: "applied", results: [] }; },
    async bootstrapReplica() {
      return {
        snapshot: { courseSelections: [selection()] },
        selectedCourses: [{
          courseId: COURSE,
          publicationSeq: 1,
          contentHash: "a".repeat(64)
        }],
        highWaterSequence: 1
      };
    },
    async pullSyncChanges({ afterSequence }) {
      return { changes: [], nextCursor: afterSequence, hasMore: false };
    }
  };
  const engine = new RelationalSyncEngine({ store, transport, deviceId: DEVICE });
  const result = await engine.bootstrapReplicaIfNeeded({ force: true });
  assert.equal(result.status, "applied");
  assert.deepEqual(await store.getAll("courseSelections"), [selection()]);
  const pulled = await engine.pull();
  assert.equal(pulled.applied, 0);
});

test("bootstrap rejeita coleções pessoais retiradas", async (context) => {
  const store = await openStore();
  context.after(() => store.close());
  const transport = {
    async applySyncBatch() { return { status: "applied", results: [] }; },
    async bootstrapReplica() {
      return {
        snapshot: { courseSelections: [], comments: [] },
        selectedCourses: [],
        highWaterSequence: 0
      };
    },
    async pullSyncChanges() { return { changes: [], nextCursor: 0, hasMore: false }; }
  };
  const engine = new RelationalSyncEngine({ store, transport, deviceId: DEVICE });
  await assert.rejects(
    engine.bootstrapReplicaIfNeeded({ force: true }),
    /coleção desconhecida "comments"/u
  );
});

test("push confirma apenas a mutação de seleção", async (context) => {
  const store = await openStore();
  context.after(() => store.close());
  await store.put("outbox", selectionMutation());
  const transport = {
    async applySyncBatch({ mutations }) {
      assert.deepEqual(mutations.map((item) => item.entityType), ["courseSelections"]);
      return { results: [{ mutationId: MUTATION, status: "applied" }] };
    },
    async bootstrapReplica() {
      return { snapshot: { courseSelections: [] }, selectedCourses: [], highWaterSequence: 0 };
    },
    async pullSyncChanges() { return { changes: [], nextCursor: 0, hasMore: false }; }
  };
  const engine = new RelationalSyncEngine({ store, transport, deviceId: DEVICE });
  const result = await engine.push();
  assert.equal(result.accepted, 1);
  assert.deepEqual(await store.getAll("outbox"), []);
});

test("classificação de falhas preserva autenticação, retry e rejeição", () => {
  assert.equal(classifySyncFailure({ status: 401 }).kind, SYNC_FAILURE_KIND.AUTH_REQUIRED);
  assert.equal(classifySyncFailure({ status: 503 }).kind, SYNC_FAILURE_KIND.RETRYABLE);
  assert.equal(classifySyncFailure({ status: 422 }).kind, SYNC_FAILURE_KIND.REJECTED);
});
