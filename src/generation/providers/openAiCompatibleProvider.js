import { text } from "../../core/text.js";
import {
  buildDeepSeekTextPayload,
  isDeepSeekRequest,
  resolveDeepSeekPhasePolicy
} from "./deepSeekPolicy.js";
import { ProviderHttpError } from "./providerErrors.js";
import {
  parseStructuredJson,
  ProviderCapabilityError,
  ProviderStructuredOutputError,
  stripStructuredNulls,
  structuredResult,
  toStrictJsonSchema
} from "./structuredOutput.js";

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
  return (Array.isArray(data?.output) ? data.output : [])
    .flatMap((item) => Array.isArray(item?.content) ? item.content : [])
    .filter((item) => item?.type === "output_text")
    .map((item) => text(item?.text))
    .join("")
    .trim();
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
    if (isDeepSeek && request.structuredJsonMode === true) {
      requestBody.response_format = { type: "json_object" };
    }

    const response = await fetch(
      targetEndpoint || `${targetBaseUrl.replace(/\/+$/, "")}/chat/completions`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${targetApiKey}`
        },
        body: JSON.stringify(requestBody)
      }
    );
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      throw new ProviderHttpError({
        statusCode: response.status,
        message: data?.error?.message || `Falha HTTP ${response.status}.`,
        payload: data
      });
    }
    if (text(data?.choices?.[0]?.finish_reason).toLowerCase() === "length") {
      const error = new Error("A resposta foi truncada pelo limite de tokens do provider.");
      error.category = "response_truncated";
      error.finishReason = "length";
      throw error;
    }

    return {
      text: text(data?.choices?.[0]?.message?.content),
      usage: normalizeUsage(data),
      raw: data
    };
  }

  async function sendOpenAiResponsesStructured(request = {}) {
    const targetEndpoint = text(request.endpoint || endpoint);
    const targetApiKey = text(request.apiKey || apiKey);
    if (!targetEndpoint || !targetApiKey) {
      throw new Error("Informe o endpoint Responses e a chave da OpenAI.");
    }
    const response = await fetch(targetEndpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${targetApiKey}`
      },
      body: JSON.stringify({
        model: text(request.modelId),
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
          : {}),
        ...(typeof request.temperature === "number"
          ? { temperature: request.temperature }
          : {})
      })
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      throw new ProviderHttpError({
        statusCode: response.status,
        message: data?.error?.message || `Falha HTTP ${response.status}.`,
        payload: data
      });
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
      throw new ProviderStructuredOutputError(
        reason === "max_output_tokens"
          ? "A resposta estruturada foi truncada pelo limite de tokens."
          : "A resposta estruturada ficou incompleta.",
        reason === "max_output_tokens" ? "response_truncated" : "incomplete_structured_output"
      );
    }
    const value = stripStructuredNulls(parseStructuredJson(responseOutputText(data)));
    return structuredResult(value, normalizeUsage(data), data);
  }

  const configuredEndpoint = text(endpoint);
  const configuredBaseUrl = text(baseUrl);
  const configuredForDeepSeek = typeof useDeepSeekPolicy === "boolean"
    ? useDeepSeekPolicy
    : isDeepSeekRequest({ baseUrl: configuredBaseUrl });
  const resolvedStructuredMode = text(structuredOutputMode) ||
    (isOfficialOpenAiResponsesEndpoint(configuredEndpoint) ? "openai_responses" : "") ||
    (configuredForDeepSeek ? "json_mode" : "");

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
          system: `${text(request.system)} Responda somente com um objeto JSON válido.`,
          prompt: `${text(request.prompt)}\n\nJSON_SCHEMA_DE_VALIDACAO_LOCAL:\n${schemaText}`
        });
        return structuredResult(parseStructuredJson(result.text), result.usage, result.raw);
      }
      throw new ProviderCapabilityError(
        "Este endpoint compatível com OpenAI não declarou suporte verificável a saída estruturada."
      );
    }
  };
}
