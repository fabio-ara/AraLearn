import test from "node:test";
import assert from "node:assert/strict";
import { IDBFactory } from "fake-indexeddb";

import { RelationalProjectRepository } from "../../src/persistence/RelationalProjectRepository.js";
import { IndexedDbRelationalStore } from "../../src/persistence/IndexedDbRelationalStore.js";
import {
  minimalProjectFixture,
  officialGraphFromDocument,
  seedSelectedOfficialCourse,
  TEST_USER_ID
} from "./helpers/leanRelationalFixture.js";

const FIXED_TIME = "2026-07-22T12:00:00.000Z";

async function openPersonalRepository(indexedDb) {
  const store = await IndexedDbRelationalStore.open(indexedDb, { userId: TEST_USER_ID });
  const { course, selection } = await seedSelectedOfficialCourse(store);
  const personalGraph = officialGraphFromDocument(minimalProjectFixture);
  personalGraph.courses[0].kind = "personal";
  personalGraph.courses[0].ownerId = TEST_USER_ID;
  personalGraph.courses[0].sourceCourseId = course.id;
  await store.replaceOfficialCourseReplica(personalGraph.courses[0].id, personalGraph);
  await store.put("courseSelections", {
    ...selection,
    courseId: personalGraph.courses[0].id,
    publicationSeq: 0,
    contentHash: "",
    updatedAt: FIXED_TIME
  });
  const repository = await RelationalProjectRepository.open({
    store,
    userId: TEST_USER_ID,
    clock: () => new Date(FIXED_TIME)
  });
  return { store, repository };
}

test("persistência bottom-up grava status e conteúdo apenas na microssequência alvo", async (context) => {
  const { store, repository } = await openPersonalRepository(new IDBFactory());
  context.after(() => store.close());
  const edited = repository.loadProject();
  const microsequence = edited.courses[0].modules[0].lessons[0].microsequences[0];
  microsequence.status = "generated";
  microsequence.cards[0].text = "Texto alterado pela intervenção local.";

  await repository.saveMicrosequenceGeneration(edited, microsequence.id);

  const outbox = await store.getAll("outbox");
  assert.deepEqual(
    new Set(outbox.map((entry) => entry.entityType)),
    new Set(["microsequences", "blocks"])
  );
  assert.equal(outbox.find((entry) => entry.entityType === "microsequences")?.payload?.status, "generated");
  assert.equal(repository.loadProject().courses[0].title, minimalProjectFixture.courses[0].title);
});

test("persistência bottom-up falha antes do commit se outra entidade também mudou", async (context) => {
  const { store, repository } = await openPersonalRepository(new IDBFactory());
  context.after(() => store.close());
  const edited = repository.loadProject();
  const microsequence = edited.courses[0].modules[0].lessons[0].microsequences[0];
  microsequence.cards[0].text = "Texto local válido.";
  edited.courses[0].title = "Alteração fora do escopo";

  assert.throws(
    () => repository.saveMicrosequenceGeneration(edited, microsequence.id),
    /entidades externas/u
  );
  assert.deepEqual(await store.getAll("outbox"), []);
});

test("primeira intervenção bottom-up cria uma cópia pessoal antes de gravar", async (context) => {
  const store = await IndexedDbRelationalStore.open(new IDBFactory(), { userId: TEST_USER_ID });
  context.after(() => store.close());
  const { course, selection } = await seedSelectedOfficialCourse(store);
  const officialBlocks = await store.getAll("blocks");
  let forkCalls = 0;
  const repository = await RelationalProjectRepository.open({
    store,
    userId: TEST_USER_ID,
    clock: () => new Date(FIXED_TIME),
    forkCourseForEditing: async (sourceCourseId) => {
      forkCalls += 1;
      assert.equal(sourceCourseId, course.id);
      const personalGraph = officialGraphFromDocument(minimalProjectFixture);
      const personalCourse = personalGraph.courses[0];
      personalCourse.kind = "personal";
      personalCourse.ownerId = TEST_USER_ID;
      personalCourse.sourceCourseId = sourceCourseId;
      await store.replaceOfficialCourseReplica(personalCourse.id, personalGraph);
      await store.put("courseSelections", {
        ...selection,
        courseId: personalCourse.id,
        publicationSeq: 0,
        contentHash: "",
        updatedAt: FIXED_TIME
      });
      return { courseId: personalCourse.id };
    }
  });
  const edited = repository.loadProject();
  const microsequence = edited.courses[0].modules[0].lessons[0].microsequences[0];
  microsequence.status = "generated";
  microsequence.cards[0].text = "Primeira intervenção na cópia pessoal.";

  await repository.saveMicrosequenceGeneration(edited, microsequence.id);

  assert.equal(forkCalls, 1);
  const personalCourse = (await store.getAll("courses")).find((row) => row.kind === "personal");
  assert.ok(personalCourse);
  assert.deepEqual(
    new Set((await store.getAll("outbox")).map((entry) => entry.entityType)),
    new Set(["microsequences", "blocks"])
  );
  assert.deepEqual(
    (await store.getAll("blocks")).filter((row) => row.courseId === course.id),
    officialBlocks
  );
});
