import { buildDidacticProductionPromptLines } from "../policies/didacticProductionPolicy.js";

export function buildMicrosequencePlanningPolicyLines(contract = {}) {
  const fixedTypeId = contract?.request?.userFixedTypeId;
  const productionLines = buildDidacticProductionPromptLines({
    weakModelMode: true,
    lessonGuidance: contract?.context?.lesson || {},
    lessonSourceGuideStructured: contract?.context?.lesson?.sourceGuideStructured || {},
    lessonDomainMap: contract?.context?.lesson?.domainMap || {},
    studyTrackPolicy: contract?.studyTrackPolicy || {}
  });

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
    "Trate sizeId como orçamento técnico por chamada, não como limite pedagógico do conteúdo.",
    "Preserve recursos extras escolhidos pelo usuário quando continuarem válidos.",
    "Use sourceGuideStructured da lição como governança principal.",
    "Use selectedLessonTopicRefs apenas como contexto auxiliar local.",
    "Use sourceUsePlan apenas com sourceId presente em sources.",
    "Se o pedido conflitar com a governança da lição, preserve a governança da lição.",
    ...productionLines,
    "Se studyTrackPolicy.mode for clarify_local_doubt, o plano deve responder requiredAnchors diretamente antes de qualquer expansão.",
    "Nesse modo, microsequenceGoal e reason devem citar os termos obrigatórios e indicar retorno à trilha da lição.",
    "Não transforme uma dúvida local em aula paralela fora de allowedContextTerms."
  ];
}
