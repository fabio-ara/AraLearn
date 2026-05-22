import test from "node:test";
import assert from "node:assert/strict";

import { createOpenAiCompatibleProvider } from "../src/generation/providers/openAiCompatibleProvider.js";
import {
  DEEPSEEK_BASE_URL,
  DEEPSEEK_QUALITY_MODEL,
  DEEPSEEK_V4_FLASH,
  DEEPSEEK_V4_PRO
} from "../src/generation/providers/deepSeekPolicy.js";

function mockJsonResponse(payload) {
  return {
    ok: true,
    async json() {
      return payload;
    }
  };
}

test("provider OpenAI-compatible monta payload DeepSeek para top-down plan", async (t) => {
  const calls = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_url, options) => {
    calls.push(JSON.parse(options.body));
    return mockJsonResponse({
      choices: [
        {
          finish_reason: "stop",
          message: { content: "{\"ok\":true}" }
        }
      ]
    });
  };
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const provider = createOpenAiCompatibleProvider({
    baseUrl: DEEPSEEK_BASE_URL,
    apiKey: "segredo"
  });
  await provider.generateStructured({
    modelId: DEEPSEEK_QUALITY_MODEL,
    providerId: "deepseek",
    phase: "top-down-plan",
    system: "Responda somente JSON válido.",
    prompt: "Teste."
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].model, DEEPSEEK_V4_PRO);
  assert.deepEqual(calls[0].thinking, { type: "enabled" });
  assert.equal(calls[0].reasoning_effort, "max");
  assert.equal(calls[0].max_tokens, 24000);
  assert.deepEqual(calls[0].response_format, { type: "json_object" });
  assert.equal("temperature" in calls[0], false);
  assert.equal("top_p" in calls[0], false);
  assert.equal("presence_penalty" in calls[0], false);
  assert.equal("frequency_penalty" in calls[0], false);
  assert.equal("stop" in calls[0], false);
});

test("provider OpenAI-compatible monta payload DeepSeek para top-down repair", async (t) => {
  const calls = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_url, options) => {
    calls.push(JSON.parse(options.body));
    return mockJsonResponse({
      choices: [
        {
          finish_reason: "stop",
          message: { content: "{\"ok\":true}" }
        }
      ]
    });
  };
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const provider = createOpenAiCompatibleProvider({
    baseUrl: DEEPSEEK_BASE_URL,
    apiKey: "segredo"
  });
  await provider.generateStructured({
    modelId: DEEPSEEK_QUALITY_MODEL,
    providerId: "deepseek",
    phase: "top-down-repair",
    system: "Responda somente JSON válido.",
    prompt: "Teste."
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].model, DEEPSEEK_V4_FLASH);
  assert.deepEqual(calls[0].thinking, { type: "disabled" });
  assert.equal(calls[0].temperature, 0.1);
  assert.equal("reasoning_effort" in calls[0], false);
});

test("provider OpenAI-compatible monta payload DeepSeek para bottom-up draft e compile", async (t) => {
  const calls = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_url, options) => {
    calls.push(JSON.parse(options.body));
    return mockJsonResponse({
      choices: [
        {
          finish_reason: "stop",
          message: { content: "{\"ok\":true}" }
        }
      ]
    });
  };
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const provider = createOpenAiCompatibleProvider({
    baseUrl: DEEPSEEK_BASE_URL,
    apiKey: "segredo"
  });
  await provider.generateStructured({
    modelId: DEEPSEEK_QUALITY_MODEL,
    providerId: "deepseek",
    phase: "bottom-up-draft",
    system: "Responda somente JSON válido.",
    prompt: "Draft."
  });
  await provider.generateStructured({
    modelId: DEEPSEEK_QUALITY_MODEL,
    providerId: "deepseek",
    phase: "bottom-up-compile",
    system: "Responda somente JSON válido.",
    prompt: "Compile."
  });

  assert.equal(calls[0].model, DEEPSEEK_V4_PRO);
  assert.deepEqual(calls[0].thinking, { type: "enabled" });
  assert.equal(calls[0].reasoning_effort, "high");
  assert.equal("temperature" in calls[0], false);
  assert.equal(calls[1].model, DEEPSEEK_V4_FLASH);
  assert.deepEqual(calls[1].thinking, { type: "disabled" });
  assert.equal(calls[1].temperature, 0.2);
  assert.equal("reasoning_effort" in calls[1], false);
});

test("provider OpenAI-compatible preserva comportamento genérico fora de DeepSeek", async (t) => {
  const calls = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_url, options) => {
    calls.push(JSON.parse(options.body));
    return mockJsonResponse({
      choices: [
        {
          finish_reason: "stop",
          message: { content: "{\"ok\":true}" }
        }
      ]
    });
  };
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const provider = createOpenAiCompatibleProvider({
    baseUrl: "https://example.com",
    apiKey: "segredo"
  });
  await provider.generateStructured({
    modelId: "openai-compatible:test-model",
    phase: "bottom-up-draft",
    system: "Responda somente JSON válido.",
    prompt: "Teste.",
    temperature: 0.4
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].model, "openai-compatible:test-model");
  assert.equal(calls[0].temperature, 0.4);
  assert.equal("thinking" in calls[0], false);
  assert.equal("reasoning_effort" in calls[0], false);
});

test("provider OpenAI-compatible trata finish_reason length como falha recuperável", async (t) => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    mockJsonResponse({
      choices: [
        {
          finish_reason: "length",
          message: { content: "{\"ok\":true}" }
        }
      ]
    });
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const provider = createOpenAiCompatibleProvider({
    baseUrl: DEEPSEEK_BASE_URL,
    apiKey: "segredo"
  });

  await assert.rejects(
    () => provider.generateStructured({
      modelId: DEEPSEEK_QUALITY_MODEL,
      providerId: "deepseek",
      phase: "bottom-up-compile",
      system: "Responda somente JSON válido.",
      prompt: "Teste."
    }),
    /truncada/i
  );
});
