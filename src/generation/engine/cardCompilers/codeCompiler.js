import { compileChoiceOptionsFromSlots } from "./choiceOptionCompiler.js";

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

export function compileCodeCard({ slots = {}, templateId = "", position = 0 }) {
  const base = {
    position,
    resource: "code",
    title: text(slots[1]),
    prompt: text(slots[2]),
    language: text(slots[3]),
    code: typeof slots[4] === "string" ? String(slots[4]).replace(/\r\n/g, "\n") : ""
  };
  if (templateId === "code_theory") {
    return {
      ...base,
      kind: "theory",
      exercise: "none",
      after: text(slots[5])
    };
  }
  if (templateId === "code_gap") {
    return {
      ...base,
      kind: "exercise",
      exercise: "gap",
      after: text(slots[5])
    };
  }
  return {
    ...base,
    kind: "exercise",
    exercise: "choice",
    question: text(slots[5]),
    options: compileChoiceOptionsFromSlots(slots, 6),
    answer: text(slots[9]).toLowerCase(),
    after: text(slots[10])
  };
}
