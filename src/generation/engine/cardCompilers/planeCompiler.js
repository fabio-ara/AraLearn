import { parseCsvPair } from "../slotParser.js";
import { compileChoiceOptionsFromSlots } from "./choiceOptionCompiler.js";

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

export function compilePlaneCard({ slots = {}, templateId = "", position = 0 }) {
  if (templateId === "plane_sum") {
    return {
      position,
      resource: "plane",
      kind: "exercise",
      exercise: "choice",
      title: text(slots[1]),
      prompt: text(slots[2]),
      vectors: [parseCsvPair(slots[3]), parseCsvPair(slots[4])].filter(Boolean),
      question: text(slots[5]),
      options: compileChoiceOptionsFromSlots(slots, 6),
      answer: text(slots[9]).toLowerCase(),
      after: text(slots[10])
    };
  }
  return {
    position,
    resource: "plane",
    kind: "exercise",
    exercise: "choice",
    title: text(slots[1]),
    prompt: text(slots[2]),
    vector: parseCsvPair(slots[3]),
    question: text(slots[4]),
    options: compileChoiceOptionsFromSlots(slots, 5),
    answer: text(slots[8]).toLowerCase(),
    after: text(slots[9])
  };
}
