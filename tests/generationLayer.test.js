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
import { createProjectStorage } from "../src/storage/createProjectStorage.js";
import { createKeyValueMemoryStore } from "../src/storage/createKeyValueMemoryStore.js";
import { replaceMicrosequenceCards } from "../src/editor/contractEditor.js";
import { mapPreferredContainerToResource } from "../src/assist/geminiAssist.js";
import { collectLessonTopicRefs } from "../src/ui/lessonEditorPaths.js";

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

  assert.ok(["paragraph", "multiple_choice", "code_editor", "table", "flowchart", "block_gap_fill", "tree"].every((id) => ids.includes(id)));
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
  assert.equal(generationContract.selectedLessonTopicRefs[0].label, "Git");
  assert.equal(generationContract.request.sizeId, "short");
  assert.equal(generationContract.request.cardCount, 3);
  assert.deepEqual(Object.keys(generationContract.resources.resourceSchemas).sort(), ["block_gap_fill", "multiple_choice", "paragraph", "table"].sort());
  assert.match(prompt, /block_gap_fill/);
  assert.match(prompt, /"kind":"blank"/);
  assert.match(prompt, /não use content, segments\[\]\.text nem blocks\[\]\.text/);
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
});

test("tree entra no catálogo, no planejamento, em allowedResourceTypes e na validação", () => {
  const planningContract = samplePlanningContract({ userSelectedExtraResourceTypes: ["tree"] });
  const plan = validPlan({
    selectedExtraResourceTypes: ["tree"],
    cardPlan: [
      { position: 1, role: "situar", resourceType: "paragraph", sourceRefs: [] },
      { position: 2, role: "mostrar estrutura", resourceType: "tree", sourceRefs: [] },
      { position: 3, role: "consolidar", resourceType: "multiple_choice", sourceRefs: [] }
    ]
  });
  const validatedPlan = validateMicrosequencePlan(plan, planningContract);
  const generationContract = buildMicrosequenceGenerationContract({ planningContract, validatedPlan, selectedModel: "gemini-2.5-flash" });
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
    feedbackAfter: "Preparou o arquivo."
  });
  const runtime = renderCardRuntimeBlocks(publicCard);

  assert.equal(publicCard.say.includes("[[git add::git add|git push]]"), true);
  assert.equal(publicCard.resourceType, undefined);
  assert.equal(publicCard.after, "Preparou o arquivo.");
  assert.match(runtime, /runtime-text-gap-choice-blank/);
  assert.match(runtime, /data-action="text-gap-open-choice"/);
  assert.doesNotMatch(runtime, /runtime-block-gap-fill/);
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

test("tree selecionado na UI mapeia para recurso interno tree", () => {
  assert.equal(mapPreferredContainerToResource("tree"), "tree");
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
