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

test("criação de estrutura e movimento exigem o pai exato do tipo", () => {
  rejects("invalid_workspace_parent", () => validate("create_structure", {
    parts: [{
      entityType: "module",
      parentPath: null,
      id: "module-a",
      title: "Módulo A",
      goal: "Delimitar o módulo."
    }]
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

test("lições preservam tópicos estritos na criação estrutural", () => {
  const created = validate("create_structure", {
    parts: [{
      entityType: "lesson",
      parentPath: ["course-a", "module-a"],
      id: "lesson-a",
      title: "Lição A",
      goal: "Ensinar o conceito.",
      topics: [{
        id: "topic-a",
        label: "Conceito A",
        kind: "concept",
        checks: ["reconhece o conceito"],
        errors: ["confunde com outro conceito"]
      }]
    }]
  });
  assert.deepEqual(created.arguments.parts[0].topics, [{
    id: "topic-a",
    label: "Conceito A",
    kind: "concept",
    checks: ["reconhece o conceito"],
    errors: ["confunde com outro conceito"]
  }]);

  const defaults = validate("create_structure", {
    parts: [
      {
        entityType: "course",
        id: "course-b",
        title: "Curso B",
        goal: "Criar a raiz sem parentPath redundante."
      },
      {
        entityType: "lesson",
        parentPath: ["course-b", "module-b"],
        id: "lesson-b",
        title: "Lição B",
        goal: "Ensinar outro conceito.",
        topics: [{
          id: "topic-b",
          label: "Conceito B",
          kind: "concept"
        }]
      }
    ]
  });
  assert.equal(defaults.arguments.parts[0].parentPath, null);
  assert.deepEqual(defaults.arguments.parts[1].topics[0].checks, []);
  assert.deepEqual(defaults.arguments.parts[1].topics[0].errors, []);

  rejects("unknown_workspace_field", () => validate("create_structure", {
    parts: [{
      entityType: "module",
      parentPath: ["course-a"],
      id: "module-a",
      title: "Módulo A",
      goal: "Delimitar o módulo.",
      topics: []
    }]
  }));
  rejects("invalid_workspace_field", () => validate("create_structure", {
    parts: [{
      entityType: "lesson",
      parentPath: ["course-a", "module-a"],
      id: "lesson-a",
      title: "Lição A",
      goal: "Ensinar o conceito.",
      topics: [{
        id: "topic-a",
        label: "Conceito A",
        kind: "legado",
        checks: [],
        errors: []
      }]
    }]
  }));
});

test("criação estrutural limita cada lote a 40 partes", () => {
  rejects("invalid_workspace_structure", () => validate("create_structure", {
    parts: Array.from({ length: 41 }, (_, index) => ({
      entityType: "course",
      id: `course-${index}`,
      title: `Curso ${index}`,
      goal: "Exceder o limite do lote."
    }))
  }));
});

test("replace aceita lista vazia somente como planned e append continua não vazio", () => {
  const emptyReplace = validate("save_microsequence_cards", {
    microsequencePath: ["course-a", "module-a", "lesson-a", "micro-a"],
    mode: "replace",
    cards: [],
    status: "planned"
  });
  assert.deepEqual(emptyReplace.arguments.cards, []);
  assert.equal(emptyReplace.arguments.status, "planned");

  rejects("invalid_workspace_status", () => validate("save_microsequence_cards", {
    microsequencePath: ["course-a", "module-a", "lesson-a", "micro-a"],
    mode: "replace",
    cards: [],
    status: "ready"
  }));
  rejects("invalid_workspace_cards", () => validate("save_microsequence_cards", {
    microsequencePath: ["course-a", "module-a", "lesson-a", "micro-a"],
    mode: "append",
    cards: [],
    status: "planned"
  }));
});

test("divisão recusa cards implícitos e normaliza a lista explícita", () => {
  rejects("invalid_workspace_split", () => validate("split_microsequence", {
    sourcePath: ["course-a", "module-a", "lesson-a", "micro-a"],
    newMicrosequence: {
      id: "micro-b",
      title: "Microssequência B",
      goal: "Separar os cards selecionados.",
      role: "practice",
      status: "needs_review",
      branchOf: null,
      dependsOn: [],
      covers: [],
      checks: [],
      errors: [],
      cards: [{ id: "card-a" }]
    },
    cardIds: ["card-a"]
  }));
  rejects("invalid_workspace_field", () => validate("split_microsequence", {
    sourcePath: ["course-a", "module-a", "lesson-a", "micro-a"],
    newMicrosequence: {
      id: "micro-b",
      title: "Microssequência B",
      goal: "Separar os cards selecionados.",
      role: "practice",
      status: "needs_review",
      branchOf: null,
      dependsOn: [],
      covers: [],
      checks: [],
      errors: [],
      cards: []
    },
    cardIds: ["card-a", "card-a"]
  }));
});

test("conversões e metadados preservam somente campos aceitos", () => {
  const promoted = validate("promote_module", {
    modulePath: ["course-a", "module-a"],
    courseId: "course-b",
    goal: "Estudar o módulo de forma independente."
  });
  assert.equal(promoted.arguments.mode, "move");
  assert.equal(promoted.arguments.title, null);

  const metadata = validate("update_metadata", {
    entityType: "lesson",
    entityPath: ["course-a", "module-a", "lesson-a"],
    goal: "Objetivo revisto.",
    topics: [{
      id: "topic-a",
      label: "Conceito A",
      kind: "concept",
      checks: ["aplica o conceito"],
      errors: []
    }]
  });
  assert.deepEqual(metadata.arguments.topics, [{
    id: "topic-a",
    label: "Conceito A",
    kind: "concept",
    checks: ["aplica o conceito"],
    errors: []
  }]);
  rejects("invalid_workspace_metadata_field", () => validate("update_metadata", {
    entityType: "course",
    entityPath: ["course-a"],
    checks: ["campo incompatível"]
  }));
});
