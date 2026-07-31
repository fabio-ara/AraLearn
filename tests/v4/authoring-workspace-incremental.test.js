import assert from "node:assert/strict";
import test from "node:test";

import {
  copyWorkspaceEntity,
  createWorkspaceStructure,
  saveWorkspaceCard,
  saveWorkspaceMicrosequenceCards,
  updateWorkspaceEntityMetadata
} from "../../supabase/functions/_shared/aralearn-authoring/workspaceIncremental.js";
import {
  createEmptyAuthoringWorkspace,
  validateAuthoringWorkspace
} from "../../supabase/functions/_shared/aralearn-authoring/workspaceModel.js";

const COURSE_PATH = ["course-incremental"];
const MODULE_PATH = [...COURSE_PATH, "module-incremental"];
const LESSON_PATH = [...MODULE_PATH, "lesson-incremental"];
const MICROSEQUENCE_PATH = [...LESSON_PATH, "micro-concept"];

function structureParts() {
  return [
    {
      entityType: "course",
      id: COURSE_PATH[0],
      title: "Curso incremental",
      goal: "Construir o curso em chamadas estruturais pequenas."
    },
    {
      entityType: "module",
      parentPath: COURSE_PATH,
      id: MODULE_PATH[1],
      title: "Módulo incremental",
      goal: "Delimitar o módulo.",
      include: ["adição"],
      exclude: ["multiplicação"],
      notation: ["Use números naturais."],
      avoid: ["Não antecipar operações posteriores."]
    },
    {
      entityType: "lesson",
      parentPath: MODULE_PATH,
      id: LESSON_PATH[2],
      title: "Lição incremental",
      goal: "Explicar uma adição simples.",
      include: ["parcelas", "soma"],
      exclude: ["produto"],
      notation: ["Use o sinal +."],
      avoid: ["Não trocar adição por concatenação."]
    },
    {
      entityType: "microsequence",
      parentPath: LESSON_PATH,
      id: MICROSEQUENCE_PATH[3],
      title: "Conceito de adição",
      goal: "Reconhecer a soma de duas parcelas.",
      role: "explain",
      status: "planned",
      covers: ["parcelas", "soma"],
      checks: ["identifica o resultado da adição"],
      errors: ["confundir soma com concatenação"]
    }
  ];
}

function theoryCard(id = "card-concept") {
  return {
    id,
    resource: "paragraph",
    kind: "theory",
    exercise: "none",
    title: "Somar reúne quantidades",
    text: "Na adição, as parcelas são reunidas para produzir uma soma.",
    after: "O sinal + registra essa operação."
  };
}

function practiceCard(id = "card-practice") {
  return {
    id,
    resource: "paragraph",
    kind: "exercise",
    exercise: "gap",
    title: "Calcule",
    text: "Duas unidades mais duas unidades resultam em {gap:sum}.",
    gaps: [{
      id: "sum",
      response: "choice",
      answer: "quatro",
      distractors: ["três", "cinco"]
    }],
    after: "As duas parcelas têm duas unidades."
  };
}

function addressableIds(lesson) {
  return new Set([
    lesson.id,
    ...lesson.topics.map((topic) => topic.id),
    ...lesson.microsequences.flatMap((microsequence) => [
      microsequence.id,
      ...microsequence.cards.map((card) => card.id)
    ])
  ]);
}

function buildMaterializedJourney() {
  const empty = createEmptyAuthoringWorkspace();
  const planned = createWorkspaceStructure(empty, { parts: structureParts() });
  return saveWorkspaceMicrosequenceCards(planned, {
    microsequencePath: MICROSEQUENCE_PATH,
    mode: "replace",
    cards: [theoryCard(), practiceCard()],
    status: "generated"
  });
}

test("cria curso, módulo, lição e microssequência planejada em um lote atômico", () => {
  const empty = createEmptyAuthoringWorkspace();
  const created = createWorkspaceStructure(empty, { parts: structureParts() });

  assert.deepEqual(empty, createEmptyAuthoringWorkspace());
  const course = created.courses[0];
  const moduleValue = course.modules[0];
  const lesson = moduleValue.lessons[0];
  const microsequence = lesson.microsequences[0];

  assert.deepEqual(course.modules.map((item) => item.id), [MODULE_PATH[1]]);
  assert.deepEqual(moduleValue.guide, {
    goal: "Delimitar o módulo.",
    include: ["adição"],
    exclude: ["multiplicação"],
    notation: ["Use números naturais."],
    avoid: ["Não antecipar operações posteriores."]
  });
  assert.deepEqual(lesson.topics, []);
  assert.deepEqual(lesson.microsequences.map((item) => item.id), [MICROSEQUENCE_PATH[3]]);
  assert.equal(microsequence.status, "planned");
  assert.equal(microsequence.role, "explain");
  assert.equal(microsequence.branchOf, null);
  assert.deepEqual(microsequence.dependsOn, []);
  assert.deepEqual(microsequence.cards, []);
  assert.equal(validateAuthoringWorkspace(created).contract, "aralearn.contract");
});

test("ordena pais antes dos filhos sem depender da ordem recebida", () => {
  const reversed = structureParts().toReversed();
  const created = createWorkspaceStructure(
    createEmptyAuthoringWorkspace(),
    { parts: reversed }
  );

  assert.equal(created.courses[0].id, COURSE_PATH[0]);
  assert.equal(created.courses[0].modules[0].id, MODULE_PATH[1]);
  assert.equal(created.courses[0].modules[0].lessons[0].id, LESSON_PATH[2]);
  assert.equal(
    created.courses[0].modules[0].lessons[0].microsequences[0].id,
    MICROSEQUENCE_PATH[3]
  );
});

test("preserva topics completos declarados na criação incremental da lição", () => {
  const parts = structureParts();
  const topics = [{
    id: "topic-addition",
    label: "Adição",
    kind: "concept",
    checks: ["reconhece a soma"],
    errors: ["confunde com concatenação"]
  }];
  parts[2].topics = topics;

  const created = createWorkspaceStructure(
    createEmptyAuthoringWorkspace(),
    { parts }
  );
  const lesson = created.courses[0].modules[0].lessons[0];

  assert.deepEqual(lesson.topics, topics);
  assert.notStrictEqual(lesson.topics, topics);
  assert.notStrictEqual(lesson.topics[0], topics[0]);
  assert.equal(validateAuthoringWorkspace(created).contract, "aralearn.contract");
});

test("falha posterior do lote não altera o documento recebido", () => {
  const empty = createEmptyAuthoringWorkspace();
  const snapshot = structuredClone(empty);

  assert.throws(
    () => createWorkspaceStructure(empty, {
      parts: [
        structureParts()[0],
        {
          entityType: "module",
          parentPath: ["course-ausente"],
          id: "module-orphan",
          title: "Módulo órfão",
          goal: "Esta parte deve falhar."
        }
      ]
    }),
    (error) => error?.code === "workspace_entity_not_found"
  );
  assert.deepEqual(empty, snapshot);
});

test("salva cards por replace e append, normaliza posições e valida o estado final", () => {
  const planned = createWorkspaceStructure(
    createEmptyAuthoringWorkspace(),
    { parts: structureParts() }
  );
  const materialized = saveWorkspaceMicrosequenceCards(planned, {
    microsequencePath: MICROSEQUENCE_PATH,
    mode: "replace",
    cards: [
      { ...theoryCard(), position: 40 },
      { ...practiceCard(), position: -3 }
    ],
    status: "generated"
  });
  const appended = saveWorkspaceMicrosequenceCards(materialized, {
    microsequencePath: MICROSEQUENCE_PATH,
    mode: "append",
    cards: [theoryCard("card-summary")],
    status: "needs_review"
  });
  const cards = appended.courses[0].modules[0].lessons[0].microsequences[0].cards;

  assert.deepEqual(planned.courses[0].modules[0].lessons[0].microsequences[0].cards, []);
  assert.deepEqual(cards.map((card) => card.position), [1, 2, 3]);
  assert.equal(
    cards[1].text,
    "Duas unidades mais duas unidades resultam em [[quatro::quatro|três|cinco]]."
  );
  assert.equal(Object.hasOwn(cards[1], "gaps"), false);
  assert.equal(
    appended.courses[0].modules[0].lessons[0].microsequences[0].status,
    "needs_review"
  );
  assert.throws(
    () => saveWorkspaceMicrosequenceCards(planned, {
      microsequencePath: MICROSEQUENCE_PATH,
      mode: "replace",
      cards: [],
      status: "ready"
    }),
    (error) => error?.code === "invalid_workspace_document"
  );
  assert.deepEqual(planned.courses[0].modules[0].lessons[0].microsequences[0].cards, []);
});

test("compila a linguagem formal de gaps e rejeita sintaxe interna na entrada autoral", () => {
  const planned = createWorkspaceStructure(
    createEmptyAuthoringWorkspace(),
    { parts: structureParts() }
  );
  const source = practiceCard();
  const materialized = saveWorkspaceMicrosequenceCards(planned, {
    microsequencePath: MICROSEQUENCE_PATH,
    mode: "replace",
    cards: [source],
    status: "generated"
  });
  const persisted = materialized.courses[0].modules[0]
    .lessons[0].microsequences[0].cards[0];

  assert.equal(
    persisted.text,
    "Duas unidades mais duas unidades resultam em [[quatro::quatro|três|cinco]]."
  );
  assert.equal(Object.hasOwn(persisted, "gaps"), false);
  assert.match(source.text, /\{gap:sum\}/u);
  assert.equal(Object.hasOwn(source, "gaps"), true);

  assert.throws(
    () => saveWorkspaceMicrosequenceCards(planned, {
      microsequencePath: MICROSEQUENCE_PATH,
      mode: "replace",
      cards: [{
        ...practiceCard(),
        text: "Mistura {gap:sum} e [[quatro]]."
      }],
      status: "generated"
    }),
    (error) =>
      error?.code === "invalid_authoring_gap"
      && error?.status === 422
      && error?.details?.path === "cards[0].text"
      && error?.details?.reason === "mixed_notation"
  );
  assert.throws(
    () => saveWorkspaceCard(materialized, {
      cardPath: [...MICROSEQUENCE_PATH, "card-practice"],
      card: {
        ...persisted,
        text: "Duas unidades mais duas unidades resultam em [[quatro]]."
      }
    }),
    (error) =>
      error?.code === "invalid_authoring_gap"
      && error?.details?.path === "card.gaps"
      && error?.details?.reason === "formal_gaps_required"
  );
});

test("copia uma lição sem compartilhar ids, referências ou objetos com a origem", () => {
  const firstMicrosequence = buildMaterializedJourney();
  const withDependency = createWorkspaceStructure(firstMicrosequence, {
    parts: [{
      entityType: "microsequence",
      parentPath: LESSON_PATH,
      id: "micro-practice",
      title: "Prática dependente",
      goal: "Praticar depois da explicação.",
      role: "practice",
      status: "planned",
      branchOf: "micro-concept",
      dependsOn: ["micro-concept"],
      covers: ["soma"],
      checks: ["calcula a soma"],
      errors: ["concatena as parcelas"]
    }]
  });
  const withSecondCard = saveWorkspaceMicrosequenceCards(withDependency, {
    microsequencePath: [...LESSON_PATH, "micro-practice"],
    mode: "replace",
    cards: [practiceCard("card-dependent")],
    status: "ready"
  });
  const sourceLesson = withSecondCard.courses[0].modules[0].lessons[0];
  sourceLesson.topics.push({
    id: "topic-addition",
    label: "Adição",
    kind: "concept",
    checks: ["reconhece a soma"],
    errors: ["confunde com concatenação"]
  });
  sourceLesson.microsequences[0].cards[0].topics = ["topic-addition", "tag-livre"];
  validateAuthoringWorkspace(withSecondCard);

  const copiedOnce = copyWorkspaceEntity(withSecondCard, {
    entityType: "lesson",
    entityPath: LESSON_PATH,
    targetParentPath: MODULE_PATH,
    newRootId: "lesson-copy"
  });
  const copiedAgain = copyWorkspaceEntity(withSecondCard, {
    entityType: "lesson",
    entityPath: LESSON_PATH,
    targetParentPath: MODULE_PATH,
    newRootId: "lesson-copy"
  });
  const original = copiedOnce.courses[0].modules[0].lessons[0];
  const copied = copiedOnce.courses[0].modules[0].lessons[1];
  const deterministicCopy = copiedAgain.courses[0].modules[0].lessons[1];
  const sharedIds = [...addressableIds(original)]
    .filter((id) => addressableIds(copied).has(id));

  assert.equal(copied.id, "lesson-copy");
  assert.deepEqual(sharedIds, []);
  assert.deepEqual(copied, deterministicCopy);
  assert.equal(copied.microsequences[1].dependsOn[0], copied.microsequences[0].id);
  assert.equal(copied.microsequences[1].branchOf, copied.microsequences[0].id);
  assert.deepEqual(
    copied.microsequences[0].cards[0].topics,
    [copied.topics[0].id, "tag-livre"]
  );
  assert.notStrictEqual(original, copied);
  assert.notStrictEqual(original.guide, copied.guide);
  assert.notStrictEqual(original.microsequences[0].cards[0], copied.microsequences[0].cards[0]);

  copied.guide.include.push("alteração apenas na cópia");
  copied.microsequences[0].cards[0].text = "Texto alterado apenas na cópia.";
  assert.doesNotMatch(original.guide.include.join(" "), /apenas na cópia/u);
  assert.notEqual(original.microsequences[0].cards[0].text, copied.microsequences[0].cards[0].text);
  assert.equal(withSecondCard.courses[0].modules[0].lessons.length, 1);
});

test("atualiza somente metadados compatíveis com o nível estrutural", () => {
  const original = buildMaterializedJourney();
  const updated = updateWorkspaceEntityMetadata(original, {
    entityType: "lesson",
    entityPath: LESSON_PATH,
    goal: "Distinguir parcelas e soma sem pressupor conhecimentos prévios.",
    include: ["parcelas", "soma", "representação concreta"],
    topics: [{
      id: "topic-sum",
      label: "Soma",
      kind: "concept",
      checks: ["reconhece o resultado da adição"],
      errors: ["confunde soma com parcela"]
    }]
  });

  assert.equal(
    updated.courses[0].modules[0].lessons[0].guide.goal,
    "Distinguir parcelas e soma sem pressupor conhecimentos prévios."
  );
  assert.deepEqual(
    updated.courses[0].modules[0].lessons[0].guide.include,
    ["parcelas", "soma", "representação concreta"]
  );
  assert.deepEqual(
    updated.courses[0].modules[0].lessons[0].topics.map(({ id }) => id),
    ["topic-sum"]
  );
  assert.notEqual(updated, original);
  assert.throws(
    () => updateWorkspaceEntityMetadata(original, {
      entityType: "course",
      entityPath: COURSE_PATH,
      checks: ["campo incompatível"]
    }),
    (error) => error?.code === "invalid_workspace_metadata_field"
  );
});

test("corrige um card completo sem alterar identidade, posição ou vizinhos", () => {
  const original = buildMaterializedJourney();
  const replacement = {
    ...theoryCard(),
    position: 999,
    text: "Na adição, duas ou mais parcelas são reunidas para obter a soma."
  };
  const updated = saveWorkspaceCard(original, {
    cardPath: [...MICROSEQUENCE_PATH, "card-concept"],
    card: replacement
  });
  const cards = updated.courses[0].modules[0].lessons[0].microsequences[0].cards;

  assert.equal(cards[0].position, 1);
  assert.match(cards[0].text, /duas ou mais parcelas/u);
  assert.deepEqual(cards[1], original.courses[0].modules[0].lessons[0].microsequences[0].cards[1]);
  assert.throws(
    () => saveWorkspaceCard(original, {
      cardPath: [...MICROSEQUENCE_PATH, "card-concept"],
      card: { ...replacement, id: "outro-card" }
    }),
    (error) => error?.code === "workspace_identity_change_forbidden"
  );
});
