import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";

import {
  assertFragmentMatchesSpecification,
  validateAuthoringFragment
} from "../../supabase/functions/_shared/aralearn-authoring/canonical.js";
import { buildNextPart } from "../../supabase/functions/_shared/aralearn-authoring/continuity.js";
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
        conceptIds: [`concept-${scenario.id}`],
        retrievedConceptIds: [],
        misconceptionIds: [],
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
        conceptIds: [`concept-${scenario.id}`],
        retrievedConceptIds: [`concept-${scenario.id}`],
        misconceptionIds: [`misconception-${scenario.id}`],
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
        introducedTermIds: [],
        requiredTermIds: [],
        sourceIds: [],
        claimIds: []
      }))
    ],
    allowedSourceIds: [],
    availableTermIds: [],
    conceptIds: [`concept-${scenario.id}`],
    operationIds: [operationId],
    misconceptionIds: [`misconception-${scenario.id}`],
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
    outcomeIds: specification.outcomeIds,
    conceptIds: specification.conceptIds,
    operationIds: specification.operationIds,
    misconceptionIds: specification.misconceptionIds
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
      conceptMap: runOverrides.conceptMap || {
        concepts: fixture.specification.conceptIds.map((id) => ({ id, label: id })),
        relations: []
      },
      operations: runOverrides.operations || fixture.specification.operationIds.map((id) => {
        const resources = [...new Set(
          specification.cardPlan
            .filter((card) => card.operationId === id)
            .map((card) => card.resource)
        )];
        const allowedResources = resources.length > 0 ? resources : ["paragraph"];
        return {
          id,
          label: id,
          evidence: "Resposta observável.",
          representation: {
            preferredResources: allowedResources.slice(0, 4),
            allowedResources,
            rationale: "Os recursos correspondem aos cards usados pelo cenário de teste."
          }
        };
      }),
      misconceptions: fixture.specification.misconceptionIds.map((id) => ({
        id,
        statement: "Erro previsível.",
        correctionEvidence: "A resposta correta refuta o erro."
      })),
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

test("prática sem foundation nem worked example anterior da mesma operação é rejeitada", () => {
  const fixture = scenarioFixture(scenarios[0]);
  fixture.specification.cardPlan[0].operationId = "operation-unrelated";
  fixture.specification.operationIds.push("operation-unrelated");
  assert.throws(
    () => validateSpecification(fixture),
    (error) => error?.code === "invalid_plan"
      && error?.details?.reason === "missing_instructional_predecessor"
      && error?.details?.path === "specification.cardPlan[1].learningFunction"
  );
});

test("foundation anterior da mesma operação satisfaz a continuidade causal", () => {
  const fixture = scenarioFixture(scenarios[0]);
  fixture.specification.cardPlan[0].learningFunction = "foundation";
  assert.doesNotThrow(() => validateSpecification(fixture));
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
    }],
    introducedConcepts: [{
      conceptId: practice.conceptIds[0],
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
      && error?.details?.reason === "missing_instructional_predecessor"
  );
});

test("retomada conceitual exige introdução anterior na mesma cadeia causal", () => {
  const fixture = scenarioFixture(scenarios[3]);
  const [, practice] = fixture.specification.cardPlan;
  const [microsequence] = fixture.specification.structure.microsequences;
  fixture.specification.cardPlan = [{ ...practice, position: 1 }];
  fixture.specification.dependsOnPartKeys = ["part-approved"];
  microsequence.dependsOn = ["micro-approved"];
  microsequence.dependencyRationale = {
    "micro-approved": "Retoma o conceito e a operação apresentados na parte aprovada."
  };
  const baseContinuity = {
    dependencyMicrosequenceIds: ["micro-approved"],
    workedOperations: [{
      operationId: practice.operationId,
      microsequenceId: "micro-approved"
    }]
  };

  assert.throws(
    () => validateSpecification(fixture, fixture.specification, baseContinuity),
    (error) => error?.code === "invalid_plan"
      && error?.details?.reason === "concept_retrieved_before_introduction"
  );

  assert.doesNotThrow(() => validateSpecification(
    fixture,
    fixture.specification,
    {
      ...baseContinuity,
      introducedConcepts: [{
        conceptId: practice.conceptIds[0],
        microsequenceId: "micro-approved"
      }]
    }
  ));
});

test("requires exige pré-requisitos diretos e transitivos antes da prática", () => {
  const fixture = scenarioFixture(scenarios[0]);
  const dependentConceptId = fixture.specification.conceptIds[0];
  const prerequisiteConceptId = "concept-sql-filter";
  const rootConceptId = "concept-sql-boolean";
  fixture.specification.conceptIds.push(prerequisiteConceptId, rootConceptId);
  const conceptMap = {
    concepts: [
      { id: dependentConceptId, label: "Consulta filtrada" },
      { id: prerequisiteConceptId, label: "Condição de filtro" },
      { id: rootConceptId, label: "Expressão booleana" }
    ],
    relations: [
      {
        from: dependentConceptId,
        to: prerequisiteConceptId,
        relation: "requires"
      },
      {
        from: prerequisiteConceptId,
        to: rootConceptId,
        relation: "requires"
      }
    ]
  };

  assert.throws(
    () => validateSpecification(fixture, fixture.specification, {}, { conceptMap }),
    (error) => error?.code === "invalid_plan"
      && error?.details?.reason === "concept_prerequisite_not_presented"
      && error?.details?.prerequisiteConceptId === prerequisiteConceptId
  );

  fixture.specification.cardPlan[0].conceptIds.push(prerequisiteConceptId);
  assert.throws(
    () => validateSpecification(fixture, fixture.specification, {}, { conceptMap }),
    (error) => error?.code === "invalid_plan"
      && error?.details?.reason === "concept_prerequisite_not_presented"
      && error?.details?.prerequisiteConceptId === rootConceptId
  );

  fixture.specification.cardPlan[0].conceptIds.push(rootConceptId);
  assert.doesNotThrow(() =>
    validateSpecification(fixture, fixture.specification, {}, { conceptMap })
  );
});

test("requires aceita pré-requisito apresentado por uma dependência aprovada", () => {
  const fixture = scenarioFixture(scenarios[3]);
  const [workedExample, practice] = fixture.specification.cardPlan;
  const [microsequence] = fixture.specification.structure.microsequences;
  const dependentConceptId = practice.conceptIds[0];
  const prerequisiteConceptId = "concept-escrita-arabe";
  fixture.specification.cardPlan = [{ ...practice, position: 1 }];
  fixture.specification.dependsOnPartKeys = ["part-approved"];
  microsequence.dependsOn = ["micro-approved"];
  microsequence.dependencyRationale = {
    "micro-approved": "Retoma a operação, o conceito e seu pré-requisito já aprovados."
  };
  const conceptMap = {
    concepts: [
      { id: dependentConceptId, label: "Reconhecimento lexical" },
      { id: prerequisiteConceptId, label: "Formas escritas em árabe" }
    ],
    relations: [{
      from: dependentConceptId,
      to: prerequisiteConceptId,
      relation: "requires"
    }]
  };
  const continuity = {
    dependencyMicrosequenceIds: ["micro-approved"],
    workedOperations: [{
      operationId: workedExample.operationId,
      microsequenceId: "micro-approved"
    }],
    introducedConcepts: [
      { conceptId: dependentConceptId, microsequenceId: "micro-approved" },
      { conceptId: prerequisiteConceptId, microsequenceId: "micro-approved" }
    ]
  };

  assert.doesNotThrow(() =>
    validateSpecification(fixture, fixture.specification, continuity, { conceptMap })
  );

  continuity.introducedConcepts.pop();
  assert.throws(
    () => validateSpecification(fixture, fixture.specification, continuity, { conceptMap }),
    (error) => error?.code === "invalid_plan"
      && error?.details?.reason === "concept_prerequisite_not_presented"
      && error?.details?.prerequisiteConceptId === prerequisiteConceptId
  );
});

test("prática declara como retomados todos os conceitos que mobiliza", () => {
  const fixture = scenarioFixture(scenarios[3]);
  fixture.specification.cardPlan[1].retrievedConceptIds = [];
  assert.throws(
    () => validateSpecification(fixture),
    (error) => error?.code === "invalid_plan"
      && error?.details?.reason === "practice_concept_not_retrieved"
  );
});

test("uma prática observável pode ser suficiente sem campo especial no contrato", () => {
  const fixture = scenarioFixture(scenarios[3]);
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

test("repetição de uma operação exige variação e não pode inverter a redução de apoio", () => {
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
  noGuidance.specification.cardPlan[2].learningFunction = "guided_practice";
  assert.throws(
    () => validateSpecification(noGuidance),
    (error) => error?.code === "invalid_plan"
      && error?.details?.reason === "inverted_support_progression"
  );

  const earlyIndependent = scenarioFixture(scenarios[1]);
  const lateIndependent = structuredClone(earlyIndependent.specification.cardPlan[2]);
  earlyIndependent.specification.cardPlan[1].learningFunction = "independent_practice";
  earlyIndependent.specification.cardPlan[2].learningFunction = "guided_practice";
  lateIndependent.cardId = `${lateIndependent.cardId}-late`;
  lateIndependent.position = 4;
  lateIndependent.learningFunction = "independent_practice";
  lateIndependent.variationFocus = "Aplicar a operação depois da orientação, em outro caso.";
  earlyIndependent.specification.cardPlan.push(lateIndependent);
  assert.throws(
    () => validateSpecification(earlyIndependent),
    (error) => error?.code === "invalid_plan"
      && error?.details?.reason === "inverted_support_progression"
      && error?.details?.path === "specification.cardPlan[1].learningFunction"
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

test("contextAnchors compara conteúdo visível com normalização Unicode, de caixa e espaços internos", () => {
  const fixture = scenarioFixture(scenarios[2]);
  fixture.specification.cardPlan[1].contextAnchors = [
    "co₂",
    "DOIS A\u0301TOMOS   DE OXIGE\u0302NIO"
  ];
  const specification = validateSpecification(fixture);

  assert.equal(
    assertFragmentMatchesSpecification(fixture.fragment, specification),
    true
  );
});

test("contextAnchors rejeita espaços nas extremidades em vez de corrigi-los silenciosamente", () => {
  const fixture = scenarioFixture(scenarios[2]);
  fixture.specification.cardPlan[1].contextAnchors = [" co₂ "];

  assert.throws(
    () => validateSpecification(fixture),
    (error) => error?.code === "invalid_plan"
      && error?.details?.path === "specification.cardPlan[1].contextAnchors"
      && error?.details?.reason === "invalid_item"
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

test("plano rejeita ciclo nas relações formais requires", async () => {
  const plan = JSON.parse(await fs.readFile(
    new URL("../../authoring/examples/02-plan.json", import.meta.url),
    "utf8"
  ));
  plan.conceptMap.relations.push({
    from: "concept-verdade",
    to: "concept-conjuncao",
    relation: "requires"
  });

  assert.throws(
    () => validatePlanPayload({ requestId: "plan-concept-cycle-0001", plan }, RUN_ID),
    (error) => error?.code === "invalid_plan"
      && error?.details?.reason === "concept_requirement_cycle"
  );
});

test("plano percorre uma cadeia extensa de pré-requisitos sem recursão", async () => {
  const plan = JSON.parse(await fs.readFile(
    new URL("../../authoring/examples/02-plan.json", import.meta.url),
    "utf8"
  ));
  const chainLength = 9000;
  const basePart = plan.parts[0];
  const conceptIdsByPart = Array.from({ length: 9 }, () => []);
  for (let index = 0; index < chainLength; index += 1) {
    const conceptId = `concept-chain-${index}`;
    plan.conceptMap.concepts.push({
      id: conceptId,
      label: `Conceito ${index}`
    });
    conceptIdsByPart[Math.floor(index / 1000)].push(conceptId);
    if (index > 0) {
      plan.conceptMap.relations.push({
        from: conceptId,
        to: `concept-chain-${index - 1}`,
        relation: "requires"
      });
    }
  }
  plan.parts.push(...conceptIdsByPart.map((conceptIds, index) => ({
    ...structuredClone(basePart),
    key: `part-chain-${index}`,
    title: `Parte ${index}`,
    dependsOnPartKeys: index === 0
      ? [basePart.key]
      : [`part-chain-${index - 1}`],
    ownership: {
      ...structuredClone(basePart.ownership),
      microsequenceIds: [`micro-chain-${index}`]
    },
    cardIds: [`card-chain-${index}`],
    conceptIds
  })));

  let validated;
  assert.doesNotThrow(
    () => {
      validated = validatePlanPayload({
        requestId: "plan-concept-chain-0001",
        plan
      }, RUN_ID);
    }
  );
  const outline = validated.plan.parts.at(-1);
  const next = await buildNextPart({
    runId: RUN_ID,
    planHash: PLAN_HASH,
    brief: {},
    nextPart: {
      partKey: outline.key,
      position: validated.plan.parts.length - 1,
      outline
    },
    plan: validated.plan
  });
  assert.equal(next.concepts.length, chainLength);
  assert.equal(
    next.conceptRelations.filter((relation) => relation.relation === "requires").length,
    chainLength - 1
  );
});

test("next_part expõe somente o fecho causal pertinente do mapa conceitual", async () => {
  const fixture = scenarioFixture(scenarios[0]);
  const outline = outlineOf(fixture.specification);
  const assignedConceptId = fixture.specification.conceptIds[0];
  const prerequisiteConceptId = "concept-filter-condition";
  const rootConceptId = "concept-boolean-expression";
  const unrelatedConceptId = "concept-unrelated";
  const conceptMap = {
    concepts: [
      { id: assignedConceptId, label: "Consulta filtrada" },
      { id: prerequisiteConceptId, label: "Condição de filtro" },
      { id: rootConceptId, label: "Expressão booleana" },
      { id: unrelatedConceptId, label: "Agregação" }
    ],
    relations: [
      { from: assignedConceptId, to: prerequisiteConceptId, relation: "requires" },
      { from: prerequisiteConceptId, to: rootConceptId, relation: "requires" },
      { from: prerequisiteConceptId, to: rootConceptId, relation: "represents" },
      { from: assignedConceptId, to: unrelatedConceptId, relation: "contrasts" }
    ]
  };
  const run = {
    runId: RUN_ID,
    planHash: PLAN_HASH,
    brief: {},
    nextPart: {
      partKey: fixture.partKey,
      position: 0,
      outline
    },
    plan: {
      project: fixture.project,
      ledger: { sources: [], claims: [], terms: [], openIssues: [] },
      learningOutcomes: [{
        id: fixture.specification.outcomeIds[0],
        statement: "Filtrar uma consulta.",
        evidence: "Completar a cláusula adequada."
      }],
      conceptMap,
      operations: [],
      misconceptions: []
    }
  };

  const next = await buildNextPart(run);
  assert.deepEqual(
    next.concepts.map((concept) => concept.id),
    [assignedConceptId, prerequisiteConceptId, rootConceptId]
  );
  assert.deepEqual(next.conceptRelations, conceptMap.relations.slice(0, 3));

  run.nextPart = {
    ...run.nextPart,
    specification: fixture.specification,
    status: "planned",
    attempt: 0
  };
  run.parts = [];
  run.continuity = {};
  const build = await buildNextPart(run);
  assert.deepEqual(
    build.concepts.map((concept) => concept.id),
    [assignedConceptId, prerequisiteConceptId, rootConceptId]
  );
  assert.deepEqual(build.conceptRelations, conceptMap.relations.slice(0, 3));
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

test("resource fora da política formal da operação é rejeitado", () => {
  const fixture = scenarioFixture(scenarios[0]);
  assert.throws(
    () => validateSpecification(fixture, fixture.specification, {}, {
      operations: [{
        id: "operation-sql",
        label: "Filtrar linhas",
        evidence: "Produzir a cláusula que filtra as linhas.",
        representation: {
          preferredResources: ["table"],
          allowedResources: ["table"],
          rationale: "A tabela preserva linhas e colunas."
        }
      }]
    }),
    (error) => error?.details?.reason === "resource_not_allowed_for_operation"
  );
});

test("prática usa um recurso preferencial da operação", () => {
  const fixture = scenarioFixture(scenarios[3]);
  assert.throws(
    () => validateSpecification(fixture, fixture.specification, {}, {
      operations: [{
        id: "operation-arabe",
        label: "Reconhecer a forma escrita",
        evidence: "Selecionar a forma que corresponde ao enunciado.",
        representation: {
          preferredResources: ["paragraph"],
          allowedResources: ["paragraph", "choice"],
          rationale: "O parágrafo apresenta a forma; a escolha registra a discriminação."
        }
      }]
    }),
    (error) => error?.details?.reason === "preferred_resource_missing"
      && error?.details?.practiceRequired === true
  );
});
