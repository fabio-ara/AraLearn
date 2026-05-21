import { text } from "../../core/text.js";
import { ProviderHttpError } from "./providerErrors.js";

function parseJsonFromText(rawText = "") {
  const candidates = [
    rawText,
    rawText.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim()
  ];
  for (const candidate of candidates) {
    if (!candidate) {
      continue;
    }
    try {
      return JSON.parse(candidate);
    } catch {}
  }
  const firstBrace = rawText.indexOf("{");
  const lastBrace = rawText.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return JSON.parse(rawText.slice(firstBrace, lastBrace + 1));
  }
  throw new Error("O serviço Gemini devolveu JSON inválido.");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
  const envValue = Number(process?.env?.GEMINI_MAX_RETRY_DELAY_MS);
  if (Number.isFinite(envValue) && envValue > 0) {
    return envValue;
  }
  return 60000;
}

function shouldFallbackGeminiSchema(error) {
  if (!(error instanceof ProviderHttpError) || Number(error.statusCode) !== 400) {
    return false;
  }
  const message = text(error?.message || error?.payload?.error?.message);
  return /too many states|constraint that has too many states|responsejsonschema/i.test(message);
}

function listApiKeys(value) {
  if (Array.isArray(value)) {
    return value.map((item) => text(item)).filter(Boolean);
  }
  return text(value)
    .split(/[\r\n,;]+/g)
    .map((item) => text(item))
    .filter(Boolean);
}

function uniqueList(values = []) {
  return [...new Set((Array.isArray(values) ? values : []).map((item) => text(item)).filter(Boolean))];
}

function buildGeminiApiKeyCandidates(request = {}, options = {}) {
  return uniqueList([
    text(request.apiKey),
    ...listApiKeys(request.apiKeys),
    text(options.apiKey),
    ...listApiKeys(options.apiKeys),
    text(process?.env?.GEMINI_API_KEY),
    text(process?.env?.GOOGLE_API_KEY),
    ...listApiKeys(process?.env?.GEMINI_API_KEY_FALLBACKS),
    ...listApiKeys(process?.env?.GOOGLE_API_KEY_FALLBACKS)
  ]);
}

function shouldRotateGeminiApiKey(error) {
  if (!(error instanceof ProviderHttpError)) {
    return false;
  }
  const statusCode = Number(error.statusCode);
  const message = text(error?.message || error?.payload?.error?.message).toLowerCase();
  if (statusCode === 429) {
    return true;
  }
  return [400, 403].includes(statusCode) && /quota|rate limit|resource exhausted|daily limit|free tier|billing/.test(message);
}

export function createGeminiProvider({ apiKey = "", apiKeys = [] } = {}) {
  return {
    id: "gemini",
    label: "Gemini",
    capabilities: {
      supportsJsonSchema: true,
      supportsJsonMode: true,
      contextClass: "large"
    },
    async generateStructured(request = {}) {
      const apiKeyCandidates = buildGeminiApiKeyCandidates(request, { apiKey, apiKeys });
      if (!apiKeyCandidates.length) {
        throw new Error("Informe a chave da API do Gemini.");
      }
      const modelId = text(request.modelId) || "gemini-2.5-flash";
      let lastError = null;
      let useResponseSchema = Boolean(request.schema);
      let apiKeyIndex = 0;
      const maxAttempts = Number.isFinite(request.maxAttempts) ? Number(request.maxAttempts) : 12;
      const maxRetryDelayMs = resolveGeminiMaxRetryDelayMs(request);
      for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
        const safeApiKey = apiKeyCandidates[apiKeyIndex];
        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelId)}:generateContent`,
          {
            method: "POST",
            headers: {
              "content-type": "application/json",
              "x-goog-api-key": safeApiKey
            },
            body: JSON.stringify({
              systemInstruction: {
                parts: [{ text: text(request.system) || "Responda somente JSON válido." }]
              },
              contents: [
                {
                  role: "user",
                  parts: [{ text: text(request.prompt) }]
                }
              ],
              generationConfig: {
                temperature: typeof request.temperature === "number" ? request.temperature : 0.2,
                responseMimeType: "application/json",
                ...(useResponseSchema && request.schema ? { responseJsonSchema: request.schema } : {})
              }
            })
          }
        );
        const data = await response.json().catch(() => null);
        if (response.ok) {
          const rawText = (data?.candidates?.[0]?.content?.parts || [])
            .map((part) => (typeof part?.text === "string" ? part.text : ""))
            .join("")
            .trim();
          if (!rawText) {
            throw new Error("O serviço Gemini não devolveu conteúdo utilizável.");
          }
          return parseJsonFromText(rawText);
        }

        lastError = new ProviderHttpError({
          statusCode: response.status,
          message: data?.error?.message || `Falha HTTP ${response.status}.`,
          payload: data
        });
        if (useResponseSchema && shouldFallbackGeminiSchema(lastError)) {
          useResponseSchema = false;
          continue;
        }
        if (shouldRotateGeminiApiKey(lastError) && apiKeyIndex < apiKeyCandidates.length - 1) {
          apiKeyIndex += 1;
          continue;
        }
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
  };
}
