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
    "Papel do AraLearn nesta operação: fixar contrato, tipos disponíveis, recursos possíveis, validação local e cardPlan final.",
    "Seu papel aqui é apenas propor typeId, sizeId, microsequenceGoal, selectedExtraResourceTypes, sourceUsePlan e reason dentro desse contrato.",
    "Escolha apenas typeId, sizeId, microsequenceGoal, selectedExtraResourceTypes, sourceUsePlan e reason.",
    "Não devolva cardPlan, cards, position, role nem resourceType por card; o AraLearn monta a sequência de cards de forma determinística depois do planejamento.",
    "Não decida contrato final, recurso por posição, aplicação no projeto nem revisão editorial final; isso pertence ao AraLearn e ao usuário.",
    "Preserve userFixedTypeId quando ele existir.",
    ...fixedTypeInstructions,
    "Preserve todos os recursos extras escolhidos pelo usuário.",
    "Trate requestGovernance.precedence como ordem obrigatória de leitura do contrato.",
    "Trate requestGovernance.lessonAnchors como âncoras fortes da lição.",
    "Use request.userPrompt apenas para especializar o recorte imediato e a ênfase dentro da lição atual.",
    "Se request.userPrompt conflitar com a meta, a notação, as confusões prováveis ou o critério final da lição, preserve a governança da lição e reduza o pedido ao escopo governado.",
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
