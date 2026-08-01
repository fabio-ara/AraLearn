export const PEDAGOGICAL_COMMENT_MAX_CHARACTERS = 1000;

export const PEDAGOGICAL_COMMENT_CATEGORIES = Object.freeze([
  Object.freeze({ value: "question", label: "Dúvida" }),
  Object.freeze({ value: "possible_error", label: "Possível erro" }),
  Object.freeze({ value: "confusing", label: "Confuso" }),
  Object.freeze({ value: "suggestion", label: "Sugestão" }),
  Object.freeze({ value: "observation", label: "Observação" })
]);

export const PEDAGOGICAL_COMMENT_STATUSES = Object.freeze([
  Object.freeze({ value: "open", label: "Aberta" }),
  Object.freeze({ value: "considered", label: "Considerada" }),
  Object.freeze({ value: "resolved", label: "Resolvida" }),
  Object.freeze({ value: "incorporated", label: "Incorporada" })
]);

const CATEGORY_VALUES = new Set(
  PEDAGOGICAL_COMMENT_CATEGORIES.map((category) => category.value)
);

export function pedagogicalCommentCategoryLabel(value) {
  return PEDAGOGICAL_COMMENT_CATEGORIES.find((item) => item.value === value)?.label || "Observação";
}

export function pedagogicalCommentStatusLabel(value) {
  return PEDAGOGICAL_COMMENT_STATUSES.find((item) => item.value === value)?.label || "Aberta";
}

export function normalizePedagogicalCommentDraft(value = {}) {
  const category = String(value?.category || "").trim();
  const body = String(value?.body || "").trim();
  if (!CATEGORY_VALUES.has(category)) {
    throw new Error("Escolha um tipo válido de observação.");
  }
  if (!body) {
    throw new Error("Escreva a observação antes de salvar.");
  }
  if (body.length > PEDAGOGICAL_COMMENT_MAX_CHARACTERS) {
    throw new Error(
      `A observação pode ter até ${PEDAGOGICAL_COMMENT_MAX_CHARACTERS} caracteres.`
    );
  }
  return Object.freeze({ category, body });
}
