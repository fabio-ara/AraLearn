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

  assert.equal(model.materialNature, "visual_interpretation");
  assert.equal(model.primaryRepresentation, "flowchart");
  assert.equal(model.secondaryRepresentation, "pseudocode");
  assert.equal(model.primaryOperation, "translate");
  assert.equal(model.preferredPracticeMode, "guided_first");
});

test("buildCourseModelPromptLines resume a modelagem em linguagem de produto", () => {
  const lines = buildCourseModelPromptLines(
    createDefaultCourseModel({
      description: "Leitura técnica com árvores e comparação de hipóteses.",
      materialNature: "technical_reading",
      progressionMode: "reading_to_application",
      primaryRepresentation: "scientific_article",
      secondaryRepresentation: "tree",
      primaryOperation: "interpret",
      primaryDifficulty: "fine_comparison"
    })
  );

  assert.match(lines.join("\n"), /Leitura técnica/);
  assert.match(lines.join("\n"), /Artigo/);
  assert.match(lines.join("\n"), /Árvore/);
  assert.match(lines.join("\n"), /Interpretar evidência/);
});

test("buildResourcePreferencesFromCourseModel prioriza matrix sem confundir com table", () => {
  const preferences = buildResourcePreferencesFromCourseModel({
    primaryRepresentation: "matrix",
    primaryOperation: "trace",
    preferredPracticeMode: "guided_first"
  });

  assert.ok(preferences.preferredResourceTypes.includes("matrix"));
  assert.ok(preferences.discouragedResourceTypes.includes("table"));
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
      primaryOperation: "trace",
      preferredPracticeMode: ""
    },
    resourcePreferences: {
      preferredResourceTypes: ["matrix"],
      discouragedResourceTypes: ["table"]
    }
  });

  assert.ok(policy.safeAllowedResourceTypes.includes("matrix"));
  assert.ok(policy.preferredResourceTypes.includes("matrix"));
});
