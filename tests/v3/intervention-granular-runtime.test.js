import test from "node:test";
import assert from "node:assert/strict";

import { createFakeProvider } from "../../src/generation/providers/fakeProvider.js";
import { executeMicrosequenceGeneration } from "../../src/generation/runtime/interventionRuntime.js";

const selection = {
  courseKey: "course-a",
  moduleKey: "module-a",
  lessonKey: "lesson-a",
  microsequenceKey: "micro-a"
};

function guide(goal) {
  return {
    goal,
    include: ["Conjunção"],
    exclude: [],
    notation: ["P ∧ Q"],
    avoid: []
  };
}

function compositeCard() {
  return {
    id: "card-composite",
    position: 1,
    resource: "composite",
    kind: "theory",
    exercise: "none",
    title: "Conjunção",
    blocks: [
      { kind: "paragraph", value: "A conjunção exige duas proposições verdadeiras." },
      { kind: "code", prompt: "Observe a notação.", language: "text", code: "P ∧ Q" },
      { kind: "paragraph", value: "Apenas V e V produz V." }
    ],
    after: "Use a regra na prática seguinte."
  };
}

function paragraphCard() {
  return {
    id: "card-neighbor",
    position: 2,
    resource: "paragraph",
    kind: "theory",
    exercise: "none",
    title: "Card vizinho",
    text: "Conteúdo que não pertence ao pedido granular.",
    after: ""
  };
}

function projectFixture() {
  return {
    contract: "aralearn.contract",
    version: 3,
    kind: "project",
    courses: [
      {
        id: "course-a",
        title: "Lógica",
        goal: "Compreender operadores lógicos.",
        modules: [
          {
            id: "module-a",
            title: "Operadores",
            guide: guide("Compreender operadores."),
            lessons: [
              {
                id: "lesson-a",
                title: "Conjunção",
                guide: guide("Aplicar a conjunção."),
                topics: [],
                microsequences: [
                  {
                    id: "micro-a",
                    title: "Regra",
                    goal: "Reconhecer o caso verdadeiro.",
                    role: "explain",
                    status: "generated",
                    dependsOn: [],
                    covers: ["Conjunção"],
                    checks: ["Identificar V e V"],
                    cards: [compositeCard(), paragraphCard()]
                  }
                ]
              }
            ]
          }
        ]
      }
    ]
  };
}

function common(provider, projectDocument = projectFixture()) {
  return {
    selection,
    draft: {
      actionIntent: "generate_current",
      interventionTargetMode: "current",
      operationMode: "repair",
      promptText: "Corrija a explicação sem ampliar o escopo.",
      attachments: []
    },
    assistConfig: { model: "fake:model" },
    projectDocument,
    provider,
    lessonContext: {
      currentMicrosequenceTitle: "Regra",
      microsequenceKeys: ["micro-a"],
      reusableMicrosequenceCount: 1
    },
    ingestAttachments: async () => ({
      attachments: [],
      warnings: [],
      extractedCount: 0
    })
  };
}

test("runtime granular atualiza um card inteiro sem enviar a árvore ou o card vizinho", async () => {
  let providerRequest;
  const replacement = compositeCard();
  replacement.title = "Conjunção revista";
  replacement.blocks[0].value = "P ∧ Q só é verdadeira quando P e Q são verdadeiras.";
  const provider = createFakeProvider({
    script: {
      bottom_up_granular_intervention: (request) => {
        providerRequest = request;
        return { text: JSON.stringify({ card: replacement }), usage: {} };
      }
    }
  });

  const result = await executeMicrosequenceGeneration({
    ...common(provider),
    granularTarget: { level: "card", cardKey: "card-composite" }
  });

  assert.equal(result.status, "success");
  assert.equal(result.generationResult.patch.kind, "update-card");
  assert.equal(result.generationResult.patch.guardedScope.level, "card");
  const cards = result.generationResult.projectDocument.courses[0].modules[0]
    .lessons[0].microsequences[0].cards;
  assert.equal(cards[0].title, "Conjunção revista");
  assert.deepEqual(cards[1], paragraphCard());
  assert.equal(providerRequest.engineContext.target.level, "card");
  assert.equal(providerRequest.engineContext.target.resourceType, "composite");
  assert.equal(providerRequest.prompt.includes("Conteúdo que não pertence ao pedido granular"), false);
  assert.equal(providerRequest.prompt.includes('"courses"'), false);
});

test("runtime granular atualiza um ou vários blocos e devolve patch restrito", async () => {
  let requestContext;
  const provider = createFakeProvider({
    script: {
      bottom_up_granular_intervention: (request) => {
        requestContext = request.engineContext;
        return {
          text: JSON.stringify({
            blocks: [
              {
                blockIndex: 2,
                block: { kind: "paragraph", value: "Somente V e V produz V." }
              },
              {
                blockIndex: 0,
                block: {
                  kind: "paragraph",
                  value: "A conjunção é verdadeira somente quando as duas proposições são verdadeiras."
                }
              }
            ]
          }),
          usage: {}
        };
      }
    }
  });

  const result = await executeMicrosequenceGeneration({
    ...common(provider),
    draft: {
      ...common(provider).draft,
      granularTarget: {
        level: "blocks",
        cardKey: "card-composite",
        blockIndexes: [0, 2]
      }
    }
  });

  assert.equal(result.status, "success");
  assert.equal(result.generationResult.patch.kind, "update-card-blocks");
  assert.deepEqual(result.generationResult.patch.target.blockIndexes, [0, 2]);
  const card = result.generationResult.projectDocument.courses[0].modules[0]
    .lessons[0].microsequences[0].cards[0];
  assert.equal(card.blocks[0].value.startsWith("A conjunção é verdadeira"), true);
  assert.deepEqual(card.blocks[1], compositeCard().blocks[1]);
  assert.equal(card.blocks[2].value, "Somente V e V produz V.");
  assert.deepEqual(
    requestContext.target.selectedBlocks.map(({ blockIndex }) => blockIndex),
    [0, 2]
  );
  assert.deepEqual(
    requestContext.target.selectedBlocks.map(({ blockKind }) => blockKind),
    ["paragraph", "paragraph"]
  );
  assert.deepEqual(
    requestContext.target.readOnlyBlocks.map(({ blockIndex, blockKind }) => ({
      blockIndex,
      blockKind
    })),
    [{ blockIndex: 1, blockKind: "code" }]
  );
  assert.equal(Object.hasOwn(requestContext.target, "readOnlyCard"), false);
});

test("runtime bloqueia retorno que tenta alcançar bloco não selecionado", async () => {
  const provider = createFakeProvider({
    script: {
      bottom_up_granular_intervention: {
        text: JSON.stringify({
          blocks: [{
            blockIndex: 1,
            block: { kind: "code", prompt: "Alterado.", language: "text", code: "P ∨ Q" }
          }]
        })
      }
    }
  });
  const original = projectFixture();
  const result = await executeMicrosequenceGeneration({
    ...common(provider, original),
    granularTarget: {
      level: "blocks",
      cardKey: "card-composite",
      blockIndexes: [0]
    }
  });

  assert.equal(result.status, "scope-error");
  assert.match(result.errorMessage, /fora da seleção/u);
  assert.deepEqual(original, projectFixture());
});

test("runtime bloqueia troca do tipo canônico do recurso selecionado", async () => {
  const provider = createFakeProvider({
    script: {
      bottom_up_granular_intervention: {
        text: JSON.stringify({
          blocks: [{
            blockIndex: 0,
            block: {
              kind: "code",
              prompt: "Tipo substituído.",
              language: "text",
              code: "conteúdo"
            }
          }]
        })
      }
    }
  });
  const original = projectFixture();
  const result = await executeMicrosequenceGeneration({
    ...common(provider, original),
    granularTarget: {
      level: "blocks",
      cardKey: "card-composite",
      blockIndexes: [0]
    }
  });

  assert.equal(result.status, "scope-error");
  assert.match(result.errorMessage, /tipo de um recurso selecionado/u);
  assert.deepEqual(original, projectFixture());
});

test("retomada granular obsoleta não chama novamente o provider", async () => {
  let providerCalls = 0;
  const provider = createFakeProvider({
    script: {
      bottom_up_granular_intervention: () => {
        providerCalls += 1;
        throw new Error("Falha transitória simulada.");
      }
    }
  });
  const target = {
    level: "blocks",
    cardKey: "card-composite",
    blockIndexes: [0]
  };
  const first = await executeMicrosequenceGeneration({
    ...common(provider),
    granularTarget: target
  });
  assert.equal(first.status, "error");
  assert.equal(providerCalls, 1);

  const changed = projectFixture();
  changed.courses[0].modules[0].lessons[0].microsequences[0]
    .cards[0].blocks[0].value = "Conteúdo alterado em outro fluxo.";
  const resumed = await executeMicrosequenceGeneration({
    ...common(provider, changed),
    granularTarget: target,
    resumeSession: first.interventionFeedback
  });

  assert.equal(resumed.status, "stale");
  assert.equal(resumed.interventionFeedback.status, "stale");
  assert.equal(providerCalls, 1);
});

test("falha transitória preserva o escopo e a retomada aplica a mesma seleção", async () => {
  let providerCalls = 0;
  const provider = createFakeProvider({
    script: {
      bottom_up_granular_intervention: [
        () => {
          providerCalls += 1;
          throw new Error("Timeout transitório.");
        },
        () => {
          providerCalls += 1;
          return {
            text: JSON.stringify({
              blocks: [{
                blockIndex: 0,
                block: { kind: "paragraph", value: "Explicação recuperada após a retomada." }
              }]
            })
          };
        }
      ]
    }
  });
  const target = {
    level: "blocks",
    cardKey: "card-composite",
    blockIndexes: [0]
  };
  const first = await executeMicrosequenceGeneration({
    ...common(provider),
    granularTarget: target
  });
  assert.equal(first.status, "error");
  assert.equal(first.interventionFeedback.run.resumeFrom, "generate");

  const resumed = await executeMicrosequenceGeneration({
    ...common(provider),
    granularTarget: target,
    resumeSession: first.interventionFeedback
  });

  assert.equal(resumed.status, "success");
  assert.equal(providerCalls, 2);
  assert.equal(
    resumed.generationResult.projectDocument.courses[0].modules[0].lessons[0]
      .microsequences[0].cards[0].blocks[0].value,
    "Explicação recuperada após a retomada."
  );
  assert.deepEqual(resumed.generationResult.patch.target.blockIndexes, [0]);
});

test("retomada não pode trocar silenciosamente o destino granular", async () => {
  const provider = createFakeProvider({
    script: {
      bottom_up_granular_intervention: () => {
        throw new Error("Falha transitória.");
      }
    }
  });
  const first = await executeMicrosequenceGeneration({
    ...common(provider),
    granularTarget: {
      level: "blocks",
      cardKey: "card-composite",
      blockIndexes: [0]
    }
  });
  const resumed = await executeMicrosequenceGeneration({
    ...common(provider),
    granularTarget: {
      level: "blocks",
      cardKey: "card-composite",
      blockIndexes: [2]
    },
    resumeSession: first.interventionFeedback
  });

  assert.equal(resumed.status, "stale");
  assert.match(resumed.errorMessage, /não corresponde/u);
});

test("escopo granular não pode ser combinado com ramificação ou próxima etapa", async () => {
  let providerCalls = 0;
  const provider = createFakeProvider({
    script: {
      bottom_up_granular_intervention: () => {
        providerCalls += 1;
        return { text: "{}" };
      }
    }
  });
  const result = await executeMicrosequenceGeneration({
    ...common(provider),
    draft: {
      ...common(provider).draft,
      actionIntent: "branch_after_current",
      interventionTargetMode: "new_after_current"
    },
    granularTarget: { level: "card", cardKey: "card-composite" }
  });

  assert.equal(result.status, "scope-error");
  assert.match(result.errorMessage, /card atual/u);
  assert.equal(providerCalls, 0);
});
