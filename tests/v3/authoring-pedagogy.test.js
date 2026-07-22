import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";

import {
  assertFragmentMatchesSpecification,
  validateAuthoringFragment
} from "../../supabase/functions/_shared/aralearn-authoring/canonical.js";
import {
  validateLedgerChunkPayload,
  validatePartSpecificationPayload,
  validatePlanPayload
} from "../../supabase/functions/_shared/aralearn-authoring/protocol.js";

const RUN_ID = "11111111-1111-4111-8111-111111111111";
const PLAN_HASH = "d".repeat(64);

function choices(correct, distractorA, distractorB) {
  return [
    { id: "a", text: correct },
    { id: "b", text: distractorA },
    { id: "c", text: distractorB }
  ];
}

const scenarios = [
  {
    id: "sql",
    label: "SQL",
    anchors: ["pedidos(id, total)", "total > 100"],
    worked: {
      resource: "code",
      kind: "theory",
      exercise: "none",
      title: "Filtro explícito",
      prompt: "No PostgreSQL, a tabela pedidos(id, total) contém os valores a consultar.",
      language: "sql",
      code: "SELECT id\nFROM pedidos\nWHERE total > 100;",
      after: "WHERE aplica a condição antes de devolver as linhas."
    },
    practice: {
      resource: "code",
      kind: "exercise",
      exercise: "gap",
      title: "Complete o filtro",
      prompt: "No PostgreSQL, use a tabela pedidos(id, total) e devolva somente linhas com total > 100.",
      language: "sql",
      code: "SELECT id\nFROM pedidos\n[[WHERE::WHERE|GROUP BY|ORDER BY]] total > 100;",
      after: "WHERE seleciona as linhas que satisfazem total > 100."
    },
    anchors2: ["usuarios(id, ativo)", "ativo = true"],
    practice2: {
      resource: "code",
      kind: "exercise",
      exercise: "gap",
      title: "Filtre usuários ativos",
      prompt: "No PostgreSQL, use a tabela usuarios(id, ativo) e devolva somente linhas com ativo = true.",
      language: "sql",
      code: "SELECT id\nFROM usuarios\n[[WHERE::WHERE|GROUP BY|ORDER BY]] ativo = true;",
      after: "A cláusula WHERE também filtra a condição booleana do segundo caso."
    }
  },
  {
    id: "estatistica",
    label: "estatística com notação",
    anchors: ["12, 18 e 30", "média aritmética"],
    worked: {
      resource: "formula",
      kind: "theory",
      exercise: "none",
      title: "Média de três valores",
      prompt: "Para 9, 12 e 15, some os valores e divida a soma por três.",
      notation: "mathematics",
      accessibleText: "Nove mais doze mais quinze, dividido por três, é igual a doze.",
      expression: {
        type: "row",
        children: [
          {
            type: "fraction",
            numerator: { type: "number", value: "36" },
            denominator: { type: "number", value: "3" }
          },
          { type: "operator", value: "=" },
          { type: "number", value: "12" }
        ]
      },
      after: "A soma 36 dividida por três produz 12."
    },
    practice: {
      resource: "formula",
      kind: "exercise",
      exercise: "choice",
      title: "Média da amostra",
      prompt: "Considere os valores 12, 18 e 30 e a fórmula da média aritmética.",
      notation: "mathematics",
      accessibleText: "Doze mais dezoito mais trinta, dividido por três.",
      expression: {
        type: "fraction",
        numerator: {
          type: "row",
          children: [
            { type: "number", value: "12" },
            { type: "operator", value: "+" },
            { type: "number", value: "18" },
            { type: "operator", value: "+" },
            { type: "number", value: "30" }
          ]
        },
        denominator: { type: "number", value: "3" }
      },
      question: "Qual resultado a expressão produz?",
      options: choices("20", "18", "30"),
      answer: "a",
      after: "A soma é 60; 60 dividido por 3 resulta em 20."
    },
    anchors2: ["10, 14 e 18", "média aritmética"],
    practice2: {
      resource: "formula",
      kind: "exercise",
      exercise: "choice",
      title: "Nova média da amostra",
      prompt: "Considere os valores 10, 14 e 18 e a fórmula da média aritmética.",
      notation: "mathematics",
      accessibleText: "Dez mais quatorze mais dezoito, dividido por três.",
      expression: {
        type: "fraction",
        numerator: {
          type: "row",
          children: [
            { type: "number", value: "10" },
            { type: "operator", value: "+" },
            { type: "number", value: "14" },
            { type: "operator", value: "+" },
            { type: "number", value: "18" }
          ]
        },
        denominator: { type: "number", value: "3" }
      },
      question: "Qual resultado a nova expressão produz?",
      options: choices("14", "12", "18"),
      answer: "a",
      after: "A soma é 42; 42 dividido por 3 resulta em 14."
    }
  },
  {
    id: "quimica",
    label: "química com notação",
    anchors: ["CO₂", "dois átomos de oxigênio"],
    worked: {
      resource: "formula",
      kind: "theory",
      exercise: "none",
      title: "Índice químico",
      prompt: "Em H₂O, o índice 2 indica dois átomos de hidrogênio.",
      notation: "chemistry",
      accessibleText: "H dois O: dois átomos de hidrogênio e um de oxigênio.",
      expression: {
        type: "row",
        children: [
          {
            type: "subscript",
            base: { type: "identifier", value: "H" },
            subscript: { type: "number", value: "2" }
          },
          { type: "identifier", value: "O" }
        ]
      },
      after: "O índice pertence ao símbolo que o antecede."
    },
    practice: {
      resource: "formula",
      kind: "exercise",
      exercise: "choice",
      title: "Leitura do dióxido de carbono",
      prompt: "Na fórmula CO₂, o índice 2 representa dois átomos de oxigênio.",
      notation: "chemistry",
      accessibleText: "C O dois: um átomo de carbono e dois átomos de oxigênio.",
      expression: {
        type: "row",
        children: [
          { type: "identifier", value: "C" },
          {
            type: "subscript",
            base: { type: "identifier", value: "O" },
            subscript: { type: "number", value: "2" }
          }
        ]
      },
      question: "Qual descrição preserva o índice mostrado?",
      options: choices(
        "Um átomo de carbono e dois de oxigênio",
        "Dois átomos de carbono e um de oxigênio",
        "Dois átomos de carbono e dois de oxigênio"
      ),
      answer: "a",
      after: "A ausência de índice em C representa uma unidade; o índice 2 pertence a O."
    },
    anchors2: ["NH₃", "três átomos de hidrogênio"],
    practice2: {
      resource: "formula",
      kind: "exercise",
      exercise: "choice",
      title: "Leitura da amônia",
      prompt: "Na fórmula NH₃, o índice 3 representa três átomos de hidrogênio.",
      notation: "chemistry",
      accessibleText: "N H três: um átomo de nitrogênio e três átomos de hidrogênio.",
      expression: {
        type: "row",
        children: [
          { type: "identifier", value: "N" },
          {
            type: "subscript",
            base: { type: "identifier", value: "H" },
            subscript: { type: "number", value: "3" }
          }
        ]
      },
      question: "Qual descrição preserva o índice mostrado na nova fórmula?",
      options: choices(
        "Um átomo de nitrogênio e três de hidrogênio",
        "Três átomos de nitrogênio e um de hidrogênio",
        "Um átomo de nitrogênio e um de hidrogênio"
      ),
      answer: "a",
      after: "A ausência de índice em N representa uma unidade; o índice 3 pertence a H."
    }
  },
  {
    id: "arabe",
    label: "árabe e escrita não latina",
    anchors: ["كتاب", "قلم", "kitāb", "qalam"],
    worked: {
      resource: "paragraph",
      kind: "theory",
      exercise: "none",
      title: "Duas palavras em árabe",
      text: "كتاب (kitāb) significa livro; قلم (qalam) significa caneta.",
      after: "A glosa liga cada forma original ao significado.",
      languageTag: "ar",
      textDirection: "auto"
    },
    practice: {
      resource: "choice",
      kind: "exercise",
      exercise: "choice",
      title: "Reconheça a palavra",
      question: "No próprio enunciado: كتاب (kitāb) significa livro; قلم (qalam) significa caneta. Qual posição contém a palavra para livro?",
      options: choices("A primeira posição", "A segunda posição", "Nenhuma posição"),
      answer: "a",
      after: "كتاب ocupa a primeira posição e foi apresentado com a glosa livro.",
      languageTag: "ar",
      textDirection: "auto"
    }
  },
  {
    id: "direito",
    label: "direito e administração",
    anchors: ["Brasil", "Lei 14.133/2021", "1º de agosto de 2026"],
    worked: {
      resource: "paragraph",
      kind: "theory",
      exercise: "none",
      title: "Aplicação temporal da norma",
      text: "No Brasil, uma decisão identifica a norma vigente na data do ato antes de aplicar a regra ao caso.",
      after: "Jurisdição e data fazem parte da premissa normativa."
    },
    practice: {
      resource: "choice",
      kind: "exercise",
      exercise: "choice",
      title: "Premissas do caso",
      question: "No Brasil, o processo informa que a Lei 14.133/2021 rege o ato praticado em 1º de agosto de 2026. Qual análise usa todas as premissas fornecidas?",
      options: choices(
        "Verificar a regra da Lei 14.133/2021 vigente na data indicada e aplicá-la aos fatos",
        "Ignorar a data e escolher qualquer versão da norma",
        "Decidir sem consultar a fonte normativa identificada"
      ),
      answer: "a",
      after: "A análise precisa conservar jurisdição, norma e data do caso."
    },
    anchors2: ["Brasil", "Lei 9.784/1999", "15 de setembro de 2026"],
    practice2: {
      resource: "choice",
      kind: "exercise",
      exercise: "choice",
      title: "Motivação do ato",
      question: "No Brasil, um processo sujeito à Lei 9.784/1999 registra decisão em 15 de setembro de 2026 sem indicar os fatos considerados. Qual análise conserva as premissas do caso?",
      options: choices(
        "Verificar na fonte indicada a exigência vigente de motivação e relacioná-la aos fatos omitidos",
        "Ignorar a norma e a data informadas",
        "Presumir fundamentos que não constam do processo"
      ),
      answer: "a",
      after: "A segunda prática muda a norma, a data e o defeito observado."
    }
  }
];

function scenarioFixture(scenario) {
  const courseId = `course-${scenario.id}`;
  const moduleId = `module-${scenario.id}`;
  const lessonId = `lesson-${scenario.id}`;
  const microsequenceId = `micro-${scenario.id}`;
  const partKey = `part-${scenario.id}`;
  const operationId = `operation-${scenario.id}`;
  const guide = {
    goal: `Ensinar a decisão de ${scenario.label}.`,
    include: [scenario.label],
    exclude: ["Conteúdo fora do caso."],
    notation: ["Preservar a notação declarada."],
    avoid: ["Não omitir dados decisivos."]
  };
  const project = {
    contract: "aralearn.contract",
    version: 3,
    kind: "project",
    courses: [{
      id: courseId,
      title: `Curso de ${scenario.label}`,
      goal: `Aplicar uma decisão observável de ${scenario.label}.`,
      modules: [{
        id: moduleId,
        title: "Fundamentos",
        guide,
        lessons: [{
          id: lessonId,
          title: "Exemplo e prática",
          guide,
          topics: [],
          microsequences: []
        }]
      }]
    }]
  };
  const workedCard = { id: `card-${scenario.id}-worked`, position: 1, ...structuredClone(scenario.worked) };
  const practiceCards = [
    { id: `card-${scenario.id}-practice`, position: 2, ...structuredClone(scenario.practice) },
    ...(scenario.practice2 ? [{
      id: `card-${scenario.id}-practice-2`,
      position: 3,
      ...structuredClone(scenario.practice2)
    }] : [])
  ];
  const specification = {
    key: partKey,
    title: `Parte de ${scenario.label}`,
    boundary: "Um exemplo resolvido e uma prática factual autocontida.",
    cutReason: "A prática única verifica uma condição factual indivisível, explicitamente justificada.",
    dependsOnPartKeys: [],
    ownership: { courseId, moduleId, lessonId, microsequenceIds: [microsequenceId] },
    outcomeIds: [`outcome-${scenario.id}`],
    structure: {
      course: { id: courseId, title: project.courses[0].title, goal: project.courses[0].goal },
      module: { id: moduleId, title: "Fundamentos", guide },
      lesson: { id: lessonId, title: "Exemplo e prática", guide, topics: [] },
      microsequences: [{
        id: microsequenceId,
        title: `Decisão de ${scenario.label}`,
        goal: `Resolver um caso de ${scenario.label}.`,
        role: "explain",
        status: "planned",
        dependsOn: [],
        dependencyRationale: {},
        covers: [scenario.label],
        checks: ["registra uma resposta verificável"],
        errors: ["omite uma premissa do caso"]
      }]
    },
    cardPlan: [
      {
        cardId: workedCard.id,
        microsequenceId,
        position: 1,
        resource: workedCard.resource,
        kind: "theory",
        exercise: "none",
        purpose: "Resolver um caso antes de pedir aplicação.",
        evidence: "O exemplo explicita os dados e a decisão.",
        outcomeIds: [`outcome-${scenario.id}`],
        operationId,
        ...(workedCard.resource === "code" ? { codeLanguage: workedCard.language } : {}),
        ...(workedCard.resource === "formula" ? { notation: workedCard.notation } : {}),
        ...(workedCard.languageTag ? { languageTag: workedCard.languageTag } : {}),
        ...(workedCard.textDirection ? { textDirection: workedCard.textDirection } : {}),
        learningFunction: "worked_example",
        resourceRationale: "O recurso preserva a representação própria da área.",
        contextAnchors: [],
        introducedTermIds: [],
        requiredTermIds: [],
        sourceIds: [],
        claimIds: []
      },
      ...practiceCards.map((practiceCard, index) => ({
        cardId: practiceCard.id,
        microsequenceId,
        position: index + 2,
        resource: practiceCard.resource,
        kind: "exercise",
        exercise: practiceCard.exercise,
        purpose: "Observar a aplicação da mesma decisão em outro caso.",
        evidence: "A resposta selecionada ou digitada registra a decisão do estudante.",
        outcomeIds: [`outcome-${scenario.id}`],
        operationId,
        ...(practiceCard.resource === "code" ? { codeLanguage: practiceCard.language } : {}),
        ...(practiceCard.resource === "formula" ? { notation: practiceCard.notation } : {}),
        ...(practiceCard.languageTag ? { languageTag: practiceCard.languageTag } : {}),
        ...(practiceCard.textDirection ? { textDirection: practiceCard.textDirection } : {}),
        targetError: "Omitir um dado decisivo apresentado no enunciado.",
        learningFunction: practiceCards.length === 1 || index > 0
          ? "independent_practice"
          : "guided_practice",
        resourceRationale: "A interação registra uma resposta verificável.",
        variationFocus: index === 0
          ? `Aplicar a operação ao primeiro caso específico de ${scenario.label}.`
          : `Aplicar a operação ao segundo caso com dados e condição alterados de ${scenario.label}.`,
        contextAnchors: [...(index === 0 ? scenario.anchors : scenario.anchors2)],
        ...(practiceCards.length === 1 ? {
          singlePracticeRationale: "A resposta reconhece uma condição factual indivisível e não introduz procedimento ou estratégia nova."
        } : {}),
        introducedTermIds: [],
        requiredTermIds: [],
        sourceIds: [],
        claimIds: []
      }))
    ],
    allowedSourceIds: [],
    availableTermIds: [],
    preserve: []
  };
  const fragment = {
    courseId,
    moduleId,
    lessonId,
    microsequences: [{
      id: microsequenceId,
      title: `Decisão de ${scenario.label}`,
      goal: `Resolver um caso de ${scenario.label}.`,
      role: "explain",
      status: "needs_review",
      dependsOn: [],
      covers: [scenario.label],
      checks: ["registra uma resposta verificável"],
      errors: ["omite uma premissa do caso"],
      cards: [workedCard, ...practiceCards]
    }]
  };
  return { project, specification, fragment, partKey };
}

function outlineOf(specification) {
  return {
    key: specification.key,
    title: specification.title,
    boundary: specification.boundary,
    cutReason: specification.cutReason,
    dependsOnPartKeys: specification.dependsOnPartKeys,
    ownership: specification.ownership,
    cardIds: specification.cardPlan.map((card) => card.cardId),
    outcomeIds: specification.outcomeIds
  };
}

function validateSpecification(
  fixture,
  specification = fixture.specification,
  continuity = {},
  runOverrides = {}
) {
  return validatePartSpecificationPayload({
    requestId: `specify-${fixture.partKey}-0001`,
    planHash: PLAN_HASH,
    specification
  }, { partKey: fixture.partKey }, {
    nextPart: {
      partKey: fixture.partKey,
      position: 0,
      outline: outlineOf(specification)
    },
    plan: {
      project: fixture.project,
      ledger: { sources: [], claims: [], terms: [], ...(runOverrides.ledger || {}) }
    },
    continuity,
    parts: runOverrides.parts || []
  }).specification;
}

test("perfis disciplinares exigem exemplo resolvido e materializam contexto no card submetido", async (t) => {
  for (const scenario of scenarios) {
    await t.test(scenario.label, () => {
      const fixture = scenarioFixture(scenario);
      const specification = validateSpecification(fixture);
      assert.equal(assertFragmentMatchesSpecification(fixture.fragment, specification), true);
    });
  }
});

test("prática sem worked example anterior da mesma operação é rejeitada", () => {
  const fixture = scenarioFixture(scenarios[0]);
  fixture.specification.cardPlan[0].learningFunction = "foundation";
  assert.throws(
    () => validateSpecification(fixture),
    (error) => error?.code === "invalid_plan"
      && error?.details?.reason === "missing_worked_example"
      && error?.details?.path === "specification.cardPlan[1].learningFunction"
  );
});

test("prática pode reutilizar worked example aprovado por uma dependência causal", () => {
  const fixture = scenarioFixture(scenarios[3]);
  const [workedExample, practice] = fixture.specification.cardPlan;
  const [microsequence] = fixture.specification.structure.microsequences;
  fixture.specification.cardPlan = [{ ...practice, position: 1 }];
  fixture.specification.dependsOnPartKeys = ["part-approved"];
  microsequence.dependsOn = ["micro-approved"];
  microsequence.dependencyRationale = {
    "micro-approved": "Retoma a mesma operação depois do exemplo resolvido aprovado."
  };
  const continuity = {
    dependencyMicrosequenceIds: ["micro-approved"],
    workedOperations: [{
      operationId: workedExample.operationId,
      microsequenceId: "micro-approved"
    }]
  };

  assert.doesNotThrow(() => validateSpecification(fixture, fixture.specification, continuity));

  const unrelated = {
    ...continuity,
    workedOperations: [{
      operationId: "operation-unrelated",
      microsequenceId: "micro-approved"
    }]
  };
  assert.throws(
    () => validateSpecification(fixture, fixture.specification, unrelated),
    (error) => error?.code === "invalid_plan"
      && error?.details?.reason === "missing_worked_example"
  );
});

test("exceção de prática única precisa ser independente e explicitamente justificada", () => {
  const fixture = scenarioFixture(scenarios[3]);
  delete fixture.specification.cardPlan[1].singlePracticeRationale;
  assert.throws(
    () => validateSpecification(fixture),
    (error) => error?.code === "invalid_plan"
      && error?.details?.reason === "insufficient_practice"
  );
});

test("exceção de prática única é contada separadamente por operationId", () => {
  const fixture = scenarioFixture(scenarios[1]);
  const workedExample = {
    ...structuredClone(fixture.specification.cardPlan[0]),
    cardId: "card-operation-b-worked",
    position: 4,
    operationId: "operation-b"
  };
  const practice = {
    ...structuredClone(fixture.specification.cardPlan[1]),
    cardId: "card-operation-b-practice",
    position: 5,
    operationId: "operation-b",
    learningFunction: "guided_practice",
    variationFocus: "Aplicar a segunda operação a um caso próprio."
  };
  delete practice.singlePracticeRationale;
  fixture.specification.cardPlan.push(workedExample, practice);

  assert.throws(
    () => validateSpecification(fixture),
    (error) => error?.code === "invalid_plan"
      && error?.details?.reason === "insufficient_practice"
      && error?.details?.operationId === "operation-b"
  );

  practice.learningFunction = "independent_practice";
  practice.singlePracticeRationale =
    "A segunda operação verifica um fato indivisível sem introduzir procedimento novo.";
  assert.doesNotThrow(() => validateSpecification(fixture));
});

test("termo aprovado fora da cadeia causal não satisfaz pré-requisito da parte", () => {
  const fixture = scenarioFixture(scenarios[3]);
  const termId = "term-external-approved";
  const requiredCard = fixture.specification.cardPlan[1];
  fixture.specification.availableTermIds = [termId];
  requiredCard.requiredTermIds = [termId];
  const ledger = {
    terms: [{
      termId,
      firstTeachingCardId: "card-from-unrelated-part",
      requiredByCardIds: [requiredCard.cardId]
    }]
  };
  const parts = [{
    partKey: "part-unrelated",
    status: "approved",
    submissionMeta: { stateDelta: { introducedTermIds: [termId] } }
  }];

  assert.throws(
    () => validateSpecification(fixture, fixture.specification, {
      stateDelta: { introducedTermIds: [] }
    }, { ledger, parts }),
    /term-required-before-introduction/u
  );

  assert.doesNotThrow(() => validateSpecification(fixture, fixture.specification, {
    stateDelta: { introducedTermIds: [termId] }
  }, { ledger, parts }));
});

test("repetição de uma operação exige variação e redução observável de apoio", () => {
  const duplicateVariation = scenarioFixture(scenarios[4]);
  duplicateVariation.specification.cardPlan[2].variationFocus =
    duplicateVariation.specification.cardPlan[1].variationFocus;
  assert.throws(
    () => validateSpecification(duplicateVariation),
    (error) => error?.code === "invalid_plan"
      && error?.details?.reason === "repeated_variation"
  );

  const noGuidance = scenarioFixture(scenarios[1]);
  noGuidance.specification.cardPlan[1].learningFunction = "independent_practice";
  assert.throws(
    () => validateSpecification(noGuidance),
    (error) => error?.code === "invalid_plan"
      && error?.details?.reason === "missing_support_progression"
  );
});

test("contextAnchors precisa aparecer no enunciado, não apenas no feedback ou na resposta oculta", () => {
  const fixture = scenarioFixture(scenarios[0]);
  const specification = validateSpecification(fixture);
  const card = fixture.fragment.microsequences[0].cards[1];
  card.prompt = "Complete a consulta fornecida.";
  card.code = "SELECT id\nFROM pedidos\n[[WHERE::WHERE|GROUP BY|ORDER BY]] total > 50;";
  card.after = "A tabela pedidos(id, total) deveria usar total > 100.";
  assert.throws(
    () => assertFragmentMatchesSpecification(fixture.fragment, specification),
    (error) => error?.code === "missing_card_context"
      && error?.details?.reason === "missing_from_prompt"
  );
});

test("contextAnchors não pode ser satisfeito por identificador interno de recurso visual", () => {
  const fixture = scenarioFixture(scenarios[3]);
  const planned = fixture.specification.cardPlan[1];
  const actual = fixture.fragment.microsequences[0].cards[1];
  Object.assign(planned, {
    resource: "graph",
    contextAnchors: ["vertex-internal-a"]
  });
  for (const field of ["languageTag", "textDirection"]) delete planned[field];
  Object.assign(actual, {
    resource: "graph",
    title: "Vértice destacado",
    prompt: "Observe os rótulos do grafo.",
    vertices: [
      { id: "vertex-internal-a", label: "Norte", x: 20, y: 50 },
      { id: "vertex-internal-b", label: "Sul", x: 80, y: 50 }
    ],
    edges: [{ from: "vertex-internal-a", to: "vertex-internal-b", label: "liga" }],
    highlight: { vertices: ["vertex-internal-a"] },
    question: "Qual rótulo pertence ao vértice destacado?",
    options: choices("Norte", "Sul", "Leste"),
    answer: "a",
    after: "O identificador interno do vértice destacado é vertex-internal-a."
  });
  for (const field of ["text", "languageTag", "textDirection"]) delete actual[field];

  const specification = validateSpecification(fixture);
  assert.throws(
    () => assertFragmentMatchesSpecification(fixture.fragment, specification),
    (error) => error?.code === "missing_card_context"
      && error?.details?.anchor === "vertex-internal-a"
  );

  specification.cardPlan[1].contextAnchors = ["Norte"];
  assert.equal(assertFragmentMatchesSpecification(fixture.fragment, specification), true);

  specification.cardPlan[1].contextAnchors = ["Vértice destacado"];
  assert.equal(
    assertFragmentMatchesSpecification(fixture.fragment, specification),
    true,
    "O título é conteúdo visível antes da resposta e pode materializar o contexto."
  );
});

test("cada resultado da parte precisa chegar a uma prática observável", () => {
  const fixture = scenarioFixture(scenarios[4]);
  fixture.specification.outcomeIds.push("outcome-direito-secondary");
  fixture.specification.cardPlan[0].outcomeIds = ["outcome-direito-secondary"];
  assert.throws(
    () => validateSpecification(fixture),
    (error) => error?.code === "invalid_plan"
      && error?.details?.reason === "outcome_without_observable_practice"
      && error?.details?.outcomeId === "outcome-direito-secondary"
  );
});

test("linguagem de código e notação não podem mudar entre plano e submissão", () => {
  const sql = scenarioFixture(scenarios[0]);
  const sqlSpecification = validateSpecification(sql);
  sql.fragment.microsequences[0].cards[1].language = "mysql";
  assert.throws(
    () => assertFragmentMatchesSpecification(sql.fragment, sqlSpecification),
    (error) => error?.code === "part_plan_mismatch" && /linguagem de código/u.test(error.message)
  );

  const statistics = scenarioFixture(scenarios[1]);
  const statisticsSpecification = validateSpecification(statistics);
  statistics.fragment.microsequences[0].cards[1].notation = "chemistry";
  assert.throws(
    () => assertFragmentMatchesSpecification(statistics.fragment, statisticsSpecification),
    (error) => error?.code === "part_plan_mismatch" && /notação/u.test(error.message)
  );
});

test("code gap inválido e fórmula livre são recusados antes da auditoria", () => {
  const sql = scenarioFixture(scenarios[0]);
  sql.fragment.microsequences[0].cards[1].code = "SELECT id FROM pedidos WHERE total > 100;";
  assert.throws(
    () => validateAuthoringFragment(sql.fragment),
    (error) => error?.code === "invalid_fragment" && /code gap/u.test(error.message)
  );

  const chemistry = scenarioFixture(scenarios[2]);
  const formula = chemistry.fragment.microsequences[0].cards[1];
  delete formula.expression;
  formula.latex = "CO_2";
  assert.throws(
    () => validateAuthoringFragment(chemistry.fragment),
    (error) => error?.code === "invalid_fragment" && /schema|expression/iu.test(error.message)
  );
});

test("escrita não latina é preservada e controles bidirecionais invisíveis são recusados", () => {
  const arabic = scenarioFixture(scenarios[3]);
  assert.deepEqual(validateAuthoringFragment(arabic.fragment), {
    kind: "microsequence_part",
    count: 1
  });
  arabic.fragment.microsequences[0].cards[1].question += "\u202E";
  assert.throws(
    () => validateAuthoringFragment(arabic.fragment),
    (error) => error?.code === "invalid_fragment_encoding"
      && error?.details?.reason === "forbidden_bidi_control"
  );
});

test("plano explicita ausência de pré-requisitos e usa idioma BCP 47", async () => {
  const plan = JSON.parse(await fs.readFile(
    new URL("../../authoring/examples/02-plan.json", import.meta.url),
    "utf8"
  ));
  assert.doesNotThrow(() => validatePlanPayload({ requestId: "plan-pedagogy-0001", plan }, RUN_ID));

  const missingPrerequisites = structuredClone(plan);
  delete missingPrerequisites.course.prerequisites;
  assert.throws(
    () => validatePlanPayload({ requestId: "plan-pedagogy-0002", plan: missingPrerequisites }, RUN_ID),
    (error) => error?.code === "invalid_plan"
      && error?.details?.path === "plan.course.prerequisites"
  );

  const invalidLanguage = structuredClone(plan);
  invalidLanguage.course.language = "Português";
  assert.throws(
    () => validatePlanPayload({ requestId: "plan-pedagogy-0003", plan: invalidLanguage }, RUN_ID),
    (error) => error?.code === "invalid_plan"
      && error?.details?.reason === "invalid_language_tag"
  );
});

test("fonte volátil exige data de acesso verificável", () => {
  const source = {
    sourceId: "source-law-current",
    title: "Texto normativo oficial",
    kind: "standard",
    locator: "https://example.test/norma",
    excerpt: "Regra vigente na data indicada.",
    stability: "volatile"
  };
  assert.throws(
    () => validateLedgerChunkPayload({
      requestId: "ledger-volatile-0001",
      planHash: PLAN_HASH,
      items: [source]
    }, { section: "sources" }),
    (error) => error?.code === "invalid_plan"
      && error?.details?.reason === "required_for_volatile_source"
  );
  source.accessedOn = "2026-07-22";
  assert.doesNotThrow(() => validateLedgerChunkPayload({
    requestId: "ledger-volatile-0002",
    planHash: PLAN_HASH,
    items: [source]
  }, { section: "sources" }));
});
