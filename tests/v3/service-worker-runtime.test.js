import test from "node:test";
import assert from "node:assert/strict";
import { registerAraLearnServiceWorker } from "../../src/runtime/registerServiceWorker.js";

test("desenvolvimento local remove somente o shell antigo e não registra Service Worker", async () => {
  const calls = [];
  const registration = {
    scope: "http://127.0.0.1:4182/",
    async unregister() {
      calls.push("unregister");
      return true;
    }
  };
  const navigatorValue = {
    serviceWorker: {
      async getRegistrations() {
        return [registration];
      },
      async register() {
        calls.push("register");
      }
    }
  };
  const deletedCaches = [];
  const cacheStorage = {
    async keys() {
      return ["aralearn-shell-0.1.0-r3", "outro-aplicativo"];
    },
    async delete(key) {
      deletedCaches.push(key);
      return true;
    }
  };

  const result = await registerAraLearnServiceWorker(navigatorValue, {
    environment: { developmentRuntime: true },
    cacheStorage,
    locationValue: { href: "http://127.0.0.1:4182/" }
  });

  assert.equal(result, null);
  assert.deepEqual(calls, ["unregister"]);
  assert.deepEqual(deletedCaches, ["aralearn-shell-0.1.0-r3"]);
});

test("artefato publicado registra atualização sem reutilizar cache HTTP", async () => {
  let received = null;
  const expected = { scope: "publicado" };
  const navigatorValue = {
    serviceWorker: {
      async register(script, options) {
        received = { script, options };
        return expected;
      }
    }
  };

  const result = await registerAraLearnServiceWorker(navigatorValue, {
    environment: {},
    cacheStorage: null,
    locationValue: { href: "https://example.test/AraLearn/" }
  });

  assert.equal(result, expected);
  assert.deepEqual(received, {
    script: "./service-worker.js",
    options: { scope: "./", updateViaCache: "none" }
  });
});
