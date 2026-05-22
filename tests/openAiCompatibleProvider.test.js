import test from "node:test";
import assert from "node:assert/strict";

import { createOpenAiCompatibleProvider } from "../src/generation/providers/openAiCompatibleProvider.js";
import {
  DEEPSEEK_BASE_URL,
  DEEPSEEK_BETA_BASE_URL,
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

function createStrictSchema() {
  return {
    type: "object",
    additionalProperties: false,
    required: ["course"],
    properties: {
      course: {
        type: "object",
        additionalProperties: false,
        required: ["title", "modules"],
        properties: {
          title: { type: "string", minLength: 1 },
          goal: { type: "string", minLength: 1 },
          modules: {
            type: "array",
            minItems: 1,
            items: {
              type: "object",
              additionalProperties: false,
              required: ["title"],
              properties: {
                title: { type: "string", minLength: 1 }
              }
            }
          }
        }
      }
    }
  };
}

function mockToolResponse(argumentsPayload) {
  return mockJsonResponse({
    choices: [
      {
        finish_reason: "stop",
        message: {
          content: "",
          tool_calls: [
            {
              id: "call_1",
              type: "function",
              function: {
                name: "emit_structured_response",
                arguments: JSON.stringify(argumentsPayload)
              }
            }
          ]
        }
      }
    ]
  });
}

test("provider OpenAI-compatible monta payload DeepSeek para top-down plan", async (t) => {
  const calls = [];
  const urls = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    urls.push(url);
    calls.push(JSON.parse(options.body));
    return mockToolResponse({ ok: true });
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
    prompt: "Teste.",
    schema: createStrictSchema()
  });

  assert.equal(calls.length, 1);
  assert.equal(urls[0], `${DEEPSEEK_BETA_BASE_URL}/chat/completions`);
  assert.equal(calls[0].model, DEEPSEEK_V4_PRO);
  assert.deepEqual(calls[0].thinking, { type: "enabled" });
  assert.equal(calls[0].reasoning_effort, "max");
  assert.equal(calls[0].max_tokens, 24000);
  assert.equal("response_format" in calls[0], false);
  assert.equal(calls[0].tools[0].function.strict, true);
  assert.equal("tool_choice" in calls[0], false);
  assert.deepEqual(calls[0].tools[0].function.parameters.properties.course.required, ["title", "goal", "modules"]);
  assert.equal("minLength" in calls[0].tools[0].function.parameters.properties.course.properties.title, false);
  assert.equal("minItems" in calls[0].tools[0].function.parameters.properties.course.properties.modules, false);
  assert.equal("temperature" in calls[0], false);
  assert.equal("top_p" in calls[0], false);
  assert.equal("presence_penalty" in calls[0], false);
  assert.equal("frequency_penalty" in calls[0], false);
  assert.equal("stop" in calls[0], false);
});

test("provider OpenAI-compatible monta payload DeepSeek para top-down repair", async (t) => {
  const calls = [];
  const urls = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    urls.push(url);
    calls.push(JSON.parse(options.body));
    return mockToolResponse({ ok: true });
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
    prompt: "Teste.",
    schema: createStrictSchema()
  });

  assert.equal(calls.length, 1);
  assert.equal(urls[0], `${DEEPSEEK_BETA_BASE_URL}/chat/completions`);
  assert.equal(calls[0].model, DEEPSEEK_V4_FLASH);
  assert.deepEqual(calls[0].thinking, { type: "disabled" });
  assert.equal(calls[0].temperature, 0.1);
  assert.equal("reasoning_effort" in calls[0], false);
});

test("provider OpenAI-compatible monta payload DeepSeek para bottom-up draft e compile", async (t) => {
  const calls = [];
  const urls = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    urls.push(url);
    calls.push(JSON.parse(options.body));
    return mockToolResponse({ ok: true });
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
    prompt: "Draft.",
    schema: createStrictSchema()
  });
  await provider.generateStructured({
    modelId: DEEPSEEK_QUALITY_MODEL,
    providerId: "deepseek",
    phase: "bottom-up-compile",
    system: "Responda somente JSON válido.",
    prompt: "Compile.",
    schema: createStrictSchema()
  });

  assert.equal(urls[0], `${DEEPSEEK_BETA_BASE_URL}/chat/completions`);
  assert.equal(urls[1], `${DEEPSEEK_BETA_BASE_URL}/chat/completions`);
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

test("provider OpenAI-compatible interpreta tool_call strict do DeepSeek", async (t) => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    mockToolResponse({
      course: {
        title: "Curso",
        goal: "Meta",
        modules: [
          {
            title: "Modulo 1"
          }
        ]
      }
    });
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const provider = createOpenAiCompatibleProvider({
    baseUrl: DEEPSEEK_BASE_URL,
    apiKey: "segredo"
  });
  const result = await provider.generateStructured({
    modelId: DEEPSEEK_QUALITY_MODEL,
    providerId: "deepseek",
    phase: "top-down-plan",
    system: "Responda somente JSON válido.",
    prompt: "Teste.",
    schema: createStrictSchema()
  });

  assert.equal(result.course.title, "Curso");
  assert.equal(result.course.modules[0].title, "Modulo 1");
});

test("provider OpenAI-compatible trata finish_reason length como falha recuperável", async (t) => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    mockJsonResponse({
      choices: [
        {
          finish_reason: "length",
          message: {
            content: "",
            tool_calls: [
              {
                id: "call_1",
                type: "function",
                function: {
                  name: "emit_structured_response",
                  arguments: "{\"ok\":true}"
                }
              }
            ]
          }
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
      prompt: "Teste.",
      schema: createStrictSchema()
    }),
    /truncada/i
  );
});
