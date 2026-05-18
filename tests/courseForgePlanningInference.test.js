import test from "node:test";
import assert from "node:assert/strict";

import {
  inferCourseForgePlanningProfileTuning,
  normalizeInferredPlanningProfileTuning
} from "../src/generation/runtime/courseForgePlanningInference.js";

test("normalizeInferredPlanningProfileTuning preenche todos os parâmetros modificáveis do planejamento", () => {
  const patch = normalizeInferredPlanningProfileTuning({
    didacticProfileId: "aralearn.engine.ads.general.v3",
    currentProfileTuning: {
      targetStudentProfile: "fallback",
      conceptualReappearances: 3,
      operationalReappearances: 4,
      minMicrosequences: 3,
      targetMicrosequences: 5,
      maxMicrosequences: 8,
      requireCoreCoverageBeforeExtensions: true,
      requireVocabularyMap: true,
      courseModel: {
        description: "",
        learningTrail: "problem_solving",
        microsequenceProgression: "worked_example_analogous_variation"
      }
    },
    inferred: {
      targetStudentProfile: "estudante com pouca base formal",
      courseModelDescription: "curso formal com notação e abstração",
      learningTrail: "formalization",
      microsequenceProgression: "concrete_visual_formal",
      minMicrosequences: 4,
      targetMicrosequences: 6,
      maxMicrosequences: 9,
      requireCoreCoverageBeforeExtensions: true,
      requireVocabularyMap: false
    }
  });

  assert.equal(patch.targetStudentProfile, "estudante com pouca base formal");
  assert.equal(patch.courseModelEdited, true);
  assert.equal(patch.courseModel.learningTrail, "formalization");
  assert.equal(patch.courseModel.microsequenceProgression, "concrete_visual_formal");
  assert.equal(patch.conceptualReappearances, undefined);
  assert.equal(patch.operationalReappearances, undefined);
  assert.equal(patch.minMicrosequences, 4);
  assert.equal(patch.targetMicrosequences, 6);
  assert.equal(patch.maxMicrosequences, 9);
  assert.equal(patch.requireCoreCoverageBeforeExtensions, true);
  assert.equal(patch.requireVocabularyMap, false);
});

test("inferCourseForgePlanningProfileTuning usa provider para completar o tuning do planejamento", async () => {
  const calls = [];
  const result = await inferCourseForgePlanningProfileTuning({
    assistConfig: {
      model: "gemini-2.5-flash",
      apiKey: "segredo",
      didacticProfileId: "aralearn.engine.ads.general.v3",
      profileTuning: {
        targetStudentProfile: "fallback",
        conceptualReappearances: 3,
        operationalReappearances: 4,
        minMicrosequences: 3,
        targetMicrosequences: 5,
        maxMicrosequences: 8,
        requireCoreCoverageBeforeExtensions: true,
        requireVocabularyMap: true,
        courseModel: {
          description: "",
          learningTrail: "problem_solving",
          microsequenceProgression: "worked_example_analogous_variation"
        }
      }
    },
    requestText: "curso de matemática discreta com formalização progressiva",
    attachments: [{ name: "base.md" }],
    ingestAttachments: async (attachments) => ({
      attachments: attachments.map((item) => ({
        ...item,
        textContent: "material com notação, prova e exemplos graduais"
      })),
      warnings: [],
      extractedCount: 1
    }),
    provider: {
      async callJson(input = {}) {
        calls.push(input);
        return {
          value: {
            targetStudentProfile: "estudante de ADS com dificuldade de abstração formal",
            courseModelDescription: "trilha de formalização gradual",
            learningTrail: "formalization",
            microsequenceProgression: "concrete_visual_formal",
            minMicrosequences: 4,
            targetMicrosequences: 6,
            maxMicrosequences: 9,
            requireCoreCoverageBeforeExtensions: true,
            requireVocabularyMap: true
          }
        };
      }
    }
  });

  assert.equal(calls.length, 1);
  assert.match(calls[0].prompt, /complete todos os parâmetros modificáveis/i);
  assert.match(calls[0].prompt, /material com notação, prova e exemplos graduais/i);
  assert.equal(result.profileTuningPatch.courseModel.learningTrail, "formalization");
  assert.equal(result.profileTuningPatch.minMicrosequences, 4);
  assert.equal(result.profileTuningPatch.requireVocabularyMap, true);
});
