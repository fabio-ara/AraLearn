import { buildLessonDomainCoverageReport, isExplanationCoverageRole } from "../domain/lessonDomainModel.js";
import { buildMeticulousDidacticPolicy } from "../policies/meticulousDidacticPolicy.js";
import { validateDidacticRedundancy } from "./validateDidacticRedundancy.js";

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function list(value, limit = 8) {
  const seen = new Set();
  return (Array.isArray(value) ? value : [])
    .map((item) => text(item))
    .filter((item) => {
      if (!item) {
        return false;
      }
      const key = item.toLowerCase();
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    })
    .slice(0, limit);
}

function comparable(value) {
  return text(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function readCardBody(card) {
  const pieces = [
    card?.text,
    card?.question,
    card?.prompt,
    card?.say,
    card?.ask,
    card?.after,
    card?.feedback,
    card?.feedbackAfter,
    card?.code,
    card?.table?.title,
    ...(Array.isArray(card?.table?.columns) ? card.table.columns : [])
  ];
  return pieces.map((item) => text(item)).filter(Boolean).join(" ");
}

function hasExampleSignal(card) {
  const body = comparable(readCardBody(card));
  if (/por exemplo|exemplo|caso|considere|observe|suponha|\bse\b|\d/.test(body)) {
    return true;
  }
  if (card?.resourceType === "code_editor" && text(card?.code) && text(card?.prompt)) {
    return true;
  }
  if (card?.resourceType === "table" || card?.resourceType === "matrix" || card?.resourceType === "tree") {
    return true;
  }
  return false;
}

function hasPracticeIntent(card) {
  return (
    ["multiple_choice", "block_gap_fill"].includes(text(card?.resourceType)) ||
    typeof card?.ask === "string" ||
    Array.isArray(card?.wrong) ||
    /\[\[[\s\S]*?\]\]/.test(text(card?.say))
  );
}

function hasDemonstrationIntent(card) {
  if (card?.resourceType === "code_editor" && text(card?.code) && text(card?.prompt)) {
    return true;
  }
  return hasExampleSignal(card) && !hasPracticeIntent(card);
}

function hasFeedback(card) {
  return Boolean(text(card?.after) || text(card?.feedback) || text(card?.feedbackAfter));
}

function requiresInlineFeedback(card) {
  return ["multiple_choice", "block_gap_fill"].includes(text(card?.resourceType));
}

function isDemonstrationCard(card) {
  return Boolean(hasDemonstrationIntent(card));
}

function hasNotation(value) {
  return /[¬∧∨→↔√]|`[^`]+`|\|\|/.test(text(value));
}

function isGenericCard(card) {
  const body = comparable(readCardBody(card));
  if (!body) {
    return false;
  }
  return /ideia central|conceito importante|tema estudado|assunto pedido|topico pedido/.test(body);
}

function pushIssue(listRef, type, target, message) {
  listRef.push({ type, target, message });
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
  if (!redundancy.ok) {
    redundancy.redundancyWarnings.forEach((warning) => {
      shallowErrors.push(warning);
    });
  }

  return {
    ok: shallowErrors.length === 0 && missingDepth.length === 0 && redundancy.redundancyWarnings.length === 0,
    shallowErrors,
    missingDepth,
    redundancyWarnings: redundancy.redundancyWarnings,
    suggestedActions: Array.from(new Set(suggestedActions)).slice(0, 8),
    policy
  };
}
