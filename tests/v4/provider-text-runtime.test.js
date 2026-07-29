import test from "node:test";
import assert from "node:assert/strict";

import { createCodexCliProvider } from "../../src/generation/providers/codexCliProvider.js";
import { createGeminiProvider } from "../../src/generation/providers/geminiProvider.js";
import { createOpenAiCompatibleProvider } from "../../src/generation/providers/openAiCompatibleProvider.js";

test("gemini provider expõe generateText com usage normalizado", async () => {
  const provider = createGeminiProvider({ apiKey: "test-key" });
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      candidates: [{ content: { parts: [{ text: "CARD 1\n1: 101\n2: 201\n3: 1101\n4: 401\n5: 501\n6: motivo" }] } }],
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
      phase: "bottom_up_micro_plan",
      system: "Responda com texto curto.",
      prompt: "CARD 1"
    });

    assert.equal(provider.capabilities.structuredEngine, true);
    assert.match(result.text, /CARD 1/);
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
    token: "token"
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
          text: "AUDIT\nstatus: 1201",
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
      phase: "bottom_up_card_audit",
      system: "Responda com auditoria curta.",
      prompt: "AUDIT"
    });

    assert.equal(provider.capabilities.structuredEngine, true);
    assert.equal(requestPayload.request.schema, undefined);
    assert.match(result.text, /status: 1201/);
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
        choices: [{ message: { content: "CARD 1\n1: 101" }, finish_reason: "stop" }],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 }
      })
    };
  };

  try {
    await provider.generateText({
      providerId: "deepseek",
      modelId: "deepseek-v4-flash",
      phase: "bottom_up_micro_plan",
      system: "Responda com texto curto.",
      prompt: "CARD 1"
    });
    assert.equal(requestPayload.response_format, undefined);
    assert.doesNotMatch(requestPayload.messages[0].content, /JSON válido/i);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
