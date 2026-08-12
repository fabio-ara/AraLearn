import test from "node:test";
import assert from "node:assert/strict";

import {
  applyCardAssistanceBatchChangeSet,
  applyCardAssistanceChangeSet,
  buildCardAssistanceScopeSnapshot,
  listCardAssistanceTextPaths,
  listCardResourceTargets,
  projectCardAssistanceTextChange,
  rebaseCardAssistanceTextChange
} from "../../src/assist/cardAssistanceScope.js";
import { compileAuthoringCardGaps } from "../../src/core/authoringGaps.js";
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

test("reparo do card inteiro rejeita troca de representação mesmo preservando identidade", async () => {
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
    }),
    (error) => error?.code === "OUT_OF_SCOPE_CARD_ASSISTANCE_CHANGE"
  );

});

test("reparo textual do card edita enunciado, opções e feedback sem mudar resposta", async () => {
  const project = projectFixture();
  const microsequence = selectedMicrosequence(project);
  microsequence.cards[0] = {
    id: "card-a",
    position: 1,
    resource: "choice",
    kind: "exercise",
    exercise: "choice",
    title: "Operadores",
    question: "Qual opção atribui um valor?",
    selectionMode: "single",
    selectionCriterion: "correct",
    options: [
      { id: "assign", text: "Use =." },
      {
        id: "compare",
        kind: "code",
        language: "javascript",
        code: "valor === 1"
      }
    ],
    answerIds: ["assign"],
    after: "Compare os operadores."
  };
  const before = structuredClone(microsequence.cards[0]);
  const changed = structuredClone(before);
  changed.title = "Atribuição e comparação";
  changed.question = "Qual alternativa realiza atribuição?";
  changed.options[0].text = "O operador = atribui um valor.";
  changed.options[0].feedback = "Correto: há apenas um sinal.";
  changed.options[1].code = "valor == 1";
  changed.options[1].feedback = "Essa expressão compara valores.";
  changed.after = "Observe a finalidade de cada operador.";
  const snapshot = await buildCardAssistanceScopeSnapshot(project, selection, {
    operation: "repair",
    repairScope: "card"
  });

  const result = await applyCardAssistanceChangeSet({
    projectDocument: project,
    selection,
    snapshot,
    changeSet: repairChange(changed)
  });
  const card = selectedMicrosequence(result.projectDocument).cards[0];
  assert.equal(card.question, changed.question);
  assert.equal(card.options[0].feedback, changed.options[0].feedback);
  assert.equal(card.options[1].code, changed.options[1].code);
  assert.deepEqual(card.answerIds, before.answerIds);
  assert.equal(card.selectionMode, before.selectionMode);
  assert.deepEqual(card.options.map((option) => option.id), ["assign", "compare"]);
});

test("projeção do provider não materializa defaults nem outra estrutura", () => {
  const before = {
    id: "card-a",
    position: 1,
    resource: "choice",
    kind: "exercise",
    exercise: "choice",
    title: "Operadores",
    question: "Qual opção atribui um valor?",
    selectionMode: "single",
    selectionCriterion: "correct",
    options: [
      { id: "assign", text: "Use =." },
      { id: "compare", text: "Use ==." }
    ],
    answerIds: ["assign"],
    after: ""
  };
  const normalizedProposal = {
    ...structuredClone(before),
    title: "Operadores revisados",
    options: [
      { id: "assign", kind: "text", text: "O operador = atribui.", feedback: "Correto." },
      { id: "compare", kind: "text", text: "O operador == compara." }
    ]
  };
  const projected = projectCardAssistanceTextChange(before, normalizedProposal, {
    repairScope: "card"
  });

  assert.equal(projected.title, "Operadores revisados");
  assert.equal(projected.options[0].feedback, "Correto.");
  assert.equal(Object.hasOwn(projected.options[0], "kind"), false);
  assert.deepEqual(projected.answerIds, ["assign"]);
});

test("projeção textual permite remover feedback opcional existente", () => {
  const before = {
    id: "card-a",
    position: 1,
    resource: "choice",
    kind: "exercise",
    exercise: "choice",
    title: "Operadores",
    question: "Qual opção atribui um valor?",
    selectionMode: "single",
    selectionCriterion: "correct",
    options: [
      { id: "assign", text: "Use =.", feedback: "Correto." },
      { id: "compare", text: "Use ==." }
    ],
    answerIds: ["assign"],
    after: "Compare os operadores."
  };
  const proposal = structuredClone(before);
  delete proposal.options[0].feedback;

  const projected = projectCardAssistanceTextChange(before, proposal, {
    repairScope: "card"
  });

  assert.equal(Object.hasOwn(projected.options[0], "feedback"), false);
  assert.deepEqual(projected.answerIds, ["assign"]);
});

test("rebase textual combina folhas disjuntas sem clobber remoto", () => {
  const baseCard = {
    id: "card-a",
    position: 1,
    resource: "choice",
    kind: "exercise",
    exercise: "choice",
    title: "Operadores",
    question: "Qual opção atribui um valor?",
    selectionMode: "single",
    selectionCriterion: "correct",
    options: [
      { id: "assign", text: "Use =." },
      { id: "compare", text: "Use ==." }
    ],
    answerIds: ["assign"],
    after: ""
  };
  const localCard = structuredClone(baseCard);
  localCard.question = "Qual alternativa realiza atribuição?";
  const remoteCard = structuredClone(baseCard);
  remoteCard.options[0].feedback = "Correto.";

  const rebased = rebaseCardAssistanceTextChange({
    baseCard,
    localCard,
    remoteCard
  });
  assert.equal(rebased.card.question, localCard.question);
  assert.equal(rebased.card.options[0].feedback, "Correto.");
  assert.deepEqual(rebased.appliedPaths, ["question"]);
  assert.deepEqual(rebased.convergedPaths, []);
  assert.deepEqual(rebased.card.answerIds, ["assign"]);
});

test("rebase textual sinaliza mesma folha e drift estrutural sem sobrescrever", () => {
  const baseCard = paragraphCard("card-a", 1, "Texto base.");
  const localCard = { ...baseCard, text: "Texto local." };
  const remoteCard = { ...baseCard, text: "Texto remoto." };
  assert.throws(
    () => rebaseCardAssistanceTextChange({ baseCard, localCard, remoteCard }),
    (error) =>
      error?.code === "CARD_ASSISTANCE_TEXT_CONFLICT" &&
      error?.paths?.includes("text")
  );

  const localWins = rebaseCardAssistanceTextChange({
    baseCard,
    localCard,
    remoteCard: { ...remoteCard, after: "Síntese remota." },
    conflictPolicy: "local"
  });
  assert.equal(localWins.card.text, "Texto local.");
  assert.equal(localWins.card.after, "Síntese remota.");
  assert.deepEqual(localWins.appliedPaths, ["text"]);

  const structuralRemote = {
    id: "card-a",
    position: 1,
    resource: "code",
    kind: "theory",
    exercise: "none",
    title: "Código",
    prompt: "Leia.",
    language: "javascript",
    code: "const value = 1;",
    after: ""
  };
  assert.throws(
    () => rebaseCardAssistanceTextChange({
      baseCard,
      localCard,
      remoteCard: structuralRemote
    }),
    (error) =>
      error?.code === "CARD_ASSISTANCE_TEXT_CONFLICT" &&
      error?.paths?.includes("$structure")
  );
});

test("rebase textual reconhece convergência idempotente", () => {
  const baseCard = paragraphCard("card-a", 1, "Texto base.");
  const localCard = { ...baseCard, text: "Texto comum." };
  const remoteCard = { ...baseCard, text: "Texto comum.", after: "Remoto preservado." };
  const rebased = rebaseCardAssistanceTextChange({
    baseCard,
    localCard,
    remoteCard
  });

  assert.equal(rebased.card.text, "Texto comum.");
  assert.equal(rebased.card.after, "Remoto preservado.");
  assert.deepEqual(rebased.appliedPaths, []);
  assert.deepEqual(rebased.convergedPaths, ["text"]);
});

test("reparo textual rejeita seleção, resposta, ordem e configuração da opção", async () => {
  const project = projectFixture();
  const microsequence = selectedMicrosequence(project);
  microsequence.cards[0] = {
    id: "card-a",
    position: 1,
    resource: "choice",
    kind: "exercise",
    exercise: "choice",
    title: "Operadores",
    question: "Qual opção atribui um valor?",
    selectionMode: "single",
    selectionCriterion: "correct",
    options: [
      { id: "assign", text: "Use =." },
      {
        id: "compare",
        kind: "code",
        language: "javascript",
        code: "valor === 1"
      }
    ],
    answerIds: ["assign"],
    after: ""
  };
  const snapshot = await buildCardAssistanceScopeSnapshot(project, selection, {
    operation: "repair",
    repairScope: "card"
  });
  const mutations = [
    (card) => {
      card.selectionCriterion = "best";
    },
    (card) => {
      card.answerIds = ["compare"];
    },
    (card) => {
      card.options.reverse();
    },
    (card) => {
      card.options[1].language = "typescript";
    }
  ];

  for (const mutate of mutations) {
    const changed = structuredClone(microsequence.cards[0]);
    mutate(changed);
    await assert.rejects(
      applyCardAssistanceChangeSet({
        projectDocument: project,
        selection,
        snapshot,
        changeSet: repairChange(changed)
      }),
      (error) => error?.code === "OUT_OF_SCOPE_CARD_ASSISTANCE_CHANGE"
    );
  }
});

test("reparo de gap muda somente o texto ao redor e preserva token e resposta", async () => {
  const project = projectFixture();
  const microsequence = selectedMicrosequence(project);
  microsequence.cards[0] = compileAuthoringCardGaps({
    id: "card-a",
    position: 1,
    resource: "paragraph",
    kind: "exercise",
    exercise: "gap",
    title: "Organela",
    text: "Complete: a organela contém {gap:answer}.",
    after: "Revise a função da organela.",
    gaps: [{
      id: "answer",
      response: "text",
      answer: "clorofila",
      distractors: [],
      acceptedAnswers: []
    }]
  });
  const snapshot = await buildCardAssistanceScopeSnapshot(project, selection, {
    operation: "repair",
    repairScope: "resources",
    resourceTargetIds: ["main"]
  });
  const changed = structuredClone(microsequence.cards[0]);
  changed.text = changed.text
    .replace("Complete:", "Preencha a frase:")
    .replace(/\.$/u, ", no cloroplasto.");
  const applied = await applyCardAssistanceChangeSet({
    projectDocument: project,
    selection,
    snapshot,
    changeSet: repairChange(changed)
  });
  assert.match(selectedMicrosequence(applied.projectDocument).cards[0].text, /Preencha/u);

  const changedAnswer = structuredClone(microsequence.cards[0]);
  changedAnswer.text = changedAnswer.text.replace("clorofila", "mitocôndria");
  await assert.rejects(
    applyCardAssistanceChangeSet({
      projectDocument: project,
      selection,
      snapshot,
      changeSet: repairChange(changedAnswer)
    }),
    (error) => error?.code === "OUT_OF_SCOPE_CARD_ASSISTANCE_CHANGE"
  );

  const movedGap = structuredClone(microsequence.cards[0]);
  const gapToken = movedGap.text.match(/\[\[[\s\S]*?\]\]/u)?.[0] || "";
  assert.ok(gapToken);
  movedGap.text = `${movedGap.text.replace(gapToken, "").trim()} ${gapToken}`;
  await assert.rejects(
    applyCardAssistanceChangeSet({
      projectDocument: project,
      selection,
      snapshot,
      changeSet: repairChange(movedGap)
    }),
    (error) => error?.code === "OUT_OF_SCOPE_CARD_ASSISTANCE_CHANGE"
  );
});

test("reparo textual de flow não altera respostas da prática estruturada", async () => {
  const project = projectFixture();
  const microsequence = selectedMicrosequence(project);
  microsequence.cards[0] = {
    id: "card-a",
    position: 1,
    title: "Rótulos da decisão",
    kind: "exercise",
    exercise: "gap",
    resource: "flow",
    after: "Os ramos distinguem as saídas.",
    structure: {
      id: "root",
      kind: "sequence",
      items: [{
        id: "repeat",
        kind: "while",
        condition: "Há itens?",
        practice: {
          labels: {
            yes: {
              blank: true,
              mode: "choice",
              options: [{ id: "answer-no", value: "Não", enabled: true }]
            }
          }
        },
        body: [{ id: "consume", kind: "process", text: "Consumir item" }]
      }]
    }
  };
  const snapshot = await buildCardAssistanceScopeSnapshot(project, selection, {
    operation: "repair",
    repairScope: "resources",
    resourceTargetIds: ["main"]
  });
  const changed = structuredClone(microsequence.cards[0]);
  changed.structure.items[0].practice.labels.yes.options[0].value = "Sim";

  await assert.rejects(
    applyCardAssistanceChangeSet({
      projectDocument: project,
      selection,
      snapshot,
      changeSet: repairChange(changed)
    }),
    (error) => error?.code === "OUT_OF_SCOPE_CARD_ASSISTANCE_CHANGE"
  );
});

test("reparo textual pode explicitar labels de ramo sem alterar a árvore", async () => {
  const project = projectFixture();
  const microsequence = selectedMicrosequence(project);
  microsequence.cards[0] = compileAuthoringCardGaps({
    id: "card-a",
    position: 1,
    after: "Revise a condição.",
    resource: "flow",
    kind: "exercise",
    exercise: "gap",
    title: "Decisão",
    structure: {
      id: "root",
      kind: "sequence",
      items: [{
        id: "decision",
        kind: "if_then",
        condition: "{gap:condition}",
        thenBranch: [{ id: "output", kind: "output", text: "Exibir aprovado" }]
      }]
    },
    gaps: [{
      id: "condition",
      response: "choice",
      answer: "nota >= 6",
      distractors: ["nota < 6"]
    }]
  });
  const beforeStructure = structuredClone(microsequence.cards[0].structure);
  const changed = structuredClone(microsequence.cards[0]);
  changed.structure.items[0].branchLabels = { yes: "Aprovado", no: "Reprovado" };
  const snapshot = await buildCardAssistanceScopeSnapshot(project, selection, {
    operation: "repair",
    repairScope: "resources",
    resourceTargetIds: ["main"]
  });
  const result = await applyCardAssistanceChangeSet({
    projectDocument: project,
    selection,
    snapshot,
    changeSet: repairChange(changed)
  });
  const structure = selectedMicrosequence(result.projectDocument).cards[0].structure;

  assert.deepEqual(structure.items[0].branchLabels, {
    yes: "Aprovado",
    no: "Reprovado"
  });
  assert.equal(structure.items.length, beforeStructure.items.length);
  assert.deepEqual(structure.items[0].thenBranch, beforeStructure.items[0].thenBranch);
});

test("casos de if_chain expõem somente seus branchLabels textuais além dos textos já autorizados", () => {
  const card = {
    id: "card-a",
    position: 1,
    resource: "flow",
    kind: "theory",
    exercise: "none",
    title: "Condições",
    structure: {
      id: "root",
      kind: "sequence",
      items: [{
        id: "chain",
        kind: "if_chain",
        cases: [{
          id: "case-a",
          condition: "É o primeiro caso?",
          thenBranch: [{ id: "out-a", kind: "output", text: "Saída A" }]
        }, {
          id: "case-b",
          condition: "É o segundo caso?",
          branchLabels: { yes: "Aceitar", no: "Continuar" },
          thenBranch: [{ id: "out-b", kind: "output", text: "Saída B" }]
        }],
        elseBranch: [{ id: "fallback", kind: "process", text: "Alternativa" }]
      }]
    },
    after: ""
  };
  const targets = listCardResourceTargets(card).filter(({ targetId }) => targetId === "main");
  const paths = listCardAssistanceTextPaths(card, {
    repairScope: "resources",
    targets
  });
  assert.ok(paths.includes("structure.items[0].cases[0].branchLabels.yes"));
  assert.ok(paths.includes("structure.items[0].cases[0].branchLabels.no"));
  assert.ok(paths.includes("structure.items[0].cases[1].branchLabels.yes"));
  assert.ok(paths.includes("structure.items[0].cases[1].branchLabels.no"));
  assert.equal(paths.some((path) => /(?:\.id|\.kind|\.practice)(?:\.|$)/u.test(path)), false);

  const proposal = structuredClone(card);
  proposal.structure.items[0].cases[0].branchLabels = {
    yes: "Primeiro",
    no: "Próximo"
  };
  proposal.structure.items[0].cases[1].branchLabels = {
    yes: "Segundo",
    no: "Alternativa"
  };
  const projected = projectCardAssistanceTextChange(card, proposal, {
    repairScope: "resources",
    targets
  });
  assert.deepEqual(projected.structure.items[0].cases[0].branchLabels, {
    yes: "Primeiro",
    no: "Próximo"
  });
  assert.deepEqual(
    projected.structure.items[0].cases.map(({ id, condition, thenBranch }) => ({
      id,
      condition,
      thenBranch
    })),
    card.structure.items[0].cases.map(({ id, condition, thenBranch }) => ({
      id,
      condition,
      thenBranch
    }))
  );
});

test("reparo de bloco preserva quantidade, ordem e topologia", async () => {
  const project = projectFixture();
  const microsequence = selectedMicrosequence(project);
  microsequence.cards[0] = {
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
  for (const mutate of [
    (card) => card.blocks.push({ id: "part-c", kind: "paragraph", value: "Novo." }),
    (card) => card.blocks.reverse(),
    (card) => {
      card.blocks[0].id = "part-renamed";
    }
  ]) {
    const changed = structuredClone(microsequence.cards[0]);
    mutate(changed);
    await assert.rejects(
      applyCardAssistanceChangeSet({
        projectDocument: project,
        selection,
        snapshot,
        changeSet: repairChange(changed)
      }),
      (error) => error?.code === "OUT_OF_SCOPE_CARD_ASSISTANCE_CHANGE"
    );
  }
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
