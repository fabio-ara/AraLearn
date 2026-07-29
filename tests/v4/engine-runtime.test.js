import test from "node:test";
import assert from "node:assert/strict";

import { createFakeProvider } from "../../src/generation/providers/fakeProvider.js";
import { generateMicrosequenceCards } from "../../src/generation/bottomUp/generateMicrosequenceCards.js";

function projectWithPlannedMicrosequence() {
  return {
    contract: "aralearn.contract",
    version: 4,
    kind: "project",
    courses: [{
      id: "course-a",
      title: "Curso A",
      goal: "Objetivo",
      modules: [{
        id: "module-a",
        title: "Módulo A",
        guide: {
          goal: "Ler posições de uma matriz.",
          include: ["matriz"],
          exclude: ["determinante"],
          notation: [],
          avoid: []
        },
        lessons: [{
          id: "lesson-a",
          title: "Lição A",
          guide: {
            goal: "Ler posições de uma matriz.",
            include: ["matriz"],
            exclude: ["determinante"],
            notation: [],
            avoid: []
          },
          topics: [],
          microsequences: [{
            id: "micro-a",
            title: "Posição a_ij",
            goal: "Ler posição em matriz",
            role: "explain",
            status: "planned",
            dependsOn: [],
            covers: ["matriz"],
            checks: ["ler posição"],
            cards: []
          }]
        }]
      }]
    }]
  };
}

function matrixCard(position, exercise = "none") {
  const values = position === 3 ? [[5, 6], [7, 8]] : [[1, 2], [3, 4]];
  const base = {
    position,
    resource: "matrix",
    kind: exercise === "none" ? "theory" : "exercise",
    exercise,
    title: position === 1 ? "Posição na matriz" : `Prática ${position - 1}`,
    prompt: "Observe a matriz A.",
    name: "A",
    values,
    after: "O primeiro índice indica a linha."
  };
  if (exercise === "choice") {
    return {
      ...base,
      question: position === 3
        ? "Qual valor está na linha 1 e coluna 2?"
        : "Qual valor está na linha 2 e coluna 1?",
      selectionMode: "single",
      selectionCriterion: "correct",
      options: [
        {
          id: "a",
          text: position === 3 ? "6" : "3",
          feedback: "Correta: os índices indicam linha e coluna."
        },
        { id: "b", text: position === 3 ? "7" : "2", feedback: "Você inverteu os índices." },
        { id: "c", text: position === 3 ? "8" : "4", feedback: "Essa é outra célula." }
      ],
      answerIds: ["a"]
    };
  }
  return base;
}

function structuredMatrixProvider({ invalidFirstBuild = false } = {}) {
  const buildSteps = [
    ...(invalidFirstBuild ? [{ value: { card: { invalid: true } } }] : []),
    { value: { card: matrixCard(1) } },
    { value: { card: matrixCard(2, "choice") } },
    { value: { card: matrixCard(3, "choice") } }
  ];
  return createFakeProvider({
    script: {
      bottom_up_representation: [
        { value: { representation: "matrix:none" } },
        { value: { representation: "matrix:choice" } },
        { value: { representation: "matrix:choice" } }
      ],
      bottom_up_card_build: buildSteps
    }
  });
}

const selection = {
  courseKey: "course-a",
  moduleKey: "module-a",
  lessonKey: "lesson-a",
  microsequenceKey: "micro-a"
};

test("bottom-up escolhe representação e constrói cada card com schema exato", async () => {
  const requests = [];
  const base = structuredMatrixProvider();
  const provider = {
    ...base,
    async generateStructured(request) {
      requests.push(request);
      return base.generateStructured(request);
    }
  };
  const result = await generateMicrosequenceCards({
    project: projectWithPlannedMicrosequence(),
    selection,
    provider,
    modelId: "fake:model"
  });

  assert.equal(result.cards.length, 3);
  assert.deepEqual(result.cards.map((card) => card.resource), ["matrix", "matrix", "matrix"]);
  assert.deepEqual(
    requests.map((request) => request.phase),
    [
      "bottom_up_representation",
      "bottom_up_representation",
      "bottom_up_representation",
      "bottom_up_card_build",
      "bottom_up_card_build",
      "bottom_up_card_build"
    ]
  );
  const buildRequest = requests.find((request) => request.phase === "bottom_up_card_build");
  assert.deepEqual(buildRequest.schema.properties.card.properties.resource, { const: "matrix" });
  assert.equal(buildRequest.prompt.includes("CARD 1"), false);
  assert.equal(buildRequest.prompt.includes("optionA"), false);
});

test("bottom-up reconstrói somente o card cuja saída estruturada é inválida", async () => {
  const result = await generateMicrosequenceCards({
    project: projectWithPlannedMicrosequence(),
    selection,
    provider: structuredMatrixProvider({ invalidFirstBuild: true }),
    modelId: "fake:model"
  });
  assert.equal(result.cards.length, 3);
  assert.equal(result.cards[0].title, "Posição na matriz");
});

test("bottom-up falha fechado e não altera o projeto quando a representação sai do enum", async () => {
  const project = projectWithPlannedMicrosequence();
  const provider = createFakeProvider({
    script: {
      bottom_up_representation: {
        value: { representation: "unknown:none" }
      }
    }
  });
  await assert.rejects(
    () => generateMicrosequenceCards({ project, selection, provider, modelId: "fake:model" }),
    /fora do conjunto autorizado/u
  );
  assert.deepEqual(
    project.courses[0].modules[0].lessons[0].microsequences[0].cards,
    []
  );
});
