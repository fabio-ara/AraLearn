import { parsePipeList } from "../slotParser.js";
import { compileChoiceOptionsFromSlots } from "./choiceOptionCompiler.js";

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

export function compileTableCard({ slots = {}, templateId = "", position = 0 }) {
  const base = {
    position,
    resource: "table",
    title: text(slots[1]),
    columns: parsePipeList(slots[2]),
    rows: [parsePipeList(slots[3]), parsePipeList(slots[4])]
  };
  if (templateId === "table_theory") {
    return {
      ...base,
      kind: "theory",
      exercise: "none",
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
