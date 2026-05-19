import test from "node:test";
import assert from "node:assert/strict";

import {
  buildCourseModelPromptLines,
  buildResourcePreferencesFromCourseModel,
  createDefaultCourseModel,
  inferCourseModelFromDescription
} from "../src/generation/runtime/courseModelSemantics.js";
import { resolveWeakModelRepresentationPolicy } from "../src/generation/didactics/resourceRepresentationPolicy.js";

test("inferCourseModelFromDescription extrai semântica geral sem hardcode de domínio", () => {
  const model = inferCourseModelFromDescription(
    "Curso com fluxograma, portugol e linguagem C, com tradução entre representações e prática guiada antes da autônoma."
  );

  assert.equal(model.learningTrail, "procedure");
  assert.equal(model.microsequenceProgression, "demo_guided_autonomy");
  assert.equal(model.primaryRepresentation, "flowchart");
  assert.equal(model.secondaryRepresentation, "code");
  assert.equal(model.primaryOperation, "apply");
  assert.equal(model.preferredPracticeMode, "guided_first");
});

test("buildCourseModelPromptLines resume a modelagem em linguagem de produto", () => {
  const lines = buildCourseModelPromptLines(
    createDefaultCourseModel({
      description: "Leitura técnica com árvores e comparação de hipóteses.",
      learningTrail: "technical_reading",
      microsequenceProgression: "text_figure_comparison_synthesis"
    })
  );

  assert.match(lines.join("\n"), /Leitura técnica/);
  assert.match(lines.join("\n"), /Progressão de microssequências/);
  assert.match(lines.join("\n"), /Texto\/figura -> comparação -> síntese/);
});

test("buildResourcePreferencesFromCourseModel prioriza matrix sem confundir com table", () => {
  const preferences = buildResourcePreferencesFromCourseModel({
    learningTrail: "formalization"
  });

  assert.ok(preferences.preferredResourceTypes.includes("matrix"));
  assert.ok(preferences.preferredResourceTypes.includes("plane"));
});

test("resolveWeakModelRepresentationPolicy libera matrix quando a modelagem do curso realmente pede isso", () => {
  const policy = resolveWeakModelRepresentationPolicy({
    lessonGuidance: {
      contentTypeTags: ["concept"],
      learningActionTags: ["solve"],
      resourceTags: []
    },
    resolvedTypeId: "comparison",
    courseSemantics: {
      primaryRepresentation: "matrix",
      primaryOperation: "compare",
      preferredPracticeMode: "comparison"
    },
    resourcePreferences: {
      preferredResourceTypes: ["matrix"],
      discouragedResourceTypes: ["table"]
    }
  });

  assert.ok(policy.safeAllowedResourceTypes.includes("matrix"));
  assert.ok(policy.preferredResourceTypes.includes("matrix"));
});
