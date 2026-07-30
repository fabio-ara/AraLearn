import { text } from "../../core/text.js";
import { ProviderHttpError } from "./providerErrors.js";
import {
  parseStructuredJson,
  ProviderStructuredOutputError,
  structuredResult,
  toGeminiJsonSchema
} from "./structuredOutput.js";
import {
  fetchProviderJsonResponse,
  resolveProviderTimeoutMs
} from "./providerTransport.js";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function shouldRetryGemini(error) {
  if (!(error instanceof ProviderHttpError)) {
    return false;
  }
  return [408, 429, 500, 502, 503, 504].includes(Number(error.statusCode));
}

function readGeminiRetryDelayMs(error) {
  const message = text(error?.message);
  const secondsMatch = message.match(/retry in\s+([0-9]+(?:\.[0-9]+)?)s/i);
  if (secondsMatch) {
    return Math.max(1000, Math.ceil(Number(secondsMatch[1]) * 1000));
  }
  const payloadMessage = text(error?.payload?.error?.message);
  const payloadMatch = payloadMessage.match(/retry in\s+([0-9]+(?:\.[0-9]+)?)s/i);
  if (payloadMatch) {
    return Math.max(1000, Math.ceil(Number(payloadMatch[1]) * 1000));
  }
  return 1000;
}

function resolveGeminiMaxRetryDelayMs(request = {}) {
  const value = Number(request?.maxRetryDelayMs);
  if (Number.isFinite(value) && value > 0) {
    return value;
  }
  const envValue = Number(globalThis.process?.env?.GEMINI_MAX_RETRY_DELAY_MS);
  if (Number.isFinite(envValue) && envValue > 0) {
    return envValue;
  }
  return 60000;
}

function resolveGeminiMaxAttempts(request = {}) {
  const requested = Number(request.maxAttempts);
  if (!Number.isFinite(requested) || requested < 1) return 2;
  return Math.min(Math.floor(requested), 2);
}

function geminiStructuredFailure(message, category, finishReason = "") {
  const error = new ProviderStructuredOutputError(message, category);
  if (finishReason) error.finishReason = finishReason;
  return error;
}

function assertGeminiCandidateFinished(data = {}, expectsStructuredOutput = false) {
  const blockReason = text(data?.promptFeedback?.blockReason);
  if (blockReason) {
    throw geminiStructuredFailure(
      `O Gemini bloqueou o pedido (${blockReason}).`,
      "structured_refusal",
      blockReason
    );
  }
  const candidate = data?.candidates?.[0];
  const finishReason = text(candidate?.finishReason).toUpperCase();
  if (finishReason === "MAX_TOKENS") {
    throw geminiStructuredFailure(
      "A resposta do Gemini foi truncada pelo limite de tokens.",
      "response_truncated",
      finishReason
    );
  }
  if (finishReason === "MALFORMED_RESPONSE") {
    throw geminiStructuredFailure(
      "O Gemini produziu uma resposta estruturada malformada.",
      expectsStructuredOutput ? "malformed_structured_output" : "provider_interrupted",
      finishReason
    );
  }
  if ([
    "SAFETY",
    "RECITATION",
    "LANGUAGE",
    "BLOCKLIST",
    "PROHIBITED_CONTENT",
    "SPII",
    "IMAGE_SAFETY",
    "IMAGE_PROHIBITED_CONTENT",
    "IMAGE_RECITATION",
    "ESCALATION"
  ].includes(finishReason)) {
    throw geminiStructuredFailure(
      `O Gemini interrompeu a resposta (${finishReason}).`,
      "structured_refusal",
      finishReason
    );
  }
  if (finishReason && finishReason !== "STOP") {
    throw geminiStructuredFailure(
      `O Gemini terminou a resposta de forma incompleta (${finishReason}).`,
      "incomplete_structured_output",
      finishReason
    );
  }
}

export function createGeminiProvider({ apiKey = "" } = {}) {
  async function sendGeminiRequest(request = {}) {
    const resolvedApiKey = text(request.apiKey) || text(apiKey);
    if (!resolvedApiKey) {
      throw new Error("Informe a chave da API do Gemini.");
    }
    const modelId = text(request.modelId) || "gemini-2.5-flash";
    let lastError = null;
    const maxAttempts = resolveGeminiMaxAttempts(request);
    const maxRetryDelayMs = resolveGeminiMaxRetryDelayMs(request);
    const timeoutMs = resolveProviderTimeoutMs(request.timeoutMs, {
      envName: "GEMINI_TIMEOUT_MS"
    });
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const { response, data } = await fetchProviderJsonResponse(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelId)}:generateContent`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-goog-api-key": resolvedApiKey
          },
          body: JSON.stringify({
            systemInstruction: {
              parts: [{ text: text(request.system) || "Responda no formato pedido." }]
            },
            contents: [
              {
                role: "user",
                parts: [{ text: text(request.prompt) }]
              }
            ],
            generationConfig: {
              temperature: typeof request.temperature === "number" ? request.temperature : 0.2,
              ...(request.schema && typeof request.schema === "object"
                ? {
                    responseMimeType: "application/json",
                    responseJsonSchema: toGeminiJsonSchema(request.schema)
                  }
                : {}),
              ...(Number.isFinite(request.maxTokens) && Number(request.maxTokens) > 0
                ? { maxOutputTokens: Number(request.maxTokens) }
                : {})
            }
          })
        },
        {
          provider: "Gemini",
          timeoutMs
        }
      );
      if (response.ok) {
        if (!data || typeof data !== "object") {
          throw geminiStructuredFailure(
            "O Gemini devolveu uma resposta HTTP sem JSON utilizável.",
            "invalid_provider_response"
          );
        }
        assertGeminiCandidateFinished(
          data,
          request.schema && typeof request.schema === "object"
        );
        const rawText = (data?.candidates?.[0]?.content?.parts || [])
          .filter((part) => part?.thought !== true)
          .map((part) => (typeof part?.text === "string" ? part.text : ""))
          .join("")
          .trim();
        if (!rawText) {
          throw geminiStructuredFailure(
            "O Gemini não devolveu conteúdo estruturado utilizável.",
            request.schema ? "empty_structured_output" : "invalid_provider_response"
          );
        }
        const usageMetadata = data?.usageMetadata && typeof data.usageMetadata === "object"
          ? data.usageMetadata
          : {};
        return {
          text: rawText,
          usage: {
            prompt_tokens: Number(usageMetadata.promptTokenCount) || 0,
            completion_tokens: Number(usageMetadata.candidatesTokenCount) || 0,
            total_tokens: Number(usageMetadata.totalTokenCount) || 0,
            prompt_cache_hit_tokens: 0,
            prompt_cache_miss_tokens: 0
          },
          raw: data
        };
      }

      lastError = new ProviderHttpError({
        statusCode: response.status,
        message: data?.error?.message || `Falha HTTP ${response.status}.`,
        payload: data
      });
      if (!shouldRetryGemini(lastError) || attempt === maxAttempts - 1) {
        throw lastError;
      }
      const retryDelayMs = Math.max(readGeminiRetryDelayMs(lastError), 1000 * (attempt + 1));
      if (retryDelayMs > maxRetryDelayMs) {
        throw lastError;
      }
      await sleep(retryDelayMs);
    }
    throw lastError || new Error("Falha inesperada ao consultar o Gemini.");
  }

  return {
    id: "gemini",
    label: "Gemini",
    capabilities: {
      supportsStrictJsonSchema: false,
      supportsJsonMode: true,
      supportedSchemaDialect: "gemini-json-schema-subset",
      maxContextClass: "large",
      structuredEngine: true
    },
    async generateText(request = {}) {
      return sendGeminiRequest(request);
    },
    async generateStructured(request = {}) {
      const result = await sendGeminiRequest(request);
      return structuredResult(parseStructuredJson(result.text), result.usage, result.raw);
    }
  };
}
