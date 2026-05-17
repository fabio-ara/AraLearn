import { DEFAULT_ENGINE_PROFILE_ID, resolveEngineProfile } from "../config/engineProfileRegistry.js";

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function toPositiveInteger(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

function normalizeBoolean(value, fallback) {
  return typeof value === "boolean" ? value : fallback;
}

function normalizeGuardrailsText(value = "", fallbackLines = []) {
  if (typeof value === "string" && value.trim()) {
    return value
      .split(/\r?\n/u)
      .map((entry) => text(entry))
      .filter(Boolean)
      .join("\n");
  }
  return (Array.isArray(fallbackLines) ? fallbackLines : [])
    .map((entry) => text(entry))
    .filter(Boolean)
    .join("\n");
}

export function createCourseForgeProfileTuning(profileId = DEFAULT_ENGINE_PROFILE_ID, input = {}) {
  const resolvedProfile = resolveEngineProfile(profileId || DEFAULT_ENGINE_PROFILE_ID);
  const didacticPolicy = resolvedProfile?.didacticPolicy || {};
  const budget = didacticPolicy?.topDownCourseStrategy?.defaultBudgetByLesson || {};
  const guardrails = resolvedProfile?.promptPacks?.courseForge?.guardrails || [];

  return {
    targetStudentProfile: text(input?.targetStudentProfile) || text(didacticPolicy?.targetStudentProfile),
    conceptualReappearances: toPositiveInteger(
      input?.conceptualReappearances,
      toPositiveInteger(didacticPolicy?.defaultMinimumReappearances?.conceptual, 3)
    ),
    operationalReappearances: toPositiveInteger(
      input?.operationalReappearances,
      toPositiveInteger(didacticPolicy?.defaultMinimumReappearances?.operational, 4)
    ),
    minMicrosequences: toPositiveInteger(input?.minMicrosequences, toPositiveInteger(budget?.minMicrosequences, 3)),
    targetMicrosequences: toPositiveInteger(input?.targetMicrosequences, toPositiveInteger(budget?.targetMicrosequences, 5)),
    maxMicrosequences: toPositiveInteger(input?.maxMicrosequences, toPositiveInteger(budget?.maxMicrosequences, 8)),
    requireCoreCoverageBeforeExtensions: normalizeBoolean(
      input?.requireCoreCoverageBeforeExtensions,
      didacticPolicy?.topDownCourseStrategy?.requireCoreCoverageBeforeExtensions !== false
    ),
    requireVocabularyMap: normalizeBoolean(
      input?.requireVocabularyMap,
      didacticPolicy?.topDownCourseStrategy?.requireVocabularyMap !== false
    ),
    guardrailsText: normalizeGuardrailsText(input?.guardrailsText, guardrails)
  };
}

export function buildCourseForgeEngineProfileOverrides({ profileTuning = {} } = {}) {
  const guardrails = String(profileTuning?.guardrailsText || "")
    .split(/\r?\n/u)
    .map((entry) => text(entry))
    .filter(Boolean);

  return {
    didacticPolicy: {
      targetStudentProfile: text(profileTuning?.targetStudentProfile),
      defaultMinimumReappearances: {
        conceptual: toPositiveInteger(profileTuning?.conceptualReappearances, 3),
        operational: toPositiveInteger(profileTuning?.operationalReappearances, 4)
      },
      topDownCourseStrategy: {
        defaultBudgetByLesson: {
          minMicrosequences: toPositiveInteger(profileTuning?.minMicrosequences, 3),
          targetMicrosequences: toPositiveInteger(profileTuning?.targetMicrosequences, 5),
          maxMicrosequences: toPositiveInteger(profileTuning?.maxMicrosequences, 8)
        },
        requireCoreCoverageBeforeExtensions: profileTuning?.requireCoreCoverageBeforeExtensions !== false,
        requireVocabularyMap: profileTuning?.requireVocabularyMap !== false
      }
    },
    promptPacks: {
      courseForge: {
        guardrails
      }
    }
  };
}
