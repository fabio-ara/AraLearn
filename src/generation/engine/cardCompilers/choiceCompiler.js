import { compileSingleChoiceFields } from "./choiceOptionCompiler.js";

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
    ...compileSingleChoiceFields({ slots, optionStartIndex: 3, answerIndex: 6 }),
    after: text(slots[7])
  };
}
