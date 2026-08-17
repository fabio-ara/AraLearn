import test from "node:test";
import assert from "node:assert/strict";
import { IDBFactory } from "fake-indexeddb";

import {
  CourseLocalStore,
  COURSE_LOCAL_DATABASE_PREFIX
} from "../../src/persistence/CourseLocalStore.js";

const USER_ID = "10000000-0000-4000-8000-000000000001";

test("abre namespace novo por usuário sem ler o banco relacional anterior", async () => {
  const indexedDb = new IDBFactory();
  const old = indexedDb.open("aralearn-relational-v4-r3");
  await new Promise((resolve, reject) => {
    old.onupgradeneeded = () => old.result.createObjectStore("syncState");
    old.onsuccess = resolve;
    old.onerror = reject;
  });
  old.result.close();

  const store = await CourseLocalStore.open(indexedDb, { userId: USER_ID });
  assert.equal(store.name, `${COURSE_LOCAL_DATABASE_PREFIX}-${USER_ID}`);
  assert.equal(await store.getCache("course.v1.list:start"), null);
  store.close();
});

test("grava, lê e invalida apenas o prefixo solicitado", async () => {
  const indexedDb = new IDBFactory();
  const store = await CourseLocalStore.open(indexedDb, { userId: USER_ID });
  await store.putCache("course.v1.header:a", { revision: 1 });
  await store.putCache("course.v1.entities:a:1:start", { items: [] });
  await store.putCache("course.v1.header:b", { revision: 2 });

  assert.deepEqual(await store.getCache("course.v1.header:a"), { revision: 1 });
  await store.deleteCachePrefix("course.v1.entities:a:");
  assert.equal(await store.getCache("course.v1.entities:a:1:start"), null);
  assert.deepEqual(await store.getCache("course.v1.header:b"), { revision: 2 });
  store.close();
});

test("exclusão do namespace é explícita e isolada", async () => {
  const indexedDb = new IDBFactory();
  const store = await CourseLocalStore.open(indexedDb, { userId: USER_ID });
  await store.putCache("course.v1.header:a", { revision: 1 });
  store.close();
  await CourseLocalStore.deleteDatabase(indexedDb, { userId: USER_ID });
  const reopened = await CourseLocalStore.open(indexedDb, { userId: USER_ID });
  assert.equal(await reopened.getCache("course.v1.header:a"), null);
  reopened.close();
});

test("notifica quando outra versão substitui a conexão", async () => {
  const store = await CourseLocalStore.open(new IDBFactory(), { userId: USER_ID });
  let invalidation = null;
  store.onConnectionInvalidated((error) => { invalidation = error; });
  store.database.onversionchange();

  assert.match(invalidation.message, /substituído/u);
  await assert.rejects(() => store.getCache("course.v1.list:start"), /substituído/u);
});
