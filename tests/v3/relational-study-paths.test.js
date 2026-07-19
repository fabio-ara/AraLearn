import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { IDBFactory } from "fake-indexeddb";

import { IndexedDbRelationalStore } from "../../src/persistence/IndexedDbRelationalStore.js";
import { RelationalProjectRepository } from "../../src/persistence/RelationalProjectRepository.js";
import { SupabaseSyncTransport } from "../../src/sync/RelationalSyncEngine.js";
import { renderHomeScreen } from "../../src/ui/renderHomeScreen.js";

const fixture = JSON.parse(fs.readFileSync(
  new URL("../fixtures/v3/project-minimal.json", import.meta.url),
  "utf8"
));

function uuid(suffix) {
  return `00000000-0000-4000-8000-${String(suffix).padStart(12, "0")}`;
}

test("trilhas são linhas pessoais ordenadas e não alteram o documento AraLearn v3", async (context) => {
  const userId = uuid(801);
  const store = await IndexedDbRelationalStore.open(new IDBFactory(), { userId });
  const repository = new RelationalProjectRepository({
    store,
    userId,
    uuidFactory: (() => {
      let next = 810;
      return () => uuid(next++);
    })()
  });
  context.after(() => store.close());
  await repository.initialize();
  await repository.saveProject(fixture);
  const before = repository.loadProject();
  const courseId = (await store.getAll("courses"))[0].id;

  const path = await repository.createStudyPath("Concurso Dataprev");
  const item = await repository.addCourseToStudyPath(path.id, courseId);

  assert.equal(repository.loadStudyPaths()[0].title, "Concurso Dataprev");
  assert.equal(repository.loadStudyPaths()[0].courses[0].persistentCourseId, courseId);
  assert.deepEqual(repository.loadProject(), before);
  assert.deepEqual(
    (await store.listPendingOutbox())
      .map((entry) => entry.entityType)
      .filter((entityType) => entityType.startsWith("study")),
    ["studyPaths", "studyPathCourses"]
  );

  await repository.renameStudyPath(path.id, "Dataprev 2026");
  assert.equal(repository.loadStudyPaths()[0].title, "Dataprev 2026");
  await repository.removeCourseFromStudyPath(item.id);
  assert.equal(repository.loadStudyPaths()[0].courses.length, 0);
  await repository.deleteStudyPath(path.id);
  assert.deepEqual(repository.loadStudyPaths(), []);
  await repository.flush();
});

test("bootstrap materializa trilhas e high-water na mesma transação local", async (context) => {
  const userId = uuid(820);
  const deviceId = uuid(821);
  const pathId = uuid(822);
  const courseId = uuid(823);
  const itemId = uuid(824);
  const store = await IndexedDbRelationalStore.open(new IDBFactory(), { userId });
  context.after(() => store.close());

  const result = await store.applyReplicaBootstrap({
    snapshot: {
      courses: [{ id: courseId, courseId, ownerId: userId, revision: 1, deletedAt: null }],
      studyPaths: [{ id: pathId, ownerId: userId, title: "Mestrado", position: 0, revision: 1, deletedAt: null }],
      studyPathCourses: [{ id: itemId, ownerId: userId, pathId, courseId, position: 0, revision: 1, deletedAt: null }]
    },
    highWaterSequence: 91,
    deviceId,
    syncStateId: `sync.cursor:${deviceId}`
  });

  assert.equal(result.status, "applied");
  assert.equal((await store.get("studyPaths", pathId)).title, "Mestrado");
  assert.equal((await store.get("studyPathCourses", itemId)).courseId, courseId);
  assert.equal((await store.get("syncState", `sync.cursor:${deviceId}`)).cursor, 91);
});

test("transporte envia trilhas pela RPC idempotente fora do lote de conteúdo", async () => {
  const calls = [];
  const transport = new SupabaseSyncTransport({
    async rpc(name, parameters) {
      calls.push({ name, parameters });
      return {
        status: "applied",
        mutationId: parameters.p_mutation?.mutationId,
        revision: 1
      };
    }
  });
  const mutation = {
    mutationId: uuid(830),
    entityType: "studyPaths",
    entityId: uuid(831),
    courseId: null,
    operation: "upsert",
    baseRevision: 0,
    changedFields: ["ownerId", "title", "description", "position"],
    payload: { id: uuid(831), ownerId: uuid(832), title: "SENAI", description: "", position: 0 }
  };

  const result = await transport.applySyncBatch({ deviceId: uuid(833), mutations: [mutation] });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].name, "apply_study_path_mutation");
  assert.equal(calls[0].parameters.p_mutation.operation, "insert");
  assert.equal(result.results[0].status, "applied");
});

test("home móvel agrupa cursos por trilha sem renomear a unidade curso", () => {
  const courseId = fixture.courses[0].id;
  const markup = renderHomeScreen({
    project: fixture,
    progress: { version: 1, lessons: {} },
    editorSupport: {
      coursePermissionsById: {},
      studyPaths: [{
        id: uuid(840),
        title: "Mestrado",
        courses: [{ id: uuid(841), courseId, position: 0 }]
      }]
    }
  });

  assert.match(markup, />Trilhas</u);
  assert.match(markup, />Mestrado</u);
  assert.match(markup, /data-course-key=/u);
  assert.doesNotMatch(markup, /Disciplina/u);
});

test("revogação aplica também o tombstone da associação de trilha", async (context) => {
  const userId = uuid(850);
  const courseId = uuid(851);
  const membershipId = uuid(852);
  const pathId = uuid(853);
  const itemId = uuid(854);
  const store = await IndexedDbRelationalStore.open(new IDBFactory(), { userId });
  context.after(() => store.close());
  await store.putSyncState("replica.userId", userId);
  await store.put("courses", { id: courseId, courseId, revision: 1, deletedAt: null });
  await store.put("memberships", { id: membershipId, userId, courseId, revision: 1, deletedAt: null });
  await store.put("studyPaths", { id: pathId, ownerId: userId, title: "Graduação", revision: 1, deletedAt: null });
  await store.put("studyPathCourses", {
    id: itemId, ownerId: userId, pathId, courseId, position: 0, revision: 1, deletedAt: null
  });
  const deletedAt = "2026-07-19T15:00:00.000Z";

  await store.applyRemotePage({
    changes: [
      {
        storeName: "memberships", entityId: membershipId, courseId, operation: "delete", revision: 2,
        row: { id: membershipId, userId, courseId, revision: 2, deletedAt }
      },
      {
        storeName: "studyPathCourses", entityId: itemId, courseId, operation: "delete", revision: 2,
        row: { id: itemId, ownerId: userId, pathId, courseId, position: 0, revision: 2, deletedAt }
      }
    ],
    cursor: 100,
    receivedAt: deletedAt
  });

  assert.equal((await store.get("studyPathCourses", itemId)).deletedAt, deletedAt);
});
