function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function buildScopeTarget(scope = {}) {
  return {
    level: text(scope?.level) || "project",
    courseKey: text(scope?.courseKey),
    moduleKey: text(scope?.moduleKey),
    lessonKey: text(scope?.lessonKey),
    microsequenceKey: text(scope?.microsequenceKey)
  };
}

function countReusableMicrosequences(microsequencePlans = []) {
  return (Array.isArray(microsequencePlans) ? microsequencePlans : []).reduce(
    (count, lessonEntry) => count + (Array.isArray(lessonEntry?.microsequences) ? lessonEntry.microsequences.length : 0),
    0
  );
}

function collectLessonKeys(lessonPlans = []) {
  return (Array.isArray(lessonPlans) ? lessonPlans : []).map((lessonPlan) => text(lessonPlan?.lessonKey)).filter(Boolean);
}

function collectMicrosequenceKeys(microsequencePlans = []) {
  return (Array.isArray(microsequencePlans) ? microsequencePlans : []).flatMap((lessonEntry) =>
    (Array.isArray(lessonEntry?.microsequences) ? lessonEntry.microsequences : []).map((microsequence) => text(microsequence?.key)).filter(Boolean)
  );
}

function deriveEditorTarget(scope = {}, recommendedAction = "") {
  const target = buildScopeTarget(scope);
  if (recommendedAction === "needs_new_microsequence" && target.level === "microsequence") {
    return {
      ...target,
      level: "lesson",
      microsequenceKey: ""
    };
  }
  return target;
}

function inferEditorOperation({ recommendedAction = "", intent = {} } = {}) {
  if (recommendedAction === "needs_new_microsequence") {
    return "extend";
  }
  if (text(intent?.operation) === "repair") {
    return "repair";
  }
  return "reinforce";
}

function inferGenerationDepthHint(operation = "") {
  if (operation === "repair") {
    return "repair_only";
  }
  return "reinforce_only";
}

function inferInterventionModeHint({ recommendedAction = "", target = {} } = {}) {
  if (recommendedAction === "needs_new_microsequence") {
    return "targeted_scope_expansion";
  }
  if (target.level === "microsequence") {
    return "targeted_single_microsequence";
  }
  if (["lesson", "module", "course"].includes(target.level)) {
    return "targeted_existing_microsequences";
  }
  return "global_regeneration";
}

function buildRequestedChanges({ recommendedAction = "", target = {}, response = {}, operation = "" } = {}) {
  if (recommendedAction === "answer_only") {
    return [];
  }
  const patchStrategy = recommendedAction === "needs_new_microsequence"
    ? "add_microsequence"
    : target.level === "microsequence"
      ? "patch_existing_microsequence"
      : "minimal_local_patch";
  return [
    {
      type: recommendedAction === "needs_new_microsequence" ? "add_new_microsequence" : "patch_existing_material",
      operation,
      patchStrategy,
      target: structuredClone(target),
      reason: text(response?.rationale) || text(response?.responseText)
    }
  ];
}

export function compileCourseForgeInterventionRequest({
  intent = {},
  response = {},
  lessonPlans = [],
  microsequencePlans = []
} = {}) {
  const recommendedAction = text(response?.recommendedAction) || "answer_only";
  const target = deriveEditorTarget(intent?.scope || {}, recommendedAction);
  const operation = inferEditorOperation({ recommendedAction, intent });
  const requestedChanges = buildRequestedChanges({
    recommendedAction,
    target,
    response,
    operation
  });
  const status = recommendedAction === "answer_only" ? "not_needed" : "ready";

  return {
    kind: "intervention_request",
    status,
    source: "tutor_escalation",
    recommendedAction,
    studentPrompt: text(intent?.promptText),
    responseText: text(response?.responseText),
    studyTrackConnection: text(response?.studyTrackConnection),
    rationale: text(response?.rationale),
    target,
    editorIntent:
      status === "ready"
        ? {
            operation,
            generationDepthHint: inferGenerationDepthHint(operation),
            interventionModeHint: inferInterventionModeHint({ recommendedAction, target }),
            requestedBy: "tutor"
          }
        : null,
    requestedChanges,
    contextSnapshot: {
      lessonKeys: collectLessonKeys(lessonPlans),
      microsequenceKeys: collectMicrosequenceKeys(microsequencePlans),
      reusableMicrosequenceCount: countReusableMicrosequences(microsequencePlans)
    }
  };
}
