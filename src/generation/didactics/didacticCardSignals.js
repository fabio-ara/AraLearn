import { comparable, text } from "./didacticText.js";

export function readCardBody(card) {
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

export function hasExampleSignal(card) {
  const body = comparable(readCardBody(card));
  if (/por exemplo|exemplo|caso|considere|observe|suponha|\bse\b|\d/.test(body)) {
    return true;
  }
  if (card?.resourceType === "code_editor" && text(card?.code) && text(card?.prompt)) {
    return true;
  }
  if (card?.resourceType === "table" || card?.resourceType === "matrix" || card?.resourceType === "tree" || card?.resourceType === "graph") {
    return true;
  }
  return false;
}

export function hasPracticeIntent(card) {
  return (
    ["multiple_choice", "block_gap_fill"].includes(text(card?.resourceType)) ||
    typeof card?.ask === "string" ||
    Array.isArray(card?.wrong) ||
    /\[\[[\s\S]*?\]\]/.test(text(card?.say))
  );
}

export function hasDemonstrationIntent(card) {
  if (card?.resourceType === "code_editor" && text(card?.code) && text(card?.prompt)) {
    return true;
  }
  return hasExampleSignal(card) && !hasPracticeIntent(card);
}

export function hasFeedback(card) {
  return Boolean(text(card?.after) || text(card?.feedback) || text(card?.feedbackAfter));
}

export function requiresInlineFeedback(card) {
  return ["multiple_choice", "block_gap_fill"].includes(text(card?.resourceType));
}

export function isDemonstrationCard(card) {
  return Boolean(hasDemonstrationIntent(card));
}

export function hasNotation(value) {
  return /[¬∧∨→↔√]|`[^`]+`|\|\|/.test(text(value));
}

export function isGenericCard(card) {
  const body = comparable(readCardBody(card));
  if (!body) {
    return false;
  }
  return /ideia central|conceito importante|tema estudado|assunto pedido|topico pedido/.test(body);
}
