import test from "node:test";
import assert from "node:assert/strict";

import { buildDeterministicCardPlan } from "../../src/generation/planning/buildDeterministicCardPlan.js";
import { buildMicrosequenceDraftContract } from "../../src/generation/contracts/buildMicrosequenceDraftContract.js";
import { buildMicrosequencePlanningContract } from "../../src/generation/planning/buildMicrosequencePlanningContract.js";
import { buildMicrosequenceGenerationContract } from "../../src/generation/contracts/buildMicrosequenceGenerationContract.js";
import { buildMicrosequenceDraftPrompt } from "../../src/generation/prompts/buildMicrosequenceDraftPrompt.js";
import { buildMicrosequenceGenerationPrompt } from "../../src/generation/prompts/buildMicrosequenceGenerationPrompt.js";
import { validateGeneratedCards } from "../../src/generation/validation/validateGeneratedCards.js";
import { validateMicrosequenceDraft } from "../../src/generation/validation/validateMicrosequenceDraft.js";

function buildPlanningContract() {
  return buildMicrosequencePlanningContract({
    selectedCourse: { id: "course-a", title: "Curso A" },
    selectedModule: { id: "module-a", title: "Módulo A", guide: { goal: "Guia do módulo.", include: ["conjunção"], exclude: ["predicados"], notation: ["Use P e Q."], avoid: ["Não abrir outro tópico."] } },
    selectedLesson: {
      id: "lesson-a",
      title: "Lição A",
      guide: {
        goal: "Explicar a conjunção.",
        include: ["conjunção"],
        exclude: ["predicados"],
        notation: ["Use P e Q."],
        avoid: ["Não abrir outro tópico."]
      }
    },
    targetMicrosequence: {
      id: "micro-a",
      title: "Quando P e Q são verdadeiras",
      goal: "Reconhecer a linha verdadeira da conjunção.",
      role: "explain",
      dependsOn: [],
      covers: ["conjunção"],
      checks: ["o aluno reconhece a regra central"]
    },
    userPrompt: "Foque na regra central.",
    attachedSources: [
      {
        id: "attachment_1",
        name: "Resumo da aula.md",
        kind: "text",
        textContent: "A conjunção só é verdadeira quando P e Q são verdadeiras. Use a tabela-verdade apenas para esse caso."
      }
    ],
    userSelectedSourceIds: ["attachment_1"],
    userSelectedExtraResourceTypes: ["graph"],
    requestContext: {
      mode: "generate",
      preferredResource: "graph",
      selectedRefs: ["Microssequência anterior"]
    },
    contextPacket: {
      refs: {
        selected: ["Microssequência anterior"],
        items: [
          {
            title: "Microssequência anterior",
            goal: "Retomar a leitura de V e F antes da regra principal.",
            role: "review",
            covers: ["conjunção"],
            checks: ["o aluno lê V e F"],
            dependency: true,
            selected: true
          }
        ]
      },
      next: {
        title: "Tabela-verdade da conjunção",
        goal: "Aplicar a regra na tabela-verdade.",
        role: "practice",
        covers: ["tabela-verdade"],
        checks: ["o aluno encontra a linha verdadeira"]
      },
      microsequence: {
        existingCards: [
          { position: 1, resource: "paragraph", kind: "theory", exercise: "none", title: "Introdução" }
        ],
        currentCards: [
          {
            position: 1,
            resource: "paragraph",
            kind: "theory",
            exercise: "none",
            title: "Introdução",
            text: "A conjunção só é verdadeira quando P e Q são verdadeiras.",
            after: "As duas partes precisam ser verdadeiras."
          }
        ]
      }
    }
  });
}

function buildSlotPlan(planningContract, type = "concept", size = "medium") {
  return buildDeterministicCardPlan({
    type,
    size,
    packet: { currentMicrosequence: planningContract.microsequence }
  });
}

function buildValidatedDraftPlan({
  planningContract,
  type = "concept",
  size = "medium",
  extraResources = [],
  draft
}) {
  const slotPlan = buildSlotPlan(planningContract, type, size);
  const validatedPlan = {
    plan: {
      type,
      size,
      goal: planningContract.microsequence.goal,
      extraResources,
      sources: [],
      reason: "Plano local validado.",
      slotPlan
    }
  };
  const draftContract = buildMicrosequenceDraftContract({
    planningContract,
    validatedPlan
  });
  const validatedDraft = validateMicrosequenceDraft({ draft }, draftContract);
  assert.equal(validatedDraft.ok, true);
  return {
    draftContract,
    validatedPlan: {
      plan: {
        ...validatedPlan.plan,
        cardPlan: validatedDraft.plan
      }
    }
  };
}

test("o prompt de geração usa envelope JSON enxuto e sem políticas antigas", () => {
  const planningContract = buildPlanningContract();
  const { validatedPlan } = buildValidatedDraftPlan({
    planningContract,
    draft: [
      { position: 1, resource: "paragraph", kind: "theory", exercise: "none", goal: "Explicar a regra." },
      { position: 2, resource: "table", kind: "theory", exercise: "none", goal: "Mostrar um caso mínimo." },
      { position: 3, resource: "paragraph", kind: "exercise", exercise: "gap", goal: "Cobrar a leitura principal." },
      { position: 4, resource: "choice", kind: "exercise", exercise: "choice", goal: "Separar a leitura correta do erro." },
      { position: 5, resource: "paragraph", kind: "theory", exercise: "none", goal: "Consolidar a regra." }
    ]
  });
  const generationContract = buildMicrosequenceGenerationContract({
    planningContract,
    validatedPlan
  });
  const prompt = buildMicrosequenceGenerationPrompt(generationContract);
  const envelope = JSON.parse(prompt.split("\n").slice(1).join("\n"));

  assert.equal(envelope.task, "bottom_up_card_build");
  assert.ok(envelope.guide);
  assert.ok(envelope.microsequence);
  assert.ok(Array.isArray(envelope.plan));
  assert.ok(envelope.schemas);
  assert.ok(Array.isArray(envelope.rules));
  assert.deepEqual(envelope.output, { format: "json", cardCount: 5 });

  [
    "weakModelMode",
    "meticulousPolicy",
    "productionPolicy",
    "representationPolicy",
    "model.capabilities"
  ].forEach((token) => {
    assert.equal(prompt.includes(token), false, token);
  });
});

test("o prompt de draft usa envelope curto com plano didático e recursos permitidos", () => {
  const planningContract = buildPlanningContract();
  const slotPlan = buildSlotPlan(planningContract, "concept", "medium");
  const draftContract = buildMicrosequenceDraftContract({
    planningContract,
    validatedPlan: {
      plan: {
        type: "concept",
        size: "medium",
        goal: planningContract.microsequence.goal,
        extraResources: ["graph"],
        sources: ["attachment_1"],
        reason: "Abrir com explicação, exemplo, prática e fechamento.",
        slotPlan
      }
    }
  });
  const prompt = buildMicrosequenceDraftPrompt(draftContract);
  const envelope = JSON.parse(prompt.split("\n").slice(1).join("\n"));

  assert.equal(envelope.task, "bottom_up_card_plan");
  assert.ok(Array.isArray(envelope.plan));
  assert.ok(Array.isArray(envelope.resources));
  assert.ok(Array.isArray(envelope.sources));
  assert.ok(Array.isArray(envelope.rules));
  assert.deepEqual(envelope.output, { format: "json", cardCount: 5 });
  assert.deepEqual(Object.keys(envelope.plan[0]), ["position", "role", "goal", "checks", "shape"]);
  assert.equal(envelope.request.preferredResource, "graph");
  assert.equal(envelope.rules.some((rule) => String(rule).includes("table/gap")), true);
  assert.equal(envelope.rules.some((rule) => String(rule).includes("discriminating alternatives")), true);
  assert.equal(envelope.rules.some((rule) => String(rule).includes("preferredResource=graph")), true);
  assert.equal(prompt.includes("schemas"), false);
});

test("o draft reforça variedade de recurso quando a microssequência combina mais de um subtema", () => {
  const planningContract = buildPlanningContract();
  planningContract.microsequence.covers = ["conjunção", "tabela-verdade"];
  planningContract.guide.include = ["conjunção", "tabela-verdade"];
  const slotPlan = buildSlotPlan(planningContract, "concept", "medium");
  const draftContract = buildMicrosequenceDraftContract({
    planningContract,
    validatedPlan: {
      plan: {
        type: "concept",
        size: "medium",
        goal: planningContract.microsequence.goal,
        extraResources: ["graph"],
        sources: ["attachment_1"],
        reason: "Abrir com explicação, exemplo, prática e fechamento.",
        slotPlan
      }
    }
  });

  assert.equal(
    draftContract.rules.some((rule) => String(rule).includes("Do not collapse every slot into the same resource")),
    true
  );
});

test("o contrato local de planejamento usa apenas os nomes novos", () => {
  const contract = buildPlanningContract();
  assert.equal(contract.task, "bottom_up_micro_plan");
  assert.ok(contract.guide);
  assert.ok(contract.microsequence);
  assert.ok(contract.request);
  assert.equal(contract.request.prompt, "Foque na regra central.");
  assert.equal(contract.request.mode, "generate");
  assert.equal(contract.request.preferredResource, "graph");
  assert.deepEqual(contract.request.extraResources, ["graph"]);
  assert.equal(contract.sources[0].id, "attachment_1");
  assert.equal(contract.sources[0].kind, "text");
  assert.match(contract.sources[0].summary, /conjunção só é verdadeira/i);
  assert.deepEqual(contract.context.selectedRefs, ["Microssequência anterior"]);
  assert.deepEqual(contract.context.refs, [
    {
      title: "Microssequência anterior",
      goal: "Retomar a leitura de V e F antes da regra principal.",
      role: "review",
      covers: ["conjunção"],
      checks: ["o aluno lê V e F"],
      dependency: true,
      selected: true
    }
  ]);
  assert.equal(contract.context.next?.title, "Tabela-verdade da conjunção");
  assert.deepEqual(contract.context.existingCards, [{ position: 1, resource: "paragraph", kind: "theory", exercise: "none", title: "Introdução" }]);
  assert.equal(contract.context.currentCards[0].text, "A conjunção só é verdadeira quando P e Q são verdadeiras.");
  assert.equal(JSON.stringify(contract).includes("typeId"), false);
  assert.equal(JSON.stringify(contract).includes("sizeId"), false);
  assert.equal(JSON.stringify(contract).includes("microsequenceGoal"), false);
  assert.equal(JSON.stringify(contract).includes("selectedExtraResourceTypes"), false);
  assert.equal(JSON.stringify(contract).includes("sourceUsePlan"), false);
});

test("o envelope final inclui schemas dos recursos realmente escolhidos no card plan", () => {
  const planningContract = buildPlanningContract();
  planningContract.availableResources = ["paragraph", "flow", "graph", "choice"];
  const { validatedPlan } = buildValidatedDraftPlan({
    planningContract,
    type: "guided_practice",
    size: "short",
    draft: [
      { position: 1, resource: "paragraph", kind: "theory", exercise: "none", goal: "Explicar o caso." },
      { position: 2, resource: "flow", kind: "exercise", exercise: "choice", goal: "Cobrar a leitura do processo." },
      { position: 3, resource: "graph", kind: "exercise", exercise: "choice", goal: "Variar a prática no mesmo eixo." }
    ]
  });
  const generationContract = buildMicrosequenceGenerationContract({
    planningContract,
    validatedPlan
  });

  assert.equal(Object.prototype.hasOwnProperty.call(generationContract.schemas, "flow"), true);
  assert.equal(Object.prototype.hasOwnProperty.call(generationContract.schemas, "graph"), true);
  assert.equal(Object.prototype.hasOwnProperty.call(generationContract.schemas, "paragraph"), true);
  assert.equal(Object.prototype.hasOwnProperty.call(generationContract.schemas, "choice"), false);
  assert.ok(generationContract.schemas.flow);
});

test("o contrato final de repair inclui prompt do usuário, cards atuais e regras de preservação local", () => {
  const planningContract = buildPlanningContract();
  planningContract.request.mode = "repair";
  planningContract.request.prompt = "Ajuste apenas a prática para diferenciar melhor o erro comum.";
  const { validatedPlan } = buildValidatedDraftPlan({
    planningContract,
    type: "concept",
    size: "short",
    draft: [
      { position: 1, resource: "paragraph", kind: "theory", exercise: "none", goal: "Explicar a regra." },
      { position: 2, resource: "table", kind: "exercise", exercise: "choice", goal: "Materializar um caso mínimo em prática fechada." },
      { position: 3, resource: "choice", kind: "exercise", exercise: "choice", goal: "Corrigir a prática fechada." }
    ]
  });

  const generationContract = buildMicrosequenceGenerationContract({
    planningContract,
    validatedPlan
  });

  assert.equal(generationContract.request.mode, "repair");
  assert.match(generationContract.request.prompt, /Ajuste apenas a prática/);
  assert.equal(generationContract.context.currentCards.length, 1);
  assert.equal(generationContract.context.currentCards[0].resource, "paragraph");
  assert.equal(generationContract.rules.some((rule) => String(rule).includes("This is a repair request.")), true);
  assert.equal(generationContract.rules.some((rule) => String(rule).includes("Change only what is necessary")), true);
  assert.equal(generationContract.rules.some((rule) => String(rule).includes("context.next")), true);
});

test("o contrato final exige abertura teórica curta e retorno explícito em branch local", () => {
  const planningContract = buildPlanningContract();
  planningContract.microsequence.role = "support";
  planningContract.microsequence.branchOf = "micro-main";
  const { validatedPlan } = buildValidatedDraftPlan({
    planningContract,
    type: "concept",
    size: "long",
    draft: [
      { position: 1, resource: "paragraph", kind: "theory", exercise: "none", goal: "Abrir com a regra local." },
      { position: 2, resource: "paragraph", kind: "theory", exercise: "none", goal: "Dar um exemplo local." },
      { position: 3, resource: "choice", kind: "exercise", exercise: "choice", goal: "Cobrar o núcleo do apoio." },
      { position: 4, resource: "paragraph", kind: "theory", exercise: "none", goal: "Retomar o ponto central." },
      { position: 5, resource: "choice", kind: "exercise", exercise: "choice", goal: "Variar a prática." },
      { position: 6, resource: "choice", kind: "exercise", exercise: "choice", goal: "Corrigir o erro comum." },
      { position: 7, resource: "paragraph", kind: "exercise", exercise: "gap", goal: "Fechar a prática do apoio." },
      { position: 8, resource: "paragraph", kind: "theory", exercise: "none", goal: "Retornar à trilha principal." }
    ]
  });

  const generationContract = buildMicrosequenceGenerationContract({
    planningContract,
    validatedPlan
  });

  assert.equal(generationContract.microsequence.branchOf, "micro-main");
  assert.equal(
    generationContract.rules.some((rule) => String(rule).includes("Keep the first theory card short enough")),
    true
  );
  assert.equal(
    generationContract.rules.some((rule) => String(rule).includes("return to the main track or trilha principal")),
    true
  );
  assert.equal(
    generationContract.rules.some((rule) => String(rule).includes("include the case inside the main field")),
    true
  );
  assert.equal(
    generationContract.rules.some((rule) => String(rule).includes("at least one [[answer::answer|wrong1|wrong2]] pattern")),
    true
  );
});







test("practice_more não pode repetir o mesmo caso do card de prática anterior", () => {
  const planningContract = buildPlanningContract();
  const { validatedPlan } = buildValidatedDraftPlan({
    planningContract,
    type: "guided_practice",
    size: "medium",
    draft: [
      { position: 1, resource: "paragraph", kind: "theory", exercise: "none", goal: "Explicar a regra." },
      { position: 2, resource: "code", kind: "exercise", exercise: "choice", goal: "Cobrar a leitura do caso." },
      { position: 3, resource: "code", kind: "exercise", exercise: "choice", goal: "Variar a prática no mesmo eixo." },
      { position: 4, resource: "choice", kind: "exercise", exercise: "choice", goal: "Separar a leitura correta do erro." },
      { position: 5, resource: "paragraph", kind: "theory", exercise: "none", goal: "Consolidar a regra." }
    ]
  });
  const generationContract = buildMicrosequenceGenerationContract({
    planningContract,
    validatedPlan
  });
  const validation = validateGeneratedCards({
    cards: [
      {
        position: 1,
        resource: "paragraph",
        kind: "theory",
        exercise: "none",
        title: "Regra",
        text: "O comando mostra o estado atual.",
        after: ""
      },
      {
        position: 2,
        resource: "code",
        kind: "exercise",
        exercise: "choice",
        title: "Prática",
        prompt: "Observe o comando.",
        language: "bash",
        code: "git status",
        question: "Qual opção corresponde ao efeito principal do caso mostrado?",
        options: [
          { id: "a", text: "Mostrar o estado atual do repositório" },
          { id: "b", text: "Apagar o histórico local" },
          { id: "c", text: "Criar uma branch remota" }
        ],
        selectionMode: "single",
        selectionCriterion: "correct",
        answerIds: ["a"],
        after: ""
      },
      {
        position: 3,
        resource: "code",
        kind: "exercise",
        exercise: "choice",
        title: "Prática repetida",
        prompt: "Observe o comando.",
        language: "bash",
        code: "git status",
        question: "Qual opção corresponde ao efeito principal do caso mostrado?",
        options: [
          { id: "a", text: "Mostrar o estado atual do repositório" },
          { id: "b", text: "Apagar o histórico local" },
          { id: "c", text: "Criar uma branch remota" }
        ],
        selectionMode: "single",
        selectionCriterion: "correct",
        answerIds: ["a"],
        after: ""
      },
      {
        position: 4,
        resource: "choice",
        kind: "exercise",
        exercise: "choice",
        title: "Erro",
        question: "Qual leitura está correta?",
        options: [
          { id: "a", text: "Inspecionar o estado atual" },
          { id: "b", text: "Apagar o histórico local" },
          { id: "c", text: "Criar uma branch remota" }
        ],
        selectionMode: "single",
        selectionCriterion: "correct",
        answerIds: ["a"],
        after: ""
      },
      {
        position: 5,
        resource: "paragraph",
        kind: "theory",
        exercise: "none",
        title: "Fechamento",
        text: "Use o comando para inspecionar o estado atual.",
        after: ""
      }
    ]
  }, generationContract);

  assert.equal(validation.ok, false);
  assert.equal(
    validation.didacticErrors.some((error) => String(error).includes("practice_more repete o mesmo caso")),
    true
  );
});

test("fix_error não pode reaproveitar o mesmo caso concreto do card anterior", () => {
  const planningContract = buildPlanningContract();
  const { validatedPlan } = buildValidatedDraftPlan({
    planningContract,
    type: "guided_practice",
    size: "medium",
    draft: [
      { position: 1, resource: "paragraph", kind: "theory", exercise: "none", goal: "Explicar a regra." },
      { position: 2, resource: "choice", kind: "exercise", exercise: "choice", goal: "Cobrar a leitura principal." },
      { position: 3, resource: "choice", kind: "exercise", exercise: "choice", goal: "Variar a prática no mesmo eixo." },
      { position: 4, resource: "choice", kind: "exercise", exercise: "choice", goal: "Corrigir um erro provável com outro caso." },
      { position: 5, resource: "paragraph", kind: "theory", exercise: "none", goal: "Consolidar a regra." }
    ]
  });
  const generationContract = buildMicrosequenceGenerationContract({
    planningContract,
    validatedPlan
  });
  const validation = validateGeneratedCards({
    cards: [
      {
        position: 1,
        resource: "paragraph",
        kind: "theory",
        exercise: "none",
        title: "Regra",
        text: "A conjunção só é verdadeira quando P e Q são verdadeiras.",
        after: ""
      },
      {
        position: 2,
        resource: "choice",
        kind: "exercise",
        exercise: "choice",
        title: "Prática",
        question: "Se P é verdadeiro e Q é falso, qual é o valor de P ∧ Q?",
        options: [
          { id: "a", text: "Verdadeira" },
          { id: "b", text: "Falsa" },
          { id: "c", text: "Incerta" }
        ],
        selectionMode: "single",
        selectionCriterion: "correct",
        answerIds: ["b"],
        after: ""
      },
      {
        position: 3,
        resource: "choice",
        kind: "exercise",
        exercise: "choice",
        title: "Variação",
        question: "Se P é falso e Q é verdadeiro, qual é o valor de P ∧ Q?",
        options: [
          { id: "a", text: "Verdadeira" },
          { id: "b", text: "Falsa" },
          { id: "c", text: "Incerta" }
        ],
        selectionMode: "single",
        selectionCriterion: "correct",
        answerIds: ["b"],
        after: ""
      },
      {
        position: 4,
        resource: "choice",
        kind: "exercise",
        exercise: "choice",
        title: "Corrija o erro",
        question: "Se P é falso e Q é verdadeiro, qual é o valor de P ∧ Q?",
        options: [
          { id: "a", text: "Verdadeira" },
          { id: "b", text: "Falsa" },
          { id: "c", text: "Incerta" }
        ],
        selectionMode: "single",
        selectionCriterion: "correct",
        answerIds: ["b"],
        after: ""
      },
      {
        position: 5,
        resource: "paragraph",
        kind: "theory",
        exercise: "none",
        title: "Fechamento",
        text: "A linha verdadeira continua sendo apenas VV.",
        after: ""
      }
    ]
  }, generationContract);

  assert.equal(
    validation.didacticErrors.some((error) => String(error).includes("fix_error repete o mesmo caso") || String(error).includes("fix_error reaproveita o mesmo caso concreto")),
    true
  );
});

test("practice_more com plane não repete o caso quando x e y mudam", () => {
  const planningContract = buildPlanningContract();
  const validatedPlan = {
    plan: {
      type: "concept",
      size: "short",
      goal: "Ler pontos no plano cartesiano.",
      extraResources: ["plane"],
      sources: [],
      reason: "Variar o caso visual no plano.",
      cardPlan: [
        { position: 1, role: "practice", resource: "plane", kind: "exercise", exercise: "choice", goal: "Ler o primeiro caso.", checks: [] },
        { position: 2, role: "practice_more", resource: "plane", kind: "exercise", exercise: "choice", goal: "Variar o caso no plano.", checks: [] },
        { position: 3, role: "next", resource: "paragraph", kind: "theory", exercise: "none", goal: "Consolidar a leitura.", checks: [] }
      ]
    }
  };
  const generationContract = buildMicrosequenceGenerationContract({
    planningContract,
    validatedPlan
  });
  const validation = validateGeneratedCards({
    cards: [
      {
        position: 1,
        resource: "plane",
        kind: "exercise",
        exercise: "choice",
        title: "Caso 1",
        prompt: "Observe o caso no plano.",
        x: [0, 2],
        y: [0, 1],
        question: "Qual ponto está representado neste caso?",
        options: [
          { id: "a", text: "(2, 1)" },
          { id: "b", text: "(1, 2)" },
          { id: "c", text: "(0, 1)" }
        ],
        selectionMode: "single",
        selectionCriterion: "correct",
        answerIds: ["a"],
        after: ""
      },
      {
        position: 2,
        resource: "plane",
        kind: "exercise",
        exercise: "choice",
        title: "Caso 2",
        prompt: "Observe o caso no plano.",
        x: [0, 4],
        y: [0, -1],
        question: "Qual ponto está representado neste caso?",
        options: [
          { id: "a", text: "(4, -1)" },
          { id: "b", text: "(-1, 4)" },
          { id: "c", text: "(0, -1)" }
        ],
        selectionMode: "single",
        selectionCriterion: "correct",
        answerIds: ["a"],
        after: ""
      },
      {
        position: 3,
        resource: "paragraph",
        kind: "theory",
        exercise: "none",
        title: "Fechamento",
        text: "Cada caso muda quando as coordenadas mudam.",
        after: ""
      }
    ]
  }, generationContract);

  assert.equal(
    validation.didacticErrors.some((error) => String(error).includes("repete o mesmo caso") || String(error).includes("reaproveita o mesmo caso concreto")),
    false
  );
});

test("practice_more com plane não repete o caso quando a soma vetorial muda", () => {
  const planningContract = buildPlanningContract();
  const validatedPlan = {
    plan: {
      type: "concept",
      size: "short",
      goal: "Ler soma de vetores no plano.",
      extraResources: ["plane"],
      sources: [],
      reason: "Variar a soma vetorial.",
      cardPlan: [
        { position: 1, role: "practice", resource: "plane", kind: "exercise", exercise: "choice", goal: "Ler a primeira soma.", checks: [] },
        { position: 2, role: "practice_more", resource: "plane", kind: "exercise", exercise: "choice", goal: "Ler outra soma.", checks: [] },
        { position: 3, role: "next", resource: "paragraph", kind: "theory", exercise: "none", goal: "Consolidar a leitura.", checks: [] }
      ]
    }
  };
  const generationContract = buildMicrosequenceGenerationContract({
    planningContract,
    validatedPlan
  });
  const validation = validateGeneratedCards({
    cards: [
      {
        position: 1,
        resource: "plane",
        kind: "exercise",
        exercise: "choice",
        title: "Soma 1",
        prompt: "Observe a soma de vetores.",
        sum: [[1, 0], [0, 2]],
        result: [1, 2],
        question: "Qual resultante aparece neste caso?",
        options: [
          { id: "a", text: "(1, 2)" },
          { id: "b", text: "(2, 1)" },
          { id: "c", text: "(1, 0)" }
        ],
        selectionMode: "single",
        selectionCriterion: "correct",
        answerIds: ["a"],
        after: ""
      },
      {
        position: 2,
        resource: "plane",
        kind: "exercise",
        exercise: "choice",
        title: "Soma 2",
        prompt: "Observe a soma de vetores.",
        sum: [[2, 1], [-1, 3]],
        result: [1, 4],
        question: "Qual resultante aparece neste caso?",
        options: [
          { id: "a", text: "(1, 4)" },
          { id: "b", text: "(4, 1)" },
          { id: "c", text: "(2, 1)" }
        ],
        selectionMode: "single",
        selectionCriterion: "correct",
        answerIds: ["a"],
        after: ""
      },
      {
        position: 3,
        resource: "paragraph",
        kind: "theory",
        exercise: "none",
        title: "Fechamento",
        text: "A resultante muda com os vetores somados.",
        after: ""
      }
    ]
  }, generationContract);

  assert.equal(
    validation.didacticErrors.some((error) => String(error).includes("repete o mesmo caso") || String(error).includes("reaproveita o mesmo caso concreto")),
    false
  );
});

test("fix_error com plane não repete o caso quando a escala muda", () => {
  const planningContract = buildPlanningContract();
  const validatedPlan = {
    plan: {
      type: "concept",
      size: "short",
      goal: "Corrigir leitura de escala vetorial.",
      extraResources: ["plane"],
      sources: [],
      reason: "Corrigir erro em outro caso visual.",
      cardPlan: [
        { position: 1, role: "practice", resource: "plane", kind: "exercise", exercise: "choice", goal: "Ler a primeira escala.", checks: [] },
        { position: 2, role: "fix_error", resource: "plane", kind: "exercise", exercise: "choice", goal: "Corrigir o erro em outra escala.", checks: ["confundir a escala com troca de componentes"] },
        { position: 3, role: "next", resource: "paragraph", kind: "theory", exercise: "none", goal: "Consolidar a leitura.", checks: [] }
      ]
    }
  };
  const generationContract = buildMicrosequenceGenerationContract({
    planningContract,
    validatedPlan
  });
  const validation = validateGeneratedCards({
    cards: [
      {
        position: 1,
        resource: "plane",
        kind: "exercise",
        exercise: "choice",
        title: "Escala 1",
        prompt: "Observe a escala do vetor.",
        scale: { k: 2, vector: [1, 3] },
        result: [2, 6],
        question: "Um aluno confundiu a escala com troca de componentes. Qual leitura corrige esse erro neste caso?",
        options: [
          { id: "a", text: "A escala por 2 leva (1, 3) a (2, 6)." },
          { id: "b", text: "A escala por 2 leva (1, 3) a (3, 1)." },
          { id: "c", text: "A escala por 2 leva (1, 3) a (1, 6)." }
        ],
        selectionMode: "single",
        selectionCriterion: "correct",
        answerIds: ["a"],
        after: ""
      },
      {
        position: 2,
        resource: "plane",
        kind: "exercise",
        exercise: "choice",
        title: "Escala 2",
        prompt: "Observe a escala do vetor.",
        scale: { k: 3, vector: [2, -1] },
        result: [6, -3],
        question: "Um aluno confundiu a escala com troca de componentes. Qual leitura corrige esse erro neste caso?",
        options: [
          { id: "a", text: "A escala por 3 leva (2, -1) a (6, -3)." },
          { id: "b", text: "A escala por 3 leva (2, -1) a (-1, 2)." },
          { id: "c", text: "A escala por 3 leva (2, -1) a (3, -1)." }
        ],
        selectionMode: "single",
        selectionCriterion: "correct",
        answerIds: ["a"],
        after: ""
      },
      {
        position: 3,
        resource: "paragraph",
        kind: "theory",
        exercise: "none",
        title: "Fechamento",
        text: "Escala multiplica as componentes; não troca suas posições.",
        after: ""
      }
    ]
  }, generationContract);

  assert.equal(
    validation.didacticErrors.some((error) => String(error).includes("repete o mesmo caso") || String(error).includes("reaproveita o mesmo caso concreto")),
    false
  );
});

test("practice_more com matrix não repete o caso quando values mudam", () => {
  const planningContract = buildPlanningContract();
  const validatedPlan = {
    plan: {
      type: "concept",
      size: "short",
      goal: "Ler valores em uma matriz.",
      extraResources: ["matrix"],
      sources: [],
      reason: "Variar os valores da matriz.",
      cardPlan: [
        { position: 1, role: "practice", resource: "matrix", kind: "exercise", exercise: "choice", goal: "Ler o primeiro caso.", checks: [] },
        { position: 2, role: "practice_more", resource: "matrix", kind: "exercise", exercise: "choice", goal: "Ler outro caso.", checks: [] },
        { position: 3, role: "next", resource: "paragraph", kind: "theory", exercise: "none", goal: "Consolidar a leitura.", checks: [] }
      ]
    }
  };
  const generationContract = buildMicrosequenceGenerationContract({
    planningContract,
    validatedPlan
  });
  const validation = validateGeneratedCards({
    cards: [
      {
        position: 1,
        resource: "matrix",
        kind: "exercise",
        exercise: "choice",
        title: "Matriz 1",
        prompt: "Observe a matriz.",
        values: [["1", "2"], ["3", "4"]],
        question: "Qual valor aparece na posição (2, 1)?",
        options: [
          { id: "a", text: "3" },
          { id: "b", text: "2" },
          { id: "c", text: "4" }
        ],
        selectionMode: "single",
        selectionCriterion: "correct",
        answerIds: ["a"],
        after: ""
      },
      {
        position: 2,
        resource: "matrix",
        kind: "exercise",
        exercise: "choice",
        title: "Matriz 2",
        prompt: "Observe a matriz.",
        values: [["5", "6"], ["7", "8"]],
        question: "Qual valor aparece na posição (2, 1)?",
        options: [
          { id: "a", text: "7" },
          { id: "b", text: "6" },
          { id: "c", text: "8" }
        ],
        selectionMode: "single",
        selectionCriterion: "correct",
        answerIds: ["a"],
        after: ""
      },
      {
        position: 3,
        resource: "paragraph",
        kind: "theory",
        exercise: "none",
        title: "Fechamento",
        text: "Mudar os valores muda o caso materializado.",
        after: ""
      }
    ]
  }, generationContract);

  assert.equal(
    validation.didacticErrors.some((error) => String(error).includes("repete o mesmo caso") || String(error).includes("reaproveita o mesmo caso concreto")),
    false
  );
});

test("practice_more com matrix não repete o caso quando a sequence muda", () => {
  const planningContract = buildPlanningContract();
  const validatedPlan = {
    plan: {
      type: "concept",
      size: "short",
      goal: "Ler transformações matriciais simples.",
      extraResources: ["matrix"],
      sources: [],
      reason: "Variar a sequência de matrizes.",
      cardPlan: [
        { position: 1, role: "practice", resource: "matrix", kind: "exercise", exercise: "choice", goal: "Ler a primeira sequência.", checks: [] },
        { position: 2, role: "practice_more", resource: "matrix", kind: "exercise", exercise: "choice", goal: "Ler outra sequência.", checks: [] },
        { position: 3, role: "next", resource: "paragraph", kind: "theory", exercise: "none", goal: "Consolidar a leitura.", checks: [] }
      ]
    }
  };
  const generationContract = buildMicrosequenceGenerationContract({
    planningContract,
    validatedPlan
  });
  const validation = validateGeneratedCards({
    cards: [
      {
        position: 1,
        resource: "matrix",
        kind: "exercise",
        exercise: "choice",
        title: "Sequência 1",
        prompt: "Observe a sequência matricial.",
        sequence: [
          { name: "A", values: [["1", "0"], ["0", "1"]] },
          { connector: "→", values: [["1", "1"], ["0", "1"]] }
        ],
        question: "Qual transformação aparece neste caso?",
        options: [
          { id: "a", text: "A matriz identidade passa para uma matriz triangular superior." },
          { id: "b", text: "A matriz identidade passa para uma troca de linhas." },
          { id: "c", text: "A matriz identidade vira matriz nula." }
        ],
        selectionMode: "single",
        selectionCriterion: "correct",
        answerIds: ["a"],
        after: ""
      },
      {
        position: 2,
        resource: "matrix",
        kind: "exercise",
        exercise: "choice",
        title: "Sequência 2",
        prompt: "Observe a sequência matricial.",
        sequence: [
          { name: "B", values: [["2", "0"], ["0", "2"]] },
          { connector: "→", values: [["2", "1"], ["0", "2"]] }
        ],
        question: "Qual transformação aparece neste caso?",
        options: [
          { id: "a", text: "Uma matriz diagonal passa para uma triangular superior com 1 fora da diagonal." },
          { id: "b", text: "A matriz diagonal passa para a matriz nula." },
          { id: "c", text: "A matriz diagonal troca as linhas." }
        ],
        selectionMode: "single",
        selectionCriterion: "correct",
        answerIds: ["a"],
        after: ""
      },
      {
        position: 3,
        resource: "paragraph",
        kind: "theory",
        exercise: "none",
        title: "Fechamento",
        text: "Mudar a sequência também muda o caso visual da matriz.",
        after: ""
      }
    ]
  }, generationContract);

  assert.equal(
    validation.didacticErrors.some((error) => String(error).includes("repete o mesmo caso") || String(error).includes("reaproveita o mesmo caso concreto")),
    false
  );
});

