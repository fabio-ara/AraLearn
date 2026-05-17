import { CODEX_LOCAL_MODEL_ID, codexLocalAssistProvider } from "./codexLocalAssist.js";
import { GEMINI_ASSIST_PROVIDER_ID, geminiAssistProvider } from "./geminiAssistProvider.js";

export { CODEX_LOCAL_MODEL_ID, GEMINI_ASSIST_PROVIDER_ID };
const ASSIST_PROVIDER_DESCRIPTORS = Object.freeze([
  codexLocalAssistProvider,
  geminiAssistProvider
]);

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

export function resolveAssistProviderId(model) {
  return resolveAssistProviderDescriptor(model).providerId;
}

export function resolveAssistProvider(model) {
  return resolveAssistProviderDescriptor(model);
}

export function resolveAssistProviderDescriptor(model) {
  const normalizedModel = normalizeText(model);
  return (
    ASSIST_PROVIDER_DESCRIPTORS.find((descriptor) => descriptor.matchesModel(normalizedModel)) ||
    ASSIST_PROVIDER_DESCRIPTORS[ASSIST_PROVIDER_DESCRIPTORS.length - 1]
  );
}

export function runAssistWithResolvedProvider(request) {
  return resolveAssistProviderDescriptor(request?.model).run(request || {});
}
