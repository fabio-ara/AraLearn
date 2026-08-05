import assert from "node:assert/strict";
import test from "node:test";

import {
  executeBottomUpAssistance
} from "../../src/assist/bottomUpAssistanceRuntime.js";
import {
  buildBottomUpAssistanceScope
} from "../../src/assist/bottomUpAssistanceScope.js";

function card(id, position, text) {
  return {
    id,
    position,
    resource: "paragraph",
    kind: "theory",
    exercise: "none",
    title: `Card ${position}`,
    text,
    after: ""
  };
}

function microsequence(id, title, cards) {
  return {
    id,
    title,
    goal: `Compreender ${title}.`,
    role: "explain",
    status: cards.length ? "generated" : "draft",
    dependsOn: [],
    covers: [],
    checks: [],
    cards
  };
}

function projectFixture() {
  return {
    contract: "aralearn.contract",
    version: 4,
    kind: "project",
    courses: [{
      id: "course-a",
      title: "Curso",
      goal: "Aprender.",
      modules: [{
        id: "module-a",
        title: "Módulo",
        guide: {
          goal: "Compreender.",
          include: [],
          exclude: [],
          notation: [],
          avoid: []
        },
        lessons: [{
          id: "lesson-a",
          title: "Lição",
          guide: {
            goal: "Explicar.",
            include: [],
            exclude: [],
            notation: [],
            avoid: []
          },
          topics: [],
          microsequences: [
            microsequence("micro-a", "Primeira", [
              card("card-a", 1, "Texto A."),
              card("card-b", 2, "Texto B.")
            ]),
            microsequence("micro-b", "Segunda", [
              card("card-c", 1, "Texto C.")
            ]),
            microsequence("micro-c", "Terceira", [
              card("card-d", 1, "Texto D.")
            ])
          ]
        }]
      }]
    }]
  };
}

const baseSelection = {
  courseKey: "course-a",
  moduleKey: "module-a",
  lessonKey: "lesson-a"
};

function firstLesson(project) {
  return project.courses[0].modules[0].lessons[0];
}

function scriptedProvider(handler) {
  const requests = [];
  return {
    requests,
    async generateStructured(request) {
      requests.push(request);
      return { value: await handler(request, requests.length) };
    }
  };
}

function builtParagraph(request, content = "Conteúdo novo.") {
  const target = request.engineContext.writableTarget;
  return {
    card: {
      id: target.id,
      position: target.position,
      resource: target.resource,
      kind: target.kind,
      exercise: target.exercise,
      title: target.title || "Card revisado",
      text: content,
      after: ""
    }
  };
}

test("card aplica reparo de resources diretamente, sem expor prévia", async () => {
  const project = projectFixture();
  const before = structuredClone(project);
  const scope = await buildBottomUpAssistanceScope({
    projectDocument: project,
    selection: {
      ...baseSelection,
      microsequenceKey: "micro-a",
      cardKey: "card-a"
    },
    level: "card",
    kind: "items",
    targetIds: ["main"]
  });
  const provider = scriptedProvider((request) => {
    if (request.phase === "bottom_up_operation") {
      return { operation: "replace_resources" };
    }
    assert.equal(request.phase, "card_assistance_resource_repair");
    return {
      replacements: [{
        targetId: "main",
        value: { text: "Texto corrigido." },
        gaps: []
      }]
    };
  });

  const result = await executeBottomUpAssistance({
    scope,
    projectDocument: project,
    prompt: "Corrija o texto.",
    provider,
    model: "fake:model"
  });

  assert.deepEqual(project, before);
  assert.equal(result.contract, "aralearn.bottom-up-assistance-result.v1");
  assert.equal(Object.hasOwn(result, "preview"), false);
  assert.equal(
    firstLesson(result.projectDocument).microsequences[0].cards[0].text,
    "Texto corrigido."
  );
  assert.deepEqual(result.change.targetIds, ["main"]);
});

test("microssequência atualiza somente cards escolhidos em um commit validado", async () => {
  const project = projectFixture();
  const scope = await buildBottomUpAssistanceScope({
    projectDocument: project,
    selection: { ...baseSelection, microsequenceKey: "micro-a" },
    level: "microsequence",
    kind: "items",
    targetIds: ["card-a", "card-b"]
  });
  const provider = scriptedProvider((request) => {
    if (request.phase === "bottom_up_operation") return { operation: "update_cards" };
    if (request.phase === "bottom_up_targets") return { targetIds: ["card-a"] };
    if (request.phase === "card_assistance_representation") {
      return { representation: "paragraph:theory:none" };
    }
    if (request.phase === "card_assistance_build") {
      const target = request.engineContext.writableTarget;
      return {
        card: {
          id: target.id,
          position: target.position,
          resource: target.resource,
          kind: target.kind,
          exercise: target.exercise,
          title: "Card 1",
          text: "Apenas A foi revisado.",
          after: ""
        }
      };
    }
    assert.fail(`Fase inesperada: ${request.phase}`);
  });

  const result = await executeBottomUpAssistance({
    scope,
    projectDocument: project,
    prompt: "Revise somente o primeiro card.",
    provider,
    modelId: "fake:model"
  });
  const cards = firstLesson(result.projectDocument).microsequences[0].cards;
  assert.equal(cards[0].text, "Apenas A foi revisado.");
  assert.equal(cards[1].text, "Texto B.");
  assert.deepEqual(result.change.targetIds, ["card-a"]);
});

test("payload fora da seleção falha sem alterar o documento", async () => {
  const project = projectFixture();
  const before = structuredClone(project);
  const scope = await buildBottomUpAssistanceScope({
    projectDocument: project,
    selection: { ...baseSelection, microsequenceKey: "micro-a" },
    level: "microsequence",
    kind: "items",
    targetIds: ["card-a"]
  });
  const provider = scriptedProvider((request) => {
    if (request.phase === "bottom_up_operation") return { operation: "remove_cards" };
    return { targetIds: ["card-b"] };
  });

  await assert.rejects(
    executeBottomUpAssistance({
      scope,
      projectDocument: project,
      prompt: "Exclua o outro card.",
      provider
    }),
    (error) => error?.code === "OUT_OF_SCOPE_BOTTOM_UP_ASSISTANCE_CHANGE"
  );
  assert.deepEqual(project, before);
  assert.equal(provider.requests.filter((request) => request.phase === "bottom_up_targets").length, 2);
});

test("movimento preserva identidades e renumera cards deterministicamente", async () => {
  const project = projectFixture();
  const scope = await buildBottomUpAssistanceScope({
    projectDocument: project,
    selection: { ...baseSelection, microsequenceKey: "micro-a" },
    level: "microsequence",
    kind: "items",
    targetIds: ["card-a"]
  });
  const provider = scriptedProvider((request) => request.phase === "bottom_up_operation"
    ? { operation: "move_cards" }
    : { moves: [{ targetId: "card-a", toIndex: 1 }] });

  const result = await executeBottomUpAssistance({
    scope,
    projectDocument: project,
    prompt: "Mova A para depois de B.",
    provider
  });
  const cards = firstLesson(result.projectDocument).microsequences[0].cards;
  assert.deepEqual(cards.map((item) => item.id), ["card-b", "card-a"]);
  assert.deepEqual(cards.map((item) => item.position), [1, 2]);
});

test("runtime separa alvo gravável do contexto somente leitura", async () => {
  const project = projectFixture();
  const scope = await buildBottomUpAssistanceScope({
    projectDocument: project,
    selection: { ...baseSelection, microsequenceKey: "micro-a" },
    level: "microsequence",
    kind: "items",
    targetIds: ["card-a"]
  });
  const provider = scriptedProvider((request) => {
    if (request.phase === "bottom_up_operation") {
      assert.deepEqual(
        request.engineContext.writableTargets.map((item) => item.id),
        ["card-a"]
      );
      assert.equal(request.engineContext.writableTargets[0].text, "Texto A.");
      assert.equal(
        request.engineContext.readOnlyContext.unselectedItems
          .some((item) => item.id === "card-b"),
        true
      );
      assert.equal(
        request.engineContext.writableTargets.some((item) => item.id === "card-b"),
        false
      );
      assert.notEqual(
        request.engineContext.readOnlyContext,
        request.engineContext.writableTargets
      );
      return { operation: "remove_cards" };
    }
    return { targetIds: ["card-a"] };
  });

  const result = await executeBottomUpAssistance({
    scope,
    projectDocument: project,
    prompt: "Remova somente A.",
    provider
  });
  assert.deepEqual(
    firstLesson(result.projectDocument).microsequences[0].cards.map((item) => item.id),
    ["card-b"]
  );
  assert.equal(
    firstLesson(result.projectDocument).microsequences[0].cards[0].text,
    "Texto B."
  );
});

test("container de microssequência pode criar cards, mas não outra microssequência", async () => {
  const project = projectFixture();
  const scope = await buildBottomUpAssistanceScope({
    projectDocument: project,
    selection: { ...baseSelection, microsequenceKey: "micro-a" },
    level: "microsequence",
    kind: "container"
  });
  const provider = scriptedProvider((request) => {
    if (request.phase === "bottom_up_operation") return { operation: "create_cards" };
    if (request.phase === "bottom_up_plan_cards") {
      return {
        cards: [{
          title: "Síntese",
          representation: "paragraph:theory:none",
          insertIndex: 2
        }]
      };
    }
    if (request.phase === "bottom_up_build_card") return builtParagraph(request);
    assert.fail(`Fase inesperada: ${request.phase}`);
  });

  const result = await executeBottomUpAssistance({
    scope,
    projectDocument: project,
    prompt: "Acrescente uma síntese.",
    provider
  });
  const lesson = firstLesson(result.projectDocument);
  assert.equal(lesson.microsequences.length, 3);
  assert.equal(lesson.microsequences[0].cards.length, 3);
  assert.match(lesson.microsequences[0].cards[2].id, /^card-sintese/u);
  assert.equal(result.change.createdIds.length, 1);
});

test("selecionar todos os cards por items promove a autoridade estrutural", async () => {
  const project = projectFixture();
  const scope = await buildBottomUpAssistanceScope({
    projectDocument: project,
    selection: { ...baseSelection, microsequenceKey: "micro-a" },
    level: "microsequence",
    kind: "items",
    targetIds: ["card-b", "card-a"]
  });
  assert.equal(scope.kind, "container");
  assert.equal(scope.writeScope.selectionSource, "promoted");
  const provider = scriptedProvider((request) => {
    if (request.phase === "bottom_up_operation") {
      assert.equal(
        request.schema.properties.operation.enum.includes("create_cards"),
        true
      );
      return { operation: "create_cards" };
    }
    if (request.phase === "bottom_up_plan_cards") {
      return {
        cards: [{
          title: "Síntese promovida",
          representation: "paragraph:theory:none",
          insertIndex: 2
        }]
      };
    }
    if (request.phase === "bottom_up_build_card") return builtParagraph(request);
    assert.fail(`Fase inesperada: ${request.phase}`);
  });

  const result = await executeBottomUpAssistance({
    scope,
    projectDocument: project,
    prompt: "Acrescente uma síntese.",
    provider
  });
  assert.equal(firstLesson(result.projectDocument).microsequences[0].cards.length, 3);
});

test("cards criados na mesma fronteira preservam a ordem do payload", async () => {
  const project = projectFixture();
  const scope = await buildBottomUpAssistanceScope({
    projectDocument: project,
    selection: { ...baseSelection, microsequenceKey: "micro-a" },
    level: "microsequence",
    kind: "container"
  });
  const provider = scriptedProvider((request) => {
    if (request.phase === "bottom_up_operation") return { operation: "create_cards" };
    if (request.phase === "bottom_up_plan_cards") {
      return {
        cards: [
          { title: "Novo um", representation: "paragraph:theory:none", insertIndex: 1 },
          { title: "Novo dois", representation: "paragraph:theory:none", insertIndex: 1 }
        ]
      };
    }
    if (request.phase === "bottom_up_build_card") {
      return builtParagraph(request, request.engineContext.writableTarget.title);
    }
    assert.fail(`Fase inesperada: ${request.phase}`);
  });

  const result = await executeBottomUpAssistance({
    scope,
    projectDocument: project,
    prompt: "Insira dois cards entre A e B.",
    provider
  });
  const cards = firstLesson(result.projectDocument).microsequences[0].cards;
  assert.deepEqual(
    cards.map((item) => item.text),
    ["Texto A.", "Novo um", "Novo dois", "Texto B."]
  );
  assert.deepEqual(cards.map((item) => item.position), [1, 2, 3, 4]);
});

test("planejamento com mais de oito cards é recusado sem construção parcial", async () => {
  const project = projectFixture();
  const before = structuredClone(project);
  const scope = await buildBottomUpAssistanceScope({
    projectDocument: project,
    selection: { ...baseSelection, microsequenceKey: "micro-a" },
    level: "microsequence",
    kind: "container"
  });
  const nineCards = Array.from({ length: 9 }, (_, index) => ({
    title: `Novo ${index + 1}`,
    representation: "paragraph:theory:none",
    insertIndex: 2
  }));
  const provider = scriptedProvider((request) => {
    if (request.phase === "bottom_up_operation") return { operation: "create_cards" };
    assert.equal(request.phase, "bottom_up_plan_cards");
    assert.equal(request.schema.properties.cards.maxItems, 8);
    return { cards: nineCards };
  });

  await assert.rejects(
    executeBottomUpAssistance({
      scope,
      projectDocument: project,
      prompt: "Crie nove cards.",
      provider
    }),
    /no máximo 8 cards/u
  );
  assert.deepEqual(project, before);
  assert.equal(
    provider.requests.filter((request) => request.phase === "bottom_up_plan_cards").length,
    2
  );
  assert.equal(
    provider.requests.some((request) => request.phase === "bottom_up_build_card"),
    false
  );
});

test("limite de oito cards é aceito e gera identidades únicas", async () => {
  const project = projectFixture();
  const scope = await buildBottomUpAssistanceScope({
    projectDocument: project,
    selection: { ...baseSelection, microsequenceKey: "micro-a" },
    level: "microsequence",
    kind: "container"
  });
  const eightCards = Array.from({ length: 8 }, (_, index) => ({
    title: `Limite ${index + 1}`,
    representation: "paragraph:theory:none",
    insertIndex: 2
  }));
  const provider = scriptedProvider((request) => {
    if (request.phase === "bottom_up_operation") return { operation: "create_cards" };
    if (request.phase === "bottom_up_plan_cards") return { cards: eightCards };
    return builtParagraph(request, request.engineContext.writableTarget.title);
  });
  const result = await executeBottomUpAssistance({
    scope,
    projectDocument: project,
    prompt: "Crie oito cards.",
    provider
  });
  const cards = firstLesson(result.projectDocument).microsequences[0].cards;
  assert.equal(cards.length, 10);
  assert.equal(result.change.createdIds.length, 8);
  assert.equal(new Set(result.change.createdIds).size, 8);
  assert.deepEqual(
    cards.slice(2).map((item) => item.text),
    eightCards.map((item) => item.title)
  );
});

test("contêiner vazio cria o primeiro card sem exigir identidade inexistente", async () => {
  const project = projectFixture();
  const micro = firstLesson(project).microsequences[0];
  micro.cards = [];
  micro.status = "planned";
  const scope = await buildBottomUpAssistanceScope({
    projectDocument: project,
    selection: { ...baseSelection, microsequenceKey: "micro-a" },
    level: "microsequence",
    kind: "container"
  });
  const provider = scriptedProvider((request) => {
    if (request.phase === "bottom_up_operation") return { operation: "create_cards" };
    if (request.phase === "bottom_up_plan_cards") {
      return {
        cards: [{
          title: "Primeiro card",
          representation: "paragraph:theory:none",
          insertIndex: 0
        }]
      };
    }
    return builtParagraph(request);
  });
  const result = await executeBottomUpAssistance({
    scope,
    projectDocument: project,
    prompt: "Crie o primeiro card.",
    provider
  });
  const createdMicro = firstLesson(result.projectDocument).microsequences[0];
  assert.equal(createdMicro.cards.length, 1);
  assert.equal(createdMicro.cards[0].position, 1);
  assert.equal(createdMicro.status, "generated");
});

test("lição com uma microssequência selecionada cria cards somente nela", async () => {
  const project = projectFixture();
  const scope = await buildBottomUpAssistanceScope({
    projectDocument: project,
    selection: baseSelection,
    level: "lesson",
    kind: "items",
    targetIds: ["micro-b"]
  });
  const provider = scriptedProvider((request) => {
    if (request.phase === "bottom_up_operation") return { operation: "create_cards" };
    if (request.phase === "bottom_up_plan_cards") {
      return {
        cards: [{
          title: "Prática",
          representation: "paragraph:theory:none",
          insertIndex: 1
        }]
      };
    }
    if (request.phase === "bottom_up_build_card") {
      return builtParagraph(request, "Card dentro da segunda microssequência.");
    }
    assert.fail(`Fase inesperada: ${request.phase}`);
  });

  const result = await executeBottomUpAssistance({
    scope,
    projectDocument: project,
    prompt: "Acrescente um card aqui.",
    provider
  });
  const micros = firstLesson(result.projectDocument).microsequences;
  assert.equal(micros[0].cards.length, 2);
  assert.equal(micros[1].cards.length, 2);
  assert.equal(result.change.destinationId, "micro-b");
});

test("seleção parcial de várias microssequências não pode criar microssequência", async () => {
  const project = projectFixture();
  const before = structuredClone(project);
  const scope = await buildBottomUpAssistanceScope({
    projectDocument: project,
    selection: baseSelection,
    level: "lesson",
    kind: "items",
    targetIds: ["micro-a", "micro-b"]
  });
  const provider = scriptedProvider(() => ({ operation: "create_microsequence" }));

  await assert.rejects(
    executeBottomUpAssistance({
      scope,
      projectDocument: project,
      prompt: "Crie outra microssequência.",
      provider
    }),
    (error) => error?.code === "OUT_OF_SCOPE_BOTTOM_UP_ASSISTANCE_CHANGE"
  );
  assert.deepEqual(project, before);
  assert.equal(provider.requests.length, 2);
});

test("seleção da lição inteira cria no máximo uma microssequência por envio", async () => {
  const project = projectFixture();
  const scope = await buildBottomUpAssistanceScope({
    projectDocument: project,
    selection: baseSelection,
    level: "lesson",
    kind: "container"
  });
  const provider = scriptedProvider((request) => {
    if (request.phase === "bottom_up_operation") {
      return { operation: "create_microsequence" };
    }
    assert.equal(request.phase, "bottom_up_create_microsequence");
    return {
      microsequence: {
        title: "Fechamento",
        goal: "Consolidar a lição.",
        role: "practice",
        dependsOn: ["micro-c"],
        covers: [],
        checks: ["síntese"],
        insertIndex: 3,
        cards: []
      }
    };
  });

  const result = await executeBottomUpAssistance({
    scope,
    projectDocument: project,
    prompt: "Crie uma microssequência final.",
    provider
  });
  const micros = firstLesson(result.projectDocument).microsequences;
  assert.equal(micros.length, 4);
  assert.equal(micros[3].title, "Fechamento");
  assert.equal(micros[3].status, "planned");
  assert.equal(result.change.createdIds.length, 1);
  assert.deepEqual(
    Object.keys(result).sort(),
    ["change", "contract", "operation", "projectDocument"]
  );
  assert.equal(Object.hasOwn(result, "preview"), false);
});

test("selecionar todas as microssequências por items equivale ao contêiner da lição", async () => {
  const project = projectFixture();
  const scope = await buildBottomUpAssistanceScope({
    projectDocument: project,
    selection: baseSelection,
    level: "lesson",
    kind: "items",
    targetIds: ["micro-c", "micro-a", "micro-b"]
  });
  assert.equal(scope.kind, "container");
  assert.equal(scope.writeScope.selectionSource, "promoted");
  const provider = scriptedProvider((request) => {
    if (request.phase === "bottom_up_operation") {
      return { operation: "create_microsequence" };
    }
    return {
      microsequence: {
        title: "Nova por promoção",
        goal: "Consolidar.",
        role: "practice",
        dependsOn: [],
        covers: [],
        checks: [],
        insertIndex: 3,
        cards: []
      }
    };
  });
  const result = await executeBottomUpAssistance({
    scope,
    projectDocument: project,
    prompt: "Crie uma microssequência.",
    provider
  });
  assert.equal(firstLesson(result.projectDocument).microsequences.length, 4);
});

test("payload não pode introduzir duas microssequências no mesmo envio", async () => {
  const project = projectFixture();
  const before = structuredClone(project);
  const scope = await buildBottomUpAssistanceScope({
    projectDocument: project,
    selection: baseSelection,
    level: "lesson",
    kind: "container"
  });
  const duplicatePayload = {
    microsequences: [
      { title: "Uma" },
      { title: "Duas" }
    ]
  };
  const provider = scriptedProvider((request) => {
    if (request.phase === "bottom_up_operation") {
      return { operation: "create_microsequence" };
    }
    assert.deepEqual(Object.keys(request.schema.properties), ["microsequence"]);
    return duplicatePayload;
  });

  await assert.rejects(
    executeBottomUpAssistance({
      scope,
      projectDocument: project,
      prompt: "Crie duas microssequências.",
      provider
    }),
    (error) => error?.code === "OUT_OF_SCOPE_BOTTOM_UP_ASSISTANCE_CHANGE"
  );
  assert.deepEqual(project, before);
  assert.equal(
    provider.requests.filter((request) => request.phase === "bottom_up_create_microsequence").length,
    2
  );
  assert.equal(
    provider.requests.some((request) => request.phase === "bottom_up_build_card"),
    false
  );
});

test("lição vazia cria a primeira microssequência pelo contêiner", async () => {
  const project = projectFixture();
  firstLesson(project).microsequences = [];
  const scope = await buildBottomUpAssistanceScope({
    projectDocument: project,
    selection: baseSelection,
    level: "lesson",
    kind: "container"
  });
  const provider = scriptedProvider((request) => request.phase === "bottom_up_operation"
    ? { operation: "create_microsequence" }
    : {
        microsequence: {
          title: "Primeira microssequência",
          goal: "Introduzir a lição.",
          role: "explain",
          dependsOn: [],
          covers: [],
          checks: [],
          insertIndex: 0,
          cards: []
        }
      });
  const result = await executeBottomUpAssistance({
    scope,
    projectDocument: project,
    prompt: "Crie a primeira microssequência.",
    provider
  });
  const micros = firstLesson(result.projectDocument).microsequences;
  assert.equal(micros.length, 1);
  assert.equal(micros[0].title, "Primeira microssequência");
  assert.equal(micros[0].status, "planned");
});

test("lição atualiza metadados somente das microssequências-alvo", async () => {
  const project = projectFixture();
  const scope = await buildBottomUpAssistanceScope({
    projectDocument: project,
    selection: baseSelection,
    level: "lesson",
    kind: "items",
    targetIds: ["micro-a", "micro-b"]
  });
  const provider = scriptedProvider((request) => request.phase === "bottom_up_operation"
    ? { operation: "update_microsequences" }
    : {
        updates: [{
          targetId: "micro-b",
          title: "Segunda revisada",
          checks: ["aplicar"]
        }]
      });

  const result = await executeBottomUpAssistance({
    scope,
    projectDocument: project,
    prompt: "Renomeie apenas a segunda.",
    provider
  });
  const micros = firstLesson(result.projectDocument).microsequences;
  assert.equal(micros[0].title, "Primeira");
  assert.equal(micros[1].title, "Segunda revisada");
  assert.deepEqual(result.change.targetIds, ["micro-b"]);
});

test("lição remove e move apenas microssequências autorizadas", async () => {
  const removalProject = projectFixture();
  const removalScope = await buildBottomUpAssistanceScope({
    projectDocument: removalProject,
    selection: baseSelection,
    level: "lesson",
    kind: "items",
    targetIds: ["micro-a", "micro-b"]
  });
  const removeProvider = scriptedProvider((request) => request.phase === "bottom_up_operation"
    ? { operation: "remove_microsequences" }
    : { targetIds: ["micro-b"] });
  const removed = await executeBottomUpAssistance({
    scope: removalScope,
    projectDocument: removalProject,
    prompt: "Exclua somente a segunda.",
    provider: removeProvider
  });
  assert.deepEqual(
    firstLesson(removed.projectDocument).microsequences.map((item) => item.id),
    ["micro-a", "micro-c"]
  );

  const moveProject = projectFixture();
  const moveScope = await buildBottomUpAssistanceScope({
    projectDocument: moveProject,
    selection: baseSelection,
    level: "lesson",
    kind: "items",
    targetIds: ["micro-a"]
  });
  const moveProvider = scriptedProvider((request) => request.phase === "bottom_up_operation"
    ? { operation: "move_microsequences" }
    : { moves: [{ targetId: "micro-a", toIndex: 2 }] });
  const moved = await executeBottomUpAssistance({
    scope: moveScope,
    projectDocument: moveProject,
    prompt: "Mova a primeira para o fim.",
    provider: moveProvider
  });
  assert.deepEqual(
    firstLesson(moved.projectDocument).microsequences.map((item) => item.id),
    ["micro-b", "micro-c", "micro-a"]
  );
});

test("remoção do último card deixa a microssequência planejada", async () => {
  const project = projectFixture();
  const scope = await buildBottomUpAssistanceScope({
    projectDocument: project,
    selection: { ...baseSelection, microsequenceKey: "micro-b" },
    level: "microsequence",
    kind: "container"
  });
  const provider = scriptedProvider((request) => request.phase === "bottom_up_operation"
    ? { operation: "remove_cards" }
    : { targetIds: ["card-c"] });
  const result = await executeBottomUpAssistance({
    scope,
    projectDocument: project,
    prompt: "Remova o card.",
    provider
  });
  const micro = firstLesson(result.projectDocument).microsequences[1];
  assert.deepEqual(micro.cards, []);
  assert.equal(micro.status, "planned");
});

test("escopo stale é recusado antes de chamar o provider", async () => {
  const project = projectFixture();
  const scope = await buildBottomUpAssistanceScope({
    projectDocument: project,
    selection: { ...baseSelection, microsequenceKey: "micro-a" },
    level: "microsequence",
    kind: "items",
    targetIds: ["card-a"]
  });
  project.courses[0].title = "Curso alterado";
  const provider = scriptedProvider(() => ({ operation: "remove_cards" }));

  await assert.rejects(
    executeBottomUpAssistance({
      scope,
      projectDocument: project,
      prompt: "Exclua o card.",
      provider
    }),
    (error) => error?.code === "STALE_BOTTOM_UP_ASSISTANCE_SCOPE"
  );
  assert.equal(provider.requests.length, 0);
});

test("falha no segundo reparo não aplica o primeiro card do lote", async () => {
  const project = projectFixture();
  const before = structuredClone(project);
  const scope = await buildBottomUpAssistanceScope({
    projectDocument: project,
    selection: { ...baseSelection, microsequenceKey: "micro-a" },
    level: "microsequence",
    kind: "items",
    targetIds: ["card-a", "card-b"]
  });
  const provider = scriptedProvider((request) => {
    if (request.phase === "bottom_up_operation") return { operation: "update_cards" };
    if (request.phase === "bottom_up_targets") {
      return { targetIds: ["card-a", "card-b"] };
    }
    if (request.phase === "card_assistance_representation") {
      return { representation: "paragraph:theory:none" };
    }
    if (request.phase === "card_assistance_build") {
      const target = request.engineContext.writableTarget;
      if (target.id === "card-a") {
        return {
          card: {
            id: target.id,
            position: target.position,
            resource: target.resource,
            kind: target.kind,
            exercise: target.exercise,
            title: "Card 1",
            text: "A seria alterado.",
            after: ""
          }
        };
      }
      return { card: { id: "fora-do-escopo" } };
    }
    assert.fail(`Fase inesperada: ${request.phase}`);
  });

  await assert.rejects(
    executeBottomUpAssistance({
      scope,
      projectDocument: project,
      prompt: "Revise os dois cards.",
      provider
    })
  );
  assert.deepEqual(project, before);
  assert.equal(
    provider.requests.filter((request) => (
      request.phase === "card_assistance_build"
      && request.engineContext.writableTarget.id === "card-a"
    )).length,
    1
  );
  assert.equal(
    provider.requests.filter((request) => (
      request.phase === "card_assistance_build"
      && request.engineContext.writableTarget.id === "card-b"
    )).length,
    2
  );
});

test("card novo inválido é reconstruído uma vez e falha sem mutação", async () => {
  const project = projectFixture();
  const before = structuredClone(project);
  const scope = await buildBottomUpAssistanceScope({
    projectDocument: project,
    selection: { ...baseSelection, microsequenceKey: "micro-a" },
    level: "microsequence",
    kind: "container"
  });
  const provider = scriptedProvider((request) => {
    if (request.phase === "bottom_up_operation") return { operation: "create_cards" };
    if (request.phase === "bottom_up_plan_cards") {
      return {
        cards: [{
          title: "Inválido",
          representation: "paragraph:theory:none",
          insertIndex: 0
        }]
      };
    }
    return { card: { text: "Sem campos determinísticos." } };
  });

  await assert.rejects(
    executeBottomUpAssistance({
      scope,
      projectDocument: project,
      prompt: "Crie um card.",
      provider
    })
  );
  assert.deepEqual(project, before);
  assert.equal(
    provider.requests.filter((request) => request.phase === "bottom_up_build_card").length,
    2
  );
});
