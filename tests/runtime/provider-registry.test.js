import test from "node:test";
import assert from "node:assert/strict";

import {
  assertProviderOriginAllowed,
  CUSTOM_PROVIDER_MODEL_ID,
  createRegisteredProvider,
  PROVIDER_PROTOCOL,
  ProviderConfigurationError
} from "../../src/generation/providers/providerRegistry.js";
import { resolveCodexLocalEndpoint } from "../../src/generation/providers/codexCliConfig.js";
import {
  applyAssistConfigPatch,
  normalizeAssistConfig,
  resolveCardAssistanceProviderReadiness
} from "../../src/generation/runtime/cardAssistanceConfig.js";
import { resolveCardAssistanceLaunchConfig } from "../../src/generation/runtime/cardAssistanceLaunchConfig.js";
import { renderProviderConfigOverlay } from "../../src/ui/renderProviderConfigOverlay.js";

function response(body, { ok = true, status = 200 } = {}) {
  return {
    ok,
    status,
    json: async () => body
  };
}

test("modelo livre usa o adaptador OpenAI compatível e o endpoint exato", async () => {
  const originalFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (url, init) => {
    requests.push({ url: String(url), init, body: JSON.parse(String(init.body)) });
    return response({
      choices: [{ message: { content: "resposta" }, finish_reason: "stop" }],
      usage: { prompt_tokens: 2, completion_tokens: 1, total_tokens: 3 }
    });
  };

  try {
    const launch = resolveCardAssistanceLaunchConfig({
      selectedModel: CUSTOM_PROVIDER_MODEL_ID,
      providerProtocol: PROVIDER_PROTOCOL.OPENAI_COMPATIBLE,
      customModelId: "deepseek-quality",
      providerEndpoint: "https://modelos.example.edu/v1/responses/chat/completions/",
      providerSecret: "segredo-temporario"
    });
    const result = await launch.provider.generateText({
      modelId: launch.modelId,
      prompt: "Explique.",
      system: "Responda diretamente."
    });

    assert.equal(launch.modelId, "deepseek-quality");
    assert.equal(launch.protocol, PROVIDER_PROTOCOL.OPENAI_COMPATIBLE);
    assert.equal(requests.length, 1);
    assert.equal(requests[0].url, "https://modelos.example.edu/v1/responses/chat/completions");
    assert.equal(requests[0].body.model, "deepseek-quality");
    assert.equal(requests[0].init.headers.authorization, "Bearer segredo-temporario");
    assert.equal(result.text, "resposta");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("modelo livre OpenAI compatível usa JSON mode explícito no fluxo estruturado", async () => {
  const originalFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (url, init) => {
    requests.push({ url: String(url), body: JSON.parse(String(init.body)) });
    return response({
      choices: [{
        message: { content: "{\"value\":\"ok\"}" },
        finish_reason: "stop"
      }],
      usage: {}
    });
  };

  try {
    const launch = resolveCardAssistanceLaunchConfig({
      selectedModel: CUSTOM_PROVIDER_MODEL_ID,
      providerProtocol: PROVIDER_PROTOCOL.OPENAI_COMPATIBLE,
      customModelId: "modelo-estruturado",
      providerEndpoint: "https://modelos.example.edu/v1/chat/completions",
      providerSecret: "segredo-temporario"
    });
    const result = await launch.provider.generateStructured({
      modelId: launch.modelId,
      phase: "card_assistance_text_edit",
      prompt: "Responda no contrato.",
      schema: {
        type: "object",
        additionalProperties: false,
        required: ["value"],
        properties: {
          value: { type: "string" }
        }
      }
    });

    assert.equal(requests.length, 1);
    assert.equal(requests[0].url, "https://modelos.example.edu/v1/chat/completions");
    assert.deepEqual(requests[0].body.response_format, { type: "json_object" });
    assert.match(requests[0].body.messages[1].content, /JSON_SCHEMA_DE_VALIDACAO_LOCAL/u);
    assert.deepEqual(result.value, { value: "ok" });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("modelo livre Gemini conserva o identificador informado e usa a API oficial", async () => {
  const originalFetch = globalThis.fetch;
  let requestedUrl = "";
  globalThis.fetch = async (url) => {
    requestedUrl = String(url);
    return response({
      candidates: [{ content: { parts: [{ text: "ok" }] } }],
      usageMetadata: {}
    });
  };

  try {
    const launch = resolveCardAssistanceLaunchConfig({
      selectedModel: CUSTOM_PROVIDER_MODEL_ID,
      providerProtocol: PROVIDER_PROTOCOL.GEMINI,
      customModelId: "gemini-modelo-futuro",
      providerSecret: "chave-efemera"
    });
    await launch.provider.generateText({ modelId: launch.modelId, prompt: "Teste" });

    assert.equal(launch.modelId, "gemini-modelo-futuro");
    assert.match(requestedUrl, /models\/gemini-modelo-futuro:generateContent$/u);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("presets DeepSeek V4, Gemini e bridge local mantêm seus adaptadores", () => {
  const deepSeekFlash = createRegisteredProvider({
    selectedModel: "deepseek-v4-flash",
    apiKey: "deepseek-key"
  });
  const deepSeekPro = createRegisteredProvider({
    selectedModel: "deepseek-v4-pro",
    apiKey: "deepseek-key"
  });
  const gemini = createRegisteredProvider({
    selectedModel: "gemini-2.5-flash",
    apiKey: "gemini-key"
  });
  const local = createRegisteredProvider({
    selectedModel: "codex-cli-local",
    codexEndpoint: "http://localhost:4183",
    codexToken: "aralearn-codex-local-token-tests-2026"
  });

  assert.equal(deepSeekFlash.protocol, PROVIDER_PROTOCOL.OPENAI_COMPATIBLE);
  assert.equal(deepSeekFlash.endpoint, "https://api.deepseek.com");
  assert.equal(deepSeekPro.protocol, PROVIDER_PROTOCOL.OPENAI_COMPATIBLE);
  assert.equal(deepSeekPro.modelId, "deepseek-v4-pro");
  assert.equal(gemini.protocol, PROVIDER_PROTOCOL.GEMINI);
  assert.equal(local.protocol, PROVIDER_PROTOCOL.LOCAL_BRIDGE);
  assert.equal(local.endpoint, "http://localhost:4183/assist");
  assert.equal(typeof deepSeekFlash.provider.generateText, "function");
  assert.equal(typeof gemini.provider.generateText, "function");
  assert.equal(typeof local.provider.generateText, "function");
});

test("configuração inválida falha antes de qualquer chamada", async () => {
  const originalFetch = globalThis.fetch;
  let fetchCount = 0;
  globalThis.fetch = async () => {
    fetchCount += 1;
    return response({});
  };

  try {
    assert.throws(
      () => resolveCardAssistanceLaunchConfig({
        selectedModel: CUSTOM_PROVIDER_MODEL_ID,
        providerProtocol: PROVIDER_PROTOCOL.OPENAI_COMPATIBLE,
        customModelId: "modelo-x",
        providerEndpoint: "http://modelos.example.edu/v1/chat/completions",
        providerSecret: "x"
      }),
      (error) => error instanceof ProviderConfigurationError && /HTTPS/u.test(error.message)
    );
    assert.throws(
      () => resolveCardAssistanceLaunchConfig({
        selectedModel: CUSTOM_PROVIDER_MODEL_ID,
        providerProtocol: PROVIDER_PROTOCOL.OPENAI_COMPATIBLE,
        customModelId: "",
        providerEndpoint: "https://modelos.example.edu/v1/chat/completions",
        providerSecret: "x"
      }),
      /identificador do modelo/u
    );
    assert.throws(
      () => resolveCardAssistanceLaunchConfig({
        selectedModel: CUSTOM_PROVIDER_MODEL_ID,
        providerProtocol: PROVIDER_PROTOCOL.OPENAI_COMPATIBLE,
        customModelId: "modelo-x",
        providerEndpoint: "https://modelos.example.edu/v1/chat/completions?key=segredo",
        providerSecret: "x"
      }),
      /consulta nem fragmento/u
    );
    assert.equal(fetchCount, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("endpoint precisa estar na lista exata da instalação", () => {
  assert.doesNotThrow(() => assertProviderOriginAllowed(
    "https://modelos.example.edu/v1/chat/completions",
    { assistAllowedOrigins: ["https://modelos.example.edu"] }
  ));
  assert.throws(
    () => assertProviderOriginAllowed(
      "https://outro.example.edu/v1/chat/completions",
      { assistAllowedOrigins: ["https://modelos.example.edu"] }
    ),
    /não está autorizada/u
  );
});

test("bridge personalizado inválido não chega à verificação de saúde", async () => {
  let healthChecks = 0;
  const readiness = await resolveCardAssistanceProviderReadiness({
    selectedModel: CUSTOM_PROVIDER_MODEL_ID,
    providerProtocol: PROVIDER_PROTOCOL.LOCAL_BRIDGE,
    customModelId: "",
    providerEndpoint: "http://127.0.0.1:4183/assist",
    providerSecret: "token",
    checkCodexLocalHealth: async () => {
      healthChecks += 1;
      return { ok: true };
    }
  });

  assert.equal(readiness.ok, false);
  assert.equal(readiness.configurationError, true);
  assert.match(readiness.error, /identificador do modelo/u);
  assert.equal(healthChecks, 0);
});

test("HTTP no bridge é restrito ao próprio dispositivo", () => {
  assert.equal(resolveCodexLocalEndpoint("http://127.0.0.1:4183"), "http://127.0.0.1:4183/assist");
  assert.equal(resolveCodexLocalEndpoint("http://localhost:4183/health"), "http://localhost:4183/assist");
  assert.throws(
    () => resolveCodexLocalEndpoint("http://bridge.example.edu/assist"),
    /próprio dispositivo/u
  );
  assert.equal(
    resolveCodexLocalEndpoint("https://bridge.example.edu/assist"),
    "https://bridge.example.edu/assist"
  );
});

test("bridge personalizado recebe o modelo livre e somente o token correspondente", async () => {
  const bridgeToken = "aralearn-bridge-personalizado-token-2026";
  const originalFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (url, init) => {
    requests.push({ url: String(url), init, body: JSON.parse(String(init.body)) });
    return response({ result: { text: "ok" } });
  };

  try {
    const launch = resolveCardAssistanceLaunchConfig({
      selectedModel: CUSTOM_PROVIDER_MODEL_ID,
      providerProtocol: PROVIDER_PROTOCOL.LOCAL_BRIDGE,
      customModelId: "modelo-local-escolhido",
      providerEndpoint: "http://127.0.0.1:4183",
      providerSecret: bridgeToken,
      codexToken: "token-de-outro-preset"
    });
    await launch.provider.generateText({
      modelId: launch.modelId,
      phase: "card_assistance_build",
      prompt: "Teste"
    });

    assert.equal(requests.length, 1);
    assert.equal(requests[0].url, "http://127.0.0.1:4183/assist");
    assert.equal(requests[0].body.modelId, "modelo-local-escolhido");
    assert.equal(requests[0].init.headers["x-aralearn-token"], bridgeToken);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("bridge personalizado vazio falha sem reaproveitar token de outro preset", async () => {
  let receivedToken = "não chamado";
  const readiness = await resolveCardAssistanceProviderReadiness({
    selectedModel: CUSTOM_PROVIDER_MODEL_ID,
    providerProtocol: PROVIDER_PROTOCOL.LOCAL_BRIDGE,
    customModelId: "modelo-local",
    providerEndpoint: "http://127.0.0.1:4183/assist",
    providerSecret: "",
    codexToken: "aralearn-token-de-outro-preset-2026",
    checkCodexLocalHealth: async ({ token }) => {
      receivedToken = token;
      return { ok: true };
    }
  });

  assert.equal(readiness.ok, false);
  assert.equal(readiness.configurationError, true);
  assert.match(readiness.error, /token do bridge local entre 32 e 512 bytes/u);
  assert.equal(receivedToken, "não chamado");
});

test("erro do serviço não devolve a chave configurada", async () => {
  const originalFetch = globalThis.fetch;
  const secret = "segredo-que-nao-pode-vazar";
  globalThis.fetch = async () => response(
    { error: { message: `Credencial rejeitada: Bearer ${secret}` } },
    { ok: false, status: 401 }
  );

  try {
    const launch = resolveCardAssistanceLaunchConfig({
      selectedModel: CUSTOM_PROVIDER_MODEL_ID,
      providerProtocol: PROVIDER_PROTOCOL.OPENAI_COMPATIBLE,
      customModelId: "modelo-x",
      providerEndpoint: "https://modelos.example.edu/v1/chat/completions",
      providerSecret: secret
    });
    await assert.rejects(
      () => launch.provider.generateText({ modelId: launch.modelId, prompt: "Teste" }),
      (error) => {
        assert.equal(error.statusCode, 401);
        assert.doesNotMatch(error.message, new RegExp(secret, "u"));
        assert.match(error.message, /segredo oculto/u);
        assert.equal(error.payload, undefined);
        return true;
      }
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("segredos da assistência permanecem no estado volátil", () => {
  let storageCalls = 0;
  const previousLocalStorage = globalThis.localStorage;
  const previousIndexedDb = globalThis.indexedDB;
  globalThis.localStorage = {
    setItem() { storageCalls += 1; },
    getItem() { storageCalls += 1; }
  };
  globalThis.indexedDB = {
    open() { storageCalls += 1; }
  };

  try {
    const next = applyAssistConfigPatch({
      assistConfig: normalizeAssistConfig({}),
      patch: {
        model: CUSTOM_PROVIDER_MODEL_ID,
        providerProtocol: PROVIDER_PROTOCOL.OPENAI_COMPATIBLE,
        customModelId: "modelo-x",
        providerEndpoint: "https://modelos.example.edu/v1/chat/completions",
        providerSecret: "somente-na-memoria"
      }
    });
    assert.equal(next.assistConfig.providerSecret, "somente-na-memoria");
    assert.equal(storageCalls, 0);
  } finally {
    globalThis.localStorage = previousLocalStorage;
    globalThis.indexedDB = previousIndexedDb;
  }
});

test("assistência não escolhe provider silenciosamente", async () => {
  const config = normalizeAssistConfig({});
  assert.equal(config.model, "");
  assert.equal("selectedProfileId" in config, false);
  assert.equal("customProfiles" in config, false);

  const readiness = await resolveCardAssistanceProviderReadiness({ selectedModel: config.model });
  assert.equal(readiness.ok, false);
  assert.equal(readiness.configurationError, true);
  assert.match(readiness.error, /Modelo de geração não suportado/u);
});

test("provider Gemini não injeta modelo quando a seleção está vazia", async () => {
  const gemini = createRegisteredProvider({
    selectedModel: "gemini-2.5-flash",
    apiKey: "gemini-key"
  });
  await assert.rejects(
    () => gemini.provider.generateText({ prompt: "Teste" }),
    /Escolha um modelo Gemini/u
  );
});

test("overlay personalizado preserva o desenho compacto e identifica campos sensíveis", () => {
  const html = renderProviderConfigOverlay({
    selectedModel: CUSTOM_PROVIDER_MODEL_ID,
    modelOptions: [
      { value: "deepseek-v4-flash", label: "DeepSeek V4 Flash" },
      { value: "deepseek-v4-pro", label: "DeepSeek V4 Pro" },
      { value: CUSTOM_PROVIDER_MODEL_ID, label: "Outro modelo" }
    ],
    providerProtocol: PROVIDER_PROTOCOL.OPENAI_COMPATIBLE,
    customModelId: "modelo-x",
    providerEndpoint: "https://modelos.example.edu/v1/chat/completions",
    providerSecret: "segredo"
  });

  assert.match(html, /data-field="assist-model"[^>]*aria-label="Provider e modelo"/u);
  assert.match(html, /<option value="provider-custom" selected>Outro modelo<\/option>/u);
  assert.match(html, /data-field="provider-config-protocol"/u);
  assert.match(html, /data-field="provider-config-model"/u);
  assert.match(html, /data-field="provider-config-endpoint"/u);
  assert.match(html, /data-field="provider-config-secret" type="password"/u);
  assert.doesNotMatch(html, /Contexto didático|provider-config-open-didactic|deepseek-chat|DeepSeek V3/u);
  assert.doesNotMatch(html, /localStorage|IndexedDB/u);
});

test("overlay exige escolha explícita e oferece os modelos DeepSeek vigentes", () => {
  const html = renderProviderConfigOverlay({
    modelOptions: [
      { value: "deepseek-v4-flash", label: "DeepSeek V4 Flash" },
      { value: "deepseek-v4-pro", label: "DeepSeek V4 Pro" },
      { value: "gemini-3.6-flash", label: "Gemini 3.6 Flash" }
    ]
  });

  assert.match(html, /<option value="" selected>Escolher provider e modelo<\/option>/u);
  assert.match(html, /<option value="deepseek-v4-flash">DeepSeek V4 Flash<\/option>/u);
  assert.match(html, /<option value="deepseek-v4-pro">DeepSeek V4 Pro<\/option>/u);
  assert.doesNotMatch(html, /data-field="assist-api-key"|provider-config-open-didactic|Contexto didático/u);
});
