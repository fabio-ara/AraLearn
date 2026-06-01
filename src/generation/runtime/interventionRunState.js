function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function safeClone(value) {
  if (value === undefined) {
    return undefined;
  }
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return undefined;
  }
}

export function formatInterventionElapsed(elapsedMs = 0) {
  const totalSeconds = Math.max(0, Math.floor(number(elapsedMs) / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function normalizeRunStep(step = {}) {
  const elapsedMs = number(step?.elapsedMs);
  return {
    stage: text(step?.stage),
    status: text(step?.status),
    message: text(step?.message),
    elapsedMs,
    timeLabel: text(step?.timeLabel) || formatInterventionElapsed(elapsedMs),
    createdAt: text(step?.createdAt)
  };
}

export function normalizeInterventionRun(run = {}) {
  const steps = Array.isArray(run?.steps) ? run.steps.map(normalizeRunStep).filter((item) => item.message) : [];
  const artifacts = safeClone(run?.artifacts);
  return {
    runId: text(run?.runId),
    startedAt: text(run?.startedAt),
    updatedAt: text(run?.updatedAt),
    currentStage: text(run?.currentStage),
    resumeFrom: text(run?.resumeFrom),
    elapsedMs: number(run?.elapsedMs),
    steps,
    artifacts: artifacts && typeof artifacts === "object" && !Array.isArray(artifacts) ? artifacts : {}
  };
}

export function createInterventionRun(now = new Date().toISOString()) {
  return normalizeInterventionRun({
    runId: `run_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    startedAt: now,
    updatedAt: now,
    currentStage: "prepare",
    resumeFrom: "prepare",
    elapsedMs: 0,
    steps: [],
    artifacts: {}
  });
}

export function buildInterventionRunFeedbackText(run = {}) {
  const normalized = normalizeInterventionRun(run);
  return normalized.steps.map((step) => `${step.timeLabel} ${step.message}`).join("\n");
}

export function mergeInterventionRunArtifacts(run = {}, artifacts = {}) {
  const normalized = normalizeInterventionRun(run);
  const nextArtifacts = { ...normalized.artifacts };
  Object.entries(artifacts || {}).forEach(([key, value]) => {
    const snapshot = safeClone(value);
    if (snapshot !== undefined) {
      nextArtifacts[key] = snapshot;
    }
  });
  return {
    ...normalized,
    artifacts: nextArtifacts
  };
}

export function appendInterventionRunStep(run = {}, step = {}, { now = new Date().toISOString(), artifacts = {} } = {}) {
  const normalized = mergeInterventionRunArtifacts(run, artifacts);
  const elapsedMs = number(step?.elapsedMs, normalized.elapsedMs);
  const nextStep = normalizeRunStep({
    ...step,
    elapsedMs,
    createdAt: text(step?.createdAt) || now
  });
  return normalizeInterventionRun({
    ...normalized,
    currentStage: text(step?.stage) || normalized.currentStage,
    updatedAt: now,
    elapsedMs,
    steps: [...normalized.steps, nextStep]
  });
}
