function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

export function evaluateTheoryDensity(card = {}) {
  const textLength = text(card?.text || card?.prompt || "").split(/\s+/).filter(Boolean).length;
  const isDense = text(card?.kind) === "theory" && textLength > 45;
  return {
    dense: isDense,
    score: textLength
  };
}

export function evaluateChoiceOveruse(cards = []) {
  const list = Array.isArray(cards) ? cards : [];
  const choiceCount = list.filter((card) => text(card?.exercise) === "choice").length;
  const nonChoiceExerciseCount = list.filter((card) => text(card?.kind) === "exercise" && text(card?.exercise) !== "choice").length;
  return {
    choiceCount,
    nonChoiceExerciseCount,
    excessive: choiceCount >= 3 && nonChoiceExerciseCount === 0
  };
}

export function suggestTheorySplit(cards = []) {
  const denseCards = (Array.isArray(cards) ? cards : [])
    .filter((card) => evaluateTheoryDensity(card).dense)
    .map((card) => Number(card.position));
  return denseCards;
}

export function validatePracticeDistribution(cards = []) {
  const practiceCount = (Array.isArray(cards) ? cards : []).filter((card) => text(card?.kind) === "exercise").length;
  return {
    ok: practiceCount >= 1,
    practiceCount
  };
}

export function validateExerciseClosedness(cards = []) {
  const invalid = (Array.isArray(cards) ? cards : [])
    .filter((card) => text(card?.kind) === "exercise")
    .filter((card) => {
      if (text(card?.resource) === "paragraph") {
        return !/\[\[[\s\S]*?\]\]/u.test(text(card?.text));
      }
      return text(card?.exercise) !== "choice";
    });
  return {
    ok: invalid.length === 0,
    invalidPositions: invalid.map((card) => Number(card.position))
  };
}
