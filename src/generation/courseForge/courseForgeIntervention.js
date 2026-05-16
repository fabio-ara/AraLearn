function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function slugify(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
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

function uniqueTextList(values = []) {
  return [...new Set((Array.isArray(values) ? values : []).map(text).filter(Boolean))];
}

function normalizeForMatch(value = "") {
  return text(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function containsDidacticTerm(value = "", terms = []) {
  const normalized = normalizeForMatch(value);
  return (Array.isArray(terms) ? terms : []).some((term) => normalized.includes(String(term).toLowerCase()));
}

const DIDACTIC_INTERVENTION_TYPES = Object.freeze([
  "explanatory_bridge",
  "contrast_reinforcement",
  "guided_practice_bridge",
  "prerequisite_tightening",
  "local_semantic_rewrite"
]);

function findCourse(projectDocument = {}, courseKey = "") {
  return (Array.isArray(projectDocument?.courses) ? projectDocument.courses : []).find((course) => text(course?.key) === text(courseKey)) || null;
}

function findModule(projectDocument = {}, courseKey = "", moduleKey = "") {
  return (findCourse(projectDocument, courseKey)?.modules || []).find((moduleValue) => text(moduleValue?.key) === text(moduleKey)) || null;
}

function findLesson(projectDocument = {}, courseKey = "", moduleKey = "", lessonKey = "") {
  return (findModule(projectDocument, courseKey, moduleKey)?.lessons || []).find((lesson) => text(lesson?.key) === text(lessonKey)) || null;
}

function listLessonsForTarget(projectDocument = {}, target = {}, request = {}) {
  const scopedTarget = buildScopeTarget(target);
  if (scopedTarget.level === "microsequence" || scopedTarget.level === "lesson") {
    return scopedTarget.lessonKey
      ? [{
          courseKey: scopedTarget.courseKey,
          moduleKey: scopedTarget.moduleKey,
          lessonKey: scopedTarget.lessonKey
        }]
      : [];
  }
  if (scopedTarget.level === "module") {
    const moduleValue = findModule(projectDocument, scopedTarget.courseKey, scopedTarget.moduleKey);
    return (Array.isArray(moduleValue?.lessons) ? moduleValue.lessons : []).map((lesson) => ({
      courseKey: scopedTarget.courseKey,
      moduleKey: scopedTarget.moduleKey,
      lessonKey: text(lesson?.key)
    }));
  }
  if (scopedTarget.level === "course") {
    const course = findCourse(projectDocument, scopedTarget.courseKey);
    return (Array.isArray(course?.modules) ? course.modules : []).flatMap((moduleValue) =>
      (Array.isArray(moduleValue?.lessons) ? moduleValue.lessons : []).map((lesson) => ({
        courseKey: scopedTarget.courseKey,
        moduleKey: text(moduleValue?.key),
        lessonKey: text(lesson?.key)
      }))
    );
  }
  if (Array.isArray(request?.contextSnapshot?.lessonKeys) && request.contextSnapshot.lessonKeys.length) {
    return request.contextSnapshot.lessonKeys.map((lessonKey) => ({
      courseKey: scopedTarget.courseKey,
      moduleKey: scopedTarget.moduleKey,
      lessonKey: text(lessonKey)
    }));
  }
  return [];
}

function buildExistingMicrosequenceKeySet(projectDocument = {}, lessonTarget = {}) {
  const lesson = findLesson(projectDocument, lessonTarget?.courseKey, lessonTarget?.moduleKey, lessonTarget?.lessonKey);
  return new Set(
    (Array.isArray(lesson?.microsequences) ? lesson.microsequences : [])
      .map((microsequence) => text(microsequence?.key))
      .filter(Boolean)
  );
}

function buildGeneratedMicrosequenceKey({ lessonKey = "", title = "", usedKeys = new Set(), index = 0 } = {}) {
  const base = slugify(title) || `micro-${index + 1}`;
  const prefix = slugify(lessonKey) || "lesson";
  let candidate = `${prefix}-micro-${base}`;
  let counter = 2;
  while (usedKeys.has(candidate)) {
    candidate = `${prefix}-micro-${base}-${counter}`;
    counter += 1;
  }
  usedKeys.add(candidate);
  return candidate;
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

function inferRequestedChangeSemanticOperation(change = {}, target = {}) {
  const patchStrategy = text(change?.patchStrategy);
  const operation = text(change?.operation);
  const level = text(target?.level) || "project";
  if (patchStrategy === "add_microsequence" || text(change?.type) === "add_new_microsequence") {
    return "add_new_microsequence";
  }
  if (patchStrategy === "patch_existing_microsequence" || level === "microsequence") {
    return operation === "repair" ? "repair_existing_microsequence" : "reinforce_existing_microsequence";
  }
  if (operation === "repair") {
    return `repair_existing_${level}`;
  }
  if (operation === "extend") {
    return `extend_existing_${level}`;
  }
  return `reinforce_existing_${level}`;
}

function inferRequestedChangeDidacticInterventionType(change = {}, { recommendedAction = "", response = {}, target = {}, intentPrompt = "" } = {}) {
  const explicitType = text(change?.didacticInterventionType);
  if (DIDACTIC_INTERVENTION_TYPES.includes(explicitType)) {
    return explicitType;
  }

  const patchStrategy = text(change?.patchStrategy);
  const requestedType = text(change?.type);
  const sourceText = [
    text(change?.reason),
    text(response?.rationale),
    text(response?.responseText),
    text(intentPrompt)
  ].join(" ");
  const expectsNewMicrosequence =
    patchStrategy === "add_microsequence"
    || requestedType === "add_new_microsequence"
    || recommendedAction === "needs_new_microsequence";

  const wantsContrast = containsDidacticTerm(sourceText, ["contrast", "contraste", "contraexemplo", "diferenca", "diferença", "disting"]);
  const wantsPrerequisite = containsDidacticTerm(sourceText, ["pre-requis", "prerequis", "salto", "degrau", "base", "fundamento", "prepar"]);
  const wantsPractice = containsDidacticTerm(sourceText, ["pratica", "practice", "exercicio", "exercício", "treino", "guiad"]);

  if (wantsContrast) {
    return "contrast_reinforcement";
  }
  if (wantsPrerequisite && (expectsNewMicrosequence || !wantsPractice)) {
    return "prerequisite_tightening";
  }
  if (wantsPractice) {
    return "guided_practice_bridge";
  }
  if (expectsNewMicrosequence) {
    return "explanatory_bridge";
  }
  if (text(target?.level) === "microsequence") {
    return "local_semantic_rewrite";
  }
  return "prerequisite_tightening";
}

function inferActionInsertionPolicy(change = {}, interventionRequest = {}, actionTarget = {}) {
  const patchStrategy = text(change?.patchStrategy);
  const requestedType = text(change?.type);
  if (patchStrategy !== "add_microsequence" && requestedType !== "add_new_microsequence") {
    return null;
  }
  const anchorMicrosequenceKey = uniqueTextList(interventionRequest?.contextSnapshot?.microsequenceKeys || [])[0] || "";
  return {
    placement: anchorMicrosequenceKey ? "after_anchor" : "append_to_lesson",
    anchorMicrosequenceKey,
    lessonKey: text(actionTarget?.lessonKey)
  };
}

function findLessonPlanForTarget(lessonPlans = [], target = {}) {
  const scopedTarget = buildScopeTarget(target);
  return (Array.isArray(lessonPlans) ? lessonPlans : []).find((lessonPlan) =>
    text(lessonPlan?.lessonKey) === scopedTarget.lessonKey
    && (!scopedTarget.moduleKey || text(lessonPlan?.moduleKey) === scopedTarget.moduleKey)
    && (!scopedTarget.courseKey || text(lessonPlan?.courseKey) === scopedTarget.courseKey)
  ) || null;
}

function listMentionedDomainRefs({ lessonPlans = [], target = {}, sourceText = "" } = {}) {
  const lessonPlan = findLessonPlanForTarget(lessonPlans, target);
  const normalizedSourceText = normalizeForMatch(sourceText);
  if (!lessonPlan || !normalizedSourceText) {
    return [];
  }
  return uniqueTextList(
    (Array.isArray(lessonPlan?.domainMap?.items) ? lessonPlan.domainMap.items : [])
      .filter((item) => {
        const normalizedLabel = normalizeForMatch(item?.label);
        return normalizedLabel && normalizedSourceText.includes(normalizedLabel);
      })
      .map((item) => text(item?.id))
  );
}

function listAvailableDomainRefs(lessonPlan = null) {
  return uniqueTextList(
    (Array.isArray(lessonPlan?.domainMap?.items) ? lessonPlan.domainMap.items : []).map((item) => text(item?.id))
  );
}

function inferStructuredInterventionFocus({
  lessonPlans = [],
  target = {},
  didacticInterventionType = "",
  response = {},
  intentPrompt = ""
} = {}) {
  const sourceText = [
    text(response?.rationale),
    text(response?.responseText),
    text(intentPrompt)
  ].join(" ");
  const mentionedDomainRefs = listMentionedDomainRefs({
    lessonPlans,
    target,
    sourceText
  });
  const lessonPlan = findLessonPlanForTarget(lessonPlans, target);
  const focus = {
    relatedConceptRefs: [],
    bridgeTargetRef: "",
    domainRef: "",
    prerequisiteRefs: []
  };

  if (didacticInterventionType === "contrast_reinforcement" && mentionedDomainRefs.length >= 2) {
    focus.relatedConceptRefs = mentionedDomainRefs.slice(0, 4);
  }

  if (didacticInterventionType === "guided_practice_bridge") {
    if (mentionedDomainRefs.length >= 1) {
      focus.bridgeTargetRef = mentionedDomainRefs[0];
    } else {
      const availableDomainRefs = listAvailableDomainRefs(lessonPlan);
      if (availableDomainRefs.length === 1) {
        focus.bridgeTargetRef = availableDomainRefs[0];
      }
    }
  }

  if (didacticInterventionType === "explanatory_bridge") {
    if (mentionedDomainRefs.length >= 1) {
      focus.domainRef = mentionedDomainRefs[0];
    } else {
      const availableDomainRefs = listAvailableDomainRefs(lessonPlan);
      if (availableDomainRefs.length === 1) {
        focus.domainRef = availableDomainRefs[0];
      }
    }
  }

  if (didacticInterventionType === "prerequisite_tightening") {
    const targetDomainRef = mentionedDomainRefs.find((domainRef) => {
      const item = (Array.isArray(lessonPlan?.domainMap?.items) ? lessonPlan.domainMap.items : []).find(
        (entry) => text(entry?.id) === domainRef
      );
      return Array.isArray(item?.prerequisites) && item.prerequisites.length > 0;
    }) || "";
    if (targetDomainRef) {
      focus.domainRef = targetDomainRef;
      const targetDomainItem = (Array.isArray(lessonPlan?.domainMap?.items) ? lessonPlan.domainMap.items : []).find(
        (entry) => text(entry?.id) === targetDomainRef
      );
      focus.prerequisiteRefs = uniqueTextList(targetDomainItem?.prerequisites);
    }
  }

  return focus;
}

function buildRequestedChanges({
  recommendedAction = "",
  target = {},
  response = {},
  operation = "",
  intentPrompt = "",
  lessonPlans = []
} = {}) {
  if (recommendedAction === "answer_only") {
    return [];
  }
  const patchStrategy = recommendedAction === "needs_new_microsequence"
    ? "add_microsequence"
    : target.level === "microsequence"
      ? "patch_existing_microsequence"
      : "minimal_local_patch";
  const requestedChange = {
    changeId: "requested_change_1",
    type: recommendedAction === "needs_new_microsequence" ? "add_new_microsequence" : "patch_existing_material",
    operation,
    patchStrategy,
    target: structuredClone(target),
    reason: text(response?.rationale) || text(response?.responseText)
  };
  requestedChange.didacticInterventionType = inferRequestedChangeDidacticInterventionType(
    requestedChange,
    {
      recommendedAction,
      response,
      target,
      intentPrompt
    }
  );
  const structuredFocus = inferStructuredInterventionFocus({
    lessonPlans,
    target,
    didacticInterventionType: requestedChange.didacticInterventionType,
    response,
    intentPrompt
  });
  requestedChange.relatedConceptRefs = structuredFocus.relatedConceptRefs;
  requestedChange.bridgeTargetRef = structuredFocus.bridgeTargetRef;
  requestedChange.domainRef = structuredFocus.domainRef;
  requestedChange.prerequisiteRefs = structuredFocus.prerequisiteRefs;
  return [requestedChange];
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
    operation,
    intentPrompt: text(intent?.promptText),
    lessonPlans
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

export function compileCourseForgeEditorInterventionPlan({ interventionRequest = {}, projectDocument = {} } = {}) {
  const target = buildScopeTarget(interventionRequest?.target || {});
  const requestedChanges = Array.isArray(interventionRequest?.requestedChanges) ? interventionRequest.requestedChanges : [];
  const actions = requestedChanges.map((change, index) => {
    const actionTarget = buildScopeTarget(change?.target || target);
    const lessonTargets = listLessonsForTarget(projectDocument, actionTarget, interventionRequest);
    const expectsNewMicrosequence = text(change?.patchStrategy) === "add_microsequence" || text(change?.type) === "add_new_microsequence";
    return {
      actionId: `intervention_action_${index + 1}`,
      requestedChangeId: text(change?.changeId) || `requested_change_${index + 1}`,
      type: text(change?.type),
      operation: text(change?.operation || interventionRequest?.editorIntent?.operation),
      patchStrategy: text(change?.patchStrategy),
      didacticInterventionType: inferRequestedChangeDidacticInterventionType(change, {
        recommendedAction: interventionRequest?.recommendedAction,
        response: interventionRequest,
        target: actionTarget,
        intentPrompt: interventionRequest?.studentPrompt
      }),
      semanticOperation: inferRequestedChangeSemanticOperation(change, actionTarget),
      reason: text(change?.reason),
      evidence: {
        studentPrompt: text(interventionRequest?.studentPrompt),
        responseText: text(interventionRequest?.responseText),
        studyTrackConnection: text(interventionRequest?.studyTrackConnection),
        rationale: text(interventionRequest?.rationale),
        requestedChangeReason: text(change?.reason)
      },
      insertionPolicy: inferActionInsertionPolicy(change, interventionRequest, actionTarget),
      target: actionTarget,
      relatedConceptRefs: uniqueTextList(change?.relatedConceptRefs),
      bridgeTargetRef: text(change?.bridgeTargetRef),
      domainRef: text(change?.domainRef),
      prerequisiteRefs: uniqueTextList(change?.prerequisiteRefs),
      lessonTargets,
      existingMicrosequenceKey: text(actionTarget?.microsequenceKey),
      expectsNewMicrosequence
    };
  });
  const planningMode = actions.every((action) => action.expectsNewMicrosequence)
    ? "new_only"
    : actions.every((action) => !action.expectsNewMicrosequence)
      ? "existing_only"
      : "mixed";
  const targetedLessonKeys = uniqueTextList(actions.flatMap((action) => action.lessonTargets.map((lessonTarget) => lessonTarget.lessonKey)));
  const targetedMicrosequenceKeys = uniqueTextList(actions.map((action) => action.existingMicrosequenceKey));
  const newMicrosequenceCountByLesson = Object.fromEntries(
    targetedLessonKeys.map((lessonKey) => [
      lessonKey,
      actions.filter((action) => action.expectsNewMicrosequence && action.lessonTargets.some((lessonTarget) => lessonTarget.lessonKey === lessonKey)).length
    ])
  );

  return {
    kind: "editor_intervention_plan",
    source: "intervention_request",
    planningMode,
    target,
    requestedChangeCount: actions.length,
    didacticInterventionTypes: uniqueTextList(actions.map((action) => action.didacticInterventionType)),
    targetedLessonKeys,
    targetedMicrosequenceKeys,
    newMicrosequenceCountByLesson,
    providerTask:
      planningMode === "new_only"
        ? "Crie somente novas microssequências para os alvos pedidos. Não replique microssequências já existentes nem replaneje o restante da lição."
        : planningMode === "existing_only"
          ? "Reaproveite somente os alvos existentes pedidos. Não crie novas microssequências nem amplie o escopo."
          : "Siga estritamente os requestedChanges do InterventionRequest sem ampliar o escopo.",
    actions
  };
}

function scoreMicrosequenceAgainstDidacticType(microsequence = {}, didacticInterventionType = "") {
  const coverageRole = text(microsequence?.coverageRole);
  const didacticPurpose = text(microsequence?.didacticPurpose || microsequence?.objective);
  const tags = uniqueTextList(microsequence?.tags).join(" ");
  const combined = [coverageRole, didacticPurpose, tags].join(" ");

  if (didacticInterventionType === "guided_practice_bridge") {
    return containsDidacticTerm(combined, ["practice", "pratica", "guided_practice", "guiad", "exercicio", "treino"]) ? 10 : 0;
  }
  if (didacticInterventionType === "contrast_reinforcement") {
    return containsDidacticTerm(combined, ["contrast", "contraste", "contraexemplo", "diferenca", "diferença"]) ? 10 : 0;
  }
  if (didacticInterventionType === "prerequisite_tightening") {
    return containsDidacticTerm(combined, ["introdu", "explain", "base", "ponte", "prepar", "fundamento", "review", "revis"]) ? 10 : 0;
  }
  if (didacticInterventionType === "explanatory_bridge") {
    return containsDidacticTerm(combined, ["introdu", "explain", "ponte", "guided_example", "review", "revis"]) ? 10 : 0;
  }
  return 1;
}

export function constrainCourseForgeMicrosequencePlansToInterventionPlan({ plan = {}, microsequencePlans = [], projectDocument = {} } = {}) {
  if (!plan || typeof plan !== "object" || !Array.isArray(plan?.actions) || !plan.actions.length) {
    return structuredClone(Array.isArray(microsequencePlans) ? microsequencePlans : []);
  }

  const targetedLessonKeySet = new Set(uniqueTextList(plan.targetedLessonKeys));
  const targetedMicrosequenceKeySet = new Set(uniqueTextList(plan.targetedMicrosequenceKeys));
  const planningMode = text(plan?.planningMode) || "";
  const constrained = [];

  (Array.isArray(microsequencePlans) ? microsequencePlans : []).forEach((lessonEntry) => {
    const lessonKey = text(lessonEntry?.lessonKey);
    if (targetedLessonKeySet.size && !targetedLessonKeySet.has(lessonKey)) {
      return;
    }

    const existingKeys = buildExistingMicrosequenceKeySet(projectDocument, lessonEntry);
    const usedKeys = new Set(existingKeys);
    let microsequences = Array.isArray(lessonEntry?.microsequences) ? structuredClone(lessonEntry.microsequences) : [];

    if (planningMode === "existing_only") {
      if (targetedMicrosequenceKeySet.size) {
        microsequences = microsequences.filter((microsequence) => targetedMicrosequenceKeySet.has(text(microsequence?.key)));
      }
    } else if (planningMode === "new_only") {
      const actionsForLesson = (Array.isArray(plan?.actions) ? plan.actions : []).filter(
        (action) =>
          action?.expectsNewMicrosequence
          && Array.isArray(action?.lessonTargets)
          && action.lessonTargets.some((lessonTarget) => text(lessonTarget?.lessonKey) === lessonKey)
      );
      const maxNewMicrosequences = Math.max(0, Number(plan?.newMicrosequenceCountByLesson?.[lessonKey] || 0));
      const generatedMicrosequences = microsequences
        .map((microsequence, index) => {
          const currentKey = text(microsequence?.key);
          const nextKey = !currentKey || existingKeys.has(currentKey)
            ? buildGeneratedMicrosequenceKey({
                lessonKey,
                title: text(microsequence?.title),
                usedKeys,
                index
              })
            : currentKey;
          return {
            ...structuredClone(microsequence),
            key: nextKey
          };
        })
        .filter((microsequence) => !existingKeys.has(text(microsequence?.key)));
      const selectedIndices = new Set();
      const selectedMicrosequences = [];

      actionsForLesson.slice(0, maxNewMicrosequences || actionsForLesson.length).forEach((action) => {
        let bestIndex = -1;
        let bestScore = -1;
        generatedMicrosequences.forEach((microsequence, index) => {
          if (selectedIndices.has(index)) {
            return;
          }
          const score = scoreMicrosequenceAgainstDidacticType(microsequence, text(action?.didacticInterventionType));
          if (score > bestScore) {
            bestScore = score;
            bestIndex = index;
          }
        });
        if (bestIndex >= 0) {
          selectedIndices.add(bestIndex);
          selectedMicrosequences.push(generatedMicrosequences[bestIndex]);
        }
      });

      microsequences = selectedMicrosequences;
    }

    if (!microsequences.length) {
      return;
    }

    constrained.push({
      ...structuredClone(lessonEntry),
      microsequences
    });
  });

  return constrained;
}
