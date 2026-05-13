import { validateDidacticDepth } from "./validateDidacticDepth.js";

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function collectStrings(value, path = "card") {
  if (typeof value === "string") {
    return [{ path, value }];
  }
  if (!value || typeof value !== "object") {
    return [];
  }
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => collectStrings(item, `${path}[${index}]`));
  }
  return Object.entries(value).flatMap(([key, item]) => collectStrings(item, `${path}.${key}`));
}

const DIDACTIC_PATTERNS = Object.freeze([
  { pattern: /\b(card|exemplo|quest[aã]o)\s+anterior\b/i, message: "referência a card anterior." },
  { pattern: /\b(figura|tabela|trecho)\s+acima\b/i, message: "referência a tabela/figura/trecho acima." },
  { pattern: /\bcomo vimos\b/i, message: "\"como vimos\"." },
  { pattern: /\bna aula\b/i, message: "\"na aula\"." },
  { pattern: /\bno material\b/i, message: "\"no material\"." },
  { pattern: /\bno pdf\b/i, message: "\"no PDF\"." },
  { pattern: /\b(prompt|pipeline|schema|json|recurso|container|validador)\b/i, message: "linguagem de bastidor." }
]);

function gapTooLong(value) {
  for (const match of text(value).matchAll(/\[\[([\s\S]*?)\]\]/g)) {
    const answer = text(match[1].split("::")[0]);
    if (answer.length > 40 || answer.split(/\s+/).filter(Boolean).length > 5) {
      return true;
    }
  }
  return false;
}

function cardMainText(card) {
  return text(card?.text || card?.question || card?.prompt || card?.code || "");
}

export function validateGeneratedCardsDidactic(cards = [], generationContract = {}) {
  const didacticErrors = [];
  const planByPosition = new Map((generationContract?.didacticPlan?.cardPlan || []).map((item) => [item.position, item]));

  cards.forEach((card, index) => {
    const prefix = `cards[${index}]`;
    collectStrings(card, prefix).forEach(({ path, value }) => {
      DIDACTIC_PATTERNS.forEach(({ pattern, message }) => {
        if (pattern.test(value)) {
          didacticErrors.push(`${path} ${message}`);
        }
      });
      if (gapTooLong(value)) {
        didacticErrors.push(`${path} lacuna longa.`);
      }
    });

    if (["block_gap_fill", "multiple_choice", "code_editor"].includes(card?.resourceType) && !cardMainText(card)) {
      didacticErrors.push(`${prefix} prática sem contexto local.`);
    }
    if (card?.resourceType === "multiple_choice") {
      const correct = (card.options || []).find((option) => option?.optionId === card.correctOptionId);
      if (correct && text(card.question).toLowerCase().includes(text(correct.label).toLowerCase())) {
        didacticErrors.push(`${prefix} resposta revelada no mesmo card.`);
      }
    }
    const planned = planByPosition.get(card.position);
    if (
      planned &&
      ["guided_gap", "check_understanding", "check_and_consolidate"].includes(planned.role) &&
      card.position === 1
    ) {
      didacticErrors.push(`${prefix} prática antes de microteoria.`);
    }
  });

  const depth = validateDidacticDepth({
    microsequence: generationContract?.context?.microsequence || {},
    cards,
    existingMicrosequences: generationContract?.context?.lesson?.microsequenceLine || [],
    weakModelMode: generationContract?.weakModelMode?.modeId === "weakModelMode"
  });
  depth.shallowErrors.forEach((item) => didacticErrors.push(`${item.target} ${item.message}`));
  depth.missingDepth.forEach((item) => didacticErrors.push(`${item.target} ${item.message}`));
  depth.redundancyWarnings.forEach((item) => didacticErrors.push(`${item.target} ${item.message}`));

  return {
    ok: didacticErrors.length === 0,
    didacticErrors,
    didacticAudit: depth
  };
}
