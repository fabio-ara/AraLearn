import test from "node:test";
import assert from "node:assert/strict";

import { createGeminiProvider } from "../src/generation/providers/geminiProvider.js";

test("provider Gemini envia responseMimeType e responseJsonSchema no formato esperado", async (t) => {
  const calls = [];
  const schema = {
    type: "object",
    additionalProperties: false,
    required: ["ok"],
    properties: {
      ok: { type: "boolean" }
    }
  };
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    return {
      ok: true,
      async json() {
        return {
          candidates: [
            {
              content: {
                parts: [{ text: "```json\n{\"ok\":true}\n```" }]
              }
            }
          ]
        };
      }
    };
  };
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const provider = createGeminiProvider({ apiKey: "chave" });
  const result = await provider.generateStructured({
    modelId: "gemini-2.5-flash",
    system: "Responda somente JSON válido.",
    prompt: "Teste.",
    schema
  });

  assert.equal(calls.length, 1);
  assert.match(String(calls[0].url), /models\/gemini-2\.5-flash:generateContent$/);
  const body = JSON.parse(calls[0].options.body);
  assert.equal(body.generationConfig.responseMimeType, "application/json");
  assert.deepEqual(body.generationConfig.responseJsonSchema, schema);
  assert.equal(body.systemInstruction.parts[0].text, "Responda somente JSON válido.");
  assert.equal(body.contents[0].parts[0].text, "Teste.");
  assert.deepEqual(result, { ok: true });
});

test("provider Gemini refaz a chamada sem responseJsonSchema quando o schema e complexo demais", async (t) => {
  const calls = [];
  const schema = {
    type: "object",
    additionalProperties: false,
    required: ["ok"],
    properties: {
      ok: { type: "boolean" }
    }
  };
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_url, options) => {
    calls.push(options);
    if (calls.length === 1) {
      return {
        ok: false,
        status: 400,
        async json() {
          return {
            error: {
              message: "The specified schema produces a constraint that has too many states for serving."
            }
          };
        }
      };
    }
    return {
      ok: true,
      async json() {
        return {
          candidates: [
            {
              content: {
                parts: [{ text: "{\"ok\":true}" }]
              }
            }
          ]
        };
      }
    };
  };
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const provider = createGeminiProvider({ apiKey: "chave" });
  const result = await provider.generateStructured({
    modelId: "gemini-2.5-flash",
    system: "Responda somente JSON válido.",
    prompt: "Teste.",
    schema
  });

  assert.equal(calls.length, 2);
  const firstBody = JSON.parse(calls[0].body);
  const secondBody = JSON.parse(calls[1].body);
  assert.deepEqual(firstBody.generationConfig.responseJsonSchema, schema);
  assert.equal("responseJsonSchema" in secondBody.generationConfig, false);
  assert.deepEqual(result, { ok: true });
});

test("provider Gemini troca para a chave secundaria quando a primeira bate em cota", async (t) => {
  const calls = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_url, options) => {
    calls.push(options);
    if (calls.length === 1) {
      return {
        ok: false,
        status: 429,
        async json() {
          return {
            error: {
              message: "Quota exceeded for quota metric. Daily limit reached."
            }
          };
        }
      };
    }
    return {
      ok: true,
      async json() {
        return {
          candidates: [
            {
              content: {
                parts: [{ text: "{\"ok\":true}" }]
              }
            }
          ]
        };
      }
    };
  };
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const provider = createGeminiProvider({
    apiKeys: ["chave-primaria", "chave-secundaria"]
  });
  const result = await provider.generateStructured({
    modelId: "gemini-2.5-flash",
    system: "Responda somente JSON válido.",
    prompt: "Teste."
  });

  assert.equal(calls.length, 2);
  assert.equal(calls[0].headers["x-goog-api-key"], "chave-primaria");
  assert.equal(calls[1].headers["x-goog-api-key"], "chave-secundaria");
  assert.deepEqual(result, { ok: true });
});
