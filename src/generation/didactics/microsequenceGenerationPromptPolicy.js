import { buildDidacticProductionPromptLines } from "../policies/didacticProductionPolicy.js";

export function buildMicrosequenceGenerationPromptLines(contract = {}) {
  const allowedResourceTypes = contract?.resources?.allowedResourceTypes || [];
  const studyTrackPolicy = contract?.studyTrackPolicy || {};
  const productionLines = buildDidacticProductionPromptLines({
    weakModelMode: true,
    lessonGuidance: contract?.context?.lesson || {},
    lessonSourceGuideStructured: contract?.context?.lesson?.sourceGuideStructured || {},
    lessonDomainMap: contract?.context?.lesson?.domainMap || {},
    studyTrackPolicy
  });
  const extraLines = [];

  if (allowedResourceTypes.includes("block_gap_fill")) {
    extraLines.push("Em block_gap_fill, use segments com kind text/blank, blankId curto e acceptedBlockIds válidos.");
  }
  if (allowedResourceTypes.includes("matrix")) {
    extraLines.push("Em matrix, use values ou sequence; se usar sequence, mantenha o passo crítico no mesmo card.");
  }
  if (allowedResourceTypes.includes("graph")) {
    extraLines.push("Em graph, use vertices e edges para grafos matemáticos; reserve table para matriz de adjacência, graus e tabela de Dijkstra.");
    extraLines.push("Quando o tópico for Teoria dos Grafos e graph estiver disponível, prefira graph para vértices, arestas, pesos e destaques.");
  }
  if (studyTrackPolicy.mode === "clarify_local_doubt") {
    const anchors = (studyTrackPolicy.requiredAnchors || []).join(", ") || "termos perguntados";
    const bridgeTargets = (studyTrackPolicy.bridgeBackTargets || []).join(", ") || "trilha da lição";
    extraLines.push(
      "Modo de estudo: esclarecer dúvida local sem abandonar a trilha didática.",
      `Termos obrigatórios da dúvida: ${anchors}.`,
      "Os primeiros cards devem responder diretamente esses termos antes de qualquer conteúdo novo.",
      "Explique siglas, termos técnicos e palavras em inglês de forma local, operacional e em português claro.",
      "Não abra microaula paralela nem analogia longa; se usar analogia externa, conecte-a explicitamente ao conteúdo atual.",
      `Ao final, reconecte a explicação a: ${bridgeTargets}.`
    );
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
    "Não aumente densidade textual para parecer completo. A sequência exaustiva de cards deve vir de progressão e decomposição.",
    ...productionLines,
    "Não crie campos fora do schema.",
    "Se houver sources ou sourceUsePlan, use sourceRefs válidos ou sourceNote curto para justificar ausência.",
    ...extraLines
  ];
}
