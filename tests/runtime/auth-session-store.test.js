import test from "node:test";
import assert from "node:assert/strict";
import { IDBFactory } from "fake-indexeddb";

import {
  AuthSessionStore,
  AUTH_SESSION_DATABASE_NAME
} from "../../src/persistence/AuthSessionStore.js";

test("persiste somente o estado de autenticação em namespace próprio", async () => {
  const indexedDb = new IDBFactory();
  const first = await AuthSessionStore.open(indexedDb);
  await first.putSyncState("auth.session", { access_token: "token", expires_at: 10 });
  first.close();

  const second = await AuthSessionStore.open(indexedDb);
  assert.deepEqual(await second.getSyncState("auth.session"), {
    access_token: "token",
    expires_at: 10
  });
  await second.putSyncState("auth.session", null);
  assert.equal(await second.getSyncState("auth.session"), null);
  assert.equal(AUTH_SESSION_DATABASE_NAME, "aralearn-auth-v1");
  second.close();
});

test("atualiza a sessão em uma única transação entre abas", async () => {
  const indexedDb = new IDBFactory();
  const first = await AuthSessionStore.open(indexedDb);
  const second = await AuthSessionStore.open(indexedDb);
  await first.putSyncState("auth.session", { access_token: "old", legacy: "remove" });

  const minimized = first.updateSyncState("auth.session", (current) => ({
    access_token: current.access_token
  }));
  const renewed = second.putSyncState("auth.session", {
    access_token: "new",
    refresh_token: "new-refresh"
  });
  await Promise.all([minimized, renewed]);

  assert.deepEqual(await first.getSyncState("auth.session"), {
    access_token: "new",
    refresh_token: "new-refresh"
  });
  first.close();
  second.close();
});

test("notifica substituição de versão e recusa operações na conexão antiga", async () => {
  const indexedDb = new IDBFactory();
  const store = await AuthSessionStore.open(indexedDb);
  let invalidation = null;
  store.onConnectionInvalidated((error) => { invalidation = error; });
  store.database.onversionchange();

  assert.match(invalidation.message, /substituída/u);
  await assert.rejects(() => store.getSyncState("auth.session"), /substituída/u);
});

test("exclusão avisa quando outra aba ainda mantém a sessão aberta", async () => {
  const indexedDb = new IDBFactory();
  const blocked = await AuthSessionStore.open(indexedDb);
  blocked.database.onversionchange = () => undefined;

  await assert.rejects(
    AuthSessionStore.deleteDatabase(indexedDb),
    /ainda está aberta em outra aba/u
  );
  blocked.close();
});
