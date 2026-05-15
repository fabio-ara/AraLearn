import { createCourseForgeMetrics } from "./courseForgeMetrics.js";

let sequence = 0;

function nowIso(now = new Date()) {
  return now instanceof Date ? now.toISOString() : new Date(now).toISOString();
}

function nextRunId(now = new Date()) {
  sequence += 1;
  const timestamp = now instanceof Date ? now.getTime() : Date.now();
  return `courseforge-${timestamp}-${sequence}`;
}

export function createCourseForgeRunState({ runId = "", intent, phases = [], selectedProfileId = "", now = new Date() } = {}) {
  const createdAt = nowIso(now);
  return {
    runId: runId || nextRunId(now),
    status: "running",
    intent: structuredClone(intent || {}),
    selectedProfileId: selectedProfileId || intent?.selectedTopDownProfileId || "",
    phases: phases.map((phaseId) => ({
      phaseId,
      status: "pending",
      target: {},
      modelId: "",
      startedAt: "",
      finishedAt: "",
      attempts: 0,
      artifactIds: [],
      error: null
    })),
    metrics: createCourseForgeMetrics(),
    createdAt,
    updatedAt: createdAt,
    lastError: null
  };
}

export function updateCourseForgeRunState(runState, patch = {}, now = new Date()) {
  return {
    ...runState,
    ...patch,
    updatedAt: nowIso(now)
  };
}

export function markCourseForgePhase(runState, phaseId, patch = {}, now = new Date()) {
  return updateCourseForgeRunState(
    {
      ...runState,
      phases: (runState?.phases || []).map((phase) =>
        phase.phaseId === phaseId ? { ...phase, ...patch } : phase
      )
    },
    {},
    now
  );
}

export function canResumeCourseForgeRun(runState) {
  const failedPhase = (runState?.phases || []).find((phase) => phase.status === "failed");
  return !!failedPhase || runState?.status === "partial_failure";
}
