import test from "node:test";
import assert from "node:assert/strict";

import {
  generateCardAssistanceChangeSet
} from "../../src/generation/runtime/cardAssistanceRuntime.js";
import {
  applyCardAssistanceChangeSet,
  listCardResourceTargets
} from "../../src/assist/cardAssistanceScope.js";
import { compileAuthoringCardGaps } from "../../src/core/authoringGaps.js";
import {
  getAuthoringResourceContract,
  listResourceIds
} from "../../src/resources/registry/index.js";

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
            cards: [{
              id: "card-a",
              position: 1,
              resource: "paragraph",
              kind: "theory",
              exercise: "none",
              title: "Conceito",
              text: "Texto original.",
              after: ""
            }]
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

function chartChoiceCard() {
  return {
    id: "card-a",
    position: 1,
    resource: "chart",
    kind: "exercise",
    exercise: "choice",
    title: "Comparação de categorias",
    prompt: "Compare as duas barras.",
    chartType: "bar",
    xAxis: { label: "Categoria" },
    yAxis: { label: "Quantidade", unit: "itens" },
    series: [{
      id: "serie-a",
      name: "Amostra",
      values: [["Alfa", 2], ["Beta", 5]]
    }],
    question: "Qual categoria apresenta a maior quantidade?",
    selectionMode: "single",
    selectionCriterion: "correct",
    options: [
      { id: "alfa", text: "Alfa" },
      { id: "beta", text: "Beta" }
    ],
    answerIds: ["beta"],
    after: ""
  };
}

test("reparo de recurso envia contexto limitado e devolve change set mínimo", async () => {
  const requests = [];
  const provider = {
    async generateStructured(request) {
      requests.push(request);
      return {
        value: {
          replacements: [{
            targetId: "main",
            value: {
              text: "Texto corrigido."
            },
            gaps: []
          }]
        }
      };
    }
  };
  const project = projectFixture();
  const preview = await generateCardAssistanceChangeSet({
    projectDocument: project,
    selection,
    request: {
      operation: "repair",
      repairScope: "resources",
      resourceTargetIds: ["main"],
      promptText: "Corrija o texto."
    },
    provider,
    modelId: "fake:model"
  });
  assert.equal(requests.length, 1);
  assert.equal(requests[0].engineContext.contract, "aralearn.atomic-resource-repair.v1");
  assert.equal(requests[0].prompt.includes("Texto original."), true);
  assert.deepEqual(requests[0].engineContext.writableTargets[0].value, {
    text: "Texto original."
  });
  const mainValueSchema = requests[0].schema.properties.replacements.items
    .oneOf[0].properties.value;
  ["id", "position", "resource", "kind", "exercise", "title", "after", "afterBlocks", "sources"]
    .forEach((fieldName) => {
      assert.equal(Object.hasOwn(mainValueSchema.properties, fieldName), false, fieldName);
    });
  assert.equal(Object.hasOwn(preview, "projectDocument"), false);
  assert.equal(preview.changeSet.card.text, "Texto corrigido.");
});

test("reparo isolado do recurso principal preserva a resposta choice contextual", async () => {
  const project = projectFixture();
  project.courses[0].modules[0].lessons[0].microsequences[0].cards[0] =
    chartChoiceCard();
  const provider = {
    async generateStructured() {
      return {
        value: {
          replacements: [{
            targetId: "main",
            value: {
              prompt: "Compare as barras e observe a escala.",
              chartType: "bar",
              xAxis: { label: "Categoria" },
              yAxis: { label: "Quantidade", unit: "itens" },
              series: [{
                id: "serie-a",
                name: "Amostra revisada",
                values: [["Alfa", 3], ["Beta", 7]]
              }]
            },
            gaps: []
          }]
        }
      };
    }
  };

  const preview = await generateCardAssistanceChangeSet({
    projectDocument: project,
    selection,
    request: {
      operation: "repair",
      repairScope: "resources",
      resourceTargetIds: ["main"],
      promptText: "Atualize somente os dados do gráfico."
    },
    provider,
    modelId: "fake:model"
  });

  assert.equal(preview.changeSet.card.series[0].values[1][1], 7);
  assert.equal(
    preview.changeSet.card.question,
    "Qual categoria apresenta a maior quantidade?"
  );
  assert.deepEqual(preview.changeSet.card.answerIds, ["beta"]);
});

test("reparo conjunto de main e response compila cada alvo sem estado intermediário inválido", async () => {
  const project = projectFixture();
  project.courses[0].modules[0].lessons[0].microsequences[0].cards[0] =
    chartChoiceCard();
  const provider = {
    async generateStructured() {
      return {
        value: {
          replacements: [
            {
              targetId: "main",
              value: {
                prompt: "Compare as barras da nova coleta.",
                chartType: "bar",
                xAxis: { label: "Categoria" },
                yAxis: { label: "Quantidade", unit: "itens" },
                series: [{
                  id: "serie-a",
                  name: "Nova coleta",
                  values: [["Alfa", 8], ["Beta", 4]]
                }]
              },
              gaps: []
            },
            {
              targetId: "response",
              value: {
                question: "Qual categoria lidera a nova coleta?",
                selectionMode: "single",
                selectionCriterion: "correct",
                options: [
                  { id: "alfa", text: "Alfa" },
                  { id: "beta", text: "Beta" }
                ],
                answerIds: ["alfa"]
              },
              gaps: []
            }
          ]
        }
      };
    }
  };

  const preview = await generateCardAssistanceChangeSet({
    projectDocument: project,
    selection,
    request: {
      operation: "repair",
      repairScope: "resources",
      resourceTargetIds: ["main", "response"],
      promptText: "Atualize gráfico e pergunta para a nova coleta."
    },
    provider,
    modelId: "fake:model"
  });

  assert.equal(preview.changeSet.card.series[0].values[0][1], 8);
  assert.equal(preview.changeSet.card.question, "Qual categoria lidera a nova coleta?");
  assert.deepEqual(preview.changeSet.card.answerIds, ["alfa"]);
});

test("criação usa decisão curta, schema exato e aplicação determinística", async () => {
  const requests = [];
  const provider = {
    async generateStructured(request) {
      requests.push(request);
      if (request.phase === "card_assistance_representation") {
        return { value: { representation: "paragraph:theory:none" } };
      }
      return {
        value: {
          card: {
            id: "card-assistido",
            position: 2,
            resource: "paragraph",
            kind: "theory",
            exercise: "none",
            title: "Novo conceito",
            text: "Uma explicação nova.",
            after: ""
          }
        }
      };
    }
  };
  const project = projectFixture();
  const preview = await generateCardAssistanceChangeSet({
    projectDocument: project,
    selection,
    request: {
      operation: "create",
      placement: "after_current",
      promptText: "Crie uma explicação complementar."
    },
    provider,
    modelId: "fake:model"
  });
  assert.deepEqual(
    requests.map((request) => request.phase),
    ["card_assistance_representation", "card_assistance_build"]
  );
  assert.equal(requests[1].schema.properties.card.properties.id.const, "card-assistido");
  const applied = await applyCardAssistanceChangeSet({
    projectDocument: project,
    selection,
    snapshot: preview.snapshot,
    changeSet: preview.changeSet
  });
  assert.deepEqual(
    applied.projectDocument.courses[0].modules[0].lessons[0]
      .microsequences[0].cards.map((card) => card.id),
    ["card-a", "card-assistido"]
  );
});

test("criação em nova microssequência produz uma entidade e um card", async () => {
  const provider = {
    async generateStructured(request) {
      if (request.phase === "card_assistance_representation") {
        return {
          value: {
            representation: "paragraph:theory:none",
            microsequenceTitle: "Extensão",
            microsequenceGoal: "Explicar a extensão."
          }
        };
      }
      return {
        value: {
          card: {
            id: "card-assistido",
            position: 1,
            resource: "paragraph",
            kind: "theory",
            exercise: "none",
            title: "Extensão",
            text: "Conteúdo.",
            after: ""
          }
        }
      };
    }
  };
  const project = projectFixture();
  const preview = await generateCardAssistanceChangeSet({
    projectDocument: project,
    selection,
    request: {
      operation: "create",
      placement: "new_microsequence",
      promptText: "Crie uma nova etapa."
    },
    provider,
    modelId: "fake:model"
  });
  assert.equal(preview.changeSet.microsequence.cards.length, 1);
  const applied = await applyCardAssistanceChangeSet({
    projectDocument: project,
    selection,
    snapshot: preview.snapshot,
    changeSet: preview.changeSet
  });
  const microsequences = applied.projectDocument.courses[0].modules[0].lessons[0]
    .microsequences;
  assert.deepEqual(microsequences.map((item) => item.id), [
    "micro-a",
    "microsequence-extensao"
  ]);
  assert.deepEqual(microsequences[1].dependsOn, ["micro-a"]);
});

test("reparo do card preserva envelopes fora do schema compacto", async () => {
  const project = projectFixture();
  const card = project.courses[0].modules[0].lessons[0].microsequences[0].cards[0];
  card.sources = ["material-autorizado"];
  card.topics = ["conceito-a"];
  card.languageTag = "pt-BR";
  card.textDirection = "ltr";
  card.afterBlocks = [{
    id: "apoio-1",
    kind: "paragraph",
    value: "Apoio preservado."
  }];
  const requests = [];
  const provider = {
    async generateStructured(request) {
      requests.push(request);
      if (request.phase === "card_assistance_representation") {
        return { value: { representation: "paragraph:theory:none" } };
      }
      return {
        value: {
          card: {
            id: "card-a",
            position: 1,
            resource: "paragraph",
            kind: "theory",
            exercise: "none",
            title: "Conceito revisto",
            text: "Texto integralmente revisto.",
            after: "Síntese."
          }
        }
      };
    }
  };

  const preview = await generateCardAssistanceChangeSet({
    projectDocument: project,
    selection,
    request: {
      operation: "repair",
      repairScope: "card",
      promptText: "Revise a explicação principal."
    },
    provider,
    modelId: "fake:model"
  });

  const buildSchema = requests.find((request) =>
    request.phase === "card_assistance_build"
  ).schema.properties.card;
  for (const fieldName of [
    "afterBlocks",
    "sources",
    "topics",
    "languageTag",
    "textDirection"
  ]) {
    assert.equal(Object.hasOwn(buildSchema.properties, fieldName), false, fieldName);
    assert.deepEqual(preview.changeSet.card[fieldName], card[fieldName], fieldName);
  }
  assert.equal(preview.changeSet.card.text, "Texto integralmente revisto.");
});

test("criação atômica aceita exemplos formais dos 18 recursos canônicos", async () => {
  for (const resource of listResourceIds()) {
    const contract = getAuthoringResourceContract(resource);
    const source = structuredClone(contract.example);
    const requiredAlternative = (contract.shape.requiredAlternatives || [])
      .find((alternative) =>
        alternative.every((fieldName) =>
          source[fieldName] !== null && source[fieldName] !== undefined
        )
      ) || [];
    const representation = [
      `${resource}:${source.kind === "exercise" ? "exercise" : "theory"}:${source.exercise}`,
      requiredAlternative.length ? `@${requiredAlternative.join("+")}` : ""
    ].join("");
    const provider = {
      async generateStructured(request) {
        if (request.phase === "card_assistance_representation") {
          return { value: { representation } };
        }
        return {
          value: {
            card: {
              ...source,
              id: "card-assistido",
              position: 2
            }
          }
        };
      }
    };
    const preview = await generateCardAssistanceChangeSet({
      projectDocument: projectFixture(),
      selection,
      request: {
        operation: "create",
        placement: "after_current",
        promptText: `Crie um card ${resource}.`
      },
      provider,
      modelId: "fake:model"
    });
    assert.equal(preview.changeSet.card.resource, resource, resource);
    assert.equal(Object.hasOwn(preview.changeSet.card, "gaps"), false, resource);
  }
});

test("reparo de recursos múltiplos preserva bloco não selecionado e apoio", async () => {
  const project = projectFixture();
  const microsequence = project.courses[0].modules[0].lessons[0].microsequences[0];
  microsequence.cards[0] = {
    id: "card-a",
    position: 1,
    resource: "composite",
    kind: "theory",
    exercise: "none",
    title: "Três partes",
    blocks: [
      { id: "part-1", kind: "paragraph", value: "Primeira." },
      { id: "part-2", kind: "paragraph", value: "Segunda." },
      { id: "part-3", kind: "paragraph", value: "Intocada." }
    ],
    afterBlocks: [
      { id: "support-1", kind: "paragraph", value: "Apoio intocado." }
    ],
    after: ""
  };
  const provider = {
    async generateStructured() {
      return {
        value: {
          replacements: [
            {
              targetId: "body:part-1",
              value: { id: "part-1", kind: "paragraph", value: "Primeira corrigida." },
              gaps: []
            },
            {
              targetId: "body:part-2",
              value: { id: "part-2", kind: "paragraph", value: "Segunda corrigida." },
              gaps: []
            }
          ]
        }
      };
    }
  };
  const preview = await generateCardAssistanceChangeSet({
    projectDocument: project,
    selection,
    request: {
      operation: "repair",
      repairScope: "resources",
      resourceTargetIds: ["body:part-1", "body:part-2"],
      promptText: "Corrija as duas primeiras partes."
    },
    provider,
    modelId: "fake:model"
  });
  assert.equal(preview.changeSet.card.blocks[0].value, "Primeira corrigida.");
  assert.equal(preview.changeSet.card.blocks[1].value, "Segunda corrigida.");
  assert.deepEqual(preview.changeSet.card.blocks[2], microsequence.cards[0].blocks[2]);
  assert.deepEqual(preview.changeSet.card.afterBlocks, microsequence.cards[0].afterBlocks);
});

test("reparo de afterBlock não altera o recurso principal", async () => {
  const project = projectFixture();
  const card = project.courses[0].modules[0].lessons[0].microsequences[0].cards[0];
  card.afterBlocks = [
    { id: "support-1", kind: "paragraph", value: "Apoio original." }
  ];
  const provider = {
    async generateStructured() {
      return {
        value: {
          replacements: [{
            targetId: "after:support-1",
            value: {
              id: "support-1",
              kind: "paragraph",
              value: "Apoio corrigido."
            },
            gaps: []
          }]
        }
      };
    }
  };
  const preview = await generateCardAssistanceChangeSet({
    projectDocument: project,
    selection,
    request: {
      operation: "repair",
      repairScope: "resources",
      resourceTargetIds: ["after:support-1"],
      promptText: "Corrija apenas o apoio."
    },
    provider,
    modelId: "fake:model"
  });
  assert.equal(preview.changeSet.card.text, "Texto original.");
  assert.equal(preview.changeSet.card.afterBlocks[0].value, "Apoio corrigido.");
});

test("reparo do texto posterior não precisa reconstruir o card", async () => {
  const project = projectFixture();
  const original = structuredClone(
    project.courses[0].modules[0].lessons[0].microsequences[0].cards[0]
  );
  const provider = {
    async generateStructured(request) {
      const branch = request.schema.properties.replacements.items.oneOf[0];
      assert.deepEqual(
        Object.keys(branch.properties.value.properties),
        ["text"]
      );
      return {
        value: {
          replacements: [{
            targetId: "after:text",
            value: { text: "Síntese posterior corrigida." },
            gaps: []
          }]
        }
      };
    }
  };
  const preview = await generateCardAssistanceChangeSet({
    projectDocument: project,
    selection,
    request: {
      operation: "repair",
      repairScope: "resources",
      resourceTargetIds: ["after:text"],
      promptText: "Corrija somente a síntese posterior."
    },
    provider,
    modelId: "fake:model"
  });

  assert.equal(preview.changeSet.card.after, "Síntese posterior corrigida.");
  assert.equal(preview.changeSet.card.text, original.text);
  assert.equal(preview.changeSet.card.title, original.title);
});

test("reparo da resposta choice preserva o recurso visual", async () => {
  const project = projectFixture();
  const microsequence = project.courses[0].modules[0].lessons[0].microsequences[0];
  microsequence.cards[0] = {
    id: "card-a",
    position: 1,
    resource: "code",
    kind: "exercise",
    exercise: "choice",
    title: "Leitura de código",
    prompt: "Leia o trecho.",
    language: "javascript",
    code: "const total = 2 + 2;",
    question: "Qual valor é produzido?",
    selectionMode: "single",
    selectionCriterion: "correct",
    options: [
      { id: "four", text: "4" },
      { id: "five", text: "5" }
    ],
    answerIds: ["four"],
    after: "A soma é determinística."
  };
  const original = structuredClone(microsequence.cards[0]);
  const targets = listCardResourceTargets(microsequence.cards[0]);
  assert.ok(targets.some((target) => target.targetId === "response"));
  const provider = {
    async generateStructured(request) {
      const valueSchema = request.schema.properties.replacements.items
        .oneOf[0].properties.value;
      assert.deepEqual(
        new Set(valueSchema.required),
        new Set(["question", "selectionMode", "selectionCriterion", "options", "answerIds"])
      );
      return {
        value: {
          replacements: [{
            targetId: "response",
            value: {
              question: "Qual é o resultado da expressão?",
              selectionMode: "single",
              selectionCriterion: "correct",
              options: [
                { id: "four", text: "4", feedback: "Resultado correto." },
                { id: "five", text: "5", feedback: "Há uma unidade a mais." }
              ],
              answerIds: ["four"]
            },
            gaps: []
          }]
        }
      };
    }
  };
  const preview = await generateCardAssistanceChangeSet({
    projectDocument: project,
    selection,
    request: {
      operation: "repair",
      repairScope: "resources",
      resourceTargetIds: ["response"],
      promptText: "Torne a pergunta e o feedback mais precisos."
    },
    provider,
    modelId: "fake:model"
  });

  assert.equal(preview.changeSet.card.question, "Qual é o resultado da expressão?");
  assert.equal(preview.changeSet.card.options[0].feedback, "Resultado correto.");
  assert.equal(preview.changeSet.card.code, original.code);
  assert.equal(preview.changeSet.card.after, original.after);
  assert.equal(preview.changeSet.card.title, original.title);
});

test("reparo formal de uma lacuna composta preserva a lacuna não selecionada", async () => {
  const project = projectFixture();
  const microsequence = project.courses[0].modules[0].lessons[0].microsequences[0];
  microsequence.cards[0] = compileAuthoringCardGaps({
    id: "card-a",
    position: 1,
    resource: "composite",
    kind: "exercise",
    exercise: "gap",
    title: "Duas lacunas",
    blocks: [
      { id: "part-1", kind: "paragraph", value: "A = {gap:old-a}." },
      { id: "part-2", kind: "paragraph", value: "B = {gap:old-b}." }
    ],
    after: "Compare.",
    gaps: [
      {
        id: "old-a",
        response: "text",
        answer: "1",
        distractors: [],
        acceptedAnswers: []
      },
      {
        id: "old-b",
        response: "text",
        answer: "2",
        distractors: [],
        acceptedAnswers: []
      }
    ]
  });
  const untouched = structuredClone(microsequence.cards[0].blocks[1]);
  const provider = {
    async generateStructured() {
      return {
        value: {
          replacements: [{
            targetId: "body:part-1",
            value: {
              id: "part-1",
              kind: "paragraph",
              value: "A corrigido = {gap:body-part-1-answer}."
            },
            gaps: [{
              id: "body-part-1-answer",
              response: "text",
              answer: "10",
              distractors: [],
              acceptedAnswers: []
            }]
          }]
        }
      };
    }
  };
  const preview = await generateCardAssistanceChangeSet({
    projectDocument: project,
    selection,
    request: {
      operation: "repair",
      repairScope: "resources",
      resourceTargetIds: ["body:part-1"],
      promptText: "Corrija a primeira lacuna."
    },
    provider,
    modelId: "fake:model"
  });
  assert.match(preview.changeSet.card.blocks[0].value, /\[\[10/u);
  assert.deepEqual(preview.changeSet.card.blocks[1], untouched);
  assert.doesNotMatch(JSON.stringify(preview.changeSet.card), /\{gap:/u);
});

test("reparo principal rejeita campos fora do escopo mínimo", async () => {
  let attempts = 0;
  const provider = {
    async generateStructured() {
      attempts += 1;
      return {
        value: {
          replacements: [{
            targetId: "main",
            value: {
              title: "Título alterado sem autorização",
              text: "Texto corrigido."
            },
            gaps: []
          }]
        }
      };
    }
  };
  await assert.rejects(
    () => generateCardAssistanceChangeSet({
      projectDocument: projectFixture(),
      selection,
      request: {
        operation: "repair",
        repairScope: "resources",
        resourceTargetIds: ["main"],
        promptText: "Corrija o texto."
      },
      provider,
      modelId: "fake:model"
    }),
    /campos fora do alvo reparável/u
  );
  assert.equal(attempts, 2);
});

test("reparo atômico não é bloqueado por violação semântica preexistente fora do alvo", async () => {
  const project = projectFixture();
  const moduleValue = project.courses[0].modules[0];
  const card = moduleValue.lessons[0].microsequences[0].cards[0];
  moduleValue.guide.exclude = ["conteúdo vetado"];
  Object.assign(card, {
    resource: "composite",
    blocks: [{
      id: "legacy",
      kind: "paragraph",
      value: "Conteúdo vetado preexistente."
    }, {
      id: "target",
      kind: "paragraph",
      value: "Trecho a corrigir."
    }]
  });
  delete card.text;
  let attempts = 0;
  const provider = {
    async generateStructured() {
      attempts += 1;
      return {
        value: {
          replacements: [{
            targetId: "body:target",
            value: {
              id: "target",
              kind: "paragraph",
              value: "Trecho corrigido sem regressão."
            },
            gaps: []
          }]
        }
      };
    }
  };

  const preview = await generateCardAssistanceChangeSet({
    projectDocument: project,
    selection,
    request: {
      operation: "repair",
      repairScope: "resources",
      resourceTargetIds: ["body:target"],
      promptText: "Corrija somente o segundo trecho."
    },
    provider,
    modelId: "fake:model"
  });

  assert.equal(attempts, 1);
  assert.equal(preview.changeSet.card.blocks[0].value, "Conteúdo vetado preexistente.");
  assert.equal(preview.changeSet.card.blocks[1].value, "Trecho corrigido sem regressão.");
});

test("reparo atômico rejeita violação semântica nova mesmo quando já existe outra", async () => {
  const project = projectFixture();
  const moduleValue = project.courses[0].modules[0];
  const card = moduleValue.lessons[0].microsequences[0].cards[0];
  moduleValue.guide.exclude = ["conteúdo vetado"];
  Object.assign(card, {
    resource: "composite",
    blocks: [{
      id: "legacy",
      kind: "paragraph",
      value: "Conteúdo vetado preexistente."
    }, {
      id: "target",
      kind: "paragraph",
      value: "Trecho a corrigir."
    }]
  });
  delete card.text;
  let attempts = 0;
  const provider = {
    async generateStructured() {
      attempts += 1;
      return {
        value: {
          replacements: [{
            targetId: "body:target",
            value: {
              id: "target",
              kind: "paragraph",
              value: "Novo conteúdo vetado no alvo."
            },
            gaps: []
          }]
        }
      };
    }
  };

  await assert.rejects(
    () => generateCardAssistanceChangeSet({
      projectDocument: project,
      selection,
      request: {
        operation: "repair",
        repairScope: "resources",
        resourceTargetIds: ["body:target"],
        promptText: "Corrija somente o segundo trecho."
      },
      provider,
      modelId: "fake:model"
    }),
    /conteúdo excluído pelo guide/u
  );
  assert.equal(attempts, 2);
});
