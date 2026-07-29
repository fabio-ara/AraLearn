import test from "node:test";
import assert from "node:assert/strict";

import { buildDeterministicCardPlan } from "../../src/generation/planning/buildDeterministicCardPlan.js";
import { validateGeneratedCardsStructural } from "../../src/generation/validation/validateGeneratedCardsStructural.js";

function buildPlan(type = "concept", size = "medium") {
  return buildDeterministicCardPlan({
    type,
    size,
    packet: { currentMicrosequence: { goal: "Reconhecer a regra central." } },
    allowedResources: ["paragraph", "choice", "code", "table", "flow", "tree", "graph", "matrix", "plane"]
  });
}

test("o plano local define position, role, goal e checks", () => {
  const plan = buildPlan();
  assert.ok(plan.length > 0);
  plan.forEach((item, index) => {
    assert.deepEqual(Object.keys(item), ["position", "role", "goal", "checks"]);
    assert.equal(item.position, index + 1);
    assert.equal(typeof item.role, "string");
    assert.equal(typeof item.goal, "string");
    assert.ok(Array.isArray(item.checks));
  });
});

test("o plano local não escolhe recurso, kind nem exercise", () => {
  const plan = buildPlan("code_or_command", "medium");
  plan.forEach((item) => {
    assert.equal("resource" in item, false);
    assert.equal("kind" in item, false);
    assert.equal("exercise" in item, false);
  });
});

test("o plano local garante pelo menos dois slots de prática explícita", () => {
  [
    ["concept", "short"],
    ["comparison", "short"],
    ["rule_or_policy", "medium"],
    ["code_or_command", "short"]
  ].forEach(([type, size]) => {
    const plan = buildPlan(type, size);
    const explicitPracticeCount = plan.filter((item) => ["practice", "practice_more", "fix_error"].includes(item.role)).length;
    assert.ok(explicitPracticeCount >= 2, `${type}/${size}`);
  });
});

test("o plano explicativo longo distribui teoria sem perder prática de consolidação", () => {
  const plan = buildPlan("concept", "long");
  const theoryCount = plan.filter((item) => ["explain", "example", "review", "next"].includes(item.role)).length;
  const practiceCount = plan.filter((item) => ["practice", "practice_more", "fix_error"].includes(item.role)).length;
  assert.equal(plan.length, 8);
  assert.ok(theoryCount >= 3);
  assert.ok(practiceCount >= 3);
  assert.deepEqual(plan.slice(0, 3).map((item) => item.role), ["explain", "example", "practice"]);
  assert.ok(plan.slice(0, 5).some((item) => item.role === "review"));
});

test("o plano explicativo médio prefere duas práticas antes do fechamento final", () => {
  const plan = buildPlan("concept", "medium");
  assert.equal(plan.length, 5);
  assert.deepEqual(plan.map((item) => item.role), ["explain", "example", "practice", "practice_more", "next"]);
});

test("a geração final precisa usar exatamente position, resource, kind e exercise do plano", () => {
  const plan = [
    { position: 1, role: "explain", resource: "paragraph", kind: "theory", exercise: "none", goal: "", checks: [] },
    { position: 2, role: "example", resource: "paragraph", kind: "theory", exercise: "none", goal: "", checks: [] },
    { position: 3, role: "practice", resource: "paragraph", kind: "exercise", exercise: "gap", goal: "", checks: [] },
    { position: 4, role: "fix_error", resource: "choice", kind: "exercise", exercise: "choice", goal: "", checks: [] },
    { position: 5, role: "next", resource: "paragraph", kind: "theory", exercise: "none", goal: "", checks: [] }
  ];
  const contract = {
    plan,
    output: { cardCount: plan.length }
  };
  const validResponse = {
    cards: [
      {
        position: 1,
        resource: plan[0].resource,
        kind: plan[0].kind,
        exercise: plan[0].exercise,
        title: "Card 1",
        text: "Explicação objetiva.",
        after: ""
      },
      {
        position: 2,
        resource: "paragraph",
        kind: "theory",
        exercise: "none",
        title: "Card 2",
        text: "Exemplo mínimo.",
        after: ""
      },
      {
        position: 3,
        resource: "paragraph",
        kind: "exercise",
        exercise: "gap",
        title: "Card 3",
        text: "Complete [[resposta::resposta|erro 1|erro 2]].",
        after: ""
      },
      {
        position: 4,
        resource: "choice",
        kind: "exercise",
        exercise: "choice",
        title: "Card 4",
        question: "Qual leitura descreve a regra central?",
        options: [
          { id: "a", text: "As duas proposições são verdadeiras" },
          { id: "b", text: "Só uma proposição importa" },
          { id: "c", text: "Nenhuma proposição interfere" }
        ],
        selectionMode: "single",
        selectionCriterion: "correct",
        answerIds: ["a"],
        after: ""
      },
      {
        position: 5,
        resource: plan[4].resource,
        kind: plan[4].kind,
        exercise: plan[4].exercise,
        title: "Card 5",
        text: "Fechamento.",
        after: ""
      }
    ]
  };

  const ok = validateGeneratedCardsStructural(validResponse, contract);
  assert.equal(ok.ok, true);

  const invalidResponse = structuredClone(validResponse);
  invalidResponse.cards[3].exercise = "gap";
  const invalid = validateGeneratedCardsStructural(invalidResponse, contract);
  assert.equal(invalid.ok, false);
  assert.match(invalid.structuralErrors.join("\n"), /exercise diferente do plano/);
});
