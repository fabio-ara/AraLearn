import { buildLessonDomainCoverageReport, isExplanationCoverageRole } from "../domain/lessonDomainModel.js";
import {
  hasDemonstrationIntent,
  hasExampleSignal,
  hasFeedback,
  hasNotation,
  hasPracticeIntent,
  isDemonstrationCard,
  isGenericCard,
  readCardBody,
  requiresInlineFeedback
} from "../didactics/didacticCardSignals.js";
import { comparable, text } from "../didactics/didacticText.js";
import { buildMeticulousDidacticPolicy } from "../policies/meticulousDidacticPolicy.js";
import { validateDidacticRedundancy } from "./validateDidacticRedundancy.js";
import { annotateDidacticIssue } from "./didacticIssueCatalog.js";

function pushIssue(listRef, type, target, message) {
  listRef.push(annotateDidacticIssue({ type, target, message }));
}

export function validateDidacticDepth({
  lesson = null,
  microsequence = null,
  cards = [],
  existingMicrosequences = [],
  weakModelMode = true
} = {}) {
  const policy = buildMeticulousDidacticPolicy({ weakModelMode });
  const normalizedCards = Array.isArray(cards) ? cards : [];
  const shallowErrors = [];
  const missingDepth = [];
  const suggestedActions = [];

  const explanationIndices = [];
  const practiceIndices = [];
  normalizedCards.forEach((card, index) => {
    if (hasPracticeIntent(card)) {
      practiceIndices.push(index);
    } else {
      explanationIndices.push(index);
    }

    if (hasPracticeIntent(card) && !readCardBody(card)) {
      pushIssue(shallowErrors, "practice_without_local_context", text(card?.key) || `card-${index + 1}`, "O card de prática não traz contexto local suficiente.");
    }
    if (requiresInlineFeedback(card) && !hasFeedback(card)) {
      pushIssue(missingDepth, "practice_without_feedback", text(card?.key) || `card-${index + 1}`, "A prática não oferece feedback corretivo no próprio card.");
    }
    if (hasNotation(readCardBody(card)) && index > 0 && !hasExampleSignal(card)) {
      const previousBody = normalizedCards.slice(0, index).map(readCardBody).join(" ");
      if (!hasNotation(previousBody)) {
        pushIssue(missingDepth, "notation_without_preparation", text(card?.key) || `card-${index + 1}`, "O card usa notação sem preparação local suficiente.");
      }
    }
    if (isGenericCard(card)) {
      pushIssue(shallowErrors, "generic_content", text(card?.key) || `card-${index + 1}`, "O card está genérico demais para o domínio da lição.");
    }
    if (typeof card?.ask === "string" && comparable(card.ask).includes(comparable(card.answer))) {
      pushIssue(shallowErrors, "answer_revealed_before_practice", text(card?.key) || `card-${index + 1}`, "A resposta aparece revelada no próprio enunciado.");
    }
    if (/(na aula|no material|no pdf|trecho acima|figura acima|tabela acima|prompt|json|schema|pipeline)/i.test(readCardBody(card))) {
      pushIssue(shallowErrors, "unstable_or_backstage_reference", text(card?.key) || `card-${index + 1}`, "O card depende de referência externa, instável ou de bastidor.");
    }
  });

  const hasExplanation = normalizedCards.some((card) => !hasPracticeIntent(card));
  const hasPractice = normalizedCards.some(hasPracticeIntent);
  const hasDemonstration = normalizedCards.some(isDemonstrationCard);

  if (normalizedCards.length && hasExplanation && !hasDemonstration) {
    pushIssue(shallowErrors, "definition_without_example", text(microsequence?.key) || text(microsequence?.title) || "microsequence", "A microssequência explica, mas não mostra exemplo mínimo.");
    suggestedActions.push("Adicionar um card de demonstração ou exemplo guiado antes da prática.");
  }

  if (practiceIndices.length && explanationIndices.length && practiceIndices[0] < explanationIndices[0]) {
    pushIssue(shallowErrors, "practice_before_explanation", text(microsequence?.key) || text(microsequence?.title) || "microsequence", "A prática aparece antes da preparação didática local.");
  }

  if (practiceIndices.length && explanationIndices.length && !normalizedCards.slice(0, practiceIndices[0]).some(isDemonstrationCard)) {
    pushIssue(missingDepth, "theory_to_exercise_without_example", text(microsequence?.key) || text(microsequence?.title) || "microsequence", "A sequência salta para exercício sem exemplo guiado suficiente.");
  }

  if (microsequence && isExplanationCoverageRole(microsequence.coverageRole) && !hasPractice) {
    pushIssue(missingDepth, "conceptual_sequence_without_practice", text(microsequence?.key) || text(microsequence?.title) || "microsequence", "A microssequência cobre explicação, mas não deixa evidência prática de domínio.");
    suggestedActions.push("Incluir prática pequena, autossuficiente e com feedback.");
  }

  if (lesson) {
    const coverage = buildLessonDomainCoverageReport(lesson);
    if (coverage.explainedWithoutPractice.length) {
      pushIssue(missingDepth, "domain_items_without_practice", text(lesson?.key) || text(lesson?.title) || "lesson", `Itens só explicados: ${coverage.explainedWithoutPractice.join("; ")}.`);
    }
    if (coverage.practiceWithoutVariation.length) {
      pushIssue(missingDepth, "practice_without_variation", text(lesson?.key) || text(lesson?.title) || "lesson", `Itens com prática insuficiente: ${coverage.practiceWithoutVariation.join("; ")}.`);
    }
    if (coverage.uncoveredItems.length) {
      suggestedActions.push(`Criar microssequências para: ${coverage.uncoveredItems.join("; ")}.`);
    }
  }

  const redundancy = validateDidacticRedundancy({ microsequence, existingMicrosequences });
  const normalizedRedundancyWarnings = (redundancy.redundancyWarnings || []).map((warning) => annotateDidacticIssue(warning));
  if (!redundancy.ok) {
    normalizedRedundancyWarnings.forEach((warning) => {
      shallowErrors.push(warning);
    });
  }

  const allIssues = [...shallowErrors, ...missingDepth];
  const blockingIssues = allIssues.filter((item) => item.blocksValidation === true);
  const declarativeGaps = allIssues.filter((item) => item.severity === "declarative_gap");
  const heuristicSignals = allIssues.filter((item) => item.severity === "heuristic_signal");
  const actionableIssues = allIssues.filter((item) => item.allowsAutoIteration === true);

  return {
    ok: allIssues.length === 0,
    passesDeterministicValidation: blockingIssues.length === 0,
    shallowErrors,
    missingDepth,
    redundancyWarnings: normalizedRedundancyWarnings,
    blockingIssues,
    declarativeGaps,
    heuristicSignals,
    actionableIssues,
    suggestedActions: Array.from(new Set(suggestedActions)).slice(0, 8),
    policy
  };
}
