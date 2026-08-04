import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

import {
  mapAuthoringMcpToolCall
} from "../../supabase/functions/_shared/aralearn-authoring/workspaceMcpTools.js";
import {
  validateWorkspaceMutationPayload,
  validateWorkspacePublishPayload
} from "../../supabase/functions/_shared/aralearn-authoring/workspaceProtocol.js";

const WORKSPACE_ID = "11111111-1111-4111-8111-111111111111";
const COURSE_UUID = "22222222-2222-4222-8222-222222222222";

async function schema(name) {
  return JSON.parse(await readFile(
    new URL(`../../authoring/schemas/${name}`, import.meta.url),
    "utf8"
  ));
}

function base(requestId) {
  return {
    requestId,
    workspaceId: WORKSPACE_ID,
    expectedRevision: 4
  };
}

test("schemas distribuídos aceitam exatamente as mutações produzidas pelo MCP e pelo servidor", async () => {
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  addFormats(ajv);
  const validateSchema = ajv.compile(await schema("workspace-mutation.schema.json"));
  const card = {
    id: "card-a",
    resource: "paragraph",
    kind: "theory",
    exercise: "none",
    title: "Conceito",
    text: "Explicação conceitual.",
    after: "Síntese."
  };
  const cases = [
    ["criarEstruturaNoWorkspace", {
      ...base("parity-structure-0001"),
      parts: [
        {
          entityType: "course",
          id: "course-a",
          title: "Curso A",
          goal: "Aprender o tema."
        },
        {
          entityType: "lesson",
          parentPath: ["course-a", "module-a"],
          id: "lesson-a",
          title: "Lição A",
          goal: "Aprender o conceito.",
          topics: [{
            id: "topic-a",
            label: "Conceito A",
            kind: "concept"
          }]
        }
      ]
    }],
    ["salvarCardsNaMicrossequencia", {
      ...base("parity-cards-0001"),
      microsequencePath: ["course-a", "module-a", "lesson-a", "micro-a"],
      mode: "replace",
      cardsJson: JSON.stringify([card])
    }],
    ["atualizarMetadadosDaEntidade", {
      ...base("parity-metadata-0001"),
      entityType: "microsequence",
      entityPath: ["course-a", "module-a", "lesson-a", "micro-a"],
      goal: "Aplicar o conceito.",
      checks: ["resolve o caso"]
    }],
    ["atualizarMetadadosDaEntidade", {
      ...base("parity-lesson-topics-0001"),
      entityType: "lesson",
      entityPath: ["course-a", "module-a", "lesson-a"],
      topics: [{
        id: "topic-a",
        label: "Conceito A",
        kind: "concept",
        checks: ["reconhece o conceito"],
        errors: ["confunde com outro conceito"]
      }]
    }],
    ["salvarCardNoWorkspace", {
      ...base("parity-card-0001"),
      cardPath: ["course-a", "module-a", "lesson-a", "micro-a", "card-a"],
      cardJson: JSON.stringify(card)
    }],
    ["reorganizarWorkspace", {
      operation: "copy_entity",
      ...base("parity-copy-0001"),
      entityType: "lesson",
      entityPath: ["course-a", "module-a", "lesson-a"],
      targetParentPath: ["course-b", "module-b"],
      newRootId: "lesson-copy"
    }],
    ["reorganizarWorkspace", {
      operation: "rename_entity",
      ...base("parity-rename-0001"),
      entityType: "lesson",
      entityPath: ["course-a", "module-a", "lesson-a"],
      title: "Lição revista"
    }],
    ["reorganizarWorkspace", {
      operation: "move_entity",
      ...base("parity-move-0001"),
      entityType: "module",
      entityPath: ["course-a", "module-a"],
      targetParentPath: ["course-b"]
    }],
    ["excluirDoWorkspace", {
      operation: "delete_entity",
      ...base("parity-delete-0001"),
      entityType: "microsequence",
      entityPath: ["course-a", "module-a", "lesson-a", "micro-a"]
    }],
    ["reorganizarWorkspace", {
      operation: "merge_microsequences",
      ...base("parity-merge-0001"),
      targetPath: ["course-a", "module-a", "lesson-a", "micro-a"],
      sourcePaths: [["course-a", "module-a", "lesson-a", "micro-b"]]
    }],
    ["reorganizarWorkspace", {
      operation: "split_microsequence",
      ...base("parity-split-0001"),
      sourcePath: ["course-a", "module-a", "lesson-a", "micro-a"],
      newId: "micro-b",
      title: "Microssequência B",
      goal: "Separar a prática.",
      role: "practice",
      cardIds: ["card-a"]
    }],
    ["reorganizarWorkspace", {
      operation: "promote_module",
      ...base("parity-promote-0001"),
      modulePath: ["course-a", "module-a"],
      courseId: "course-b",
      goal: "Estudar separadamente."
    }],
    ["reorganizarWorkspace", {
      operation: "demote_course",
      ...base("parity-demote-0001"),
      coursePath: ["course-a"],
      targetCoursePath: ["course-b"],
      moduleId: "module-b"
    }]
  ];

  for (const [toolName, argumentsValue] of cases) {
    const operation = mapAuthoringMcpToolCall(toolName, argumentsValue);
    const distributedBody = structuredClone(operation.body);
    if (toolName === "salvarCardsNaMicrossequencia") {
      delete distributedBody.arguments.status;
    }
    if (distributedBody.arguments?.newMicrosequence) {
      delete distributedBody.arguments.newMicrosequence.status;
    }
    assert.equal(
      validateSchema(distributedBody),
      true,
      `${toolName}: ${ajv.errorsText(validateSchema.errors)}`
    );
    assert.doesNotThrow(() => validateWorkspaceMutationPayload(operation.body));
  }
});

test("schema distribuído e servidor concordam sobre publicação privada e catálogo", async () => {
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  addFormats(ajv);
  const validateSchema = ajv.compile(await schema("workspace-publication.schema.json"));
  const cases = [
    {
      ...base("parity-publish-private-0001"),
      courseId: "course-a",
      target: "private"
    },
    {
      ...base("parity-publish-catalog-0001"),
      courseId: "course-a",
      target: "catalog",
      existingCourseId: COURSE_UUID,
      expectedContentHash: "a".repeat(64),
      collectionId: COURSE_UUID
    }
  ];

  for (const argumentsValue of cases) {
    const operation = mapAuthoringMcpToolCall(
      "publicarCursoDoWorkspace",
      argumentsValue
    );
    assert.equal(
      validateSchema(operation.body),
      true,
      ajv.errorsText(validateSchema.errors)
    );
    assert.doesNotThrow(() => validateWorkspacePublishPayload(operation.body));
  }
  for (const partialBase of [
    { existingCourseId: COURSE_UUID },
    { expectedContentHash: "a".repeat(64) }
  ]) {
    const argumentsValue = {
      ...base("parity-publish-base-0001"),
      courseId: "course-a",
      target: "private",
      ...partialBase
    };
    const body = Object.fromEntries(
      Object.entries(argumentsValue).filter(([field]) => field !== "workspaceId")
    );
    assert.equal(validateSchema(body), false);
    assert.throws(
      () => validateWorkspacePublishPayload(body),
      (error) => error?.code === "invalid_publication_base"
    );
  }
});

test("caminho estrutural incorreto é recusado antes de abrir uma mutação", async () => {
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  const validateSchema = ajv.compile(await schema("workspace-mutation.schema.json"));
  const invalidPayload = {
    requestId: "parity-invalid-0001",
    expectedRevision: 1,
    operation: "promote_module",
    arguments: {
      modulePath: ["course-a", "module-a", "extra"],
      courseId: "course-b",
      goal: "Curso"
    }
  };
  assert.equal(validateSchema(invalidPayload), false);
  assert.throws(
    () => validateWorkspaceMutationPayload(invalidPayload),
    (error) => error?.code === "invalid_workspace_entity_path"
  );
});
