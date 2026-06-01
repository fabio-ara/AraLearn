import {
  buildInterventionRunFeedbackText,
  normalizeInterventionRun
} from "../generation/runtime/interventionRunState.js"

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

const SESSION_STATUSES = new Set([
  "idle",
  "running",
  "completed",
  "needs_retry",
  "needs_continue_here",
  "needs_new_microsequence",
  "blocked",
  "stale"
]);

const RECOMMENDED_ACTIONS = new Set([
  "",
  "generate_current",
  "repair_current",
  "branch_after_current",
  "next_planned"
]);

const RECOMMENDED_TARGET_MODES = new Set(["", "current", "new_after_current"]);
const RECOMMENDED_OPERATION_MODES = new Set(["", "reinforce", "repair"]);

export function buildInterventionSessionKey(reference = {}) {
  return [
    text(reference?.courseKey),
    text(reference?.moduleKey),
    text(reference?.lessonKey),
    text(reference?.microsequenceKey)
  ].join("::");
}

export function createEmptyInterventionSession({ reference = {}, baseVersionId = "" } = {}) {
  return normalizeInterventionSessionEntry(
    {},
    {
      reference,
      baseVersionId
    }
  );
}

export function normalizeInterventionSessionEntry(entry = {}, { reference = {}, baseVersionId = "" } = {}) {
  const normalizedReference = {
    courseKey: text(entry?.courseKey || reference?.courseKey),
    moduleKey: text(entry?.moduleKey || reference?.moduleKey),
    lessonKey: text(entry?.lessonKey || reference?.lessonKey),
    microsequenceKey: text(entry?.microsequenceKey || reference?.microsequenceKey)
  };
  const run = normalizeInterventionRun(entry?.run);
  const status = SESSION_STATUSES.has(text(entry?.status)) ? text(entry.status) : "idle";
  const nextPromptDraft = text(entry?.nextPromptDraft);
  const runFeedbackText = buildInterventionRunFeedbackText(run);
  const feedbackText = text(entry?.feedbackText) || runFeedbackText || nextPromptDraft || text(entry?.message);
  return {
    ...normalizedReference,
    baseVersionId: text(entry?.baseVersionId || baseVersionId),
    status,
    title: text(entry?.title),
    message: text(entry?.message),
    feedbackText,
    nextPromptDraft,
    rawFeedbackText: text(entry?.rawFeedbackText),
    recommendedActionIntent: RECOMMENDED_ACTIONS.has(text(entry?.recommendedActionIntent))
      ? text(entry?.recommendedActionIntent)
      : "",
    recommendedInterventionTargetMode: RECOMMENDED_TARGET_MODES.has(text(entry?.recommendedInterventionTargetMode))
      ? text(entry?.recommendedInterventionTargetMode)
      : "",
    recommendedOperationMode: RECOMMENDED_OPERATION_MODES.has(text(entry?.recommendedOperationMode))
      ? text(entry?.recommendedOperationMode)
      : "",
    modelId: text(entry?.modelId),
    promptText: text(entry?.promptText),
    attachmentNames: Array.isArray(entry?.attachmentNames)
      ? entry.attachmentNames.map((item) => text(item)).filter(Boolean)
      : [],
    continuationNeeded: entry?.continuationNeeded === true,
    continuationMode: text(entry?.continuationMode),
    stale: entry?.stale === true || status === "stale",
    staleMessage: text(entry?.staleMessage),
    run,
    createdAt: text(entry?.createdAt),
    updatedAt: text(entry?.updatedAt)
  };
}

export function interventionSessionNeedsIteration(session = {}) {
  return ["needs_retry", "needs_continue_here", "needs_new_microsequence"].includes(
    text(session?.status)
  ) && !session?.stale;
}
