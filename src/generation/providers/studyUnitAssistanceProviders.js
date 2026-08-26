import { assertAssistProviderEndpointAllowed } from "../../assist/providerRuntimeSecurity.js";

const PROVIDER_IDS = new Set(["openai", "gemini", "deepseek"]);
const RETRYABLE_HTTP_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);
const DEFAULT_TIMEOUT_MS = 45_000;
const MAX_TIMEOUT_MS = 120_000;
const MAX_PROVIDER_RESPONSE_BYTES = 256 * 1024;

export const STUDY_UNIT_PROVIDER_LIMITS = Object.freeze({
  maximumResponseBytes: MAX_PROVIDER_RESPONSE_BYTES
});

const DEFAULT_ENDPOINTS = Object.freeze({
  openai: "https://api.openai.com/v1/responses",
  gemini: "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent",
  deepseek: "https://api.deepseek.com/chat/completions"
});

const PROVIDER_ORIGINS = Object.freeze({
  openai: Object.freeze(new Set(["https://api.openai.com"])),
  gemini: Object.freeze(new Set(["https://generativelanguage.googleapis.com"])),
  deepseek: Object.freeze(new Set(["https://api.deepseek.com"]))
});

export class StudyUnitProviderError extends Error {
  constructor(code, message, { retryable = false } = {}) {
    super(message);
    this.name = "StudyUnitProviderError";
    this.code = code;
    this.retryable = retryable;
  }
}

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function plainObject(value) {
  return value && typeof value === "object" && !Array.isArray(value);
}

function normalizedModel(value) {
  const model = text(value);
  if (!model || model.length > 160 || !/^[\p{L}\p{N}._:-]+$/u.test(model)) {
    throw new StudyUnitProviderError(
      "provider_model_invalid",
      "Informe um modelo válido para a assistência."
    );
  }
  return model;
}

function normalizedTimeout(value) {
  const requested = Number(value);
  if (!Number.isFinite(requested)) return DEFAULT_TIMEOUT_MS;
  return Math.max(1_000, Math.min(MAX_TIMEOUT_MS, Math.floor(requested)));
}

function providerEndpoint(providerId, model) {
  return DEFAULT_ENDPOINTS[providerId].replace("{model}", encodeURIComponent(model));
}

function assertProviderEndpointMatches(providerId, endpoint) {
  let origin;
  try {
    origin = new URL(endpoint).origin;
  } catch {
    throw new StudyUnitProviderError(
      "provider_endpoint_invalid",
      "Informe um endpoint válido para o serviço escolhido."
    );
  }
  if (!PROVIDER_ORIGINS[providerId]?.has(origin)) {
    throw new StudyUnitProviderError(
      "provider_endpoint_mismatch",
      "O endpoint não pertence ao serviço escolhido. Revise a conexão antes de enviar a credencial."
    );
  }
  return endpoint;
}

export function normalizeStudyUnitProviderConfig(value = {}, runtimeConfig) {
  const providerId = text(value.providerId).toLowerCase();
  if (!PROVIDER_IDS.has(providerId)) {
    throw new StudyUnitProviderError(
      "provider_not_selected",
      "Escolha explicitamente o serviço de linguagem."
    );
  }
  const model = normalizedModel(value.model);
  const endpoint = assertProviderEndpointMatches(
    providerId,
    assertAssistProviderEndpointAllowed(
      providerEndpoint(providerId, model),
      runtimeConfig
    )
  );
  const apiKey = text(value.apiKey);
  if (!apiKey) {
    throw new StudyUnitProviderError(
      "provider_credential_missing",
      "Informe a credencial do serviço de linguagem."
    );
  }
  return Object.freeze({
    providerId,
    model,
    endpoint,
    apiKey,
    timeoutMs: normalizedTimeout(value.timeoutMs)
  });
}

function openAiBody({ model, system, prompt, schema }) {
  return {
    model,
    instructions: system,
    input: prompt,
    text: {
      format: {
        type: "json_schema",
        name: "aralearn_study_unit_text_candidate",
        strict: true,
        schema
      }
    },
    max_output_tokens: 8_000,
    store: false
  };
}

function compatibleBody({ model, system, prompt, schema }) {
  return {
    model,
    messages: [
      { role: "system", content: system },
      {
        role: "user",
        content: `${prompt}\n\nSchema JSON obrigatório:\n${JSON.stringify(schema)}`
      }
    ],
    response_format: { type: "json_object" },
    temperature: 0.1,
    max_tokens: 8_000
  };
}

function geminiBody({ system, prompt, schema }) {
  return {
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: 8_000,
      responseMimeType: "application/json",
      responseSchema: schema
    }
  };
}

export function buildStudyUnitProviderRequest(config, { system, prompt, schema }) {
  const headers = { "content-type": "application/json" };
  let body;
  if (config.providerId === "openai") {
    headers.authorization = `Bearer ${config.apiKey}`;
    body = openAiBody({ ...config, system, prompt, schema });
  } else if (config.providerId === "gemini") {
    headers["x-goog-api-key"] = config.apiKey;
    body = geminiBody({ ...config, system, prompt, schema });
  } else {
    if (config.apiKey) headers.authorization = `Bearer ${config.apiKey}`;
    body = compatibleBody({ ...config, system, prompt, schema });
  }
  return Object.freeze({
    url: config.endpoint,
    init: Object.freeze({
      method: "POST",
      redirect: "error",
      headers: Object.freeze(headers),
      body: JSON.stringify(body)
    })
  });
}

function outputTextFromOpenAi(data) {
  if (data?.status === "incomplete") {
    throw new StudyUnitProviderError(
      "provider_output_incomplete",
      "O serviço interrompeu a sugestão antes de concluí-la."
    );
  }
  const content = (Array.isArray(data?.output) ? data.output : [])
    .flatMap((item) => Array.isArray(item?.content) ? item.content : []);
  if (content.some((item) => item?.type === "refusal")) {
    throw new StudyUnitProviderError(
      "provider_refusal",
      "O serviço não produziu uma sugestão para este pedido."
    );
  }
  if (typeof data?.output_text === "string") return data.output_text;
  return content
    .filter((item) => item?.type === "output_text")
    .map((item) => typeof item.text === "string" ? item.text : "")
    .join("");
}

function outputTextFromGemini(data) {
  const candidate = Array.isArray(data?.candidates) ? data.candidates[0] : null;
  const finishReason = text(candidate?.finishReason).toUpperCase();
  if (finishReason && !["STOP", "MAX_TOKENS"].includes(finishReason)) {
    throw new StudyUnitProviderError(
      "provider_refusal",
      "O serviço não produziu uma sugestão para este pedido."
    );
  }
  if (finishReason === "MAX_TOKENS") {
    throw new StudyUnitProviderError(
      "provider_output_incomplete",
      "O serviço interrompeu a sugestão antes de concluí-la."
    );
  }
  return (Array.isArray(candidate?.content?.parts) ? candidate.content.parts : [])
    .map((part) => typeof part?.text === "string" ? part.text : "")
    .join("");
}

function outputTextFromCompatible(data) {
  const choice = Array.isArray(data?.choices) ? data.choices[0] : null;
  const finishReason = text(choice?.finish_reason).toLowerCase();
  if (["length", "content_filter"].includes(finishReason)) {
    throw new StudyUnitProviderError(
      finishReason === "length" ? "provider_output_incomplete" : "provider_refusal",
      finishReason === "length"
        ? "O serviço interrompeu a sugestão antes de concluí-la."
        : "O serviço não produziu uma sugestão para este pedido."
    );
  }
  const content = choice?.message?.content;
  return typeof content === "string" ? content : "";
}

export function parseStudyUnitProviderOutput(providerId, data) {
  if (!plainObject(data)) {
    throw new StudyUnitProviderError(
      "provider_response_invalid",
      "O serviço devolveu uma resposta inválida."
    );
  }
  const raw = providerId === "openai"
    ? outputTextFromOpenAi(data)
    : providerId === "gemini"
      ? outputTextFromGemini(data)
      : outputTextFromCompatible(data);
  if (!text(raw)) {
    throw new StudyUnitProviderError(
      "provider_response_empty",
      "O serviço não devolveu uma sugestão."
    );
  }
  try {
    return JSON.parse(raw);
  } catch {
    throw new StudyUnitProviderError(
      "provider_structured_output_invalid",
      "A sugestão não respeitou o formato estruturado exigido."
    );
  }
}

function attemptSignal(parentSignal, timeoutMs) {
  const controller = new AbortController();
  let timedOut = false;
  const abortFromParent = () => controller.abort(parentSignal?.reason);
  if (parentSignal?.aborted) abortFromParent();
  else parentSignal?.addEventListener?.("abort", abortFromParent, { once: true });
  const timer = globalThis.setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  return {
    signal: controller.signal,
    timedOut: () => timedOut,
    dispose() {
      globalThis.clearTimeout(timer);
      parentSignal?.removeEventListener?.("abort", abortFromParent);
    }
  };
}

function transientFetchFailure(error) {
  return error instanceof TypeError && error?.name !== "AbortError";
}

async function boundedProviderResponseJson(response) {
  const declaredLength = Number(response.headers?.get?.("content-length") || 0);
  if (Number.isFinite(declaredLength) && declaredLength > MAX_PROVIDER_RESPONSE_BYTES) {
    throw new StudyUnitProviderError(
      "provider_response_too_large",
      "O serviço devolveu uma resposta maior que o limite seguro."
    );
  }
  if (typeof response.body?.getReader === "function") {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let total = 0;
    let source = "";
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const bytes = value instanceof Uint8Array ? value : new Uint8Array(value || []);
        total += bytes.byteLength;
        if (total > MAX_PROVIDER_RESPONSE_BYTES) {
          await reader.cancel?.();
          throw new StudyUnitProviderError(
            "provider_response_too_large",
            "O serviço devolveu uma resposta maior que o limite seguro."
          );
        }
        source += decoder.decode(bytes, { stream: true });
      }
      source += decoder.decode();
      return JSON.parse(source);
    } finally {
      reader.releaseLock?.();
    }
  }
  if (typeof response.text === "function") {
    const source = await response.text();
    if (new TextEncoder().encode(source).byteLength > MAX_PROVIDER_RESPONSE_BYTES) {
      throw new StudyUnitProviderError(
        "provider_response_too_large",
        "O serviço devolveu uma resposta maior que o limite seguro."
      );
    }
    return JSON.parse(source);
  }
  return response.json();
}

async function fetchAttempt(fetchImpl, request, config, parentSignal) {
  const scoped = attemptSignal(parentSignal, config.timeoutMs);
  try {
    const response = await fetchImpl(request.url, { ...request.init, signal: scoped.signal });
    if (!response || typeof response.ok !== "boolean" ||
        (typeof response.json !== "function" && typeof response.text !== "function" &&
         typeof response.body?.getReader !== "function")) {
      throw new StudyUnitProviderError(
        "provider_response_invalid",
        "O serviço devolveu uma resposta inválida."
      );
    }
    if (!response.ok) {
      const retryable = RETRYABLE_HTTP_STATUS.has(Number(response.status));
      throw new StudyUnitProviderError(
        retryable ? "provider_temporarily_unavailable" :
          Number(response.status) === 401 || Number(response.status) === 403
            ? "provider_auth_failed"
            : "provider_request_rejected",
        retryable
          ? "O serviço de linguagem está temporariamente indisponível."
          : Number(response.status) === 401 || Number(response.status) === 403
            ? "O serviço recusou a credencial informada."
            : "O serviço recusou o pedido de assistência.",
        { retryable }
      );
    }
    try {
      return await boundedProviderResponseJson(response);
    } catch (error) {
      if (error instanceof StudyUnitProviderError) throw error;
      throw new StudyUnitProviderError(
        "provider_response_invalid",
        "O serviço devolveu uma resposta inválida."
      );
    }
  } catch (error) {
    if (parentSignal?.aborted) {
      throw new StudyUnitProviderError("provider_cancelled", "O pedido foi cancelado.");
    }
    if (scoped.timedOut()) {
      throw new StudyUnitProviderError(
        "provider_timeout",
        "O serviço demorou além do limite configurado."
      );
    }
    if (error instanceof StudyUnitProviderError) throw error;
    if (transientFetchFailure(error)) {
      throw new StudyUnitProviderError(
        "provider_network_failure",
        "Não foi possível alcançar o serviço de linguagem.",
        { retryable: true }
      );
    }
    throw new StudyUnitProviderError(
      "provider_request_failed",
      "Não foi possível concluir o pedido de assistência."
    );
  } finally {
    scoped.dispose();
  }
}

export async function callStudyUnitProvider({
  config,
  request,
  fetchImpl = globalThis.fetch,
  signal,
  retryDelayMs = 150
} = {}) {
  if (typeof fetchImpl !== "function") {
    throw new StudyUnitProviderError(
      "provider_fetch_unavailable",
      "Este dispositivo não oferece conexão com serviços de linguagem."
    );
  }
  if (globalThis.navigator?.onLine === false) {
    throw new StudyUnitProviderError(
      "provider_offline",
      "A Assistência por IA fica disponível quando a conexão voltar."
    );
  }
  let lastError;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const data = await fetchAttempt(fetchImpl, request, config, signal);
      return parseStudyUnitProviderOutput(config.providerId, data);
    } catch (error) {
      lastError = error;
      if (!error?.retryable || attempt > 0 || signal?.aborted) throw error;
      if (retryDelayMs > 0) {
        await new Promise((resolve) => globalThis.setTimeout(resolve, retryDelayMs));
      }
    }
  }
  throw lastError;
}
