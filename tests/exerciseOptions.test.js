import test from "node:test";
import assert from "node:assert/strict";

import { shuffleExerciseOptions } from "../src/core/exerciseOptions.js";

test("embaralha opções de forma determinística sem preservar a ordem original quando há mais de um item", () => {
  const source = ["A", "B", "C", "D"];
  const shuffledA = shuffleExerciseOptions(source, "seed-1");
  const shuffledB = shuffleExerciseOptions(source, "seed-1");

  assert.deepEqual(shuffledA, shuffledB);
  assert.notDeepEqual(shuffledA, source);
});

test("mantém listas unitárias intactas", () => {
  assert.deepEqual(shuffleExerciseOptions(["A"], "seed-1"), ["A"]);
});
