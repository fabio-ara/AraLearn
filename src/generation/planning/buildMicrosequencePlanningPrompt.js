export function buildMicrosequencePlanningPrompt(contract, modelCapabilities = contract?.model?.capabilities || {}) {
  const compact = modelCapabilities?.preferShortSchemas !== false;
  const body = compact ? JSON.stringify(contract) : JSON.stringify(contract, null, 2);
  const fixedTypeId = contract?.request?.userFixedTypeId;

  return [
    "Planeje a microssequência.",
    "Responda somente JSON válido.",
    "Devolva apenas: typeId, sizeId, microsequenceGoal, selectedExtraResourceTypes, sourceUsePlan e reason.",
    "Não devolva cardPlan, cards, position, role, label, resourceType por card, tags persistentes, status nem alteração estrutural.",
    "Não faça resumo genérico. Decomponha o ponto didático solicitado.",
    "Cada nova microssequência deve acrescentar função didática nova ou variação de prática justificada.",
    "Se o conteúdo já está coberto, não gere duplicata.",
    fixedTypeId && fixedTypeId !== "assisted"
      ? `Use typeId exatamente igual a "${fixedTypeId}".`
      : "Escolha typeId entre availableTypes.",
    "Escolha sizeId entre availableSizes.",
    "Preserve recursos extras escolhidos pelo usuário quando continuarem válidos.",
    "Use sourceGuideStructured da lição como governança principal.",
    "Use selectedLessonTopicRefs apenas como contexto auxiliar local.",
    "Use sourceUsePlan apenas com sourceId presente em sources.",
    "Se o pedido conflitar com a governança da lição, preserve a governança da lição.",
    "Contrato:",
    body
  ].join("\n");
}
