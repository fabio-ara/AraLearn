import { parseCsvPair } from "../slotParser.js";

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
      options: [
        { id: "a", text: text(slots[6]) },
        { id: "b", text: text(slots[7]) },
        { id: "c", text: text(slots[8]) }
      ],
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
    options: [
      { id: "a", text: text(slots[5]) },
      { id: "b", text: text(slots[6]) },
      { id: "c", text: text(slots[7]) }
    ],
    answer: text(slots[8]).toLowerCase(),
    after: text(slots[9])
  };
}
