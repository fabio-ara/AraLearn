import { parsePipeList } from "../slotParser.js";
import { compileChoiceOptionsFromSlots } from "./choiceOptionCompiler.js";

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

export function compileTreeCard({ slots = {}, position = 0 }) {
  const labels = parsePipeList(slots[3]);
  const nodes = labels.map((label, index) => ({
    id: `node-${index + 1}`,
    label,
    parentId: index === 0 ? null : `node-${index}`,
    type: index === labels.length - 1 ? "file" : "folder"
  }));
  return {
    position,
    resource: "tree",
    kind: "exercise",
    exercise: "choice",
    title: text(slots[1]),
    prompt: text(slots[2]),
    nodes,
    question: text(slots[4]),
    options: compileChoiceOptionsFromSlots(slots, 5),
    answer: text(slots[8]).toLowerCase(),
    after: text(slots[9])
  };
}
