import { createCodexCliProvider } from "./codexCliProvider.js";
import { createFakeProvider } from "./fakeProvider.js";
import { createGeminiProvider } from "./geminiProvider.js";

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

export function createProviderRegistry({ providers = [] } = {}) {
  const map = new Map();
  providers.forEach((provider) => {
    if (provider?.id) {
      map.set(provider.id, provider);
    }
  });
  return {
    register(provider) {
      if (!provider?.id) {
        throw new Error("Provider sem id.");
      }
      map.set(provider.id, provider);
      return provider;
    },
    get(providerId) {
      return map.get(providerId) || null;
    },
    list() {
      return [...map.values()];
    }
  };
}

export function createDefaultProviderRegistry(options = {}) {
  return createProviderRegistry({
    providers: [
      createFakeProvider(options.fakeProvider || {}),
      ...(options.gemini ? [createGeminiProvider(options.gemini)] : []),
      ...(options.codexCli ? [createCodexCliProvider(options.codexCli)] : [])
    ]
  });
}

export function resolveProviderFromModelId(modelId = "") {
  const normalized = text(modelId).toLowerCase();
  if (normalized.startsWith("gemini")) return "google";
  if (normalized.startsWith("openai:")) return "openai";
  if (normalized.startsWith("anthropic:")) return "anthropic";
  if (normalized.startsWith("deepseek:")) return "deepseek";
  if (normalized.startsWith("qwen:")) return "qwen";
  if (normalized.startsWith("kimi:")) return "kimi";
  if (normalized.startsWith("zai:")) return "zai";
  if (normalized.startsWith("codex")) return "codex-cli";
  return "generic";
}
