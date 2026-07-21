import test from "node:test";
import assert from "node:assert/strict";

import { IDBFactory } from "fake-indexeddb";

import { IndexedDbRelationalStore } from "../../src/persistence/IndexedDbRelationalStore.js";
import { DomainMutationService } from "../../src/persistence/DomainMutationService.js";
import {
  TEST_USER_ID,
  minimalProjectFixture,
  openSelectedCourseRepository,
  seedSelectedOfficialCourse
} from "./helpers/leanRelationalFixture.js";

function uuid(suffix) {
  return `20000000-0000-4000-8000-${String(suffix).padStart(12, "0")}`;
}

function sequentialUuidFactory(first) {
  let next = first;
  return () => uuid(next++);
}

function secondCourseDocument() {
  const document = structuredClone(minimalProjectFixture);
  document.courses[0].id = "course-fixture-secondary";
  document.courses[0].title = "Fixture secundária";
  return document;
}

test("trilhas pessoais mantêm CRUD, ordem causal e estado pequeno completo", async (context) => {
  const indexedDb = new IDBFactory();
  const opened = await openSelectedCourseRepository(indexedDb, { userId: TEST_USER_ID });
  const { store, repository, course: firstCourse } = opened;
  context.after(() => store.close());
  const second = await seedSelectedOfficialCourse(store, {
    userId: TEST_USER_ID,
    document: secondCourseDocument(),
    uuidFactory: sequentialUuidFactory(1000),
    publicationSeq: 2,
    contentHash: "b".repeat(64)
  });
  await repository.refreshFromReplica();
  const projectBefore = repository.loadProject();

  const path = await repository.createStudyPath("Formação");
  const firstItem = await repository.addCourseToStudyPath(path.id, firstCourse.id);
  const secondItem = await repository.addCourseToStudyPath(path.id, second.course.id);
  await repository.flush();
  assert.deepEqual(
    repository.loadStudyPaths()[0].courses.map((item) => item.persistentCourseId),
    [firstCourse.id, second.course.id]
  );
  assert.deepEqual(repository.loadProject(), projectBefore);
  await store.acknowledgeOutbox((await store.getAll("outbox")).map((row) => row.mutationId));

  await repository.renameStudyPath(path.id, "SENAI");
  await repository.flush();
  const [rename] = await store.listPendingOutbox();
  assert.equal(rename.entityType, "studyPaths");
  assert.deepEqual(rename.changedFields, ["position", "title"]);
  assert.deepEqual(rename.payload, { position: 0, title: "SENAI" });
  await store.acknowledgeOutbox([rename.mutationId]);

  await repository.moveCourseInStudyPath(secondItem.id, "up");
  await repository.flush();
  assert.deepEqual(
    repository.loadStudyPaths()[0].courses.map((item) => item.id),
    [secondItem.id, firstItem.id]
  );
  const reorder = await store.listPendingOutbox();
  assert.equal(reorder.length, 2);
  assert.equal(reorder.every((row) => row.entityType === "studyPathCourses"), true);
  assert.equal(
    reorder.every((row) => row.changedFields.join() === "courseId,pathId,position,selectionId"),
    true
  );
  assert.equal(reorder.every((row) =>
    Object.keys(row.payload).sort().join() === "courseId,pathId,position,selectionId"
  ), true);
  assert.ok(reorder[0].sequence < reorder[1].sequence);
  await store.acknowledgeOutbox(reorder.map((row) => row.mutationId));

  await repository.removeCourseFromStudyPath(firstItem.id);
  await repository.deleteStudyPath(path.id);
  await repository.flush();
  assert.deepEqual(repository.loadStudyPaths(), []);
  const deletions = await store.listPendingOutbox();
  assert.equal(deletions.every((row) => row.operation === "delete"), true);
  assert.equal(deletions.some((row) => row.entityType === "studyPaths"), true);
  assert.equal(deletions.some((row) => row.entityType === "studyPathCourses"), true);
  assert.equal(deletions.every((row) => !Object.hasOwn(row.payload, "graph")), true);
});

test("um curso ocupa uma única trilha e conserva identidade ao ser movido", async (context) => {
  const indexedDb = new IDBFactory();
  const { store, repository, course } = await openSelectedCourseRepository(indexedDb, {
    userId: TEST_USER_ID
  });
  context.after(() => store.close());

  const firstPath = await repository.createStudyPath("Primeira");
  const secondPath = await repository.createStudyPath("Segunda");
  await repository.flush();
  await store.acknowledgeOutbox((await store.getAll("outbox")).map((row) => row.mutationId));

  const firstPlacement = await repository.addCourseToStudyPath(firstPath.id, course.id);
  await repository.flush();
  await store.acknowledgeOutbox((await store.getAll("outbox")).map((row) => row.mutationId));

  const secondPlacement = await repository.addCourseToStudyPath(secondPath.id, course.id);
  await repository.flush();

  assert.equal(secondPlacement.id, firstPlacement.id, "o vínculo tem identidade natural estável");
  assert.deepEqual(
    repository.loadStudyPaths().map((path) => path.courses.map((item) => item.persistentCourseId)),
    [[], [course.id]],
    "mover não duplica o mesmo curso em duas trilhas"
  );
  assert.equal((await store.getAll("studyPathCourses")).length, 1);
  const [move] = await store.listPendingOutbox();
  assert.equal(move.entityId, firstPlacement.id);
  assert.equal(move.operation, "update");
  assert.deepEqual(move.changedFields, ["courseId", "pathId", "position", "selectionId"]);
  assert.equal(move.payload.pathId, secondPath.id);
});

test("update de trilha nunca envia identidade local antiga em changedFields", async (context) => {
  const indexedDb = new IDBFactory();
  const store = await IndexedDbRelationalStore.open(indexedDb, { userId: TEST_USER_ID });
  context.after(() => store.close());
  const mutations = new DomainMutationService({
    store,
    clock: () => new Date("2026-07-20T16:00:00.000Z"),
    uuidFactory: sequentialUuidFactory(8100)
  });
  const pathId = uuid(8101);
  const previous = {
    id: pathId,
    title: "Antes",
    position: 0,
    updatedAt: "2026-07-20T15:00:00.000Z"
  };
  await store.put("studyPaths", previous);

  await mutations.applyRowChange("studyPaths", previous, {
    ...previous,
    // Réplicas de uma versão anterior podiam ganhar a propriedade apenas no
    // próximo refresh. Ela é identidade, não é parte do patch remoto.
    ownerId: TEST_USER_ID,
    title: "Depois"
  });

  const [entry] = await store.listPendingOutbox();
  assert.deepEqual(entry.changedFields, ["position", "title"]);
  assert.deepEqual(entry.payload, { position: 0, title: "Depois" });
  assert.ok(!Object.hasOwn(entry.payload, "ownerId"));
});

test("bootstrap materializa apenas seleção e estado pessoal com o mesmo high-water", async (context) => {
  const userId = uuid(2001);
  const deviceId = uuid(2002);
  const courseId = uuid(2003);
  const selectionId = uuid(2004);
  const pathId = uuid(2005);
  const itemId = uuid(2006);
  const store = await IndexedDbRelationalStore.open(new IDBFactory(), { userId });
  context.after(() => store.close());
  const now = "2026-07-20T13:00:00.000Z";

  const result = await store.applyReplicaBootstrap({
    snapshot: {
      courseSelections: [{
        id: selectionId,
        userId,
        courseId,
        position: 0,
        publicationSeq: 7,
        contentHash: "c".repeat(64),
        updatedAt: now
      }],
      lessonProgress: [],
      cardProgress: [],
      comments: [],
      studyPaths: [{
        id: pathId,
        ownerId: userId,
        title: "Mestrado",
        position: 0,
        updatedAt: now
      }],
      studyPathCourses: [{
        id: itemId,
        ownerId: userId,
        pathId,
        courseId,
        position: 0,
        updatedAt: now
      }]
    },
    selectedCourses: [{
      courseId,
      publicationSeq: 7,
      contentHash: "c".repeat(64)
    }],
    highWaterSequence: 91,
    deviceId,
    syncStateId: `sync.cursor:${deviceId}`,
    receivedAt: now
  });

  assert.equal(result.status, "applied");
  assert.equal(result.highWaterSequence, 91);
  assert.equal((await store.get("courseSelections", selectionId)).courseId, courseId);
  assert.equal((await store.get("studyPaths", pathId)).title, "Mestrado");
  assert.equal((await store.get("studyPathCourses", itemId)).courseId, courseId);
  assert.equal((await store.get("syncState", `sync.cursor:${deviceId}`)).cursor, 91);
  assert.deepEqual(await store.getAll("courses"), []);
  assert.deepEqual(await store.getAll("outbox"), []);
});
