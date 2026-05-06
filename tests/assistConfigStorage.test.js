import test from "node:test";
import assert from "node:assert/strict";

import { readAssistConfigStorage, writeAssistConfigStorage } from "../src/ui/assistConfigStorage.js";

function createMemoryStorage() {
  const data = new Map();

  return {
    getItem(key) {
      return data.has(key) ? data.get(key) : null;
    },
    setItem(key, value) {
      data.set(key, String(value));
    }
  };
}

test("assistConfigStorage lê e grava configuração auxiliar", () => {
  const storage = createMemoryStorage();

  writeAssistConfigStorage({ model: "gemini-2.5-flash", apiKey: "abc" }, storage);

  assert.deepEqual(readAssistConfigStorage(storage), { model: "gemini-2.5-flash", apiKey: "abc" });
});

test("assistConfigStorage tolera storage ausente ou JSON inválido", () => {
  assert.deepEqual(readAssistConfigStorage(null), {
    model: "gemini-2.5-flash-lite",
    apiKey: ""
  });
  assert.deepEqual(readAssistConfigStorage({ getItem: () => "{" }), {
    model: "gemini-2.5-flash-lite",
    apiKey: ""
  });
});
