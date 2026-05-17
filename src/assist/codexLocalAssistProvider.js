import { buildAssistDraftPrompt, buildDeterministicAssistPlan, normalizeAssistDraftResult } from "./assistMicrosequenceEngine.js";
import { buildEditPrompt, normalizeEditResult } from "./assistPromptBuilders.js";
import {
  checkCodexLocalHealth as checkCodexLocalHealthShared,
  CODEX_LOCAL_MODEL_ID,
  DEFAULT_CODEX_LOCAL_ENDPOINT,
  DEFAULT_CODEX_LOCAL_HEALTH_ENDPOINT,
  isCodexLocalModel as isCodexLocalModelShared,
  resolveCodexLocalEndpoint as resolveCodexLocalEndpointShared,
  resolveCodexLocalHealthEndpoint as resolveCodexLocalHealthEndpointShared
} from "../generation/providers/codexCliConfig.js";

export {
  CODEX_LOCAL_MODEL_ID,
  DEFAULT_CODEX_LOCAL_ENDPOINT,
  DEFAULT_CODEX_LOCAL_HEALTH_ENDPOINT
} from "../generation/providers/codexCliConfig.js";
const TEXT_ATTACHMENT_EXTENSIONS = new Set([
  ".txt",
  ".md",
  ".json",
  ".csv",
  ".html",
  ".xml",
  ".js",
  ".ts",
  ".py",
  ".java",
  ".c",
  ".cpp",
  ".rtf"
]);
const MAX_ATTACHMENT_TEXT_LENGTH = 12000;

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function isSerializableBlob(value) {
  return typeof Blob !== "undefined" && value instanceof Blob;
}

function getFileExtension(fileName = "") {
  const normalized = normalizeText(fileName).toLowerCase();
  const index = normalized.lastIndexOf(".");
  return index >= 0 ? normalized.slice(index) : "";
}

function isTextLikeAttachment(attachment) {
  const mimeType = normalizeText(attachment?.type).toLowerCase();
  if (mimeType.startsWith("text/")) {
    return true;
  }
  if (mimeType === "application/json" || mimeType === "application/xml") {
    return true;
  }
  return TEXT_ATTACHMENT_EXTENSIONS.has(getFileExtension(attachment?.name));
}

function sanitizeJsonValue(value, seen = new WeakSet()) {
  if (value === null) {
    return null;
  }

  const valueType = typeof value;
  if (valueType === "string" || valueType === "number" || valueType === "boolean") {
    return value;
  }
  if (valueType === "function" || valueType === "symbol" || valueType === "undefined" || valueType === "bigint") {
    return undefined;
  }
  if (isSerializableBlob(value)) {
    return undefined;
  }
  if (Array.isArray(value)) {
    return value.map((entry) => sanitizeJsonValue(entry, seen)).filter((entry) => entry !== undefined);
  }
  if (value && typeof value === "object") {
    if (seen.has(value)) {
      return undefined;
    }
    seen.add(value);
    const result = {};
    Object.entries(value).forEach(([key, entry]) => {
      const sanitized = sanitizeJsonValue(entry, seen);
      if (sanitized !== undefined) {
        result[key] = sanitized;
      }
    });
    seen.delete(value);
    return result;
  }
  return undefined;
}

async function serializeCodexAttachment(attachment) {
  const summary = {
    name: normalizeText(attachment?.name) || "anexo",
    type: normalizeText(attachment?.type) || "application/octet-stream",
    size: Number(attachment?.size || 0)
  };

  if (!isTextLikeAttachment(attachment) || typeof attachment?.text !== "function") {
    return {
      ...summary,
      textContent: "",
      unsupportedReason: "Conteúdo inline indisponível neste bridge local."
    };
  }

  try {
    const text = String(await attachment.text());
    return {
      ...summary,
      textContent: text.slice(0, MAX_ATTACHMENT_TEXT_LENGTH),
      truncated: text.length > MAX_ATTACHMENT_TEXT_LENGTH
    };
  } catch {
    return {
      ...summary,
      textContent: "",
      unsupportedReason: "Falha ao ler o conteúdo textual do anexo."
    };
  }
}

async function serializeCodexAttachments(attachments = []) {
  const serialized = [];
  for (const attachment of attachments) {
    if (!attachment || typeof attachment !== "object") {
      continue;
    }
    serialized.push(await serializeCodexAttachment(attachment));
  }
  return serialized;
}

async function buildCodexLocalPrebuiltPrompt({ mode, context, promptText, request }) {
  if (mode === "compose-microsequence") {
    const composePlan = buildDeterministicAssistPlan({
      promptText,
      microsequence: context,
      dependencyTitles: Array.isArray(request?.dependencyTitles) ? request.dependencyTitles : [],
      preferredContainer: normalizeText(request?.preferredContainer)
    });
    return {
      prebuiltPrompt: buildAssistDraftPrompt({
        promptText,
        plan: composePlan,
        microsequence: context
      }),
      composePlan
    };
  }

  if (mode === "edit-card") {
    return {
      prebuiltPrompt: buildEditPrompt({
        microsequence: context,
        card: request?.card,
        dependencyTitles: Array.isArray(request?.dependencyTitles) ? request.dependencyTitles : [],
        promptText
      }),
      composePlan: null
    };
  }

  return {
    prebuiltPrompt: "",
    composePlan: null
  };
}

export function isCodexLocalModel(model) {
  return isCodexLocalModelShared(model);
}

export function resolveCodexLocalEndpoint(endpoint) {
  return resolveCodexLocalEndpointShared(endpoint);
}

export function resolveCodexLocalHealthEndpoint(endpoint) {
  return resolveCodexLocalHealthEndpointShared(endpoint);
}

export function checkCodexLocalHealth(options = {}) {
  return checkCodexLocalHealthShared(options);
}

export async function runCodexLocalAssist({ endpoint, token, mode, context, promptText, ...rest } = {}) {
  const target = resolveCodexLocalEndpoint(endpoint);
  const normalizedContext = sanitizeJsonValue(context) || {};
  const { attachments = [], ...requestRest } = rest || {};
  const request = sanitizeJsonValue(requestRest) || {};
  const serializedAttachments = await serializeCodexAttachments(attachments);
  const normalizedPromptText = normalizeText(promptText);
  const promptState = await buildCodexLocalPrebuiltPrompt({
    mode,
    context: normalizedContext,
    promptText: normalizedPromptText,
    request
  });
  const response = await fetch(target, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token ? { "x-aralearn-token": token } : {})
    },
    body: JSON.stringify({
      provider: CODEX_LOCAL_MODEL_ID,
      mode,
      context: normalizedContext,
      promptText: normalizedPromptText,
      request: {
        ...request,
        attachments: serializedAttachments,
        ...(promptState.prebuiltPrompt ? { prebuiltPrompt: promptState.prebuiltPrompt } : {})
      }
    })
  });

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(data?.error || `Falha HTTP ${response.status}.`);
  }
  if (!data || data.ok !== true) {
    throw new Error(data?.error || "Falha no Codex local.");
  }
  if (mode === "compose-microsequence") {
    return normalizeAssistDraftResult(data.result, {
      plan: promptState.composePlan,
      promptText: normalizedPromptText
    });
  }
  if (mode === "edit-card") {
    return normalizeEditResult(data.result);
  }
  return data.result;
}

export const codexLocalAssistProvider = Object.freeze({
  providerId: CODEX_LOCAL_MODEL_ID,
  matchesModel(model) {
    return isCodexLocalModel(model);
  },
  run({ codexEndpoint, codexToken, mode, promptText, context, microsequence, ...payload }) {
    return runCodexLocalAssist({
      endpoint: codexEndpoint,
      token: codexToken,
      mode,
      context: context ?? microsequence ?? {},
      promptText,
      ...payload
    });
  },
  resolveEndpoint(endpoint) {
    return resolveCodexLocalEndpoint(endpoint);
  },
  resolveHealthEndpoint(endpoint) {
    return resolveCodexLocalHealthEndpoint(endpoint);
  },
  checkHealth(options) {
    return checkCodexLocalHealth(options);
  }
});
