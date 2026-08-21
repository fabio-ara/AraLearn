import test from "node:test";
import assert from "node:assert/strict";
import { IDBFactory } from "fake-indexeddb";

import {
  CourseLocalStore,
  COURSE_LOCAL_DATABASE_PREFIX
} from "../../src/persistence/CourseLocalStore.js";
import { AuthSessionStore } from "../../src/persistence/AuthSessionStore.js";

const USER_ID = "10000000-0000-4000-8000-000000000001";
const OTHER_USER_ID = "10000000-0000-4000-8000-000000000002";

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
  const sessionStore = await AuthSessionStore.open(indexedDb);
  const store = await CourseLocalStore.open(indexedDb, { userId: USER_ID });
  const otherStore = await CourseLocalStore.open(indexedDb, { userId: OTHER_USER_ID });
  await sessionStore.putSyncState("auth.session", {
    access_token: "token-local",
    user: { id: USER_ID }
  });
  await store.putCache("course.v1.header:a", { revision: 1 });
  await otherStore.putCache("course.v1.header:b", { revision: 7 });
  sessionStore.close();
  store.close();
  otherStore.close();
  await CourseLocalStore.deleteDatabase(indexedDb, { userId: USER_ID });
  const reopenedSession = await AuthSessionStore.open(indexedDb);
  const reopened = await CourseLocalStore.open(indexedDb, { userId: USER_ID });
  const otherReopened = await CourseLocalStore.open(indexedDb, { userId: OTHER_USER_ID });
  assert.deepEqual(await reopenedSession.getSyncState("auth.session"), {
    access_token: "token-local",
    user: { id: USER_ID }
  });
  assert.equal(await reopened.getCache("course.v1.header:a"), null);
  assert.deepEqual(await otherReopened.getCache("course.v1.header:b"), { revision: 7 });
  reopenedSession.close();
  reopened.close();
  otherReopened.close();
});

test("exclusão avisa quando outra aba ainda mantém o cache aberto", async () => {
  const indexedDb = new IDBFactory();
  const blocked = await CourseLocalStore.open(indexedDb, { userId: USER_ID });
  blocked.database.onversionchange = () => undefined;

  await assert.rejects(
    CourseLocalStore.deleteDatabase(indexedDb, { userId: USER_ID }),
    /ainda está aberto em outra aba/u
  );
  blocked.close();
});

test("notifica quando outra versão substitui a conexão", async () => {
  const store = await CourseLocalStore.open(new IDBFactory(), { userId: USER_ID });
  let invalidation = null;
  store.onConnectionInvalidated((error) => { invalidation = error; });
  store.database.onversionchange();

  assert.match(invalidation.message, /substituído/u);
  await assert.rejects(() => store.getCache("course.v1.list:start"), /substituído/u);
});

test("atualiza uma chave em transação única sem perder escrita concorrente", async () => {
  const store = await CourseLocalStore.open(new IDBFactory(), { userId: USER_ID });
  await store.putCache("annotation:outbox", { commands: [] });

  await Promise.all([
    store.updateCache("annotation:outbox", (current) => ({
      commands: [...current.commands, { id: "a" }]
    })),
    store.updateCache("annotation:outbox", (current) => ({
      commands: [...current.commands, { id: "b" }]
    }))
  ]);

  assert.deepEqual((await store.getCache("annotation:outbox")).commands.map(({ id }) => id), ["a", "b"]);
  store.close();
});

test("move valores entre chaves atomicamente", async () => {
  const store = await CourseLocalStore.open(new IDBFactory(), { userId: USER_ID });
  await store.putCache("personal:v1", { observation: "texto" });
  const result = await store.updateCaches(["personal:v1", "annotation:handoff"], (records) => ({
    "personal:v1": null,
    "annotation:handoff": { source: records["personal:v1"] }
  }));

  assert.equal(result["personal:v1"], null);
  assert.deepEqual(await store.getCache("annotation:handoff"), {
    source: { observation: "texto" }
  });
  assert.equal(await store.getCache("personal:v1"), null);
  store.close();
});

test("atualiza todas as projeções de um prefixo sem tocar outros registros", async () => {
  const store = await CourseLocalStore.open(new IDBFactory(), { userId: USER_ID });
  await store.putCache("course.v1.list:a", { revision: 1 });
  await store.putCache("course.v1.list:b", { revision: 2 });
  await store.putCache("course.v1.header:a", { preserve: true });

  const updated = await store.updateCachePrefix("course.v1.list:", (value, key) =>
    key.endsWith(":a") ? { revision: value.revision + 4 } : null
  );

  assert.equal(updated, 2);
  assert.deepEqual(await store.getCache("course.v1.list:a"), { revision: 5 });
  assert.equal(await store.getCache("course.v1.list:b"), null);
  assert.deepEqual(await store.getCache("course.v1.header:a"), { preserve: true });
  store.close();
});
