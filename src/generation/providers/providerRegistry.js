import { createCodexCliProvider } from "./codexCliProvider.js";
import { createFakeProvider } from "./fakeProvider.js";
import { createGeminiProvider } from "./geminiProvider.js";
import { createOpenAiCompatibleProvider } from "./openAiCompatibleProvider.js";

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

export function createProviderRegistry({ providers = [] } = {}) {
  const map = new Map();
  for (const provider of providers) {
    if (provider?.id) {
      map.set(provider.id, provider);
    }
  }
  return {
    register(provider) {
      if (!provider?.id) {
        throw new Error("Provider sem id.");
      }
      map.set(provider.id, provider);
      return provider;
    },
    get(providerId) {
      const normalized = text(providerId).toLowerCase();
      if (map.has(providerId)) {
        return map.get(providerId) || null;
      }
      if (normalized === "google") {
        return map.get("gemini") || null;
      }
      if (normalized === "openai") {
        return map.get("openai-compatible") || null;
      }
      return null;
    },
    list() {
      return [...map.values()];
    }
  };
}

export function createDefaultProviderRegistry(options = {}) {
  return createProviderRegistry({
    providers: [
      createFakeProvider(options.fake || options.fakeProvider || {}),
      createGeminiProvider(options.gemini || {}),
      createCodexCliProvider(options.codexCli || {}),
      createOpenAiCompatibleProvider(options.openAiCompatible || {})
    ]
  });
}

export function resolveProviderFromModelId(modelId = "") {
  const normalized = text(modelId).toLowerCase();
  if (normalized.startsWith("gemini")) return "google";
  if (normalized.startsWith("openai-compatible") || normalized.startsWith("openai:")) return "openai";
  if (normalized.startsWith("anthropic:")) return "anthropic";
  if (normalized.startsWith("deepseek:")) return "deepseek";
  if (normalized.startsWith("qwen:")) return "qwen";
  if (normalized.startsWith("kimi:")) return "kimi";
  if (normalized.startsWith("zai:")) return "zai";
  if (normalized.startsWith("codex")) return "codex-cli";
  return "generic";
}
