import test from "node:test";
import assert from "node:assert/strict";

import {
  allocateAssistedCardId,
  applyCardAssistanceChangeSet,
  buildCardAssistanceScopeSnapshot,
  listCardResourceTargets,
  resolveCardAssistanceContext
} from "../../src/assist/cardAssistanceScope.js";
import { validateCard } from "../../src/domain/cards.js";
import { CARD_AFTER_BLOCKS_MAX_ITEMS } from "../../src/resources/registry/index.js";

function paragraphCard(id, position, text) {
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
          microsequences: [{
            id: "micro-a",
            title: "Microssequência",
            goal: "Apresentar o conceito.",
            role: "explain",
            status: "generated",
            dependsOn: [],
            covers: [],
            checks: [],
            cards: [
              paragraphCard("card-a", 1, "Texto original."),
              paragraphCard("card-b", 2, "Texto vizinho.")
            ]
          }]
        }]
      }]
    }]
  };
}

const selection = {
  courseKey: "course-a",
  moduleKey: "module-a",
  lessonKey: "lesson-a",
  microsequenceKey: "micro-a",
  cardKey: "card-a"
};

test("lista o recurso principal e os apoios com identidades estáveis", () => {
  const card = {
    ...paragraphCard("card-a", 1, "Texto."),
    afterBlocks: [
      { id: "support-1", kind: "paragraph", value: "Apoio." }
    ]
  };
  assert.deepEqual(
    listCardResourceTargets(card).map(({ targetId, location, resourceType }) => ({
      targetId,
      location,
      resourceType
    })),
    [
      { targetId: "main", location: "main", resourceType: "paragraph" },
      { targetId: "after:text", location: "after_text", resourceType: "paragraph" },
      { targetId: "after:support-1", location: "after", resourceType: "paragraph" }
    ]
  );
});

test("card válido no teto de afterBlocks mantém alvos enumeráveis e inequívocos", () => {
  const result = validateCard({
    ...paragraphCard("card-a", 1, "Texto."),
    afterBlocks: Array.from(
      { length: CARD_AFTER_BLOCKS_MAX_ITEMS },
      (_, index) => ({
        id: `support-${index + 1}`,
        kind: "paragraph",
        value: `Apoio ${index + 1}.`
      })
    )
  });
  assert.equal(result.ok, true, JSON.stringify(result.errors || []));
  assert.doesNotThrow(() => listCardResourceTargets(result.value));
  const targets = listCardResourceTargets(result.value);
  assert.equal(targets.length, CARD_AFTER_BLOCKS_MAX_ITEMS + 2);
  assert.equal(new Set(targets.map((target) => target.targetId)).size, targets.length);
});

test("reparo de recurso aplica somente o alvo selecionado", async () => {
  const project = projectFixture();
  const snapshot = await buildCardAssistanceScopeSnapshot(project, selection, {
    operation: "repair",
    repairScope: "resources",
    resourceTargetIds: ["main"]
  });
  const changedCard = {
    ...project.courses[0].modules[0].lessons[0].microsequences[0].cards[0],
    text: "Texto corrigido."
  };
  const result = await applyCardAssistanceChangeSet({
    projectDocument: project,
    selection,
    snapshot,
    changeSet: {
      contract: "aralearn.card-assistance-change.v1",
      operation: "repair",
      card: changedCard
    }
  });
  const cards = result.projectDocument.courses[0].modules[0].lessons[0]
    .microsequences[0].cards;
  assert.equal(cards[0].text, "Texto corrigido.");
  assert.deepEqual(cards[1], project.courses[0].modules[0].lessons[0].microsequences[0].cards[1]);
});

test("reparo de recurso rejeita alteração de metadado não selecionado", async () => {
  const project = projectFixture();
  const snapshot = await buildCardAssistanceScopeSnapshot(project, selection, {
    operation: "repair",
    repairScope: "resources",
    resourceTargetIds: ["main"]
  });
  const changedCard = {
    ...project.courses[0].modules[0].lessons[0].microsequences[0].cards[0],
    title: "Título fora do escopo",
    text: "Texto corrigido."
  };
  await assert.rejects(
    () => applyCardAssistanceChangeSet({
      projectDocument: project,
      selection,
      snapshot,
      changeSet: {
        contract: "aralearn.card-assistance-change.v1",
        operation: "repair",
        card: changedCard
      }
    }),
    (error) => error?.code === "OUT_OF_SCOPE_CARD_ASSISTANCE_CHANGE"
  );
});

test("criação insere depois do card sem substituir IDs existentes", async () => {
  const project = projectFixture();
  const snapshot = await buildCardAssistanceScopeSnapshot(project, selection, {
    operation: "create",
    placement: "after_current"
  });
  const result = await applyCardAssistanceChangeSet({
    projectDocument: project,
    selection,
    snapshot,
    changeSet: {
      contract: "aralearn.card-assistance-change.v1",
      operation: "create",
      card: paragraphCard("card-assistido", 2, "Novo card.")
    }
  });
  const cards = result.projectDocument.courses[0].modules[0].lessons[0]
    .microsequences[0].cards;
  assert.deepEqual(cards.map((card) => card.id), ["card-a", "card-assistido", "card-b"]);
  assert.deepEqual(cards.map((card) => card.position), [1, 2, 3]);
});

test("criação antes e no fim usa posições determinísticas", async () => {
  for (const [placement, expectedIds] of [
    ["before_current", ["card-assistido", "card-a", "card-b"]],
    ["end_current", ["card-a", "card-b", "card-assistido"]]
  ]) {
    const project = projectFixture();
    const snapshot = await buildCardAssistanceScopeSnapshot(project, selection, {
      operation: "create",
      placement
    });
    const result = await applyCardAssistanceChangeSet({
      projectDocument: project,
      selection,
      snapshot,
      changeSet: {
        contract: "aralearn.card-assistance-change.v1",
        operation: "create",
        card: paragraphCard(
          "card-assistido",
          snapshot.target.insertIndex + 1,
          "Novo card."
        )
      }
    });
    const cards = result.projectDocument.courses[0].modules[0].lessons[0]
      .microsequences[0].cards;
    assert.deepEqual(cards.map((card) => card.id), expectedIds, placement);
    assert.deepEqual(cards.map((card) => card.position), [1, 2, 3], placement);
  }
});

test("criação inicia uma microssequência vazia sem exigir card âncora", async () => {
  const project = projectFixture();
  project.courses[0].modules[0].lessons[0].microsequences[0].cards = [];
  const emptySelection = {
    ...selection,
    cardKey: ""
  };
  const snapshot = await buildCardAssistanceScopeSnapshot(
    project,
    emptySelection,
    {
      operation: "create",
      placement: "end_current"
    }
  );
  assert.equal(snapshot.target.anchorCardKey, "");
  assert.equal(snapshot.target.insertIndex, 0);
  const result = await applyCardAssistanceChangeSet({
    projectDocument: project,
    selection: emptySelection,
    snapshot,
    changeSet: {
      contract: "aralearn.card-assistance-change.v1",
      operation: "create",
      card: paragraphCard("card-assistido", 1, "Primeiro card.")
    }
  });
  const cards = result.projectDocument.courses[0].modules[0].lessons[0]
    .microsequences[0].cards;
  assert.deepEqual(cards.map(({ id, position }) => ({ id, position })), [
    { id: "card-assistido", position: 1 }
  ]);
});

test("alocação evita colisões de card em outra microssequência", () => {
  const project = projectFixture();
  project.courses[0].modules[0].lessons[0].microsequences.push({
    id: "micro-b",
    title: "Outra",
    goal: "Comparar.",
    role: "practice",
    status: "generated",
    dependsOn: ["micro-a"],
    covers: [],
    checks: [],
    cards: [paragraphCard("card-assistido", 1, "Já existe.")]
  });
  const context = resolveCardAssistanceContext(project, selection);
  assert.equal(allocateAssistedCardId(context, "assistido"), "card-assistido-2");
});

test("reparo do card inteiro pode trocar a representação preservando identidade", async () => {
  const project = projectFixture();
  const snapshot = await buildCardAssistanceScopeSnapshot(project, selection, {
    operation: "repair",
    repairScope: "card"
  });
  const result = await applyCardAssistanceChangeSet({
    projectDocument: project,
    selection,
    snapshot,
    changeSet: {
      contract: "aralearn.card-assistance-change.v1",
      operation: "repair",
      card: {
        id: "card-a",
        position: 1,
        resource: "code",
        kind: "theory",
        exercise: "none",
        title: "Exemplo",
        prompt: "Leia.",
        language: "javascript",
        code: "const valor = 1;",
        after: ""
      }
    }
  });
  const card = result.projectDocument.courses[0].modules[0].lessons[0]
    .microsequences[0].cards[0];
  assert.equal(card.id, "card-a");
  assert.equal(card.position, 1);
  assert.equal(card.resource, "code");
});

test("mudança posterior invalida a prévia antes da aplicação", async () => {
  const project = projectFixture();
  const snapshot = await buildCardAssistanceScopeSnapshot(project, selection, {
    operation: "create",
    placement: "end_current"
  });
  const changed = structuredClone(project);
  changed.courses[0].modules[0].lessons[0].microsequences[0].cards[1].text = "Mudou.";
  await assert.rejects(
    () => applyCardAssistanceChangeSet({
      projectDocument: changed,
      selection,
      snapshot,
      changeSet: {
        contract: "aralearn.card-assistance-change.v1",
        operation: "create",
        card: paragraphCard("card-assistido", 3, "Novo.")
      }
    }),
    (error) => error?.code === "STALE_CARD_ASSISTANCE_SCOPE"
  );
});

test("mudança no contexto didático enviado à LLM invalida a prévia", async () => {
  for (const mutateContext of [
    (project) => {
      project.courses[0].modules[0].guide.goal = "Novo objetivo do módulo.";
    },
    (project) => {
      project.courses[0].modules[0].lessons[0].topics.push({
        id: "topic-new",
        label: "Conceito novo",
        kind: "concept",
        checks: ["Distingue o conceito."],
        errors: ["Confunde os conceitos."]
      });
    }
  ]) {
    const project = projectFixture();
    const snapshot = await buildCardAssistanceScopeSnapshot(project, selection, {
      operation: "repair",
      repairScope: "card"
    });
    const changed = structuredClone(project);
    mutateContext(changed);
    await assert.rejects(
      () => applyCardAssistanceChangeSet({
        projectDocument: changed,
        selection,
        snapshot,
        changeSet: {
          contract: "aralearn.card-assistance-change.v1",
          operation: "repair",
          card: paragraphCard("card-a", 1, "Texto corrigido.")
        }
      }),
      (error) => error?.code === "STALE_CARD_ASSISTANCE_SCOPE"
    );
  }
});

test("escopo e posição inválidos falham fechados", async () => {
  const project = projectFixture();
  for (const request of [
    { operation: "repair", repairScope: "" },
    { operation: "repair", repairScope: "all" },
    { operation: "create", placement: "" },
    { operation: "create", placement: "near_current" }
  ]) {
    await assert.rejects(
      () => buildCardAssistanceScopeSnapshot(project, selection, request),
      (error) => error?.code === "INVALID_CARD_ASSISTANCE_SCOPE",
      JSON.stringify(request)
    );
  }
});

test("criação before/after exige card âncora e não cai implicitamente no fim", async () => {
  const project = projectFixture();
  const selectionWithoutCard = {
    ...selection,
    cardKey: ""
  };
  for (const placement of ["before_current", "after_current"]) {
    await assert.rejects(
      () => buildCardAssistanceScopeSnapshot(
        project,
        selectionWithoutCard,
        { operation: "create", placement }
      ),
      (error) => error?.code === "INVALID_CARD_ASSISTANCE_SELECTION",
      placement
    );
  }
});

test("nova microssequência exige o mesmo card canônico no change set", async () => {
  const project = projectFixture();
  const snapshot = await buildCardAssistanceScopeSnapshot(project, selection, {
    operation: "create",
    placement: "new_microsequence"
  });
  const proposedCard = paragraphCard("card-assistido", 1, "Texto aprovado na prévia.");
  await assert.rejects(
    () => applyCardAssistanceChangeSet({
      projectDocument: project,
      selection,
      snapshot,
      changeSet: {
        contract: "aralearn.card-assistance-change.v1",
        operation: "create",
        card: proposedCard,
        microsequence: {
          id: "micro-assistida",
          title: "Nova microssequência",
          goal: "Ampliar o conceito.",
          role: "explain",
          status: "generated",
          dependsOn: ["micro-a"],
          covers: [],
          checks: [],
          cards: [{
            ...proposedCard,
            text: "Conteúdo divergente que não foi aprovado."
          }]
        }
      }
    }),
    (error) => error?.code === "INVALID_CARD_ASSISTANCE_RESULT"
  );
});
