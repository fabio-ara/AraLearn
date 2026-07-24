function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

export const CARD_EXERCISE_VALUES = Object.freeze(["none", "gap", "choice"]);

export const CONTEXTUAL_CHOICE_RESOURCES = Object.freeze([
  "choice",
  "code",
  "table",
  "flow",
  "tree",
  "graph",
  "relation_map",
  "matrix",
  "plane",
  "formula"
]);

export function supportsGapExercise(resource = "") {
  return ["paragraph", "code"].includes(text(resource));
}

export function supportsChoiceExercise(resource = "") {
  return CONTEXTUAL_CHOICE_RESOURCES.includes(text(resource));
}

export function isTheoryCardShape({ resource = "", kind = "", exercise = "" } = {}) {
  if (text(kind) !== "theory") {
    return false;
  }
  if (text(exercise) !== "none") {
    return false;
  }
  return text(resource) !== "choice";
}

export function isExerciseCardShape({ resource = "", kind = "", exercise = "" } = {}) {
  if (text(kind) !== "exercise") {
    return false;
  }
  if (text(resource) === "code") {
    return ["gap", "choice"].includes(text(exercise));
  }
  if (supportsGapExercise(resource)) {
    return text(exercise) === "gap";
  }
  return supportsChoiceExercise(resource) && text(exercise) === "choice";
}

export function resolveExerciseModeForResource(resource = "") {
  const normalizedResource = text(resource);
  if (["paragraph", "code"].includes(normalizedResource)) {
    return "gap";
  }
  if (supportsChoiceExercise(normalizedResource)) {
    return "choice";
  }
  return "none";
}
