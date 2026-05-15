export function createCourseForgeMetrics() {
  return {
    elapsedMs: 0,
    estimatedInputTokens: 0,
    estimatedOutputTokens: 0,
    estimatedCost: null,
    jsonFailures: 0,
    schemaFailures: 0,
    repairCalls: 0,
    sourceAdherenceFailures: 0,
    backstageVocabularyIssues: 0,
    cardsGenerated: 0,
    approvedCards: 0,
    lowConfidenceCards: 0
  };
}
