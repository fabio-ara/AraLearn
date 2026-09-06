import assert from "node:assert/strict";
import test from "node:test";
import { observeCoursePracticeDistribution } from "../../src/domain/coursePracticeDistribution.js";

const rows = (modes) => modes.map((mode, index) => ({
  studyUnitRef: `unit-${index}`, position: index + 1, mode
}));

test("distribuição observa funções declaradas, mistas e ausência sem certificação semântica", () => {
  const result = observeCoursePracticeDistribution(rows([
    "practice", "expository", "expository", "practice", "mixed", "practice", null
  ]));
  assert.deepEqual(result, {
    studyUnitCount: 7, expositoryOnlyCount: 2, practiceOnlyCount: 3,
    mixedCount: 1, undeclaredCount: 1, expositionPositions: [2, 3, 5],
    practicePositions: [1, 4, 5, 6], expositoryRunLengths: [2], longestExpositoryRun: 2,
    practiceBeforeExpositionCount: 1, practiceBetweenExpositionsCount: 1,
    practiceAfterExpositionCount: 1
  });
  assert.equal(Object.hasOwn(result, "compliant"), false);
});

test("contagens são invariantes sob renomeação, ordem de transporte e fronteiras vazias", () => {
  for (const modes of [[], [null], ["mixed"], ["practice"],
    ["expository", "expository"], ["expository", null, "expository"]]) {
    const original = rows(modes);
    const equivalent = original.map((row, index) => ({
      ...row, studyUnitRef: `renamed-${100 - index}`
    })).reverse();
    assert.deepEqual(observeCoursePracticeDistribution(original),
      observeCoursePracticeDistribution(equivalent));
    assert.deepEqual(original, rows(modes));
  }
  assert.equal(observeCoursePracticeDistribution(rows(["mixed"])).longestExpositoryRun, 0);
  assert.deepEqual(observeCoursePracticeDistribution(rows([
    "expository", null, "expository"
  ])).expositoryRunLengths, [1, 1]);
});

test("declarações desconhecidas, identidades e posições repetidas falham fechadas", () => {
  for (const value of [null, [{ studyUnitRef: "a", position: 1 }],
    rows(["theory"]), [...rows(["practice"]), ...rows(["expository"])],
    [{ studyUnitRef: "a", position: 1, mode: null, arbitrary: true }]]) {
    assert.throws(() => observeCoursePracticeDistribution(value), TypeError);
  }
});
