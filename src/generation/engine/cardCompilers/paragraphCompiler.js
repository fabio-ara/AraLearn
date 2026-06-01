function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

export function compileParagraphCard({ slots = {}, templateId = "", position = 0 }) {
  if (templateId === "paragraph_gap") {
    const answer = text(slots[3]);
    const distractors = [text(slots[4]), text(slots[5])].filter(Boolean);
    return {
      position,
      resource: "paragraph",
      kind: "exercise",
      exercise: "gap",
      title: text(slots[1]),
      text: `${text(slots[2])} [[${answer}::${answer}|${distractors.join("|")}]].`,
      after: text(slots[6])
    };
  }
  return {
    position,
    resource: "paragraph",
    kind: "theory",
    exercise: "none",
    title: text(slots[1]),
    text: text(slots[2]),
    after: text(slots[3])
  };
}
