import {
  buildDidacticEditPlanningPromptLines,
  buildDidacticEditPromptLines
} from "./didacticGovernance.js";

export function buildMicrosequenceEditPlanningPromptLines(contract = {}) {
  const availableResourceIds = (contract?.representation?.availableResources || []).map((item) => item.id).filter(Boolean);
  return [
    "Planeje uma edição de microssequência do AraLearn.",
    "Responda somente JSON válido.",
    "Papel do AraLearn nesta operação: fixar escopo de edição, cards atuais, recursos permitidos e validação.",
    "Seu papel aqui é apenas propor editScope, affectedCards, operations, requiredResourceTypes, requiresFullPreviousVersion, previousVersionIdsToLoad e reason dentro desse escopo.",
    "Use somente os campos: editScope, affectedCards, operations, requiredResourceTypes, requiresFullPreviousVersion, previousVersionIdsToLoad e reason.",
    "Não reescreva os cards nem decida aplicação final no projeto; isso pertence ao AraLearn e ao usuário.",
    "Preserve cards e recursos selecionados pelo usuário quando existirem.",
    "Trate requestGovernance.precedence como ordem obrigatória de leitura do contrato.",
    "Trate requestGovernance.lessonAnchors como âncoras fortes da lição.",
    "Use request.userPrompt apenas para especializar o recorte imediato e a ênfase da edição dentro da lição atual.",
    "Se request.userPrompt conflitar com a meta, a notação, as confusões prováveis ou o critério final da lição, preserve a governança da lição e reduza o pedido ao escopo governado.",
    "selectedLessonTopicRefs são assuntos selecionados no escopo da lição, normalmente derivados de títulos e tags de microssequências existentes; use como contexto auxiliar de escopo e terminologia, sem criar tags persistentes.",
    "Use representation.availableResources como envelope fechado de recursos que podem ser pedidos no plano.",
    availableResourceIds.length
      ? `Recursos disponíveis para esta edição: ${availableResourceIds.join(", ")}.`
      : "Recursos disponíveis para esta edição: paragraph.",
    ...buildDidacticEditPlanningPromptLines()
  ];
}

export function buildMicrosequenceEditPromptLines(contract = {}) {
  return [
    "Aplique a edição planejada à microssequência do AraLearn.",
    "Responda somente JSON válido no formato: {\"cards\":[...]}",
    "Papel do AraLearn: fixar cards atuais, escopo de edição, recursos permitidos e validação final.",
    "Seu papel aqui é apenas devolver os cards editados que respeitam esse escopo.",
    "Preserve cards não afetados quando editPlan.editScope for selected_cards.",
    "Use apenas recursos permitidos em resources.allowedResourceTypes.",
    "Não mude destino estrutural, status, tags persistentes nem decisão editorial final; o usuário revisa o resultado.",
    "Trate requestGovernance.precedence como ordem obrigatória de leitura do contrato.",
    "Trate requestGovernance.lessonAnchors como âncoras fortes da lição.",
    "Use request.userPrompt apenas para especializar o recorte imediato e a ênfase da edição dentro da lição atual.",
    "Se request.userPrompt conflitar com a meta, a notação, as confusões prováveis ou o critério final da lição, preserve a governança da lição e reduza o pedido ao escopo governado.",
    "Use context.path como a linha hierárquica completa até a microssequência.",
    "Use context.lesson.sourceGuideStructured como governança principal da lição atual.",
    "Use selectedLessonTopicRefs para orientar escopo e terminologia sem transformar essas referências em tags persistentes da microssequência.",
    "Use context.lesson.microsequenceLine para manter continuidade didática com as microssequências da lição sem depender de contexto oculto.",
    "Para block_gap_fill, use feedbackAfter como comentário posterior preservado em say.after; não use feedbackPopup.",
    "Mantenha target e versionId.",
    ...buildDidacticEditPromptLines()
  ];
}
