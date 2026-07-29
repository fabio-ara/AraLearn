import test from "node:test";
import assert from "node:assert/strict";

import {
  createGenerationProgressState,
  reduceGenerationProgress,
  listGenerationProgressPhases
} from "../../src/generation/runtime/progressViewModel.js";

test("o progresso infere índice e total a partir da lista de fases", () => {
  const phaseIds = ["normalize_intent", "plan_architecture", "final_report"];
  const progress = reduceGenerationProgress(createGenerationProgressState({ visible: true }), {
    type: "phase_started",
    phaseId: "plan_architecture",
    phaseIds
  });

  assert.equal(progress.phaseIndex, 2);
  assert.equal(progress.phaseCount, 3);
  assert.deepEqual(progress.phaseIds, phaseIds);
});

test("a lista de fases usa as fases fornecidas em vez do catálogo completo", () => {
  const phases = listGenerationProgressPhases(0, ["normalize_intent", "compile_patch"]);

  assert.deepEqual(
    phases.map((item) => item.phaseId),
    ["normalize_intent", "compile_patch"]
  );
});

