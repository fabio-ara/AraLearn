import assert from "node:assert/strict";
import test from "node:test";

import {
  getTransportAuthoringResourceContract
} from "../../supabase/functions/_shared/aralearn/runtime/core/authoringResourceContract.js";
import {
  createWorkspaceStructure,
  saveWorkspaceMicrosequenceCards
} from "../../supabase/functions/_shared/aralearn-authoring/workspaceIncremental.js";
import {
  mapAuthoringMcpToolCall
} from "../../supabase/functions/_shared/aralearn-authoring/workspaceMcpTools.js";
import {
  createEmptyAuthoringWorkspace,
  readWorkspaceEntity,
  validateAuthoringWorkspace
} from "../../supabase/functions/_shared/aralearn-authoring/workspaceModel.js";

const WORKSPACE_ID = "11111111-1111-4111-8111-111111111111";
const COURSE_PATH = ["course-logic"];
const MODULE_PATH = [...COURSE_PATH, "module-logic"];
const LESSON_PATH = [...MODULE_PATH, "lesson-conjunction"];
const MICROSEQUENCE_PATH = [...LESSON_PATH, "micro-conjunction"];

function plannedWorkspace() {
  return createWorkspaceStructure(createEmptyAuthoringWorkspace(), {
    parts: [
      {
        entityType: "course",
        id: COURSE_PATH[0],
        title: "Lógica",
        goal: "Compreender operações proposicionais."
      },
      {
        entityType: "module",
        parentPath: COURSE_PATH,
        id: MODULE_PATH[1],
        title: "Conectivos",
        goal: "Distinguir os conectivos lógicos."
      },
      {
        entityType: "lesson",
        parentPath: MODULE_PATH,
        id: LESSON_PATH[2],
        title: "Conjunção",
        goal: "Reconhecer quando uma conjunção é verdadeira."
      },
      {
        entityType: "microsequence",
        parentPath: LESSON_PATH,
        id: MICROSEQUENCE_PATH[3],
        title: "Condição de verdade",
        goal: "Completar a condição de verdade da conjunção.",
        role: "practice",
        covers: ["conjunção"],
        checks: ["identifica a condição de verdade"],
        errors: ["confundir conjunção com disjunção"]
      }
    ]
  });
}

test("paragraph+gap compacto atravessa contrato, chamada MCP, gravação e releitura", () => {
  const contract = getTransportAuthoringResourceContract("paragraph");
  assert.equal(contract.contractDetail, "compact");
  assert.equal(contract.example.resource, "paragraph");
  assert.equal(contract.example.exercise, "gap");
  assert.equal(contract.example.text.includes("{gap:condition}"), true);
  assert.equal(contract.authoringSchema.properties.gaps.type, "array");

  const contractCall = mapAuthoringMcpToolCall("consultarRecursosDeCard", {
    resource: "paragraph"
  });
  assert.equal(contractCall.method, "GET");
  assert.equal(contractCall.path, "/v1/contracts/resources/paragraph");

  const authoringCard = structuredClone(contract.example);
  const saveCall = mapAuthoringMcpToolCall("salvarCardsNaMicrossequencia", {
    requestId: "paragraph-gap-save-0001",
    workspaceId: WORKSPACE_ID,
    expectedRevision: 1,
    microsequencePath: MICROSEQUENCE_PATH,
    mode: "replace",
    cardsJson: JSON.stringify([authoringCard])
  });
  assert.equal(saveCall.method, "POST");
  assert.equal(saveCall.body.operation, "save_microsequence_cards");
  assert.equal(saveCall.body.arguments.status, "ready");

  const materialized = saveWorkspaceMicrosequenceCards(
    plannedWorkspace(),
    saveCall.body.arguments
  );
  const persisted = readWorkspaceEntity(
    materialized,
    "card",
    [...MICROSEQUENCE_PATH, authoringCard.id]
  );

  assert.equal(Object.hasOwn(persisted, "gaps"), false);
  assert.match(
    persisted.text,
    /\[\[P e Q são verdadeiras::P e Q são verdadeiras\|apenas P é verdadeira\|ao menos uma é verdadeira\]\]/u
  );
  assert.equal(validateAuthoringWorkspace(materialized).contract, "aralearn.contract");
  assert.equal(authoringCard.text.includes("{gap:condition}"), true);
  assert.equal(authoringCard.gaps[0].answer, "P e Q são verdadeiras");
});
