import test from "node:test";
import assert from "node:assert/strict";
import { IDBFactory } from "fake-indexeddb";

import {
  IndexedDbRelationalStore,
  OFFICIAL_COURSE_STORE_NAMES,
  RELATIONAL_DATABASE_NAME,
  RELATIONAL_DATABASE_VERSION,
  RELATIONAL_STORE_DEFINITIONS,
  SYNCED_PERSONAL_STORE_NAMES,
  relationalDatabaseNameForUser
} from "../../src/persistence/IndexedDbRelationalStore.js";

const USER_A = "10000000-0000-4000-8000-000000000001";
const USER_B = "20000000-0000-4000-8000-000000000002";
const COURSE = "30000000-0000-4000-8000-000000000003";
const SELECTION = "40000000-0000-4000-8000-000000000004";

async function openStore(indexedDb, userId = USER_A) {
  const store = await IndexedDbRelationalStore.open(indexedDb, { userId });
  await store.bindReplicaToUser(userId);
  return store;
}

function selection(userId = USER_A) {
  return {
    id: SELECTION,
    userId,
    courseId: COURSE,
    courseOrigin: "catalog",
    publicationSeq: 1,
    contentHash: "a".repeat(64),
    updatedAt: "2026-08-07T12:00:00.000Z",
    deletedAt: null
  };
}

function graph(title = "Curso") {
  return Object.fromEntries(OFFICIAL_COURSE_STORE_NAMES.map((storeName) => [
    storeName,
    storeName === "courses" ? [{
      id: COURSE,
      contractKey: "curso",
      title,
      status: "published",
      updatedAt: "2026-08-07T12:00:00.000Z",
      deletedAt: null
    }] : []
  ]));
}

test("o namespace r3 contém somente grafo, seleção leve, outbox e syncState", async (context) => {
  const indexedDb = new IDBFactory();
  const store = await openStore(indexedDb);
  context.after(() => store.close());

  assert.equal(RELATIONAL_DATABASE_NAME, "aralearn-relational-v4-r3");
  assert.equal(RELATIONAL_DATABASE_VERSION, 4);
  assert.deepEqual(SYNCED_PERSONAL_STORE_NAMES, ["courseSelections"]);
  assert.deepEqual(
    ["lessonProgress", "cardProgress", "comments", "studyPaths", "studyPathCourses"]
      .filter((name) => Object.hasOwn(RELATIONAL_STORE_DEFINITIONS, name)),
    []
  );
  assert.equal(store.objectStoreNames.includes("courseSelections"), true);
  assert.equal(store.objectStoreNames.includes("outbox"), true);
  assert.equal(store.objectStoreNames.includes("syncState"), true);
  assert.equal(store.objectStoreNames.includes("courses"), true);
});

test("o upgrade físico apaga stores retiradas em vez de migrá-las", async (context) => {
  const indexedDb = new IDBFactory();
  const databaseName = relationalDatabaseNameForUser(USER_A);
  const request = indexedDb.open(databaseName, 3);
  await new Promise((resolve, reject) => {
    request.addEventListener("upgradeneeded", () => {
      request.result.createObjectStore("lessonProgress", { keyPath: "id" });
      request.result.createObjectStore("studyPaths", { keyPath: "id" });
      request.result.createObjectStore("syncState", { keyPath: "id" });
    });
    request.addEventListener("success", resolve, { once: true });
    request.addEventListener("error", () => reject(request.error), { once: true });
  });
  request.result.close();

  const store = await openStore(indexedDb);
  context.after(() => store.close());
  assert.equal(store.version, RELATIONAL_DATABASE_VERSION);
  assert.equal(store.objectStoreNames.includes("lessonProgress"), false);
  assert.equal(store.objectStoreNames.includes("studyPaths"), false);
  assert.equal(store.objectStoreNames.includes("courses"), true);
});

test("cada usuário mantém somente sua réplica leve", async (context) => {
  const indexedDb = new IDBFactory();
  const first = await openStore(indexedDb, USER_A);
  const second = await openStore(indexedDb, USER_B);
  context.after(() => { first.close(); second.close(); });

  await first.put("courseSelections", selection(USER_A));
  assert.equal((await first.getAll("courseSelections")).length, 1);
  assert.deepEqual(await second.getAll("courseSelections"), []);
});

test("transações continuam atômicas no grafo e na seleção", async (context) => {
  const store = await openStore(new IDBFactory());
  context.after(() => store.close());

  await assert.rejects(
    store.transaction(["courseSelections", "syncState"], "readwrite", async (transaction) => {
      await transaction.put("courseSelections", selection());
      await transaction.put("syncState", { id: "probe", value: true });
      throw new Error("interromper");
    }),
    /interromper/u
  );
  assert.deepEqual(await store.getAll("courseSelections"), []);
  assert.equal(await store.get("syncState", "probe"), undefined);
});

test("bootstrap aceita exclusivamente courseSelections", async (context) => {
  const store = await openStore(new IDBFactory());
  context.after(() => store.close());

  const applied = await store.applyReplicaBootstrap({
    snapshot: { courseSelections: [selection()] },
    selectedCourses: [{
      courseId: COURSE,
      publicationSeq: 1,
      contentHash: "a".repeat(64)
    }],
    highWaterSequence: 9,
    deviceId: "50000000-0000-4000-8000-000000000005",
    syncStateId: "sync.cursor:device"
  });
  assert.equal(applied.status, "applied");
  assert.equal((await store.getAll("courseSelections")).length, 1);
  await assert.rejects(
    store.applyReplicaBootstrap({
      snapshot: { courseSelections: [], lessonProgress: [] },
      selectedCourses: [],
      highWaterSequence: 10,
      deviceId: "50000000-0000-4000-8000-000000000005",
      syncStateId: "sync.cursor:device"
    }),
    /coleção retirada "lessonProgress"/u
  );
});

test("réplica oficial não toca no cache corrente de trail personal state", async (context) => {
  const store = await openStore(new IDBFactory());
  context.after(() => store.close());
  const cacheId = `trail.personalState:${USER_A}:60000000-0000-4000-8000-000000000006`;
  await store.putSyncState(cacheId, { revision: 3, state: { version: 1 } });

  await store.replaceOfficialCourseReplica(COURSE, graph(), { validate: false });
  await store.replaceOfficialCourseReplica(COURSE, graph("Atualizado"), { validate: false });
  assert.deepEqual(await store.getSyncState(cacheId), {
    revision: 3,
    state: { version: 1 }
  });
});

test("feed rejeita entidades pessoais retiradas", async (context) => {
  const store = await openStore(new IDBFactory());
  context.after(() => store.close());
  await assert.rejects(
    store.applyRemotePage({
      changes: [{
        storeName: "cardProgress",
        entityId: "70000000-0000-4000-8000-000000000007",
        row: { id: "70000000-0000-4000-8000-000000000007" }
      }],
      cursor: 1
    }),
    /não aceita a entidade "cardProgress"/u
  );
});
