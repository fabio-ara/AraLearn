import test from "node:test";
import assert from "node:assert/strict";

import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

import {
  generateCardAssistanceChangeSet
} from "../../src/generation/runtime/cardAssistanceRuntime.js";
import {
  buildExactAuthoringCardSchema
} from "../../src/generation/engine/cardAuthoringSchema.js";
import {
  createCodexCliProvider
} from "../../src/generation/providers/codexCliProvider.js";
import {
  createGeminiProvider
} from "../../src/generation/providers/geminiProvider.js";
import {
  createOpenAiCompatibleProvider
} from "../../src/generation/providers/openAiCompatibleProvider.js";
import {
  classifyProviderError
} from "../../src/generation/providers/providerErrors.js";
import {
  getAuthoringResourceContract,
  listResourceIds
} from "../../src/resources/registry/index.js";
import {
  toGeminiJsonSchema,
  toStrictJsonSchema
} from "../../src/generation/providers/structuredOutput.js";

const CODEX_BRIDGE_TOKEN = "aralearn-codex-bridge-token-tests-2026";

function projectFixture() {
  return {
    contract: "aralearn.contract",
    version: 4,
    kind: "project",
    courses: [{
      id: "course-a",
      title: "Curso",
      goal: "Aprender.",
      modules: [{
        id: "module-a",
        title: "Módulo",
        guide: {
          goal: "Compreender.",
          include: [],
          exclude: [],
          notation: [],
          avoid: []
        },
        lessons: [{
          id: "lesson-a",
          title: "Lição",
          guide: {
            goal: "Explicar.",
            include: [],
            exclude: [],
            notation: [],
            avoid: []
          },
          topics: [],
          microsequences: [{
            id: "micro-a",
            title: "Microssequência",
            goal: "Apresentar o conceito.",
            role: "explain",
            status: "generated",
            dependsOn: [],
            covers: [],
            checks: [],
            cards: [{
              id: "card-a",
              position: 1,
              resource: "paragraph",
              kind: "theory",
              exercise: "none",
              title: "Conceito",
              text: "Texto original.",
              after: ""
            }]
          }]
        }]
      }]
    }]
  };
}

const selection = {
  courseKey: "course-a",
  moduleKey: "module-a",
  lessonKey: "lesson-a",
  microsequenceKey: "micro-a",
  cardKey: "card-a"
};

const resourceRepairRequest = {
  operation: "repair",
  repairScope: "resources",
  resourceTargetIds: ["main"],
  promptText: "Corrija o texto."
};

function repairedResourceValue(text = "Texto corrigido.") {
  return {
    replacements: [{
      targetId: "main",
      value: {
        text
      },
      gaps: []
    }]
  };
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  });
}

async function withFetch(mockFetch, callback) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = mockFetch;
  try {
    return await callback();
  } finally {
    globalThis.fetch = originalFetch;
  }
}

function strictAjv() {
  const ajv = new Ajv2020({
    allErrors: true,
    strict: true,
    strictRequired: false,
    allowUnionTypes: true
  });
  addFormats(ajv);
  return ajv;
}

function assertGeminiSubset(schema) {
  const supported = new Set([
    "$anchor",
    "$defs",
    "$ref",
    "additionalProperties",
    "anyOf",
    "description",
    "enum",
    "format",
    "items",
    "maximum",
    "maxItems",
    "minimum",
    "minItems",
    "prefixItems",
    "properties",
    "required",
    "title",
    "type"
  ]);
  function visit(value, parentKey = "") {
    if (Array.isArray(value)) {
      value.forEach((item) => visit(item, ""));
      return;
    }
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value.enum)) {
      assert.equal(
        ["string", "number", "integer"].includes(value.type),
        true,
        "enum sem tipo explícito"
      );
    }
    Object.entries(value).forEach(([key, item]) => {
      if (!["properties", "$defs"].includes(parentKey)) {
        assert.equal(supported.has(key), true, key);
      }
      visit(item, key);
    });
  }
  visit(schema);
}

function openAiSchemaMetrics(schema) {
  const metrics = {
    objectProperties: 0,
    objectNesting: 0,
    constrainedStringSize: 0,
    enumValues: 0
  };

  function visit(value, objectNesting = 0) {
    if (Array.isArray(value)) {
      value.forEach((item) => visit(item, objectNesting));
      return;
    }
    if (!value || typeof value !== "object") return;

    const nextObjectNesting = value.type === "object"
      ? objectNesting + 1
      : objectNesting;
    metrics.objectNesting = Math.max(metrics.objectNesting, nextObjectNesting);
    if (value.properties && typeof value.properties === "object") {
      const propertyNames = Object.keys(value.properties);
      metrics.objectProperties += propertyNames.length;
      metrics.constrainedStringSize += propertyNames
        .reduce((total, propertyName) => total + propertyName.length, 0);
    }
    if (value.$defs && typeof value.$defs === "object") {
      metrics.constrainedStringSize += Object.keys(value.$defs)
        .reduce((total, definitionName) => total + definitionName.length, 0);
    }
    if (Array.isArray(value.enum)) {
      metrics.enumValues += value.enum.length;
      metrics.constrainedStringSize += value.enum
        .filter((item) => typeof item === "string")
        .reduce((total, item) => total + item.length, 0);
    }
    if (typeof value.const === "string") {
      metrics.constrainedStringSize += value.const.length;
    }

    Object.entries(value).forEach(([key, item]) => {
      if (key === "required" || key === "enum") return;
      visit(item, nextObjectNesting);
    });
  }

  visit(schema);
  return metrics;
}

function assertOpenAiConstTypes(schema) {
  if (Array.isArray(schema)) {
    schema.forEach(assertOpenAiConstTypes);
    return;
  }
  if (!schema || typeof schema !== "object") return;
  if (Object.hasOwn(schema, "const")) {
    assert.equal(typeof schema.type === "string", true, "const sem type explícito");
  }
  Object.values(schema).forEach(assertOpenAiConstTypes);
}

test("projeções OpenAI e Gemini usam somente seus subconjuntos de schema", () => {
  for (const resource of listResourceIds()) {
    const example = {
      ...getAuthoringResourceContract(resource).example,
      id: "card-provider",
      position: 1
    };
    const schema = buildExactAuthoringCardSchema({
      id: example.id,
      position: example.position,
      resource,
      kind: example.kind,
      exercise: example.exercise
    });
    const openAiSchema = toStrictJsonSchema(schema);
    const geminiSchema = toGeminiJsonSchema(schema);
    const openAiSerialized = JSON.stringify(openAiSchema);
    const openAiMetrics = openAiSchemaMetrics(openAiSchema);
    const geminiValidate = strictAjv().compile(geminiSchema);

    for (const unsupported of [
      "\"allOf\"",
      "\"not\"",
      "\"if\"",
      "\"then\"",
      "\"else\"",
      "\"minLength\"",
      "\"maxLength\"",
      "\"prefixItems\"",
      "\"uniqueItems\""
    ]) {
      assert.equal(openAiSerialized.includes(unsupported), false, `${resource}:${unsupported}`);
    }
    assert.equal(openAiSchema.type, "object", `${resource}: raiz OpenAI`);
    assert.equal(openAiMetrics.objectProperties <= 5000, true, `${resource}: properties`);
    assert.equal(openAiMetrics.objectNesting <= 10, true, `${resource}: nesting`);
    assert.equal(
      openAiMetrics.constrainedStringSize <= 120000,
      true,
      `${resource}: strings`
    );
    assert.equal(openAiMetrics.enumValues <= 1000, true, `${resource}: enums`);
    assertOpenAiConstTypes(openAiSchema);
    assertGeminiSubset(geminiSchema);
    assert.equal(
      geminiValidate(example),
      true,
      `${resource}: ${JSON.stringify(geminiValidate.errors)}`
    );
  }
});

test("a assistência consome no máximo uma reconstrução entre decisão e card", async () => {
  const requests = [];
  const provider = {
    async generateStructured(request) {
      requests.push(request);
      if (requests.length === 1) {
        return { value: { representation: "fora-do-registro" } };
      }
      if (requests.length === 2) {
        return { value: { representation: "paragraph:theory:none" } };
      }
      return {
        value: {
          card: {
            id: "card-a",
            position: 1,
            resource: "paragraph",
            kind: "theory",
            exercise: "none",
            title: "Inválido",
            text: "",
            after: ""
          }
        }
      };
    }
  };

  await assert.rejects(
    () => generateCardAssistanceChangeSet({
      projectDocument: projectFixture(),
      selection,
      request: {
        operation: "repair",
        repairScope: "card",
        promptText: "Revise o card."
      },
      provider,
      modelId: "fake:model"
    }),
    /card produzido é inválido|text é obrigatório/u
  );
  assert.deepEqual(
    requests.map((request) => request.phase),
    [
      "card_assistance_representation",
      "card_assistance_representation",
      "card_assistance_build"
    ]
  );
});

test("forma autoral explícita recupera uma única vez dado alternativo nulo ou ausente", async (t) => {
  for (const firstVisualValue of ["absent", "null"]) {
    await t.test(firstVisualValue, async () => {
      const requests = [];
      const progress = [];
      const provider = {
        async generateStructured(request) {
          requests.push(request);
          if (request.phase === "card_assistance_representation") {
            return {
              value: {
                representation: "plane:theory:none@vector"
              }
            };
          }
          const target = request.engineContext.writableTarget;
          const card = {
            ...target,
            title: "Vetor no plano",
            prompt: "Observe as duas coordenadas do vetor.",
            after: ""
          };
          if (requests.filter((item) => item.phase === "card_assistance_build").length === 1) {
            if (firstVisualValue === "null") card.vector = null;
            return { value: { card } };
          }
          return {
            value: {
              card: {
                ...card,
                vector: [2, 3]
              }
            }
          };
        }
      };

      const preview = await generateCardAssistanceChangeSet({
        projectDocument: projectFixture(),
        selection,
        request: {
          operation: "create",
          placement: "after_current",
          promptText: "Crie uma microteoria visual curta sobre coordenadas de vetores."
        },
        provider,
        modelId: "deepseek-v4-flash",
        onProgress: (event) => progress.push(event)
      });

      assert.deepEqual(preview.changeSet.card.vector, [2, 3]);
      assert.deepEqual(
        requests.map((request) => request.phase),
        [
          "card_assistance_representation",
          "card_assistance_build",
          "card_assistance_build"
        ]
      );
      const buildRequests = requests.filter(
        (request) => request.phase === "card_assistance_build"
      );
      buildRequests.forEach((request) => {
        assert.equal(
          request.schema.properties.card.required.includes("vector"),
          true
        );
        assert.deepEqual(
          request.engineContext.resourceContract.shape.selectedRequiredAlternative,
          ["vector"]
        );
        assert.equal(
          request.engineContext.invariants.some((item) =>
            /valor não nulo.+vector/iu.test(item)
          ),
          true
        );
      });
      assert.equal(
        buildRequests[1].engineContext.validationFeedback.length,
        1
      );
      assert.equal(
        progress.filter((event) => event.status === "retry").length,
        1
      );
    });
  }
});

test("prática gap explicita o alvo formal e proíbe resposta já visível", async () => {
  const requests = [];
  const provider = {
    async generateStructured(request) {
      requests.push(request);
      if (request.phase === "card_assistance_representation") {
        return {
          value: {
            representation: "plane:exercise:gap@vector"
          }
        };
      }
      return {
        value: {
          card: {
            ...request.engineContext.writableTarget,
            title: "Sinal da coordenada",
            prompt: "Observe o vetor e indique o sinal da coordenada x.",
            vector: [4, 2],
            result: "{gap:sinal-x}",
            after: "A primeira coordenada corresponde ao eixo x.",
            gaps: [{
              id: "sinal-x",
              response: "choice",
              answer: "positiva",
              distractors: ["negativa", "zero"],
              acceptedAnswers: []
            }]
          }
        }
      };
    }
  };

  const preview = await generateCardAssistanceChangeSet({
    projectDocument: projectFixture(),
    selection,
    request: {
      operation: "create",
      placement: "after_current",
      promptText: "Crie uma prática visual curta."
    },
    provider,
    modelId: "fake:model"
  });

  assert.equal(
    preview.changeSet.card.result,
    "[[positiva::positiva|negativa|zero]]"
  );
  const representationRequest = requests.find(
    (request) => request.phase === "card_assistance_representation"
  );
  const buildRequest = requests.find(
    (request) => request.phase === "card_assistance_build"
  );
  assert.equal(
    representationRequest.engineContext.rules.some((rule) =>
      /resposta não seja um dado já visível.+geometria/iu.test(rule)
    ),
    true
  );
  assert.equal(
    buildRequest.engineContext.invariants.some((rule) =>
      /somente nestes alvos interativos: result/iu.test(rule)
    ),
    true
  );
  assert.equal(
    buildRequest.engineContext.invariants.some((rule) =>
      /não repita a resposta.+coordenada ou geometria/iu.test(rule)
    ),
    true
  );
});

test("DeepSeek reconstrói uma vez JSON inválido e preserva JSON mode", async () => {
  const provider = createOpenAiCompatibleProvider({
    baseUrl: "https://api.deepseek.com",
    apiKey: "test-key"
  });
  const payloads = [];
  let calls = 0;

  await withFetch(async (_url, init) => {
    calls += 1;
    payloads.push(JSON.parse(init.body));
    return jsonResponse({
      choices: [{
        finish_reason: "stop",
        message: {
          content: calls === 1
            ? "{json-incompleto"
            : JSON.stringify(repairedResourceValue())
        }
      }],
      usage: {}
    });
  }, async () => {
    const preview = await generateCardAssistanceChangeSet({
      projectDocument: projectFixture(),
      selection,
      request: resourceRepairRequest,
      provider,
      modelId: "deepseek-v4-flash"
    });
    assert.equal(preview.changeSet.card.text, "Texto corrigido.");
  });

  assert.equal(calls, 2);
  assert.equal(
    payloads.every((payload) => payload.response_format?.type === "json_object"),
    true
  );
  assert.equal(
    payloads.every((payload) => /JSON/iu.test(payload.messages[0].content)),
    true
  );
});

test("DeepSeek não repete truncamento, autenticação nem falha de rede", async (t) => {
  const cases = [
    {
      name: "truncamento",
      response: () => jsonResponse({
        choices: [{
          finish_reason: "length",
          message: { content: "{\"replacements\":[" }
        }]
      }),
      matches: (error) => error?.category === "response_truncated"
    },
    {
      name: "autenticação",
      response: () => jsonResponse({ error: { message: "Invalid API key" } }, 401),
      matches: (error) => error?.statusCode === 401
    },
    {
      name: "rede",
      response: () => {
        throw new TypeError("network failed");
      },
      matches: (error) => error instanceof TypeError
    }
  ];

  for (const scenario of cases) {
    await t.test(scenario.name, async () => {
      const provider = createOpenAiCompatibleProvider({
        baseUrl: "https://api.deepseek.com",
        apiKey: "test-key"
      });
      let calls = 0;
      await withFetch(async () => {
        calls += 1;
        return scenario.response();
      }, async () => {
        await assert.rejects(
          () => generateCardAssistanceChangeSet({
            projectDocument: projectFixture(),
            selection,
            request: resourceRepairRequest,
            provider,
            modelId: "deepseek-v4-flash"
          }),
          scenario.matches
        );
      });
      assert.equal(calls, 1);
    });
  }
});

test("OpenAI Responses distingue recusa, truncamento e autenticação sem retry", async (t) => {
  const scenarios = [
    {
      name: "recusa",
      status: 200,
      body: {
        status: "completed",
        output: [{
          type: "message",
          content: [{ type: "refusal", refusal: "Não posso atender." }]
        }]
      },
      matches: (error) => error?.category === "structured_refusal"
    },
    {
      name: "truncamento",
      status: 200,
      body: {
        status: "incomplete",
        incomplete_details: { reason: "max_output_tokens" },
        output: []
      },
      matches: (error) => error?.category === "response_truncated"
    },
    {
      name: "autenticação",
      status: 401,
      body: { error: { message: "Incorrect API key" } },
      matches: (error) => error?.statusCode === 401
    }
  ];

  for (const scenario of scenarios) {
    await t.test(scenario.name, async () => {
      const provider = createOpenAiCompatibleProvider({
        endpoint: "https://api.openai.com/v1/responses",
        apiKey: "test-key"
      });
      let calls = 0;
      await withFetch(async () => {
        calls += 1;
        return jsonResponse(scenario.body, scenario.status);
      }, async () => {
        await assert.rejects(
          () => generateCardAssistanceChangeSet({
            projectDocument: projectFixture(),
            selection,
            request: resourceRepairRequest,
            provider,
            modelId: "test-model"
          }),
          scenario.matches
        );
      });
      assert.equal(calls, 1);
    });
  }
});

test("OpenAI Responses reconstrói uma única vez quando o texto não é JSON", async () => {
  const provider = createOpenAiCompatibleProvider({
    endpoint: "https://api.openai.com/v1/responses",
    apiKey: "test-key"
  });
  const payloads = [];
  let calls = 0;

  await withFetch(async (_url, init) => {
    calls += 1;
    payloads.push(JSON.parse(init.body));
    return jsonResponse({
      status: "completed",
      output: [{
        type: "message",
        content: [{
          type: "output_text",
          text: calls === 1
            ? "{json-incompleto"
            : JSON.stringify(repairedResourceValue())
        }]
      }]
    });
  }, async () => {
    const preview = await generateCardAssistanceChangeSet({
      projectDocument: projectFixture(),
      selection,
      request: resourceRepairRequest,
      provider,
      modelId: "test-model"
    });
    assert.equal(preview.changeSet.card.text, "Texto corrigido.");
  });

  assert.equal(calls, 2);
  assert.equal(payloads.every((payload) => payload.store === false), true);
  assert.equal(payloads.every((payload) => !Object.hasOwn(payload, "temperature")), true);
});

test("OpenAI Responses aplica timeout sem segunda chamada", async () => {
  const provider = createOpenAiCompatibleProvider({
    endpoint: "https://api.openai.com/v1/responses",
    apiKey: "test-key"
  });
  let calls = 0;

  let capturedError;
  await withFetch((_url, init) => {
    calls += 1;
    return {
      ok: true,
      status: 200,
      json: () => new Promise((_resolve, reject) => {
        init.signal.addEventListener("abort", () => {
          const error = new Error("aborted");
          error.name = "AbortError";
          reject(error);
        });
      })
    };
  }, async () => {
    await assert.rejects(
      () => provider.generateStructured({
        modelId: "test-model",
        timeoutMs: 5,
        schemaName: "timeout_test",
        schema: {
          type: "object",
          additionalProperties: false,
          required: ["ok"],
          properties: { ok: { type: "boolean" } }
        },
        prompt: "Teste."
      }),
      (error) => {
        capturedError = error;
        return error?.category === "timeout" && error?.code === "ETIMEDOUT";
      }
    );
  });
  assert.equal(calls, 1);
  assert.equal(classifyProviderError(capturedError).retryable, false);
});

test("Gemini reconstrói MALFORMED_RESPONSE uma vez e usa responseJsonSchema projetado", async () => {
  const provider = createGeminiProvider({ apiKey: "test-key" });
  const payloads = [];
  let calls = 0;

  await withFetch(async (_url, init) => {
    calls += 1;
    payloads.push(JSON.parse(init.body));
    return jsonResponse({
      candidates: [{
        finishReason: calls === 1 ? "MALFORMED_RESPONSE" : "STOP",
        content: {
          parts: calls === 1
            ? [{ text: "" }]
            : [
                { thought: true, text: "Raciocínio interno que não integra o JSON." },
                { text: JSON.stringify(repairedResourceValue()) }
              ]
        }
      }],
      usageMetadata: {}
    });
  }, async () => {
    const preview = await generateCardAssistanceChangeSet({
      projectDocument: projectFixture(),
      selection,
      request: resourceRepairRequest,
      provider,
      modelId: "gemini-2.5-flash"
    });
    assert.equal(preview.changeSet.card.text, "Texto corrigido.");
  });

  assert.equal(calls, 2);
  const schema = payloads[0].generationConfig.responseJsonSchema;
  assert.equal(payloads[0].generationConfig.responseMimeType, "application/json");
  assertGeminiSubset(schema);
});

test("Gemini não reconstrói truncamento, autenticação ou falha de rede", async (t) => {
  const scenarios = [
    {
      name: "truncamento",
      response: () => jsonResponse({
        candidates: [{
          finishReason: "MAX_TOKENS",
          content: { parts: [{ text: "{\"replacements\":[" }] }
        }]
      }),
      matches: (error) => error?.category === "response_truncated"
    },
    {
      name: "autenticação",
      response: () => jsonResponse({
        error: { message: "API key not valid" }
      }, 403),
      matches: (error) => error?.statusCode === 403
    },
    {
      name: "rede",
      response: () => {
        throw new TypeError("network failed");
      },
      matches: (error) => error instanceof TypeError
    }
  ];

  for (const scenario of scenarios) {
    await t.test(scenario.name, async () => {
      const provider = createGeminiProvider({ apiKey: "test-key" });
      let calls = 0;
      await withFetch(async () => {
        calls += 1;
        return scenario.response();
      }, async () => {
        await assert.rejects(
          () => generateCardAssistanceChangeSet({
            projectDocument: projectFixture(),
            selection,
            request: resourceRepairRequest,
            provider,
            modelId: "gemini-2.5-flash"
          }),
          scenario.matches
        );
      });
      assert.equal(calls, 1);
    });
  }
});

test("Gemini aplica timeout sem retentativa HTTP nem reconstrução", async () => {
  const provider = createGeminiProvider({ apiKey: "test-key" });
  let calls = 0;

  await withFetch((_url, init) => {
    calls += 1;
    return new Promise((_resolve, reject) => {
      init.signal.addEventListener("abort", () => {
        const error = new Error("aborted");
        error.name = "AbortError";
        reject(error);
      });
    });
  }, async () => {
    await assert.rejects(
      () => provider.generateStructured({
        modelId: "gemini-2.5-flash",
        timeoutMs: 5,
        schema: {
          type: "object",
          required: ["ok"],
          properties: { ok: { type: "boolean" } }
        },
        prompt: "Teste."
      }),
      (error) => error?.category === "timeout" && error?.code === "ETIMEDOUT"
    );
  });

  assert.equal(calls, 1);
});

test("Gemini limita retentativa HTTP transitória a duas chamadas", async () => {
  const provider = createGeminiProvider({ apiKey: "test-key" });
  let calls = 0;
  await withFetch(async () => {
    calls += 1;
    return jsonResponse({ error: { message: "Temporarily unavailable" } }, 503);
  }, async () => {
    await assert.rejects(
      () => provider.generateStructured({
        modelId: "gemini-2.5-flash",
        maxAttempts: 99,
        maxRetryDelayMs: 1000,
        schema: {
          type: "object",
          required: ["ok"],
          properties: { ok: { type: "boolean" } }
        },
        prompt: "Teste."
      }),
      (error) => error?.statusCode === 503
    );
  });
  assert.equal(calls, 2);
});

test("bridge local aceita objeto estruturado direto e explicita JSON no prompt", async () => {
  const provider = createCodexCliProvider({
    endpoint: "http://127.0.0.1:4183/assist",
    token: CODEX_BRIDGE_TOKEN
  });
  const schema = {
    type: "object",
    required: ["replacements"],
    properties: { replacements: { type: "array" } }
  };
  let payload;
  await withFetch(async (_url, init) => {
    payload = JSON.parse(init.body);
    return jsonResponse({
      ok: true,
      result: repairedResourceValue()
    });
  }, async () => {
    const result = await provider.generateStructured({
      modelId: "codex-cli-local",
      phase: "card_assistance_resource_repair",
      schema,
      prompt: "Corrija."
    });
    assert.deepEqual(result.value, repairedResourceValue());
  });
  const projectedSchema = toStrictJsonSchema(schema);
  assert.match(payload.request.prebuiltPrompt, /objeto JSON válido/u);
  assert.equal(payload.request.prebuiltPrompt.includes(JSON.stringify(schema)), false);
  assert.deepEqual(payload.request.schema, projectedSchema);
  assert.deepEqual(payload.request.guidanceSchema, schema);
});

test("bridge local classifica JSON inválido e timeout sem retry interno", async (t) => {
  await t.test("JSON inválido", async () => {
    const provider = createCodexCliProvider({ token: CODEX_BRIDGE_TOKEN });
    let calls = 0;
    await withFetch(async () => {
      calls += 1;
      return jsonResponse({
        ok: true,
        result: { text: "{json-incompleto", usage: {} }
      });
    }, async () => {
      await assert.rejects(
        () => provider.generateStructured({
          phase: "card_assistance_build",
          schema: {
            type: "object",
            required: ["ok"],
            properties: { ok: { type: "boolean" } }
          },
          prompt: "Teste."
        }),
        (error) => error?.category === "invalid_structured_json"
      );
    });
    assert.equal(calls, 1);
  });

  await t.test("envelope de falha em HTTP 200", async () => {
    const provider = createCodexCliProvider({ token: CODEX_BRIDGE_TOKEN });
    let calls = 0;
    await withFetch(async () => {
      calls += 1;
      return jsonResponse({
        ok: false,
        error: { message: "Processo local interrompido." }
      });
    }, async () => {
      await assert.rejects(
        () => provider.generateStructured({
          phase: "card_assistance_build",
          schema: {
            type: "object",
            required: ["ok"],
            properties: { ok: { type: "boolean" } }
          },
          prompt: "Teste."
        }),
        (error) =>
          error?.statusCode === 502 &&
          error?.message === "Processo local interrompido."
      );
    });
    assert.equal(calls, 1);
  });

  await t.test("timeout", async () => {
    const provider = createCodexCliProvider({ token: CODEX_BRIDGE_TOKEN });
    let calls = 0;
    await withFetch((_url, init) => {
      calls += 1;
      return new Promise((_resolve, reject) => {
        init.signal.addEventListener("abort", () => {
          const error = new Error("aborted");
          error.name = "AbortError";
          reject(error);
        });
      });
    }, async () => {
      await assert.rejects(
        () => provider.generateStructured({
          phase: "card_assistance_build",
          timeoutMs: 5,
          schema: {
            type: "object",
            required: ["ok"],
            properties: { ok: { type: "boolean" } }
          },
          prompt: "Teste."
        }),
        (error) => error?.category === "timeout"
      );
    });
    assert.equal(calls, 1);
  });
});
