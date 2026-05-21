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
