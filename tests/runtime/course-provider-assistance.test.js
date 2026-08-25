import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  buildStudyUnitProviderRequest,
  callStudyUnitProvider,
  normalizeStudyUnitProviderConfig,
  parseStudyUnitProviderOutput,
  STUDY_UNIT_PROVIDER_LIMITS
} from "../../src/generation/providers/studyUnitAssistanceProviders.js";
import {
  COURSE_ASSISTANCE_DISCLOSURE,
  COURSE_ASSISTANCE_MODEL_PRESETS,
  createCourseProviderSession
} from "../../src/ui/CourseProviderAssistance.js";

const RUNTIME = Object.freeze({
  developmentRuntime: true,
  assistAllowedOrigins: Object.freeze([
    "https://api.openai.com",
    "https://generativelanguage.googleapis.com",
    "https://api.deepseek.com"
  ])
});

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
    return { candidates: [{ finishReason: "STOP", content: { parts: [{ text: content }] } }] };
  }
  return { choices: [{ finish_reason: "stop", message: { content } }] };
}

test("sessão contextual mantém configuração em memória e zera a credencial ao destruir", () => {
  const session = createCourseProviderSession();
  session.update({
    providerId: "openai",
    model: "modelo-escolhido",
    endpoint: "https://api.openai.com/v1/responses",
    apiKey: "segredo-da-sessao",
    timeoutMs: 45_000
  });
  assert.equal(session.read().apiKey, "segredo-da-sessao");
  assert.deepEqual(session.snapshot(), {
    providerId: "openai",
    model: "modelo-escolhido",
    endpoint: "https://api.openai.com/v1/responses",
    hasCredential: true,
    destroyed: false
  });
  assert.doesNotMatch(JSON.stringify(session.snapshot()), /segredo-da-sessao/u);
  assert.deepEqual(COURSE_ASSISTANCE_MODEL_PRESETS.map(({ value }) => value), [
    "gpt-5.6-luna", "deepseek-v4-pro", "deepseek-v4-flash"
  ]);
  for (const expected of [
    "alvo de escrita", "caminho curricular", "mensagens recentes", "PDFs", "Fontes",
    "somente na memória"
  ]) assert.match(COURSE_ASSISTANCE_DISCLOSURE, new RegExp(expected, "iu"));
  session.destroy();
  assert.equal(session.snapshot().hasCredential, false);
  assert.equal(session.snapshot().destroyed, true);
  assert.throws(() => session.read(), /sessão de assistência foi encerrada/u);
});

test("runtime autenticado compartilha a sessão contextual entre Estudo e Autoria", () => {
  const source = readFileSync(new URL("../../public/main.js", import.meta.url), "utf8");
  assert.match(source, /courseProviderSession\s*=\s*createCourseProviderSession\(\)/u);
  assert.match(source,
    /createCourseStudyApplication\(\{[\s\S]*?providerAssistanceSession:\s*courseProviderSession/u);
  assert.match(source,
    /createCourseAuthoringSurface\(\{[\s\S]*?providerAssistanceSession:\s*courseProviderSession/u);
  assert.match(source,
    /function quiesceAraLearnAuthenticatedInteractions\(\)[\s\S]*?courseProviderSession\?\.destroy\?\.\(\)/u);
});

test("OpenAI usa schema estrito e Gemini mantém a credencial fora da URL", () => {
  const schema = {
    type: "object",
    additionalProperties: false,
    required: ["message"],
    properties: { message: { type: "string" } }
  };
  const openai = normalizeStudyUnitProviderConfig({
    providerId: "openai", model: "gpt-5.6-luna", apiKey: "openai-secret"
  }, RUNTIME);
  const openaiRequest = buildStudyUnitProviderRequest(openai, {
    system: "Sistema", prompt: "Pedido", schema
  });
  const openaiBody = JSON.parse(openaiRequest.init.body);
  assert.equal(openaiRequest.url, "https://api.openai.com/v1/responses");
  assert.equal(openaiBody.store, false);
  assert.equal(openaiBody.text.format.type, "json_schema");
  assert.equal(openaiBody.text.format.strict, true);
  assert.equal(openaiBody.text.format.schema.additionalProperties, false);
  assert.doesNotMatch(`${openaiRequest.url}${openaiRequest.init.body}`, /openai-secret/u);

  const gemini = normalizeStudyUnitProviderConfig({
    providerId: "gemini", model: "gemini-2.5-flash", apiKey: "gemini-secret"
  }, RUNTIME);
  const geminiRequest = buildStudyUnitProviderRequest(gemini, {
    system: "Sistema", prompt: "Pedido", schema
  });
  assert.equal(geminiRequest.init.headers["x-goog-api-key"], "gemini-secret");
  assert.doesNotMatch(geminiRequest.url, /key=|gemini-secret/u);
  assert.deepEqual(parseStudyUnitProviderOutput("gemini", providerOutput("gemini", {
    message: "Ok"
  })), { message: "Ok" });
});

test("produção aceita provider remoto oficial com chave efêmera", {
  todo: "oráculo pós-auditoria preparado antes da implementação"
}, () => {
  const production = {
    assistAllowedOrigins: [
      "https://api.openai.com",
      "https://generativelanguage.googleapis.com",
      "https://api.deepseek.com"
    ]
  };
  assert.equal(normalizeStudyUnitProviderConfig({
    providerId: "openai", model: "gpt-5.6-luna", apiKey: "chave"
  }, production).providerId, "openai");
});

test("produção rejeita relay local como provider da assistência", () => {
  const production = {
    assistAllowedOrigins: [
      "https://api.openai.com",
      "https://generativelanguage.googleapis.com",
      "https://api.deepseek.com"
    ]
  };
  assert.throws(() => normalizeStudyUnitProviderConfig({
    providerId: "local", model: "gpt-5.6-luna",
    endpoint: "http://127.0.0.1:4183/v1/chat/completions"
  }, production), /serviço|provider|origem/iu);
});

test("a divulgação de produção nomeia providers e não expõe arquitetura", {
  todo: "oráculo pós-auditoria preparado antes da implementação"
}, () => {
  assert.match(COURSE_ASSISTANCE_DISCLOSURE, /OpenAI|Gemini|DeepSeek/iu);
  assert.match(COURSE_ASSISTANCE_DISCLOSURE, /chave[\s\S]*memória/iu);
  assert.doesNotMatch(COURSE_ASSISTANCE_DISCLOSURE, /relay|endpoint|servidor local/iu);
});

test("falha transitória tem só um retry e nunca reflete dados sensíveis", async () => {
  const secret = "segredo-nao-vaza-em-erro";
  const config = normalizeStudyUnitProviderConfig({
    providerId: "openai", model: "gpt-5.6-luna", apiKey: secret
  }, RUNTIME);
  const request = buildStudyUnitProviderRequest(config, {
    system: "Sistema", prompt: "Pedido",
    schema: { type: "object", properties: {} }
  });
  let calls = 0;
  const value = await callStudyUnitProvider({
    config,
    request,
    retryDelayMs: 0,
    fetchImpl: async () => {
      calls += 1;
      if (calls === 1) throw new TypeError(`${secret} known.person@example.test`);
      return jsonResponse(providerOutput("openai", { message: "Ok" }));
    }
  });
  assert.equal(calls, 2);
  assert.equal(value.message, "Ok");
});

test("resposta acima do teto e cancelamento interrompem o transporte", async () => {
  const config = normalizeStudyUnitProviderConfig({
    providerId: "openai", model: "gpt-5.6-luna", apiKey: "stub-credential"
  }, RUNTIME);
  const request = buildStudyUnitProviderRequest(config, {
    system: "Sistema", prompt: "Pedido", schema: { type: "object", properties: {} }
  });
  let cancelled = false;
  await assert.rejects(callStudyUnitProvider({
    config,
    request,
    retryDelayMs: 0,
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      headers: new Headers(),
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array(STUDY_UNIT_PROVIDER_LIMITS.maximumResponseBytes + 1));
        },
        cancel() { cancelled = true; }
      })
    })
  }), /maior que o limite seguro/u);
  assert.equal(cancelled, true);

  const abort = new AbortController();
  const pending = callStudyUnitProvider({
    config: { ...config, timeoutMs: 10_000 },
    request,
    signal: abort.signal,
    retryDelayMs: 0,
    fetchImpl: (_url, { signal }) => new Promise((_resolve, reject) => {
      signal.addEventListener("abort", () => {
        const error = new Error("aborted");
        error.name = "AbortError";
        reject(error);
      }, { once: true });
    })
  });
  abort.abort();
  await assert.rejects(pending, (error) => error.code === "provider_cancelled");
});
