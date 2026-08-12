import test from "node:test";
import assert from "node:assert/strict";

import {
  assertBottomUpAssistanceOperationAuthorized,
  assertBottomUpAssistanceScopeCurrent,
  BOTTOM_UP_ASSISTANCE_OPERATIONS,
  buildBottomUpAssistanceScope
} from "../../src/assist/bottomUpAssistanceScope.js";

function paragraphCard(id, position, text) {
  return {
    id,
    position,
    resource: "paragraph",
    kind: "theory",
    exercise: "none",
    title: id,
    text,
    after: ""
  };
}

function projectFixture() {
  return {
    contract: "aralearn.project.v4",
    courses: [{
      id: "course-a",
      title: "Curso",
      goal: "Objetivo do curso.",
      modules: [{
        id: "module-a",
        title: "Módulo",
        goal: "Objetivo do módulo.",
        guide: { exclude: ["barreira"], avoid: [] },
        lessons: [{
          id: "lesson-a",
          title: "Lição",
          description: "Descrição da lição.",
          topics: [{ id: "topic-a", label: "Tópico", kind: "concept" }],
          microsequences: [{
            id: "micro-a",
            position: 0,
            title: "Primeira microssequência",
            goal: "Explicar.",
            role: "explain",
            dependsOn: [],
            covers: ["topic-a"],
            checks: [],
            errors: [],
            cards: [{
              id: "card-a",
              position: 1,
              resource: "composite",
              kind: "theory",
              exercise: "none",
              title: "Card composto",
              blocks: [{ id: "paragraph-a", kind: "paragraph", value: "Primeiro." }],
              after: "Síntese.",
              afterBlocks: [{ id: "support-a", kind: "paragraph", value: "Apoio." }]
            }, paragraphCard("card-b", 2, "Segundo.")]
          }, {
            id: "micro-b",
            position: 1,
            title: "Segunda microssequência",
            goal: "Praticar.",
            role: "practice",
            dependsOn: ["micro-a"],
            covers: ["topic-a"],
            checks: ["aplicar"],
            errors: [],
            cards: [paragraphCard("card-c", 1, "Terceiro.")]
          }, {
            id: "micro-empty",
            position: 2,
            title: "Microssequência vazia",
            goal: "Planejar.",
            role: "support",
            dependsOn: [],
            covers: [],
            checks: [],
            errors: [],
            cards: []
          }]
        }]
      }]
    }]
  };
}

const baseSelection = Object.freeze({
  courseKey: "course-a",
  moduleKey: "module-a",
  lessonKey: "lesson-a",
  microsequenceKey: "micro-a",
  cardKey: "card-a"
});

test("card separa resources graváveis do contexto somente leitura", async () => {
  const scope = await buildBottomUpAssistanceScope({
    projectDocument: projectFixture(),
    selection: baseSelection,
    level: "card",
    kind: "items",
    targetIds: ["body:paragraph-a"]
  });

  assert.equal(scope.kind, "items");
  assert.deepEqual(scope.writeScope.selectedIds, ["body:paragraph-a"]);
  assert.deepEqual(scope.writeScope.allowedOperations, [
    BOTTOM_UP_ASSISTANCE_OPERATIONS.REPLACE_RESOURCES
  ]);
  assert.equal(Object.hasOwn(scope.writeScope, "readOnlyContext"), false);
  assert.ok(scope.readOnlyContext.unselectedItems.some((item) => item.id === "after:text"));
  assert.equal(scope.readOnlyContext.neighbors[0].after.id, "card-b");
  assert.match(scope.baseFingerprint, /^[a-f0-9]{64}$/u);
});

test("card inteiro não concede criação nem troca de posição", async () => {
  const scope = await buildBottomUpAssistanceScope({
    projectDocument: projectFixture(),
    selection: baseSelection,
    level: "card",
    kind: "container",
    targetIds: ["card-a"]
  });

  assert.deepEqual(scope.writeScope.selectedIds, ["card-a"]);
  assert.deepEqual(scope.writeScope.allowedOperations, [
    BOTTOM_UP_ASSISTANCE_OPERATIONS.REPLACE_CARD
  ]);
  assert.throws(
    () => assertBottomUpAssistanceOperationAuthorized(scope, {
      operation: BOTTOM_UP_ASSISTANCE_OPERATIONS.CREATE_CARDS
    }),
    (error) => error?.code === "OUT_OF_SCOPE_BOTTOM_UP_ASSISTANCE_CHANGE"
  );
});

test("subconjunto de cards não recebe autoridade de criação", async () => {
  const scope = await buildBottomUpAssistanceScope({
    projectDocument: projectFixture(),
    selection: baseSelection,
    level: "microsequence",
    kind: "items",
    targetIds: ["card-a"]
  });

  assert.equal(scope.kind, "items");
  assert.deepEqual(scope.writeScope.selectedIds, ["card-a"]);
  assert.deepEqual(scope.writeScope.allowedOperations, [
    BOTTOM_UP_ASSISTANCE_OPERATIONS.UPDATE_CARDS,
    BOTTOM_UP_ASSISTANCE_OPERATIONS.REMOVE_CARDS,
    BOTTOM_UP_ASSISTANCE_OPERATIONS.MOVE_CARDS
  ]);
  assert.deepEqual(scope.readOnlyContext.unselectedItems.map((item) => item.id), ["card-b"]);
});

test("todos os cards promovem a seleção ao contêiner e permitem criar cards", async () => {
  const scope = await buildBottomUpAssistanceScope({
    projectDocument: projectFixture(),
    selection: baseSelection,
    level: "microsequence",
    kind: "items",
    targetIds: ["card-b", "card-a"]
  });

  assert.equal(scope.kind, "container");
  assert.equal(scope.writeScope.selectionSource, "promoted");
  assert.deepEqual(scope.writeScope.selectedIds, ["card-a", "card-b"]);
  assert.ok(scope.writeScope.allowedOperations.includes(
    BOTTOM_UP_ASSISTANCE_OPERATIONS.CREATE_CARDS
  ));
  const command = assertBottomUpAssistanceOperationAuthorized(scope, {
    operation: BOTTOM_UP_ASSISTANCE_OPERATIONS.CREATE_CARDS,
    destinationId: "micro-a",
    promptText: "Crie também conteúdo fora desta microssequência."
  });
  assert.equal(command.destinationId, "micro-a");
  assert.deepEqual(command.targetIds, []);
});

test("contêiner vazio é selecionável, mas lista vazia de itens não é", async () => {
  const selection = {
    ...baseSelection,
    microsequenceKey: "micro-empty",
    cardKey: ""
  };
  const scope = await buildBottomUpAssistanceScope({
    projectDocument: projectFixture(),
    selection,
    level: "microsequence",
    kind: "container"
  });

  assert.equal(scope.writeScope.emptyContainerSelected, true);
  assert.deepEqual(scope.writeScope.selectedIds, []);
  assert.deepEqual(scope.writeScope.allowedOperations, [
    BOTTOM_UP_ASSISTANCE_OPERATIONS.CREATE_CARDS
  ]);
  await assert.rejects(
    () => buildBottomUpAssistanceScope({
      projectDocument: projectFixture(),
      selection,
      level: "microsequence",
      kind: "items",
      targetIds: []
    }),
    (error) => error?.code === "INVALID_BOTTOM_UP_ASSISTANCE_SELECTION"
  );
});

test("uma única microssequência selecionada concede criação de cards, não de microssequência", async () => {
  const scope = await buildBottomUpAssistanceScope({
    projectDocument: projectFixture(),
    selection: baseSelection,
    level: "lesson",
    kind: "items",
    targetIds: ["micro-a"]
  });

  assert.equal(scope.kind, "items");
  assert.ok(scope.writeScope.allowedOperations.includes(
    BOTTOM_UP_ASSISTANCE_OPERATIONS.CREATE_CARDS
  ));
  assert.equal(scope.writeScope.allowedOperations.includes(
    BOTTOM_UP_ASSISTANCE_OPERATIONS.CREATE_MICROSEQUENCE
  ), false);
  const command = assertBottomUpAssistanceOperationAuthorized(scope, {
    operation: BOTTOM_UP_ASSISTANCE_OPERATIONS.CREATE_CARDS
  });
  assert.equal(command.destinationId, "micro-a");
});

test("várias microssequências, sem cobrir a lição, não concedem criação", async () => {
  const scope = await buildBottomUpAssistanceScope({
    projectDocument: projectFixture(),
    selection: baseSelection,
    level: "lesson",
    kind: "items",
    targetIds: ["micro-a", "micro-b"]
  });

  assert.equal(scope.kind, "items");
  assert.equal(scope.writeScope.allowedOperations.includes(
    BOTTOM_UP_ASSISTANCE_OPERATIONS.CREATE_CARDS
  ), false);
  assert.equal(scope.writeScope.allowedOperations.includes(
    BOTTOM_UP_ASSISTANCE_OPERATIONS.CREATE_MICROSEQUENCE
  ), false);
});

test("todas as microssequências promovem a lição e autorizam uma nova microssequência", async () => {
  const scope = await buildBottomUpAssistanceScope({
    projectDocument: projectFixture(),
    selection: baseSelection,
    level: "lesson",
    kind: "items",
    targetIds: ["micro-empty", "micro-b", "micro-a"]
  });

  assert.equal(scope.kind, "container");
  assert.equal(scope.writeScope.selectionSource, "promoted");
  assert.ok(scope.writeScope.allowedOperations.includes(
    BOTTOM_UP_ASSISTANCE_OPERATIONS.CREATE_MICROSEQUENCE
  ));
  const command = assertBottomUpAssistanceOperationAuthorized(scope, {
    operation: BOTTOM_UP_ASSISTANCE_OPERATIONS.CREATE_MICROSEQUENCE,
    destinationId: "lesson-a"
  });
  assert.equal(command.destinationId, "lesson-a");
});

test("uma única microssequência na lição acumula as duas permissões de criação", async () => {
  const project = projectFixture();
  project.courses[0].modules[0].lessons[0].microsequences.splice(1);
  const scope = await buildBottomUpAssistanceScope({
    projectDocument: project,
    selection: baseSelection,
    level: "lesson",
    kind: "items",
    targetIds: ["micro-a"]
  });

  assert.equal(scope.kind, "container");
  assert.equal(scope.writeScope.selectionSource, "promoted");
  assert.ok(scope.writeScope.allowedOperations.includes(
    BOTTOM_UP_ASSISTANCE_OPERATIONS.CREATE_CARDS
  ));
  assert.ok(scope.writeScope.allowedOperations.includes(
    BOTTOM_UP_ASSISTANCE_OPERATIONS.CREATE_MICROSEQUENCE
  ));
});

test("lição vazia aceita seu contêiner para criar a primeira microssequência", async () => {
  const project = projectFixture();
  project.courses[0].modules[0].lessons[0].microsequences = [];
  const scope = await buildBottomUpAssistanceScope({
    projectDocument: project,
    selection: {
      courseKey: "course-a",
      moduleKey: "module-a",
      lessonKey: "lesson-a"
    },
    level: "lesson",
    kind: "container"
  });

  assert.equal(scope.writeScope.emptyContainerSelected, true);
  assert.deepEqual(scope.writeScope.allowedOperations, [
    BOTTOM_UP_ASSISTANCE_OPERATIONS.CREATE_MICROSEQUENCE
  ]);
});

test("níveis acima de lição e identidades aproximadas são recusados", async () => {
  await assert.rejects(
    () => buildBottomUpAssistanceScope({
      projectDocument: projectFixture(),
      selection: baseSelection,
      level: "module",
      kind: "container"
    }),
    (error) => error?.code === "INVALID_BOTTOM_UP_ASSISTANCE_LEVEL"
  );
  await assert.rejects(
    () => buildBottomUpAssistanceScope({
      projectDocument: projectFixture(),
      selection: baseSelection,
      level: "microsequence",
      kind: "items",
      targetIds: [" card-a"]
    }),
    (error) => error?.code === "INVALID_BOTTOM_UP_ASSISTANCE_SELECTION"
  );
  await assert.rejects(
    () => buildBottomUpAssistanceScope({
      projectDocument: projectFixture(),
      selection: baseSelection,
      level: "microsequence",
      kind: "items",
      targetIds: ["card-a", "card-a"]
    }),
    (error) => error?.code === "INVALID_BOTTOM_UP_ASSISTANCE_SELECTION"
  );
});

test("prompt não amplia alvos e targetIds estruturais fora da seleção falham", async () => {
  const scope = await buildBottomUpAssistanceScope({
    projectDocument: projectFixture(),
    selection: baseSelection,
    level: "microsequence",
    kind: "items",
    targetIds: ["card-a"]
  });
  const command = assertBottomUpAssistanceOperationAuthorized(scope, {
    operation: BOTTOM_UP_ASSISTANCE_OPERATIONS.UPDATE_CARDS,
    promptText: "Altere também card-b."
  });
  assert.deepEqual(command.targetIds, ["card-a"]);
  assert.throws(
    () => assertBottomUpAssistanceOperationAuthorized(scope, {
      operation: BOTTOM_UP_ASSISTANCE_OPERATIONS.UPDATE_CARDS,
      targetIds: ["card-a", "card-b"]
    }),
    (error) => error?.code === "OUT_OF_SCOPE_BOTTOM_UP_ASSISTANCE_CHANGE"
  );
});

test("fingerprint permanece atual sem mudança e rejeita contexto alterado", async () => {
  const project = projectFixture();
  const scope = await buildBottomUpAssistanceScope({
    projectDocument: project,
    selection: baseSelection,
    level: "microsequence",
    kind: "items",
    targetIds: ["card-a"]
  });
  const current = await assertBottomUpAssistanceScopeCurrent({ scope, projectDocument: project });
  assert.equal(current.baseFingerprint, scope.baseFingerprint);

  const changed = structuredClone(project);
  changed.courses[0].modules[0].lessons[0].microsequences[0].cards[1].text =
    "O contexto não selecionado mudou.";
  await assert.rejects(
    () => assertBottomUpAssistanceScopeCurrent({ scope, projectDocument: changed }),
    (error) => error?.code === "STALE_BOTTOM_UP_ASSISTANCE_SCOPE"
  );
});
