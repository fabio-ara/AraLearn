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
    lowConfidenceCards: 0,
    issueCountsByCategory: {
      planning: 0,
      cards: 0,
      adherence: 0
    },
    repairCallsByCategory: {
      planning: 0,
      cards: 0,
      adherence: 0
    },
    lastFailureCategory: ""
  };
}
