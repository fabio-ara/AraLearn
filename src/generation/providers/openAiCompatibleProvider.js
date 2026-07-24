import { text } from "../../core/text.js";
import {
  buildDeepSeekTextPayload,
  isDeepSeekRequest,
  resolveDeepSeekPhasePolicy
} from "./deepSeekPolicy.js";
import { ProviderHttpError } from "./providerErrors.js";

function normalizeUsage(data = {}) {
  const usage = data?.usage && typeof data.usage === "object" ? data.usage : {};
  return {
    prompt_tokens: Number(usage.prompt_tokens) || 0,
    completion_tokens: Number(usage.completion_tokens) || 0,
    total_tokens: Number(usage.total_tokens) || 0,
    prompt_cache_hit_tokens: Number(usage.prompt_cache_hit_tokens) || 0,
    prompt_cache_miss_tokens: Number(usage.prompt_cache_miss_tokens) || 0
  };
}

export function createOpenAiCompatibleProvider({
  baseUrl = "",
  endpoint = "",
  apiKey = "",
  useDeepSeekPolicy = null
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

  return {
    id: "openai-compatible",
    label: "OpenAI compatível",
    capabilities: {
      supportsJsonSchema: false,
      supportsJsonMode: false,
      contextClass: "medium",
      structuredEngine: true
    },
    async generateText(request = {}) {
      return sendText(request);
    }
  };
}
