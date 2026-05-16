import test from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_ENGINE_PROFILE_ID,
  getContractPack,
  getDidacticPolicyConfig,
  getPromptPack,
  listPromptPackGuardrails,
  resolveEngineProfile
} from "../src/generation/config/engineConfigRegistry.js";
import { buildDidacticProductionPolicy } from "../src/generation/policies/didacticProductionPolicy.js";

test("engine registry expõe profile default e packs básicos", () => {
  const profile = resolveEngineProfile();
  const didacticPolicy = getDidacticPolicyConfig();
  const courseForgePromptPack = getPromptPack("courseForge");
  const lessonPlanningContractPack = getContractPack("lessonPlanning");

  assert.equal(profile.profileId, DEFAULT_ENGINE_PROFILE_ID);
  assert.match(profile.productPurpose, /trilha estudável/i);
  assert.equal(didacticPolicy.productionArchitecture, "planner_builder_auditor_internalizado");
  assert.ok(courseForgePromptPack.guardrails.length > 0);
  assert.equal(lessonPlanningContractPack.maxGeneratedMicrosequences, 7);
});

test("engine registry aceita override sem mutar o default", () => {
  const overridden = resolveEngineProfile({
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
  const defaultAgain = resolveEngineProfile();
  const productionPolicy = buildDidacticProductionPolicy({
    lessonGuidance: {},
    lessonSourceGuideStructured: {},
    lessonDomainMap: {},
    engineProfile: overridden
  });

  assert.equal(overridden.didacticPolicy.targetStudentProfile, "pesquisador com perfil avançado");
  assert.equal(defaultAgain.didacticPolicy.targetStudentProfile, "estudante-trabalhador com pouco tempo, pouca margem para erro e possível fragilidade de base");
  assert.equal(productionPolicy.targetStudentProfile, "pesquisador com perfil avançado");
  assert.equal(productionPolicy.exhaustiveCardSequence.minimumReappearancesPerCoreItem, 5);
  assert.deepEqual(listPromptPackGuardrails("courseForge", overridden), ["regra customizada"]);
});
