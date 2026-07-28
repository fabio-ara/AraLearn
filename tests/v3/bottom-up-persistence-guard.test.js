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

  assert.deepEqual(await store.getAll("outbox"), []);
  const saved = repository.loadProject()
    .courses[0].modules[0].lessons[0].microsequences[0];
  assert.equal(saved.status, "generated");
  assert.equal(saved.cards[0].text, "Texto alterado pela intervenção local.");
  assert.equal(repository.loadProject().courses[0].title, minimalProjectFixture.courses[0].title);
});

test("aplicar prévia de bloco composto grava somente a linha do bloco alterado", async (context) => {
  const { store, repository } = await openPersonalRepository(new IDBFactory());
  context.after(() => store.close());
  const edited = repository.loadProject();
  const microsequence = edited.courses[0].modules[0].lessons[0].microsequences[0];
  const originalCard = microsequence.cards[0];
  microsequence.cards[0] = {
    id: originalCard.id,
    position: originalCard.position,
    resource: "composite",
    kind: originalCard.kind,
    exercise: originalCard.exercise,
    title: originalCard.title,
    blocks: [
      { kind: "paragraph", value: originalCard.text },
      { kind: "paragraph", value: "Bloco preservado." }
    ],
    after: originalCard.after
  };
  await repository.saveMicrosequenceGeneration(edited, microsequence.id);
  await store.transaction(["outbox"], "readwrite", (transaction) => transaction.clear("outbox"));

  const changed = repository.loadProject();
  const target = changed.courses[0].modules[0].lessons[0].microsequences[0];
  target.cards[0].blocks[0].value = "Somente este bloco mudou.";
  await repository.saveMicrosequenceGeneration(changed, target.id);

  assert.deepEqual(await store.getAll("outbox"), []);
  assert.equal(
    repository.loadProject()
      .courses[0].modules[0].lessons[0].microsequences[0]
      .cards[0].blocks[0].value,
    "Somente este bloco mudou."
  );
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
