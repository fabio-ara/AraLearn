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
  normalizeAssistConfig
} from "../../src/generation/runtime/generationEditorRuntime.js";
import { resolveGenerationLaunchConfig } from "../../src/generation/runtime/launchConfig.js";
import { resolveGenerationProviderReadiness } from "../../src/generation/runtime/generationViewModel.js";
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
    const launch = resolveGenerationLaunchConfig({
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
    const launch = resolveGenerationLaunchConfig({
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

test("presets DeepSeek, Gemini e bridge local mantêm seus adaptadores", () => {
  const deepSeek = createRegisteredProvider({
    selectedModel: "deepseek-v4-flash",
    apiKey: "deepseek-key"
  });
  const gemini = createRegisteredProvider({
    selectedModel: "gemini-2.5-flash",
    apiKey: "gemini-key"
  });
  const local = createRegisteredProvider({
    selectedModel: "codex-cli-local",
    codexEndpoint: "http://localhost:4183",
    codexToken: "local-token"
  });

  assert.equal(deepSeek.protocol, PROVIDER_PROTOCOL.OPENAI_COMPATIBLE);
  assert.equal(deepSeek.endpoint, "https://api.deepseek.com");
  assert.equal(gemini.protocol, PROVIDER_PROTOCOL.GEMINI);
  assert.equal(local.protocol, PROVIDER_PROTOCOL.LOCAL_BRIDGE);
  assert.equal(local.endpoint, "http://localhost:4183/assist");
  assert.equal(typeof deepSeek.provider.generateText, "function");
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
      () => resolveGenerationLaunchConfig({
        selectedModel: CUSTOM_PROVIDER_MODEL_ID,
        providerProtocol: PROVIDER_PROTOCOL.OPENAI_COMPATIBLE,
        customModelId: "modelo-x",
        providerEndpoint: "http://modelos.example.edu/v1/chat/completions",
        providerSecret: "x"
      }),
      (error) => error instanceof ProviderConfigurationError && /HTTPS/u.test(error.message)
    );
    assert.throws(
      () => resolveGenerationLaunchConfig({
        selectedModel: CUSTOM_PROVIDER_MODEL_ID,
        providerProtocol: PROVIDER_PROTOCOL.OPENAI_COMPATIBLE,
        customModelId: "",
        providerEndpoint: "https://modelos.example.edu/v1/chat/completions",
        providerSecret: "x"
      }),
      /identificador do modelo/u
    );
    assert.throws(
      () => resolveGenerationLaunchConfig({
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
  const readiness = await resolveGenerationProviderReadiness({
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
  const originalFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (url, init) => {
    requests.push({ url: String(url), init, body: JSON.parse(String(init.body)) });
    return response({ result: { text: "ok" } });
  };

  try {
    const launch = resolveGenerationLaunchConfig({
      selectedModel: CUSTOM_PROVIDER_MODEL_ID,
      providerProtocol: PROVIDER_PROTOCOL.LOCAL_BRIDGE,
      customModelId: "modelo-local-escolhido",
      providerEndpoint: "http://127.0.0.1:4183",
      providerSecret: "token-do-bridge",
      codexToken: "token-de-outro-preset"
    });
    await launch.provider.generateText({ modelId: launch.modelId, prompt: "Teste" });

    assert.equal(requests.length, 1);
    assert.equal(requests[0].url, "http://127.0.0.1:4183/assist");
    assert.equal(requests[0].body.modelId, "modelo-local-escolhido");
    assert.equal(requests[0].init.headers["x-aralearn-token"], "token-do-bridge");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("verificação do bridge personalizado não reaproveita token de outro preset", async () => {
  let receivedToken = "não chamado";
  const readiness = await resolveGenerationProviderReadiness({
    selectedModel: CUSTOM_PROVIDER_MODEL_ID,
    providerProtocol: PROVIDER_PROTOCOL.LOCAL_BRIDGE,
    customModelId: "modelo-local",
    providerEndpoint: "http://127.0.0.1:4183/assist",
    providerSecret: "",
    codexToken: "token-do-preset-codex",
    checkCodexLocalHealth: async ({ token }) => {
      receivedToken = token;
      return { ok: true };
    }
  });

  assert.equal(readiness.ok, true);
  assert.equal(receivedToken, "");
});

test("erro do serviço não devolve a chave configurada", async () => {
  const originalFetch = globalThis.fetch;
  const secret = "segredo-que-nao-pode-vazar";
  globalThis.fetch = async () => response(
    { error: { message: `Credencial rejeitada: Bearer ${secret}` } },
    { ok: false, status: 401 }
  );

  try {
    const launch = resolveGenerationLaunchConfig({
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

test("overlay personalizado preserva o desenho compacto e identifica campos sensíveis", () => {
  const html = renderProviderConfigOverlay({
    selectedModel: CUSTOM_PROVIDER_MODEL_ID,
    providerProtocol: PROVIDER_PROTOCOL.OPENAI_COMPATIBLE,
    customModelId: "modelo-x",
    providerEndpoint: "https://modelos.example.edu/v1/chat/completions",
    providerSecret: "segredo"
  });

  assert.match(html, /data-field="provider-config-protocol"/u);
  assert.match(html, /data-field="provider-config-model"/u);
  assert.match(html, /data-field="provider-config-endpoint"/u);
  assert.match(html, /data-field="provider-config-secret" type="password"/u);
  assert.doesNotMatch(html, /localStorage|IndexedDB/u);
});
