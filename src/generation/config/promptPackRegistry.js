import { normalizeArray, text } from "./engineConfigUtils.js";
import { resolveEngineProfileSection } from "./engineProfileSections.js";

export function getPromptPack(packId = "", profileOrOverrides = {}, overrides = {}) {
  const promptPacks = resolveEngineProfileSection("promptPacks", profileOrOverrides, overrides, {});
  return structuredClone(promptPacks?.[text(packId)] || {});
}

export function listPromptPackGuardrails(packId = "", profileOrOverrides = {}, overrides = {}) {
  return normalizeArray(getPromptPack(packId, profileOrOverrides, overrides).guardrails)
    .map((entry) => text(entry))
    .filter(Boolean);
}
