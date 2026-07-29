function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function sanitizeRawText(value) {
  const source = text(value);
  if (!source) {
    return "";
  }
  return source.slice(0, 4000);
}

export function createDeepSeekUsageLogger() {
  const entries = [];
  return {
    log(entry = {}) {
      entries.push({
        phase: text(entry.phase),
        model: text(entry.model),
        latencyMs: Number(entry.latencyMs) || 0,
        total_tokens: Number(entry?.usage?.total_tokens ?? entry?.usage?.totalTokens) || 0,
        completion_tokens: Number(entry?.usage?.completion_tokens ?? entry?.usage?.completionTokens) || 0,
        prompt_cache_hit_tokens: Number(entry?.usage?.prompt_cache_hit_tokens) || 0,
        prompt_cache_miss_tokens: Number(entry?.usage?.prompt_cache_miss_tokens) || 0,
        validationErrors: Array.isArray(entry.validationErrors) ? entry.validationErrors : [],
        structuredRetries: Number(entry.structuredRetries) || 0,
        auditPatches: Number(entry.auditPatches) || 0,
        finalValidation: entry.finalValidation ?? null,
        resourcesUsed: Array.isArray(entry.resourcesUsed) ? entry.resourcesUsed : [],
        choiceCount: Number(entry.choiceCount) || 0,
        nonChoiceExerciseCount: Number(entry.nonChoiceExerciseCount) || 0,
        theoryDensityWarnings: Array.isArray(entry.theoryDensityWarnings) ? entry.theoryDensityWarnings : [],
        scopeWarnings: Array.isArray(entry.scopeWarnings) ? entry.scopeWarnings : [],
        dependencyWarnings: Array.isArray(entry.dependencyWarnings) ? entry.dependencyWarnings : [],
        fail_closed: entry.fail_closed === true,
        rawText: sanitizeRawText(entry.rawText),
        structuredOutput: entry.structuredOutput ? structuredClone(entry.structuredOutput) : null,
        parsedPatches: entry.parsedPatches ? structuredClone(entry.parsedPatches) : null
      });
    },
    entries() {
      return structuredClone(entries);
    },
    writeReport(extra = {}) {
      return {
        createdAt: new Date().toISOString(),
        phases: structuredClone(entries),
        ...structuredClone(extra)
      };
    }
  };
}
