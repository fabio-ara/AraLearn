import assert from "node:assert/strict";
import test from "node:test";

import {
  executeBottomUpAssistance
} from "../../src/assist/bottomUpAssistanceRuntime.js";
import {
  buildBottomUpAssistanceScope
} from "../../src/assist/bottomUpAssistanceScope.js";

const SELECTION = {
  courseKey: "course-budget",
  moduleKey: "module-budget",
  lessonKey: "lesson-budget",
  microsequenceKey: "micro-budget"
};

function projectFixture(cardCount = 100) {
  return {
    contract: "aralearn.contract",
    version: 4,
    kind: "project",
    courses: [{
      id: SELECTION.courseKey,
      title: "Curso",
      goal: "Aprender.",
      modules: [{
        id: SELECTION.moduleKey,
        title: "Módulo",
        guide: {
          goal: "Compreender.",
          include: [],
          exclude: [],
          notation: [],
          avoid: []
        },
        lessons: [{
          id: SELECTION.lessonKey,
          title: "Lição",
          guide: {
            goal: "Explicar.",
            include: [],
            exclude: [],
            notation: [],
            avoid: []
          },
          topics: [],
          microsequences: [{
            id: SELECTION.microsequenceKey,
            title: "Microssequência",
            goal: "Consolidar.",
            role: "practice",
            status: "generated",
            dependsOn: [],
            covers: [],
            checks: [],
            errors: [],
            cards: Array.from({ length: cardCount }, (_, index) => ({
              id: `card-${index + 1}`,
              position: index + 1,
              resource: "paragraph",
              kind: "theory",
              exercise: "none",
              title: `Card ${index + 1}`,
              text: "x".repeat(1800),
              after: ""
            }))
          }]
        }]
      }]
    }]
  };
}

function buildParagraph(request) {
  const target = request.engineContext.writableTarget;
  return {
    card: {
      id: target.id,
      position: target.position,
      resource: target.resource,
      kind: target.kind,
      exercise: target.exercise,
      title: target.title,
      text: "Novo conteúdo curto e autocontido.",
      after: ""
    }
  };
}

test("selecionar cem cards mantém todos os prompts abaixo de 64 mil caracteres", async () => {
  const projectDocument = projectFixture();
  const scope = await buildBottomUpAssistanceScope({
    projectDocument,
    selection: SELECTION,
    level: "microsequence",
    kind: "container"
  });
  const requests = [];
  const provider = {
    async generateStructured(request) {
      requests.push(request);
      assert.ok(request.prompt.length <= 64000, request.phase);
      if (request.phase === "bottom_up_operation") {
        assert.equal(Object.hasOwn(request.engineContext, "writableTargets"), false);
        assert.equal(Object.hasOwn(request.engineContext, "readOnlyContext"), false);
        assert.equal(request.prompt.includes("x".repeat(1800)), false);
        return { value: { operation: "create_cards" } };
      }
      if (request.phase === "bottom_up_plan_cards") {
        assert.equal(request.engineContext.writableTargets.length, 100);
        assert.equal(request.engineContext.readOnlyContext.itemOrder.length, 48);
        assert.equal(
          request.engineContext.readOnlyContext.itemOrder.at(-1).truncated,
          true
        );
        assert.deepEqual(
          request.engineContext.writableTargets
            .filter((target) => target.informationalContent)
            .map((target) => target.id),
          [
            "card-1",
            "card-2",
            "card-3",
            "card-4",
            "card-97",
            "card-98",
            "card-99",
            "card-100"
          ]
        );
        return {
          value: {
            cards: [{
              title: "Card novo",
              representation: "paragraph:theory:none",
              insertIndex: 100
            }]
          }
        };
      }
      assert.equal(request.phase, "bottom_up_build_card");
      return { value: buildParagraph(request) };
    }
  };

  const result = await executeBottomUpAssistance({
    scope,
    projectDocument,
    prompt: "Acrescente um card final que sintetize a progressão.",
    provider,
    modelId: "fake:model"
  });

  assert.equal(result.operation, "create_cards");
  assert.equal(
    result.projectDocument.courses[0].modules[0].lessons[0]
      .microsequences[0].cards.length,
    101
  );
  assert.deepEqual(
    requests.map((request) => request.phase),
    ["bottom_up_operation", "bottom_up_plan_cards", "bottom_up_build_card"]
  );
});

test("o envelope preserva os textos dos dois cards selecionados", async () => {
  const projectDocument = projectFixture(4);
  const cards = projectDocument.courses[0].modules[0].lessons[0]
    .microsequences[0].cards;
  cards[0].text = "Informação exclusiva do primeiro alvo selecionado.";
  cards[2].text = "Informação exclusiva do segundo alvo selecionado.";
  const scope = await buildBottomUpAssistanceScope({
    projectDocument,
    selection: SELECTION,
    level: "microsequence",
    kind: "items",
    targetIds: ["card-1", "card-3"]
  });
  let inspectedEnvelope = false;
  const provider = {
    async generateStructured(request) {
      assert.ok(request.prompt.length <= 64000, request.phase);
      if (request.phase === "bottom_up_operation") {
        assert.equal(Object.hasOwn(request.engineContext, "writableTargets"), false);
        assert.equal(Object.hasOwn(request.engineContext, "readOnlyContext"), false);
        return { value: { operation: "remove_cards" } };
      }
      if (request.phase === "bottom_up_targets") {
        const targets = new Map(
          request.engineContext.writableTargets.map((target) => [target.id, target])
        );
        assert.equal(
          targets.get("card-1").informationalContent.text,
          cards[0].text
        );
        assert.equal(
          targets.get("card-3").informationalContent.text,
          cards[2].text
        );
        assert.ok(request.prompt.includes(cards[0].text));
        assert.ok(request.prompt.includes(cards[2].text));
        inspectedEnvelope = true;
        return { value: { targetIds: ["card-1"] } };
      }
      assert.fail(`Fase inesperada: ${request.phase}`);
    }
  };

  const result = await executeBottomUpAssistance({
    scope,
    projectDocument,
    prompt: "Remova somente o primeiro card selecionado.",
    provider,
    modelId: "fake:model"
  });

  assert.equal(inspectedEnvelope, true);
  assert.deepEqual(
    result.projectDocument.courses[0].modules[0].lessons[0]
      .microsequences[0].cards.map((card) => card.id),
    ["card-2", "card-3", "card-4"]
  );
});

test("barreiras pedagógicas acima do orçamento falham antes do provider", async () => {
  const projectDocument = projectFixture(2);
  projectDocument.courses[0].modules[0].guide.exclude = [
    `barreira obrigatória ${"x".repeat(9000)}`
  ];
  const scope = await buildBottomUpAssistanceScope({
    projectDocument,
    selection: SELECTION,
    level: "microsequence",
    kind: "container"
  });
  let providerCalls = 0;

  await assert.rejects(
    () => executeBottomUpAssistance({
      scope,
      projectDocument,
      prompt: "Crie um card.",
      provider: {
        async generateStructured() {
          providerCalls += 1;
          return { value: {} };
        }
      },
      modelId: "fake:model"
    }),
    (error) =>
      error?.code === "INVALID_BOTTOM_UP_ASSISTANCE_REQUEST" &&
      /barreiras exclude\/avoid do módulo excedem/iu.test(error.message)
  );
  assert.equal(providerCalls, 0);
});

test("cada card novo recebe o card anterior já criado no mesmo lote", async () => {
  const projectDocument = projectFixture(2);
  const scope = await buildBottomUpAssistanceScope({
    projectDocument,
    selection: SELECTION,
    level: "microsequence",
    kind: "container"
  });
  let builtCards = 0;
  const provider = {
    async generateStructured(request) {
      if (request.phase === "bottom_up_operation") {
        return { value: { operation: "create_cards" } };
      }
      if (request.phase === "bottom_up_plan_cards") {
        return {
          value: {
            cards: [
              {
                title: "Primeiro novo",
                representation: "paragraph:theory:none",
                insertIndex: 2
              },
              {
                title: "Segundo novo",
                representation: "paragraph:theory:none",
                insertIndex: 2
              }
            ]
          }
        };
      }
      builtCards += 1;
      if (builtCards === 2) {
        assert.equal(
          request.engineContext.placementContext.previous.title,
          "Primeiro novo"
        );
        assert.equal(request.engineContext.placementContext.insertIndex, 3);
      }
      return {
        value: {
          ...buildParagraph(request),
          card: {
            ...buildParagraph(request).card,
            text: builtCards === 1 ? "Primeiro conteúdo." : "Segundo conteúdo."
          }
        }
      };
    }
  };

  const result = await executeBottomUpAssistance({
    scope,
    projectDocument,
    prompt: "Crie dois cards encadeados no fim.",
    provider,
    modelId: "fake:model"
  });
  const cards = result.projectDocument.courses[0].modules[0].lessons[0]
    .microsequences[0].cards;
  assert.equal(builtCards, 2);
  assert.deepEqual(cards.slice(-2).map((item) => item.title), [
    "Primeiro novo",
    "Segundo novo"
  ]);
  assert.deepEqual(cards.slice(-2).map((item) => item.position), [3, 4]);
});
