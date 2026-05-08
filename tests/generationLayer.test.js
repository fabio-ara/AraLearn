import test from "node:test";
import assert from "node:assert/strict";

import { buildMicrosequenceGenerationContract } from "../src/generation/contracts/buildMicrosequenceGenerationContract.js";
import { buildMicrosequenceEditContract } from "../src/generation/contracts/buildMicrosequenceEditContract.js";
import { buildMicrosequencePlanningContract } from "../src/generation/planning/buildMicrosequencePlanningContract.js";
import { buildMicrosequencePlanningPrompt } from "../src/generation/planning/buildMicrosequencePlanningPrompt.js";
import { validateMicrosequencePlan } from "../src/generation/planning/validateMicrosequencePlan.js";
import { buildMicrosequenceEditPlanningContract } from "../src/generation/planning/buildMicrosequenceEditPlanningContract.js";
import { validateMicrosequenceEditPlan } from "../src/generation/planning/validateMicrosequenceEditPlan.js";
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
import { validateEditedMicrosequence } from "../src/generation/validation/validateEditedMicrosequence.js";
import { renderCardRuntimeBlocks } from "../src/render/renderCardRuntime.js";

function samplePlanningContract(extra = {}) {
  return buildMicrosequencePlanningContract({
    selectedCourse: { key: "course", title: "Curso", description: "Objetivo do curso" },
    selectedModule: { key: "module", title: "Módulo", description: "Objetivo do módulo" },
    selectedLesson: { key: "lesson", title: "Lição", description: "Objetivo da lição", lessonTopics: [{ refKey: "micro-git", label: "Git", source: "microsequence" }] },
    targetMicrosequence: { key: "micro", title: "Microssequência" },
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

test("lista tipos didáticos e tamanhos internos", () => {
  const types = listMicrosequenceTypes();

  assert.ok(types.some((item) => item.id === "assisted"));
  assert.ok(types.some((item) => item.id === "simple"));
  assert.ok(types.every((item) => item.id && item.label && item.shortDescription && item.availableSizes.length));
  assert.ok(types.every((item) => item.cardRolesBySize.short && item.cardRolesBySize.medium && item.cardRolesBySize.long));
  assert.ok(types.find((item) => item.id === "guided_practice").baseResourceTypes.includes("block_gap_fill"));
  assert.equal(getMicrosequenceCardCount("short"), 3);
  assert.equal(getMicrosequenceCardCount("medium"), 5);
  assert.equal(getMicrosequenceCardCount("long"), 7);
  assert.deepEqual(listMicrosequenceSizes().map((item) => item.id), ["short", "medium", "long"]);
});

test("catálogo contém recursos e schemas esperados", () => {
  const resources = listCardResourceDefinitions();
  const ids = resources.map((item) => item.id);

  assert.ok(["paragraph", "multiple_choice", "code_editor", "table", "flowchart", "block_gap_fill"].every((id) => ids.includes(id)));
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
  assert.ok(contract.availableResources.some((item) => item.id === "paragraph" && !item.schema));
  assert.match(prompt, /selectedLessonTopicRefs são assuntos selecionados no escopo da lição/);
  assert.equal(validation.ok, true);
  assert.equal(validation.plan.sizeId, "short");
  assert.equal(validation.plan.cardPlan.length, 3);
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

test("planejamento rejeita tipo, tamanho, quantidade e preservação inválidos", () => {
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
  assert.match(validation.errors.join(" "), /quantidade esperada/);
  assert.match(validation.errors.join(" "), /flowchart/);
});

test("resolve recursos de geração com base, extras e deduplicação", () => {
  const result = resolveResourcesForGenerationPlan({
    resolvedMicrosequenceTypeId: "guided_practice",
    userSelectedExtraResourceTypes: ["table", "paragraph"],
    planSelectedExtraResourceTypes: ["table", "flowchart"]
  });
  const selector = buildResourceSelectorState({
    resolvedMicrosequenceTypeId: "guided_practice",
    userSelectedExtraResourceTypes: ["table"]
  });

  assert.deepEqual(result.baseResourceTypes, ["paragraph", "block_gap_fill"]);
  assert.deepEqual(result.userExtraResourceTypes, ["table"]);
  assert.deepEqual(result.planExtraResourceTypes, ["flowchart"]);
  assert.ok(result.allowedResourceTypes.includes("flowchart"));
  assert.ok(selector.find((item) => item.id === "paragraph").disabled);
  assert.ok(selector.find((item) => item.id === "table").selected);
});

test("contrato e prompt de geração usam contexto, tags, tamanho e schemas efetivos", () => {
  const planningContract = samplePlanningContract({ userSelectedExtraResourceTypes: ["table"] });
  const validatedPlan = validateMicrosequencePlan(validPlan(), planningContract);
  const generationContract = buildMicrosequenceGenerationContract({ planningContract, validatedPlan, selectedModel: "gemini-2.5-flash" });
  const prompt = buildMicrosequenceGenerationPrompt(generationContract, getModelCapabilities("gemini-2.5-flash"));

  assert.equal(generationContract.context.course.title, "Curso");
  assert.equal(generationContract.selectedLessonTopicRefs[0].label, "Git");
  assert.equal(generationContract.request.sizeId, "short");
  assert.equal(generationContract.request.cardCount, 3);
  assert.deepEqual(Object.keys(generationContract.resources.resourceSchemas).sort(), ["block_gap_fill", "multiple_choice", "paragraph", "table"].sort());
  assert.match(prompt, /block_gap_fill/);
  assert.match(prompt, /selectedLessonTopicRefs como assuntos selecionados no escopo da lição/);
  assert.doesNotMatch(prompt, /code_editor/);
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
        feedbackPopup: {
          correctTitle: "Correto",
          correctMessage: "Isso prepara arquivos.",
          incorrectTitle: "Revise",
          incorrectMessage: "Observe o comando de preparação."
        }
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
    selectedCourse: { key: "course", title: "Curso" },
    selectedModule: { key: "module", title: "Módulo" },
    selectedLesson: { key: "lesson", title: "Lição", lessonTopics: [{ refKey: "micro-git", label: "Git", source: "microsequence" }] },
    selectedMicrosequence: { key: "micro", title: "Micro" },
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
  assert.equal(editContract.selectedLessonTopicRefs[0].label, "Git");
  assert.equal(editPlanningContract.previousVersionsSummary[0].versionId, "v0");
  assert.equal(plan.ok, true);
  assert.ok(resources.allowedResourceTypes.includes("table"));
  assert.equal(editContract.currentVersion.cards.length, 1);
  assert.ok(editContract.resources.allowedResourceTypes.includes("table"));
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
    feedbackPopup: {
      correctTitle: "Correto",
      correctMessage: "Preparou o arquivo.",
      incorrectTitle: "Revise",
      incorrectMessage: "Escolha o comando de preparação."
    }
  });
  const runtime = renderCardRuntimeBlocks(publicCard);

  assert.equal(publicCard.say.includes("[[git add::git add|git push]]"), true);
  assert.equal(publicCard.resourceType, undefined);
  assert.equal(publicCard.after, "Preparou o arquivo.");
  assert.match(runtime, /runtime-text-gap-choice-blank/);
  assert.match(runtime, /data-action="text-gap-open-choice"/);
  assert.doesNotMatch(runtime, /runtime-block-gap-fill/);
});

test("adaptador rejeita saída interna sem recurso público compatível", () => {
  const result = adaptResourceCardsToPublicCards([{ resourceType: "image", title: "Imagem" }]);

  assert.equal(result.ok, false);
  assert.match(result.errors.join(" "), /sem adaptador público/);
});
