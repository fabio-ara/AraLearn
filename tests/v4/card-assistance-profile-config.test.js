import test from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_ENGINE_PROFILE_ID,
  ENGINE_PROFILE_SEEDS
} from "../../src/generation/config/engineProfileSeeds.js";

test("perfis didáticos guardam somente o contexto consumido pela assistência de card", () => {
  assert.ok(ENGINE_PROFILE_SEEDS[DEFAULT_ENGINE_PROFILE_ID]);
  assert.equal(Object.keys(ENGINE_PROFILE_SEEDS).length, 8);

  const forbiddenFields = [
    "productionArchitecture",
    "microsequencePrinciple",
    "exhaustiveSequenceSteps",
    "hardRules",
    "sourceAnchoringRules",
    "operationalExhaustivenessRules",
    "defaultMinimumReappearances",
    "topDownCourseStrategy",
    "promptPacks",
    "contractPacks",
    "providerRouting",
    "productPurpose",
    "userExperience"
  ];

  for (const profile of Object.values(ENGINE_PROFILE_SEEDS)) {
    assert.deepEqual(
      Object.keys(profile).sort(),
      ["didacticPolicy", "family", "intendedDomains", "label", "profileId"].sort()
    );
    assert.deepEqual(
      Object.keys(profile.didacticPolicy).sort(),
      ["courseSemantics", "targetStudentProfile"].sort()
    );
    for (const field of forbiddenFields) {
      assert.equal(field in profile, false, `${profile.profileId}.${field}`);
      assert.equal(field in profile.didacticPolicy, false, `${profile.profileId}.didacticPolicy.${field}`);
    }
  }
});
