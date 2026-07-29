import test from "node:test";
import assert from "node:assert/strict";

import {
  evaluateChoiceOveruse,
  evaluateTheoryDensity,
  validateExerciseClosedness,
  validatePracticeDistribution
} from "../../src/generation/engine/progressionGuard.js";

test("progressionGuard detecta teoria densa e excesso de choice", () => {
  const dense = evaluateTheoryDensity({
    kind: "theory",
    text: "um ".repeat(60)
  });
  assert.equal(dense.dense, true);
  const cards = [
    { kind: "theory", exercise: "none" },
    { kind: "exercise", exercise: "choice" },
    { kind: "exercise", exercise: "choice" },
    { kind: "exercise", exercise: "choice" }
  ];
  const choiceStats = evaluateChoiceOveruse(cards);
  assert.equal(choiceStats.excessive, true);
  assert.equal(validatePracticeDistribution(cards).ok, true);
  assert.equal(validateExerciseClosedness([{ kind: "exercise", resource: "paragraph", text: "sem lacuna" }]).ok, false);
});
