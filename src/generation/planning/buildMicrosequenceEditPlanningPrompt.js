import { buildDidacticEditPlanningPromptLines } from "../didactics/didacticGovernance.js";

export function buildMicrosequenceEditPlanningPrompt(contract, modelCapabilities = contract?.model?.capabilities || {}) {
  const body = modelCapabilities.profile === "compact-json" ? JSON.stringify(contract) : JSON.stringify(contract, null, 2);
  return [
    "Planeje uma edição de microssequência do AraLearn.",
    "Responda somente JSON válido.",
    "Papel do AraLearn nesta operação: fixar escopo de edição, cards atuais, recursos permitidos e validação.",
    "Seu papel aqui é apenas propor editScope, affectedCards, operations, requiredResourceTypes, requiresFullPreviousVersion, previousVersionIdsToLoad e reason dentro desse escopo.",
    "Use editScope, affectedCards, operations, requiredResourceTypes, requiresFullPreviousVersion, previousVersionIdsToLoad e reason.",
    "Não reescreva os cards nem decida aplicação final no projeto; isso pertence ao AraLearn e ao usuário.",
    "Preserve cards e recursos selecionados pelo usuário quando existirem.",
    "Trate requestGovernance.precedence como ordem obrigatória de leitura do contrato.",
    "Trate requestGovernance.lessonAnchors como âncoras fortes da lição.",
    "Use request.userEditPrompt apenas para especializar o recorte imediato e a ênfase da edição dentro da lição atual.",
    "Se request.userEditPrompt conflitar com a meta, a notação, as confusões prováveis ou o critério final da lição, preserve a governança da lição e reduza o pedido ao escopo governado.",
    "selectedLessonTopicRefs são assuntos selecionados no escopo da lição, normalmente derivados de títulos/tags de microssequências existentes; use como contexto auxiliar de escopo e terminologia, sem criar tags persistentes.",
    "Respeite context.lesson.resourceTags, contentTypeTags, learningActionTags e supportLevel como governança operacional fechada da lição.",
    ...buildDidacticEditPlanningPromptLines(),
    "Contrato:",
    body
  ].join("\n");
}
