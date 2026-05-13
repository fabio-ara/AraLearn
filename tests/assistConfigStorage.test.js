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

test("assistConfigStorage lê config legada e injeta defaults do Codex local", () => {
  const storage = createMemoryStorage();
  storage.setItem(
    "aralearn.assist-config",
    JSON.stringify({
      model: "gemini-2.5-flash",
      apiKey: "abc"
    })
  );

  assert.deepEqual(readAssistConfigStorage(storage), {
    model: "gemini-2.5-flash",
    apiKey: "abc",
    codexEndpoint: "http://127.0.0.1:4183/assist",
    codexToken: ""
  });
});

test("assistConfigStorage grava e lê endpoint/token do Codex local", () => {
  const storage = createMemoryStorage();

  writeAssistConfigStorage(
    {
      model: "codex-cli-local",
      apiKey: "",
      codexEndpoint: "http://127.0.0.1:4183/assist",
      codexToken: "segredo"
    },
    storage
  );

  assert.deepEqual(readAssistConfigStorage(storage), {
    model: "codex-cli-local",
    apiKey: "",
    codexEndpoint: "http://127.0.0.1:4183/assist",
    codexToken: "segredo"
  });
});

test("assistConfigStorage tolera storage ausente, JSON inválido e valores ausentes", () => {
  assert.deepEqual(readAssistConfigStorage(null), {
    model: "gemini-2.5-flash",
    apiKey: "",
    codexEndpoint: "http://127.0.0.1:4183/assist",
    codexToken: ""
  });
  assert.deepEqual(readAssistConfigStorage({ getItem: () => "{" }), {
    model: "gemini-2.5-flash",
    apiKey: "",
    codexEndpoint: "http://127.0.0.1:4183/assist",
    codexToken: ""
  });
});

