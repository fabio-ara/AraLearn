import test from "node:test";
import assert from "node:assert/strict";

import { buildMicrosequenceDraftContract } from "../../src/generation/contracts/buildMicrosequenceDraftContract.js";
import { buildMicrosequencePlanningContract } from "../../src/generation/planning/buildMicrosequencePlanningContract.js";
import { getCorrectExerciseOptionIds } from "../../src/core/exerciseOptions.js";
import { resolveAllowedResourceTypes } from "../../src/generation/didactics/microsequenceGenerationRepresentation.js";
import { buildDeepSeekToolPayload, sanitizeDeepSeekStrictSchema } from "../../src/generation/providers/deepSeekPolicy.js";
import { validateMicrosequenceDraft } from "../../src/generation/validation/validateMicrosequenceDraft.js";
import { validateGeneratedCardsDidactic } from "../../src/generation/validation/validateGeneratedCardsDidactic.js";
import { validateGeneratedCardsStructural } from "../../src/generation/validation/validateGeneratedCardsStructural.js";
import { validatePlannedCourse } from "../../src/generation/topDown/validatePlannedCourse.js";

function buildPlanningContract() {
  return buildMicrosequencePlanningContract({
    selectedCourse: { id: "course-a", title: "Curso A" },
    selectedModule: {
      id: "module-a",
      title: "Módulo A",
      guide: {
        goal: "Trabalhar vetores e conjunção.",
        include: ["vetor 2D", "conjunção"],
        exclude: ["predicados"],
        notation: ["Use P e Q."],
        avoid: ["disjunção"]
      }
    },
    selectedLesson: {
      id: "lesson-a",
      title: "Lição A",
      guide: {
        goal: "Explicar vetores e conjunção.",
        include: ["vetor 2D", "conjunção"],
        exclude: ["predicados"],
        notation: ["Use P e Q."],
        avoid: ["disjunção"]
      },
      topics: [
        {
          id: "topic-a",
          label: "Conjunção",
          kind: "concept",
          checks: [],
          errors: ["confundir conjunção com disjunção"]
        }
      ]
    },
    targetMicrosequence: {
      id: "micro-a",
      title: "Vetores e regra",
      goal: "Ler vetor 2D e evitar confundir conjunção com disjunção.",
      role: "practice",
      dependsOn: [],
      covers: ["vetor 2D", "conjunção"],
      checks: ["confundir conjunção com disjunção"]
    },
    requestContext: {
      mode: "generate",
      preferredResource: "plane"
    }
  });
}

function contractFor(card) {
  return {
    plan: [
      {
        position: 1,
        role: card.kind === "exercise" ? "practice" : "explain",
        resource: card.resource,
        kind: card.kind,
        exercise: card.exercise,
        goal: "",
        checks: []
      }
    ],
    output: { cardCount: 1 }
  };
}

test("choice resolve ids encontra a resposta correta por answerIds", () => {
  const correct = getCorrectExerciseOptionIds(
    [
      { id: "a", text: "Errada" },
      { id: "b", text: "Correta" },
      { id: "c", text: "Errada" }
    ],
    ["b"]
  );

  assert.deepEqual(correct, ["b"]);
});

test("choice resolve ids preserva múltiplas respostas esperadas", () => {
  const correct = getCorrectExerciseOptionIds(
    [
      { id: "a", text: "Correta A" },
      { id: "b", text: "Correta B" },
      { id: "c", text: "Errada" }
    ],
    ["a", "b"]
  );

  assert.deepEqual(correct, ["a", "b"]);
});

function structural(card) {
  return validateGeneratedCardsStructural({ cards: [card] }, contractFor(card));
}

function scopeContract() {
  return {
    schemaVersion: "aralearn.scope.v1",
    course: {
      title: "Curso A",
      goal: "Cobrir apenas conjunção."
    },
    modules: [
      {
        title: "Lógica",
        include: ["conjunção"],
        exclude: ["predicados"]
      }
    ]
  };
}

function plannedCourseWithDependsOn(dependsOn = ["Base"], extra = {}) {
  return {
    course: {
      title: "Curso A",
      modules: [
        {
          title: "Lógica",
          guide: {
            goal: "Explicar conjunção.",
            include: ["conjunção"],
            exclude: ["predicados"],
            notation: [],
            avoid: []
          },
          lessons: [
            {
              title: "Conjunção",
              guide: {
                goal: "Explicar conjunção.",
                include: ["conjunção"],
                exclude: ["predicados"],
                notation: [],
                avoid: []
              },
              microsequences: [
                {
                  title: "Base",
                  goal: "Explicar a regra.",
                  role: "explain",
                  dependsOn: [],
                  covers: ["conjunção"],
                  checks: []
                },
                {
                  title: "Prática",
                  goal: "Aplicar a regra.",
                  role: "practice",
                  dependsOn,
                  covers: ["conjunção"],
                  checks: []
                },
                ...((Array.isArray(extra.microsequences) ? extra.microsequences : []))
              ]
            }
          ]
        }
      ]
    }
  };
}

function didacticContract(plan = []) {
  return {
    guide: { exclude: [], avoid: [] },
    plan,
    microsequence: { checks: [] },
    knownErrors: []
  };
}

test("availableResources aceita objetos com id sem liberar o catálogo inteiro", () => {
  assert.deepEqual(
    resolveAllowedResourceTypes({
      availableResources: [{ id: "paragraph", use: "texto" }, { id: "choice", use: "escolha" }],
      requestExtraResources: ["graph"],
      planExtraResources: ["matrix"],
      preferredResource: "plane"
    }),
    ["paragraph", "choice"]
  );
});

test("availableResources com strings preserva apenas o conjunto declarado", () => {
  assert.deepEqual(
    resolveAllowedResourceTypes({
      availableResources: ["paragraph", "choice"],
      requestExtraResources: ["plane"],
      preferredResource: "graph"
    }),
    ["paragraph", "choice"]
  );
});

test("draft contract favorece plane quando disponível e bloqueia plane quando indisponível", () => {
  const planningContract = buildPlanningContract();
  const withPlane = buildMicrosequenceDraftContract({
    planningContract: {
      ...planningContract,
      availableResources: [{ id: "paragraph" }, { id: "choice" }, { id: "plane" }]
    },
    validatedPlan: {
      plan: {
        type: "concept",
        size: "short",
        goal: "Ler vetor 2D no plano cartesiano.",
        extraResources: [],
        sources: [],
        reason: "Usar recurso visual.",
        slotPlan: [
          { position: 1, role: "explain", goal: "Apresentar vetor 2D.", checks: [] },
          { position: 2, role: "practice", goal: "Ler coordenada do vetor no plano.", checks: [] },
          { position: 3, role: "next", goal: "Consolidar a leitura.", checks: [] }
        ]
      }
    }
  });
  assert.equal(withPlane.rules.some((rule) => String(rule).includes("prefer resource=plane")), true);

  const withoutPlane = buildMicrosequenceDraftContract({
    planningContract: {
      ...planningContract,
      availableResources: [{ id: "paragraph" }, { id: "choice" }]
    },
    validatedPlan: {
      plan: {
        type: "concept",
        size: "short",
        goal: "Ler vetor 2D no plano cartesiano.",
        extraResources: [],
        sources: [],
        reason: "Sem plano disponível.",
        slotPlan: [
          { position: 1, role: "explain", goal: "Apresentar vetor 2D.", checks: [] },
          { position: 2, role: "practice", goal: "Ler coordenada do vetor no plano.", checks: [] },
          { position: 3, role: "next", goal: "Consolidar a leitura.", checks: [] }
        ]
      }
    }
  });
  assert.equal(withoutPlane.rules.some((rule) => String(rule).includes("resource=plane is unavailable")), true);
});

test("draft aceita abertura teórica com paragraph quando esse recurso está disponível", () => {
  const planning = buildPlanningContract();
  planning.microsequence.role = "explain";
  const draftContract = buildMicrosequenceDraftContract({
    planningContract: planning,
    validatedPlan: {
      plan: {
        type: "concept",
        size: "short",
        goal: planning.microsequence.goal,
        extraResources: [],
        sources: [],
        reason: "Abrir teoria antes da prática.",
        slotPlan: [
          { position: 1, role: "explain", goal: "Abrir o conceito.", checks: [] },
          { position: 2, role: "practice", goal: "Cobrar a leitura.", checks: [] },
          { position: 3, role: "fix_error", goal: "Corrigir o erro.", checks: [] }
        ]
      }
    }
  });
  const result = validateMicrosequenceDraft({
    draft: [
      { position: 1, resource: "paragraph", kind: "theory", exercise: "none", goal: "Abrir o conceito." },
      { position: 2, resource: "paragraph", kind: "exercise", exercise: "gap", goal: "Cobrar a leitura." },
      { position: 3, resource: "choice", kind: "exercise", exercise: "choice", goal: "Corrigir o erro." }
    ]
  }, draftContract);

  assert.equal(result.ok, true);
});

test("draft aceita abertura teórica com matrix quando há sinal matricial no contrato", () => {
  const planning = buildPlanningContract();
  planning.microsequence.role = "explain";
  planning.microsequence.goal = "Ler uma matriz simples por linha e coluna.";
  planning.request.preferredResource = "matrix";
  const draftContract = buildMicrosequenceDraftContract({
    planningContract: planning,
    validatedPlan: {
      plan: {
        type: "concept",
        size: "short",
        goal: planning.microsequence.goal,
        extraResources: [],
        sources: [],
        reason: "Abrir com representação matricial.",
        slotPlan: [
          { position: 1, role: "explain", goal: "Apresentar a matriz.", checks: ["identificar linha e coluna"] },
          { position: 2, role: "practice", goal: "Cobrar a leitura.", checks: [] },
          { position: 3, role: "fix_error", goal: "Corrigir o erro.", checks: [] }
        ]
      }
    }
  });
  const result = validateMicrosequenceDraft({
    draft: [
      { position: 1, resource: "matrix", kind: "theory", exercise: "none", goal: "Apresentar a matriz." },
      { position: 2, resource: "paragraph", kind: "exercise", exercise: "gap", goal: "Cobrar a leitura." },
      { position: 3, resource: "choice", kind: "exercise", exercise: "choice", goal: "Corrigir o erro." }
    ]
  }, draftContract);

  assert.equal(result.ok, true);
});

test("draft aceita abertura teórica com plane quando há sinal vetorial no contrato", () => {
  const planning = buildPlanningContract();
  planning.microsequence.role = "explain";
  planning.microsequence.goal = "Ler o vetor no plano cartesiano pelas coordenadas.";
  planning.request.preferredResource = "plane";
  const draftContract = buildMicrosequenceDraftContract({
    planningContract: planning,
    validatedPlan: {
      plan: {
        type: "concept",
        size: "short",
        goal: planning.microsequence.goal,
        extraResources: [],
        sources: [],
        reason: "Abrir com plano cartesiano.",
        slotPlan: [
          { position: 1, role: "explain", goal: "Apresentar o vetor.", checks: ["ler coordenadas no plano"] },
          { position: 2, role: "practice", goal: "Cobrar a leitura.", checks: [] },
          { position: 3, role: "fix_error", goal: "Corrigir o erro.", checks: [] }
        ]
      }
    }
  });
  const result = validateMicrosequenceDraft({
    draft: [
      { position: 1, resource: "plane", kind: "theory", exercise: "none", goal: "Apresentar o vetor." },
      { position: 2, resource: "paragraph", kind: "exercise", exercise: "gap", goal: "Cobrar a leitura." },
      { position: 3, resource: "choice", kind: "exercise", exercise: "choice", goal: "Corrigir o erro." }
    ]
  }, draftContract);

  assert.equal(result.ok, true);
});

test("draft rejeita abertura teórica com matrix quando não há sinal matricial", () => {
  const planning = buildPlanningContract();
  planning.microsequence.role = "explain";
  planning.microsequence.goal = "Explicar a regra da conjunção.";
  planning.request.preferredResource = "";
  const draftContract = buildMicrosequenceDraftContract({
    planningContract: planning,
    validatedPlan: {
      plan: {
        type: "concept",
        size: "short",
        goal: planning.microsequence.goal,
        extraResources: [],
        sources: [],
        reason: "Abrir a teoria.",
        slotPlan: [
          { position: 1, role: "explain", goal: "Abrir o conceito.", checks: [] },
          { position: 2, role: "practice", goal: "Cobrar a leitura.", checks: [] },
          { position: 3, role: "fix_error", goal: "Corrigir o erro.", checks: [] }
        ]
      }
    }
  });
  const result = validateMicrosequenceDraft({
    draft: [
      { position: 1, resource: "matrix", kind: "theory", exercise: "none", goal: "Abrir o conceito." },
      { position: 2, resource: "paragraph", kind: "exercise", exercise: "gap", goal: "Cobrar a leitura." },
      { position: 3, resource: "choice", kind: "exercise", exercise: "choice", goal: "Corrigir o erro." }
    ]
  }, draftContract);

  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /abertura teórica precisa usar paragraph/);
});

test("draft rejeita abertura teórica com plane quando não há sinal geométrico ou vetorial", () => {
  const planning = buildPlanningContract();
  planning.microsequence.role = "explain";
  planning.microsequence.goal = "Explicar a regra da conjunção.";
  planning.request.preferredResource = "";
  const draftContract = buildMicrosequenceDraftContract({
    planningContract: planning,
    validatedPlan: {
      plan: {
        type: "concept",
        size: "short",
        goal: planning.microsequence.goal,
        extraResources: [],
        sources: [],
        reason: "Abrir a teoria.",
        slotPlan: [
          { position: 1, role: "explain", goal: "Abrir o conceito.", checks: [] },
          { position: 2, role: "practice", goal: "Cobrar a leitura.", checks: [] },
          { position: 3, role: "fix_error", goal: "Corrigir o erro.", checks: [] }
        ]
      }
    }
  });
  const result = validateMicrosequenceDraft({
    draft: [
      { position: 1, resource: "plane", kind: "theory", exercise: "none", goal: "Abrir o conceito." },
      { position: 2, resource: "paragraph", kind: "exercise", exercise: "gap", goal: "Cobrar a leitura." },
      { position: 3, resource: "choice", kind: "exercise", exercise: "choice", goal: "Corrigir o erro." }
    ]
  }, draftContract);

  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /abertura teórica precisa usar paragraph/);
});

test("draft de branch rejeita fechamento final fora de paragraph quando paragraph está disponível", () => {
  const planning = buildPlanningContract();
  planning.microsequence.role = "support";
  planning.microsequence.branchOf = "micro-base";
  const draftContract = buildMicrosequenceDraftContract({
    planningContract: planning,
    validatedPlan: {
      plan: {
        type: "concept",
        size: "short",
        goal: planning.microsequence.goal,
        extraResources: [],
        sources: [],
        reason: "Fechar um apoio local e voltar à trilha.",
        slotPlan: [
          { position: 1, role: "explain", goal: "Abrir o apoio.", checks: [] },
          { position: 2, role: "practice", goal: "Cobrar o ponto local.", checks: [] },
          { position: 3, role: "next", goal: "Retornar à trilha.", checks: [] }
        ]
      }
    }
  });
  const result = validateMicrosequenceDraft({
    draft: [
      { position: 1, resource: "paragraph", kind: "theory", exercise: "none", goal: "Abrir o apoio." },
      { position: 2, resource: "choice", kind: "exercise", exercise: "choice", goal: "Cobrar o ponto local." },
      { position: 3, resource: "flow", kind: "theory", exercise: "none", goal: "Retornar à trilha." }
    ]
  }, draftContract);

  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /branch precisa usar paragraph para explicitar o retorno/);
});

test("draft de branch reforça checagem curta para destravar retorno à trilha", () => {
  const planning = buildPlanningContract();
  planning.microsequence.role = "support";
  planning.microsequence.branchOf = "micro-base";
  const draftContract = buildMicrosequenceDraftContract({
    planningContract: planning,
    validatedPlan: {
      plan: {
        type: "concept",
        size: "medium",
        goal: planning.microsequence.goal,
        extraResources: [],
        sources: [],
        reason: "Destravar rapidamente e voltar à trilha.",
        slotPlan: [
          { position: 1, role: "explain", goal: "Abrir o apoio.", checks: [] },
          { position: 2, role: "practice", goal: "Checar o ponto local.", checks: [] },
          { position: 3, role: "practice_more", goal: "Consolidar sem alongar demais.", checks: [] },
          { position: 4, role: "next", goal: "Retornar à trilha.", checks: [] }
        ]
      }
    }
  });

  assert.equal(
    draftContract.rules.some((rule) => String(rule).includes("prefer an objective recognition check unless completing the representation is itself the target skill")),
    true
  );
});

test("draft aceita múltiplos slots de prática textual quando isso fizer sentido didático", () => {
  const planning = buildPlanningContract();
  planning.microsequence.role = "explain";
  const draftContract = buildMicrosequenceDraftContract({
    planningContract: planning,
    validatedPlan: {
      plan: {
        type: "concept",
        size: "medium",
        goal: planning.microsequence.goal,
        extraResources: [],
        sources: [],
        reason: "Distribuir prática com mais confiabilidade.",
        slotPlan: [
          { position: 1, role: "explain", goal: "Abrir o conceito.", checks: [] },
          { position: 2, role: "practice", goal: "Cobrar a leitura principal.", checks: [] },
          { position: 3, role: "practice_more", goal: "Variar o mesmo alvo.", checks: [] },
          { position: 4, role: "fix_error", goal: "Corrigir um erro provável.", checks: [] }
        ]
      }
    }
  });
  const result = validateMicrosequenceDraft({
    draft: [
      { position: 1, resource: "paragraph", kind: "theory", exercise: "none", goal: "Abrir o conceito." },
      { position: 2, resource: "paragraph", kind: "exercise", exercise: "gap", goal: "Cobrar a leitura principal." },
      { position: 3, resource: "paragraph", kind: "exercise", exercise: "gap", goal: "Variar o mesmo alvo." },
      { position: 4, resource: "choice", kind: "exercise", exercise: "choice", goal: "Corrigir um erro provável." }
    ]
  }, draftContract);

  assert.equal(result.ok, true);
});

test("draft aceita lacunas em recursos estruturados sem convertê-las em choice", () => {
  const planning = buildPlanningContract();
  planning.microsequence.role = "explain";
  const draftContract = buildMicrosequenceDraftContract({
    planningContract: planning,
    validatedPlan: {
      plan: {
        type: "concept",
        size: "medium",
        goal: planning.microsequence.goal,
        extraResources: ["table", "graph", "matrix", "formula"],
        sources: [],
        reason: "Variar a representação da mesma operação.",
        slotPlan: [
          { position: 1, role: "explain", goal: "Apresentar a operação.", checks: [] },
          { position: 2, role: "practice", goal: "Completar uma célula.", checks: [] },
          { position: 3, role: "practice_more", goal: "Completar um rótulo do grafo.", checks: [] },
          { position: 4, role: "fix_error", goal: "Completar um elemento da fórmula.", checks: [] }
        ]
      }
    }
  });
  const result = validateMicrosequenceDraft({
    draft: [
      { position: 1, resource: "paragraph", kind: "theory", exercise: "none", goal: "Apresentar a operação." },
      { position: 2, resource: "table", kind: "exercise", exercise: "gap", goal: "Completar uma célula." },
      { position: 3, resource: "graph", kind: "exercise", exercise: "gap", goal: "Completar um rótulo do grafo." },
      { position: 4, resource: "formula", kind: "exercise", exercise: "gap", goal: "Completar um elemento da fórmula." }
    ]
  }, draftContract);

  assert.equal(result.ok, true, result.errors.join("\n"));
  assert.equal(
    draftContract.rules.some((rule) => String(rule).includes("table/gap")),
    true
  );
  assert.equal(
    draftContract.rules.some((rule) => String(rule).includes("formula/gap")),
    true
  );
});

test("guide.exclude sempre falha na validação didática", () => {
  const result = validateGeneratedCardsDidactic([
    {
      position: 1,
      resource: "paragraph",
      kind: "theory",
      exercise: "none",
      title: "Erro",
      text: "Não vamos abrir predicados aqui.",
      after: ""
    }
  ], {
    guide: { exclude: ["predicados"], avoid: ["disjunção"] },
    plan: [{ position: 1, role: "explain", kind: "theory", exercise: "none" }],
    microsequence: { checks: [] },
    knownErrors: []
  });

  assert.equal(result.ok, false);
  assert.match(result.didacticErrors.join("\n"), /guide\.exclude/);
});

test("guide.avoid falha em card comum, mas fix_error pode usar erro conhecido", () => {
  const generationContract = {
    guide: { exclude: ["predicados"], avoid: ["disjunção"] },
    plan: [{ position: 1, role: "fix_error", kind: "exercise", exercise: "choice", checks: ["confundir conjunção com disjunção"] }],
    microsequence: { checks: ["confundir conjunção com disjunção"] },
    knownErrors: ["confundir conjunção com disjunção"],
    context: { refs: [], next: null }
  };
  const okResult = validateGeneratedCardsDidactic([
    {
      position: 1,
      resource: "choice",
      kind: "exercise",
      exercise: "choice",
      title: "Corrija o erro",
      question: "Qual opção corrige a confusão entre conjunção e disjunção?",
      options: [
        { id: "a", text: "Conjunção só é verdadeira quando as duas proposições são verdadeiras." },
        { id: "b", text: "Disjunção exige duas proposições verdadeiras." },
        { id: "c", text: "Basta uma proposição verdadeira." }
      ],
      selectionMode: "single",
      selectionCriterion: "correct",
      answerIds: ["a"],
      after: "A correção separa conjunção de disjunção."
    }
  ], generationContract);
  assert.equal(okResult.ok, true);

  const avoidResult = validateGeneratedCardsDidactic([
    {
      position: 1,
      resource: "paragraph",
      kind: "theory",
      exercise: "none",
      title: "Desvio",
      text: "Abra a disjunção como assunto principal.",
      after: ""
    }
  ], {
    guide: { exclude: ["predicados"], avoid: ["disjunção"] },
    plan: [{ position: 1, role: "explain", kind: "theory", exercise: "none" }],
    microsequence: { checks: [] },
    knownErrors: []
  });
  assert.equal(avoidResult.ok, false);
  assert.match(avoidResult.didacticErrors.join("\n"), /guide\.avoid/);
});

test("fix_error não pode inventar erro fora do escopo", () => {
  const result = validateGeneratedCardsDidactic([
    {
      position: 1,
      resource: "choice",
      kind: "exercise",
      exercise: "choice",
      title: "Erro inventado",
      question: "Qual opção corrige a confusão entre conjunção e bicondicional?",
      options: [
        { id: "a", text: "Conjunção só é verdadeira quando ambas são verdadeiras." },
        { id: "b", text: "Bicondicional sempre equivale à conjunção." },
        { id: "c", text: "Nenhuma das anteriores." }
      ],
      selectionMode: "single",
      selectionCriterion: "correct",
      answerIds: ["a"],
      after: "Corrija a troca entre conjunção e bicondicional."
    }
  ], {
    guide: { exclude: ["predicados"], avoid: ["disjunção"] },
    plan: [{ position: 1, role: "fix_error", kind: "exercise", exercise: "choice", checks: ["confundir conjunção com disjunção"] }],
    microsequence: { checks: ["confundir conjunção com disjunção"] },
    knownErrors: ["confundir conjunção com disjunção"],
    context: { refs: [], next: null }
  });

  assert.equal(result.ok, false);
  assert.match(result.didacticErrors.join("\n"), /erro conhecido do escopo/);
});

test("dependsOn anterior válido passa", () => {
  const result = validatePlannedCourse(plannedCourseWithDependsOn(["Base"]), scopeContract());
  assert.equal(result.ok, true);
});

test("top-down falha quando guide.goal cita termo de exclude", () => {
  const planned = plannedCourseWithDependsOn(["Base"]);
  planned.course.modules[0].guide.goal = "Explicar conjunção sem abrir predicados.";

  const result = validatePlannedCourse(planned, scopeContract());

  assert.equal(result.ok, false);
  assert.match(result.errors.map((error) => error.message).join("\n"), /guide\.goal/);
  assert.match(result.errors.map((error) => error.message).join("\n"), /exclude/);
});

test("top-down falha quando guide.notation cita termo de exclude", () => {
  const planned = plannedCourseWithDependsOn(["Base"]);
  planned.course.modules[0].guide.notation = ["Evite a notação de predicados."];

  const result = validatePlannedCourse(planned, scopeContract());

  assert.equal(result.ok, false);
  assert.match(result.errors.map((error) => error.message).join("\n"), /guide\.notation/);
  assert.match(result.errors.map((error) => error.message).join("\n"), /exclude/);
});

test("top-down falha quando guide.avoid cita termo de exclude", () => {
  const planned = plannedCourseWithDependsOn(["Base"]);
  planned.course.modules[0].guide.avoid = ["Não contrastar com predicados."];

  const result = validatePlannedCourse(planned, scopeContract());

  assert.equal(result.ok, false);
  assert.match(result.errors.map((error) => error.message).join("\n"), /guide\.avoid/);
  assert.match(result.errors.map((error) => error.message).join("\n"), /exclude/);
});

test("top-down mantém guia válido sem sanitizar quando não há exclude em campos textuais", () => {
  const planned = plannedCourseWithDependsOn(["Base"]);

  const result = validatePlannedCourse(planned, scopeContract());

  assert.equal(result.ok, true);
  assert.equal(result.value.course.modules[0].guide.goal, "Explicar conjunção.");
});

test("top-down falha quando guide.goal do módulo repete o prompt bruto do usuário", () => {
  const planned = plannedCourseWithDependsOn(["Base"]);
  planned.course.modules[0].guide.goal = scopeContract().course.goal;

  const result = validatePlannedCourse(planned, scopeContract());

  assert.equal(result.ok, false);
  assert.match(
    result.errors.map((error) => error.message).join("\n"),
    /guide\.goal do módulo não pode repetir o pedido bruto do usuário/i
  );
});

test("top-down falha quando guide.goal do módulo parafraseia pedido do usuário em primeira pessoa", () => {
  const scoped = {
    schemaVersion: "aralearn.scope.v1",
    course: {
      title: "Curso A",
      goal: "Estou atrasado na matéria e preciso estudar para resolver exercícios de prova."
    },
    modules: [
      {
        title: "Lógica",
        include: ["conjunção"],
        exclude: [],
        notes: "Quero uma sequência bem prática, começando do básico."
      }
    ]
  };
  const planned = plannedCourseWithDependsOn(["Base"]);
  planned.course.modules[0].guide.goal = "Quero estudar de forma prática para resolver exercícios de prova de conjunção.";
  planned.course.modules[0].guide.exclude = [];
  planned.course.modules[0].lessons[0].guide.exclude = [];

  const result = validatePlannedCourse(planned, scoped);

  assert.equal(result.ok, false);
  assert.match(
    result.errors.map((error) => error.message).join("\n"),
    /guide\.goal do módulo não pode repetir o pedido bruto do usuário/i
  );
});

test("top-down aceita variação apenas de acentuação e canoniza para o escopo", () => {
  const scoped = {
    schemaVersion: "aralearn.scope.v1",
    course: { title: "Curso A", goal: "Cobrir IR." },
    modules: [
      {
        title: "Arquitetura",
        include: ["registrador de instrucoes (IR)", "relacao minima entre CPU, memoria e registradores"],
        exclude: []
      }
    ]
  };
  const planned = {
    course: {
      title: "Curso A",
      modules: [
        {
          title: "Arquitetura",
          guide: {
            goal: "Explicar IR.",
            include: ["registrador de instruções (IR)", "relação mínima entre CPU, memória e registradores"],
            exclude: [],
            notation: [],
            avoid: []
          },
          lessons: [
            {
              title: "IR",
              guide: {
                goal: "Explicar IR.",
                include: ["registrador de instruções (IR)", "relação mínima entre CPU, memória e registradores"],
                exclude: [],
                notation: [],
                avoid: []
              },
              microsequences: [
                {
                  title: "IR",
                  goal: "Ler o registrador.",
                  role: "explain",
                  dependsOn: [],
                  covers: ["registrador de instruções (IR)"],
                  checks: []
                },
                {
                  title: "Relação mínima",
                  goal: "Ler a relação mínima.",
                  role: "practice",
                  dependsOn: ["IR"],
                  covers: ["relação mínima entre CPU, memória e registradores"],
                  checks: []
                }
              ]
            }
          ]
        }
      ]
    }
  };
  const result = validatePlannedCourse(planned, scoped);
  assert.equal(result.ok, true);
  assert.deepEqual(result.value.course.modules[0].guide.include, scoped.modules[0].include);
});

test("dependsOn inexistente, self, futuro e ciclo falham", () => {
  const missing = validatePlannedCourse(plannedCourseWithDependsOn(["Fantasma"]), scopeContract());
  assert.equal(missing.ok, false);
  assert.match(missing.errors.map((error) => error.message).join("\n"), /microssequência inexistente/);

  const self = validatePlannedCourse(plannedCourseWithDependsOn(["Prática"]), scopeContract());
  assert.equal(self.ok, false);
  assert.match(self.errors.map((error) => error.message).join("\n"), /própria microssequência/);

  const future = validatePlannedCourse({
    ...plannedCourseWithDependsOn(["Fechamento"]),
    course: {
      ...plannedCourseWithDependsOn(["Fechamento"]).course,
      modules: [
        {
          ...plannedCourseWithDependsOn(["Fechamento"]).course.modules[0],
          lessons: [
            {
              ...plannedCourseWithDependsOn(["Fechamento"]).course.modules[0].lessons[0],
              microsequences: [
                {
                  title: "Base",
                  goal: "Explicar a regra.",
                  role: "explain",
                  dependsOn: [],
                  covers: ["conjunção"],
                  checks: []
                },
                {
                  title: "Prática",
                  goal: "Aplicar a regra.",
                  role: "practice",
                  dependsOn: ["Fechamento"],
                  covers: ["conjunção"],
                  checks: []
                },
                {
                  title: "Fechamento",
                  goal: "Consolidar.",
                  role: "review",
                  dependsOn: [],
                  covers: ["conjunção"],
                  checks: []
                }
              ]
            }
          ]
        }
      ]
    }
  }, scopeContract());
  assert.equal(future.ok, false);
  assert.match(future.errors.map((error) => error.message).join("\n"), /microssequência futura/);

  const cycle = validatePlannedCourse({
    ...plannedCourseWithDependsOn(["Base"]),
    course: {
      ...plannedCourseWithDependsOn(["Base"]).course,
      modules: [
        {
          ...plannedCourseWithDependsOn(["Base"]).course.modules[0],
          lessons: [
            {
              ...plannedCourseWithDependsOn(["Base"]).course.modules[0].lessons[0],
              microsequences: [
                {
                  title: "Base",
                  goal: "Explicar a regra.",
                  role: "explain",
                  dependsOn: ["Prática"],
                  covers: ["conjunção"],
                  checks: []
                },
                {
                  title: "Prática",
                  goal: "Aplicar a regra.",
                  role: "practice",
                  dependsOn: ["Base"],
                  covers: ["conjunção"],
                  checks: []
                }
              ]
            }
          ]
        }
      ]
    }
  }, scopeContract());
  assert.equal(cycle.ok, false);
  assert.match(cycle.errors.map((error) => error.message).join("\n"), /ciclo/);
});

test("matrix exige values ou sequence válidos", () => {
  const noValues = structural({
    position: 1,
    resource: "matrix",
    kind: "theory",
    exercise: "none",
    title: "Matriz",
    after: ""
  });
  assert.equal(noValues.ok, false);
  assert.match(noValues.structuralErrors.join("\n"), /values ou sequence/);

  const validValues = structural({
    position: 1,
    resource: "matrix",
    kind: "theory",
    exercise: "none",
    title: "Matriz",
    prompt: "Observe a matriz.",
    values: [["1", "2"], ["3", "4"]],
    after: ""
  });
  assert.equal(validValues.ok, true);

  const uneven = structural({
    position: 1,
    resource: "matrix",
    kind: "theory",
    exercise: "none",
    title: "Matriz",
    values: [["1", "2"], ["3"]],
    after: ""
  });
  assert.equal(uneven.ok, false);
  assert.match(uneven.structuralErrors.join("\n"), /mesmo número de colunas/);

  const exercise = structural({
    position: 1,
    resource: "matrix",
    kind: "exercise",
    exercise: "choice",
    title: "Leitura da matriz",
    values: [["1", "2"], ["3", "4"]],
    question: "Qual valor está na posição 2,1?",
    options: [
      { id: "a", text: "3" },
      { id: "b", text: "2" },
      { id: "c", text: "4" }
    ],
    selectionMode: "single",
    selectionCriterion: "correct",
    answerIds: ["a"],
    after: ""
  });
  assert.equal(exercise.ok, true);

  const sequence = structural({
    position: 1,
    resource: "matrix",
    kind: "theory",
    exercise: "none",
    title: "Sequência",
    sequence: [
      { name: "A", values: [["1", "0"], ["0", "1"]] },
      { connector: "=", values: [["1", "0"], ["0", "1"]] }
    ],
    after: ""
  });
  assert.equal(sequence.ok, true);
});

test("plane exige dado visual válido e choice em exercício", () => {
  const empty = structural({
    position: 1,
    resource: "plane",
    kind: "theory",
    exercise: "none",
    title: "Plano",
    after: ""
  });
  assert.equal(empty.ok, false);
  assert.match(empty.structuralErrors.join("\n"), /dado visual/);

  const validVector = structural({
    position: 1,
    resource: "plane",
    kind: "theory",
    exercise: "none",
    title: "Plano",
    vector: [2, 1],
    after: ""
  });
  assert.equal(validVector.ok, true);

  const invalidXY = structural({
    position: 1,
    resource: "plane",
    kind: "theory",
    exercise: "none",
    title: "Plano",
    x: [1, 2],
    after: ""
  });
  assert.equal(invalidXY.ok, false);
  assert.match(invalidXY.structuralErrors.join("\n"), /x e y juntos/);

  const exercise = structural({
    position: 1,
    resource: "plane",
    kind: "exercise",
    exercise: "choice",
    title: "Leitura do plano",
    vector: [2, 1],
    question: "Qual vetor está representado?",
    options: [
      { id: "a", text: "(2,1)" },
      { id: "b", text: "(1,2)" },
      { id: "c", text: "(-2,1)" }
    ],
    selectionMode: "single",
    selectionCriterion: "correct",
    answerIds: ["a"],
    after: ""
  });
  assert.equal(exercise.ok, true);

  const scale = structural({
    position: 1,
    resource: "plane",
    kind: "theory",
    exercise: "none",
    title: "Escala",
    scale: { k: 2, vector: [1, 3] },
    result: "u = (2, 6)",
    after: ""
  });
  assert.equal(scale.ok, true);
});

test("didática reconhece plane com x e y como contexto materializado", () => {
  const result = validateGeneratedCardsDidactic([
    {
      position: 1,
      resource: "plane",
      kind: "theory",
      exercise: "none",
      title: "Caso no plano",
      prompt: "Observe o caso no plano cartesiano.",
      x: [0, 2],
      y: [0, 1],
      after: ""
    }
  ], {
    guide: { exclude: [], avoid: [] },
    plan: [{ position: 1, role: "explain", kind: "theory", exercise: "none" }],
    microsequence: { checks: [] },
    knownErrors: []
  });

  assert.equal(result.ok, true);
});

test("didática reconhece plane com sum como contexto materializado", () => {
  const result = validateGeneratedCardsDidactic([
    {
      position: 1,
      resource: "plane",
      kind: "theory",
      exercise: "none",
      title: "Soma vetorial",
      prompt: "Observe o caso de soma de vetores.",
      question: "Neste caso, qual resultante aparece?",
      sum: [[1, 0], [0, 2]],
      after: ""
    }
  ], {
    guide: { exclude: [], avoid: [] },
    plan: [{ position: 1, role: "explain", kind: "theory", exercise: "none" }],
    microsequence: { checks: [] },
    knownErrors: []
  });

  assert.equal(result.ok, true);
});

test("didática reconhece plane com scale como contexto materializado", () => {
  const result = validateGeneratedCardsDidactic([
    {
      position: 1,
      resource: "plane",
      kind: "theory",
      exercise: "none",
      title: "Escala vetorial",
      prompt: "Observe o caso de escala do vetor.",
      question: "Neste problema, como o vetor foi ampliado?",
      scale: { k: 2, vector: [1, 3] },
      after: ""
    }
  ], {
    guide: { exclude: [], avoid: [] },
    plan: [{ position: 1, role: "explain", kind: "theory", exercise: "none" }],
    microsequence: { checks: [] },
    knownErrors: []
  });

  assert.equal(result.ok, true);
});

test("didática ainda falha quando plane cita caso sem dado visual suficiente", () => {
  const result = validateGeneratedCardsDidactic([
    {
      position: 1,
      resource: "plane",
      kind: "exercise",
      exercise: "choice",
      title: "Caso sem materialização",
      prompt: "Observe o caso no plano.",
      question: "Neste caso, qual vetor aparece?",
      options: [
        { id: "a", text: "(2, 1)" },
        { id: "b", text: "(1, 2)" },
        { id: "c", text: "(-2, 1)" }
      ],
      selectionMode: "single",
      selectionCriterion: "correct",
      answerIds: ["a"],
      after: ""
    }
  ], {
    guide: { exclude: [], avoid: [] },
    plan: [{ position: 1, role: "practice", kind: "exercise", exercise: "choice" }],
    microsequence: { checks: [] },
    knownErrors: []
  });

  assert.equal(result.ok, false);
  assert.match(result.didacticErrors.join("\n"), /materializar os dados necessários/);
});

test("plane com mesma question e x/y diferentes não falha por repetição em practice_more", () => {
  const result = validateGeneratedCardsDidactic([
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
    }
  ], didacticContract([
    { position: 1, role: "practice", resource: "plane", kind: "exercise", exercise: "choice", goal: "", checks: [] },
    { position: 2, role: "practice_more", resource: "plane", kind: "exercise", exercise: "choice", goal: "", checks: [] }
  ]));

  assert.equal(result.didacticErrors.some((error) => String(error).includes("repete o mesmo caso")), false);
});

test("plane com mesma question e sum diferente não falha por repetição em practice_more", () => {
  const result = validateGeneratedCardsDidactic([
    {
      position: 1,
      resource: "plane",
      kind: "exercise",
      exercise: "choice",
      title: "Soma 1",
      prompt: "Observe a soma vetorial.",
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
      prompt: "Observe a soma vetorial.",
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
    }
  ], didacticContract([
    { position: 1, role: "practice", resource: "plane", kind: "exercise", exercise: "choice", goal: "", checks: [] },
    { position: 2, role: "practice_more", resource: "plane", kind: "exercise", exercise: "choice", goal: "", checks: [] }
  ]));

  assert.equal(result.didacticErrors.some((error) => String(error).includes("repete o mesmo caso")), false);
});

test("plane com mesma question e scale diferente não falha por repetição em fix_error", () => {
  const result = validateGeneratedCardsDidactic([
    {
      position: 1,
      resource: "plane",
      kind: "exercise",
      exercise: "choice",
      title: "Escala 1",
      prompt: "Observe a escala do vetor.",
      scale: { k: 2, vector: [1, 3] },
      result: [2, 6],
      question: "Qual leitura corrige o erro neste caso?",
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
      question: "Qual leitura corrige o erro neste caso?",
      options: [
        { id: "a", text: "A escala por 3 leva (2, -1) a (6, -3)." },
        { id: "b", text: "A escala por 3 leva (2, -1) a (-1, 2)." },
        { id: "c", text: "A escala por 3 leva (2, -1) a (3, -1)." }
      ],
      selectionMode: "single",
      selectionCriterion: "correct",
      answerIds: ["a"],
      after: ""
    }
  ], didacticContract([
    { position: 1, role: "practice", resource: "plane", kind: "exercise", exercise: "choice", goal: "", checks: [] },
    { position: 2, role: "fix_error", resource: "plane", kind: "exercise", exercise: "choice", goal: "", checks: [] }
  ]));

  assert.equal(result.didacticErrors.some((error) => String(error).includes("repete o mesmo caso")), false);
});

test("matrix com mesma question e values diferentes não falha por repetição em practice_more", () => {
  const result = validateGeneratedCardsDidactic([
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
    }
  ], didacticContract([
    { position: 1, role: "practice", resource: "matrix", kind: "exercise", exercise: "choice", goal: "", checks: [] },
    { position: 2, role: "practice_more", resource: "matrix", kind: "exercise", exercise: "choice", goal: "", checks: [] }
  ]));

  assert.equal(result.didacticErrors.some((error) => String(error).includes("repete o mesmo caso")), false);
});

test("matrix com mesma question e sequence diferente não falha por repetição em practice_more", () => {
  const result = validateGeneratedCardsDidactic([
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
        { id: "a", text: "A matriz identidade passa para uma triangular superior." },
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
    }
  ], didacticContract([
    { position: 1, role: "practice", resource: "matrix", kind: "exercise", exercise: "choice", goal: "", checks: [] },
    { position: 2, role: "practice_more", resource: "matrix", kind: "exercise", exercise: "choice", goal: "", checks: [] }
  ]));

  assert.equal(result.didacticErrors.some((error) => String(error).includes("repete o mesmo caso")), false);
});

test("cards visuais idênticos continuam falhando por repetição em practice_more e fix_error", () => {
  const planeRepeated = validateGeneratedCardsDidactic([
    {
      position: 1,
      resource: "plane",
      kind: "exercise",
      exercise: "choice",
      title: "Caso 1",
      prompt: "Observe o caso no plano.",
      vector: [2, 1],
      question: "Qual vetor aparece neste caso?",
      options: [
        { id: "a", text: "(2, 1)" },
        { id: "b", text: "(1, 2)" },
        { id: "c", text: "(-2, 1)" }
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
      vector: [2, 1],
      question: "Qual vetor aparece neste caso?",
      options: [
        { id: "a", text: "(2, 1)" },
        { id: "b", text: "(1, 2)" },
        { id: "c", text: "(-2, 1)" }
      ],
      selectionMode: "single",
      selectionCriterion: "correct",
      answerIds: ["a"],
      after: ""
    }
  ], didacticContract([
    { position: 1, role: "practice", resource: "plane", kind: "exercise", exercise: "choice", goal: "", checks: [] },
    { position: 2, role: "practice_more", resource: "plane", kind: "exercise", exercise: "choice", goal: "", checks: [] }
  ]));

  const matrixRepeated = validateGeneratedCardsDidactic([
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
    }
  ], didacticContract([
    { position: 1, role: "practice", resource: "matrix", kind: "exercise", exercise: "choice", goal: "", checks: [] },
    { position: 2, role: "fix_error", resource: "matrix", kind: "exercise", exercise: "choice", goal: "", checks: [] }
  ]));

  assert.equal(planeRepeated.didacticErrors.some((error) => String(error).includes("practice_more repete o mesmo caso")), true);
  assert.equal(matrixRepeated.didacticErrors.some((error) => String(error).includes("fix_error repete o mesmo caso")), true);
});

test("schema DeepSeek estrito colapsa anyOf de cards para objeto compatível", () => {
  const sanitized = sanitizeDeepSeekStrictSchema({
    type: "object",
    required: ["cards"],
    properties: {
      cards: {
        type: "array",
        items: {
          anyOf: [
            {
              type: "object",
              required: ["position", "resource", "text"],
              properties: {
                position: { type: "integer" },
                resource: { const: "paragraph" },
                text: { type: "string" }
              }
            },
            {
              type: "object",
              required: [
                "position",
                "resource",
                "question",
                "selectionMode",
                "selectionCriterion",
                "options",
                "answerIds"
              ],
              properties: {
                position: { type: "integer" },
                resource: { const: "choice" },
                question: { type: "string" },
                selectionMode: { const: "single" },
                selectionCriterion: { const: "correct" },
                options: {
                  type: "array",
                  items: {
                    type: "object",
                    required: ["id", "text"],
                    properties: {
                      id: { type: "string" },
                      text: { type: "string" }
                    }
                  }
                },
                answerIds: { type: "array", items: { type: "string" } }
              }
            }
          ]
        }
      }
    }
  });

  assert.equal(sanitized.properties.cards.items.type, "object");
  assert.equal(Array.isArray(sanitized.properties.cards.items.anyOf), false);
  assert.equal(Object.prototype.hasOwnProperty.call(sanitized.properties.cards.items.properties, "text"), true);
  assert.equal(Object.prototype.hasOwnProperty.call(sanitized.properties.cards.items.properties, "question"), true);
});

test("payload DeepSeek estrito força tool_choice nominal", () => {
  const payload = buildDeepSeekToolPayload({
    modelId: "deepseek-v4-flash",
    phase: "bottom-up-compile",
    prompt: "{\"task\":\"bottom_up_card_build\"}",
    schema: {
      type: "object",
      required: ["cards"],
      properties: {
        cards: {
          type: "array",
          items: {
            type: "object",
            properties: {
              position: { type: "integer" }
            }
          }
        }
      }
    }
  });

  assert.deepEqual(payload.tool_choice, {
    type: "function",
    function: {
      name: "emit_structured_response"
    }
  });
  assert.equal(payload.parallel_tool_calls, false);
});
