let sequence = 0;

function nowIso(now = new Date()) {
  return now instanceof Date ? now.toISOString() : new Date(now).toISOString();
}

function makeRunId(now = new Date()) {
  sequence += 1;
  return `generation-${now instanceof Date ? now.getTime() : Date.now()}-${sequence}`;
}

function targetFromContract(generationContract = {}) {
  const target = generationContract.target || {};
  return {
    courseKey: target.courseKey || "",
    moduleKey: target.moduleKey || "",
    lessonKey: target.lessonKey || "",
    microsequenceKey: target.microsequenceKey || ""
  };
}

export function createGenerationRunState({
  runId = "",
  modelId,
  planningContract,
  validatedPlan,
  generationContract,
  now = new Date()
}) {
  const createdAt = nowIso(now);
  return {
    runId: runId || makeRunId(now),
    status: "planning_validated",
    target: targetFromContract(generationContract),
    modelId,
    actualModelId: modelId,
    fallbackUsed: false,
    planningContract,
    validatedPlan,
    generationContract,
    createdAt,
    updatedAt: createdAt,
    lastError: null
  };
}

export function updateGenerationRunState(runState, patch = {}, now = new Date()) {
  return {
    ...runState,
    ...patch,
    updatedAt: nowIso(now)
  };
}

export function canResumeGeneration(runState) {
  return ["planning_validated", "generation_failed_retryable"].includes(runState?.status);
}
