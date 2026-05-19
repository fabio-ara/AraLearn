const DEFAULT_SIZE_IDS = Object.freeze(["short", "medium"]);
const ALL_SIZE_IDS = Object.freeze(["short", "medium", "long"]);

const POLICY_PRECEDENCE = Object.freeze([
  "context.lesson.sourceGuideStructured",
  "selectedLessonTopicRefs",
  "request.userPrompt"
]);

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

export function getWeakModelModePolicy(modelCapabilities = {}) {
  return {
    modeId: "weakModelMode",
    modeLabel: "Weak model mode",
    defaultMode: text(modelCapabilities.defaultMode) || "weak",
    recommendedMaxCards: Number(modelCapabilities.recommendedMaxCards || 5),
    absoluteMaxCards: Number(modelCapabilities.absoluteMaxCards || 7),
    defaultSizeIds: [...DEFAULT_SIZE_IDS],
    allSizeIds: [...ALL_SIZE_IDS],
    policyPrecedence: [...POLICY_PRECEDENCE],
    schemaPolicy: {
      responseMimeType: text(modelCapabilities.responseMimeType) || "application/json",
      supportsResponseJsonSchema: modelCapabilities.supportsResponseJsonSchema === true,
      supportsJsonSchemaSubset: modelCapabilities.supportsJsonSchemaSubset === true,
      schemaStrength: text(modelCapabilities.schemaStrength) || "partial",
      preferShortSchemas: modelCapabilities.preferShortSchemas !== false,
      sendOnlyEffectiveSchemas: true
    },
    repairPolicy: {
      deterministicRepairFirst: true,
      allowLlmRepairAfterDeterministicFailure: true,
      forbidCreativeDeterministicRepair: true
    },
    fallbackPolicy: {
      retryableCategories: ["rate_limited", "service_unavailable", "timeout"],
      allowAutomaticFallback: false
    }
  };
}
