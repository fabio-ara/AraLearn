import { text } from "../../core/text.js";
import {
  buildDeepSeekTextPayload,
  isDeepSeekRequest,
  resolveDeepSeekPhasePolicy
} from "./deepSeekPolicy.js";
import { validateJsonSchemaValue } from "../../assist/codexBridgeShared.js";
import {
  ProviderHttpError,
  classifyProviderError
} from "./providerErrors.js";
import {
  fetchProviderJsonResponse,
  resolveProviderTimeoutMs
} from "./providerTransport.js";
import {
  parseStructuredJson,
  ProviderCapabilityError,
  ProviderStructuredOutputError,
  stripStructuredNulls,
  structuredResult,
  toStrictJsonSchema
} from "./structuredOutput.js";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function shouldRetryDeepSeekHttpError(error) {
  return error instanceof ProviderHttpError && classifyProviderError(error).retryable;
}

function shouldRetryDeepSeekNetworkError(error) {
  return error instanceof TypeError
    && error?.name !== "AbortError"
    && error?.code !== "ETIMEDOUT";
}

const DEEPSEEK_JSON_SYNTAX_SAMPLE = '{"exemplo":"valor"}';

function resolveDeepSeekMaxAttempts(request = {}) {
  const requested = Number(request.maxAttempts);
  if (!Number.isFinite(requested) || requested < 1) return 2;
  return Math.min(Math.floor(requested), 2);
}

function normalizeUsage(data = {}) {
  const usage = data?.usage && typeof data.usage === "object" ? data.usage : {};
  return {
    prompt_tokens: Number(usage.prompt_tokens ?? usage.input_tokens) || 0,
    completion_tokens: Number(usage.completion_tokens ?? usage.output_tokens) || 0,
    total_tokens: Number(usage.total_tokens) ||
      ((Number(usage.input_tokens) || 0) + (Number(usage.output_tokens) || 0)),
    prompt_cache_hit_tokens: Number(usage.prompt_cache_hit_tokens) || 0,
    prompt_cache_miss_tokens: Number(usage.prompt_cache_miss_tokens) || 0
  };
}

function isOfficialOpenAiResponsesEndpoint(value = "") {
  try {
    const url = new URL(value);
    return url.hostname === "api.openai.com" && /\/v1\/responses\/?$/u.test(url.pathname);
  } catch {
    return false;
  }
}

function responseOutputText(data = {}) {
  if (typeof data?.output_text === "string") {
    return data.output_text.trim();
  }
  return (Array.isArray(data?.output) ? data.output : [])
    .flatMap((item) => Array.isArray(item?.content) ? item.content : [])
    .filter((item) => item?.type === "output_text")
    .map((item) => typeof item?.text === "string" ? item.text : "")
    .join("")
    .trim();
}

function structuredProviderFailure(message, category, finishReason = "") {
  const error = new ProviderStructuredOutputError(message, category);
  if (finishReason) error.finishReason = finishReason;
  return error;
}

function validatedCanonicalStructuredResult(
  value,
  schema,
  usage,
  raw,
  providerLabel
) {
  const validation = validateJsonSchemaValue(value, schema);
  if (!validation.valid) {
    throw new ProviderStructuredOutputError(
      `A saída ${providerLabel} não satisfaz o schema canônico solicitado: ${validation.error}`,
      "invalid_structured_output"
    );
  }
  return structuredResult(value, usage, raw);
}

function assertChatCompletionFinished(data = {}) {
  const finishReason = text(data?.choices?.[0]?.finish_reason).toLowerCase();
  if (finishReason === "length") {
    throw structuredProviderFailure(
      "A resposta foi truncada pelo limite de tokens do provider.",
      "response_truncated",
      finishReason
    );
  }
  if (finishReason === "content_filter") {
    throw structuredProviderFailure(
      "O provider interrompeu a resposta por filtragem de conteúdo.",
      "structured_refusal",
      finishReason
    );
  }
  if (finishReason === "insufficient_system_resource") {
    throw structuredProviderFailure(
      "O provider interrompeu a resposta por indisponibilidade de inferência.",
      "provider_interrupted",
      finishReason
    );
  }
}

export function createOpenAiCompatibleProvider({
  baseUrl = "",
  endpoint = "",
  apiKey = "",
  useDeepSeekPolicy = null,
  structuredOutputMode = ""
} = {}) {
  async function sendText(request = {}) {
    const targetBaseUrl = text(request.baseUrl || baseUrl);
    const targetEndpoint = text(request.endpoint || endpoint);
    const targetApiKey = text(request.apiKey || apiKey);
    if ((!targetBaseUrl && !targetEndpoint) || !targetApiKey) {
      throw new Error("Informe endpoint e chave do provider compatível com OpenAI.");
    }

    const isDeepSeek = typeof useDeepSeekPolicy === "boolean"
      ? useDeepSeekPolicy
      : isDeepSeekRequest({
          modelId: request.modelId,
          baseUrl: targetBaseUrl,
          providerId: request.providerId
        });
    const deepSeekPolicy = isDeepSeek ? resolveDeepSeekPhasePolicy({ phase: request.phase }) : null;
    const requestBody = isDeepSeek
      ? buildDeepSeekTextPayload(
          {
            ...request,
            system: text(request.system) || "Responda ao pedido exatamente no formato solicitado."
          },
          deepSeekPolicy
        )
      : {
          model: text(request.modelId),
          temperature: typeof request.temperature === "number" ? request.temperature : 0.2,
          max_tokens: Number(request.maxTokens) || 4000,
          messages: [
            { role: "system", content: text(request.system) || "Responda ao pedido exatamente no formato solicitado." },
            { role: "user", content: text(request.prompt) }
          ]
        };
    if (request.structuredJsonMode === true) {
      requestBody.response_format = { type: "json_object" };
    }

    const timeoutMs = resolveProviderTimeoutMs(request.timeoutMs, {
      envName: "ARALEARN_PROVIDER_TIMEOUT_MS",
      fallback: isDeepSeek ? 660000 : 120000
    });
    const maxAttempts = isDeepSeek ? resolveDeepSeekMaxAttempts(request) : 1;
    let lastError = null;
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      let response;
      let data;
      try {
        ({ response, data } = await fetchProviderJsonResponse(
          targetEndpoint || `${targetBaseUrl.replace(/\/+$/, "")}/chat/completions`,
          {
            method: "POST",
            headers: {
              "content-type": "application/json",
              authorization: `Bearer ${targetApiKey}`
            },
            body: JSON.stringify(requestBody)
          },
          {
            provider: isDeepSeek ? "DeepSeek" : "Provider compatível com OpenAI",
            timeoutMs
          }
        ));
      } catch (error) {
        lastError = error;
        if (
          isDeepSeek
          && shouldRetryDeepSeekNetworkError(error)
          && attempt < maxAttempts - 1
        ) {
          await sleep(1000);
          continue;
        }
        throw error;
      }
      if (!response.ok) {
        lastError = new ProviderHttpError({
          statusCode: response.status,
          message: data?.error?.message || `Falha HTTP ${response.status}.`,
          payload: data
        });
        if (
          isDeepSeek
          && shouldRetryDeepSeekHttpError(lastError)
          && attempt < maxAttempts - 1
        ) {
          await sleep(1000);
          continue;
        }
        throw lastError;
      }
      if (!data || typeof data !== "object") {
        throw structuredProviderFailure(
          "O provider devolveu uma resposta HTTP sem JSON utilizável.",
          "invalid_provider_response"
        );
      }
      assertChatCompletionFinished(data);

      return {
        text: text(data?.choices?.[0]?.message?.content),
        usage: normalizeUsage(data),
        raw: data
      };
    }
    throw lastError || new Error("Falha inesperada ao consultar o DeepSeek.");
  }

  async function sendOpenAiResponsesStructured(request = {}) {
    const targetEndpoint = text(request.endpoint || endpoint);
    const targetApiKey = text(request.apiKey || apiKey);
    if (!targetEndpoint || !targetApiKey) {
      throw new Error("Informe o endpoint Responses e a chave da OpenAI.");
    }
    const timeoutMs = resolveProviderTimeoutMs(request.timeoutMs, {
      envName: "ARALEARN_PROVIDER_TIMEOUT_MS",
      fallback: 120000
    });
    const { response, data } = await fetchProviderJsonResponse(
      targetEndpoint,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${targetApiKey}`
        },
        body: JSON.stringify({
          model: text(request.modelId),
          store: false,
          input: [
            {
              role: "system",
              content: [{ type: "input_text", text: text(request.system) }]
            },
            {
              role: "user",
              content: [{ type: "input_text", text: text(request.prompt) }]
            }
          ],
          text: {
            format: {
              type: "json_schema",
              name: text(request.schemaName) || "aralearn_structured_output",
              schema: toStrictJsonSchema(request.schema),
              strict: true
            }
          },
          ...(Number(request.maxTokens) > 0
            ? { max_output_tokens: Number(request.maxTokens) }
            : {})
        })
      },
      {
        provider: "OpenAI Responses",
        timeoutMs
      }
    );
    if (!response.ok) {
      throw new ProviderHttpError({
        statusCode: response.status,
        message: data?.error?.message || `Falha HTTP ${response.status}.`,
        payload: data
      });
    }
    if (!data || typeof data !== "object") {
      throw structuredProviderFailure(
        "A OpenAI devolveu uma resposta HTTP sem JSON utilizável.",
        "invalid_provider_response"
      );
    }
    const refusal = (Array.isArray(data?.output) ? data.output : [])
      .flatMap((item) => Array.isArray(item?.content) ? item.content : [])
      .find((item) => item?.type === "refusal");
    if (refusal) {
      throw new ProviderStructuredOutputError(
        text(refusal.refusal) || "O modelo recusou a solicitação.",
        "structured_refusal"
      );
    }
    if (data?.status === "incomplete") {
      const reason = text(data?.incomplete_details?.reason);
      throw structuredProviderFailure(
        reason === "max_output_tokens"
          ? "A resposta estruturada foi truncada pelo limite de tokens."
          : reason === "content_filter"
            ? "A resposta estruturada foi interrompida por filtragem de conteúdo."
            : "A resposta estruturada ficou incompleta.",
        reason === "max_output_tokens"
          ? "response_truncated"
          : reason === "content_filter"
            ? "structured_refusal"
            : "incomplete_structured_output",
        reason
      );
    }
    if (data?.status && data.status !== "completed") {
      throw structuredProviderFailure(
        text(data?.error?.message) || `A resposta estruturada terminou com status ${data.status}.`,
        "incomplete_structured_output",
        text(data.status)
      );
    }
    const value = stripStructuredNulls(
      parseStructuredJson(responseOutputText(data)),
      request.schema
    );
    return validatedCanonicalStructuredResult(
      value,
      request.schema,
      normalizeUsage(data),
      data,
      "da OpenAI"
    );
  }

  const configuredEndpoint = text(endpoint);
  const configuredBaseUrl = text(baseUrl);
  const configuredForDeepSeek = typeof useDeepSeekPolicy === "boolean"
    ? useDeepSeekPolicy
    : isDeepSeekRequest({ baseUrl: configuredBaseUrl });
  const resolvedStructuredMode = text(structuredOutputMode) ||
    (isOfficialOpenAiResponsesEndpoint(configuredEndpoint) ? "openai_responses" : "") ||
    (configuredForDeepSeek || configuredEndpoint ? "json_mode" : "");

  return {
    id: "openai-compatible",
    label: "OpenAI compatível",
    capabilities: {
      supportsStrictJsonSchema: resolvedStructuredMode === "openai_responses",
      supportsJsonMode: ["openai_responses", "json_mode"].includes(resolvedStructuredMode),
      supportedSchemaDialect: resolvedStructuredMode === "openai_responses"
        ? "https://json-schema.org/draft/2020-12/schema-subset"
        : null,
      maxContextClass: "medium",
      structuredEngine: true
    },
    async generateText(request = {}) {
      return sendText(request);
    },
    async generateStructured(request = {}) {
      const runtimeIsDeepSeek = isDeepSeekRequest({
        modelId: request.modelId,
        baseUrl: text(request.baseUrl || baseUrl),
        providerId: request.providerId
      });
      if (resolvedStructuredMode === "openai_responses") {
        return sendOpenAiResponsesStructured(request);
      }
      if (resolvedStructuredMode === "json_mode" || runtimeIsDeepSeek) {
        const schemaText = JSON.stringify(request.schema || {});
        const result = await sendText({
          ...request,
          structuredJsonMode: true,
          system: [
            text(request.system),
            "Responda somente com um objeto JSON válido.",
            ...(runtimeIsDeepSeek
              ? [
                  "A amostra é apenas sintática, não pertence ao schema e suas chaves não devem ser copiadas."
                ]
              : [])
          ].filter(Boolean).join(" "),
          prompt: [
            text(request.prompt),
            ...(runtimeIsDeepSeek
              ? [
                  `AMOSTRA_JSON_APENAS_SINTATICA_NAO_PERTENCE_AO_SCHEMA:\n${DEEPSEEK_JSON_SYNTAX_SAMPLE}`
                ]
              : []),
            `JSON_SCHEMA_DE_VALIDACAO_LOCAL:\n${schemaText}`
          ].filter(Boolean).join("\n\n")
        });
        return validatedCanonicalStructuredResult(
          stripStructuredNulls(parseStructuredJson(result.text), request.schema),
          request.schema,
          result.usage,
          result.raw,
          "do provider"
        );
      }
      throw new ProviderCapabilityError(
        "Este endpoint compatível com OpenAI não declarou suporte verificável a saída estruturada."
      );
    }
  };
}
