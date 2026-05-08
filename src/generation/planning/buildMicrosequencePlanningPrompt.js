export function buildMicrosequencePlanningPrompt(contract, modelCapabilities = contract?.model?.capabilities || {}) {
  const compact = modelCapabilities.profile === "compact-json";
  const body = compact ? JSON.stringify(contract) : JSON.stringify(contract, null, 2);
  return [
    "Planeje uma microssequência do AraLearn.",
    "Responda somente JSON válido.",
    "Escolha typeId, sizeId, microsequenceGoal, selectedExtraResourceTypes, cardPlan, sourceUsePlan e reason.",
    "Cada item de cardPlan deve conter position, role, resourceType e sourceRefs.",
    "Preserve userFixedTypeId quando ele existir.",
    "Preserve todos os recursos extras escolhidos pelo usuário.",
    "Use apenas ids presentes no contrato.",
    "Contrato:",
    body
  ].join("\n");
}
