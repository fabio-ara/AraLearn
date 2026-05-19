import test from "node:test";
import assert from "node:assert/strict";

import { runDefaultCourseForgeHarness } from "../src/generation/testing/courseForgeHarness.js";

test("courseForge harness cobre cenários grandes de estrutura, tutor e cards sem regressão", async () => {
  const summary = await runDefaultCourseForgeHarness();

  assert.equal(summary.failed.length, 0, summary.failed.map((item) => `${item.id}: ${item.issues.join("; ")}`).join("\n"));
  assert.equal(summary.scenarioCount, 5);
});
