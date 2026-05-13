import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { buildLessonDomainCoverageReport } from "../src/generation/domain/lessonDomainModel.js";
import { validateDidacticDepth } from "../src/generation/validation/validateDidacticDepth.js";
import { validateDidacticRedundancy } from "../src/generation/validation/validateDidacticRedundancy.js";
import { buildDidacticIterationPlan } from "../src/generation/validation/buildDidacticIterationPlan.js";
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
  assert.equal(shallow.passesDeterministicValidation, false);
  assert.ok(shallow.shallowErrors.some((item) => item.type === "definition_without_example"));
  assert.ok(shallow.shallowErrors.some((item) => item.type === "unstable_or_backstage_reference"));
  assert.equal(meticulous.ok, true);
  assert.equal(meticulous.passesDeterministicValidation, true);
});

test("heurística textual isolada não vira falha determinística nem continuação automática", () => {
  const audit = validateDidacticDepth({
    microsequence: {
      key: "micro-heuristic",
      title: "Comandos Git",
      coverageRole: "explain"
    },
    cards: [
      {
        key: "card-1",
        resourceType: "paragraph",
        text: "`git add` e `git commit` são comandos importantes do Git."
      },
      {
        key: "card-2",
        resourceType: "paragraph",
        text: "Esses comandos aparecem bastante em versionamento."
      },
      {
        key: "card-3",
        resourceType: "multiple_choice",
        question: "Qual comando registra o histórico local?",
        feedback: "`git commit` registra o histórico local."
      }
    ],
    existingMicrosequences: []
  });
  const plan = buildDidacticIterationPlan(
    { didacticAudit: audit },
    {
      didacticPlan: {
        cardPlan: [
          { position: 1, role: "present_core_point", resourceType: "paragraph" },
          { position: 2, role: "show_minimal_case", resourceType: "paragraph" },
          { position: 3, role: "check_understanding", resourceType: "multiple_choice" }
        ]
      },
      resources: {
        allowedResourceTypes: ["paragraph", "multiple_choice"]
      }
    }
  );

  assert.equal(audit.ok, false);
  assert.equal(audit.passesDeterministicValidation, true);
  assert.ok(audit.heuristicSignals.some((item) => item.type === "definition_without_example"));
  assert.equal(plan, null);
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

test("matriz de continuação separa expansão local, reescrita e ação para outra microssequência", () => {
  const expandPlan = buildDidacticIterationPlan(
    {
      didacticAudit: {
        shallowErrors: [],
        missingDepth: [
          {
            type: "conceptual_sequence_without_practice",
            target: "microsequence",
            message: "A microssequência cobre explicação, mas não deixa evidência prática de domínio.",
            basis: "declarative",
            severity: "declarative_gap",
            blocksValidation: true,
            allowsAutoIteration: true
          }
        ],
        blockingIssues: [
          {
            type: "conceptual_sequence_without_practice",
            target: "microsequence",
            message: "A microssequência cobre explicação, mas não deixa evidência prática de domínio.",
            basis: "declarative",
            severity: "declarative_gap",
            blocksValidation: true,
            allowsAutoIteration: true
          }
        ],
        actionableIssues: [
          {
            type: "conceptual_sequence_without_practice",
            target: "microsequence",
            message: "A microssequência cobre explicação, mas não deixa evidência prática de domínio.",
            basis: "declarative",
            severity: "declarative_gap",
            blocksValidation: true,
            allowsAutoIteration: true
          }
        ],
        declarativeGaps: [],
        suggestedActions: []
      }
    },
    {
      didacticPlan: {
        cardPlan: [
          { position: 1, role: "present_core_point", resourceType: "paragraph" },
          { position: 2, role: "show_minimal_case", resourceType: "paragraph" },
          { position: 3, role: "check_understanding", resourceType: "multiple_choice" }
        ]
      },
      resources: {
        allowedResourceTypes: ["paragraph", "multiple_choice"]
      }
    }
  );
  const deferPlan = buildDidacticIterationPlan(
    {
      didacticAudit: {
        shallowErrors: [],
        missingDepth: [
          {
            type: "domain_items_without_practice",
            target: "lesson",
            message: "Itens só explicados: usar `git push` depois do commit.",
            basis: "declarative",
            severity: "declarative_gap",
            blocksValidation: false,
            allowsAutoIteration: false
          }
        ],
        blockingIssues: [],
        actionableIssues: [],
        declarativeGaps: [
          {
            type: "domain_items_without_practice",
            target: "lesson",
            message: "Itens só explicados: usar `git push` depois do commit.",
            basis: "declarative",
            severity: "declarative_gap",
            blocksValidation: false,
            allowsAutoIteration: false
          }
        ],
        suggestedActions: ["Criar microssequências para: usar `git push` depois do commit."]
      }
    },
    {
      didacticPlan: {
        cardPlan: [
          { position: 1, role: "present_core_point", resourceType: "paragraph" },
          { position: 2, role: "show_minimal_case", resourceType: "paragraph" },
          { position: 3, role: "check_understanding", resourceType: "multiple_choice" }
        ]
      },
      resources: {
        allowedResourceTypes: ["paragraph", "multiple_choice"]
      }
    }
  );
  const rejectPlan = buildDidacticIterationPlan(
    {
      didacticAudit: {
        shallowErrors: [
          {
            type: "duplicate_microsequence_without_new_function",
            target: "microsequence",
            message: "A microssequência repete cobertura, formato e finalidade sem acrescentar contraste novo.",
            basis: "declarative",
            severity: "hard_error",
            blocksValidation: true,
            allowsAutoIteration: false
          }
        ],
        missingDepth: [],
        blockingIssues: [
          {
            type: "duplicate_microsequence_without_new_function",
            target: "microsequence",
            message: "A microssequência repete cobertura, formato e finalidade sem acrescentar contraste novo.",
            basis: "declarative",
            severity: "hard_error",
            blocksValidation: true,
            allowsAutoIteration: false
          }
        ],
        actionableIssues: [],
        declarativeGaps: [],
        suggestedActions: []
      }
    },
    {
      didacticPlan: {
        cardPlan: [
          { position: 1, role: "present_core_point", resourceType: "paragraph" },
          { position: 2, role: "show_minimal_case", resourceType: "paragraph" },
          { position: 3, role: "check_understanding", resourceType: "multiple_choice" }
        ]
      },
      resources: {
        allowedResourceTypes: ["paragraph", "multiple_choice"]
      }
    }
  );

  assert.equal(expandPlan.outcome, "expand_microsequence");
  assert.equal(expandPlan.shouldTriggerModelIteration, true);
  assert.equal(expandPlan.expectedCardCount, 4);
  assert.equal(deferPlan.outcome, "defer_to_new_microsequence");
  assert.equal(deferPlan.shouldTriggerModelIteration, false);
  assert.match(deferPlan.lessonFollowUpActions.join(" "), /Criar microssequências/i);
  assert.equal(rejectPlan.outcome, "reject_as_redundant");
  assert.equal(rejectPlan.shouldTriggerModelIteration, false);
});
