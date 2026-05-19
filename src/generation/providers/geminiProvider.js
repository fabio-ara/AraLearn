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
  return [429, 500, 503, 504].includes(Number(error.statusCode));
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

export function createGeminiProvider({ apiKey = "" } = {}) {
  return {
    id: "gemini",
    label: "Gemini",
    capabilities: {
      supportsJsonSchema: true,
      supportsJsonMode: true,
      contextClass: "large"
    },
    async generateStructured(request = {}) {
      const safeApiKey = text(request.apiKey || apiKey);
      if (!safeApiKey) {
        throw new Error("Informe a chave da API do Gemini.");
      }
      const modelId = text(request.modelId) || "gemini-2.5-flash";
      let lastError = null;
      for (let attempt = 0; attempt < 4; attempt += 1) {
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
                ...(request.schema ? { responseJsonSchema: request.schema } : {})
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
        if (!shouldRetryGemini(lastError) || attempt === 3) {
          throw lastError;
        }
        await sleep(Math.max(readGeminiRetryDelayMs(lastError), 1000 * (attempt + 1)));
      }
      throw lastError || new Error("Falha inesperada ao consultar o Gemini.");
    }
  };
}
