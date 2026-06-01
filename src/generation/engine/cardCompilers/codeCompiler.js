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
    code: String(slots[4] || "")
  };
  if (templateId === "code_theory") {
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
    options: [
      { id: "a", text: text(slots[6]) },
      { id: "b", text: text(slots[7]) },
      { id: "c", text: text(slots[8]) }
    ],
    answer: text(slots[9]).toLowerCase(),
    after: text(slots[10])
  };
}
