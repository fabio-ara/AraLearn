function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function parseCardTargetPosition(target) {
  const match = /^card-(\d+)$/i.exec(text(target));
  return match ? Number(match[1]) : 0;
}

function chooseParagraphResource(allowedResourceTypes = []) {
  if (allowedResourceTypes.includes("paragraph")) {
    return "paragraph";
  }
  return allowedResourceTypes[0] || "paragraph";
}

function choosePracticeResource(allowedResourceTypes = []) {
  if (allowedResourceTypes.includes("multiple_choice")) {
    return "multiple_choice";
  }
  if (allowedResourceTypes.includes("block_gap_fill")) {
    return "block_gap_fill";
  }
  return chooseParagraphResource(allowedResourceTypes);
}

function findFirstPracticePosition(cardPlan = []) {
  const item = (Array.isArray(cardPlan) ? cardPlan : []).find(
    (entry) =>
      ["multiple_choice", "block_gap_fill"].includes(text(entry?.resourceType)) ||
      /guided|practice|check/.test(text(entry?.role))
  );
  return Number(item?.position) || Math.max(1, (cardPlan || []).length);
}

function findPracticeInsertionPosition(cardPlan = []) {
  const consolidate = (Array.isArray(cardPlan) ? cardPlan : []).find((entry) => /consolidate/.test(text(entry?.role)));
  if (Number(consolidate?.position)) {
    return Number(consolidate.position);
  }
  return Math.max(1, (cardPlan || []).length + 1);
}

function addRewriteReason(rewritesByPosition, position, reason) {
  if (!Number.isFinite(position) || position <= 0) {
    return;
  }
  const current = rewritesByPosition.get(position) || new Set();
  current.add(reason);
  rewritesByPosition.set(position, current);
}

function addUniqueInsertion(insertions, insertion) {
  const existing = insertions.find(
    (item) => item.anchorPosition === insertion.anchorPosition && item.resourceType === insertion.resourceType
  );
  if (existing) {
    existing.learningGoal = Array.from(new Set([existing.learningGoal, insertion.learningGoal])).join(" ");
    existing.label = existing.label || insertion.label;
    return;
  }
  insertions.push(insertion);
}

function buildExpandedCardPlan(cardPlan = [], insertions = []) {
  const sortedInsertions = [...insertions].sort((a, b) => {
    if (a.anchorPosition !== b.anchorPosition) {
      return a.anchorPosition - b.anchorPosition;
    }
    return a.priority - b.priority;
  });
  const expanded = [];
  let insertionIndex = 0;

  (Array.isArray(cardPlan) ? cardPlan : []).forEach((entry) => {
    while (sortedInsertions[insertionIndex] && sortedInsertions[insertionIndex].anchorPosition === Number(entry?.position)) {
      expanded.push({
        role: sortedInsertions[insertionIndex].role,
        label: sortedInsertions[insertionIndex].label,
        resourceType: sortedInsertions[insertionIndex].resourceType,
        sourceRefs: [],
        learningGoal: sortedInsertions[insertionIndex].learningGoal,
        autoInserted: true
      });
      insertionIndex += 1;
    }
    expanded.push({
      ...entry,
      learningGoal: text(entry?.learningGoal)
    });
  });

  while (sortedInsertions[insertionIndex]) {
    expanded.push({
      role: sortedInsertions[insertionIndex].role,
      label: sortedInsertions[insertionIndex].label,
      resourceType: sortedInsertions[insertionIndex].resourceType,
      sourceRefs: [],
      learningGoal: sortedInsertions[insertionIndex].learningGoal,
      autoInserted: true
    });
    insertionIndex += 1;
  }

  return expanded.map((entry, index) => ({
    ...entry,
    position: index + 1
  }));
}

function summarizeAuditReasons(audit = {}) {
  return [
    ...(Array.isArray(audit?.shallowErrors) ? audit.shallowErrors : []),
    ...(Array.isArray(audit?.missingDepth) ? audit.missingDepth : [])
  ].map((item) => item?.message).filter(Boolean);
}

export function buildDidacticIterationPlan(validationResult = {}, generationContract = {}) {
  const didacticAudit = validationResult?.didacticAudit;
  const cardPlan = generationContract?.didacticPlan?.cardPlan || [];
  const allowedResourceTypes = generationContract?.resources?.allowedResourceTypes || [];
  if (!didacticAudit || (!didacticAudit.shallowErrors?.length && !didacticAudit.missingDepth?.length)) {
    return null;
  }

  const rewritesByPosition = new Map();
  const insertions = [];
  const firstPracticePosition = findFirstPracticePosition(cardPlan);
  const practiceInsertionPosition = findPracticeInsertionPosition(cardPlan);

  (didacticAudit.shallowErrors || []).forEach((item) => {
    const position = parseCardTargetPosition(item?.target);
    if (["generic_content", "unstable_or_backstage_reference", "answer_revealed_before_practice", "practice_without_local_context"].includes(item?.type)) {
      addRewriteReason(rewritesByPosition, position, item.message);
      return;
    }
    if (item?.type === "definition_without_example") {
      addUniqueInsertion(insertions, {
        anchorPosition: firstPracticePosition,
        priority: 10,
        kind: "example",
        role: "auto_add_example",
        label: "mostrar exemplo mínimo",
        resourceType: chooseParagraphResource(allowedResourceTypes),
        learningGoal: "Inserir um exemplo mínimo concreto antes da checagem."
      });
    }
  });

  (didacticAudit.missingDepth || []).forEach((item) => {
    const position = parseCardTargetPosition(item?.target);
    if (item?.type === "practice_without_feedback") {
      addRewriteReason(rewritesByPosition, position, item.message);
      return;
    }
    if (item?.type === "notation_without_preparation") {
      addUniqueInsertion(insertions, {
        anchorPosition: position || firstPracticePosition,
        priority: 5,
        kind: "notation_prep",
        role: "auto_prepare_notation",
        label: "preparar notação",
        resourceType: chooseParagraphResource(allowedResourceTypes),
        learningGoal: "Traduzir a notação em linguagem comum antes da cobrança."
      });
      return;
    }
    if (item?.type === "theory_to_exercise_without_example") {
      addUniqueInsertion(insertions, {
        anchorPosition: firstPracticePosition,
        priority: 15,
        kind: "guided_example",
        role: "auto_guided_example",
        label: "mostrar exemplo guiado",
        resourceType: chooseParagraphResource(allowedResourceTypes),
        learningGoal: "Adicionar um caso guiado entre a teoria e a prática."
      });
      return;
    }
    if (item?.type === "conceptual_sequence_without_practice") {
      addUniqueInsertion(insertions, {
        anchorPosition: practiceInsertionPosition,
        priority: 20,
        kind: "practice",
        role: "auto_add_practice",
        label: "criar prática mínima",
        resourceType: choosePracticeResource(allowedResourceTypes),
        learningGoal: "Adicionar prática pequena com evidência de domínio."
      });
    }
  });

  const rewritePositions = [...rewritesByPosition.keys()].sort((a, b) => a - b);
  if (!rewritePositions.length && !insertions.length) {
    return null;
  }

  const expandedCardPlan = buildExpandedCardPlan(cardPlan, insertions);
  const requestedActions = [];
  if (insertions.length) {
    requestedActions.push(...insertions.map((item) => item.learningGoal));
  }
  if (rewritePositions.length) {
    requestedActions.push(`Reescrever os cards nas posições ${rewritePositions.join(", ")} para remover os defeitos detectados.`);
  }

  return {
    strategy: insertions.length ? "expand_or_rewrite" : "rewrite_only",
    expectedCardCount: expandedCardPlan.length,
    cardPlan: expandedCardPlan,
    rewritePositions,
    requestedActions: Array.from(new Set(requestedActions)),
    auditReasons: Array.from(new Set(summarizeAuditReasons(didacticAudit))).slice(0, 8)
  };
}
