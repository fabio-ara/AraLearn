import test from "node:test";
import assert from "node:assert/strict";

import { createCodexCliProvider } from "../../src/generation/providers/codexCliProvider.js";
import { createGeminiProvider } from "../../src/generation/providers/geminiProvider.js";
import { createOpenAiCompatibleProvider } from "../../src/generation/providers/openAiCompatibleProvider.js";

const CODEX_BRIDGE_TOKEN = "aralearn-codex-bridge-token-tests-2026";

test("gemini provider expõe generateText com usage normalizado", async () => {
  const provider = createGeminiProvider({ apiKey: "test-key" });
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      candidates: [{ content: { parts: [{ text: "{\"representation\":\"paragraph:theory:none\"}" }] } }],
      usageMetadata: {
        promptTokenCount: 11,
        candidatesTokenCount: 7,
        totalTokenCount: 18
      }
    })
  });

  try {
    const result = await provider.generateText({
      modelId: "gemini-2.5-flash",
      phase: "card_assistance_representation",
      system: "Responda com texto curto.",
      prompt: "Escolha uma representação."
    });

    assert.equal(provider.capabilities.structuredEngine, true);
    assert.match(result.text, /representation/u);
    assert.equal(result.usage.prompt_tokens, 11);
    assert.equal(result.usage.completion_tokens, 7);
    assert.equal(result.usage.total_tokens, 18);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("codex cli provider expõe generateText sem schema", async () => {
  const provider = createCodexCliProvider({
    endpoint: "http://127.0.0.1:4183/assist",
    token: CODEX_BRIDGE_TOKEN
  });
  const originalFetch = globalThis.fetch;
  let requestPayload = null;
  globalThis.fetch = async (_url, init = {}) => {
    requestPayload = JSON.parse(String(init.body || "{}"));
    return {
      ok: true,
      status: 200,
      json: async () => ({
        result: {
          text: "{\"replacements\":[]}",
          usage: {
            prompt_tokens: 9,
            completion_tokens: 3,
            total_tokens: 12
          }
        }
      })
    };
  };

  try {
    const result = await provider.generateText({
      modelId: "codex-local",
      phase: "card_assistance_resource_repair",
      system: "Responda com reparo estruturado.",
      prompt: "Repare o recurso selecionado."
    });

    assert.equal(provider.capabilities.structuredEngine, true);
    assert.equal(requestPayload.request.schema, undefined);
    assert.match(result.text, /replacements/u);
    assert.equal(result.usage.total_tokens, 12);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("openai compatible provider permanece marcado para structured engine", () => {
  const provider = createOpenAiCompatibleProvider({
    baseUrl: "https://example.invalid",
    apiKey: "test-key"
  });

  assert.equal(provider.capabilities.structuredEngine, true);
  assert.equal(typeof provider.generateText, "function");
});

test("deepseek generateText usa payload textual sem JSON mode", async () => {
  const provider = createOpenAiCompatibleProvider({
    baseUrl: "https://api.deepseek.com",
    apiKey: "test-key"
  });
  const originalFetch = globalThis.fetch;
  let requestPayload = null;
  globalThis.fetch = async (_url, init = {}) => {
    requestPayload = JSON.parse(String(init.body || "{}"));
    return {
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{ message: { content: "resposta textual" }, finish_reason: "stop" }],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 }
      })
    };
  };

  try {
    await provider.generateText({
      providerId: "deepseek",
      modelId: "deepseek-v4-flash",
      phase: "card_assistance_representation",
      system: "Responda com texto curto.",
      prompt: "Escolha uma representação."
    });
    assert.equal(requestPayload.response_format, undefined);
    assert.doesNotMatch(requestPayload.messages[0].content, /JSON válido/i);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
