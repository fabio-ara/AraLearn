import { compileChoiceOptionsFromSlots } from "./choiceOptionCompiler.js";

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function parseExpression(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return structuredClone(value);
  }
  try {
    const parsed = JSON.parse(text(value));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
    return parsed;
  } catch {
    throw new Error("expressionJson precisa conter uma AST de fórmula em JSON válido.");
  }
}

export function compileFormulaCard({ slots = {}, templateId = "", position = 0 }) {
  const base = {
    position,
    resource: "formula",
    kind: templateId === "formula_choice" ? "exercise" : "theory",
    exercise: templateId === "formula_choice" ? "choice" : "none",
    title: text(slots[1]),
    prompt: text(slots[2]),
    notation: text(slots[3]).toLowerCase(),
    accessibleText: text(slots[4]),
    expression: parseExpression(slots[5])
  };
  if (templateId === "formula_choice") {
    return {
      ...base,
      question: text(slots[6]),
      options: compileChoiceOptionsFromSlots(slots, 7),
      answer: text(slots[10]).toLowerCase(),
      after: text(slots[11])
    };
  }
  return { ...base, after: text(slots[6]) };
}
