const BLUEPRINT_KEYS = Object.freeze([
  "goal",
  "learnerSituation",
  "prerequisiteEvidence",
  "conceptualLayers",
  "theorySteps",
  "practiceSteps",
  "feedbackPlan",
  "termLedger",
  "packageCandidates"
]);

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

export function pedagogicalBlueprintContract() {
  return structuredClone({
    version: 1,
    principle: "A progressão didática precede a escolha de packages, a quantidade de cards e o custo de materialização.",
    requiredSections: BLUEPRINT_KEYS,
    layer: {
      required: ["id", "plainLanguageReferent", "formalTerms", "requiresLayerIds"],
      rule: "Uma camada só depende de camadas anteriores ou de pré-requisito comprovado."
    },
    theoryStep: {
      required: ["id", "layerIds", "purpose", "cognitiveOperation", "packageCandidateIds"],
      rule: "Cada camada aparece em teoria antes de qualquer prática que a cobre."
    },
    practiceStep: {
      required: ["id", "targetLayerIds", "decision", "cognitiveOperation", "packageCandidateIds", "feedback"],
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
  requireText(errors, raw.goal, "goal");
  requireText(errors, raw.learnerSituation, "learnerSituation");
  requireText(errors, raw.feedbackPlan, "feedbackPlan");

  const prerequisites = list(raw.prerequisiteEvidence);
  prerequisites.forEach((entry, index) => {
    requireText(errors, entry?.term, `prerequisiteEvidence[${index}].term`);
    requireText(errors, entry?.evidence, `prerequisiteEvidence[${index}].evidence`);
  });

  const layers = list(raw.conceptualLayers);
  if (!layers.length) errors.push("conceptualLayers precisa de ao menos uma camada.");
  const layerIds = layers.map(({ id }) => text(id));
  if (duplicateValues(layerIds).length) errors.push("conceptualLayers precisa de ids únicos.");
  const knownLayers = new Set();
  layers.forEach((layer, index) => {
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
  const candidateIds = candidateEntries.map(({ id }) => text(id));
  if (!candidateEntries.length) errors.push("packageCandidates precisa registrar escolhas justificadas.");
  if (duplicateValues(candidateIds).length) errors.push("packageCandidates precisa de ids locais únicos.");
  const candidates = new Map();
  candidateEntries.forEach((candidate, index) => {
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
  theorySteps.forEach((step, index) => {
    requireText(errors, step?.id, `theorySteps[${index}].id`);
    requireText(errors, step?.purpose, `theorySteps[${index}].purpose`);
    requireText(errors, step?.cognitiveOperation, `theorySteps[${index}].cognitiveOperation`);
    if (!list(step?.layerIds).length) errors.push(`theorySteps[${index}].layerIds está vazio.`);
    list(step?.layerIds).forEach((layerId) => {
      if (!knownLayers.has(text(layerId))) errors.push(`theorySteps[${index}] referencia camada inexistente: ${layerId}.`);
      coveredInTheory.add(text(layerId));
    });
    if (!list(step?.packageCandidateIds).length) errors.push(`theorySteps[${index}].packageCandidateIds está vazio.`);
    list(step?.packageCandidateIds).forEach((candidateId) => {
      const definition = candidates.get(text(candidateId));
      if (!definition) errors.push(`theorySteps[${index}] referencia candidato inexistente: ${candidateId}.`);
      else if (!definition.manifest.cognitiveOperations.includes(text(step?.cognitiveOperation))) errors.push(`theorySteps[${index}] escolhe ${candidateId} sem compatibilidade com ${step?.cognitiveOperation}.`);
    });
  });
  layerIds.forEach((layerId) => {
    if (!coveredInTheory.has(layerId)) errors.push(`Camada ${layerId} não possui passo de teoria.`);
  });

  const practiceSteps = list(raw.practiceSteps);
  if (!practiceSteps.length) errors.push("practiceSteps precisa de ao menos uma decisão de recuperação ou aplicação.");
  const practicedLayers = new Set();
  practiceSteps.forEach((step, index) => {
    requireText(errors, step?.id, `practiceSteps[${index}].id`);
    requireText(errors, step?.decision, `practiceSteps[${index}].decision`);
    requireText(errors, step?.cognitiveOperation, `practiceSteps[${index}].cognitiveOperation`);
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
      else if (!definition.manifest.cognitiveOperations.includes(text(step?.cognitiveOperation))) errors.push(`practiceSteps[${index}] escolhe ${candidateId} sem compatibilidade com ${step?.cognitiveOperation}.`);
    });
  });

  const ledger = list(raw.termLedger);
  const ledgerTerms = new Set(ledger.map(({ term }) => text(term).toLocaleLowerCase("pt-BR")));
  ledger.forEach((entry, index) => {
    requireText(errors, entry?.term, `termLedger[${index}].term`);
    requireText(errors, entry?.plainMeaning, `termLedger[${index}].plainMeaning`);
    if (!knownLayers.has(text(entry?.introducedInLayerId))) errors.push(`termLedger[${index}] referencia camada inexistente.`);
  });
  layers.flatMap(({ formalTerms }) => list(formalTerms)).forEach((termValue) => {
    if (!ledgerTerms.has(text(termValue).toLocaleLowerCase("pt-BR"))) errors.push(`Termo formal sem explicação no ledger: ${termValue}.`);
  });

  return {
    valid: errors.length === 0,
    errors,
    metrics: {
      conceptualLayerCount: layers.length,
      theoryStepCount: theorySteps.length,
      practiceStepCount: practiceSteps.length,
      practicedLayerCount: practicedLayers.size,
      packageCandidateCount: candidateEntries.length
    }
  };
}
