export function buildMicrosequenceEditPlanningPrompt(contract, modelCapabilities = contract?.model?.capabilities || {}) {
  const body = modelCapabilities.profile === "compact-json" ? JSON.stringify(contract) : JSON.stringify(contract, null, 2);
  return [
    "Planeje uma edição de microssequência do AraLearn.",
    "Responda somente JSON válido.",
    "Use editScope, affectedCards, operations, requiredResourceTypes, requiresFullPreviousVersion, previousVersionIdsToLoad e reason.",
    "Preserve cards e recursos selecionados pelo usuário quando existirem.",
    "selectedLessonTopicRefs são assuntos selecionados no escopo da lição, normalmente derivados de títulos/tags de microssequências existentes; use como contexto auxiliar de escopo e terminologia, sem criar tags persistentes.",
    "Contrato:",
    body
  ].join("\n");
}
