function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

export const CARD_EXERCISE_VALUES = Object.freeze(["none", "gap", "choice"]);

export const GAP_EXERCISE_RESOURCES = Object.freeze([
  "paragraph",
  "code",
  "table",
  "flow",
  "tree",
  "graph",
  "relation_map",
  "matrix",
  "plane",
  "formula",
  "composite"
]);

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
  "formula",
  "composite"
]);

export function supportsGapExercise(resource = "") {
  return GAP_EXERCISE_RESOURCES.includes(text(resource));
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
  const mode = text(exercise);
  return (mode === "gap" && supportsGapExercise(resource))
    || (mode === "choice" && supportsChoiceExercise(resource));
}

export function resolveExerciseModeForResource(resource = "") {
  const normalizedResource = text(resource);
  if (normalizedResource === "choice") {
    return "choice";
  }
  if (supportsGapExercise(normalizedResource)) {
    return "gap";
  }
  if (supportsChoiceExercise(normalizedResource)) {
    return "choice";
  }
  return "none";
}
