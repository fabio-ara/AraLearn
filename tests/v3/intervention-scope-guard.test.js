import test from "node:test";
import assert from "node:assert/strict";

import {
  assertGranularInterventionResultScope,
  assertGranularInterventionResumeScope,
  assertInterventionResultScope,
  assertInterventionResumeScope,
  buildGranularInterventionScopeSnapshot,
  buildInterventionScopeSnapshot,
  InterventionScopeError
} from "../../src/assist/interventionScopeGuard.js";
import { buildContextPacket } from "../../src/generation/bottomUp/buildContextPacket.js";
import { createFakeProvider } from "../../src/generation/providers/fakeProvider.js";
import { executeMicrosequenceGeneration } from "../../src/generation/runtime/interventionRuntime.js";

function paragraphCard(id, text) {
  return {
    id,
    position: 1,
    resource: "paragraph",
    kind: "theory",
    exercise: "none",
    title: id,
    text,
    after: ""
  };
}

function microsequence(id, status = "planned", cards = []) {
  return {
    id,
    title: id,
    goal: `Objetivo ${id}`,
    role: "explain",
    status,
    dependsOn: id === "micro-b" ? ["micro-a"] : [],
    covers: [id],
    checks: [`Verificar ${id}`],
    cards
  };
}

function projectFixture() {
  const guide = {
    goal: "Ensinar o conteúdo delimitado.",
    include: ["micro-a", "micro-b"],
    exclude: [],
    notation: [],
    avoid: []
  };
  return {
    contract: "aralearn.contract",
    version: 3,
    kind: "project",
    courses: [
      {
        id: "course-a",
        title: "Curso A",
        goal: "Objetivo A",
        modules: [
          {
            id: "module-a",
            title: "Módulo A",
            guide,
            lessons: [
              {
                id: "lesson-a",
                title: "Lição A",
                guide,
                topics: [],
                microsequences: [
                  microsequence("micro-a", "generated", [paragraphCard("card-a", "Base A")]),
                  microsequence("micro-b")
                ]
              }
            ]
          }
        ]
      },
      {
        id: "course-b",
        title: "Curso B",
        goal: "Objetivo B",
        modules: []
      }
    ]
  };
}

const selection = {
  courseKey: "course-a",
  moduleKey: "module-a",
  lessonKey: "lesson-a",
  microsequenceKey: "micro-a"
};

function granularProjectFixture() {
  const project = projectFixture();
  project.courses[0].modules[0].lessons[0].microsequences[0].cards = [
    {
      id: "card-composite",
      position: 1,
      resource: "composite",
      kind: "theory",
      exercise: "none",
      title: "Card composto",
      blocks: [
        { kind: "paragraph", value: "Primeiro bloco." },
        { kind: "code", prompt: "Observe.", language: "text", code: "segundo" },
        { kind: "paragraph", value: "Terceiro bloco." }
      ],
      after: "Fechamento."
    },
    {
      ...paragraphCard("card-neighbor", "Card vizinho."),
      position: 2
    }
  ];
  return project;
}

function granularSnapshot(project, target = {
  level: "blocks",
  cardKey: "card-composite",
  blockIndexes: [0]
}) {
  return buildGranularInterventionScopeSnapshot(project, selection, target);
}

function expectGranularScopeError(callback, code = "OUT_OF_SCOPE_CHANGE") {
  assert.throws(callback, (error) =>
    error instanceof InterventionScopeError && error.code === code
  );
}

test("guarda aceita somente cards e status da microssequência autorizada", () => {
  const previous = projectFixture();
  const next = structuredClone(previous);
  next.courses[0].modules[0].lessons[0].microsequences[0].status = "generated";
  next.courses[0].modules[0].lessons[0].microsequences[0].cards = [
    paragraphCard("card-a", "Base A corrigida")
  ];

  assert.deepEqual(assertInterventionResultScope({
    previousProjectDocument: previous,
    nextProjectDocument: next,
    selection,
    targetMicrosequenceKey: "micro-a",
    targetMode: "current",
    actionIntent: "generate_current"
  }), {
    mode: "existing",
    targetMicrosequenceKey: "micro-a"
  });
});

test("guarda rejeita alteração lateral produzida junto com a resposta", () => {
  const previous = projectFixture();
  const next = structuredClone(previous);
  next.courses[0].modules[0].lessons[0].microsequences[0].cards[0].text = "Base corrigida";
  next.courses[1].title = "Curso B alterado";

  assert.throws(() => assertInterventionResultScope({
    previousProjectDocument: previous,
    nextProjectDocument: next,
    selection,
    targetMicrosequenceKey: "micro-a",
    targetMode: "current",
    actionIntent: "generate_current"
  }), (error) => error instanceof InterventionScopeError && error.code === "OUT_OF_SCOPE_CHANGE");
});

test("próxima etapa pode alterar somente a microssequência planejada indicada no resultado", () => {
  const previous = projectFixture();
  const next = structuredClone(previous);
  next.courses[0].modules[0].lessons[0].microsequences[1].status = "generated";
  next.courses[0].modules[0].lessons[0].microsequences[1].cards = [
    paragraphCard("card-b", "Base B")
  ];

  assert.equal(assertInterventionResultScope({
    previousProjectDocument: previous,
    nextProjectDocument: next,
    selection,
    targetMicrosequenceKey: "micro-b",
    targetMode: "current",
    actionIntent: "next_planned"
  }).targetMicrosequenceKey, "micro-b");
});

test("próxima etapa não pode saltar uma microssequência da trilha", () => {
  const previous = projectFixture();
  previous.courses[0].modules[0].lessons[0].microsequences.push(microsequence("micro-c"));
  const next = structuredClone(previous);
  next.courses[0].modules[0].lessons[0].microsequences[2].status = "generated";
  next.courses[0].modules[0].lessons[0].microsequences[2].cards = [
    paragraphCard("card-c", "Base C")
  ];

  assert.throws(() => assertInterventionResultScope({
    previousProjectDocument: previous,
    nextProjectDocument: next,
    selection,
    targetMicrosequenceKey: "micro-c",
    targetMode: "current",
    actionIntent: "next_planned"
  }), (error) => error instanceof InterventionScopeError && error.code === "INVALID_TARGET");
});

test("ramificação aceita uma única etapa adjacente sem reescrever o restante", () => {
  const previous = projectFixture();
  const next = structuredClone(previous);
  next.courses[0].modules[0].lessons[0].microsequences.splice(1, 0, {
    ...microsequence("micro-support", "generated", [paragraphCard("card-support", "Apoio")]),
    branchOf: "micro-a",
    dependsOn: ["micro-a"]
  });

  assert.equal(assertInterventionResultScope({
    previousProjectDocument: previous,
    nextProjectDocument: next,
    selection,
    targetMicrosequenceKey: "micro-support",
    targetMode: "new_after_current",
    actionIntent: "branch_after_current"
  }).mode, "branch");
});

test("retomada é bloqueada quando o contexto didático mudou", () => {
  const previous = projectFixture();
  const snapshot = buildInterventionScopeSnapshot(previous, selection);
  const changed = structuredClone(previous);
  changed.courses[0].modules[0].lessons[0].guide.goal = "Outro objetivo";

  assert.throws(() => assertInterventionResumeScope({
    savedSnapshot: snapshot,
    projectDocument: changed,
    selection
  }), (error) => error instanceof InterventionScopeError && error.code === "STALE_INTERVENTION_SCOPE");
});

test("runtime não reaproveita artefatos nem chama o provider após mudança de contexto", async () => {
  let providerCalls = 0;
  const provider = createFakeProvider({
    script: {
      bottom_up_micro_plan: () => {
        providerCalls += 1;
        throw new Error("Falha transitória simulada.");
      }
    }
  });
  const draft = {
    actionIntent: "generate_current",
    interventionTargetMode: "current",
    operationMode: "reinforce",
    promptText: "Explique novamente a base."
  };
  const common = {
    selection,
    draft,
    assistConfig: { model: "fake:model" },
    selectedRefIds: [],
    preferredContainerId: "",
    preferredContainerLabel: "",
    lessonContext: {
      currentMicrosequenceTitle: "micro-a",
      microsequenceKeys: ["micro-a", "micro-b"],
      reusableMicrosequenceCount: 2
    },
    provider,
    ingestAttachments: async () => ({
      attachments: [],
      warnings: [],
      extractedCount: 0
    })
  };
  const first = await executeMicrosequenceGeneration({
    ...common,
    projectDocument: projectFixture()
  });
  assert.equal(first.status, "error");
  assert.equal(providerCalls, 1);

  const changed = projectFixture();
  changed.courses[0].modules[0].lessons[0].guide.goal = "Contexto atualizado";
  const resumed = await executeMicrosequenceGeneration({
    ...common,
    projectDocument: changed,
    resumeSession: first.interventionFeedback
  });

  assert.equal(resumed.status, "stale");
  assert.equal(resumed.interventionFeedback.status, "stale");
  assert.equal(resumed.interventionFeedback.continuationNeeded, false);
  assert.equal(providerCalls, 1);
});

test("contexto rejeita referência silenciosamente inexistente ou autorreferência", () => {
  const project = projectFixture();
  assert.throws(() => buildContextPacket(project, selection, {
    selectedRefIds: ["micro-fantasma"]
  }), /referências inválidas/u);
  assert.throws(() => buildContextPacket(project, selection, {
    selectedRefIds: ["micro-a"]
  }), /referências inválidas/u);
});

test("snapshot granular registra card, índices e identidades dos blocos em ordem canônica", () => {
  const project = granularProjectFixture();
  const snapshot = granularSnapshot(project, {
    level: "blocks",
    cardKey: "card-composite",
    blockIndexes: [2, 0]
  });

  assert.deepEqual(snapshot.target, {
    level: "blocks",
    cardKey: "card-composite",
    cardIndex: 0,
    blocks: [
      { blockIndex: 0, blockIdentity: "content:0" },
      { blockIndex: 2, blockIdentity: "content:2" }
    ]
  });
  assert.equal(typeof snapshot.contextFingerprint, "string");
  assert.notEqual(snapshot.contextFingerprint, "");
  assert.deepEqual(snapshot, granularSnapshot(project, {
    level: "blocks",
    cardKey: "card-composite",
    blockIndexes: [0, 2]
  }));
});

test("seleção granular rejeita lista vazia, repetição, card ausente e bloco inexistente", async (context) => {
  const project = granularProjectFixture();
  const cases = [
    {
      name: "lista vazia",
      target: { level: "blocks", cardKey: "card-composite", blockIndexes: [] }
    },
    {
      name: "índice repetido",
      target: { level: "blocks", cardKey: "card-composite", blockIndexes: [1, 1] }
    },
    {
      name: "card ausente",
      target: { level: "blocks", cardKey: "card-absent", blockIndexes: [0] }
    },
    {
      name: "bloco ausente",
      target: { level: "blocks", cardKey: "card-composite", blockIndexes: [9] }
    }
  ];
  for (const entry of cases) {
    await context.test(entry.name, () => {
      expectGranularScopeError(
        () => buildGranularInterventionScopeSnapshot(project, selection, entry.target),
        "INVALID_GRANULAR_SELECTION"
      );
    });
  }
});

test("seleção granular rejeita identidades repetidas de card ou bloco", async (context) => {
  await context.test("card duplicado", () => {
    const project = granularProjectFixture();
    const duplicate = structuredClone(
      project.courses[0].modules[0].lessons[0].microsequences[0].cards[0]
    );
    duplicate.position = 3;
    project.courses[0].modules[0].lessons[0].microsequences[0].cards.push(duplicate);
    expectGranularScopeError(() => granularSnapshot(project), "INVALID_GRANULAR_SELECTION");
  });
  await context.test("bloco duplicado", () => {
    const project = granularProjectFixture();
    const blocks = project.courses[0].modules[0].lessons[0].microsequences[0].cards[0].blocks;
    blocks[0].id = "block-repeated";
    blocks[1].id = "block-repeated";
    expectGranularScopeError(() => granularSnapshot(project), "INVALID_GRANULAR_SELECTION");
  });
});

test("retomada granular detecta contexto obsoleto antes de aceitar resultado", () => {
  const previous = granularProjectFixture();
  const snapshot = granularSnapshot(previous);
  const changed = structuredClone(previous);
  changed.courses[0].modules[0].lessons[0].microsequences[0].cards[0].blocks[0].value =
    "Conteúdo alterado enquanto o pedido estava em andamento.";

  expectGranularScopeError(() => assertGranularInterventionResumeScope({
    savedSnapshot: snapshot,
    projectDocument: changed,
    selection
  }), "STALE_INTERVENTION_SCOPE");
  expectGranularScopeError(() => assertGranularInterventionResultScope({
    previousProjectDocument: changed,
    nextProjectDocument: structuredClone(changed),
    selection,
    scopeSnapshot: snapshot
  }), "STALE_INTERVENTION_SCOPE");
});

test("intervenção em um bloco aceita somente a alteração do bloco selecionado", () => {
  const previous = granularProjectFixture();
  const next = structuredClone(previous);
  next.courses[0].modules[0].lessons[0].microsequences[0].cards[0].blocks[0].value =
    "Primeiro bloco corrigido.";

  assert.deepEqual(assertGranularInterventionResultScope({
    previousProjectDocument: previous,
    nextProjectDocument: next,
    selection,
    scopeSnapshot: granularSnapshot(previous)
  }), {
    mode: "granular",
    level: "blocks",
    targetMicrosequenceKey: "micro-a",
    cardKey: "card-composite",
    blockIndexes: [0]
  });
});

test("intervenção em bloco rejeita alteração de bloco vizinho", () => {
  const previous = granularProjectFixture();
  const next = structuredClone(previous);
  next.courses[0].modules[0].lessons[0].microsequences[0].cards[0].blocks[1].code = "alterado";

  expectGranularScopeError(() => assertGranularInterventionResultScope({
    previousProjectDocument: previous,
    nextProjectDocument: next,
    selection,
    scopeSnapshot: granularSnapshot(previous)
  }));
});

test("intervenção em bloco rejeita título ou metadados do card", () => {
  const previous = granularProjectFixture();
  const next = structuredClone(previous);
  const card = next.courses[0].modules[0].lessons[0].microsequences[0].cards[0];
  card.title = "Título lateral";
  card.after = "Metadado lateral.";

  expectGranularScopeError(() => assertGranularInterventionResultScope({
    previousProjectDocument: previous,
    nextProjectDocument: next,
    selection,
    scopeSnapshot: granularSnapshot(previous)
  }));
});

test("intervenção granular rejeita alteração em outro card", () => {
  const previous = granularProjectFixture();
  const next = structuredClone(previous);
  next.courses[0].modules[0].lessons[0].microsequences[0].cards[1].text = "Vizinho alterado.";

  expectGranularScopeError(() => assertGranularInterventionResultScope({
    previousProjectDocument: previous,
    nextProjectDocument: next,
    selection,
    scopeSnapshot: granularSnapshot(previous)
  }));
});

test("intervenção em blocos rejeita reordenação, troca de tipo e exclusão", async (context) => {
  const previous = granularProjectFixture();
  const snapshot = granularSnapshot(previous, {
    level: "blocks",
    cardKey: "card-composite",
    blockIndexes: [0, 1]
  });
  await context.test("reordenação", () => {
    const next = structuredClone(previous);
    const blocks = next.courses[0].modules[0].lessons[0].microsequences[0].cards[0].blocks;
    [blocks[0], blocks[1]] = [blocks[1], blocks[0]];
    expectGranularScopeError(() => assertGranularInterventionResultScope({
      previousProjectDocument: previous,
      nextProjectDocument: next,
      selection,
      scopeSnapshot: snapshot
    }));
  });
  await context.test("troca de tipo", () => {
    const next = structuredClone(previous);
    next.courses[0].modules[0].lessons[0].microsequences[0].cards[0].blocks[0] = {
      kind: "heading",
      value: "Outro tipo"
    };
    expectGranularScopeError(() => assertGranularInterventionResultScope({
      previousProjectDocument: previous,
      nextProjectDocument: next,
      selection,
      scopeSnapshot: snapshot
    }));
  });
  await context.test("exclusão", () => {
    const next = structuredClone(previous);
    next.courses[0].modules[0].lessons[0].microsequences[0].cards[0].blocks.splice(0, 1);
    expectGranularScopeError(() => assertGranularInterventionResultScope({
      previousProjectDocument: previous,
      nextProjectDocument: next,
      selection,
      scopeSnapshot: snapshot
    }));
  });
});

test("intervenção granular rejeita inserção ou remoção fora do escopo", async (context) => {
  const previous = granularProjectFixture();
  const snapshot = granularSnapshot(previous);
  await context.test("inserção de bloco", () => {
    const next = structuredClone(previous);
    next.courses[0].modules[0].lessons[0].microsequences[0].cards[0].blocks.push({
      kind: "paragraph",
      value: "Bloco novo."
    });
    expectGranularScopeError(() => assertGranularInterventionResultScope({
      previousProjectDocument: previous,
      nextProjectDocument: next,
      selection,
      scopeSnapshot: snapshot
    }));
  });
  await context.test("inserção de card", () => {
    const next = structuredClone(previous);
    next.courses[0].modules[0].lessons[0].microsequences[0].cards.push({
      ...paragraphCard("card-new", "Card novo."),
      position: 3
    });
    expectGranularScopeError(() => assertGranularInterventionResultScope({
      previousProjectDocument: previous,
      nextProjectDocument: next,
      selection,
      scopeSnapshot: snapshot
    }));
  });
  await context.test("remoção de outro card", () => {
    const next = structuredClone(previous);
    next.courses[0].modules[0].lessons[0].microsequences[0].cards.splice(1, 1);
    expectGranularScopeError(() => assertGranularInterventionResultScope({
      previousProjectDocument: previous,
      nextProjectDocument: next,
      selection,
      scopeSnapshot: snapshot
    }));
  });
});

test("intervenção granular rejeita campos obrigatórios omitidos", async (context) => {
  const previous = granularProjectFixture();
  await context.test("campo do bloco selecionado", () => {
    const next = structuredClone(previous);
    delete next.courses[0].modules[0].lessons[0].microsequences[0].cards[0].blocks[1].code;
    expectGranularScopeError(() => assertGranularInterventionResultScope({
      previousProjectDocument: previous,
      nextProjectDocument: next,
      selection,
      scopeSnapshot: granularSnapshot(previous, {
        level: "blocks",
        cardKey: "card-composite",
        blockIndexes: [1]
      })
    }), "INVALID_GRANULAR_RESULT");
  });
  await context.test("campo do card inteiro", () => {
    const next = structuredClone(previous);
    delete next.courses[0].modules[0].lessons[0].microsequences[0].cards[0].title;
    expectGranularScopeError(() => assertGranularInterventionResultScope({
      previousProjectDocument: previous,
      nextProjectDocument: next,
      selection,
      scopeSnapshot: granularSnapshot(previous, {
        level: "card",
        cardKey: "card-composite"
      })
    }), "INVALID_GRANULAR_RESULT");
  });
  await context.test("campo fora do bloco selecionado", () => {
    const next = structuredClone(previous);
    delete next.courses[0].modules[0].lessons[0].microsequences[0].cards[0].after;
    expectGranularScopeError(() => assertGranularInterventionResultScope({
      previousProjectDocument: previous,
      nextProjectDocument: next,
      selection,
      scopeSnapshot: granularSnapshot(previous)
    }));
  });
});

test("intervenção em múltiplos blocos aceita os selecionados e preserva os demais", () => {
  const previous = granularProjectFixture();
  const next = structuredClone(previous);
  const blocks = next.courses[0].modules[0].lessons[0].microsequences[0].cards[0].blocks;
  blocks[0].value = "Primeiro selecionado.";
  blocks[2].value = "Terceiro selecionado.";
  const result = assertGranularInterventionResultScope({
    previousProjectDocument: previous,
    nextProjectDocument: next,
    selection,
    scopeSnapshot: granularSnapshot(previous, {
      level: "blocks",
      cardKey: "card-composite",
      blockIndexes: [0, 2]
    })
  });

  assert.deepEqual(result.blockIndexes, [0, 2]);
  assert.deepEqual(blocks[1], previous.courses[0].modules[0].lessons[0]
    .microsequences[0].cards[0].blocks[1]);
});

test("intervenção no card inteiro permite conteúdo e metadados, mas preserva identidade e ordem", () => {
  const previous = granularProjectFixture();
  const next = structuredClone(previous);
  const card = next.courses[0].modules[0].lessons[0].microsequences[0].cards[0];
  card.title = "Card inteiramente revisto";
  card.blocks = [{ kind: "paragraph", value: "Nova composição." }];
  card.after = "Novo fechamento.";
  const snapshot = granularSnapshot(previous, {
    level: "card",
    cardKey: "card-composite"
  });

  assert.equal(assertGranularInterventionResultScope({
    previousProjectDocument: previous,
    nextProjectDocument: next,
    selection,
    scopeSnapshot: snapshot
  }).level, "card");

  const changedIdentity = structuredClone(next);
  changedIdentity.courses[0].modules[0].lessons[0].microsequences[0].cards[0].id = "outro-card";
  expectGranularScopeError(() => assertGranularInterventionResultScope({
    previousProjectDocument: previous,
    nextProjectDocument: changedIdentity,
    selection,
    scopeSnapshot: snapshot
  }));
});

test("guarda granular não enfraquece a substituição existente de microssequência", () => {
  const previous = projectFixture();
  const next = structuredClone(previous);
  next.courses[0].modules[0].lessons[0].microsequences[0].status = "generated";
  next.courses[0].modules[0].lessons[0].microsequences[0].cards = [
    paragraphCard("card-a", "Microssequência existente reconstruída.")
  ];

  assert.equal(assertInterventionResultScope({
    previousProjectDocument: previous,
    nextProjectDocument: next,
    selection,
    targetMicrosequenceKey: "micro-a",
    targetMode: "current",
    actionIntent: "generate_current"
  }).mode, "existing");
});
