import test from "node:test";
import assert from "node:assert/strict";

import {
  buildDependencyPacket,
  validateCardPrerequisites,
  validateMicrosequenceDependencies,
  validateNextMicrosequenceUnlocked
} from "../../src/generation/engine/dependencyGuard.js";

test("dependencyGuard bloqueia conceito futuro", () => {
  const lesson = {
    microsequences: [
      { id: "m1", title: "Base", status: "generated" },
      { id: "m2", title: "Atual", status: "planned", dependsOn: ["m1"] },
      { id: "m3", title: "Determinante", status: "planned" }
    ]
  };
  assert.equal(validateMicrosequenceDependencies(lesson.microsequences[1], lesson).ok, true);
  const packet = buildDependencyPacket({
    lesson,
    microsequence: lesson.microsequences[1]
  });
  const result = validateCardPrerequisites([{ text: "Agora veja determinante." }], packet);
  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /Conceito futuro/);
  assert.equal(validateNextMicrosequenceUnlocked(lesson, lesson.microsequences[2]).ok, true);
});
