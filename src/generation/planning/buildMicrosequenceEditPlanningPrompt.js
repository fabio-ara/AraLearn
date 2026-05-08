export function buildMicrosequenceEditPlanningPrompt(contract, modelCapabilities = contract?.model?.capabilities || {}) {
  const body = modelCapabilities.profile === "compact-json" ? JSON.stringify(contract) : JSON.stringify(contract, null, 2);
  return [
    "Planeje uma edição de microssequência do AraLearn.",
    "Responda somente JSON válido.",
    "Use editScope, affectedCards, operations, requiredResourceTypes, requiresFullPreviousVersion, previousVersionIdsToLoad e reason.",
    "Preserve cards e recursos selecionados pelo usuário quando existirem.",
    "Contrato:",
    body
  ].join("\n");
}
