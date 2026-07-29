import { parsePipeList } from "../slotParser.js";
import { compileSingleChoiceFields } from "./choiceOptionCompiler.js";

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

export function compileTreeCard({ slots = {}, position = 0 }) {
  const labels = parsePipeList(slots[3]);
  const nodes = labels.map((label, index) => ({
    id: `node-${index + 1}`,
    label,
    parentId: index === 0 ? null : `node-${index}`
  }));
  return {
    variant: "hierarchy",
    position,
    resource: "tree",
    kind: "exercise",
    exercise: "choice",
    title: text(slots[1]),
    prompt: text(slots[2]),
    nodes,
    question: text(slots[4]),
    ...compileSingleChoiceFields({ slots, optionStartIndex: 5, answerIndex: 8 }),
    after: text(slots[9])
  };
}
