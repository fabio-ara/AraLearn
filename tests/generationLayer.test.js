import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { buildMicrosequencePlanningContract } from "../src/generation/planning/buildMicrosequencePlanningContract.js";
import { buildMicrosequencePlanningPrompt } from "../src/generation/planning/buildMicrosequencePlanningPrompt.js";
import { validateMicrosequencePlan } from "../src/generation/planning/validateMicrosequencePlan.js";
import { buildMicrosequenceGenerationContract } from "../src/generation/contracts/buildMicrosequenceGenerationContract.js";
import { buildMicrosequenceGenerationPrompt } from "../src/generation/prompts/buildMicrosequenceGenerationPrompt.js";
import { getModelCapabilities } from "../src/generation/providers/modelCapabilities.js";
import { resolveWeakModelModePolicy, assertUserSelectedResourcesAllowed } from "../src/generation/policies/weakModelPolicy.js";
import { resolveResourcesForGenerationPlan, buildResourceSelectorState } from "../src/generation/resources/resolveResourcesForGenerationPlan.js";
import { validateGeneratedCardsStructural } from "../src/generation/validation/validateGeneratedCardsStructural.js";
import { validateGeneratedCardsDidactic } from "../src/generation/validation/validateGeneratedCardsDidactic.js";
import { validateGeneratedCardsSourceGrounding } from "../src/generation/validation/validateGeneratedCardsSourceGrounding.js";
import { validateGeneratedCards } from "../src/generation/validation/validateGeneratedCards.js";
import { validateOrRepairGeneratedCards } from "../src/generation/validation/validateOrRepairGeneratedCards.js";
import { repairGeneratedCardsDeterministic } from "../src/generation/repair/repairGeneratedCardsDeterministic.js";
import { adaptResourceCardsToPublicCards } from "../src/generation/resources/adaptResourceCardToPublicCard.js";
import { listCardResourceDefinitions } from "../src/generation/resources/cardResourceDefinitions.js";

function loadFixture(name) {
  return JSON.parse(fs.readFileSync(new URL(`./fixtures/didactics/${name}`, import.meta.url), "utf8"));
}

function buildContractsFromFixture(name, overrides = {}) {
  const fixture = loadFixture(name);
  const selectedExtraResourceTypes = overrides.selectedExtraResourceTypes ?? fixture.requestedExtraResourceTypes ?? [];
  const planningContract = buildMicrosequencePlanningContract({
    selectedCourse: fixture.selectedCourse,
    selectedModule: fixture.selectedModule,
    selectedLesson: fixture.selectedLesson,
    targetMicrosequence: {
      key: "micro-target",
      title: fixture.selectedLesson.title,
      description: fixture.selectedLesson.description,
      status: "draft",
      included: false
    },
    selectedLessonTopicRefs: fixture.selectedLessonTopicRefs,
    userPrompt: fixture.userPrompt,
    selectedModel: "gemini-2.5-flash",
    userSelectedExtraResourceTypes: selectedExtraResourceTypes,
    ...overrides
  });
  const validatedPlan = validateMicrosequencePlan(
    {
      typeId: fixture.expectedPlanShape.typeId,
      sizeId: fixture.expectedPlanShape.sizeId,
      microsequenceGoal: fixture.userPrompt,
      selectedExtraResourceTypes,
      sourceUsePlan: overrides.sourceUsePlan || [],
      reason: "teste"
    },
    planningContract
  );
  assert.equal(validatedPlan.ok, true);
  const generationContract = buildMicrosequenceGenerationContract({
    planningContract,
    validatedPlan,
    selectedModel: "gemini-2.5-flash"
  });
  return { fixture, planningContract, validatedPlan, generationContract };
}

test("modelCapabilities distingue responseJsonSchema de responseSchema e usa perfil weak", () => {
  const capabilities = getModelCapabilities("gemini-2.5-flash");

  assert.equal(capabilities.profile, "weak-structured-json");
  assert.equal(capabilities.jsonMode, true);
  assert.equal(capabilities.supportsResponseJsonSchema, true);
  assert.equal(capabilities.supportsResponseSchema, false);
  assert.equal(capabilities.supportsJsonSchemaSubset, true);
  assert.equal(capabilities.schemaStrength, "partial");
  assert.equal(capabilities.defaultMode, "weak");
});

test("weakModelPolicy bloqueia recursos avançados por padrão e libera matrix só com sinal forte", () => {
  const logicPolicy = resolveWeakModelModePolicy({
    lessonGuidance: loadFixture("logic-beginner.json").selectedLesson,
    lessonSourceGuideStructured: loadFixture("logic-beginner.json").selectedLesson.sourceGuideStructured,
    modelCapabilities: getModelCapabilities("gemini-2.5-flash"),
    resolvedTypeId: "concept"
  });
  const matrixPolicy = resolveWeakModelModePolicy({
    lessonGuidance: loadFixture("vector-matrix-beginner.json").selectedLesson,
    lessonSourceGuideStructured: loadFixture("vector-matrix-beginner.json").selectedLesson.sourceGuideStructured,
    modelCapabilities: getModelCapabilities("gemini-2.5-flash"),
    resolvedTypeId: "comparison"
  });

  assert.equal(logicPolicy.safeAllowedResourceTypes.includes("matrix"), false);
  assert.equal(logicPolicy.safeAllowedResourceTypes.includes("plane"), false);
  assert.equal(matrixPolicy.safeAllowedResourceTypes.includes("matrix"), true);
  assert.equal(matrixPolicy.safeAllowedResourceTypes.includes("plane"), false);
});

test("planejamento usa contrato pequeno e sem cardPlan vindo da LLM", () => {
  const { planningContract } = buildContractsFromFixture("logic-beginner.json");
  const prompt = buildMicrosequencePlanningPrompt(planningContract, getModelCapabilities("gemini-2.5-flash"));

  assert.match(prompt, /Devolva apenas: typeId, sizeId, microsequenceGoal, selectedExtraResourceTypes, sourceUsePlan e reason/);
  assert.match(prompt, /Não devolva cardPlan/);
  assert.equal(planningContract.weakModelMode.modeId, "weakModelMode");
  assert.equal("didacticGuardrails" in planningContract, false);
});

test("cardPlan determinístico usa typeId, sizeId e gating de recursos", () => {
  const { validatedPlan } = buildContractsFromFixture("git-beginner.json");

  assert.deepEqual(
    validatedPlan.plan.cardPlan.map((item) => item.resourceType),
    ["paragraph", "code_editor", "code_editor", "multiple_choice", "paragraph"]
  );
  assert.equal(validatedPlan.plan.cardPlan.every((item) => Array.isArray(item.sourceRefs)), true);
});

test("resource gating rejeita recurso avançado sem permissão da lição", () => {
  const logicFixture = loadFixture("logic-beginner.json");
  const rejected = assertUserSelectedResourcesAllowed({
    lessonGuidance: logicFixture.selectedLesson,
    lessonSourceGuideStructured: logicFixture.selectedLesson.sourceGuideStructured,
    modelCapabilities: getModelCapabilities("gemini-2.5-flash"),
    resolvedTypeId: "concept",
    userSelectedExtraResourceTypes: ["matrix"]
  });
  const accepted = assertUserSelectedResourcesAllowed({
    lessonGuidance: loadFixture("vector-matrix-beginner.json").selectedLesson,
    lessonSourceGuideStructured: loadFixture("vector-matrix-beginner.json").selectedLesson.sourceGuideStructured,
    modelCapabilities: getModelCapabilities("gemini-2.5-flash"),
    resolvedTypeId: "comparison",
    userSelectedExtraResourceTypes: ["matrix"]
  });

  assert.equal(rejected.ok, false);
  assert.match(rejected.errors.join(" "), /Recurso extra não permitido pela lição atual: matrix/);
  assert.equal(accepted.ok, true);
});

test("resolveResourcesForGenerationPlan envia só recursos efetivos e schemas curtos", () => {
  const { planningContract, generationContract } = buildContractsFromFixture("linux-shell-beginner.json");
  const resources = resolveResourcesForGenerationPlan({
    resolvedMicrosequenceTypeId: "code_or_command",
    lessonAllowedResourceTypes: planningContract.context.lesson.resourceTags,
    lessonGuidance: planningContract.context.lesson,
    lessonSourceGuideStructured: planningContract.context.lesson.sourceGuideStructured,
    modelCapabilities: planningContract.model.capabilities,
    userSelectedExtraResourceTypes: ["tree"]
  });
  const selector = buildResourceSelectorState({
    resolvedMicrosequenceTypeId: "code_or_command",
    userSelectedExtraResourceTypes: ["tree"],
    lessonGuidance: planningContract.context.lesson,
    lessonSourceGuideStructured: planningContract.context.lesson.sourceGuideStructured,
    modelCapabilities: planningContract.model.capabilities
  });

  assert.equal(resources.allowedResourceTypes.includes("tree"), true);
  assert.equal(resources.allowedResourceTypes.includes("code_editor"), false);
  assert.deepEqual(Object.keys(resources.resourceSchemas).sort(), ["multiple_choice", "paragraph", "tree"].sort());
  assert.equal(selector.find((item) => item.id === "tree").allowed, true);
  assert.equal(selector.find((item) => item.id === "plane").allowed, false);
});

test("prompt de geração fica enxuto e reforça contrato fechado", () => {
  const { generationContract } = buildContractsFromFixture("git-beginner.json");
  const prompt = buildMicrosequenceGenerationPrompt(generationContract, getModelCapabilities("gemini-2.5-flash"));

  assert.match(prompt, /Devolva exatamente output.expectedCardCount cards/);
  assert.match(prompt, /Use exatamente position e resourceType de didacticPlan.cardPlan/);
  assert.match(prompt, /Preencha apenas campos aceitos por resources.effectiveResourceSchemas/);
  assert.match(prompt, /Arquitetura pedagógica: planner_builder_auditor_internalizado/);
  assert.match(prompt, /Progressão obrigatória:/);
  assert.doesNotMatch(prompt, /didacticGuardrails/);
});

test("dúvida local ancora geração na trilha e bloqueia deslocamento cognitivo", () => {
  const selectedLesson = {
    key: "lesson-von-neumann",
    title: "Arquitetura de Von Neumann",
    description: "Programa armazenado, CPU, memória e barramentos.",
    sourceGuideStructured: {
      lessonGoal: "Entender programa armazenado e os componentes básicos da arquitetura de Von Neumann.",
      notationRules: "Explicar siglas como `PC`, `IR`, `CPU`, `ULA` e `E/S` antes de cobrar uso.",
      commonErrors: "Confundir registrador, memória principal e barramento."
    },
    resourceTags: ["paragraph", "multiple_choice"],
    contentTypeTags: ["concept"],
    learningActionTags: ["understand", "practice"],
    supportLevel: "guided",
    domainMap: {
      items: [
        {
          id: "pc-ir",
          label: "PC e IR no ciclo de execução",
          kind: "concept",
          expectedEvidence: ["dizer que PC aponta a próxima instrução", "dizer que IR guarda a instrução atual"],
          commonErrors: ["achar que PC executa cálculo", "achar que IR é memória permanente"]
        },
        {
          id: "stored-program",
          label: "Programa armazenado e componentes",
          kind: "concept",
          expectedEvidence: ["relacionar instruções na memória com CPU"]
        }
      ]
    },
    microsequences: [
      {
        key: "stored-program",
        title: "Programa armazenado e componentes",
        didacticPurpose: "Ligar memória, CPU e registradores no ciclo de execução.",
        domainRefs: ["stored-program", "pc-ir"],
        coverageRole: "explain",
        status: "ready",
        included: true
      }
    ]
  };
  const planningContract = buildMicrosequencePlanningContract({
    selectedCourse: { key: "course-oac", title: "Organização e Arquitetura de Computadores" },
    selectedModule: { key: "module-vn", title: "Modelo de Von Neumann" },
    selectedLesson,
    targetMicrosequence: selectedLesson.microsequences[0],
    selectedLessonTopicRefs: [{ refKey: "stored-program", label: "Programa armazenado e componentes", source: "microsequence" }],
    userPrompt: "Eu não sei o que são PC e IR",
    selectedModel: "gemini-2.5-flash"
  });
  const invalidPlan = validateMicrosequencePlan(
    {
      typeId: "concept",
      sizeId: "short",
      microsequenceGoal: "Explicar variáveis em programação.",
      selectedExtraResourceTypes: [],
      sourceUsePlan: [],
      reason: "Dúvida de programação."
    },
    planningContract
  );
  const validPlan = validateMicrosequencePlan(
    {
      typeId: "concept",
      sizeId: "short",
      microsequenceGoal: "Explicar `PC` e `IR` no ciclo de execução de Von Neumann.",
      selectedExtraResourceTypes: [],
      sourceUsePlan: [],
      reason: "Responder à dúvida local sobre `PC` e `IR` e voltar ao programa armazenado."
    },
    planningContract
  );

  assert.equal(planningContract.studyTrackPolicy.mode, "clarify_local_doubt");
  assert.deepEqual(planningContract.studyTrackPolicy.requiredAnchors, ["PC", "IR"]);
  assert.equal(invalidPlan.ok, false);
  assert.match(invalidPlan.errors.join(" "), /PC/);
  assert.match(invalidPlan.errors.join(" "), /IR/);
  assert.equal(validPlan.ok, true);

  const generationContract = buildMicrosequenceGenerationContract({
    planningContract,
    validatedPlan: validPlan,
    selectedModel: "gemini-2.5-flash"
  });
  const prompt = buildMicrosequenceGenerationPrompt(generationContract, getModelCapabilities("gemini-2.5-flash"));
  const drift = validateGeneratedCardsDidactic(
    [
      {
        position: 1,
        resourceType: "paragraph",
        title: "O que são variáveis?",
        text: "Em programação, uma variável é um espaço para guardar valores."
      },
      {
        position: 2,
        resourceType: "paragraph",
        title: "Declarando variável",
        text: "Por exemplo, `idade = 30` guarda o número em uma variável."
      },
      {
        position: 3,
        resourceType: "multiple_choice",
        title: "Identificando variáveis",
        question: "Qual opção declara uma variável chamada `nome`?",
        options: [
          { optionId: "a", label: "`nome = 'Maria'`" },
          { optionId: "b", label: "`30 = idade`" },
          { optionId: "c", label: "`print('Maria')`" }
        ],
        correctOptionId: "a",
        feedback: "`nome = 'Maria'` associa um valor ao nome."
      }
    ],
    generationContract
  );
  const anchored = validateGeneratedCardsDidactic(
    [
      {
        position: 1,
        resourceType: "paragraph",
        title: "PC e IR",
        text: "`PC` vem de Program Counter, contador de programa: ele aponta a próxima instrução. `IR` vem de Instruction Register, registrador de instrução: ele guarda a instrução atual para decodificação."
      },
      {
        position: 2,
        resourceType: "paragraph",
        title: "No ciclo de execução",
        text: "Por exemplo, na arquitetura de Von Neumann, a CPU busca na memória a instrução apontada pelo `PC`; depois essa instrução fica no `IR` enquanto é interpretada."
      },
      {
        position: 3,
        resourceType: "multiple_choice",
        title: "Checagem",
        question: "Qual alternativa associa corretamente `PC` e `IR` no modelo de Von Neumann?",
        options: [
          { optionId: "a", label: "`PC` aponta a próxima instrução; `IR` guarda a instrução atual." },
          { optionId: "b", label: "`PC` executa cálculos; `IR` armazena permanentemente o programa." },
          { optionId: "c", label: "`PC` é a memória principal; `IR` é o barramento externo." }
        ],
        correctOptionId: "a",
        feedback: "`PC` orienta a próxima busca; `IR` segura a instrução em uso pela CPU."
      }
    ],
    generationContract
  );

  assert.match(prompt, /Modo de estudo: esclarecer dúvida local/);
  assert.match(prompt, /Termos obrigatórios da dúvida: PC, IR/);
  assert.equal(drift.ok, false);
  assert.match(drift.didacticErrors.join(" "), /PC/);
  assert.match(drift.didacticErrors.join(" "), /IR/);
  assert.equal(anchored.ok, true);
});

test("sourceGuideStructured governa o contrato sem fallback implícito de description", () => {
  const { planningContract } = buildContractsFromFixture("logic-beginner.json");

  assert.deepEqual(planningContract.context.lesson.sourceGuideStructured, {
    lessonGoal: "Reconhecer conectivos básicos e ler a notação em voz alta.",
    notationRules: "Sempre explicar `¬`, `∧` e `∨` antes de cobrar leitura formal.",
    commonErrors: "Confundir `∨` com exclusão mútua."
  });
  assert.equal(planningContract.context.course.sourceGuideStructured, undefined);
  assert.equal(planningContract.requestGovernance.precedence[0], "context.lesson.sourceGuideStructured");
});

test("fixtures didáticas validam policy, plan shape e resource gating", () => {
  const fixtures = [
    "logic-beginner.json",
    "vector-matrix-beginner.json",
    "git-beginner.json",
    "linux-shell-beginner.json"
  ];

  fixtures.forEach((name) => {
    const { fixture, validatedPlan, generationContract } = buildContractsFromFixture(name);
    fixture.expectedPlanShape.resourceTypes.forEach((resourceType, index) => {
      assert.equal(validatedPlan.plan.cardPlan[index].resourceType, resourceType);
    });
    (fixture.expectedPolicy.allowedAdvancedResources || []).forEach((resourceType) => {
      assert.equal(generationContract.resources.allowedResourceTypes.includes(resourceType), true);
    });
    (fixture.expectedPolicy.blockedAdvancedResources || []).forEach((resourceType) => {
      assert.equal(generationContract.resources.allowedResourceTypes.includes(resourceType), false);
    });
  });
});

test("validação estrutural separa quantidade, schema e resourceType do plano", () => {
  const { fixture, generationContract } = buildContractsFromFixture("git-beginner.json");
  const result = validateGeneratedCardsStructural(fixture.invalidGeneratedResponse, generationContract);

  assert.equal(result.ok, false);
  fixture.expectedErrors.structuralContains.forEach((entry) => {
    assert.match(result.structuralErrors.join(" "), new RegExp(entry));
  });
});

test("validação didática separa bastidor e referências voláteis", () => {
  const { fixture, generationContract } = buildContractsFromFixture("logic-beginner.json");
  const result = validateGeneratedCardsDidactic(fixture.invalidGeneratedResponse.cards, generationContract);

  assert.equal(result.ok, false);
  fixture.expectedErrors.didacticContains.forEach((entry) => {
    assert.match(result.didacticErrors.join(" "), new RegExp(entry, "i"));
  });
});

test("heurística textual isolada vira aviso e não falha determinística", () => {
  const { generationContract } = buildContractsFromFixture("git-beginner.json");
  const result = validateGeneratedCardsDidactic(
    [
      {
        position: 1,
        resourceType: "paragraph",
        title: "Ideia geral",
        text: "`git add` e `git commit` são comandos importantes do Git."
      },
      {
        position: 2,
        resourceType: "paragraph",
        title: "Preparar",
        text: "`git add` entra antes de `git commit` no fluxo local."
      },
      {
        position: 3,
        resourceType: "paragraph",
        title: "Registrar",
        text: "`git commit` grava o que já foi preparado."
      },
      {
        position: 4,
        resourceType: "multiple_choice",
        title: "Checagem",
        question: "Qual comando registra o histórico local?",
        options: [
          { optionId: "a", label: "git commit" },
          { optionId: "b", label: "git add" },
          { optionId: "c", label: "git status" }
        ],
        correctOptionId: "a",
        feedback: "`git commit` grava o histórico local."
      },
      {
        position: 5,
        resourceType: "paragraph",
        title: "Retomada",
        text: "A ordem mínima é: preparar com `git add` e registrar com `git commit`."
      }
    ],
    generationContract
  );

  assert.equal(result.ok, true);
  assert.equal(result.didacticErrors.length, 0);
  assert.ok(result.didacticWarnings.length > 0);
});

test("validação mínima de fonte exige sourceRefs ou justificativa quando há fontes", () => {
  const { generationContract } = buildContractsFromFixture("git-beginner.json", {
    sourceUsePlan: [{ sourceId: "source-1", usage: "base", note: "Usar a terminologia do comando." }],
    attachedSources: [{ sourceId: "source-1", displayName: "manual.txt", kind: "text" }],
    userSelectedSourceIds: ["source-1"]
  });
  const invalid = validateGeneratedCardsSourceGrounding(loadFixture("git-beginner.json").invalidGeneratedResponse.cards, generationContract);
  const valid = validateGeneratedCardsSourceGrounding(loadFixture("git-beginner.json").validGeneratedResponse.cards, generationContract);

  assert.equal(invalid.ok, false);
  assert.match(invalid.sourceErrors.join(" "), /sourceRefs ou justificar ausência/);
  assert.equal(valid.ok, true);
});

test("validateGeneratedCards agrega estrutural, didático e fonte", () => {
  const { fixture, generationContract } = buildContractsFromFixture("logic-beginner.json", {
    sourceUsePlan: [{ sourceId: "source-1", usage: "base", note: "Glossário local." }],
    attachedSources: [{ sourceId: "source-1", displayName: "guia.txt", kind: "text" }],
    userSelectedSourceIds: ["source-1"]
  });
  const invalid = validateGeneratedCards(fixture.invalidGeneratedResponse, generationContract);
  const valid = validateGeneratedCards(fixture.validGeneratedResponse, generationContract);

  assert.equal(invalid.ok, false);
  assert.equal(invalid.structuralErrors.length, 0);
  assert.ok(invalid.didacticErrors.length > 0);
  assert.ok(invalid.sourceErrors.length > 0);
  assert.equal(valid.ok, true);
});

test("repairGeneratedCardsDeterministic normaliza posição, ids e feedback antes do reparo LLM", () => {
  const { generationContract } = buildContractsFromFixture("git-beginner.json");
  const repaired = repairGeneratedCardsDeterministic(
    {
      cards: [
        {
          position: "5",
          resourceType: "paragraph",
          title: "",
          text: "Retomada final."
        },
        {
          position: "4",
          resourceType: "multiple_choice",
          title: "Checagem",
          question: "Qual comando registra o histórico local?",
          options: [{ label: "git commit" }, { optionId: "b", label: "git add" }, { optionId: "c", label: "git status" }],
          correctOptionId: "",
          feedback: "Resposta final."
        }
      ]
    },
    generationContract
  );

  assert.equal(repaired.cards[0].position, 4);
  assert.equal(repaired.cards[0].options[0].optionId, "option_1");
  assert.equal(repaired.cards[0].correctOptionId, "option_1");
  assert.equal(repaired.cards[1].position, 5);
});

test("validateOrRepairGeneratedCards faz reparo determinístico antes de chamar reparo LLM", async () => {
  const { generationContract } = buildContractsFromFixture("git-beginner.json");
  let llmRepairCalls = 0;
  const result = await validateOrRepairGeneratedCards({
    rawGeneratedResponse: {
      cards: [
        {
          position: "1",
          resourceType: "paragraph",
          title: "Primeiro contexto",
          text: "No Git, você primeiro prepara arquivos e só depois registra o histórico.",
          sourceNote: "Resumo autoral."
        },
        {
          position: "2",
          resourceType: "code_editor",
          title: "Preparar",
          prompt: "Use `git add` para preparar um arquivo.",
          language: "bash",
          code: "git add app.js",
          sourceNote: "Comando básico autoral."
        },
        {
          position: "3",
          resourceType: "code_editor",
          title: "Registrar",
          prompt: "Use `git commit` para registrar o que já foi preparado.",
          language: "bash",
          code: "git commit -m \"Registra avanço\"",
          sourceNote: "Comando básico autoral."
        },
        {
          position: "4",
          resourceType: "multiple_choice",
          title: "Checagem",
          question: "Qual comando registra o histórico local?",
          options: [{ label: "git commit" }, { optionId: "b", label: "git add" }, { optionId: "c", label: "git status" }],
          correctOptionId: "",
          feedback: "Resposta final.",
          sourceNote: "Resumo autoral."
        },
        {
          position: "5",
          resourceType: "paragraph",
          title: "",
          text: "A ordem mínima é: preparar com `git add` e registrar com `git commit`.",
          sourceNote: "Resumo autoral."
        }
      ]
    },
    generationContract,
    callModel: async () => {
      llmRepairCalls += 1;
      return { cards: [] };
    }
  });

  assert.equal(result.ok, true);
  assert.equal(llmRepairCalls, 0);
});

test("adaptação pública preserva sourceRefs quando presentes", () => {
  const result = adaptResourceCardsToPublicCards([
    {
      position: 1,
      resourceType: "paragraph",
      title: "Card",
      text: "Texto.",
      sourceRefs: ["source-1"]
    }
  ]);

  assert.equal(result.ok, true);
  assert.deepEqual(result.cards[0].sourceRefs, ["source-1"]);
});

test("catálogo mantém schemas específicos por recurso", () => {
  const definitions = listCardResourceDefinitions();
  const matrix = definitions.find((item) => item.id === "matrix");
  const paragraph = definitions.find((item) => item.id === "paragraph");

  assert.equal(Array.isArray(matrix.schema.anyOf), true);
  assert.equal(paragraph.schema.properties.sourceRefs.type, "array");
});
