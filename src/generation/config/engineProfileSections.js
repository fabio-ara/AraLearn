import { text } from "./engineConfigUtils.js";
import { resolveEngineProfile } from "./engineProfileRegistry.js";

export function resolveEngineProfileSection(sectionId = "", profileOrOverrides = {}, overrides = {}, fallback = {}) {
  const profile = resolveEngineProfile(profileOrOverrides, overrides);
  return structuredClone(profile?.[text(sectionId)] || fallback);
}
