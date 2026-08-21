import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  buildStudyUnitAssistancePrompt,
  requestStudyUnitAssistanceCandidate,
  STUDY_UNIT_ASSISTANCE_LIMITS,
  studyUnitAssistanceTargetAvailability
} from "../../src/assist/studyUnitProviderAssistance.js";
import {
  buildStudyUnitProviderRequest,
  callStudyUnitProvider,
  normalizeStudyUnitProviderConfig,
  parseStudyUnitProviderOutput,
  STUDY_UNIT_PROVIDER_LIMITS
} from "../../src/generation/providers/studyUnitAssistanceProviders.js";
import {
  createStudyUnitProviderSession,
  renderStudyUnitAssistanceTrigger,
  STUDY_UNIT_ASSISTANCE_DISCLOSURE
} from "../../src/ui/StudyUnitProviderAssistance.js";

const RUNTIME = Object.freeze({
  developmentRuntime: true,
  assistAllowedOrigins: Object.freeze([
    "https://api.openai.com",
    "https://generativelanguage.googleapis.com",
    "https://api.deepseek.com",
    "http://127.0.0.1:4183"
  ])
});

function studyUnit() {
  return {
    id: "study-unit-assistance",
    position: 1,
    title: "Relações",
    role: "theory",
    content: [{
      id: "paragraph",
      package: "aralearn.resource.paragraph",
      version: "1.0.0",
      data: { text: "Texto atual." }
    }],
    response: null,
    feedback: [],
    topics: ["Relações", "Funções"]
  };
}

function jsonResponse(data, { status = 200 } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() { return data; }
  };
}

function providerOutput(providerId, value) {
  const content = JSON.stringify(value);
  if (providerId === "openai") {
    return { output: [{ content: [{ type: "output_text", text: content }] }] };
  }
  if (providerId === "gemini") {
    return {
      candidates: [{ finishReason: "STOP", content: { parts: [{ text: content }] } }]
    };
  }
  return { choices: [{ finish_reason: "stop", message: { content } }] };
}

test("sessão compartilhável mantém configuração somente em memória e zera a credencial ao destruir", () => {
  const session = createStudyUnitProviderSession();
  session.update({
    providerId: "openai",
    model: "gpt-5-mini",
    endpoint: "https://api.openai.com/v1/responses",
    apiKey: "segredo-da-sessao",
    timeoutMs: 45_000
  });
  assert.equal(session.read().apiKey, "segredo-da-sessao");
  assert.deepEqual(session.snapshot(), {
    providerId: "openai",
    model: "gpt-5-mini",
    endpoint: "https://api.openai.com/v1/responses",
    hasCredential: true,
    destroyed: false
  });
  assert.doesNotMatch(JSON.stringify(session.snapshot()), /segredo-da-sessao/u);
  session.destroy();
  assert.deepEqual(session.snapshot(), {
    providerId: "",
    model: "",
    endpoint: "",
    hasCredential: false,
    destroyed: true
  });
  assert.throws(() => session.read(), /sessão de assistência foi encerrada/u);
  assert.throws(() => session.update({ providerId: "local" }), /sessão de assistência foi encerrada/u);
});

test("runtime autenticado injeta a mesma sessão efêmera em Estudo e Autoria e a destrói ao sair", () => {
  const source = readFileSync(new URL("../../public/main.js", import.meta.url), "utf8");
  assert.match(source, /studyUnitProviderSession\s*=\s*createStudyUnitProviderSession\(\)/u);
  assert.match(
    source,
    /createCourseStudyApplication\(\{[\s\S]*?providerAssistanceSession:\s*studyUnitProviderSession[\s\S]*?\}\)/u
  );
  assert.match(
    source,
    /createCourseAuthoringSurface\(\{[\s\S]*?providerAssistanceSession:\s*studyUnitProviderSession[\s\S]*?\}\)/u
  );
  assert.ok((source.match(/studyUnitProviderSession\?\.destroy\?\.\(\)/gu) || []).length >= 2);
  assert.match(
    source,
    /const cleanupApplication = \(\) => \{[\s\S]*?authoringSurface\?\.destroy\?\.\(\)[\s\S]*?editorApp\?\.destroy\?\.\(\)[\s\S]*?authenticatedApplicationCleanup = cleanupApplication/u
  );
  assert.match(
    source,
    /async function closeAraLearnLocalConnections\(\)[\s\S]*?authenticatedApplicationCleanup\?\.\(\)[\s\S]*?studyUnitProviderSession\?\.destroy\?\.\(\)/u
  );
  assert.match(
    source,
    /\["SIGNED_OUT_REMOTE", "SESSION_INVALID", "SIGNED_OUT"\][\s\S]*?shutDownAuthenticatedRuntime\(root\)/u
  );
});

test("gatilhos são compactos, acessíveis e aparecem sem rótulo textual permanente", () => {
  const study = renderStudyUnitAssistanceTrigger({ context: "study" });
  const inspection = renderStudyUnitAssistanceTrigger({
    context: "inspection",
    studyUnitId: "unit-1"
  });
  for (const html of [study, inspection]) {
    assert.match(html, /aria-label="Assistência por API"/u);
    assert.match(html, /title="Assistência por API"/u);
    assert.match(html, /<svg/u);
    assert.doesNotMatch(html, />\s*Assistência por API\s*</u);
  }
  assert.match(study, /data-action="study-provider-assistance"/u);
  assert.match(inspection, /data-inspection-provider-assistance/u);
});

test("alvos extensos são recusados antes de abrir a assistência e explicam o motivo", () => {
  const codeUnit = studyUnit();
  codeUnit.content = [{
    id: "code-long",
    package: "aralearn.resource.code",
    version: "1.0.0",
    data: {
      prompt: "Leia o código.",
      language: "text",
      code: "x".repeat(STUDY_UNIT_ASSISTANCE_LIMITS.maximumPathValueLength + 1)
    }
  }];
  const terminalUnit = studyUnit();
  terminalUnit.content = [{
    id: "terminal-long",
    package: "aralearn.resource.terminal_session",
    version: "1.0.0",
    data: {
      prompt: "Leia a sessão.",
      environment: "Terminal local",
      interactions: [{
        prompt: "$",
        input: "executar",
        stdout: "x".repeat(STUDY_UNIT_ASSISTANCE_LIMITS.maximumPathValueLength + 1),
        exitCode: 0,
        effect: "execução concluída"
      }]
    }
  }];
  for (const [unit, targetId] of [
    [codeUnit, "content:code-long"],
    [terminalUnit, "content:terminal-long"]
  ]) {
    const availability = studyUnitAssistanceTargetAvailability({
      studyUnit: unit,
      targetId
    });
    assert.deepEqual(availability, {
      available: false,
      reason: "O trecho selecionado é grande demais para a assistência contextual.",
      editablePathCount: 0
    });
    assert.throws(() => buildStudyUnitAssistancePrompt({
      studyUnit: unit,
      targetId,
      instruction: "Resuma sem perder informação."
    }), /grande demais/u);
  }
  const trigger = renderStudyUnitAssistanceTrigger({
    context: "study",
    unavailableReason: "O trecho selecionado é grande demais para a assistência contextual."
  });
  assert.match(trigger, /disabled aria-disabled="true"/u);
  assert.match(trigger, /aria-label="Assistência por API indisponível: O trecho selecionado/u);
  assert.doesNotMatch(trigger, />\s*O trecho selecionado/u);
});

test("saída esparsa suporta um campo denso dentro do orçamento sem ecoar os demais", async () => {
  const original = "界".repeat(STUDY_UNIT_ASSISTANCE_LIMITS.maximumPathValueLength - 1);
  const replacement = `${original.slice(0, -1)}語`;
  const unit = studyUnit();
  unit.content = [{
    id: "code-dense",
    package: "aralearn.resource.code",
    version: "1.0.0",
    data: { prompt: "Leia.", language: "text", code: original }
  }];
  assert.deepEqual(studyUnitAssistanceTargetAvailability({
    studyUnit: unit,
    targetId: "content:code-dense"
  }), { available: true, reason: "", editablePathCount: 2 });
  const result = await requestStudyUnitAssistanceCandidate({
    studyUnit: unit,
    targetId: "content:code-dense",
    instruction: "Ajuste somente o último caractere.",
    providerConfig: { providerId: "local", model: "local" },
    runtimeConfig: RUNTIME,
    fetchImpl: async () => jsonResponse(providerOutput("local", {
      message: "Último caractere ajustado.",
      changes: [{ path: "code", value: replacement }]
    }))
  });
  assert.equal(result.pathValues.prompt, "Leia.");
  assert.equal(result.pathValues.code, replacement);
  assert.equal(result.previewStudyUnit.content[0].data.code, replacement);
});

test("OpenAI Responses usa saída estruturada oficial, store false e não põe segredo no corpo ou URL", async () => {
  const secret = "sk-segredo-que-nao-pode-vazar";
  let captured;
  const result = await requestStudyUnitAssistanceCandidate({
    studyUnit: studyUnit(),
    targetId: "content:paragraph",
    instruction: "Deixe o texto mais direto.",
    providerConfig: {
      providerId: "openai",
      model: "gpt-5-mini",
      apiKey: secret
    },
    runtimeConfig: RUNTIME,
    fetchImpl: async (url, init) => {
      captured = { url, init };
      return jsonResponse(providerOutput("openai", {
        message: "Texto simplificado.",
        changes: [{ path: "text", value: "Texto direto." }]
      }));
    }
  });
  const body = JSON.parse(captured.init.body);
  assert.equal(captured.url, "https://api.openai.com/v1/responses");
  assert.equal(captured.init.headers.authorization, `Bearer ${secret}`);
  assert.equal(body.store, false);
  assert.equal(body.max_output_tokens, 8_000);
  assert.equal(body.text.format.type, "json_schema");
  assert.equal(body.text.format.strict, true);
  assert.equal(body.text.format.schema.additionalProperties, false);
  assert.match(body.instructions, /path autorizado/u);
  assert.equal(body.text.format.schema.properties.changes.maxItems, 1);
  assert.match(body.input, /aralearn\.study-unit-contextual-assistance\.v1/u);
  assert.doesNotMatch(`${captured.url}${captured.init.body}`, new RegExp(secret, "u"));
  assert.deepEqual(result.pathValues, { text: "Texto direto." });
  assert.equal(result.previewStudyUnit.content[0].data.text, "Texto direto.");
  assert.equal(result.noOp, false);
});

test("Gemini usa chave em header e schema de resposta sem consulta na URL", async () => {
  const config = normalizeStudyUnitProviderConfig({
    providerId: "gemini",
    model: "gemini-2.5-flash",
    apiKey: "gemini-secret"
  }, RUNTIME);
  const request = buildStudyUnitProviderRequest(config, {
    system: "Sistema",
    prompt: "Pedido",
    schema: { type: "object", additionalProperties: false, properties: {} }
  });
  const body = JSON.parse(request.init.body);
  assert.equal(
    request.url,
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent"
  );
  assert.equal(request.init.headers["x-goog-api-key"], "gemini-secret");
  assert.equal(body.generationConfig.responseMimeType, "application/json");
  assert.equal(body.generationConfig.responseSchema.type, "object");
  assert.doesNotMatch(request.url, /key=|gemini-secret/u);
  assert.deepEqual(parseStudyUnitProviderOutput("gemini", providerOutput("gemini", {
    message: "Ok", changes: [{ path: "text", value: "Novo" }]
  })), { message: "Ok", changes: [{ path: "text", value: "Novo" }] });
});

test("DeepSeek e serviço local usam contrato compatível e seleção explícita", () => {
  const deepSeek = normalizeStudyUnitProviderConfig({
    providerId: "deepseek",
    model: "deepseek-chat",
    apiKey: "deepseek-secret"
  }, RUNTIME);
  const local = normalizeStudyUnitProviderConfig({
    providerId: "local",
    model: "modelo-local",
    endpoint: "http://127.0.0.1:4183/assist"
  }, RUNTIME);
  for (const config of [deepSeek, local]) {
    const request = buildStudyUnitProviderRequest(config, {
      system: "Sistema",
      prompt: "Pedido",
      schema: { type: "object", properties: {} }
    });
    const body = JSON.parse(request.init.body);
    assert.equal(body.response_format.type, "json_object");
    assert.equal(body.messages[0].role, "system");
    assert.equal(body.messages[1].role, "user");
  }
  assert.equal(deepSeek.endpoint, "https://api.deepseek.com/chat/completions");
  assert.equal(local.endpoint, "http://127.0.0.1:4183/assist");
  assert.equal(buildStudyUnitProviderRequest(local, {
    system: "Sistema",
    prompt: "Pedido",
    schema: { type: "object", properties: {} }
  }).init.targetAddressSpace, "loopback");
  for (const [endpoint, expectedAddressSpace] of [
    ["http://localhost:4183/assist", "loopback"],
    ["http://10.0.2.2:4183/assist", "local"]
  ]) {
    const runtime = {
      ...RUNTIME,
      assistAllowedOrigins: [
        ...RUNTIME.assistAllowedOrigins,
        new URL(endpoint).origin
      ]
    };
    const config = normalizeStudyUnitProviderConfig({
      providerId: "local",
      model: "modelo-local",
      endpoint
    }, runtime);
    assert.equal(buildStudyUnitProviderRequest(config, {
      system: "Sistema",
      prompt: "Pedido",
      schema: { type: "object", properties: {} }
    }).init.targetAddressSpace, expectedAddressSpace);
  }
  assert.throws(
    () => normalizeStudyUnitProviderConfig({ model: "x", apiKey: "y" }, RUNTIME),
    /Escolha explicitamente/u
  );
});

test("origem bloqueada falha antes de qualquer fetch", async () => {
  let fetchCalls = 0;
  await assert.rejects(
    requestStudyUnitAssistanceCandidate({
      studyUnit: studyUnit(),
      targetId: "content:paragraph",
      instruction: "Melhore.",
      providerConfig: {
        providerId: "openai",
        model: "gpt-5-mini",
        apiKey: "secret",
        endpoint: "https://proxy-nao-autorizado.example/v1/responses"
      },
      runtimeConfig: RUNTIME,
      fetchImpl: async () => {
        fetchCalls += 1;
        return jsonResponse({});
      }
    }),
    /não está autorizada/u
  );
  assert.equal(fetchCalls, 0);
});

test("cada serviço aceita somente a própria origem antes de receber a credencial", async () => {
  for (const [providerId, endpoint] of [
    ["openai", "https://api.deepseek.com/v1/responses"],
    ["deepseek", "https://api.openai.com/chat/completions"],
    ["gemini", "http://127.0.0.1:4183/generateContent"],
    ["local", "https://generativelanguage.googleapis.com/v1/chat/completions"]
  ]) {
    let fetchCalls = 0;
    await assert.rejects(
      requestStudyUnitAssistanceCandidate({
        studyUnit: studyUnit(),
        targetId: "content:paragraph",
        instruction: "Melhore.",
        providerConfig: {
          providerId,
          model: providerId === "gemini" ? "gemini-2.5-flash" : "modelo",
          apiKey: "credencial-que-nao-pode-sair",
          endpoint
        },
        runtimeConfig: RUNTIME,
        fetchImpl: async () => {
          fetchCalls += 1;
          return jsonResponse({});
        }
      }),
      (error) => error?.code === "provider_endpoint_mismatch"
    );
    assert.equal(fetchCalls, 0);
  }
});

test("produção aceita somente relay local sem credencial no navegador", () => {
  const production = {
    assistAllowedOrigins: [
      "http://127.0.0.1:4183",
      "https://api.openai.com"
    ]
  };
  assert.throws(() => normalizeStudyUnitProviderConfig({
    providerId: "openai",
    model: "gpt-5-mini",
    apiKey: "chave-longa",
    endpoint: "https://api.openai.com/v1/responses"
  }, production), /serviço local|não são aceitas/iu);
  assert.throws(() => normalizeStudyUnitProviderConfig({
    providerId: "local",
    model: "relay",
    apiKey: "token-longo",
    endpoint: "http://127.0.0.1:4183/v1/chat/completions"
  }, production), /fora do AraLearn/iu);
  assert.deepEqual(normalizeStudyUnitProviderConfig({
    providerId: "local",
    model: "relay",
    endpoint: "http://127.0.0.1:4183/v1/chat/completions"
  }, production), {
    providerId: "local",
    model: "relay",
    endpoint: "http://127.0.0.1:4183/v1/chat/completions",
    apiKey: "",
    timeoutMs: 45_000
  });
});

test("prompt limita o contexto ao texto autorizado e nunca envia PDF, Fonte ou blob", () => {
  const unit = studyUnit();
  unit.internalPdf = { blob: "PDF-BRUTO", url: "https://fonte.example/artigo.pdf" };
  unit.sourceLinks = [{ sourceId: "fonte-secreta" }];
  const built = buildStudyUnitAssistancePrompt({
    studyUnit: unit,
    targetId: "content:paragraph",
    instruction: "Simplifique.",
    conversationTurns: Array.from({ length: 12 }, (_, index) => ({
      request: `Pedido ${index}`,
      response: `Resposta ${index}`,
      outcome: "applied"
    }))
  });
  const envelope = JSON.parse(built.prompt);
  assert.deepEqual(Object.keys(envelope.writableTarget), ["pathValues"]);
  assert.deepEqual(Object.keys(envelope.readOnlyContext), ["title", "role", "topics"]);
  assert.equal(envelope.priorConversation.length, STUDY_UNIT_ASSISTANCE_LIMITS.maximumConversationTurns);
  assert.doesNotMatch(built.prompt, /PDF-BRUTO|fonte-secreta|artigo\.pdf/u);
  for (const expected of [
    "pedido", "texto editável selecionado", "título", "papel", "tópicos",
    "mensagens anteriores", "PDFs", "Fontes", "identidades internas", "outras Unidades",
    "somente na memória", "serviço local pode encaminhar", "eventual retenção", "política"
  ]) {
    assert.match(STUDY_UNIT_ASSISTANCE_DISCLOSURE, new RegExp(expected, "iu"));
  }
});

test("saída inválida, path não autorizado e Unidade inválida são rejeitados", async () => {
  const base = {
    studyUnit: studyUnit(),
    targetId: "content:paragraph",
    instruction: "Melhore.",
    providerConfig: { providerId: "openai", model: "gpt-5-mini", apiKey: "secret" },
    runtimeConfig: RUNTIME
  };
  await assert.rejects(
    requestStudyUnitAssistanceCandidate({
      ...base,
      fetchImpl: async () => jsonResponse({ output_text: "```json\n{}\n```" })
    }),
    /formato estruturado/u
  );
  await assert.rejects(
    requestStudyUnitAssistanceCandidate({
      ...base,
      fetchImpl: async () => jsonResponse(providerOutput("openai", {
        message: "Tentei alterar mais.",
        changes: [{ path: "title", value: "Proibido" }]
      }))
    }),
    /fora do trecho autorizado/u
  );
  await assert.rejects(
    requestStudyUnitAssistanceCandidate({
      ...base,
      fetchImpl: async () => jsonResponse(providerOutput("openai", {
        message: "Esvaziei.",
        changes: [{ path: "text", value: "" }]
      }))
    }),
    /Unidade de estudo inválida|deixaria/u
  );
});

test("no-op é informado e nunca grava por conta própria", async () => {
  let saves = 0;
  const result = await requestStudyUnitAssistanceCandidate({
    studyUnit: studyUnit(),
    targetId: "content:paragraph",
    instruction: "Mantenha se já estiver claro.",
    providerConfig: { providerId: "local", model: "local" },
    runtimeConfig: RUNTIME,
    fetchImpl: async () => jsonResponse(providerOutput("local", {
      message: "O texto já está claro.",
      changes: []
    })),
    onSave: () => { saves += 1; }
  });
  assert.equal(result.noOp, true);
  assert.equal(saves, 0);
});

test("falha transitória de rede tem somente um retry e erro não revela segredo", async () => {
  const secret = "segredo-nao-vaza-em-erro";
  const config = normalizeStudyUnitProviderConfig({
    providerId: "openai",
    model: "gpt-5-mini",
    apiKey: secret
  }, RUNTIME);
  const request = buildStudyUnitProviderRequest(config, {
    system: "Sistema",
    prompt: "Pedido",
    schema: { type: "object", properties: {} }
  });
  let calls = 0;
  const value = await callStudyUnitProvider({
    config,
    request,
    retryDelayMs: 0,
    fetchImpl: async () => {
      calls += 1;
      if (calls === 1) throw new TypeError(`falha interna ${secret}`);
      return jsonResponse(providerOutput("openai", {
        message: "Ok", changes: [{ path: "text", value: "Novo" }]
      }));
    }
  });
  assert.equal(calls, 2);
  assert.equal(value.message, "Ok");

  calls = 0;
  let caught;
  try {
    await callStudyUnitProvider({
      config,
      request,
      retryDelayMs: 0,
      fetchImpl: async () => {
        calls += 1;
        throw new TypeError(`falha interna ${secret}`);
      }
    });
  } catch (error) {
    caught = error;
  }
  assert.equal(calls, 2);
  assert.equal(caught.code, "provider_network_failure");
  assert.doesNotMatch(`${caught.message}${caught.stack}`, new RegExp(secret, "u"));
});

test("resposta acima do teto é cancelada antes de ser materializada em memória", async () => {
  const config = normalizeStudyUnitProviderConfig({
    providerId: "local",
    model: "local"
  }, RUNTIME);
  const request = buildStudyUnitProviderRequest(config, {
    system: "Sistema",
    prompt: "Pedido",
    schema: { type: "object", properties: {} }
  });
  let calls = 0;
  let cancelled = false;
  await assert.rejects(callStudyUnitProvider({
    config,
    request,
    retryDelayMs: 0,
    fetchImpl: async () => {
      calls += 1;
      return {
        ok: true,
        status: 200,
        headers: new Headers(),
        body: new ReadableStream({
          start(controller) {
            controller.enqueue(new Uint8Array(
              STUDY_UNIT_PROVIDER_LIMITS.maximumResponseBytes + 1
            ));
          },
          cancel() { cancelled = true; }
        })
      };
    }
  }), /maior que o limite seguro/u);
  assert.equal(calls, 1);
  assert.equal(cancelled, true);
});

test("timeout e cancelamento interrompem fetch sem retry ambíguo", async () => {
  const config = {
    providerId: "local",
    model: "local",
    endpoint: "http://127.0.0.1:4183/assist",
    apiKey: "",
    timeoutMs: 8
  };
  const request = {
    url: config.endpoint,
    init: { method: "POST", headers: {}, body: "{}" }
  };
  let calls = 0;
  const pendingFetch = (_url, { signal }) => new Promise((_resolve, reject) => {
    calls += 1;
    signal.addEventListener("abort", () => {
      const error = new Error("aborted");
      error.name = "AbortError";
      reject(error);
    }, { once: true });
  });
  await assert.rejects(
    callStudyUnitProvider({ config, request, fetchImpl: pendingFetch, retryDelayMs: 0 }),
    (error) => error.code === "provider_timeout"
  );
  assert.equal(calls, 1);

  const controller = new AbortController();
  const cancellation = callStudyUnitProvider({
    config: { ...config, timeoutMs: 10_000 },
    request,
    fetchImpl: pendingFetch,
    signal: controller.signal,
    retryDelayMs: 0
  });
  controller.abort();
  await assert.rejects(cancellation, (error) => error.code === "provider_cancelled");
  assert.equal(calls, 2);
});
