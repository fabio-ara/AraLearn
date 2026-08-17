const BLUEPRINT_KEYS = Object.freeze([
  "goal",
  "learnerSituation",
  "learningConditions",
  "contentDemands",
  "anticipatedDifficulties",
  "designResponses",
  "prerequisiteEvidence",
  "conceptualLayers",
  "theorySteps",
  "practiceSteps",
  "feedbackPlan",
  "termLedger",
  "packageCandidates"
]);
const BLUEPRINT_LIST_KEYS = Object.freeze([
  "learningConditions",
  "contentDemands",
  "anticipatedDifficulties",
  "designResponses",
  "prerequisiteEvidence",
  "conceptualLayers",
  "theorySteps",
  "practiceSteps",
  "termLedger",
  "packageCandidates"
]);
const COMPONENT_KEYS = Object.freeze({
  learningCondition: Object.freeze(["id", "description", "designRelevance"]),
  contentDemand: Object.freeze(["id", "description", "taskOperations"]),
  anticipatedDifficulty: Object.freeze([
    "id", "description", "contentDemandIds", "learningConditionIds"
  ]),
  designResponse: Object.freeze([
    "id", "difficultyIds", "decision", "theoryStepIds",
    "practiceStepIds", "packageCandidateIds", "materializationChecks"
  ]),
  layer: Object.freeze(["id", "plainLanguageReferent", "formalTerms", "requiresLayerIds"]),
  theoryStep: Object.freeze([
    "id", "layerIds", "purpose", "taskOperation", "packageCandidateIds"
  ]),
  practiceStep: Object.freeze([
    "id", "targetLayerIds", "decision", "taskOperation", "packageCandidateIds", "feedback"
  ])
});

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function duplicateValues(values) {
  const seen = new Set();
  return values.filter((value) => seen.has(value) || !seen.add(value));
}

function requireText(errors, value, path) {
  if (!text(value)) errors.push(`${path} precisa de texto explícito.`);
}

function requireClosedObject(errors, value, path, keys) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    errors.push(`${path} precisa ser um objeto.`);
    return false;
  }
  const unknownKeys = Object.keys(value).filter((key) => !keys.includes(key));
  if (unknownKeys.length) errors.push(`${path} contém campos desconhecidos: ${unknownKeys.join(", ")}.`);
  const missingKeys = keys.filter((key) => !Object.hasOwn(value, key));
  if (missingKeys.length) errors.push(`${path} omite campos obrigatórios: ${missingKeys.join(", ")}.`);
  return unknownKeys.length === 0 && missingKeys.length === 0;
}

function requireUniqueIds(errors, entries, path) {
  const ids = entries.map((entry) => text(entry?.id));
  if (duplicateValues(ids).length) errors.push(`${path} precisa de ids únicos.`);
  return ids;
}

export function pedagogicalBlueprintContract() {
  return structuredClone({
    version: 2,
    principle: "O diagnóstico contextual e a progressão didática precedem a escolha local de estratégias, packages, quantidade de cards e custo de materialização.",
    requiredSections: BLUEPRINT_KEYS,
    learningCondition: {
      required: COMPONENT_KEYS.learningCondition,
      rule: "Registre somente condições reais de estudo capazes de alterar o desenho desta microssequência."
    },
    contentDemand: {
      required: COMPONENT_KEYS.contentDemand,
      rule: "Descreva o que a natureza do conteúdo exige do aprendiz, sem transformar a lista em taxonomia fechada."
    },
    anticipatedDifficulty: {
      required: COMPONENT_KEYS.anticipatedDifficulty,
      rule: "Ligue cada dificuldade às demandas do conteúdo e, quando pertinente, às condições reais que a produzem ou ampliam."
    },
    designResponse: {
      required: COMPONENT_KEYS.designResponse,
      rule: "Ligue cada resposta às dificuldades enfrentadas, aos passos e packages que a materializam e a critérios observáveis para conferir os cards."
    },
    layer: {
      required: COMPONENT_KEYS.layer,
      rule: "Uma camada só depende de camadas anteriores ou de pré-requisito comprovado."
    },
    theoryStep: {
      required: COMPONENT_KEYS.theoryStep,
      rule: "Cada camada aparece em teoria antes de qualquer prática que a cobre."
    },
    practiceStep: {
      required: COMPONENT_KEYS.practiceStep,
      rule: "A prática mede uma decisão principal, não introduz camada nova e prevê feedback específico."
    }
  });
}

export function evaluatePedagogicalBlueprint(raw, packageRegistry) {
  const errors = [];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { valid: false, errors: ["Blueprint precisa ser um objeto."], metrics: null };
  }
  const unknownKeys = Object.keys(raw).filter((key) => !BLUEPRINT_KEYS.includes(key));
  if (unknownKeys.length) errors.push(`Campos desconhecidos: ${unknownKeys.join(", ")}.`);
  const missingKeys = BLUEPRINT_KEYS.filter((key) => !Object.hasOwn(raw, key));
  if (missingKeys.length) errors.push(`Seções ausentes: ${missingKeys.join(", ")}.`);
  BLUEPRINT_LIST_KEYS.forEach((key) => {
    if (Object.hasOwn(raw, key) && !Array.isArray(raw[key])) {
      errors.push(`${key} precisa ser uma lista explícita.`);
    }
  });
  requireText(errors, raw.goal, "goal");
  requireText(errors, raw.learnerSituation, "learnerSituation");
  requireText(errors, raw.feedbackPlan, "feedbackPlan");

  const learningConditions = list(raw.learningConditions);
  const learningConditionIds = requireUniqueIds(
    errors,
    learningConditions,
    "learningConditions"
  );
  const knownLearningConditions = new Set(learningConditionIds);
  learningConditions.forEach((entry, index) => {
    requireClosedObject(errors, entry, `learningConditions[${index}]`, COMPONENT_KEYS.learningCondition);
    requireText(errors, entry?.id, `learningConditions[${index}].id`);
    requireText(errors, entry?.description, `learningConditions[${index}].description`);
    requireText(errors, entry?.designRelevance, `learningConditions[${index}].designRelevance`);
  });

  const contentDemands = list(raw.contentDemands);
  if (!contentDemands.length) errors.push("contentDemands precisa de ao menos uma demanda própria do conteúdo.");
  const contentDemandIds = requireUniqueIds(errors, contentDemands, "contentDemands");
  const knownContentDemands = new Set(contentDemandIds);
  contentDemands.forEach((entry, index) => {
    requireClosedObject(errors, entry, `contentDemands[${index}]`, COMPONENT_KEYS.contentDemand);
    requireText(errors, entry?.id, `contentDemands[${index}].id`);
    requireText(errors, entry?.description, `contentDemands[${index}].description`);
    if (!list(entry?.taskOperations).length) {
      errors.push(`contentDemands[${index}].taskOperations precisa nomear ao menos uma operação.`);
    }
    list(entry?.taskOperations).forEach((operation, operationIndex) => {
      requireText(errors, operation, `contentDemands[${index}].taskOperations[${operationIndex}]`);
    });
  });

  const anticipatedDifficulties = list(raw.anticipatedDifficulties);
  const anticipatedDifficultyIds = requireUniqueIds(
    errors,
    anticipatedDifficulties,
    "anticipatedDifficulties"
  );
  const knownDifficulties = new Set(anticipatedDifficultyIds);
  anticipatedDifficulties.forEach((entry, index) => {
    requireClosedObject(errors, entry, `anticipatedDifficulties[${index}]`, COMPONENT_KEYS.anticipatedDifficulty);
    requireText(errors, entry?.id, `anticipatedDifficulties[${index}].id`);
    requireText(errors, entry?.description, `anticipatedDifficulties[${index}].description`);
    if (!list(entry?.contentDemandIds).length) {
      errors.push(`anticipatedDifficulties[${index}].contentDemandIds precisa ligar a dificuldade ao conteúdo.`);
    }
    list(entry?.contentDemandIds).forEach((demandId) => {
      if (!knownContentDemands.has(text(demandId))) {
        errors.push(`anticipatedDifficulties[${index}] referencia demanda inexistente: ${demandId}.`);
      }
    });
    list(entry?.learningConditionIds).forEach((conditionId) => {
      if (!knownLearningConditions.has(text(conditionId))) {
        errors.push(`anticipatedDifficulties[${index}] referencia condição inexistente: ${conditionId}.`);
      }
    });
  });

  const prerequisites = list(raw.prerequisiteEvidence);
  prerequisites.forEach((entry, index) => {
    requireClosedObject(errors, entry, `prerequisiteEvidence[${index}]`, ["term", "evidence"]);
    requireText(errors, entry?.term, `prerequisiteEvidence[${index}].term`);
    requireText(errors, entry?.evidence, `prerequisiteEvidence[${index}].evidence`);
  });

  const layers = list(raw.conceptualLayers);
  if (!layers.length) errors.push("conceptualLayers precisa de ao menos uma camada.");
  const layerIds = requireUniqueIds(errors, layers, "conceptualLayers");
  const knownLayers = new Set();
  layers.forEach((layer, index) => {
    requireClosedObject(errors, layer, `conceptualLayers[${index}]`, COMPONENT_KEYS.layer);
    requireText(errors, layer?.id, `conceptualLayers[${index}].id`);
    requireText(errors, layer?.plainLanguageReferent, `conceptualLayers[${index}].plainLanguageReferent`);
    if (!list(layer?.formalTerms).length) errors.push(`conceptualLayers[${index}].formalTerms precisa nomear o que será formalizado.`);
    list(layer?.formalTerms).forEach((term, termIndex) => requireText(errors, term, `conceptualLayers[${index}].formalTerms[${termIndex}]`));
    list(layer?.requiresLayerIds).forEach((requiredId) => {
      if (!knownLayers.has(text(requiredId))) errors.push(`conceptualLayers[${index}] depende de camada ausente ou posterior: ${requiredId}.`);
    });
    knownLayers.add(text(layer?.id));
  });

  const candidateEntries = list(raw.packageCandidates);
  const candidateIds = requireUniqueIds(errors, candidateEntries, "packageCandidates");
  const knownCandidates = new Set(candidateIds);
  if (!candidateEntries.length) errors.push("packageCandidates precisa registrar escolhas justificadas.");
  const candidates = new Map();
  candidateEntries.forEach((candidate, index) => {
    requireClosedObject(
      errors,
      candidate,
      `packageCandidates[${index}]`,
      ["id", "packageId", "version", "reason"]
    );
    requireText(errors, candidate?.id, `packageCandidates[${index}].id`);
    requireText(errors, candidate?.packageId, `packageCandidates[${index}].packageId`);
    requireText(errors, candidate?.version, `packageCandidates[${index}].version`);
    requireText(errors, candidate?.reason, `packageCandidates[${index}].reason`);
    const definition = packageRegistry?.get(candidate?.packageId, candidate?.version);
    if (!definition) errors.push(`packageCandidates[${index}] referencia package ausente: ${candidate?.packageId}@${candidate?.version}.`);
    candidates.set(text(candidate?.id), definition);
  });

  const coveredInTheory = new Set();
  const theorySteps = list(raw.theorySteps);
  if (!theorySteps.length) errors.push("theorySteps precisa de ao menos um passo explicativo.");
  const theoryStepIds = requireUniqueIds(errors, theorySteps, "theorySteps");
  const knownTheorySteps = new Set(theoryStepIds);
  theorySteps.forEach((step, index) => {
    requireClosedObject(errors, step, `theorySteps[${index}]`, COMPONENT_KEYS.theoryStep);
    requireText(errors, step?.id, `theorySteps[${index}].id`);
    requireText(errors, step?.purpose, `theorySteps[${index}].purpose`);
    requireText(errors, step?.taskOperation, `theorySteps[${index}].taskOperation`);
    if (!list(step?.layerIds).length) errors.push(`theorySteps[${index}].layerIds está vazio.`);
    list(step?.layerIds).forEach((layerId) => {
      if (!knownLayers.has(text(layerId))) errors.push(`theorySteps[${index}] referencia camada inexistente: ${layerId}.`);
      coveredInTheory.add(text(layerId));
    });
    if (!list(step?.packageCandidateIds).length) errors.push(`theorySteps[${index}].packageCandidateIds está vazio.`);
    list(step?.packageCandidateIds).forEach((candidateId) => {
      const definition = candidates.get(text(candidateId));
      if (!definition) errors.push(`theorySteps[${index}] referencia candidato inexistente: ${candidateId}.`);
      else if (!definition.manifest.taskOperations.includes(text(step?.taskOperation))) errors.push(`theorySteps[${index}] escolhe ${candidateId} sem compatibilidade com ${step?.taskOperation}.`);
    });
  });
  layerIds.forEach((layerId) => {
    if (!coveredInTheory.has(layerId)) errors.push(`Camada ${layerId} não possui passo de teoria.`);
  });

  const practiceSteps = list(raw.practiceSteps);
  const practiceStepIds = requireUniqueIds(errors, practiceSteps, "practiceSteps");
  const crossKindStepIds = practiceStepIds.filter((stepId) => knownTheorySteps.has(stepId));
  if (crossKindStepIds.length) {
    errors.push(`theorySteps e practiceSteps repetem ids: ${crossKindStepIds.join(", ")}.`);
  }
  const knownPracticeSteps = new Set(practiceStepIds);
  const practicedLayers = new Set();
  practiceSteps.forEach((step, index) => {
    requireClosedObject(errors, step, `practiceSteps[${index}]`, COMPONENT_KEYS.practiceStep);
    requireText(errors, step?.id, `practiceSteps[${index}].id`);
    requireText(errors, step?.decision, `practiceSteps[${index}].decision`);
    requireText(errors, step?.taskOperation, `practiceSteps[${index}].taskOperation`);
    requireText(errors, step?.feedback, `practiceSteps[${index}].feedback`);
    if (!list(step?.targetLayerIds).length) errors.push(`practiceSteps[${index}].targetLayerIds está vazio.`);
    list(step?.targetLayerIds).forEach((layerId) => {
      if (!coveredInTheory.has(text(layerId))) errors.push(`practiceSteps[${index}] cobra camada ainda não ensinada: ${layerId}.`);
      practicedLayers.add(text(layerId));
    });
    if (!list(step?.packageCandidateIds).length) errors.push(`practiceSteps[${index}].packageCandidateIds está vazio.`);
    list(step?.packageCandidateIds).forEach((candidateId) => {
      const definition = candidates.get(text(candidateId));
      if (!definition) errors.push(`practiceSteps[${index}] referencia candidato inexistente: ${candidateId}.`);
      else if (!definition.manifest.taskOperations.includes(text(step?.taskOperation))) errors.push(`practiceSteps[${index}] escolhe ${candidateId} sem compatibilidade com ${step?.taskOperation}.`);
    });
  });

  const ledger = list(raw.termLedger);
  const ledgerTerms = new Set(ledger.map((entry) => text(entry?.term).toLocaleLowerCase("pt-BR")));
  ledger.forEach((entry, index) => {
    requireClosedObject(
      errors,
      entry,
      `termLedger[${index}]`,
      ["term", "introducedInLayerId", "plainMeaning"]
    );
    requireText(errors, entry?.term, `termLedger[${index}].term`);
    requireText(errors, entry?.plainMeaning, `termLedger[${index}].plainMeaning`);
    if (!knownLayers.has(text(entry?.introducedInLayerId))) errors.push(`termLedger[${index}] referencia camada inexistente.`);
  });
  layers.flatMap((layer) => list(layer?.formalTerms)).forEach((termValue) => {
    if (!ledgerTerms.has(text(termValue).toLocaleLowerCase("pt-BR"))) errors.push(`Termo formal sem explicação no ledger: ${termValue}.`);
  });

  const designResponses = list(raw.designResponses);
  requireUniqueIds(errors, designResponses, "designResponses");
  const addressedDifficulties = new Set();
  designResponses.forEach((response, index) => {
    requireClosedObject(errors, response, `designResponses[${index}]`, COMPONENT_KEYS.designResponse);
    requireText(errors, response?.id, `designResponses[${index}].id`);
    requireText(errors, response?.decision, `designResponses[${index}].decision`);
    if (!list(response?.difficultyIds).length) {
      errors.push(`designResponses[${index}].difficultyIds precisa ligar a resposta a uma dificuldade.`);
    }
    list(response?.difficultyIds).forEach((difficultyId) => {
      const normalizedId = text(difficultyId);
      if (!knownDifficulties.has(normalizedId)) {
        errors.push(`designResponses[${index}] referencia dificuldade inexistente: ${difficultyId}.`);
      }
      addressedDifficulties.add(normalizedId);
    });
    const linkedTheorySteps = list(response?.theoryStepIds);
    const linkedPracticeSteps = list(response?.practiceStepIds);
    const linkedCandidates = list(response?.packageCandidateIds);
    if (!linkedTheorySteps.length && !linkedPracticeSteps.length) {
      errors.push(`designResponses[${index}] precisa apontar ao menos um passo de teoria ou prática.`);
    }
    linkedTheorySteps.forEach((stepId) => {
      if (!knownTheorySteps.has(text(stepId))) {
        errors.push(`designResponses[${index}] referencia passo de teoria inexistente: ${stepId}.`);
      }
    });
    linkedPracticeSteps.forEach((stepId) => {
      if (!knownPracticeSteps.has(text(stepId))) {
        errors.push(`designResponses[${index}] referencia passo de prática inexistente: ${stepId}.`);
      }
    });
    linkedCandidates.forEach((candidateId) => {
      if (!knownCandidates.has(text(candidateId))) {
        errors.push(`designResponses[${index}] referencia candidato inexistente: ${candidateId}.`);
      }
    });
    const materializationChecks = list(response?.materializationChecks);
    if (!materializationChecks.length) {
      errors.push(`designResponses[${index}].materializationChecks precisa declarar ao menos um critério observável.`);
    }
    materializationChecks.forEach((check, checkIndex) => {
      requireText(
        errors,
        check,
        `designResponses[${index}].materializationChecks[${checkIndex}]`
      );
    });
  });
  anticipatedDifficultyIds.forEach((difficultyId) => {
    if (!addressedDifficulties.has(difficultyId)) {
      errors.push(`Dificuldade ${difficultyId} não possui resposta de desenho.`);
    }
  });
  return {
    valid: errors.length === 0,
    errors,
    metrics: {
      conceptualLayerCount: layers.length,
      learningConditionCount: learningConditions.length,
      contentDemandCount: contentDemands.length,
      anticipatedDifficultyCount: anticipatedDifficulties.length,
      designResponseCount: designResponses.length,
      theoryStepCount: theorySteps.length,
      practiceStepCount: practiceSteps.length,
      practicedLayerCount: practicedLayers.size,
      packageCandidateCount: candidateEntries.length
    }
  };
}
