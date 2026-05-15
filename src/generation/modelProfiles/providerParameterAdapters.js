import { resolvePhaseProfile } from "./phaseProfiles.js";

export function adaptPhaseProfileToProviderParameters({ phaseId = "", providerId = "" } = {}) {
  const profile = resolvePhaseProfile(phaseId);
  const base = {
    temperature: profile.temperature,
    reasoning: profile.reasoning
  };
  if (providerId === "google") {
    return { generationConfig: { temperature: profile.temperature } };
  }
  if (providerId === "openai") {
    return { temperature: profile.temperature, reasoning: { effort: profile.reasoning } };
  }
  return base;
}
