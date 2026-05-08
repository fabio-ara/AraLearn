export function buildMicrosequencePlanningPrompt(contract, modelCapabilities = contract?.model?.capabilities || {}) {
  const compact = modelCapabilities.profile === "compact-json";
  const body = compact ? JSON.stringify(contract) : JSON.stringify(contract, null, 2);
  const fixedTypeId = contract?.request?.userFixedTypeId;
  const fixedTypeInstructions = fixedTypeId && fixedTypeId !== "assisted"
    ? [`userFixedTypeId já está resolvido: devolva typeId exatamente igual a "${fixedTypeId}".`]
    : ["Quando userFixedTypeId estiver vazio ou assisted, escolha typeId entre availableTypes."];
  return [
    "Planeje uma microssequência do AraLearn.",
    "Responda somente JSON válido.",
    "Escolha typeId, sizeId, microsequenceGoal, selectedExtraResourceTypes, cardPlan, sourceUsePlan e reason.",
    "Cada item de cardPlan deve conter position, role, resourceType e sourceRefs.",
    "Preserve userFixedTypeId quando ele existir.",
    ...fixedTypeInstructions,
    "Preserve todos os recursos extras escolhidos pelo usuário.",
    "selectedLessonTopicRefs são assuntos selecionados no escopo da lição, normalmente derivados de títulos/tags de microssequências existentes; use como contexto auxiliar de escopo e terminologia, sem criar tags persistentes.",
    "Use apenas ids presentes no contrato.",
    "Contrato:",
    body
  ].join("\n");
}
