import { buildDidacticEditPromptLines } from "../didactics/didacticGovernance.js";

export function buildMicrosequenceEditPrompt(contract, modelCapabilities = contract?.model?.capabilities || {}) {
  const body = modelCapabilities.profile === "compact-json" ? JSON.stringify(contract) : JSON.stringify(contract, null, 2);
  return [
    "Aplique a edição planejada à microssequência do AraLearn.",
    "Responda somente JSON válido no formato: {\"cards\":[...]}",
    "Preserve cards não afetados quando editScope for selected_cards.",
    "Use apenas recursos permitidos em resources.allowedResourceTypes.",
    "Use context.path como a linha hierárquica completa até a microssequência.",
    "Use context.sourceGuideLineage como governança acumulada de curso, módulo e lição.",
    "Use selectedLessonTopicRefs como assuntos selecionados no escopo da lição para orientar escopo e terminologia; não transforme essas referências em tags persistentes da microssequência.",
    "Use context.lesson.microsequenceLine para manter continuidade didática com as microssequências da lição sem depender de contexto oculto.",
    "Para block_gap_fill, use feedbackAfter como comentário posterior preservado em say.after; não use feedbackPopup.",
    "Mantenha target e versionId.",
    ...buildDidacticEditPromptLines(),
    "Contrato:",
    body
  ].join("\n");
}
