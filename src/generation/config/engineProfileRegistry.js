import {
  DEFAULT_ENGINE_PROFILE,
  DEFAULT_ENGINE_PROFILE_ID,
  ENGINE_PROFILE_SEEDS
} from "./engineProfileSeeds.js";
import { mergeRecords, normalizeArray, text } from "./engineConfigUtils.js";

export { DEFAULT_ENGINE_PROFILE, DEFAULT_ENGINE_PROFILE_ID, ENGINE_PROFILE_SEEDS };

export function listEngineProfileSeeds() {
  return Object.values(ENGINE_PROFILE_SEEDS).map((profile) => ({
    profileId: profile.profileId,
    family: text(profile.family),
    label: text(profile.label),
    intendedDomains: normalizeArray(profile.intendedDomains).map((entry) => text(entry)).filter(Boolean)
  }));
}

export function getEngineProfileSeed(profileId = DEFAULT_ENGINE_PROFILE_ID) {
  return structuredClone(ENGINE_PROFILE_SEEDS[text(profileId)] || DEFAULT_ENGINE_PROFILE);
}

export function resolveEngineProfile(profileOrOverrides = {}, overrides = {}) {
  const seedProfileId =
    typeof profileOrOverrides === "string"
      ? text(profileOrOverrides)
      : text(profileOrOverrides?.profileId);
  const baseProfile = getEngineProfileSeed(seedProfileId || DEFAULT_ENGINE_PROFILE_ID);
  const inlineOverrides =
    profileOrOverrides && typeof profileOrOverrides === "object" && !Array.isArray(profileOrOverrides)
      ? profileOrOverrides
      : {};

  return mergeRecords(
    baseProfile,
    overrides && typeof overrides === "object" ? mergeRecords(inlineOverrides, overrides) : inlineOverrides
  );
}
