import { compileChoiceOptionsFromSlots } from "./choiceOptionCompiler.js";

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

export function compileChoiceCard({ slots = {}, position = 0 }) {
  return {
    position,
    resource: "choice",
    kind: "exercise",
    exercise: "choice",
    title: text(slots[1]),
    question: text(slots[2]),
    options: compileChoiceOptionsFromSlots(slots, 3),
    answer: text(slots[6]).toLowerCase(),
    after: text(slots[7])
  };
}
