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
  const cases = [
    ["inserirEntidadeNoWorkspace", {
      ...base("parity-insert-0001"),
      entityType: "course",
      parentPath: null,
      entity: { id: "course-a" }
    }],
    ["substituirEntidadeNoWorkspace", {
      ...base("parity-replace-0001"),
      entityType: "card",
      entityPath: ["course-a", "module-a", "lesson-a", "micro-a", "card-a"],
      entity: { id: "card-a" }
    }],
    ["renomearEntidadeNoWorkspace", {
      ...base("parity-rename-0001"),
      entityType: "lesson",
      entityPath: ["course-a", "module-a", "lesson-a"],
      title: "Lição revista"
    }],
    ["moverEntidadeNoWorkspace", {
      ...base("parity-move-0001"),
      entityType: "module",
      entityPath: ["course-a", "module-a"],
      targetParentPath: ["course-b"]
    }],
    ["excluirEntidadeDoWorkspace", {
      ...base("parity-delete-0001"),
      entityType: "microsequence",
      entityPath: ["course-a", "module-a", "lesson-a", "micro-a"]
    }],
    ["juntarMicrossequencias", {
      ...base("parity-merge-0001"),
      targetPath: ["course-a", "module-a", "lesson-a", "micro-a"],
      sourcePaths: [["course-a", "module-a", "lesson-a", "micro-b"]]
    }],
    ["separarMicrossequencia", {
      ...base("parity-split-0001"),
      sourcePath: ["course-a", "module-a", "lesson-a", "micro-a"],
      newMicrosequence: { id: "micro-b", cards: [] },
      cardIds: ["card-a"]
    }],
    ["promoverModuloACurso", {
      ...base("parity-promote-0001"),
      modulePath: ["course-a", "module-a"],
      courseId: "course-b",
      goal: "Estudar separadamente."
    }],
    ["rebaixarCursoAModulo", {
      ...base("parity-demote-0001"),
      coursePath: ["course-a"],
      targetCoursePath: ["course-b"],
      moduleId: "module-b"
    }],
    ["restaurarRevisaoDoWorkspace", {
      ...base("parity-restore-0001"),
      revision: 2
    }]
  ];

  for (const [toolName, argumentsValue] of cases) {
    const operation = mapAuthoringMcpToolCall(toolName, argumentsValue);
    assert.equal(
      validateSchema(operation.body),
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
      target: "private",
      completion: "partial",
      publicationMode: "create"
    },
    {
      ...base("parity-publish-catalog-0001"),
      courseId: "course-a",
      target: "catalog",
      completion: "complete",
      publicationMode: "update",
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
