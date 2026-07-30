import assert from "node:assert/strict";
import test from "node:test";

import { AuthoringApiError } from "../../supabase/functions/_shared/aralearn-authoring/errors.js";
import {
  validateWorkspaceMutationPayload
} from "../../supabase/functions/_shared/aralearn-authoring/workspaceProtocol.js";

const BASE = Object.freeze({
  requestId: "workspace-command-0001",
  expectedRevision: 3
});

function validate(operation, argumentsValue) {
  return validateWorkspaceMutationPayload({
    ...BASE,
    operation,
    arguments: argumentsValue
  });
}

function rejects(code, callback) {
  assert.throws(
    callback,
    (error) => error instanceof AuthoringApiError && error.code === code
  );
}

test("REST valida argumentos de mutação com a mesma rigidez do MCP", () => {
  rejects("unknown_workspace_field", () => validate("rename_entity", {
    entityType: "course",
    entityPath: ["course-a"],
    title: "Curso",
    legacyRunId: "retirado"
  }));
  rejects("invalid_workspace_entity_path", () => validate("rename_entity", {
    entityType: "lesson",
    entityPath: ["course-a", "lesson-a"],
    title: "Lição"
  }));
});

test("inserção e movimento exigem o pai exato do tipo estrutural", () => {
  rejects("invalid_workspace_parent", () => validate("insert_entity", {
    entityType: "card",
    entity: { id: "card-a" }
  }));
  rejects("invalid_workspace_entity_path", () => validate("move_entity", {
    entityType: "module",
    entityPath: ["course-a", "module-a"],
    targetParentPath: ["course-b", "extra"]
  }));

  const moved = validate("move_entity", {
    entityType: "module",
    entityPath: ["course-a", "module-a"],
    targetParentPath: ["course-b"],
    position: 0
  });
  assert.deepEqual(moved.arguments.targetParentPath, ["course-b"]);
});

test("divisão recusa cards implícitos e normaliza a lista explícita", () => {
  rejects("invalid_workspace_split", () => validate("split_microsequence", {
    sourcePath: ["course-a", "module-a", "lesson-a", "micro-a"],
    newMicrosequence: {
      id: "micro-b",
      cards: [{ id: "card-a" }]
    },
    cardIds: ["card-a"]
  }));
  rejects("invalid_workspace_field", () => validate("split_microsequence", {
    sourcePath: ["course-a", "module-a", "lesson-a", "micro-a"],
    newMicrosequence: { id: "micro-b", cards: [] },
    cardIds: ["card-a", "card-a"]
  }));
});

test("conversões aplicam modo determinístico e preservam somente campos aceitos", () => {
  const promoted = validate("promote_module", {
    modulePath: ["course-a", "module-a"],
    courseId: "course-b",
    goal: "Estudar o módulo de forma independente."
  });
  assert.equal(promoted.arguments.mode, "move");
  assert.equal(promoted.arguments.title, null);

  const restored = validate("restore_revision", { revision: 2 });
  assert.deepEqual(restored.arguments, { revision: 2 });
});
