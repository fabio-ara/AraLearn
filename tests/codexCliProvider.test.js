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

test("provider codex-cli normaliza schema opcional para o bridge local", async (t) => {
  const calls = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    return {
      ok: true,
      async json() {
        return { ok: true, result: { ok: true } };
      }
    };
  };
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const provider = createCodexCliProvider({ endpoint: "http://127.0.0.1:4183/assist" });
  await provider.generateStructured({
    mode: "generate-microsequence",
    modelId: "codex-cli-local",
    system: "Responda JSON.",
    prompt: "Gere a saída.",
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["status", "payload"],
      properties: {
        status: { type: "string" },
        optionalNote: { type: "string" },
        payload: {
          anyOf: [
            {
              type: "object",
              additionalProperties: false,
              required: ["answer"],
              properties: {
                answer: { type: "string" },
                explanation: { type: "string" }
              }
            },
            {
              type: "object",
              additionalProperties: false,
              required: ["error"],
              properties: {
                error: { type: "string" },
                details: { type: "string" }
              }
            }
          ]
        }
      }
    }
  });

  const body = JSON.parse(calls[0].options.body);
  assert.deepEqual(body.request.schema.required, ["status", "optionalNote", "payload"]);
  assert.deepEqual(body.request.schema.properties.optionalNote.type, ["string", "null"]);
  assert.deepEqual(body.request.schema.properties.payload.anyOf[0].required, ["answer", "explanation"]);
  assert.deepEqual(body.request.schema.properties.payload.anyOf[0].properties.explanation.type, ["string", "null"]);
  assert.deepEqual(body.request.schema.properties.payload.anyOf[1].required, ["error", "details"]);
  assert.deepEqual(body.request.schema.properties.payload.anyOf[1].properties.details.type, ["string", "null"]);
});
