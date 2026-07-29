import { parseCsvPair } from "../slotParser.js";
import { compileSingleChoiceFields } from "./choiceOptionCompiler.js";

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
      ...compileSingleChoiceFields({ slots, optionStartIndex: 6, answerIndex: 9 }),
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
    ...compileSingleChoiceFields({ slots, optionStartIndex: 5, answerIndex: 8 }),
    after: text(slots[9])
  };
}
