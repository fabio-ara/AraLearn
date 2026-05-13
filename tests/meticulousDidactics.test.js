import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { buildLessonDomainCoverageReport } from "../src/generation/domain/lessonDomainModel.js";
import { validateDidacticDepth } from "../src/generation/validation/validateDidacticDepth.js";
import { validateDidacticRedundancy } from "../src/generation/validation/validateDidacticRedundancy.js";
import { buildMicrosequencePlanningContract } from "../src/generation/planning/buildMicrosequencePlanningContract.js";
import { buildMicrosequencePlanningPrompt } from "../src/generation/planning/buildMicrosequencePlanningPrompt.js";
import { getModelCapabilities } from "../src/generation/providers/modelCapabilities.js";

function loadFixture(name) {
  return JSON.parse(fs.readFileSync(new URL(`./fixtures/meticulous/${name}`, import.meta.url), "utf8"));
}

function buildLessonFromFixture(fixture) {
  return {
    key: "lesson-meticulous",
    title: "Lição meticulosa",
    sourceGuideStructured: fixture.sourceGuideStructured,
    domainMap: fixture.domainMap,
    microsequences: fixture.existingMicrosequences
  };
}

test("fixtures de meticulosidade mantêm o shape mínimo esperado", () => {
  const names = [
    "propositional-logic-depth.json",
    "matrix-addition-depth.json",
    "git-flow-depth.json",
    "linux-navigation-depth.json"
  ];

  names.forEach((name) => {
    const fixture = loadFixture(name);
    assert.ok(fixture.sourceGuideStructured.lessonGoal);
    assert.ok(Array.isArray(fixture.domainMap.items) && fixture.domainMap.items.length > 0);
    assert.ok(Array.isArray(fixture.existingMicrosequences));
    assert.ok(fixture.expectedGaps);
    assert.ok(fixture.validNewMicrosequence);
    assert.ok(fixture.redundantMicrosequence);
    assert.ok(fixture.shallowResponse);
    assert.ok(fixture.meticulousResponse);
  });
});

test("detecta resposta rasa e aceita resposta meticulosa", () => {
  const fixture = loadFixture("propositional-logic-depth.json");
  const lesson = buildLessonFromFixture(fixture);

  const shallow = validateDidacticDepth({
    lesson,
    microsequence: fixture.shallowResponse.microsequence,
    cards: fixture.shallowResponse.cards,
    existingMicrosequences: fixture.existingMicrosequences
  });
  const meticulous = validateDidacticDepth({
    microsequence: fixture.meticulousResponse.microsequence,
    cards: fixture.meticulousResponse.cards,
    existingMicrosequences: fixture.existingMicrosequences
  });

  assert.equal(shallow.ok, false);
  assert.ok(shallow.shallowErrors.some((item) => item.type === "definition_without_example"));
  assert.ok(shallow.shallowErrors.some((item) => item.type === "unstable_or_backstage_reference"));
  assert.equal(meticulous.ok, true);
});

test("separa item explicado sem prática de item com prática insuficiente", () => {
  const fixture = loadFixture("matrix-addition-depth.json");
  const report = buildLessonDomainCoverageReport(buildLessonFromFixture(fixture));

  assert.deepEqual(report.domainMap.gapSummary.uncoveredDomainItemIds, fixture.expectedGaps.uncoveredDomainItemIds);
  assert.deepEqual(report.domainMap.gapSummary.explainedWithoutPracticeIds, fixture.expectedGaps.explainedWithoutPracticeIds);
  assert.deepEqual(report.domainMap.gapSummary.practiceWithoutVariationIds, fixture.expectedGaps.practiceWithoutVariationIds);
});

test("rejeita repetição sem função nova e aceita variação justificada", () => {
  const fixture = loadFixture("git-flow-depth.json");
  const redundant = validateDidacticRedundancy({
    microsequence: fixture.redundantMicrosequence,
    existingMicrosequences: fixture.existingMicrosequences
  });
  const valid = validateDidacticRedundancy({
    microsequence: fixture.validNewMicrosequence,
    existingMicrosequences: fixture.existingMicrosequences
  });

  assert.equal(redundant.ok, false);
  assert.equal(redundant.redundancyWarnings[0].type, "duplicate_microsequence_without_new_function");
  assert.equal(valid.ok, true);
});

test("planejamento da microssequência recebe mapa de domínio e regra anti-resumo", () => {
  const fixture = loadFixture("linux-navigation-depth.json");
  const lesson = {
    key: "lesson-linux",
    title: "Navegação básica",
    description: "Diretórios e terminal.",
    sourceGuideStructured: fixture.sourceGuideStructured,
    domainMap: fixture.domainMap,
    microsequences: fixture.existingMicrosequences,
    resourceTags: ["paragraph", "multiple_choice", "tree", "code_editor"],
    contentTypeTags: ["procedure", "tool_use", "error_diagnosis"],
    learningActionTags: ["practice", "use_tool"],
    supportLevel: "guided"
  };
  const contract = buildMicrosequencePlanningContract({
    selectedCourse: { key: "course-linux", title: "Linux" },
    selectedModule: { key: "module-linux", title: "Shell" },
    selectedLesson: lesson,
    targetMicrosequence: { key: "micro-gap", title: "Cobrir lacuna" },
    userPrompt: "Complete a lacuna didática mais importante desta lição.",
    selectedModel: "gemini-2.5-flash"
  });
  const prompt = buildMicrosequencePlanningPrompt(contract, getModelCapabilities("gemini-2.5-flash"));

  assert.ok(contract.context.lesson.domainMap);
  assert.ok(contract.context.lesson.domainMap.gapSummary.uncoveredDomainItemIds.includes("linux-tree"));
  assert.match(prompt, /Não faça resumo genérico/i);
  assert.match(prompt, /acrescentar função didática nova/i);
});

test("lacuna real produz sugestão válida e lacuna coberta não aceita duplicata", () => {
  const fixture = loadFixture("propositional-logic-depth.json");
  const lesson = buildLessonFromFixture(fixture);
  const report = buildLessonDomainCoverageReport(lesson);
  const valid = fixture.validNewMicrosequence;
  const redundant = fixture.redundantMicrosequence;

  assert.ok(valid.domainRefs.some((id) => report.domainMap.gapSummary.uncoveredDomainItemIds.includes(id) || report.domainMap.gapSummary.explainedWithoutPracticeIds.includes(id)));
  assert.equal(
    validateDidacticRedundancy({ microsequence: valid, existingMicrosequences: fixture.existingMicrosequences }).ok,
    true
  );
  assert.equal(
    validateDidacticRedundancy({ microsequence: redundant, existingMicrosequences: fixture.existingMicrosequences }).ok,
    false
  );
});
