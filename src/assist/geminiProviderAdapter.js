import { callModelWithRetry } from "../generation/providers/callModelWithRetry.js";
import { getModelCapabilities } from "../generation/providers/modelCapabilities.js";
import { ProviderHttpError } from "../generation/providers/providerErrors.js";

function fail(message) {
  throw new Error(message);
}

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

export function buildGeminiRequestBody({
  systemInstruction,
  prompt,
  schema,
  temperature = 0.2,
  maxOutputTokens = 2048,
  fileParts = [],
  modelCapabilities = {}
}) {
  const generationConfig = {
    temperature,
    maxOutputTokens,
    responseMimeType: modelCapabilities?.responseMimeType || "application/json"
  };
  if (schema && modelCapabilities?.supportsResponseJsonSchema !== false) {
    generationConfig.responseJsonSchema = schema;
  }

  return {
    systemInstruction: {
      parts: [{ text: systemInstruction }]
    },
    contents: [
      {
        role: "user",
        parts: [...fileParts, { text: prompt }]
      }
    ],
    generationConfig
  };
}

function inferMimeType(fileName = "") {
  const normalized = normalizeText(fileName).toLowerCase();
  if (normalized.endsWith(".pdf")) return "application/pdf";
  if (normalized.endsWith(".md")) return "text/markdown";
  if (normalized.endsWith(".txt")) return "text/plain";
  if (normalized.endsWith(".json")) return "application/json";
  if (normalized.endsWith(".csv")) return "text/csv";
  if (normalized.endsWith(".html")) return "text/html";
  if (normalized.endsWith(".xml")) return "application/xml";
  if (normalized.endsWith(".js")) return "text/javascript";
  if (normalized.endsWith(".ts")) return "text/plain";
  if (normalized.endsWith(".py")) return "text/x-python";
  if (normalized.endsWith(".java")) return "text/x-java-source";
  if (normalized.endsWith(".c")) return "text/x-c";
  if (normalized.endsWith(".cpp")) return "text/x-c++src";
  if (normalized.endsWith(".pptx")) return "application/vnd.openxmlformats-officedocument.presentationml.presentation";
  if (normalized.endsWith(".docx")) return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  return "application/octet-stream";
}

export function normalizeGeminiAttachmentParts(attachments = []) {
  return attachments
    .filter((item) => item && typeof item === "object" && normalizeText(item.uri))
    .map((item) => ({
      file_data: {
        mime_type: normalizeText(item.mimeType) || "application/octet-stream",
        file_uri: normalizeText(item.uri)
      }
    }));
}

function encodeGeminiResourceName(name) {
  return String(name || "")
    .split("/")
    .map((item) => encodeURIComponent(item))
    .join("/");
}

async function parseGeminiUploadResponse(response) {
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const message = data?.error?.message || `Falha HTTP ${response.status}.`;
    fail(message);
  }

  const file = data?.file || data;
  const uri = normalizeText(file?.uri);
  const mimeType = normalizeText(file?.mimeType);
  const name = normalizeText(file?.name);

  if (!uri || !name) {
    fail("O serviço de IA não devolveu um arquivo utilizável.");
  }

  return {
    uri,
    mimeType: mimeType || "application/octet-stream",
    name
  };
}

async function uploadGeminiAttachment({ apiKey, attachment }) {
  const name = normalizeText(attachment?.name) || "documento";
  const mimeType = normalizeText(attachment?.type) || inferMimeType(name);
  const bytes = await attachment.arrayBuffer();
  const startResponse = await fetch("https://generativelanguage.googleapis.com/upload/v1beta/files", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
      "X-Goog-Upload-Protocol": "resumable",
      "X-Goog-Upload-Command": "start",
      "X-Goog-Upload-Header-Content-Length": String(bytes.byteLength),
      "X-Goog-Upload-Header-Content-Type": mimeType
    },
    body: JSON.stringify({
      file: {
        display_name: name
      }
    })
  });
  if (!startResponse.ok) {
    return parseGeminiUploadResponse(startResponse);
  }

  const uploadUrl =
    startResponse.headers?.get("x-goog-upload-url") ||
    startResponse.headers?.get("X-Goog-Upload-URL") ||
    startResponse.headers?.get("X-Goog-Upload-Url");
  if (!uploadUrl) {
    fail("O serviço de IA não devolveu a URL de upload do anexo.");
  }

  const uploadResponse = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      "Content-Type": mimeType,
      "X-Goog-Upload-Offset": "0",
      "X-Goog-Upload-Command": "upload, finalize"
    },
    body: bytes
  });

  return parseGeminiUploadResponse(uploadResponse);
}

export async function uploadGeminiAttachments({ apiKey, attachments }) {
  const uploaded = [];

  for (const attachment of attachments || []) {
    uploaded.push(await uploadGeminiAttachment({ apiKey, attachment }));
  }

  return uploaded;
}

async function deleteGeminiAttachment({ apiKey, name }) {
  const resourceName = normalizeText(name);
  if (!resourceName) {
    return;
  }

  await fetch(`https://generativelanguage.googleapis.com/v1beta/${encodeGeminiResourceName(resourceName)}`, {
    method: "DELETE",
    headers: {
      "x-goog-api-key": apiKey
    }
  }).catch(() => null);
}

export async function deleteGeminiAttachments({ apiKey, attachments }) {
  for (const attachment of attachments || []) {
    await deleteGeminiAttachment({ apiKey, name: attachment?.name });
  }
}

function extractJsonObjectText(text) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) {
    return "";
  }
  return text.slice(start, end + 1).trim();
}

function parseJsonFromModelText(text) {
  const candidates = [
    text,
    text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim(),
    extractJsonObjectText(text)
  ].filter(Boolean);

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch {
      // Tenta a próxima forma comum de resposta do modelo.
    }
  }

  fail("O serviço de IA devolveu JSON inválido.");
}

async function parseGeminiResponse(response) {
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const message = data?.error?.message || `Falha HTTP ${response.status}.`;
    throw new ProviderHttpError({ statusCode: response.status, message, payload: data });
  }

  const parts = data?.candidates?.[0]?.content?.parts || [];
  const text = parts.map((part) => (typeof part?.text === "string" ? part.text : "")).join("").trim();
  if (!text) {
    const reason = data?.candidates?.[0]?.finishReason || data?.promptFeedback?.blockReason || "sem conteúdo";
    fail(`O serviço de IA não devolveu conteúdo utilizável (${reason}).`);
  }

  return parseJsonFromModelText(text);
}

export async function callGemini({ apiKey, model, body }) {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey
      },
      body: JSON.stringify(body)
    }
  );

  return parseGeminiResponse(response);
}

function normalizeRetryOptions(options = {}) {
  return {
    maxAttempts: options.maxAttempts,
    baseDelayMs: options.baseDelayMs,
    maxDelayMs: options.maxDelayMs,
    jitterRatio: options.jitterRatio,
    delay: options.delay,
    random: options.random
  };
}

function normalizeFallbackOptions(options = {}) {
  return {
    fallbackEnabled: options.fallbackEnabled === true,
    fallbackModelId: normalizeText(options.fallbackModelId),
    allowFallbackOn: Array.isArray(options.allowFallbackOn) ? options.allowFallbackOn : undefined
  };
}

export async function callGeminiWithOperationalRetry({
  apiKey,
  model,
  body,
  phase,
  retryOptions = {},
  fallbackOptions = {}
}) {
  return callModelWithRetry({
    request: body,
    phase,
    modelId: model,
    ...normalizeRetryOptions(retryOptions),
    ...normalizeFallbackOptions(fallbackOptions),
    callModel: ({ request, modelId }) => callGemini({ apiKey, model: modelId, body: request })
  });
}

export function createGeminiComposeFlowDeps() {
  return Object.freeze({
    callProviderWithRetry: callGeminiWithOperationalRetry,
    buildRequestBody: buildGeminiRequestBody
  });
}

export function getGeminiModelCapabilities(model) {
  return getModelCapabilities(model);
}
