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
    extraLines.push("Em matrix, use values ou sequence quando a leitura de relações ou passos ficar mais clara do que em texto corrido.");
  }
  if (allowedResourceTypes.includes("graph")) {
    extraLines.push("Em graph, use vertices e edges apenas quando uma estrutura visual relacional for a melhor representação didática.");
  }
  if (studyTrackPolicy.mode === "clarify_local_doubt") {
    const anchors = (studyTrackPolicy.requiredAnchors || []).join(", ") || "termos perguntados";
    const bridgeTargets = (studyTrackPolicy.bridgeBackTargets || []).join(", ") || "trilha da lição";
    extraLines.push(
      "Modo de estudo: esclarecer dúvida local sem abandonar a trilha didática.",
      `Termos obrigatórios da dúvida: ${anchors}.`,
      "Os primeiros cards devem responder diretamente esses termos antes de qualquer expansão.",
      "Explique termos técnicos de forma local, operacional e em português claro.",
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
    "Explique antes de cobrar uso quando o conteúdo for novo.",
    "Use sourceGuideStructured da lição como governança principal.",
    "Use selectedLessonTopicRefs como contexto auxiliar.",
    "Mantenha o contexto crítico no próprio card.",
    "Não use linguagem de bastidor.",
    "Não use referência externa ou volátil.",
    "Não revele a resposta antes da prática.",
    "Quando expectedEvidence pedir aplicação, aumente prática e variação em vez de densidade textual.",
    ...productionLines,
    "Não crie campos fora do schema.",
    "Se houver sources ou sourceUsePlan, use sourceRefs válidos ou sourceNote curto para justificar ausência.",
    ...extraLines
  ];
}
