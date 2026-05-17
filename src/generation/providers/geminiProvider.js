import { getModelCapabilities } from "./modelCapabilities.js";
import { ProviderHttpError } from "./providerErrors.js";

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function fail(message) {
  throw new Error(message);
}

function extractJsonObjectText(rawText = "") {
  const start = rawText.indexOf("{");
  const end = rawText.lastIndexOf("}");
  if (start < 0 || end <= start) {
    return "";
  }
  return rawText.slice(start, end + 1).trim();
}

function parseJsonFromModelText(rawText = "") {
  const candidates = [
    rawText,
    rawText.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim(),
    extractJsonObjectText(rawText)
  ].filter(Boolean);

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch {
      // Tenta a próxima forma comum de resposta do modelo.
    }
  }

  fail("O serviço Gemini devolveu JSON inválido.");
}

async function parseGeminiResponse(response) {
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new ProviderHttpError({
      statusCode: response.status,
      message: data?.error?.message || `Falha HTTP ${response.status}.`,
      payload: data
    });
  }

  const rawText = (data?.candidates?.[0]?.content?.parts || [])
    .map((part) => (typeof part?.text === "string" ? part.text : ""))
    .join("")
    .trim();
  if (!rawText) {
    const reason = data?.candidates?.[0]?.finishReason || data?.promptFeedback?.blockReason || "sem conteúdo";
    fail(`O serviço Gemini não devolveu conteúdo utilizável (${reason}).`);
  }

  return {
    value: parseJsonFromModelText(rawText),
    rawText
  };
}

function buildArtifactsText(artifacts = []) {
  return (Array.isArray(artifacts) ? artifacts : [])
    .map((artifact) => {
      const name = text(artifact?.name || artifact?.id) || "artifact";
      const content = typeof artifact?.content === "string" ? artifact.content : JSON.stringify(artifact?.content ?? {});
      return `### ${name}\n${content}`;
    })
    .filter(Boolean)
    .join("\n\n");
}

function buildGeminiRequestBody({ prompt = "", schema = null, artifacts = [], modelId = "" } = {}) {
  const capabilities = getModelCapabilities(modelId);
  const artifactsText = buildArtifactsText(artifacts);
  const parts = [{ text: text(prompt) }];
  if (artifactsText) {
    parts.push({
      text: `ARTEFATOS DA FASE:\n${artifactsText}`
    });
  }

  const generationConfig = {
    temperature: 0.2,
    maxOutputTokens: 8192,
    responseMimeType: capabilities?.responseMimeType || "application/json"
  };
  if (schema && capabilities?.supportsResponseJsonSchema !== false) {
    generationConfig.responseJsonSchema = schema;
  }

  return {
    systemInstruction: {
      parts: [{ text: "Responda somente JSON válido, sem comentário fora do JSON." }]
    },
    contents: [
      {
        role: "user",
        parts
      }
    ],
    generationConfig
  };
}

export function createGeminiProvider({ apiKey = "", modelId = "gemini-2.5-flash" } = {}) {
  return {
    id: "google",
    capabilities: getModelCapabilities(modelId),
    async callJson(input = {}) {
      const trimmedApiKey = text(apiKey);
      if (!trimmedApiKey) {
        fail("Informe a chave da API antes de usar o provider Gemini.");
      }

      const activeModelId = text(input?.modelId) || modelId;
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(activeModelId)}:generateContent`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-goog-api-key": trimmedApiKey
          },
          body: JSON.stringify(
            buildGeminiRequestBody({
              prompt: input?.prompt,
              schema: input?.schema || null,
              artifacts: input?.artifacts || [],
              modelId: activeModelId
            })
          )
        }
      );

      const parsed = await parseGeminiResponse(response);
      return {
        ok: true,
        value: parsed.value,
        rawText: parsed.rawText
      };
    }
  };
}
