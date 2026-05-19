import { text } from "../../core/text.js";
import { ProviderHttpError } from "./providerErrors.js";

function parseJsonFromText(rawText = "") {
  const candidates = [
    rawText,
    rawText.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim()
  ];
  for (const candidate of candidates) {
    if (!candidate) continue;
    try {
      return JSON.parse(candidate);
    } catch {}
  }
  const firstBrace = rawText.indexOf("{");
  const lastBrace = rawText.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return JSON.parse(rawText.slice(firstBrace, lastBrace + 1));
  }
  throw new Error("O provider compatível com OpenAI devolveu JSON inválido.");
}

export function createOpenAiCompatibleProvider({ baseUrl = "", apiKey = "" } = {}) {
  return {
    id: "openai-compatible",
    label: "OpenAI compatível",
    capabilities: {
      supportsJsonSchema: false,
      supportsJsonMode: true,
      contextClass: "medium"
    },
    async generateStructured(request = {}) {
      const targetBaseUrl = text(request.baseUrl || baseUrl);
      const targetApiKey = text(request.apiKey || apiKey);
      if (!targetBaseUrl || !targetApiKey) {
        throw new Error("Informe endpoint e chave do provider compatível com OpenAI.");
      }

      const response = await fetch(`${targetBaseUrl.replace(/\/+$/, "")}/chat/completions`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${targetApiKey}`
        },
        body: JSON.stringify({
          model: text(request.modelId),
          temperature: typeof request.temperature === "number" ? request.temperature : 0.2,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: text(request.system) || "Responda somente JSON válido." },
            { role: "user", content: text(request.prompt) }
          ]
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
      const rawText = text(data?.choices?.[0]?.message?.content);
      if (!rawText) {
        throw new Error("O provider compatível com OpenAI não devolveu conteúdo utilizável.");
      }
      return parseJsonFromText(rawText);
    }
  };
}
