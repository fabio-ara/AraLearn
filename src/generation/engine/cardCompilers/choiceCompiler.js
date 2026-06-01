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
    options: [
      { id: "a", text: text(slots[3]) },
      { id: "b", text: text(slots[4]) },
      { id: "c", text: text(slots[5]) }
    ],
    answer: text(slots[6]).toLowerCase(),
    after: text(slots[7])
  };
}
