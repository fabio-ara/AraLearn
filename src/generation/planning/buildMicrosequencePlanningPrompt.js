import { buildDidacticPlanningPromptLines } from "../didactics/didacticGovernance.js";

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
    "Escolha apenas typeId, sizeId, microsequenceGoal, selectedExtraResourceTypes, sourceUsePlan e reason.",
    "Não devolva cardPlan, cards, position, role nem resourceType por card; o AraLearn monta a sequência de cards de forma determinística depois do planejamento.",
    "Preserve userFixedTypeId quando ele existir.",
    ...fixedTypeInstructions,
    "Preserve todos os recursos extras escolhidos pelo usuário.",
    "selectedLessonTopicRefs são assuntos selecionados no escopo da lição, normalmente derivados de títulos/tags de microssequências existentes; use como contexto auxiliar de escopo e terminologia, sem criar tags persistentes.",
    "Use context.path como a linha hierárquica completa até a microssequência-alvo.",
    "Use context.sourceGuideLineage como governança acumulada de curso, módulo e lição.",
    "Use context.lesson.microsequenceLine para enxergar progressão local, microssequências vizinhas e evitar repetição ou salto didático.",
    "Use apenas ids presentes no contrato.",
    ...buildDidacticPlanningPromptLines(),
    "Contrato:",
    body
  ].join("\n");
}
