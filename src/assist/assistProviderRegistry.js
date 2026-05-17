import { runCodexLocalAssist, CODEX_LOCAL_MODEL_ID } from "./codexLocalAssist.js";
import { GEMINI_ASSIST_PROVIDER_ID, geminiAssistProvider } from "./geminiAssistProvider.js";
import { runGeminiAssist } from "./assistModeDispatcher.js";

export { CODEX_LOCAL_MODEL_ID, GEMINI_ASSIST_PROVIDER_ID };

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

export function resolveAssistProviderId(model) {
  return normalizeText(model) === CODEX_LOCAL_MODEL_ID ? CODEX_LOCAL_MODEL_ID : GEMINI_ASSIST_PROVIDER_ID;
}

export function resolveAssistProvider(model) {
  return resolveAssistProviderId(model) === GEMINI_ASSIST_PROVIDER_ID ? geminiAssistProvider : null;
}

export function resolveAssistProviderDescriptor(model) {
  if (resolveAssistProviderId(model) === CODEX_LOCAL_MODEL_ID) {
    return {
      providerId: CODEX_LOCAL_MODEL_ID,
      run({ codexEndpoint, codexToken, mode, promptText, context, microsequence, ...payload }) {
        return runCodexLocalAssist({
          endpoint: codexEndpoint,
          token: codexToken,
          mode,
          context: context ?? microsequence ?? {},
          promptText,
          ...payload
        });
      }
    };
  }

  return {
    providerId: GEMINI_ASSIST_PROVIDER_ID,
    provider: geminiAssistProvider,
    run({ model: selectedModel, apiKey, ...payload }) {
      return runGeminiAssist({
        model: selectedModel,
        apiKey,
        ...payload
      });
    }
  };
}

export function runAssistWithResolvedProvider(request) {
  return resolveAssistProviderDescriptor(request?.model).run(request || {});
}
