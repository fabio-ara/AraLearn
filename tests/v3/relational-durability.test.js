import test from "node:test";
import assert from "node:assert/strict";

import { IDBFactory } from "fake-indexeddb";

import { DomainMutationService } from "../../src/persistence/DomainMutationService.js";
import { IndexedDbRelationalStore } from "../../src/persistence/IndexedDbRelationalStore.js";
import { RelationalProjectRepository } from "../../src/persistence/RelationalProjectRepository.js";
import {
  TEST_USER_ID,
  seedSelectedOfficialCourse
} from "./helpers/leanRelationalFixture.js";

const LESSON_PATH = "course-fixture-minimal::module-fixture-minimal::lesson-fixture-minimal";
const PROGRESS = {
  version: 1,
  lessons: {
    [LESSON_PATH]: {
      cursor: 0,
      completedCardKeys: ["card-fixture-minimal-regra"],
      updatedAt: "2026-07-20T14:00:00.000Z"
    }
  }
};

async function openControlledRepository(indexedDb = new IDBFactory()) {
  const store = await IndexedDbRelationalStore.open(indexedDb, { userId: TEST_USER_ID });
  const seeded = await seedSelectedOfficialCourse(store, { userId: TEST_USER_ID });
  const realService = new DomainMutationService({ store });
  let nextFailure = null;
  let blocked = null;
  const beforeMutation = async () => {
    if (blocked) {
      const pending = blocked;
      blocked = null;
      await pending;
    }
    if (nextFailure) {
      const error = nextFailure;
      nextFailure = null;
      throw error;
    }
  };
  const service = {
    failNext(error = new Error("IndexedDB indisponível")) {
      nextFailure = error;
    },
    blockNext() {
      let release;
      blocked = new Promise((resolve) => { release = resolve; });
      return release;
    },
    async applyMutations(...args) {
      await beforeMutation();
      return realService.applyMutations(...args);
    },
    async applyRowChange(...args) {
      await beforeMutation();
      return realService.applyRowChange(...args);
    }
  };
  const repository = new RelationalProjectRepository({
    store,
    mutationService: service,
    userId: TEST_USER_ID
  });
  await repository.initialize();
  return { indexedDb, store, repository, service, ...seeded };
}

test("progresso, comentário e trilha expõem Promises de commit local real", async (context) => {
  const { store, repository, graph } = await openControlledRepository();
  context.after(() => store.close());
  const progressCommit = repository.saveProgress(PROGRESS);
  assert.ok(progressCommit instanceof Promise);
  await progressCommit;
  const commentCommit = repository.saveComment({
    cardId: graph.cards[0].id,
    courseId: graph.courses[0].id,
    userId: TEST_USER_ID,
    body: "Nota durável"
  });
  const pathCommit = repository.createStudyPath("Graduação");
  assert.ok(commentCommit instanceof Promise);
  assert.ok(pathCommit instanceof Promise);
  await Promise.all([commentCommit, pathCommit, repository.flush()]);

  assert.equal(repository.getDurabilityState().status, "saved");
  assert.equal((await store.getAll("lessonProgress")).length, 1);
  assert.equal((await store.getAll("cardProgress")).length, 1);
  assert.equal((await store.getAll("comments"))[0].body, "Nota durável");
  assert.equal((await store.getAll("studyPaths"))[0].title, "Graduação");
});

test("fila preserva causalidade e não anuncia salvo antes da última transação", async (context) => {
  const { store, repository, service, graph } = await openControlledRepository();
  context.after(() => store.close());
  const release = service.blockNext();

  const first = repository.saveProgress(PROGRESS);
  const second = repository.saveComment({
    cardId: graph.cards[0].id,
    courseId: graph.courses[0].id,
    userId: TEST_USER_ID,
    body: "Segunda operação"
  });
  const third = repository.createStudyPath("Terceira operação");
  assert.equal(repository.getDurabilityState().pendingWrites, 3);
  assert.notEqual(repository.getDurabilityState().status, "saved");

  release();
  await Promise.all([first, second, third, repository.flush()]);
  const outbox = await store.listPendingOutbox();
  assert.deepEqual(
    outbox.map((row) => row.entityType),
    ["lessonProgress", "cardProgress", "comments", "studyPaths"]
  );
  assert.deepEqual(
    outbox.map((row) => row.sequence),
    [...outbox].map((row) => row.sequence).sort((left, right) => left - right)
  );
  assert.equal(repository.getDurabilityState().pendingWrites, 0);
  assert.equal(repository.getDurabilityState().status, "saved");
});

test("falha de IndexedDB fica visível e retryDurability recupera a mesma alteração", async (context) => {
  const { store, repository, service } = await openControlledRepository();
  context.after(() => store.close());
  const states = [];
  repository.onDurabilityChange((state) => states.push(state.status));
  service.failNext(new Error("quota local excedida"));

  await assert.rejects(repository.saveProgress(PROGRESS), /quota local excedida/u);
  const failed = repository.getDurabilityState();
  assert.notEqual(failed.status, "saved");
  assert.equal(failed.error.message, "quota local excedida");
  assert.equal(failed.hasUncommittedMemory, true);
  await assert.rejects(repository.flush(), /quota local excedida/u);

  const recovered = await repository.retryDurability();
  assert.equal(recovered.status, "saved");
  assert.equal(recovered.hasUncommittedMemory, false);
  assert.equal((await store.getAll("lessonProgress")).length, 1);
  assert.equal((await store.getAll("cardProgress")).length, 1);
  assert.ok(states.includes("pending"));
  assert.equal(states.at(-1), "saved");
});

test("close aguarda gravação pendente e a próxima instância lê os dados", async () => {
  const indexedDb = new IDBFactory();
  const { repository, service, graph } = await openControlledRepository(indexedDb);
  const release = service.blockNext();
  const commit = repository.saveComment({
    cardId: graph.cards[0].id,
    courseId: graph.courses[0].id,
    userId: TEST_USER_ID,
    body: "Persistir antes de fechar"
  });
  let closed = false;
  const closing = repository.close().then(() => { closed = true; });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(closed, false);

  release();
  await Promise.all([commit, closing]);
  const reopened = await IndexedDbRelationalStore.open(indexedDb, { userId: TEST_USER_ID });
  assert.equal((await reopened.getAll("comments"))[0].body, "Persistir antes de fechar");
  reopened.close();
});
