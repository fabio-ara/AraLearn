import { text } from "../../core/text.js";
import { validateJsonSchemaValue } from "../../assist/codexBridgeShared.js";
import {
  ProviderHttpError,
  classifyProviderError
} from "./providerErrors.js";
import {
  parseStructuredJson,
  ProviderStructuredOutputError,
  stripStructuredNulls,
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
  if (error?.category === "timeout" || error?.code === "ETIMEDOUT") return false;
  if (error instanceof ProviderHttpError) {
    return classifyProviderError(error).retryable;
  }
  return error instanceof TypeError;
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

function acceptsGeminiSamplingParameters(modelId = "") {
  const match = text(modelId).toLowerCase().match(/^gemini-(\d+)(?:\.(\d+))?/u);
  if (!match) return true;
  const major = Number(match[1]);
  const minor = Number(match[2] || 0);
  return major < 3 || (major === 3 && minor < 5);
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
    const modelId = text(request.modelId);
    if (!modelId) {
      throw new Error("Escolha um modelo Gemini.");
    }
    let lastError = null;
    const maxAttempts = resolveGeminiMaxAttempts(request);
    const maxRetryDelayMs = resolveGeminiMaxRetryDelayMs(request);
    const timeoutMs = resolveProviderTimeoutMs(request.timeoutMs, {
      envName: "GEMINI_TIMEOUT_MS"
    });
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      let response;
      let data;
      try {
        ({ response, data } = await fetchProviderJsonResponse(
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
                ...(acceptsGeminiSamplingParameters(modelId)
                  ? { temperature: typeof request.temperature === "number" ? request.temperature : 0.2 }
                  : {}),
                ...(request.schema && typeof request.schema === "object"
                  ? {
                      responseFormat: {
                        text: {
                          mimeType: "application/json",
                          schema: toGeminiJsonSchema(request.schema)
                        }
                      }
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
        ));
      } catch (error) {
        lastError = error;
        if (!shouldRetryGemini(error) || attempt === maxAttempts - 1) throw error;
        await sleep(Math.min(1000 * (attempt + 1), maxRetryDelayMs));
        continue;
      }
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
        const promptTokens = Number(usageMetadata.promptTokenCount) || 0;
        const promptCacheHitTokens = Math.min(
          promptTokens,
          Math.max(0, Number(usageMetadata.cachedContentTokenCount) || 0)
        );
        const candidateTokens = Math.max(
          0,
          Number(usageMetadata.candidatesTokenCount) || 0
        );
        const thoughtTokens = Math.max(
          0,
          Number(usageMetadata.thoughtsTokenCount) || 0
        );
        return {
          text: rawText,
          usage: {
            prompt_tokens: promptTokens,
            completion_tokens: candidateTokens + thoughtTokens,
            total_tokens: Number(usageMetadata.totalTokenCount) || 0,
            prompt_cache_hit_tokens: promptCacheHitTokens,
            prompt_cache_miss_tokens: Math.max(0, promptTokens - promptCacheHitTokens),
            thought_tokens: thoughtTokens
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
      const value = stripStructuredNulls(
        parseStructuredJson(result.text),
        request.schema
      );
      const validation = validateJsonSchemaValue(value, request.schema);
      if (!validation.valid) {
        throw new ProviderStructuredOutputError(
          `A saída do Gemini não satisfaz o schema canônico solicitado: ${validation.error}`,
          "invalid_structured_output"
        );
      }
      return structuredResult(value, result.usage, result.raw);
    }
  };
}
