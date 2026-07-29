import { text } from "../../core/text.js";
import { ProviderHttpError } from "./providerErrors.js";
import { parseStructuredJson, structuredResult } from "./structuredOutput.js";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function createAbortController(timeoutMs) {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return { controller: null, cancel: () => {} };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return {
    controller,
    cancel: () => clearTimeout(timer)
  };
}

function shouldRetryGemini(error) {
  if (!(error instanceof ProviderHttpError)) {
    return false;
  }
  return [429, 500, 502, 503, 504].includes(Number(error.statusCode));
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

function resolveGeminiTimeoutMs(request = {}) {
  const value = Number(request?.timeoutMs);
  if (Number.isFinite(value) && value > 0) {
    return value;
  }
  const envValue = Number(globalThis.process?.env?.GEMINI_TIMEOUT_MS);
  if (Number.isFinite(envValue) && envValue > 0) {
    return envValue;
  }
  return 45000;
}

export function createGeminiProvider({ apiKey = "" } = {}) {
  async function sendGeminiRequest(request = {}) {
    const resolvedApiKey = text(request.apiKey) || text(apiKey);
    if (!resolvedApiKey) {
      throw new Error("Informe a chave da API do Gemini.");
    }
    const modelId = text(request.modelId) || "gemini-2.5-flash";
    let lastError = null;
    const maxAttempts = Number.isFinite(request.maxAttempts) ? Number(request.maxAttempts) : 12;
    const maxRetryDelayMs = resolveGeminiMaxRetryDelayMs(request);
    const timeoutMs = resolveGeminiTimeoutMs(request);
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const { controller, cancel } = createAbortController(timeoutMs);
      let response;
      try {
        response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelId)}:generateContent`,
          {
            method: "POST",
            headers: {
              "content-type": "application/json",
              "x-goog-api-key": resolvedApiKey
            },
            signal: controller?.signal,
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
                      responseJsonSchema: request.schema
                    }
                  : {}),
                ...(Number.isFinite(request.maxTokens) && Number(request.maxTokens) > 0
                  ? { maxOutputTokens: Number(request.maxTokens) }
                  : {})
              }
            })
          }
        );
      } catch (error) {
        cancel();
        if (error?.name === "AbortError") {
          const timeoutError = new Error(`Gemini request timed out after ${timeoutMs}ms.`);
          timeoutError.name = "AbortError";
          throw timeoutError;
        }
        throw error;
      }
      cancel();
      const data = await response.json().catch(() => null);
      if (response.ok) {
        const rawText = (data?.candidates?.[0]?.content?.parts || [])
          .map((part) => (typeof part?.text === "string" ? part.text : ""))
          .join("")
          .trim();
        if (!rawText) {
          throw new Error("O serviço Gemini não devolveu conteúdo utilizável.");
        }
        const usageMetadata = data?.usageMetadata && typeof data.usageMetadata === "object" ? data.usageMetadata : {};
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
