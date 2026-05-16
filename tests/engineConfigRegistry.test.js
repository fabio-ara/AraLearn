import test from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_ENGINE_PROFILE_ID,
  getContractPack,
  getDidacticPolicyConfig,
  getEngineProfileSeed,
  getPromptPack,
  listEngineProfileSeeds,
  listPromptPackGuardrails,
  resolveEngineProfile
} from "../src/generation/config/engineConfigRegistry.js";
import { buildDidacticProductionPolicy } from "../src/generation/policies/didacticProductionPolicy.js";

test("engine registry expõe perfil default de ADS e packs básicos", () => {
  const profile = resolveEngineProfile();
  const didacticPolicy = getDidacticPolicyConfig();
  const courseForgePromptPack = getPromptPack("courseForge");
  const lessonPlanningContractPack = getContractPack("lessonPlanning");

  assert.equal(profile.profileId, DEFAULT_ENGINE_PROFILE_ID);
  assert.match(profile.label, /ADS geral/);
  assert.ok(profile.intendedDomains.includes("álgebra linear"));
  assert.equal(didacticPolicy.productionArchitecture, "planner_builder_auditor_internalizado");
  assert.ok(courseForgePromptPack.guardrails.length > 0);
  assert.equal(lessonPlanningContractPack.maxGeneratedMicrosequences, 7);
});

test("engine registry lista seeds especializados e generalizados", () => {
  const seeds = listEngineProfileSeeds();
  const ids = seeds.map((item) => item.profileId);

  assert.ok(ids.includes(DEFAULT_ENGINE_PROFILE_ID));
  assert.ok(ids.includes("aralearn.engine.ads.programming.v1"));
  assert.ok(ids.includes("aralearn.engine.languages.v1"));
  assert.ok(ids.includes("aralearn.engine.research-reading.v1"));
});

test("engine registry resolve perfil nomeado sem perder o seed base", () => {
  const programmingProfile = resolveEngineProfile("aralearn.engine.ads.programming.v1");
  const mathProfile = getEngineProfileSeed("aralearn.engine.ads.math.v1");

  assert.match(programmingProfile.label, /programação procedural/);
  assert.equal(programmingProfile.didacticPolicy.defaultMinimumReappearances.operational, 5);
  assert.match(mathProfile.label, /matemática formal/);
  assert.equal(mathProfile.didacticPolicy.defaultMinimumReappearances.conceptual, 4);
});

test("engine registry aceita override sem mutar o seed", () => {
  const overridden = resolveEngineProfile("aralearn.engine.ads.programming.v1", {
    didacticPolicy: {
      targetStudentProfile: "pesquisador com perfil avançado",
      defaultMinimumReappearances: {
        conceptual: 5
      }
    },
    promptPacks: {
      courseForge: {
        guardrails: ["regra customizada"]
      }
    }
  });
  const defaultAgain = resolveEngineProfile("aralearn.engine.ads.programming.v1");
  const productionPolicy = buildDidacticProductionPolicy({
    lessonGuidance: {},
    lessonSourceGuideStructured: {},
    lessonDomainMap: {},
    engineProfile: overridden
  });

  assert.equal(overridden.didacticPolicy.targetStudentProfile, "pesquisador com perfil avançado");
  assert.notEqual(defaultAgain.didacticPolicy.targetStudentProfile, "pesquisador com perfil avançado");
  assert.equal(productionPolicy.targetStudentProfile, "pesquisador com perfil avançado");
  assert.equal(productionPolicy.exhaustiveCardSequence.minimumReappearancesPerCoreItem, 5);
  assert.deepEqual(listPromptPackGuardrails("courseForge", overridden), ["regra customizada"]);
});
