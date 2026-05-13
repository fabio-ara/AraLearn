export function buildMicrosequenceGenerationPrompt(contract, modelCapabilities = contract?.model?.capabilities || {}) {
  const compact = modelCapabilities?.preferShortSchemas !== false;
  const body = compact ? JSON.stringify(contract) : JSON.stringify(contract, null, 2);
  const allowedResourceTypes = contract?.resources?.allowedResourceTypes || [];
  const extraLines = [];

  if (allowedResourceTypes.includes("block_gap_fill")) {
    extraLines.push("Em block_gap_fill, use segments com kind text/blank, blankId curto e acceptedBlockIds válidos.");
  }
  if (allowedResourceTypes.includes("matrix")) {
    extraLines.push("Em matrix, use values ou sequence; se usar sequence, mantenha o passo crítico no mesmo card.");
  }

  return [
    "Gere cards para o plano.",
    "Responda somente JSON válido.",
    "Devolva exatamente output.expectedCardCount cards.",
    "Use exatamente position e resourceType de didacticPlan.cardPlan.",
    "Preencha apenas campos aceitos por resources.effectiveResourceSchemas.",
    "Não resuma o tópico. Trabalhe apenas o ponto didático deste card, com contexto suficiente, exemplo ou prática conforme o papel do card.",
    "Não faça resumo genérico. Decomponha o ponto didático solicitado.",
    "Use sourceGuideStructured da lição como governança principal.",
    "Use selectedLessonTopicRefs como contexto auxiliar.",
    "Mantenha o contexto crítico no próprio card.",
    "Não use linguagem de bastidor.",
    "Não use referência externa ou volátil.",
    "Não revele a resposta antes da prática.",
    "Não aumente densidade textual para parecer completo. A meticulosidade deve vir de progressão e decomposição.",
    "Não crie campos fora do schema.",
    "Se houver sources ou sourceUsePlan, use sourceRefs válidos ou sourceNote curto para justificar ausência.",
    ...extraLines,
    "Contrato:",
    body
  ].join("\n");
}
