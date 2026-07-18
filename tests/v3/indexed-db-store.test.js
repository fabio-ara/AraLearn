import test from "node:test";
import assert from "node:assert/strict";
import { IDBFactory, IDBObjectStore } from "fake-indexeddb";

import {
  createBrowserIndexedDbStore,
  deleteBrowserIndexedDbDatabase,
  IndexedDbStoreError
} from "../../src/storage/createBrowserIndexedDbStore.js";
import { readCommentStorage, writeCommentStorage } from "../../src/ui/lessonEditorStorage.js";

test("o store IndexedDB grava em ordem, persiste e limpa o estado", async () => {
  const indexedDb = new IDBFactory();
  const firstStore = await createBrowserIndexedDbStore(indexedDb);
  await firstStore.setItems([
    ["projeto", "um"],
    ["progresso", "dois"]
  ]);
  await firstStore.flush();
  await firstStore.close();

  const secondStore = await createBrowserIndexedDbStore(indexedDb);
  assert.equal(secondStore.getItem("projeto"), "um");
  assert.equal(secondStore.getItem("progresso"), "dois");
  await secondStore.clear();
  await secondStore.flush();
  await secondStore.close();

  const thirdStore = await createBrowserIndexedDbStore(indexedDb);
  assert.equal(thirdStore.getItem("projeto"), null);
  assert.equal(thirdStore.getItem("progresso"), null);
  await thirdStore.close();
});

test("a limpeza de recuperação remove o banco inteiro mesmo sem um store aberto", async () => {
  const indexedDb = new IDBFactory();
  const store = await createBrowserIndexedDbStore(indexedDb);
  await store.setItem("projeto", "dados locais");
  await store.close();

  await deleteBrowserIndexedDbDatabase(indexedDb);

  const reopenedStore = await createBrowserIndexedDbStore(indexedDb);
  assert.equal(reopenedStore.getItem("projeto"), null);
  await reopenedStore.close();
});

test("comentários permanecem íntegros depois de fechar e reabrir o IndexedDB", async () => {
  const indexedDb = new IDBFactory();
  const firstStore = await createBrowserIndexedDbStore(indexedDb);
  writeCommentStorage({ "course::lesson::micro::card": "Revisar depois." }, firstStore);
  await firstStore.flush();
  await firstStore.close();

  const reopenedStore = await createBrowserIndexedDbStore(indexedDb);
  assert.deepEqual(readCommentStorage(reopenedStore), {
    "course::lesson::micro::card": "Revisar depois."
  });
  await reopenedStore.close();
});

test("uma falha de escrita é observável e não envenena a fila seguinte", async () => {
  const indexedDb = new IDBFactory();
  const observedErrors = [];
  const store = await createBrowserIndexedDbStore(indexedDb, {
    onError(error) {
      observedErrors.push(error);
    }
  });
  const originalPut = IDBObjectStore.prototype.put;
  let shouldFail = true;
  IDBObjectStore.prototype.put = function putWithOneFailure(...args) {
    if (shouldFail) {
      shouldFail = false;
      throw new DOMException("Falha simulada", "QuotaExceededError");
    }
    return originalPut.apply(this, args);
  };

  try {
    await assert.rejects(store.setItem("primeira", "falha"), IndexedDbStoreError);
    assert.equal(store.getItem("primeira"), null);
    await store.setItem("segunda", "ok");
    assert.equal(store.getItem("segunda"), "ok");
    assert.equal(observedErrors.length, 1);
    assert.equal(store.getLastError(), observedErrors[0]);
    await assert.rejects(store.flush(), IndexedDbStoreError);
    await store.flush();
    await store.close();

    const reopenedStore = await createBrowserIndexedDbStore(indexedDb);
    assert.equal(reopenedStore.getItem("primeira"), null);
    assert.equal(reopenedStore.getItem("segunda"), "ok");
    await reopenedStore.close();
  } finally {
    IDBObjectStore.prototype.put = originalPut;
    await store.close().catch(() => undefined);
  }
});
