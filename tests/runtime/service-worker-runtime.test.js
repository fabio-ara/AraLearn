import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
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
      return ["aralearn-shell-0.0.9-r0", "outro-aplicativo"];
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
  assert.deepEqual(deletedCaches, ["aralearn-shell-0.0.9-r0"]);
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

test("upgrade do worker usa somente o shell corrente e não ressuscita módulo retirado offline", async () => {
  const origin = "https://example.test";
  const source = (await readFile(new URL("../../public/service-worker.js", import.meta.url), "utf8"))
    .replaceAll("__ARALEARN_CACHE_REVISION__", "0123456789abcdef0123");
  const retiredPath = `${origin}/src/persistence/ProjectDocumentAssembler.js`;
  const currentPath = `${origin}/main.js`;
  async function install({ upgrade }) {
    const stores = new Map(upgrade ? [
      ["aralearn-shell-previous", new Map([[retiredPath, "retired executable"]])],
      ["aralearn-shell-v2-previous", new Map([[currentPath, "previous executable"]])]
    ] : []);
    stores.set("outro-aplicativo", new Map([["preservar", "dados úteis"]]));
    const listeners = new Map(); let offline = false, claims = 0;
    const cacheKey = request => new URL(typeof request === "string" ? request : request.url, `${origin}/`).href;
    const caches = {
      async keys() { return [...stores.keys()]; },
      async delete(key) { return stores.delete(key); },
      async open(key) {
        if (!stores.has(key)) stores.set(key, new Map());
        const entries = stores.get(key);
        return {
          async addAll(assets) { for (const asset of assets) entries.set(cacheKey(asset), `current:${asset}`); },
          async put(request, response) { entries.set(cacheKey(request), await response.text()); },
          async match(request) { const body = entries.get(cacheKey(request)); return body === undefined ? undefined : new Response(body); }
        };
      }
    };
    vm.runInNewContext(source, {
      self: { location: { origin }, addEventListener: (kind, handler) => listeners.set(kind, handler),
        skipWaiting() {}, clients: { async claim() { claims++; } } },
      URL, caches, fetch: async () => {
        if (offline) throw new TypeError("Network unavailable");
        return Response.json({ assets: ["./main.js", "./src/persistence/CourseLocalStore.js"] });
      }
    });
    for (const kind of ["install", "activate"]) {
      let pending; listeners.get(kind)({ waitUntil(value) { pending = value; } }); await pending;
    }
    assert.equal(claims, 1);
    assert.equal(stores.get("outro-aplicativo").get("preservar"), "dados úteis");
    assert.equal([...stores.keys()].filter(key => key.startsWith("aralearn-shell-")).length, 1);
    offline = true;
    const read = async url => {
      let pending; listeners.get("fetch")({ request: new Request(url), respondWith(value) { pending = value; } });
      return (await pending)?.text();
    };
    assert.equal(await read(currentPath), "current:./main.js");
    assert.equal(await read(retiredPath), "current:./index.html");
    return [...stores.get("aralearn-shell-v2-0123456789abcdef0123")].sort();
  }
  assert.deepEqual(await install({ upgrade: true }), await install({ upgrade: false }));
});
