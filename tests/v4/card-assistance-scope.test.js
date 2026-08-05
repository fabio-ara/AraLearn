import test from "node:test";
import assert from "node:assert/strict";

import {
  applyCardAssistanceBatchChangeSet,
  applyCardAssistanceChangeSet,
  buildCardAssistanceScopeSnapshot,
  listCardResourceTargets
} from "../../src/assist/cardAssistanceScope.js";
import { validateCard } from "../../src/domain/cards.js";
import { CARD_AFTER_BLOCKS_MAX_ITEMS } from "../../src/resources/registry/index.js";

function paragraphCard(id, position, value) {
  return {
    id,
    position,
    resource: "paragraph",
    kind: "theory",
    exercise: "none",
    title: `Card ${position}`,
    text: value,
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

function selectedMicrosequence(project) {
  return project.courses[0].modules[0].lessons[0].microsequences[0];
}

function repairChange(card) {
  return {
    contract: "aralearn.card-assistance-change.v1",
    operation: "repair",
    card
  };
}

test("lista recurso principal, texto posterior e apoios com identidades estáveis", () => {
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

test("card no teto de afterBlocks mantém alvos enumeráveis e inequívocos", () => {
  const validation = validateCard({
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
  assert.equal(validation.ok, true, JSON.stringify(validation.errors || []));
  const targets = listCardResourceTargets(validation.value);
  assert.equal(targets.length, CARD_AFTER_BLOCKS_MAX_ITEMS + 2);
  assert.equal(new Set(targets.map((target) => target.targetId)).size, targets.length);
});

test("reparo atômico de resource altera somente o alvo selecionado", async () => {
  const project = projectFixture();
  const before = structuredClone(project);
  const snapshot = await buildCardAssistanceScopeSnapshot(project, selection, {
    operation: "repair",
    repairScope: "resources",
    resourceTargetIds: ["main"]
  });
  const changedCard = {
    ...selectedMicrosequence(project).cards[0],
    text: "Texto corrigido."
  };
  const result = await applyCardAssistanceChangeSet({
    projectDocument: project,
    selection,
    snapshot,
    changeSet: repairChange(changedCard)
  });
  assert.equal(selectedMicrosequence(result.projectDocument).cards[0].text, "Texto corrigido.");
  assert.deepEqual(selectedMicrosequence(result.projectDocument).cards[1], before.courses[0]
    .modules[0].lessons[0].microsequences[0].cards[1]);
  assert.deepEqual(project, before);
});

test("reparo conjunto aplica vários cards numa única cópia validada", async () => {
  const project = projectFixture();
  const before = structuredClone(project);
  const entries = [];
  for (const [index, card] of selectedMicrosequence(project).cards.entries()) {
    const itemSelection = { ...selection, cardKey: card.id };
    entries.push({
      selection: itemSelection,
      snapshot: await buildCardAssistanceScopeSnapshot(project, itemSelection, {
        operation: "repair",
        repairScope: "card"
      }),
      changeSet: repairChange({ ...card, text: `Texto corrigido ${index + 1}.` })
    });
  }
  const result = await applyCardAssistanceBatchChangeSet({
    projectDocument: project,
    entries
  });
  assert.deepEqual(result.cardKeys, ["card-a", "card-b"]);
  assert.deepEqual(
    selectedMicrosequence(result.projectDocument).cards.map((card) => card.text),
    ["Texto corrigido 1.", "Texto corrigido 2."]
  );
  assert.deepEqual(project, before);
});

test("falha no segundo item impede qualquer resultado parcial do lote", async () => {
  const project = projectFixture();
  const before = structuredClone(project);
  const cards = selectedMicrosequence(project).cards;
  const entries = [];
  for (const card of cards) {
    const itemSelection = { ...selection, cardKey: card.id };
    entries.push({
      selection: itemSelection,
      snapshot: await buildCardAssistanceScopeSnapshot(project, itemSelection, {
        operation: "repair",
        repairScope: "card"
      }),
      changeSet: repairChange(card.id === "card-a"
        ? { ...card, text: "Primeiro válido." }
        : { ...card, id: "identidade-inválida", text: "Segundo inválido." })
    });
  }
  await assert.rejects(
    applyCardAssistanceBatchChangeSet({ projectDocument: project, entries }),
    (error) => error?.code === "OUT_OF_SCOPE_CARD_ASSISTANCE_CHANGE"
  );
  assert.deepEqual(project, before);
});

test("reparo de resource rejeita metadado não selecionado", async () => {
  const project = projectFixture();
  const snapshot = await buildCardAssistanceScopeSnapshot(project, selection, {
    operation: "repair",
    repairScope: "resources",
    resourceTargetIds: ["main"]
  });
  const changedCard = {
    ...selectedMicrosequence(project).cards[0],
    title: "Título fora do escopo",
    text: "Texto corrigido."
  };
  await assert.rejects(
    applyCardAssistanceChangeSet({
      projectDocument: project,
      selection,
      snapshot,
      changeSet: repairChange(changedCard)
    }),
    (error) => error?.code === "OUT_OF_SCOPE_CARD_ASSISTANCE_CHANGE"
  );
});

test("reparo de bloco selecionado preserva identidade e tipo do resource", async () => {
  const project = projectFixture();
  selectedMicrosequence(project).cards[0] = {
    id: "card-a",
    position: 1,
    resource: "composite",
    kind: "theory",
    exercise: "none",
    title: "Composto",
    blocks: [
      { id: "part-a", kind: "paragraph", value: "Original." },
      { id: "part-b", kind: "paragraph", value: "Contexto." }
    ],
    after: ""
  };
  const snapshot = await buildCardAssistanceScopeSnapshot(project, selection, {
    operation: "repair",
    repairScope: "resources",
    resourceTargetIds: ["body:part-a"]
  });
  const changedCard = structuredClone(selectedMicrosequence(project).cards[0]);
  changedCard.blocks[0] = {
    id: "part-c",
    kind: "paragraph",
    value: "Tentativa de troca."
  };
  await assert.rejects(
    applyCardAssistanceChangeSet({
      projectDocument: project,
      selection,
      snapshot,
      changeSet: repairChange(changedCard)
    }),
    (error) => error?.code === "OUT_OF_SCOPE_CARD_ASSISTANCE_CHANGE"
  );
});

test("reparo do card inteiro pode trocar representação preservando identidade", async () => {
  const project = projectFixture();
  const snapshot = await buildCardAssistanceScopeSnapshot(project, selection, {
    operation: "repair",
    repairScope: "card"
  });
  const result = await applyCardAssistanceChangeSet({
    projectDocument: project,
    selection,
    snapshot,
    changeSet: repairChange({
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
    })
  });
  const card = selectedMicrosequence(result.projectDocument).cards[0];
  assert.equal(card.id, "card-a");
  assert.equal(card.position, 1);
  assert.equal(card.resource, "code");
});

test("reparo do card inteiro não pode trocar identidade nem posição", async () => {
  for (const patch of [{ id: "outro-card" }, { position: 2 }]) {
    const project = projectFixture();
    const snapshot = await buildCardAssistanceScopeSnapshot(project, selection, {
      operation: "repair",
      repairScope: "card"
    });
    await assert.rejects(
      applyCardAssistanceChangeSet({
        projectDocument: project,
        selection,
        snapshot,
        changeSet: repairChange({
          ...selectedMicrosequence(project).cards[0],
          ...patch
        })
      }),
      (error) => error?.code === "OUT_OF_SCOPE_CARD_ASSISTANCE_CHANGE"
    );
  }
});

test("mudança posterior em card vizinho ou contexto didático invalida o escopo", async () => {
  for (const mutateContext of [
    (project) => {
      selectedMicrosequence(project).cards[1].text = "Vizinho alterado.";
    },
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
      applyCardAssistanceChangeSet({
        projectDocument: changed,
        selection,
        snapshot,
        changeSet: repairChange(paragraphCard("card-a", 1, "Texto corrigido."))
      }),
      (error) => error?.code === "STALE_CARD_ASSISTANCE_SCOPE"
    );
  }
});

test("resource inexistente ou repetido falha fechado", async () => {
  const project = projectFixture();
  for (const resourceTargetIds of [[], ["ausente"], ["main", "main"]]) {
    await assert.rejects(
      buildCardAssistanceScopeSnapshot(project, selection, {
        operation: "repair",
        repairScope: "resources",
        resourceTargetIds
      }),
      (error) => error?.code === "INVALID_CARD_ASSISTANCE_SELECTION"
    );
  }
});

test("escopo de card aceita somente reparo explícito e nunca criação", async () => {
  const project = projectFixture();
  for (const request of [
    { operation: "repair", repairScope: "" },
    { operation: "repair", repairScope: "all" },
    { operation: "create", placement: "after_current" },
    { operation: "create", placement: "new_microsequence" }
  ]) {
    await assert.rejects(
      buildCardAssistanceScopeSnapshot(project, selection, request),
      (error) => error?.code === "INVALID_CARD_ASSISTANCE_SCOPE"
    );
  }
});

test("reparo exige um card exato na microssequência", async () => {
  const project = projectFixture();
  await assert.rejects(
    buildCardAssistanceScopeSnapshot(project, { ...selection, cardKey: "" }, {
      operation: "repair",
      repairScope: "card"
    }),
    (error) => error?.code === "INVALID_CARD_ASSISTANCE_SELECTION"
  );
});
