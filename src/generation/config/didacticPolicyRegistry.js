import { resolveEngineProfileSection } from "./engineProfileSections.js";

export function getDidacticPolicyConfig(profileOrOverrides = {}, overrides = {}) {
  return resolveEngineProfileSection("didacticPolicy", profileOrOverrides, overrides, {});
}
