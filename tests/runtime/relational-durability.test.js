import assert from "node:assert/strict";
import test from "node:test";

import { IDBFactory } from "fake-indexeddb";

import { DomainMutationService } from "../../src/persistence/DomainMutationService.js";
import { IndexedDbRelationalStore } from "../../src/persistence/IndexedDbRelationalStore.js";
import { RelationalProjectRepository } from "../../src/persistence/RelationalProjectRepository.js";
import {
  TEST_USER_ID,
  seedSelectedOfficialCourse
} from "./helpers/leanRelationalFixture.js";

async function openControlledRepository(indexedDb = new IDBFactory()) {
  const store = await IndexedDbRelationalStore.open(indexedDb, { userId: TEST_USER_ID });
  await seedSelectedOfficialCourse(store, {
    userId: TEST_USER_ID,
    courseOrigin: "private"
  });
  const delegate = new DomainMutationService({ store });
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
  const mutations = {
    failNext(error) {
      nextFailure = error;
    },
    blockNext() {
      let release;
      blocked = new Promise((resolve) => { release = resolve; });
      return () => release();
    },
    async applyMutations(...args) {
      await beforeMutation();
      return delegate.applyMutations(...args);
    },
    async applyRowChange(...args) {
      await beforeMutation();
      return delegate.applyRowChange(...args);
    }
  };
  const repository = new RelationalProjectRepository({
    store,
    mutationService: mutations,
    userId: TEST_USER_ID
  });
  await repository.initialize();
  return { indexedDb, store, repository, mutations };
}

function renamedProject(repository, title) {
  const project = repository.loadProject();
  project.courses[0].title = title;
  return project;
}

test("edição do grafo expõe commit local real", async (context) => {
  const { store, repository } = await openControlledRepository();
  context.after(() => store.close());

  const commit = repository.saveProject(renamedProject(repository, "Título durável"));
  assert.ok(commit instanceof Promise);
  await Promise.all([commit, repository.flush()]);

  assert.equal(repository.getDurabilityState().status, "saved");
  assert.equal((await store.getAll("courses"))[0].title, "Título durável");
  assert.deepEqual(await store.getAll("outbox"), []);
});

test("fila não anuncia salvo antes da transação pendente", async (context) => {
  const { store, repository, mutations } = await openControlledRepository();
  context.after(() => store.close());
  const release = mutations.blockNext();

  const commit = repository.saveProject(renamedProject(repository, "Título em fila"));
  assert.equal(repository.getDurabilityState().pendingWrites, 1);
  assert.notEqual(repository.getDurabilityState().status, "saved");

  release();
  await Promise.all([commit, repository.flush()]);
  assert.equal(repository.getDurabilityState().pendingWrites, 0);
  assert.equal(repository.getDurabilityState().status, "saved");
});

test("falha local fica visível e retryDurability reaplica a edição corrente", async (context) => {
  const { store, repository, mutations } = await openControlledRepository();
  context.after(() => store.close());
  mutations.failNext(new Error("quota local excedida"));

  await assert.rejects(
    repository.saveProject(renamedProject(repository, "Título a recuperar")),
    /quota local excedida/u
  );
  assert.equal(repository.getDurabilityState().status, "error");

  const recovered = await repository.retryDurability();
  assert.equal(recovered.status, "saved");
  assert.equal((await store.getAll("courses"))[0].title, "Título a recuperar");
});

test("close aguarda a edição pendente e a próxima instância lê o grafo", async () => {
  const indexedDb = new IDBFactory();
  const { repository, mutations } = await openControlledRepository(indexedDb);
  const release = mutations.blockNext();
  const commit = repository.saveProject(renamedProject(repository, "Antes de fechar"));
  let closed = false;
  const closing = repository.close().then(() => { closed = true; });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(closed, false);

  release();
  await Promise.all([commit, closing]);
  const reopenedStore = await IndexedDbRelationalStore.open(indexedDb, {
    userId: TEST_USER_ID
  });
  const reopenedRepository = new RelationalProjectRepository({
    store: reopenedStore,
    userId: TEST_USER_ID
  });
  await reopenedRepository.initialize();
  assert.equal(reopenedRepository.loadProject().courses[0].title, "Antes de fechar");
  await reopenedRepository.close();
});
