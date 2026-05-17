import {
  buildGeminiRequestBody,
  callGeminiWithOperationalRetry,
  getGeminiModelCapabilities,
  normalizeGeminiAttachmentParts,
  uploadGeminiAttachments,
  deleteGeminiAttachments
} from "./geminiProviderAdapter.js";
import { runAssistWithApiProvider } from "./assistApiProviderRuntime.js";
import { CODEX_LOCAL_MODEL_ID } from "./codexLocalAssistProvider.js";

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

export const GEMINI_ASSIST_PROVIDER_ID = "gemini_api";
export const DEFAULT_GEMINI_ASSIST_MODEL_ID = "gemini-2.5-flash";

export const geminiAssistProvider = Object.freeze({
  providerId: GEMINI_ASSIST_PROVIDER_ID,
  defaultModelId: DEFAULT_GEMINI_ASSIST_MODEL_ID,
  matchesModel(model) {
    return normalizeText(model) !== CODEX_LOCAL_MODEL_ID;
  },
  run(request = {}) {
    return runAssistWithApiProvider({
      provider: geminiAssistProvider,
      ...request
    });
  },
  normalizeCredentials({ apiKey }) {
    return {
      apiKey: normalizeText(apiKey)
    };
  },
  validateCredentials(credentials) {
    if (!credentials.apiKey) {
      throw new Error("Informe a chave da API antes de enviar o pedido.");
    }
  },
  buildRequestBody({
    systemInstruction,
    prompt,
    schema,
    temperature,
    maxOutputTokens,
    fileParts = [],
    modelCapabilities = {}
  }) {
    return buildGeminiRequestBody({
      systemInstruction,
      prompt,
      schema,
      temperature,
      maxOutputTokens,
      fileParts,
      modelCapabilities
    });
  },
  getModelCapabilities(model) {
    return getGeminiModelCapabilities(model);
  },
  async uploadAttachments({ credentials, attachments }) {
    return uploadGeminiAttachments({
      apiKey: credentials.apiKey,
      attachments
    });
  },
  normalizeFileParts(attachments) {
    return normalizeGeminiAttachmentParts(attachments);
  },
  async deleteAttachments({ credentials, attachments }) {
    return deleteGeminiAttachments({
      apiKey: credentials.apiKey,
      attachments
    });
  },
  async callWithRetry({ credentials, model, body, phase, retryOptions, fallbackOptions }) {
    return callGeminiWithOperationalRetry({
      apiKey: credentials.apiKey,
      model,
      body,
      phase,
      retryOptions,
      fallbackOptions
    });
  },
  createComposeFlowDeps({ credentials }) {
    return Object.freeze({
      callProviderWithRetry({ model, phase, retryOptions, fallbackOptions, body }) {
        return callGeminiWithOperationalRetry({
          apiKey: credentials.apiKey,
          model,
          body,
          phase,
          retryOptions,
          fallbackOptions
        });
      },
      buildRequestBody({
        systemInstruction,
        prompt,
        schema,
        temperature,
        maxOutputTokens,
        fileParts = [],
        modelCapabilities = {}
      }) {
        return buildGeminiRequestBody({
          systemInstruction,
          prompt,
          schema,
          temperature,
          maxOutputTokens,
          fileParts,
          modelCapabilities
        });
      }
    });
  }
});
