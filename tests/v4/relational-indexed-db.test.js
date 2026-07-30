import test from "node:test";
import assert from "node:assert/strict";
import { IDBFactory } from "fake-indexeddb";

import {
  IndexedDbRelationalStore,
  LocalCourseDraftChangedError,
  LocalCourseDraftNotFoundError,
  localCourseAuthoringStateId,
  OFFICIAL_COURSE_STORE_NAMES,
  RELATIONAL_DATABASE_NAME,
  RELATIONAL_DATABASE_VERSION,
  RELATIONAL_STORE_DEFINITIONS,
  SYNCED_PERSONAL_STORE_NAMES,
  relationalDatabaseNameForUser
} from "../../src/persistence/IndexedDbRelationalStore.js";
import {
  minimalProjectFixture,
  officialGraphFromDocument
} from "./helpers/leanRelationalFixture.js";

const USER_A = "10000000-0000-4000-8000-000000000001";
const USER_B = "20000000-0000-4000-8000-000000000002";

function uuid(suffix) {
  return `00000000-0000-4000-8000-${String(suffix).padStart(12, "0")}`;
}

function graph(courseId, {
  title = "Curso oficial",
  moduleId = uuid(11),
  lessonId = null,
  cardId = null
} = {}) {
  return {
    courses: [{
      id: courseId,
      contractKey: `course-${courseId.slice(-4)}`,
      status: "published",
      title,
      publicationSeq: 1,
      contentHash: "hash-1",
      updatedAt: "2026-07-19T12:00:00.000Z",
      deletedAt: null
    }],
    modules: [{
      id: moduleId,
      courseId,
      contractKey: "module-1",
      title: "Módulo",
      position: 0,
      updatedAt: "2026-07-19T12:00:00.000Z",
      deletedAt: null
    }],
    lessons: lessonId ? [{
      id: lessonId,
      courseId,
      moduleId,
      contractKey: "lesson-1",
      title: "Lição",
      position: 0,
      updatedAt: "2026-07-19T12:00:00.000Z",
      deletedAt: null
    }] : [],
    cards: cardId ? [{
      id: cardId,
      courseId,
      lessonId,
      contractKey: "card-1",
      type: "content",
      position: 0,
      updatedAt: "2026-07-19T12:00:00.000Z",
      deletedAt: null
    }] : []
  };
}

function selection({
  id = uuid(20),
  userId = USER_A,
  courseId = uuid(10),
  publicationSeq = 1,
  contentHash = "hash-1",
  courseOrigin = "catalog"
} = {}) {
  return {
    id,
    userId,
    courseId,
    courseOrigin,
    publicationSeq,
    contentHash,
    selectedAt: "2026-07-19T12:00:00.000Z",
    updatedAt: "2026-07-19T12:00:00.000Z",
    deletedAt: null
  };
}

function progress({
  id = uuid(30),
  userId = USER_A,
  selectionId = uuid(20),
  courseId = uuid(10),
  lessonId = uuid(31),
  cursor = 0
} = {}) {
  return {
    id,
    userId,
    selectionId,
    courseId,
    lessonId,
    cursor,
    updatedAt: "2026-07-19T12:01:00.000Z",
    deletedAt: null
  };
}

function outbox({
  mutationId = uuid(40),
  sequence,
  status = "pending",
  entityType = "lessonProgress",
  entityId = uuid(30),
  courseId = uuid(10),
  previousRow = null,
  payload = { cursor: 0 }
} = {}) {
  return {
    mutationId,
    ...(sequence === undefined ? {} : { sequence }),
    status,
    entityType,
    entityId,
    courseId,
    operation: "upsert",
    changedFields: ["cursor"],
    previousRow,
    payload,
    attemptCount: 0,
    createdAt: "2026-07-19T12:02:00.000Z",
    updatedAt: "2026-07-19T12:02:00.000Z"
  };
}

async function openUserStore(indexedDb = new IDBFactory(), userId = USER_A) {
  const store = await IndexedDbRelationalStore.open(indexedDb, { userId });
  await store.bindReplicaToUser(userId);
  return store;
}

test("o corte abre exclusivamente o IndexedDB relacional v2 por UUID", async (context) => {
  const indexedDb = new IDBFactory();
  const legacyRequest = indexedDb.open("aralearn-relational-v1", 1);
  await new Promise((resolve, reject) => {
    legacyRequest.addEventListener("upgradeneeded", () => {
      legacyRequest.result.createObjectStore("documents").put({ inteiro: true }, "project");
    });
    legacyRequest.addEventListener("success", resolve, { once: true });
    legacyRequest.addEventListener("error", () => reject(legacyRequest.error), { once: true });
  });
  legacyRequest.result.close();

  const store = await openUserStore(indexedDb);
  context.after(() => store.close());

  assert.equal(RELATIONAL_DATABASE_NAME, "aralearn-relational-v4");
  assert.equal(RELATIONAL_DATABASE_VERSION, 1);
  assert.equal(store.name, `${RELATIONAL_DATABASE_NAME}:user:${USER_A}`);
  assert.equal(store.version, RELATIONAL_DATABASE_VERSION);
  assert.equal(await store.getSyncState("replica.userId"), USER_A);
  assert.ok(!store.objectStoreNames.includes("documents"));
  assert.ok(!store.objectStoreNames.includes("memberships"));
  assert.ok(!store.objectStoreNames.includes("conflicts"));
});

test("as stores separam cache oficial, estado pessoal, outbox e cursor com índices úteis", async (context) => {
  const store = await openUserStore();
  context.after(() => store.close());

  for (const storeName of [
    "courses", "modules", "lessons", "microsequences", "cards", "blocks", "options",
    "courseSelections", "lessonProgress", "cardProgress", "comments", "studyPaths",
    "studyPathCourses", "outbox", "syncState"
  ]) {
    assert.ok(store.objectStoreNames.includes(storeName), `store ausente: ${storeName}`);
  }
  assert.deepEqual(
    SYNCED_PERSONAL_STORE_NAMES,
    ["courseSelections", "lessonProgress", "cardProgress", "comments", "studyPaths", "studyPathCourses"]
  );
  assert.ok(OFFICIAL_COURSE_STORE_NAMES.includes("courses"));
  assert.ok(OFFICIAL_COURSE_STORE_NAMES.includes("flowNodes"));
  assert.ok(RELATIONAL_STORE_DEFINITIONS.courseSelections.indexes.some(({ name }) => name === "byCourseAndUser"));
  assert.ok(RELATIONAL_STORE_DEFINITIONS.lessonProgress.indexes.some(({ name }) => name === "byUserAndLesson"));
  assert.ok(RELATIONAL_STORE_DEFINITIONS.outbox.indexes.some(({ name }) => name === "byStatusCreatedAt"));
  assert.ok(RELATIONAL_STORE_DEFINITIONS.blocks.indexes.some(({ name }) => name === "byCardRegionPosition"));
});

test("cada conta usa um banco físico persistente sem visibilidade cruzada", async () => {
  const indexedDb = new IDBFactory();
  const courseId = uuid(100);
  const rowA = progress({ id: uuid(101), userId: USER_A, courseId });

  const storeA = await openUserStore(indexedDb, USER_A);
  await storeA.put("lessonProgress", rowA);
  await storeA.put("outbox", outbox({ entityId: rowA.id, courseId }));
  storeA.close();

  const storeB = await openUserStore(indexedDb, USER_B);
  assert.equal(storeB.name, relationalDatabaseNameForUser(USER_B));
  assert.deepEqual(await storeB.getAll("lessonProgress"), []);
  assert.deepEqual(await storeB.getAll("outbox"), []);
  await storeB.put("lessonProgress", progress({ id: uuid(102), userId: USER_B, courseId }));
  storeB.close();

  const returnedA = await openUserStore(indexedDb, USER_A);
  assert.deepEqual(await returnedA.get("lessonProgress", rowA.id), rowA);
  assert.equal((await returnedA.getAll("outbox")).length, 1);
  assert.equal(await returnedA.get("lessonProgress", uuid(102)), undefined);
  returnedA.close();
});

test("substituição externa da conexão IndexedDB é sinalizada antes de uma nova transação", async () => {
  const indexedDb = new IDBFactory();
  const store = await openUserStore(indexedDb);
  const invalidations = [];
  store.onConnectionInvalidated((error) => invalidations.push(error));

  await IndexedDbRelationalStore.deleteDatabase(indexedDb, { userId: USER_A });

  assert.equal(invalidations.length, 1);
  assert.equal(invalidations[0].code, "indexeddb_connection_replaced");
  await assert.rejects(
    store.getAll("courseSelections"),
    /conexão local foi substituída/u
  );

  const reopened = await openUserStore(indexedDb);
  assert.equal(await reopened.getSyncState("replica.userId"), USER_A);
  reopened.close();
});

test("uma RelationalTransaction confirma tudo ou reverte tudo", async (context) => {
  const store = await openUserStore();
  context.after(() => store.close());
  const selected = selection();
  const lesson = progress();

  await store.transaction(["courseSelections", "lessonProgress"], "readwrite", async (transaction) => {
    await transaction.put("courseSelections", selected);
    await transaction.put("lessonProgress", lesson);
  });
  assert.deepEqual(await store.get("courseSelections", selected.id), selected);
  assert.deepEqual(await store.get("lessonProgress", lesson.id), lesson);

  await assert.rejects(
    store.transaction(["courseSelections", "lessonProgress"], "readwrite", async (transaction) => {
      await transaction.put("courseSelections", selection({ id: uuid(111) }));
      await transaction.put("lessonProgress", progress({ id: uuid(112) }));
      throw new Error("abortar lote");
    }),
    /abortar lote/u
  );
  assert.equal(await store.get("courseSelections", uuid(111)), undefined);
  assert.equal(await store.get("lessonProgress", uuid(112)), undefined);
});

test("o cache oficial é substituído atomicamente sem tocar em outro curso", async (context) => {
  const store = await openUserStore();
  context.after(() => store.close());
  const courseId = uuid(10);
  const personal = progress({ courseId: uuid(999) });
  await store.put("lessonProgress", personal);

  const first = await store.replaceOfficialCourseReplica(courseId, graph(courseId), {
    publicationSeq: 1,
    contentHash: "hash-1",
    validate: false
  });
  assert.equal(first.rowCount, 2);
  assert.equal((await store.get("courses", courseId)).title, "Curso oficial");
  assert.equal((await store.getOfficialCourseReplicaState(courseId)).contentHash, "hash-1");

  await store.replaceOfficialCourseReplica(courseId, graph(courseId, {
    title: "Curso oficial atualizado",
    moduleId: uuid(12)
  }), {
    publicationSeq: 2,
    contentHash: "hash-2",
    validate: false
  });
  assert.equal((await store.get("courses", courseId)).title, "Curso oficial atualizado");
  assert.equal(await store.get("modules", uuid(11)), undefined);
  assert.equal((await store.get("modules", uuid(12))).courseId, courseId);
  assert.deepEqual(await store.get("lessonProgress", personal.id), personal);
  assert.deepEqual(await store.getOfficialCourseReplicaState(courseId), {
    publicationSeq: 2,
    contentHash: "hash-2"
  });
});

test("nova revisão remota não apaga uma área de trabalho autoral local", async (context) => {
  const store = await openUserStore();
  context.after(() => store.close());
  const courseId = uuid(10);
  await store.replaceOfficialCourseReplica(courseId, graph(courseId), {
    publicationSeq: 1,
    contentHash: "hash-1",
    validate: false
  });
  const authoringStateId = localCourseAuthoringStateId(courseId);
  await store.putSyncState(authoringStateId, {
    status: "dirty",
    revision: uuid(291),
    basePublicationSeq: 1,
    baseContentHash: "hash-1",
    createdAt: "2026-07-19T12:00:00.000Z",
    updatedAt: "2026-07-19T12:00:00.000Z"
  });

  await assert.rejects(
    store.replaceOfficialCourseReplica(courseId, graph(courseId, {
      title: "Publicação concorrente"
    }), {
      publicationSeq: 2,
      contentHash: "hash-2",
      validate: false
    }),
    (error) => error?.catalogReplicaReconciliationRequired === true &&
      error.mutationIds.includes(authoringStateId)
  );

  assert.equal((await store.get("courses", courseId)).title, "Curso oficial");
  assert.equal((await store.getLocalCourseDraft(courseId)).status, "dirty");
  assert.equal((await store.getOfficialCourseReplicaState(courseId)).contentHash, "hash-1");
});

test("descarte explícito restaura a réplica e encerra o bloqueio do localDraft", async (context) => {
  const store = await openUserStore();
  context.after(() => store.close());
  const courseId = uuid(10);
  const localDraftId = localCourseAuthoringStateId(courseId);
  const initialHash = "a".repeat(64);
  const restoredHash = "b".repeat(64);
  await store.replaceOfficialCourseReplica(courseId, graph(courseId), {
    publicationSeq: 1,
    contentHash: initialHash,
    validate: false
  });
  const selected = selection({
    courseId,
    publicationSeq: 2,
    contentHash: restoredHash
  });
  await store.put("courseSelections", selected);
  await store.put("courses", {
    ...(await store.get("courses", courseId)),
    title: "Edição exclusivamente local"
  });
  await store.put("syncState", {
    id: localDraftId,
    key: localDraftId,
    courseId,
    value: {
      status: "dirty",
      revision: uuid(303),
      basePublicationSeq: 1,
      baseContentHash: initialHash,
      createdAt: "2026-07-19T12:10:00.000Z",
      updatedAt: "2026-07-19T12:12:00.000Z"
    },
    updatedAt: "2026-07-19T12:12:00.000Z"
  });

  const draft = await store.getLocalCourseDraft(courseId);
  assert.deepEqual(draft, {
    courseId,
    status: "dirty",
    revision: uuid(303),
    basePublicationSeq: 1,
    baseContentHash: initialHash,
    createdAt: "2026-07-19T12:10:00.000Z",
    updatedAt: "2026-07-19T12:12:00.000Z"
  });

  const result = await store.discardLocalCourseDraft(
    courseId,
    graph(courseId, { title: "Publicação restaurada" }),
    {
      expectedRevision: draft.revision,
      expectedSelectionId: selected.id,
      expectedPublicationSeq: selected.publicationSeq,
      expectedContentHash: selected.contentHash,
      expectedCourseOrigin: selected.courseOrigin,
      receivedAt: "2026-07-19T12:15:00.000Z",
      validate: false
    }
  );

  assert.equal(result.status, "restored");
  assert.deepEqual(result.discardedDraft, draft);
  assert.equal((await store.get("courses", courseId)).title, "Publicação restaurada");
  assert.equal(await store.getLocalCourseDraft(courseId), null);
  assert.deepEqual(await store.getOfficialCourseReplicaState(courseId), {
    publicationSeq: 2,
    contentHash: restoredHash
  });
  assert.deepEqual(await store.getAll("outbox"), []);

  await store.replaceOfficialCourseReplica(
    courseId,
    graph(courseId, { title: "Publicação seguinte" }),
    {
      publicationSeq: 3,
      contentHash: "hash-3",
      validate: false
    }
  );
  assert.equal((await store.get("courses", courseId)).title, "Publicação seguinte");
  await assert.rejects(
    store.discardLocalCourseDraft(courseId, graph(courseId), {
      expectedRevision: draft.revision,
      expectedSelectionId: selected.id,
      expectedPublicationSeq: selected.publicationSeq,
      expectedContentHash: selected.contentHash,
      expectedCourseOrigin: selected.courseOrigin,
      validate: false
    }),
    LocalCourseDraftNotFoundError
  );
});

test("CAS do localDraft preserva integralmente uma edição concorrente", async (context) => {
  const store = await openUserStore();
  context.after(() => store.close());
  const courseId = uuid(10);
  const localDraftId = localCourseAuthoringStateId(courseId);
  const initialHash = "a".repeat(64);
  const restoredHash = "b".repeat(64);
  await store.replaceOfficialCourseReplica(courseId, graph(courseId), {
    publicationSeq: 1,
    contentHash: initialHash,
    validate: false
  });
  const selected = selection({
    courseId,
    publicationSeq: 2,
    contentHash: restoredHash
  });
  await store.put("courseSelections", selected);
  await store.put("courses", {
    ...(await store.get("courses", courseId)),
    title: "Edição concorrente preservada"
  });
  await store.put("syncState", {
    id: localDraftId,
    key: localDraftId,
    courseId,
    value: {
      status: "dirty",
      revision: uuid(404),
      basePublicationSeq: 1,
      baseContentHash: initialHash,
      createdAt: "2026-07-19T12:10:00.000Z",
      updatedAt: "2026-07-19T12:14:00.000Z"
    },
    updatedAt: "2026-07-19T12:14:00.000Z"
  });

  await assert.rejects(
    store.discardLocalCourseDraft(
      courseId,
      graph(courseId, { title: "Não pode substituir" }),
      {
        expectedRevision: uuid(403),
        expectedSelectionId: selected.id,
        expectedPublicationSeq: selected.publicationSeq,
        expectedContentHash: selected.contentHash,
        expectedCourseOrigin: selected.courseOrigin,
        validate: false
      }
    ),
    (error) => error instanceof LocalCourseDraftChangedError &&
      error.expectedRevision === uuid(403) &&
      error.actualRevision === uuid(404)
  );

  assert.equal((await store.get("courses", courseId)).title, "Edição concorrente preservada");
  assert.equal((await store.getLocalCourseDraft(courseId)).revision, uuid(404));
  assert.deepEqual(await store.getOfficialCourseReplicaState(courseId), {
    publicationSeq: 1,
    contentHash: initialHash
  });
  assert.deepEqual(await store.getAll("outbox"), []);
});

test("grafo remoto inválido é rejeitado antes de substituir o cache válido", async (context) => {
  const store = await openUserStore();
  context.after(() => store.close());
  const validGraph = officialGraphFromDocument(minimalProjectFixture);
  const courseId = validGraph.courses[0].id;
  await store.replaceOfficialCourseReplica(courseId, validGraph, {
    publicationSeq: 1,
    contentHash: "a".repeat(64)
  });

  const invalidGraph = structuredClone(validGraph);
  invalidGraph.courses[0].title = "Título que não pode vazar";
  invalidGraph.guideItems[0].guideId = uuid(999);
  await assert.rejects(
    store.replaceOfficialCourseReplica(courseId, invalidGraph, {
      publicationSeq: 2,
      contentHash: "b".repeat(64)
    }),
    /Curso relacional inválido/u
  );

  assert.equal((await store.get("courses", courseId)).title, "Fixture Minimal");
  assert.deepEqual(await store.getOfficialCourseReplicaState(courseId), {
    publicationSeq: 1,
    contentHash: "a".repeat(64)
  });
});

test("nova publicação preserva outbox órfã até confirmação explícita", async (context) => {
  const store = await openUserStore();
  context.after(() => store.close());
  const courseId = uuid(10);
  const lessonId = uuid(31);
  const keptCardId = uuid(32);
  const removedCardId = uuid(33);
  const lessonRow = progress({ courseId, lessonId });
  const keptProgress = {
    id: uuid(34), userId: USER_A, courseId, lessonId, cardId: keptCardId,
    completedAt: "2026-07-19T12:01:00.000Z", updatedAt: "2026-07-19T12:01:00.000Z"
  };
  const removedProgress = {
    ...keptProgress, id: uuid(35), cardId: removedCardId
  };
  const removedComment = {
    id: uuid(36), userId: USER_A, courseId, cardId: removedCardId,
    body: "Comentário", updatedAt: "2026-07-19T12:01:00.000Z"
  };
  const graphWith = (cardIds, includeLesson = true) => ({
    ...graph(courseId),
    lessons: includeLesson ? [{
      id: lessonId, courseId, moduleId: uuid(11), contractKey: "lesson-1", position: 0
    }] : [],
    cards: cardIds.map((cardId, position) => ({
      id: cardId, courseId, lessonId, microsequenceId: uuid(37),
      contractKey: `card-${position}`, position
    }))
  });

  await store.replaceOfficialCourseReplica(courseId, graphWith([keptCardId, removedCardId]), {
    publicationSeq: 1,
    contentHash: "hash-1",
    validate: false
  });
  await store.putMany("lessonProgress", [lessonRow]);
  await store.putMany("cardProgress", [keptProgress, removedProgress]);
  await store.put("comments", removedComment);
  await store.put("outbox", outbox({
    mutationId: uuid(41), entityType: "cardProgress", entityId: keptProgress.id,
    courseId, payload: { cardId: keptCardId }
  }));
  await store.put("outbox", outbox({
    mutationId: uuid(42), entityType: "comments", entityId: removedComment.id,
    courseId, payload: { cardId: removedCardId, body: "Comentário" }
  }));

  await assert.rejects(
    store.replaceOfficialCourseReplica(courseId, graphWith([keptCardId]), {
      publicationSeq: 2,
      contentHash: "hash-2",
      validate: false
    }),
    (error) => error?.catalogReplicaReconciliationRequired === true &&
      error.mutationIds.includes(uuid(42))
  );

  assert.deepEqual(await store.get("cardProgress", removedProgress.id), removedProgress);
  assert.deepEqual(await store.get("comments", removedComment.id), removedComment);
  assert.ok(await store.get("outbox", uuid(42)));
  assert.equal((await store.getOfficialCourseReplicaState(courseId)).contentHash, "hash-1");

  await store.acknowledgeOutbox([uuid(41), uuid(42)]);
  await store.replaceOfficialCourseReplica(courseId, graphWith([keptCardId]), {
    publicationSeq: 2,
    contentHash: "hash-2",
    validate: false
  });

  assert.deepEqual(await store.get("lessonProgress", lessonRow.id), lessonRow);
  assert.deepEqual(await store.get("cardProgress", keptProgress.id), keptProgress);
  assert.equal(await store.get("cardProgress", removedProgress.id), undefined);
  assert.equal(await store.get("comments", removedComment.id), undefined);
  assert.equal(await store.get("outbox", uuid(41)), undefined);
  assert.equal(await store.get("outbox", uuid(42)), undefined);

  await store.put("outbox", outbox({
    mutationId: uuid(41), entityType: "cardProgress", entityId: keptProgress.id,
    courseId, payload: { cardId: keptCardId }
  }));

  await assert.rejects(
    store.replaceOfficialCourseReplica(courseId, graphWith([], false), {
      publicationSeq: 3,
      contentHash: "hash-3",
      validate: false
    }),
    (error) => error?.catalogReplicaReconciliationRequired === true &&
      error.mutationIds.includes(uuid(41))
  );
  assert.deepEqual(await store.get("lessonProgress", lessonRow.id), lessonRow);
  assert.deepEqual(await store.get("cardProgress", keptProgress.id), keptProgress);
  await store.acknowledgeOutbox([uuid(41)]);
  await store.replaceOfficialCourseReplica(courseId, graphWith([], false), {
    publicationSeq: 3,
    contentHash: "hash-3",
    validate: false
  });
  assert.equal(await store.get("lessonProgress", lessonRow.id), undefined);
  assert.equal(await store.get("cardProgress", keptProgress.id), undefined);
  assert.equal(await store.get("outbox", uuid(41)), undefined);
});

test("bootstrap grava apenas estado pessoal, manifesto e high-water na mesma transação", async (context) => {
  const store = await openUserStore();
  context.after(() => store.close());
  const courseId = uuid(10);
  const selected = selection({ courseId });
  const lesson = progress({ courseId, selectionId: selected.id });

  const result = await store.applyReplicaBootstrap({
    snapshot: { courseSelections: [selected], lessonProgress: [lesson] },
    selectedCourses: [{ courseId, publicationSeq: 7, contentHash: "hash-7" }],
    highWaterSequence: 451,
    deviceId: "device-a",
    syncStateId: "sync.cursor:device-a"
  });

  assert.equal(result.status, "applied");
  assert.equal(result.highWaterSequence, 451);
  assert.equal(result.rowCount, 2);
  assert.deepEqual(await store.get("courseSelections", selected.id), selected);
  assert.deepEqual(await store.get("lessonProgress", lesson.id), lesson);
  assert.deepEqual(await store.getAll("courses"), [], "bootstrap não transporta árvore didática");
  assert.equal((await store.get("syncState", "sync.cursor:device-a")).cursor, 451);
  assert.deepEqual(await store.getSyncState("catalog.selectedManifest"), [{
    courseId,
    publicationSeq: 7,
    contentHash: "hash-7"
  }]);
});

test("manifesto vazio do bootstrap é autoritativo e não ressuscita seleção retirada", async (context) => {
  const store = await openUserStore();
  context.after(() => store.close());
  const removedSelection = selection();
  const removedProgress = progress({ selectionId: removedSelection.id });

  const result = await store.applyReplicaBootstrap({
    snapshot: {
      courseSelections: [removedSelection],
      lessonProgress: [removedProgress]
    },
    selectedCourses: [],
    highWaterSequence: 500,
    deviceId: "device-empty-manifest",
    syncStateId: "sync.cursor:device-empty-manifest"
  });

  assert.equal(result.status, "applied");
  assert.deepEqual(result.selectedCourses, []);
  assert.deepEqual(await store.getAll("courseSelections"), []);
  assert.deepEqual(await store.getAll("lessonProgress"), []);
  assert.equal((await store.get("syncState", "sync.cursor:device-empty-manifest")).cursor, 500);
});

test("bootstrap não substitui estado quando existe mutação pendente ou rejeitada", async (context) => {
  for (const [index, status] of ["pending", "rejected"].entries()) {
    await context.test(status, async () => {
      const store = await openUserStore(new IDBFactory(), index ? USER_B : USER_A);
      const current = progress({
        id: uuid(120 + index),
        userId: index ? USER_B : USER_A,
        cursor: 8
      });
      await store.put("lessonProgress", current);
      await store.put("outbox", outbox({
        mutationId: uuid(130 + index),
        status,
        entityId: current.id,
        courseId: current.courseId,
        payload: current
      }));

      const result = await store.applyReplicaBootstrap({
        snapshot: { lessonProgress: [{ ...current, cursor: 0 }] },
        selectedCourses: [],
        highWaterSequence: 99,
        deviceId: "device-blocked",
        syncStateId: "sync.cursor:device-blocked"
      });
      assert.equal(result.status, "local_changes_pending");
      assert.equal((await store.get("lessonProgress", current.id)).cursor, 8);
      assert.equal(await store.get("syncState", "sync.cursor:device-blocked"), undefined);
      store.close();
    });
  }
});

test("remoção remota da seleção limpa árvore e estado daquele curso sem afetar outro", async (context) => {
  const store = await openUserStore();
  context.after(() => store.close());
  const courseA = uuid(201);
  const courseB = uuid(202);
  const selectionA = selection({ id: uuid(203), courseId: courseA });
  const selectionB = selection({ id: uuid(204), courseId: courseB });
  const lessonA = uuid(213);
  const lessonB = uuid(214);
  const cardA = uuid(208);
  const progressA = progress({
    id: uuid(205), selectionId: selectionA.id, courseId: courseA, lessonId: lessonA
  });
  const progressB = progress({
    id: uuid(206), selectionId: selectionB.id, courseId: courseB, lessonId: lessonB
  });
  const commentA = {
    id: uuid(207), userId: USER_A, selectionId: selectionA.id, courseId: courseA,
    cardId: cardA, body: "anotação", updatedAt: "2026-07-19T12:00:00.000Z", deletedAt: null
  };
  const pathCourseA = {
    id: uuid(209), ownerId: USER_A, pathId: uuid(210), selectionId: selectionA.id,
    courseId: courseA, position: 0, updatedAt: "2026-07-19T12:00:00.000Z", deletedAt: null
  };
  await store.putMany("courseSelections", [selectionA, selectionB]);
  await store.putMany("lessonProgress", [progressA, progressB]);
  await store.put("comments", commentA);
  await store.put("studyPathCourses", pathCourseA);
  await store.replaceOfficialCourseReplica(courseA, graph(courseA, {
    moduleId: uuid(211), lessonId: lessonA, cardId: cardA
  }), { validate: false });
  await store.replaceOfficialCourseReplica(courseB, graph(courseB, {
    moduleId: uuid(212), lessonId: lessonB
  }), { validate: false });

  const result = await store.applyRemotePage({
    changes: [{
      storeName: "courseSelections",
      entityId: selectionA.id,
      courseId: courseA,
      operation: "delete",
      row: { ...selectionA, deletedAt: "2026-07-19T13:00:00.000Z" }
    }],
    cursor: 77,
    deviceId: "device-a",
    syncStateId: "sync.cursor:device-a"
  });

  assert.equal(result.applied.length, 1);
  assert.equal(await store.get("courseSelections", selectionA.id), undefined);
  assert.equal(await store.get("courses", courseA), undefined);
  assert.equal(await store.get("modules", uuid(211)), undefined);
  assert.equal(await store.get("lessonProgress", progressA.id), undefined);
  assert.equal(await store.get("comments", commentA.id), undefined);
  assert.equal(await store.get("studyPathCourses", pathCourseA.id), undefined);
  assert.ok(await store.get("courses", courseB));
  assert.deepEqual(await store.get("lessonProgress", progressB.id), progressB);
  assert.equal((await store.get("syncState", "sync.cursor:device-a")).cursor, 77);
});

test("retirada remota oculta o curso mas preserva alteração rejeitada até descarte explícito", async (context) => {
  const store = await openUserStore();
  context.after(() => store.close());
  const courseId = uuid(230);
  const selected = selection({ id: uuid(231), courseId });
  const localProgress = progress({
    id: uuid(232),
    selectionId: selected.id,
    courseId,
    lessonId: uuid(233)
  });
  const rejected = outbox({
    mutationId: uuid(234),
    status: "rejected",
    entityId: localProgress.id,
    courseId,
    payload: localProgress
  });
  await store.replaceOfficialCourseReplica(
    courseId,
    graph(courseId, { moduleId: uuid(235), lessonId: localProgress.lessonId }),
    { validate: false }
  );
  await store.put("courseSelections", selected);
  await store.put("lessonProgress", localProgress);
  await store.put("outbox", rejected);

  await store.applyRemotePage({
    changes: [{
      storeName: "courseSelections",
      entityId: selected.id,
      courseId,
      operation: "delete"
    }],
    cursor: 90,
    deviceId: "device-revoked",
    syncStateId: "sync.cursor:device-revoked"
  });

  assert.equal(await store.get("courseSelections", selected.id), undefined);
  assert.ok(await store.get("courses", courseId));
  assert.deepEqual(await store.get("lessonProgress", localProgress.id), localProgress);
  assert.equal((await store.get("outbox", rejected.mutationId)).status, "rejected");
  assert.deepEqual(await store.getSyncState(`catalog.removalPending:${courseId}`), {
    mutationIds: [rejected.mutationId]
  });

  await store.discardRejectedMutation(rejected.mutationId);
  assert.deepEqual(await store.pruneOfficialCourseReplicas([]), [courseId]);
  assert.equal(await store.get("courses", courseId), undefined);
  assert.equal(await store.get("lessonProgress", localProgress.id), undefined);
  assert.equal(await store.getSyncState(`catalog.removalPending:${courseId}`), null);
});

test("retirada remota nunca apaga localDraft sem confirmação explícita", async (context) => {
  const store = await openUserStore();
  context.after(() => store.close());
  const courseId = uuid(240);
  const selected = selection({
    id: uuid(241),
    courseId,
    contentHash: "a".repeat(64)
  });
  await store.replaceOfficialCourseReplica(
    courseId,
    graph(courseId, { moduleId: uuid(242) }),
    { publicationSeq: 1, contentHash: selected.contentHash, validate: false }
  );
  await store.put("courseSelections", selected);
  await store.put("courses", {
    ...(await store.get("courses", courseId)),
    title: "Rascunho a preservar"
  });
  const localDraftId = localCourseAuthoringStateId(courseId);
  const draftRevision = uuid(243);
  await store.putSyncState(localDraftId, {
    status: "dirty",
    revision: draftRevision,
    basePublicationSeq: 1,
    baseContentHash: selected.contentHash,
    createdAt: "2026-07-19T13:00:00.000Z",
    updatedAt: "2026-07-19T13:00:00.000Z"
  });

  await store.applyRemotePage({
    changes: [{
      storeName: "courseSelections",
      entityId: selected.id,
      courseId,
      operation: "delete"
    }],
    cursor: 91,
    deviceId: "device-local-draft",
    syncStateId: "sync.cursor:device-local-draft"
  });

  assert.equal(await store.get("courseSelections", selected.id), undefined);
  assert.equal((await store.get("courses", courseId)).title, "Rascunho a preservar");
  assert.equal((await store.getLocalCourseDraft(courseId)).revision, draftRevision);
  assert.deepEqual(await store.getSyncState(`catalog.removalPending:${courseId}`), {
    mutationIds: [localDraftId],
    localDraftRevision: draftRevision
  });
  assert.deepEqual(await store.pruneOfficialCourseReplicas([]), []);
  assert.equal((await store.getLocalCourseDraft(courseId)).revision, draftRevision);

  await store.removeOfficialCourseReplica(courseId, {
    removePersonalState: true,
    removeSelection: true
  });
  assert.equal(await store.get("courses", courseId), undefined);
  assert.equal(await store.getLocalCourseDraft(courseId), null);
});

test("delete e nova seleção na mesma página respeitam a ordem causal", async (context) => {
  const store = await openUserStore();
  context.after(() => store.close());
  const courseId = uuid(220);
  const previousSelection = selection({ id: uuid(221), courseId });
  const nextSelection = selection({ id: uuid(222), courseId, publicationSeq: 2 });
  const nextProgress = progress({
    id: uuid(223),
    selectionId: nextSelection.id,
    courseId,
    cursor: 2
  });
  await store.put("courseSelections", previousSelection);
  await store.put("lessonProgress", progress({
    id: uuid(224),
    selectionId: previousSelection.id,
    courseId
  }));
  await store.replaceOfficialCourseReplica(
    courseId,
    graph(courseId, { moduleId: uuid(225) }),
    { validate: false }
  );

  await store.applyRemotePage({
    changes: [
      {
        storeName: "courseSelections",
        entityId: previousSelection.id,
        courseId,
        operation: "delete"
      },
      {
        storeName: "courseSelections",
        entityId: nextSelection.id,
        courseId,
        operation: "upsert",
        row: nextSelection
      },
      {
        storeName: "lessonProgress",
        entityId: nextProgress.id,
        courseId,
        operation: "upsert",
        row: nextProgress
      }
    ],
    cursor: 81,
    deviceId: "device-a",
    syncStateId: "sync.cursor:device-a"
  });

  assert.equal(await store.get("courseSelections", previousSelection.id), undefined);
  assert.deepEqual(await store.get("courseSelections", nextSelection.id), nextSelection);
  assert.deepEqual(await store.get("lessonProgress", nextProgress.id), nextProgress);
  assert.equal(await store.get("courses", courseId), undefined);
  assert.equal((await store.get("syncState", "sync.cursor:device-a")).cursor, 81);
});

test("a outbox usa sequence causal mesmo quando UUIDs ordenam ao contrário", async (context) => {
  const store = await openUserStore();
  context.after(() => store.close());
  const firstCreated = outbox({
    mutationId: "f0000000-0000-4000-8000-000000000001",
    sequence: 1,
    entityId: uuid(301)
  });
  const secondCreated = outbox({
    mutationId: "10000000-0000-4000-8000-000000000002",
    sequence: 2,
    entityId: uuid(301)
  });
  await store.putMany("outbox", [secondCreated, firstCreated]);

  assert.deepEqual(
    (await store.listPendingOutbox()).map(({ mutationId }) => mutationId),
    [firstCreated.mutationId, secondCreated.mutationId]
  );

  const generatedA = outbox({ mutationId: uuid(302), entityId: uuid(303) });
  const generatedB = outbox({ mutationId: uuid(304), entityId: uuid(304) });
  await store.putMany("outbox", [generatedA, generatedB]);
  const persisted = await store.getAll("outbox");
  assert.ok(persisted.find(({ mutationId }) => mutationId === generatedA.mutationId).sequence > 2);
  assert.ok(
    persisted.find(({ mutationId }) => mutationId === generatedB.mutationId).sequence >
    persisted.find(({ mutationId }) => mutationId === generatedA.mutationId).sequence
  );
});

test("descartar rejeição preserva a linha até o bootstrap autoritativo", async (context) => {
  const store = await openUserStore();
  context.after(() => store.close());
  const before = progress({ cursor: 1 });
  const after = { ...before, cursor: 4, updatedAt: "2026-07-19T13:00:00.000Z" };
  const rejected = outbox({
    status: "rejected",
    sequence: 1,
    entityId: before.id,
    courseId: before.courseId,
    previousRow: before,
    payload: { cursor: 4 }
  });
  const descendant = outbox({
    mutationId: uuid(42),
    sequence: 2,
    entityId: before.id,
    courseId: before.courseId,
    previousRow: after,
    payload: { cursor: 5 }
  });
  await store.put("lessonProgress", after);
  await store.putMany("outbox", [rejected, descendant]);

  const discarded = await store.discardRejectedMutation(rejected.mutationId);
  assert.equal(discarded.status, "rejected");
  assert.equal(discarded.rollbackApplied, false);
  assert.deepEqual(await store.get("lessonProgress", before.id), after);
  assert.equal(await store.get("outbox", rejected.mutationId), undefined);
  assert.ok(await store.get("outbox", descendant.mutationId));
});

test("o feed aplica estado pessoal e conteúdo autoral confirmado", async (context) => {
  const store = await openUserStore();
  context.after(() => store.close());
  const row = progress({ cursor: 0 });

  await store.applyRemotePage({
    changes: [{ storeName: "lessonProgress", entityId: row.id, courseId: row.courseId, row }],
    cursor: 1,
    deviceId: "device-a",
    syncStateId: "sync.cursor:device-a"
  });
  await store.applyRemotePage({
    changes: [{
      storeName: "lessonProgress",
      entityId: row.id,
      courseId: row.courseId,
      row: { ...row, cursor: 3, updatedAt: "2026-07-19T14:00:00.000Z" }
    }],
    cursor: 2,
    deviceId: "device-a",
    syncStateId: "sync.cursor:device-a"
  });
  assert.equal((await store.get("lessonProgress", row.id)).cursor, 3);

  const cardId = uuid(401);
  const remoteCard = {
    id: cardId,
    courseId: row.courseId,
    lessonId: uuid(402),
    microsequenceId: uuid(403),
    contractKey: "card-granular-update",
    identityKey: "course:personal/micro:one/card:card-granular-update",
    position: 0,
    title: "Card pessoal",
    revision: 1,
    updatedAt: "2026-07-19T15:00:00.000Z",
    deletedAt: null
  };
  await store.applyRemotePage({
    changes: [{ storeName: "cards", entityId: cardId, courseId: row.courseId, row: remoteCard }],
    cursor: 3,
    deviceId: "device-a",
    syncStateId: "sync.cursor:device-a"
  });
  assert.deepEqual(await store.get("cards", cardId), remoteCard);
  assert.equal((await store.get("syncState", "sync.cursor:device-a")).cursor, 3);
});

test("upsert histórico sem row vira delete antes de persistir o cursor", async (context) => {
  const store = await openUserStore();
  context.after(() => store.close());
  const row = progress({ id: uuid(410), cursor: 1 });
  await store.put("lessonProgress", row);

  await store.applyRemotePage({
    changes: [{
      storeName: "lessonProgress",
      entityId: row.id,
      courseId: row.courseId,
      operation: "upsert",
      row: null
    }],
    cursor: 12,
    deviceId: "device-a",
    syncStateId: "sync.cursor:device-a"
  });

  assert.equal(await store.get("lessonProgress", row.id), undefined);
  assert.equal((await store.get("syncState", "sync.cursor:device-a")).cursor, 12);
});

test("mudança remota não atropela a mesma entidade enquanto há outbox não resolvida", async (context) => {
  const store = await openUserStore();
  context.after(() => store.close());
  const local = progress({ cursor: 7 });
  const pending = outbox({ entityId: local.id, courseId: local.courseId, payload: { cursor: 7 } });
  await store.put("lessonProgress", local);
  await store.put("outbox", pending);

  const result = await store.applyRemotePage({
    changes: [{
      storeName: "lessonProgress",
      entityId: local.id,
      courseId: local.courseId,
      row: { ...local, cursor: 2 }
    }],
    cursor: 9,
    deviceId: "device-a",
    syncStateId: "sync.cursor:device-a"
  });
  assert.deepEqual(result.applied, []);
  assert.deepEqual(result.skipped, [`lessonProgress:${local.id}`]);
  assert.equal((await store.get("lessonProgress", local.id)).cursor, 7);
  assert.equal((await store.get("syncState", "sync.cursor:device-a")).cursor, 9);
});
