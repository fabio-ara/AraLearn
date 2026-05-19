import test from "node:test";
import assert from "node:assert/strict";

import { createCodexCliProvider } from "../src/generation/providers/codexCliProvider.js";

test("provider codex-cli chama bridge com modo novo", async (t) => {
  const calls = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    return {
      ok: true,
      async json() {
        return { ok: true, result: { summary: "ok", cards: [] } };
      }
    };
  };
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const provider = createCodexCliProvider({ endpoint: "http://127.0.0.1:4183/assist" });
  const result = await provider.generateStructured({
    mode: "plan-scope",
    modelId: "codex-cli-local",
    system: "Responda JSON.",
    prompt: "Planeje uma trilha."
  });

  assert.equal(calls.length, 1);
  const body = JSON.parse(calls[0].options.body);
  assert.equal(body.mode, "plan-scope");
  assert.equal(result.summary, "ok");
});
