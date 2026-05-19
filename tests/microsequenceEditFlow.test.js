import test from "node:test";
import assert from "node:assert/strict";

import { buildMicrosequenceEditPlanningContract } from "../src/generation/planning/buildMicrosequenceEditPlanningContract.js";
import { buildMicrosequenceEditPlanningPrompt } from "../src/generation/planning/buildMicrosequenceEditPlanningPrompt.js";
import { validateMicrosequenceEditPlan } from "../src/generation/planning/validateMicrosequenceEditPlan.js";
import { buildMicrosequenceEditContract } from "../src/generation/contracts/buildMicrosequenceEditContract.js";
import { buildMicrosequenceEditPrompt } from "../src/generation/prompts/buildMicrosequenceEditPrompt.js";

function buildEditPlanningContract() {
  return buildMicrosequenceEditPlanningContract({
    selectedCourse: { key: "course-git", title: "Git" },
    selectedModule: { key: "module-flow", title: "Fluxo local" },
    selectedLesson: {
      key: "lesson-commit",
      title: "Add e commit",
      description: "Distinguir preparação de registro.",
      sourceGuideStructured: {
        lessonGoal: "Distinguir `git add` de `git commit`.",
        notationRules: "Destacar comandos com acentos graves.",
        commonErrors: "Confundir preparação com registro."
      },
      resourceTags: ["paragraph", "multiple_choice", "code_editor", "tree"],
      contentTypeTags: ["procedure", "tool_use"],
      learningActionTags: ["practice", "use_tool"],
      supportLevel: "guided",
      microsequences: [
        {
          key: "micro-previa",
          title: "Fluxo geral",
          description: "Visão geral do Git.",
          status: "ready"
        }
      ]
    },
    selectedMicrosequence: {
      key: "micro-target",
      title: "Preparar e registrar",
      description: "Micro atual",
      status: "ready"
    },
    selectedMicrosequenceVersion: {
      id: "version-2"
    },
    currentCards: [
      { key: "card-1", title: "Contexto", say: "Primeiro você prepara, depois registra." },
      { key: "card-2", title: "Comando", code: "git add app.js", language: "bash" }
    ],
    previousVersions: [
      { id: "version-1", label: "Versão 1", description: "Rascunho antigo", cards: [{ title: "A" }] }
    ],
    userEditPrompt: "Melhore o card do comando e adicione uma checagem.",
    selectedCardKeys: ["card-2"],
    selectedResourceKeys: ["code_editor"],
    userSelectedExtraResourceTypes: ["multiple_choice"],
    selectedModel: "gemini-2.5-flash"
  });
}

test("contrato de planejamento de edição usa envelope didático próprio", () => {
  const contract = buildEditPlanningContract();

  assert.equal(contract.version, "aralearn.microsequence-edit-planning-contract.v2");
  assert.equal(contract.request.userPrompt, "Melhore o card do comando e adicione uma checagem.");
  assert.deepEqual(contract.representation.currentResourceTypes.sort(), ["code_editor", "paragraph"].sort());
  assert.equal(contract.representation.allowedResourceTypes.includes("multiple_choice"), true);
  assert.equal(contract.representation.availableResources.some((item) => item.id === "multiple_choice"), true);
  assert.equal("availableResources" in contract, false);
  assert.equal(contract.currentVersion.versionId, "version-2");
  assert.equal(contract.versionHistory[0].versionId, "version-1");
});

test("validação de edição exige preservar card selecionado e recursos extras do usuário", () => {
  const contract = buildEditPlanningContract();
  const invalid = validateMicrosequenceEditPlan(
    {
      editScope: "selected_cards",
      affectedCards: [],
      operations: [{ operation: "rewrite_text", cardKey: "card-2" }],
      requiredResourceTypes: [],
      requiresFullPreviousVersion: false,
      previousVersionIdsToLoad: [],
      reason: "Reescrever."
    },
    contract
  );
  const valid = validateMicrosequenceEditPlan(
    {
      editScope: "selected_cards",
      affectedCards: ["card-2"],
      operations: [{ operation: "rewrite_text", cardKey: "card-2" }],
      requiredResourceTypes: ["multiple_choice"],
      requiresFullPreviousVersion: false,
      previousVersionIdsToLoad: [],
      reason: "Reescrever e adicionar checagem."
    },
    contract
  );

  assert.equal(invalid.ok, false);
  assert.match(invalid.errors.join(" "), /Card selecionado pelo usuário não preservado/);
  assert.match(invalid.errors.join(" "), /Recurso extra do usuário não preservado/);
  assert.equal(valid.ok, true);
  assert.equal(valid.plan.editScope, "selected_cards");
});

test("prompts e contrato de edição usam request.userPrompt e resources do envelope novo", () => {
  const planningContract = buildEditPlanningContract();
  const planningPrompt = buildMicrosequenceEditPlanningPrompt(planningContract);
  const validatedEditPlan = validateMicrosequenceEditPlan(
    {
      editScope: "selected_cards",
      affectedCards: ["card-2"],
      operations: [{ operation: "replace_resource", cardKey: "card-2" }],
      requiredResourceTypes: ["multiple_choice"],
      requiresFullPreviousVersion: false,
      previousVersionIdsToLoad: [],
      reason: "Trocar recurso e adicionar checagem."
    },
    planningContract
  );
  assert.equal(validatedEditPlan.ok, true);

  const editContract = buildMicrosequenceEditContract({
    editPlanningContract: planningContract,
    validatedEditPlan,
    currentCards: [
      { key: "card-1", title: "Contexto", say: "Primeiro você prepara, depois registra." },
      { key: "card-2", title: "Comando", code: "git add app.js", language: "bash" }
    ],
    previousVersionsLoadedWhenRequired: [],
    selectedModel: "gemini-2.5-flash"
  });
  const editPrompt = buildMicrosequenceEditPrompt(editContract);

  assert.match(planningPrompt, /Use request.userPrompt apenas para especializar/);
  assert.match(planningPrompt, /representation.availableResources/);
  assert.equal(editContract.version, "aralearn.microsequence-edit-contract.v2");
  assert.equal(editContract.request.userPrompt, "Melhore o card do comando e adicione uma checagem.");
  assert.equal(editContract.resources.allowedResourceTypes.includes("multiple_choice"), true);
  assert.ok(editContract.resources.effectiveResourceSchemas.multiple_choice);
  assert.match(editPrompt, /Use request.userPrompt apenas para especializar/);
  assert.match(editPrompt, /Use apenas recursos permitidos em resources.allowedResourceTypes/);
});
