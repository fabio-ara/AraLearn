import test from "node:test";
import assert from "node:assert/strict";

import { DEVICE_ID_STATE_KEY, getOrCreateDeviceId } from "../../src/sync/deviceIdentity.js";

test("a identidade do dispositivo é UUID persistente e não é regenerada", async () => {
  const state = new Map();
  const store = {
    async getSyncState(key) { return state.get(key) ?? null; },
    async putSyncState(key, value) { state.set(key, value); }
  };
  let calls = 0;
  const cryptoValue = {
    randomUUID() {
      calls += 1;
      return "11111111-1111-4111-8111-111111111111";
    }
  };

  assert.equal(await getOrCreateDeviceId(store, cryptoValue), "11111111-1111-4111-8111-111111111111");
  assert.equal(await getOrCreateDeviceId(store, cryptoValue), "11111111-1111-4111-8111-111111111111");
  assert.equal(calls, 1);
  assert.equal(state.get(DEVICE_ID_STATE_KEY), "11111111-1111-4111-8111-111111111111");
});

test("identidade inválida armazenada é substituída, sem fallback previsível", async () => {
  const state = new Map([[DEVICE_ID_STATE_KEY, "device-1"]]);
  const store = {
    async getSyncState(key) { return state.get(key); },
    async putSyncState(key, value) { state.set(key, value); }
  };
  await assert.rejects(
    getOrCreateDeviceId(store, { randomUUID: () => "também-inválido" }),
    /inválida/
  );
  assert.equal(state.get(DEVICE_ID_STATE_KEY), "device-1");
});
