import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { IDBFactory } from "fake-indexeddb";

import { DomainMutationService } from "../../src/persistence/DomainMutationService.js";
import { IndexedDbRelationalStore } from "../../src/persistence/IndexedDbRelationalStore.js";
import { RelationalProjectRepository } from "../../src/persistence/RelationalProjectRepository.js";

const projectFixture = JSON.parse(fs.readFileSync(
  new URL("../fixtures/v3/project-minimal.json", import.meta.url),
  "utf8"
));

async function openControlledRepository(indexedDb = new IDBFactory(), { userId = null } = {}) {
  const store = await IndexedDbRelationalStore.open(indexedDb);
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
  const repository = new RelationalProjectRepository({ store, mutationService: service, userId });
  await repository.initialize();
  return { indexedDb, repository, service };
}

test("saveProject expõe commit, mantém a edição em erro e permite repetição", async () => {
  const { repository, service } = await openControlledRepository();
  const states = [];
  repository.onDurabilityChange((state) => states.push(state.status));
  service.failNext();

  const commit = repository.saveProject(projectFixture);
  assert.ok(commit instanceof Promise);
  assert.equal(repository.getDurabilityState().status, "pending");
  await assert.rejects(commit, /IndexedDB indisponível/u);

  assert.equal(repository.getDurabilityState().status, "error");
  assert.equal(repository.getDurabilityState().hasUncommittedMemory, true);
  assert.deepEqual(repository.loadProject(), projectFixture);
  await assert.rejects(() => repository.flush(), /IndexedDB indisponível/u);

  const recovered = await repository.retryDurability();
  assert.equal(recovered.status, "saved");
  assert.equal(recovered.hasUncommittedMemory, false);
  assert.deepEqual(await repository.store.getAll("courses").then((rows) => rows[0].title), "Fixture Minimal");
  assert.ok(states.includes("pending"));
  assert.ok(states.includes("error"));
  assert.equal(states.at(-1), "saved");
  await repository.close();
});

test("gravação fire-and-forget conserva a falha no estado sem rejeição global", async () => {
  const { repository, service } = await openControlledRepository();
  service.failNext(new Error("falha observada pelo repositório"));

  repository.saveProject(projectFixture);
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(repository.getDurabilityState().status, "error");
  assert.match(repository.getDurabilityState().error.message, /falha observada/u);
  await repository.retryDurability();
  await repository.close();
});

test("close aguarda uma gravação recém-enfileirada antes de destruir a instância", async () => {
  const indexedDb = new IDBFactory();
  const { repository } = await openControlledRepository(indexedDb);
  const commit = repository.saveProject(projectFixture);
  await Promise.all([commit, repository.close()]);

  const reopened = await RelationalProjectRepository.open({ indexedDb });
  assert.deepEqual(reopened.loadProject(), projectFixture);
  await reopened.close();
});

test("múltiplas gravações permanecem causais e só anunciam salvo após a última transação", async () => {
  const { repository, service } = await openControlledRepository();
  const release = service.blockNext();
  const first = structuredClone(projectFixture);
  first.courses[0].title = "Primeiro título";
  const second = structuredClone(projectFixture);
  second.courses[0].title = "Segundo título";

  const firstCommit = repository.saveProject(first);
  const secondCommit = repository.saveProject(second);
  assert.equal(repository.getDurabilityState().pendingWrites, 2);
  release();
  await Promise.all([firstCommit, secondCommit]);

  assert.equal(repository.getDurabilityState().status, "saved");
  assert.equal(repository.getDurabilityState().pendingWrites, 0);
  assert.equal(repository.loadProject().courses[0].title, "Segundo título");
  assert.equal((await repository.store.getAll("courses"))[0].title, "Segundo título");
  await repository.close();
});

test("falha de progresso permanece visível e recuperável sem falsa confirmação", async () => {
  const { repository, service } = await openControlledRepository(new IDBFactory(), {
    userId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
  });
  await repository.saveProject(projectFixture);
  service.failNext(new Error("quota local excedida"));
  const progress = {
    version: 1,
    lessons: {
      "course-fixture-minimal::module-fixture-minimal::lesson-fixture-minimal": {
        cursor: 0,
        completedCardKeys: ["card-fixture-minimal-regra"]
      }
    }
  };

  await assert.rejects(repository.saveProgress(progress), /quota local excedida/u);
  assert.deepEqual(repository.loadProgress(), progress);
  assert.equal(repository.getDurabilityState().status, "error");
  await repository.retryDurability();
  assert.equal(repository.getDurabilityState().status, "saved");
  const savedProgress = repository.loadProgress();
  assert.equal(savedProgress.version, progress.version);
  assert.deepEqual(
    savedProgress.lessons["course-fixture-minimal::module-fixture-minimal::lesson-fixture-minimal"].completedCardKeys,
    ["card-fixture-minimal-regra"]
  );
  await repository.close();
});

test("flush e close aguardam comentário relacional gravado pela API direta", async () => {
  const indexedDb = new IDBFactory();
  const userId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const { repository, service } = await openControlledRepository(indexedDb, { userId });
  const release = service.blockNext();
  const cardId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const courseId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

  const commit = repository.saveComment({ cardId, courseId, userId, body: "Nota offline" });
  assert.equal(repository.getDurabilityState().status, "pending");
  const close = repository.close();
  let closeFinished = false;
  void close.then(() => { closeFinished = true; });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(closeFinished, false);

  release();
  await Promise.all([commit, close]);
  const store = await IndexedDbRelationalStore.open(indexedDb);
  const comments = await store.getAll("comments");
  assert.equal(comments.length, 1);
  assert.equal(comments[0].body, "Nota offline");
  store.close();
});

test("falha de comentário direto permanece visível e retryDurability a recupera", async () => {
  const userId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
  const { repository, service } = await openControlledRepository(new IDBFactory(), { userId });
  service.failNext(new Error("quota de comentário excedida"));

  await assert.rejects(
    repository.saveComment({
      cardId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
      courseId: "ffffffff-ffff-4fff-8fff-ffffffffffff",
      userId,
      body: "Comentário que precisa ser repetido"
    }),
    /quota de comentário/u
  );
  assert.equal(repository.getDurabilityState().status, "error");
  await assert.rejects(repository.flush(), /quota de comentário/u);

  const recovered = await repository.retryDurability();
  assert.equal(recovered.status, "saved");
  const comments = await repository.store.getAll("comments");
  assert.equal(comments.length, 1);
  assert.equal(comments[0].body, "Comentário que precisa ser repetido");
  await repository.close();
});
