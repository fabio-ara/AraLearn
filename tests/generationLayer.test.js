import test from "node:test";
import assert from "node:assert/strict";

import { buildMicrosequenceGenerationContract } from "../src/generation/contracts/buildMicrosequenceGenerationContract.js";
import { buildMicrosequenceEditContract } from "../src/generation/contracts/buildMicrosequenceEditContract.js";
import { buildMicrosequencePlanningContract } from "../src/generation/planning/buildMicrosequencePlanningContract.js";
import { buildMicrosequencePlanningPrompt } from "../src/generation/planning/buildMicrosequencePlanningPrompt.js";
import { validateMicrosequencePlan } from "../src/generation/planning/validateMicrosequencePlan.js";
import { buildMicrosequenceEditPlanningContract } from "../src/generation/planning/buildMicrosequenceEditPlanningContract.js";
import { buildMicrosequenceEditPlanningPrompt } from "../src/generation/planning/buildMicrosequenceEditPlanningPrompt.js";
import { validateMicrosequenceEditPlan } from "../src/generation/planning/validateMicrosequenceEditPlan.js";
import { buildGeneratedCardsRepairPrompt } from "../src/generation/prompts/buildGeneratedCardsRepairPrompt.js";
import { buildMicrosequenceEditPrompt } from "../src/generation/prompts/buildMicrosequenceEditPrompt.js";
import { buildMicrosequenceGenerationPrompt } from "../src/generation/prompts/buildMicrosequenceGenerationPrompt.js";
import { getModelCapabilities } from "../src/generation/providers/modelCapabilities.js";
import { adaptResourceCardsToPublicCards, adaptResourceCardToPublicCard } from "../src/generation/resources/adaptResourceCardToPublicCard.js";
import { listCardResourceDefinitions } from "../src/generation/resources/cardResourceDefinitions.js";
import { buildResourceSelectorState, resolveResourcesForGenerationPlan } from "../src/generation/resources/resolveResourcesForGenerationPlan.js";
import { resolveResourcesForEditPlan } from "../src/generation/resources/resolveResourcesForEditPlan.js";
import { resolveReferencedSources } from "../src/generation/sources/resolveReferencedSources.js";
import { getMicrosequenceCardCount, listMicrosequenceSizes } from "../src/generation/types/microsequenceSizes.js";
import { listMicrosequenceTypes } from "../src/generation/types/microsequenceTypes.js";
import { validateGeneratedCards } from "../src/generation/validation/validateGeneratedCards.js";
import { validateOrRepairGeneratedCards } from "../src/generation/validation/validateOrRepairGeneratedCards.js";
import { validateEditedMicrosequence } from "../src/generation/validation/validateEditedMicrosequence.js";
import { renderCardRuntimeBlocks } from "../src/render/renderCardRuntime.js";
import { createProjectStorage } from "../src/storage/createProjectStorage.js";
import { createKeyValueMemoryStore } from "../src/storage/createKeyValueMemoryStore.js";
import { replaceMicrosequenceCards } from "../src/editor/contractEditor.js";
import { mapPreferredContainerToResource } from "../src/assist/geminiAssist.js";
import { collectLessonTopicRefs } from "../src/ui/lessonEditorPaths.js";

function makeBroadLessonGuidance(overrides = {}) {
  return {
    resourceTags: ["paragraph", "block_gap_fill", "multiple_choice", "table", "code_editor", "flowchart", "tree", "matrix", "plane"],
    contentTypeTags: ["concept", "procedure", "comparison", "calculation", "interpretation", "tool_use", "review"],
    learningActionTags: ["understand", "solve", "practice", "compare", "review", "use_tool"],
    supportLevel: "guided",
    ...overrides
  };
}

function samplePlanningContract(extra = {}) {
  return buildMicrosequencePlanningContract({
    selectedCourse: {
      key: "course",
      title: "Curso",
      description: "Objetivo do curso",
      sourceGuide: "Guia do curso",
      sourceGuideStructured: { globalScope: "Escopo do curso." }
    },
    selectedModule: {
      key: "module",
      title: "Módulo",
      description: "Objetivo do módulo",
      sourceGuide: "Guia do módulo",
      sourceGuideStructured: { moduleScope: "Escopo do módulo." }
    },
    selectedLesson: {
      key: "lesson",
      title: "Lição",
      description: "Objetivo da lição",
      sourceGuide: "Guia da lição",
      sourceGuideStructured: { lessonGoal: "Escopo da lição." },
      ...makeBroadLessonGuidance(),
      lessonTopics: [{ refKey: "micro-git", label: "Git", source: "microsequence" }],
      microsequences: [
        { key: "micro-base", title: "Base", description: "Introdução", tags: ["Git"], status: "ready" },
        { key: "micro", title: "Microssequência", description: "Alvo", tags: ["add"], status: "draft" }
      ]
    },
    targetMicrosequence: { key: "micro", title: "Microssequência", description: "Alvo", tags: ["add"], status: "draft" },
    selectedLessonTopicRefs: [{ refKey: "micro-git", label: "Git", source: "microsequence" }],
    userPrompt: "Explique git add",
    selectedModel: "gemini-2.5-flash",
    ...extra
  });
}

function validPlan(overrides = {}) {
  return {
    typeId: "guided_practice",
    sizeId: "short",
    microsequenceGoal: "Praticar um conceito.",
    selectedExtraResourceTypes: ["table"],
    cardPlan: [
      { position: 1, role: "situar a prática", resourceType: "paragraph", sourceRefs: [] },
      { position: 2, role: "propor lacuna", resourceType: "block_gap_fill", sourceRefs: [] },
      { position: 3, role: "consolidar", resourceType: "multiple_choice", sourceRefs: [] }
    ],
    sourceUsePlan: [],
    reason: "curto",
    ...overrides
  };
}

function validGeneratedCardsResponse() {
  return {
    cards: [
      { position: 1, resourceType: "paragraph", title: "Ideia", text: "Texto curto." },
      {
        position: 2,
        resourceType: "block_gap_fill",
        title: "Complete",
        prompt: "Complete.",
        segments: [{ kind: "text", value: "Use" }, { kind: "blank", blankId: "b1", acceptedBlockIds: ["x"] }],
        blocks: [{ blockId: "x", label: "git add" }],
        feedbackAfter: "Isso prepara arquivos."
      },
      {
        position: 3,
        resourceType: "multiple_choice",
        title: "Teste",
        question: "Qual comando prepara arquivos?",
        options: [
          { optionId: "a", label: "git add" },
          { optionId: "b", label: "git push" },
          { optionId: "c", label: "git log" }
        ],
        correctOptionId: "a",
        feedback: "Preparar vem antes do commit."
      }
    ]
  };
}

function sampleGenerationContract(extraPlan = {}) {
  const planningContract = samplePlanningContract({ userSelectedExtraResourceTypes: ["table"] });
  return buildMicrosequenceGenerationContract({
    planningContract,
    validatedPlan: validateMicrosequencePlan(validPlan(extraPlan), planningContract),
    selectedModel: "gemini-2.5-flash"
  });
}

test("lista tipos didáticos e tamanhos internos", () => {
  const types = listMicrosequenceTypes();

  assert.ok(types.some((item) => item.id === "assisted"));
  assert.ok(types.some((item) => item.id === "simple"));
  assert.ok(types.every((item) => item.id && item.label && item.shortDescription && item.availableSizes.length));
  assert.ok(types.every((item) => item.cardPlansBySize.short && item.cardPlansBySize.medium && item.cardPlansBySize.long));
  assert.ok(
    types.every((item) =>
      Object.values(item.cardPlansBySize).every((planItems) =>
        planItems.every((planItem) => planItem.roleId && planItem.label && Array.isArray(planItem.preferredResources) && planItem.preferredResources.length)
      )
    )
  );
  assert.ok(types.find((item) => item.id === "guided_practice").baseResourceTypes.includes("block_gap_fill"));
  assert.equal(getMicrosequenceCardCount("short"), 3);
  assert.equal(getMicrosequenceCardCount("medium"), 5);
  assert.equal(getMicrosequenceCardCount("long"), 7);
  assert.deepEqual(listMicrosequenceSizes().map((item) => item.id), ["short", "medium", "long"]);
});

test("catálogo contém recursos e schemas esperados", () => {
  const resources = listCardResourceDefinitions();
  const ids = resources.map((item) => item.id);

  assert.ok(["paragraph", "multiple_choice", "code_editor", "table", "flowchart", "block_gap_fill", "tree", "plane", "matrix"].every((id) => ids.includes(id)));
  assert.ok(resources.every((item) => item.label && item.shortDescription && item.schema && item.limits));
});

test("planejamento recebe selectedLessonTopicRefs, catálogo leve e valida plano", () => {
  const contract = samplePlanningContract({
    userFixedTypeId: "guided_practice",
    userSelectedExtraResourceTypes: ["table"]
  });
  const validation = validateMicrosequencePlan(validPlan(), contract);
  const prompt = buildMicrosequencePlanningPrompt(contract, getModelCapabilities("gemini-2.5-flash"));

  assert.equal(contract.selectedLessonTopicRefs[0].label, "Git");
  assert.equal(contract.selectedLessonTopicRefs[0].refKey, "micro-git");
  assert.equal(contract.selectedLessonTopicRefs[0].source, "microsequence");
  assert.deepEqual(contract.context.path.map((item) => item.level), ["course", "module", "lesson", "microsequence"]);
  assert.equal(contract.context.sourceGuideLineage[0].sourceGuide, "Escopo do curso: Escopo do curso.");
  assert.equal(contract.context.lesson.microsequenceLine[0].title, "Base");
  assert.deepEqual(contract.requestGovernance.precedence, [
    "context.lesson.sourceGuideStructured",
    "context.sourceGuideLineage",
    "selectedLessonTopicRefs",
    "request.userPrompt"
  ]);
  assert.equal(contract.requestGovernance.userPromptRole, "especializar o recorte imediato e a ênfase dentro da lição atual");
  assert.deepEqual(contract.requestGovernance.lessonAnchors.map((item) => item.field), ["lessonGoal"]);
  assert.ok(contract.availableResources.some((item) => item.id === "paragraph" && !item.schema));
  assert.equal(contract.didacticGuardrails.generationFlow[0], "microteoria");
  assert.ok(contract.didacticGuardrails.hardRules.includes("bastidor zero no texto do aluno"));
  assert.ok(contract.didacticGuardrails.practiceContract.deterministicChecks.some((item) => item.includes("lacuna longa")));
  assert.match(prompt, /requestGovernance\.precedence como ordem obrigatória de leitura do contrato/);
  assert.match(prompt, /requestGovernance\.lessonAnchors como âncoras fortes da lição/);
  assert.match(prompt, /Se request\.userPrompt conflitar com a meta, a notação, as confusões prováveis ou o critério final da lição/);
  assert.match(prompt, /selectedLessonTopicRefs são assuntos selecionados no escopo da lição/);
  assert.match(prompt, /context\.path como a linha hierárquica completa até a microssequência/);
  assert.match(prompt, /context\.sourceGuideLineage como governança acumulada/);
  assert.match(prompt, /context\.lesson\.microsequenceLine/);
  assert.match(prompt, /planeje a sequência microteoria -> exemplo guiado -> prática autossuficiente -> consolidação/);
  assert.match(prompt, /Papel do AraLearn nesta operação: fixar contrato, tipos disponíveis, recursos possíveis, validação local e cardPlan final/);
  assert.match(prompt, /Seu papel aqui é apenas propor typeId, sizeId, microsequenceGoal/);
  assert.match(prompt, /Não decida contrato final, recurso por posição, aplicação no projeto nem revisão editorial final/);
  assert.match(prompt, /Não devolva cardPlan/);
  assert.equal(validation.ok, true);
  assert.equal(validation.plan.sizeId, "short");
  assert.equal(validation.plan.cardPlan.length, 3);
  assert.deepEqual(validation.plan.cardPlan.map((item) => item.resourceType), ["paragraph", "block_gap_fill", "multiple_choice"]);
});

test("planejamento valida sourceUsePlan contra fontes resolvidas", () => {
  const contract = samplePlanningContract({
    attachedSources: [{ sourceId: "source-1", displayName: "guia.pdf", kind: "pdf" }],
    userSelectedSourceIds: ["source-1"]
  });

  const accepted = validateMicrosequencePlan(
    validPlan({
      sourceUsePlan: [{ sourceId: "source-1", usage: "base principal", note: "Usar só para nomenclatura." }]
    }),
    contract
  );
  const rejected = validateMicrosequencePlan(
    validPlan({
      sourceUsePlan: [{ sourceId: "source-inexistente" }, { sourceId: "source-inexistente" }]
    }),
    contract
  );

  assert.equal(accepted.ok, true);
  assert.deepEqual(accepted.plan.sourceUsePlan, [
    { sourceId: "source-1", usage: "base principal", note: "Usar só para nomenclatura." }
  ]);
  assert.equal(rejected.ok, false);
  assert.match(rejected.errors.join(" "), /fonte inexistente/);
});

test("planejamento e edição enviam fonte-guia compacta ao modelo", () => {
  const contract = samplePlanningContract({
    selectedCourse: {
      key: "course",
      title: "Curso",
      description: "Objetivo do curso",
      sourceGuide: "Resumo legado do curso",
      sourceGuideStructured: { globalScope: "Escopo do curso.", freeNotes: "Não enviar ao modelo." }
    },
    selectedModule: {
      key: "module",
      title: "Módulo",
      description: "Objetivo do módulo",
      sourceGuide: "Resumo legado do módulo",
      sourceGuideStructured: { moduleScope: "Escopo do módulo.", freeNotes: "Não enviar ao modelo." }
    },
    selectedLesson: {
      key: "lesson",
      title: "Lição",
      description: "Objetivo da lição",
      sourceGuide: "Resumo legado da lição",
      sourceGuideStructured: { lessonGoal: "Escopo da lição.", freeNotes: "Não enviar ao modelo." },
      ...makeBroadLessonGuidance(),
      lessonTopics: [{ refKey: "micro-git", label: "Git", source: "microsequence" }],
      microsequences: [{ key: "micro", title: "Microssequência", description: "Alvo", tags: ["add"], status: "draft" }]
    }
  });
  const editContract = buildMicrosequenceEditPlanningContract({
    selectedCourse: contract.context.course,
    selectedModule: contract.context.module,
    selectedLesson: contract.context.lesson,
    selectedMicrosequence: { key: "micro", title: "Microssequência", description: "Alvo" },
    selectedMicrosequenceVersion: { id: "v2", label: "v2" },
    currentCards: [],
    previousVersions: [],
    userEditPrompt: "Ajuste a linguagem",
    selectedModel: "gemini-2.5-flash"
  });

  assert.deepEqual(contract.context.course.sourceGuideStructured, { globalScope: "Escopo do curso." });
  assert.equal(contract.context.course.sourceGuide.includes("Observações livres"), false);
  assert.deepEqual(contract.context.module.sourceGuideStructured, { moduleScope: "Escopo do módulo." });
  assert.deepEqual(contract.context.lesson.sourceGuideStructured, { lessonGoal: "Escopo da lição." });
  assert.deepEqual(contract.requestGovernance.lessonAnchors, [
    { field: "lessonGoal", label: "Meta da lição", value: "Escopo da lição." }
  ]);
  assert.equal(editContract.context.lesson.sourceGuide.includes("Observações livres"), false);
  assert.deepEqual(editContract.context.lesson.sourceGuideStructured, { lessonGoal: "Escopo da lição." });
  assert.deepEqual(editContract.requestGovernance.lessonAnchors, [
    { field: "lessonGoal", label: "Meta da lição", value: "Escopo da lição." }
  ]);
});

test("planejamento com tipo fixado envia apenas o tipo efetivo", () => {
  const contract = samplePlanningContract({ userFixedTypeId: "simple" });
  const prompt = buildMicrosequencePlanningPrompt(contract, getModelCapabilities("gemini-2.5-flash"));

  assert.deepEqual(contract.availableTypes.map((item) => item.id), ["simple"]);
  assert.match(prompt, /typeId exatamente igual a "simple"/);
});

test("campos legados de tags são normalizados para selectedLessonTopicRefs", () => {
  const contract = samplePlanningContract({
    selectedLessonTopicRefs: undefined,
    selectedLessonTags: [{ id: "micro-git", label: "Git", source: "microsequence" }]
  });

  assert.deepEqual(contract.selectedLessonTopicRefs, [
    { refKey: "micro-git", label: "Git", source: "microsequence" }
  ]);
});

test("planejamento rejeita tipo e preservação inválidos, mas ignora cardPlan do modelo", () => {
  const contract = samplePlanningContract({ userFixedTypeId: "procedure", userSelectedExtraResourceTypes: ["flowchart"] });
  const validation = validateMicrosequencePlan(
    validPlan({
      typeId: "guided_practice",
      sizeId: "medium",
      selectedExtraResourceTypes: [],
      cardPlan: validPlan().cardPlan
    }),
    contract
  );

  assert.equal(validation.ok, false);
  assert.match(validation.errors.join(" "), /Tipo fixado/);
  assert.match(validation.errors.join(" "), /flowchart/);

  const accepted = validateMicrosequencePlan(
    validPlan({
      cardPlan: [{ position: 99, role: "ignorar", resourceType: "image", sourceRefs: ["fonte-inexistente"] }]
    }),
    samplePlanningContract()
  );
  assert.equal(accepted.ok, true);
  assert.deepEqual(accepted.plan.cardPlan.map((item) => item.position), [1, 2, 3]);
});

test("resolve recursos de geração com base, extras e deduplicação", () => {
  const result = resolveResourcesForGenerationPlan({
    resolvedMicrosequenceTypeId: "guided_practice",
    userSelectedExtraResourceTypes: ["table", "paragraph"],
    planSelectedExtraResourceTypes: ["table", "flowchart"]
  });
  const selector = buildResourceSelectorState({
    resolvedMicrosequenceTypeId: "guided_practice",
    userSelectedExtraResourceTypes: ["table", "tree"]
  });

  assert.deepEqual(result.baseResourceTypes, ["paragraph", "block_gap_fill"]);
  assert.deepEqual(result.userExtraResourceTypes, ["table"]);
  assert.deepEqual(result.planExtraResourceTypes, ["flowchart"]);
  assert.ok(result.allowedResourceTypes.includes("flowchart"));
  assert.ok(selector.find((item) => item.id === "tree").selected);
  assert.ok(selector.find((item) => item.id === "paragraph").disabled);
  assert.ok(selector.find((item) => item.id === "table").selected);
});

test("contrato e prompt de geração usam contexto, tags, tamanho e schemas efetivos", () => {
  const planningContract = samplePlanningContract({ userSelectedExtraResourceTypes: ["table"] });
  const validatedPlan = validateMicrosequencePlan(validPlan(), planningContract);
  const generationContract = buildMicrosequenceGenerationContract({ planningContract, validatedPlan, selectedModel: "gemini-2.5-flash" });
  const prompt = buildMicrosequenceGenerationPrompt(generationContract, getModelCapabilities("gemini-2.5-flash"));

  assert.equal(generationContract.context.course.title, "Curso");
  assert.equal(generationContract.context.path[3].title, "Microssequência");
  assert.equal(generationContract.context.sourceGuideLineage[2].sourceGuide, "Meta da lição: Escopo da lição.");
  assert.equal(generationContract.selectedLessonTopicRefs[0].label, "Git");
  assert.equal(generationContract.request.sizeId, "short");
  assert.equal(generationContract.request.cardCount, 3);
  assert.equal(generationContract.didacticGuardrails.generationFlow[1], "exemplo guiado");
  assert.equal(generationContract.requestGovernance.lessonAnchors[0].field, "lessonGoal");
  assert.deepEqual(Object.keys(generationContract.resources.resourceSchemas).sort(), ["block_gap_fill", "multiple_choice", "paragraph", "table"].sort());
  assert.match(prompt, /block_gap_fill/);
  assert.match(prompt, /"kind":"blank"/);
  assert.match(prompt, /não use content, segments\[\]\.text nem blocks\[\]\.text/);
  assert.match(prompt, /selectedLessonTopicRefs como assuntos selecionados no escopo da lição/);
  assert.match(prompt, /requestGovernance\.precedence como ordem obrigatória de leitura do contrato/);
  assert.match(prompt, /Se request\.userPrompt conflitar com a meta, a notação, as confusões prováveis ou o critério final da lição/);
  assert.match(prompt, /context\.path como a linha hierárquica completa até a microssequência/);
  assert.match(prompt, /context\.sourceGuideLineage como governança acumulada/);
  assert.match(prompt, /context\.lesson\.microsequenceLine/);
  assert.match(prompt, /Não coloque prática antes da microteoria/);
  assert.match(prompt, /Quando a regra for abstrata ou pouco intuitiva/);
  assert.match(prompt, /Quando o card definir um conceito/);
  assert.match(prompt, /Quando aparecer notação pouco familiar/);
  assert.match(prompt, /Não use linguagem de bastidor nem referência externa ou volátil/);
  assert.match(prompt, /Não crie exercício cuja resposta já esteja explicitamente revelada no mesmo card/i);
  assert.match(prompt, /rolagem vertical/);
  assert.match(prompt, /Trate sourceGuide de curso, módulo e lição como contrato de governança/);
  assert.match(prompt, /Papel do AraLearn: fixar didacticPlan\.cardPlan, recursos permitidos, schemas aceitos, validação e adaptação para o contrato público/);
  assert.match(prompt, /Seu papel aqui é apenas preencher o conteúdo dos cards já planejados/);
  assert.match(prompt, /Não mude tags persistentes, destino estrutural, status da microssequência nem decisão editorial final/);
  assert.match(prompt, /destaque inline com acentos graves em símbolos, conectivos, comandos, fórmulas e nomes curtos/);
  assert.match(prompt, /Não repita o title do card/);
  assert.doesNotMatch(prompt, /"allowedResourceTypes":\[[^\]]*code_editor/);
});

test("capacidades do modelo ficam separadas dos tipos didáticos", () => {
  const capabilities = getModelCapabilities("gemini-2.5-flash");
  const type = listMicrosequenceTypes()[0];

  assert.equal(capabilities.profile, "compact-json");
  assert.equal(capabilities.supportsFilesApi, true);
  assert.equal(type.provider, undefined);
});

test("validação de geração aceita cards válidos e rejeita erros estruturais", () => {
  const planningContract = samplePlanningContract({ userSelectedExtraResourceTypes: ["table"] });
  const generationContract = buildMicrosequenceGenerationContract({
    planningContract,
    validatedPlan: validateMicrosequencePlan(validPlan(), planningContract),
    selectedModel: "gemini-2.5-flash"
  });
  const response = {
    cards: [
      { position: 1, resourceType: "paragraph", title: "Ideia", text: "Texto curto." },
      {
        position: 2,
        resourceType: "block_gap_fill",
        title: "Complete",
        prompt: "Complete.",
        segments: [{ kind: "text", value: "Use" }, { kind: "blank", blankId: "b1", acceptedBlockIds: ["x"] }],
        blocks: [{ blockId: "x", label: "git add" }],
        feedbackAfter: "Isso prepara arquivos."
      },
      {
        position: 3,
        resourceType: "multiple_choice",
        title: "Teste",
        question: "Qual comando prepara arquivos?",
        options: [
          { optionId: "a", label: "git add" },
          { optionId: "b", label: "git push" },
          { optionId: "c", label: "git log" }
        ],
        correctOptionId: "a",
        feedback: "Preparar vem antes do commit."
      }
    ]
  };

  assert.equal(validateGeneratedCards(response, generationContract).ok, true);
  assert.equal(validateGeneratedCards({ cards: response.cards.slice(0, 2) }, generationContract).ok, false);
  assert.equal(validateGeneratedCards({ cards: [{ ...response.cards[0], resourceType: "image" }, ...response.cards.slice(1)] }, generationContract).ok, false);
  assert.equal(
    validateGeneratedCards(
      { cards: [response.cards[0], { ...response.cards[1], feedbackPopup: undefined }, response.cards[2]] },
      generationContract
    ).ok,
    false
  );
  assert.equal(
    validateGeneratedCards(
      { cards: [response.cards[0], { ...response.cards[1], feedbackAfter: undefined }, response.cards[2]] },
      generationContract
    ).ok,
    false
  );
  assert.equal(
    validateGeneratedCards(
      {
        cards: [
          { ...response.cards[0], text: "Como vimos no card anterior, use git add." },
          response.cards[1],
          response.cards[2]
        ]
      },
      generationContract
    ).ok,
    false
  );
  assert.equal(
    validateGeneratedCards(
      {
        cards: [
          response.cards[0],
          {
            ...response.cards[1],
            prompt: "Complete [[um comando inteiro com muitas palavras e contexto extra::x|y]]."
          },
          response.cards[2]
        ]
      },
      generationContract
    ).ok,
    false
  );
});

test("validação de geração aceita plane e matrix gerados", () => {
  const generationContract = sampleGenerationContract();
  generationContract.resources.allowedResourceTypes = ["plane", "matrix", "multiple_choice"];
  generationContract.didacticPlan.cardPlan = [
    { position: 1, role: "mostrar vetor", resourceType: "plane", sourceRefs: [] },
    { position: 2, role: "mostrar matriz", resourceType: "matrix", sourceRefs: [] },
    { position: 3, role: "consolidar", resourceType: "multiple_choice", sourceRefs: [] }
  ];
  const response = {
    cards: [
      { position: 1, resourceType: "plane", title: "Soma visual", prompt: "Observe.", sum: [[1, 2], [3, 1]], result: [4, 3] },
      {
        position: 2,
        resourceType: "matrix",
        title: "Soma por entrada",
        sequence: [
          { name: "A", values: [[1, 2], [3, 4]] },
          { connector: "+", name: "B", values: [[5, 6], [7, 8]] },
          { connector: "=", name: "A+B", values: [["1 + 5", "2 + 6"], [10, 12]], highlight: "cell:1,1" }
        ]
      },
      {
        position: 3,
        resourceType: "multiple_choice",
        title: "Teste",
        question: "Como somar matrizes?",
        options: [
          { optionId: "a", label: "Entrada por entrada" },
          { optionId: "b", label: "Por diagonal apenas" },
          { optionId: "c", label: "Somando só linhas" }
        ],
        correctOptionId: "a",
        feedback: "A soma ocorre posição por posição."
      }
    ]
  };

  assert.equal(validateGeneratedCards(response, generationContract).ok, true);
  assert.equal(
    validateGeneratedCards(
      {
        cards: [
          response.cards[0],
          { ...response.cards[1], sequence: response.cards[1].sequence.map((item, index) => (index === 2 ? { ...item, highlight: "cell:9,9" } : item)) },
          response.cards[2]
        ]
      },
      generationContract
    ).ok,
    false
  );
});

test("block_gap_fill valida estrutura fechada de segmentos, blocos e feedbackAfter", () => {
  const planningContract = samplePlanningContract();
  const generationContract = buildMicrosequenceGenerationContract({
    planningContract,
    validatedPlan: validateMicrosequencePlan(validPlan(), planningContract),
    selectedModel: "gemini-2.5-flash"
  });
  const validCard = {
    position: 2,
    resourceType: "block_gap_fill",
    title: "Complete",
    prompt: "Complete.",
    segments: [
      { kind: "text", value: "Use" },
      { kind: "blank", blankId: "b1", acceptedBlockIds: ["x"] },
      { kind: "text", value: "." }
    ],
    blocks: [{ blockId: "x", label: "git add" }],
    feedbackAfter: "Isso prepara arquivos."
  };
  const validResponse = {
    cards: [
      { position: 1, resourceType: "paragraph", title: "Ideia", text: "Texto." },
      validCard,
      {
        position: 3,
        resourceType: "multiple_choice",
        title: "Teste",
        question: "Qual comando prepara?",
        options: [{ optionId: "a", label: "git add" }, { optionId: "b", label: "git push" }, { optionId: "c", label: "git log" }],
        correctOptionId: "a",
        feedback: "git add prepara."
      }
    ]
  };

  assert.equal(validateGeneratedCards(validResponse, generationContract).ok, true);
  assert.equal(validateGeneratedCards({ cards: [validResponse.cards[0], { ...validCard, content: {} }, validResponse.cards[2]] }, generationContract).ok, false);
  assert.equal(
    validateGeneratedCards(
      { cards: [validResponse.cards[0], { ...validCard, segments: [{ text: "Use" }] }, validResponse.cards[2]] },
      generationContract
    ).ok,
    false
  );
  assert.equal(
    validateGeneratedCards(
      { cards: [validResponse.cards[0], { ...validCard, blocks: [{ text: "git add" }] }, validResponse.cards[2]] },
      generationContract
    ).ok,
    false
  );
  assert.equal(validateGeneratedCards({ cards: [validResponse.cards[0], { ...validCard, feedbackAfter: "" }, validResponse.cards[2]] }, generationContract).ok, false);
  assert.equal(validateGeneratedCards({ cards: [validResponse.cards[0], { ...validCard, feedbackAfter: "Use [[git add::git add|git push]]." }, validResponse.cards[2]] }, generationContract).ok, false);
});

test("prompt de reparo de cards inclui contrato efetivo e schemas permitidos", () => {
  const generationContract = sampleGenerationContract();
  const prompt = buildGeneratedCardsRepairPrompt({
    invalidResponse: { cards: [{ resourceType: "block_gap_fill", segments: [{ text: "Use" }] }] },
    validationErrors: ["Cada segmento precisa usar kind text ou blank."],
    generationContract,
    modelCapabilities: getModelCapabilities("gemini-2.5-flash")
  });

  assert.match(prompt, /Corrija apenas o JSON abaixo/);
  assert.match(prompt, /expectedCardCount/);
  assert.match(prompt, /cardPlan validado/);
  assert.match(prompt, /allowedResourceTypes/);
  assert.match(prompt, /resourceSchemas permitidos/);
  assert.match(prompt, /block_gap_fill/);
  assert.doesNotMatch(prompt, /code_editor/);
});

test("validateOrRepairGeneratedCards aceita geração válida sem reparo", async () => {
  const generationContract = sampleGenerationContract();
  let calls = 0;

  const result = await validateOrRepairGeneratedCards({
    rawGeneratedResponse: validGeneratedCardsResponse(),
    generationContract,
    modelCapabilities: getModelCapabilities("gemini-2.5-flash"),
    callModel: async () => {
      calls += 1;
      return validGeneratedCardsResponse();
    }
  });

  assert.equal(result.ok, true);
  assert.equal(result.repaired, false);
  assert.equal(result.repairAttempts, 0);
  assert.equal(result.cards.length, 3);
  assert.equal(calls, 0);
});

test("validateOrRepairGeneratedCards chama reparo quando geração final falha", async () => {
  const generationContract = sampleGenerationContract();
  let calls = 0;

  const result = await validateOrRepairGeneratedCards({
    rawGeneratedResponse: { cards: validGeneratedCardsResponse().cards.slice(0, 2) },
    generationContract,
    modelCapabilities: getModelCapabilities("gemini-2.5-flash"),
    callModel: async ({ prompt }) => {
      calls += 1;
      assert.match(prompt, /Quantidade incorreta de cards/);
      return validGeneratedCardsResponse();
    }
  });

  assert.equal(result.ok, true);
  assert.equal(result.repaired, true);
  assert.equal(result.repairAttempts, 1);
  assert.equal(calls, 1);
});

test("validateOrRepairGeneratedCards corrige block_gap_fill aproximado e preserva feedbackAfter", async () => {
  const generationContract = sampleGenerationContract();
  const invalidBlockGapFill = {
    cards: [
      validGeneratedCardsResponse().cards[0],
      {
        position: 2,
        resourceType: "block_gap_fill",
        title: "Complete",
        prompt: "Complete.",
        segments: [{ text: "Use" }],
        blocks: [{ text: "git add" }],
        feedbackAfter: "Isso prepara arquivos."
      },
      validGeneratedCardsResponse().cards[2]
    ]
  };

  const result = await validateOrRepairGeneratedCards({
    rawGeneratedResponse: invalidBlockGapFill,
    generationContract,
    modelCapabilities: getModelCapabilities("gemini-2.5-flash"),
    callModel: async () => invalidBlockGapFill
  });

  assert.equal(result.ok, true);
  assert.equal(result.cards[1].segments[0].kind, "text");
  assert.equal(result.cards[1].segments[0].value, "Use");
  assert.equal(result.cards[1].segments[1].acceptedBlockIds[0], "block_1");
  assert.equal(result.cards[1].blocks[0].label, "git add");
  assert.equal(result.cards[1].feedbackAfter, "Isso prepara arquivos.");
});

test("validateOrRepairGeneratedCards mantém feedbackAfter de block_gap_fill como texto simples", async () => {
  const generationContract = sampleGenerationContract();
  const invalidBlockGapFill = {
    cards: [
      validGeneratedCardsResponse().cards[0],
      {
        position: 2,
        resourceType: "block_gap_fill",
        title: "Complete",
        prompt: "Complete.",
        segments: [{ text: "Use" }],
        blocks: [{ text: "git add" }, { text: "git push" }],
        feedbackAfter: "O bloco correto é [[git add::git add|git push]]."
      },
      validGeneratedCardsResponse().cards[2]
    ]
  };

  const result = await validateOrRepairGeneratedCards({
    rawGeneratedResponse: invalidBlockGapFill,
    generationContract,
    modelCapabilities: getModelCapabilities("gemini-2.5-flash"),
    callModel: async () => invalidBlockGapFill
  });

  assert.equal(result.ok, true);
  assert.equal(result.cards[1].feedbackAfter, "O bloco correto é git add.");
  assert.doesNotMatch(result.cards[1].feedbackAfter, /\[\[/);
  assert.doesNotMatch(result.cards[1].feedbackAfter, /\|/);
});

test("validateOrRepairGeneratedCards corrige multiple_choice com índice e tree sem id", async () => {
  const choiceContract = sampleGenerationContract();
  const invalidChoice = {
    cards: [
      validGeneratedCardsResponse().cards[0],
      validGeneratedCardsResponse().cards[1],
      {
        position: 3,
        resourceType: "multiple_choice",
        title: "Teste",
        question: "Qual comando prepara arquivos?",
        options: [{ text: "git push" }, { text: "git add" }, { text: "git log" }],
        correctIndex: 1,
        feedback: "git add prepara arquivos."
      }
    ]
  };
  const choiceResult = await validateOrRepairGeneratedCards({
    rawGeneratedResponse: invalidChoice,
    generationContract: choiceContract,
    modelCapabilities: getModelCapabilities("gemini-2.5-flash"),
    callModel: async () => invalidChoice
  });
  const treeContract = sampleGenerationContract({
    selectedExtraResourceTypes: ["table", "tree"]
  });
  treeContract.resources.allowedResourceTypes = ["paragraph", "tree", "multiple_choice"];
  treeContract.didacticPlan.cardPlan = [
    { position: 1, role: "situar", resourceType: "paragraph", sourceRefs: [] },
    { position: 2, role: "mostrar estrutura", resourceType: "tree", sourceRefs: [] },
    { position: 3, role: "consolidar", resourceType: "multiple_choice", sourceRefs: [] }
  ];
  const invalidTree = {
    cards: [
      validGeneratedCardsResponse().cards[0],
      {
        position: 2,
        resourceType: "tree",
        title: "Estrutura",
        nodes: [{ label: "src", type: "folder" }, { label: "app.js", type: "file" }]
      },
      validGeneratedCardsResponse().cards[2]
    ]
  };
  const treeResult = await validateOrRepairGeneratedCards({
    rawGeneratedResponse: invalidTree,
    generationContract: treeContract,
    modelCapabilities: getModelCapabilities("gemini-2.5-flash"),
    callModel: async () => invalidTree
  });

  assert.equal(choiceResult.ok, true);
  assert.equal(choiceResult.cards[2].correctOptionId, "option_2");
  assert.deepEqual(choiceResult.cards[2].options.map((option) => option.label), ["git push", "git add", "git log"]);
  assert.equal(treeResult.ok, true);
  assert.deepEqual(treeResult.cards[1].nodes.map((node) => node.id), ["src", "app.js"]);
});

test("validateOrRepairGeneratedCards rejeita reparo ainda inválido", async () => {
  const generationContract = sampleGenerationContract();
  const result = await validateOrRepairGeneratedCards({
    rawGeneratedResponse: { cards: [{ position: 1, resourceType: "paragraph", title: "", text: "" }] },
    generationContract,
    modelCapabilities: getModelCapabilities("gemini-2.5-flash"),
    callModel: async () => ({ cards: [{ position: 1, resourceType: "image", title: "Imagem" }] })
  });

  assert.equal(result.ok, false);
  assert.equal(result.repaired, true);
  assert.equal(result.repairAttempts, 1);
  assert.match(result.errors.join(" "), /Quantidade incorreta de cards|Recurso fora do permitido/);
});

test("validateOrRepairGeneratedCards repara recurso mecânico, respeita contagem e cardPlan.position", async () => {
  const generationContract = sampleGenerationContract();
  const directMismatch = validateGeneratedCards(
    { cards: validGeneratedCardsResponse().cards.map((card) => ({ ...card, resourceType: card.position === 2 ? "multiple_choice" : card.resourceType })) },
    generationContract
  );
  const wrongResource = await validateOrRepairGeneratedCards({
    rawGeneratedResponse: { cards: validGeneratedCardsResponse().cards.map((card) => ({ ...card, resourceType: card.position === 2 ? "image" : card.resourceType })) },
    generationContract,
    modelCapabilities: getModelCapabilities("gemini-2.5-flash"),
    callModel: async () => ({ cards: validGeneratedCardsResponse().cards.map((card) => ({ ...card, resourceType: card.position === 2 ? "image" : card.resourceType })) })
  });
  const wrongCount = await validateOrRepairGeneratedCards({
    rawGeneratedResponse: { cards: validGeneratedCardsResponse().cards.slice(0, 2) },
    generationContract,
    modelCapabilities: getModelCapabilities("gemini-2.5-flash"),
    callModel: async () => ({ cards: validGeneratedCardsResponse().cards.slice(0, 2) })
  });
  const wrongPosition = await validateOrRepairGeneratedCards({
    rawGeneratedResponse: { cards: validGeneratedCardsResponse().cards.map((card) => ({ ...card, position: 1 })) },
    generationContract,
    modelCapabilities: getModelCapabilities("gemini-2.5-flash"),
    callModel: async () => ({ cards: validGeneratedCardsResponse().cards.map((card) => ({ ...card, position: 1 })) })
  });

  assert.equal(directMismatch.ok, false);
  assert.match(directMismatch.errors.join(" "), /resourceType incoerente com cardPlan/);
  assert.equal(wrongResource.ok, true);
  assert.equal(wrongResource.cards[1].resourceType, "block_gap_fill");
  assert.equal(wrongCount.ok, false);
  assert.match(wrongCount.errors.join(" "), /Quantidade incorreta de cards/);
  assert.equal(wrongPosition.ok, true);
  assert.deepEqual(wrongPosition.cards.map((card) => card.position), [1, 2, 3]);
});

test("tree entra no catálogo, no planejamento, em allowedResourceTypes e na validação", () => {
  const planningContract = samplePlanningContract({ userSelectedExtraResourceTypes: ["tree"] });
  const plan = validPlan({
    selectedExtraResourceTypes: ["tree"]
  });
  const validatedPlan = validateMicrosequencePlan(plan, planningContract);
  const generationContract = buildMicrosequenceGenerationContract({ planningContract, validatedPlan, selectedModel: "gemini-2.5-flash" });
  generationContract.didacticPlan.cardPlan = [
    { position: 1, role: "situar", resourceType: "paragraph", sourceRefs: [] },
    { position: 2, role: "mostrar estrutura", resourceType: "tree", sourceRefs: [] },
    { position: 3, role: "consolidar", resourceType: "multiple_choice", sourceRefs: [] }
  ];
  const response = {
    cards: [
      { position: 1, resourceType: "paragraph", title: "Ideia", text: "Texto curto." },
      {
        position: 2,
        resourceType: "tree",
        title: "Estrutura",
        prompt: "Observe a estrutura.",
        base: "/",
        current: "/home/aluno",
        selected: "/home/aluno/projetos",
        nodes: [
          { id: "home", label: "home", type: "folder" },
          { id: "aluno", label: "aluno", parentId: "home", type: "folder" },
          { id: "projetos", label: "projetos", parentId: "aluno", type: "folder" },
          { id: "readme", label: "README.md", parentId: "projetos", type: "file" }
        ]
      },
      {
        position: 3,
        resourceType: "multiple_choice",
        title: "Teste",
        question: "Qual item é arquivo?",
        options: [
          { optionId: "a", label: "README.md" },
          { optionId: "b", label: "projetos" },
          { optionId: "c", label: "home" }
        ],
        correctOptionId: "a",
        feedback: "Arquivo é folha na árvore."
      }
    ]
  };

  assert.equal(validatedPlan.ok, true);
  assert.ok(planningContract.availableResources.some((item) => item.id === "tree"));
  assert.ok(generationContract.resources.allowedResourceTypes.includes("tree"));
  assert.ok(Object.keys(generationContract.resources.resourceSchemas).includes("tree"));
  assert.equal(validateGeneratedCards(response, generationContract).ok, true);
});

test("fontes resolvem seleção explícita, menção e ambiguidade", () => {
  const sources = [
    { sourceId: "s1", displayName: "manual.pdf", kind: "pdf" },
    { sourceId: "s2", displayName: "tabela.txt", kind: "text" }
  ];

  assert.equal(resolveReferencedSources({ attachedSources: sources, userSelectedSourceIds: ["s1"] }).referencedSources[0].sourceId, "s1");
  assert.equal(resolveReferencedSources({ userPrompt: "use tabela", attachedSources: sources }).referencedSources[0].sourceId, "s2");
  assert.equal(resolveReferencedSources({ userPrompt: "sem fonte", attachedSources: sources }).shouldAskUserToSelectSource, true);
});

test("planejamento e contrato de edição preservam versão, selectedLessonTopicRefs e recursos", () => {
  const editPlanningContract = buildMicrosequenceEditPlanningContract({
    selectedCourse: { key: "course", title: "Curso", sourceGuide: "Guia do curso", sourceGuideStructured: { globalScope: "Escopo do curso." } },
    selectedModule: { key: "module", title: "Módulo", sourceGuide: "Guia do módulo", sourceGuideStructured: { moduleScope: "Escopo do módulo." } },
    selectedLesson: {
      key: "lesson",
      title: "Lição",
      sourceGuide: "Guia da lição",
      sourceGuideStructured: { lessonGoal: "Escopo da lição." },
      ...makeBroadLessonGuidance(),
      lessonTopics: [{ refKey: "micro-git", label: "Git", source: "microsequence" }],
      microsequences: [{ key: "micro", title: "Micro", description: "Atual", tags: ["Git"], status: "ready" }]
    },
    selectedMicrosequence: { key: "micro", title: "Micro", description: "Atual", tags: ["Git"], status: "ready" },
    selectedMicrosequenceVersion: { id: "v1" },
    selectedLessonTopicRefs: [{ refKey: "micro-git", label: "Git", source: "microsequence" }],
    currentCards: [{ key: "c1", title: "Card 1", say: "Texto" }],
    previousVersions: [{ id: "v0", label: "Anterior", cards: [{ title: "Antigo", say: "Antes" }] }],
    userEditPrompt: "troque para tabela",
    userSelectedExtraResourceTypes: ["table"],
    selectedModel: "gemini-2.5-flash"
  });
  const plan = validateMicrosequenceEditPlan(
    {
      editScope: "selected_cards",
      affectedCards: ["c1"],
      operations: [{ operation: "replace_resource", cardKey: "c1", fromResourceType: "paragraph", toResourceType: "table", intent: "comparar" }],
      requiredResourceTypes: ["table"],
      requiresFullPreviousVersion: false,
      previousVersionIdsToLoad: [],
      reason: "pedido"
    },
    editPlanningContract
  );
  const resources = resolveResourcesForEditPlan({
    currentCards: [{ key: "c1", say: "Texto" }],
    validatedEditPlan: plan.plan,
    userSelectedExtraResourceTypes: ["table"]
  });
  const editContract = buildMicrosequenceEditContract({
    editPlanningContract,
    validatedEditPlan: plan,
    currentCards: [{ key: "c1", say: "Texto" }],
    selectedModel: "gemini-2.5-flash"
  });

  assert.equal(editPlanningContract.selectedLessonTopicRefs[0].label, "Git");
  assert.deepEqual(editPlanningContract.context.path.map((item) => item.level), ["course", "module", "lesson", "microsequence"]);
  assert.equal(editPlanningContract.context.sourceGuideLineage[2].sourceGuide, "Meta da lição: Escopo da lição.");
  assert.equal(editPlanningContract.context.lesson.microsequenceLine[0].title, "Micro");
  assert.equal(editPlanningContract.requestGovernance.lessonAnchors[0].field, "lessonGoal");
  assert.equal(editContract.selectedLessonTopicRefs[0].label, "Git");
  assert.equal(editPlanningContract.previousVersionsSummary[0].versionId, "v0");
  assert.equal(plan.ok, true);
  assert.ok(resources.allowedResourceTypes.includes("table"));
  assert.equal(editContract.currentVersion.cards.length, 1);
  assert.ok(editContract.resources.allowedResourceTypes.includes("table"));
  assert.equal(editContract.requestGovernance.lessonAnchors[0].field, "lessonGoal");
});

test("prompts de edição e reparo explicitam a divisão de papéis", () => {
  const editPlanningContract = buildMicrosequenceEditPlanningContract({
    selectedCourse: { key: "course", title: "Curso", sourceGuide: "Guia do curso", sourceGuideStructured: { globalScope: "Escopo do curso." } },
    selectedModule: { key: "module", title: "Módulo", sourceGuide: "Guia do módulo", sourceGuideStructured: { moduleScope: "Escopo do módulo." } },
    selectedLesson: {
      key: "lesson",
      title: "Lição",
      sourceGuide: "Guia da lição",
      sourceGuideStructured: { lessonGoal: "Escopo da lição." },
      ...makeBroadLessonGuidance(),
      lessonTopics: [{ refKey: "micro-git", label: "Git", source: "microsequence" }],
      microsequences: [{ key: "micro", title: "Micro", description: "Atual", tags: ["Git"], status: "ready" }]
    },
    selectedMicrosequence: { key: "micro", title: "Micro", description: "Atual", tags: ["Git"], status: "ready" },
    selectedMicrosequenceVersion: { id: "v1" },
    selectedLessonTopicRefs: [{ refKey: "micro-git", label: "Git", source: "microsequence" }],
    currentCards: [{ key: "c1", position: 1, resourceType: "paragraph", title: "Card 1", text: "Texto" }],
    previousVersions: [{ id: "v0", label: "Anterior", cards: [{ title: "Antigo", say: "Antes" }] }],
    userEditPrompt: "troque para tabela",
    userSelectedExtraResourceTypes: ["table"],
    selectedModel: "gemini-2.5-flash"
  });
  const editPlanValidation = validateMicrosequenceEditPlan(
    {
      editScope: "selected_cards",
      affectedCards: ["c1"],
      operations: [{ operation: "replace_resource", cardKey: "c1", fromResourceType: "paragraph", toResourceType: "table", intent: "comparar" }],
      requiredResourceTypes: ["table"],
      requiresFullPreviousVersion: false,
      previousVersionIdsToLoad: [],
      reason: "pedido"
    },
    editPlanningContract
  );
  const editContract = buildMicrosequenceEditContract({
    editPlanningContract,
    validatedEditPlan: editPlanValidation,
    currentCards: [{ key: "c1", position: 1, resourceType: "paragraph", title: "Card 1", text: "Texto" }],
    selectedModel: "gemini-2.5-flash"
  });
  const editPlanningPrompt = buildMicrosequenceEditPlanningPrompt(editPlanningContract, getModelCapabilities("gemini-2.5-flash"));
  const editPrompt = buildMicrosequenceEditPrompt(editContract, getModelCapabilities("gemini-2.5-flash"));
  const repairPrompt = buildGeneratedCardsRepairPrompt({
    invalidResponse: { cards: [{ position: 1, resourceType: "paragraph", title: "", text: "" }] },
    validationErrors: ["Card sem title."],
    generationContract: sampleGenerationContract(),
    modelCapabilities: getModelCapabilities("gemini-2.5-flash")
  });

  assert.match(editPlanningPrompt, /Papel do AraLearn nesta operação: fixar escopo de edição, cards atuais, recursos permitidos e validação/);
  assert.match(editPlanningPrompt, /Seu papel aqui é apenas propor editScope, affectedCards, operations, requiredResourceTypes/);
  assert.match(editPlanningPrompt, /Não reescreva os cards nem decida aplicação final no projeto/);
  assert.match(editPlanningPrompt, /requestGovernance\.precedence como ordem obrigatória de leitura do contrato/);
  assert.match(editPlanningPrompt, /Se request\.userEditPrompt conflitar com a meta, a notação, as confusões prováveis ou o critério final da lição/);
  assert.match(editPrompt, /Papel do AraLearn: fixar cards atuais, escopo de edição, recursos permitidos e validação final/);
  assert.match(editPrompt, /Seu papel aqui é apenas devolver os cards editados que respeitam esse escopo/);
  assert.match(editPrompt, /Não mude destino estrutural, status, tags persistentes nem decisão editorial final/);
  assert.match(editPrompt, /requestGovernance\.precedence como ordem obrigatória de leitura do contrato/);
  assert.match(editPrompt, /Se request\.userEditPrompt conflitar com a meta, a notação, as confusões prováveis ou o critério final da lição/);
  assert.match(repairPrompt, /Papel do AraLearn: manter plano, cardPlan, recursos permitidos, validação e adaptação final/);
  assert.match(repairPrompt, /Seu papel no reparo é apenas corrigir a estrutura do JSON existente dentro dessas restrições/);
  assert.match(repairPrompt, /Não decida destino estrutural, aplicação no projeto nem revisão editorial final/);
});

test("validação de edição preserva cards não afetados em edição localizada", () => {
  const editContract = {
    target: { microsequenceKey: "micro" },
    editPlan: { editScope: "selected_cards", affectedCards: ["c1"] },
    currentVersion: {
      cards: [
        { key: "c1", position: 1, resourceType: "paragraph", title: "Afetado", text: "Antes" },
        { key: "c2", position: 2, resourceType: "paragraph", title: "Estável", text: "Não mexer" }
      ]
    },
    resources: { allowedResourceTypes: ["paragraph"] }
  };

  assert.equal(
    validateEditedMicrosequence(
      {
        cards: [
          { key: "c1", position: 1, resourceType: "paragraph", title: "Afetado", text: "Depois" },
          { key: "c2", position: 2, resourceType: "paragraph", title: "Estável", text: "Não mexer" }
        ]
      },
      editContract
    ).ok,
    true
  );
  assert.equal(
    validateEditedMicrosequence(
      {
        cards: [
          { key: "c1", position: 1, resourceType: "paragraph", title: "Afetado", text: "Depois" },
          { key: "c2", position: 2, resourceType: "paragraph", title: "Estável", text: "Alterado" }
        ]
      },
      editContract
    ).ok,
    false
  );
});

test("block_gap_fill é alias interno para parágrafo público com lacunas por opções", () => {
  const publicCard = adaptResourceCardToPublicCard({
    position: 1,
    resourceType: "block_gap_fill",
    title: "Complete",
    prompt: "Complete a frase.",
    segments: [{ kind: "text", value: "Use" }, { kind: "blank", blankId: "b1", acceptedBlockIds: ["x"] }],
    blocks: [{ blockId: "x", label: "git add" }, { blockId: "y", label: "git push" }],
    feedbackAfter: "Preparou o arquivo."
  });
  const runtime = renderCardRuntimeBlocks(publicCard);

  assert.equal(publicCard.say.includes("[[git add::git add|git push]]"), true);
  assert.equal(publicCard.resourceType, undefined);
  assert.equal(publicCard.after, "Preparou o arquivo.");
  assert.doesNotMatch(publicCard.after, /\[\[/);
  assert.doesNotMatch(publicCard.after, /\|/);
  assert.match(runtime, /runtime-text-gap-choice-blank/);
  assert.match(runtime, /data-action="text-gap-open-choice"/);
  assert.doesNotMatch(runtime, /runtime-block-gap-fill/);
});

test("block_gap_fill mantém lacunas apenas em say e after como feedback textual", () => {
  const publicCard = adaptResourceCardToPublicCard({
    position: 1,
    resourceType: "block_gap_fill",
    title: "Complete",
    prompt: "Complete a frase.",
    segments: [{ kind: "text", value: "Use" }, { kind: "blank", blankId: "b1", acceptedBlockIds: ["x"] }],
    blocks: [{ blockId: "x", label: "git add" }, { blockId: "y", label: "git push" }],
    feedbackAfter: "O bloco correto é [[git add::git add|git push]]."
  });

  assert.match(publicCard.say, /\[\[git add::git add\|git push\]\]/);
  assert.equal(publicCard.after, "O bloco correto é git add.");
  assert.doesNotMatch(publicCard.after, /\[\[/);
  assert.doesNotMatch(publicCard.after, /\|/);
  assert.equal(publicCard.ask, undefined);
  assert.equal(publicCard.wrong, undefined);
});

test("block_gap_fill usa schema compatível com say e não exige feedbackPopup descartado", () => {
  const definition = listCardResourceDefinitions().find((item) => item.id === "block_gap_fill");

  assert.ok(definition.schema.required.includes("feedbackAfter"));
  assert.equal(definition.schema.required.includes("feedbackPopup"), false);
  assert.equal(definition.schema.properties.feedbackPopup, undefined);
});

test("adaptador converte tree interno para contrato público tree", () => {
  const publicCard = adaptResourceCardToPublicCard({
    position: 1,
    resourceType: "tree",
    title: "Estrutura",
    prompt: "Observe a estrutura.",
    base: "/",
    current: "/home/aluno",
    nodes: [
      { id: "home", label: "home", type: "folder" },
      { id: "aluno", label: "aluno", parentId: "home", type: "folder" },
      { id: "readme", label: "README.md", parentId: "aluno", type: "file" }
    ]
  });

  assert.equal(publicCard.tree.items.home.aluno["README.md"], null);
  assert.equal(publicCard.say, "Observe a estrutura.");
  assert.equal(publicCard.resourceType, undefined);
});

test("adaptador tree resolve rootLabel sem duplicar raiz pública", () => {
  const sameRoot = adaptResourceCardToPublicCard({
    resourceType: "tree",
    title: "Estrutura",
    rootLabel: "meu-projeto",
    nodes: [
      { id: "root", label: "meu-projeto", type: "folder", parentId: null },
      { id: "git", label: ".git", type: "folder", parentId: "root" }
    ]
  });
  const wrappedRoot = adaptResourceCardToPublicCard({
    resourceType: "tree",
    title: "Estrutura",
    rootLabel: "meu-projeto",
    nodes: [{ id: "git", label: ".git", type: "folder" }]
  });
  const multipleRoots = adaptResourceCardToPublicCard({
    resourceType: "tree",
    title: "Estrutura",
    rootLabel: "repo",
    nodes: [
      { id: "src", label: "src", type: "folder" },
      { id: "readme", label: "README.md", type: "file" }
    ]
  });

  assert.deepEqual(sameRoot.tree.items, { "meu-projeto": { ".git": {} } });
  assert.deepEqual(wrappedRoot.tree.items, { "meu-projeto": { ".git": {} } });
  assert.deepEqual(multipleRoots.tree.items, { repo: { src: {}, "README.md": null } });
});

test("adaptador tree omite closed vazio antes do contrato público", () => {
  const publicCard = adaptResourceCardToPublicCard({
    resourceType: "tree",
    title: "Estrutura",
    closed: [],
    nodes: [{ id: "src", label: "src", type: "folder" }]
  });

  assert.equal(publicCard.tree.closed, undefined);
  assert.deepEqual(publicCard.tree.items, { src: {} });
});

test("tree selecionado na UI mapeia para recurso interno tree", () => {
  assert.equal(mapPreferredContainerToResource("tree"), "tree");
  assert.equal(mapPreferredContainerToResource("plane"), "plane");
  assert.equal(mapPreferredContainerToResource("matrix"), "matrix");
});

test("adaptador converte plane e matrix internos para contrato público", () => {
  const planeCard = adaptResourceCardToPublicCard({
    resourceType: "plane",
    title: "Soma visual",
    prompt: "Observe a soma.",
    sum: [[1, 2], [3, 1]],
    result: ["[[4::4|3|5]]", 3]
  });
  const matrixCard = adaptResourceCardToPublicCard({
    resourceType: "matrix",
    title: "Soma por entrada",
    prompt: "Some posição por posição.",
    sequence: [
      { name: "A", values: [[1, 2], [3, 4]] },
      { connector: "+", name: "B", values: [[5, 6], [7, 8]] },
      { connector: "=", name: "A+B", values: [["1 + 5", "2 + 6"], ["[[10::10|9|11]]", 12]], highlight: "cell:2,1" }
    ]
  });

  assert.deepEqual(planeCard.plane.sum, [[1, 2], [3, 1]]);
  assert.equal(planeCard.plane.result[0], "[[4::4|3|5]]");
  assert.deepEqual(matrixCard.matrix.sequence[2].values[0], ["1 + 5", "2 + 6"]);
  assert.equal(matrixCard.matrix.sequence[2].highlight, "cell:2,1");
});

test("selectedLessonTopicRefs usa somente assuntos da lição atual", () => {
  const current = { key: "micro-atual", title: "Atual", tags: ["Atual"] };
  const lesson = {
    microsequences: [
      { key: "micro-git", title: "Git", tags: ["commit"] },
      current,
      { key: "micro-branch", title: "Branches", tags: ["commit"] }
    ]
  };
  const refs = collectLessonTopicRefs(lesson, current);
  const selectedKeys = new Set(["micro-git", "commit", "tag-global"]);
  const selected = refs.filter((item) => selectedKeys.has(item.refKey) || selectedKeys.has(item.label));

  assert.deepEqual(selected, [
    { refKey: "micro-git", label: "Git", source: "microsequence" },
    { refKey: "micro-git", label: "commit", source: "microsequence" },
    { refKey: "micro-branch", label: "commit", source: "microsequence" }
  ]);
  assert.equal(selected.some((item) => item.label === "tag-global"), false);
  assert.equal(selected.some((item) => item.refKey === "micro-atual"), false);
});

test("selectedLessonTopicRefs documenta refs compostos por microssequência e label", () => {
  const current = { key: "micro-atual", title: "Atual" };
  const refs = collectLessonTopicRefs({
    microsequences: [
      { key: "micro-git", title: "Git", tags: ["commit"] },
      current
    ]
  }, current);

  assert.deepEqual(refs, [
    { refKey: "micro-git", label: "Git", source: "microsequence" },
    { refKey: "micro-git", label: "commit", source: "microsequence" }
  ]);
});

test("geração adaptada com tree e block_gap_fill salva e recarrega sem perda estrutural", () => {
  const storage = createProjectStorage(createKeyValueMemoryStore());
  const document = {
    contract: "aralearn.contract",
    version: 1,
    kind: "project",
    courses: [
      {
        key: "course",
        title: "Curso",
        modules: [
          {
            key: "module",
            title: "Módulo",
            lessons: [
              {
                key: "lesson",
                title: "Lição",
                microsequences: [
                  {
                    key: "micro",
                    title: "Micro",
                    status: "draft",
                    included: false,
                    tags: ["tag-existente"],
                    cards: []
                  }
                ]
              }
            ]
          }
        ]
      }
    ]
  };
  const adapted = adaptResourceCardsToPublicCards([
    {
      position: 1,
      resourceType: "tree",
      title: "Estrutura",
      nodes: [
        { id: "src", label: "src", type: "folder" },
        { id: "app", label: "app.js", parentId: "src", type: "file" }
      ]
    },
    {
      position: 2,
      resourceType: "block_gap_fill",
      title: "Complete",
      prompt: "Complete.",
      segments: [{ kind: "text", value: "Abra" }, { kind: "blank", blankId: "b1", acceptedBlockIds: ["x"] }],
      blocks: [{ blockId: "x", label: "src" }, { blockId: "y", label: "dist" }],
      feedbackAfter: "src contém o código."
    }
  ]);
  const nextDocument = replaceMicrosequenceCards(document, {
    courseKey: "course",
    moduleKey: "module",
    lessonKey: "lesson",
    microsequenceKey: "micro",
    title: "Micro",
    tags: ["tag-existente"],
    cards: adapted.cards
  });

  storage.saveProject(nextDocument);
  const loaded = storage.loadProject();
  const microsequence = loaded.courses[0].modules[0].lessons[0].microsequences[0];

  assert.deepEqual(microsequence.tags, ["tag-existente"]);
  assert.equal(microsequence.cards[0].tree.items.src["app.js"], null);
  assert.match(microsequence.cards[1].say, /\[\[src::src\|dist\]\]/);
  assert.equal(microsequence.cards[1].after, "src contém o código.");
});

test("adaptador rejeita saída interna sem recurso público compatível", () => {
  const result = adaptResourceCardsToPublicCards([{ resourceType: "image", title: "Imagem" }]);

  assert.equal(result.ok, false);
  assert.match(result.errors.join(" "), /sem adaptador público/);
});
