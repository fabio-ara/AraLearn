import assert from "node:assert/strict";
import test from "node:test";

import {
  AUTHORING_WORKSPACE_MCP_TOOLS,
  authoringMcpToolDefinition,
  authoringMcpToolIsAllowed,
  mapAuthoringMcpToolCall
} from "../../supabase/functions/_shared/aralearn-authoring/workspaceMcpTools.js";
import {
  routeRequest
} from "../../supabase/functions/_shared/aralearn-authoring/protocol.js";

const WORKSPACE_ID = "10000000-0000-4000-8000-000000000001";
const COLLECTION_ID = "20000000-0000-4000-8000-000000000001";
const TARGET_COLLECTION_ID = "20000000-0000-4000-8000-000000000002";
const COURSE_ID = "30000000-0000-4000-8000-000000000001";
const HASH = "a".repeat(64);
const WRITE = Object.freeze({
  requestId: "registry-v5-request",
  workspaceId: WORKSPACE_ID,
  expectedRevision: 3
});
const COURSE_PATH = Object.freeze(["course-a"]);
const MODULE_PATH = Object.freeze(["course-a", "module-a"]);
const MICROSEQUENCE_PATH = Object.freeze([
  "course-a",
  "module-a",
  "lesson-a",
  "micro-a"
]);
const LESSON_PATH = Object.freeze(MICROSEQUENCE_PATH.slice(0, 3));
const SUBMISSION_ID = "50000000-0000-4000-8000-000000000001";

const REMOVED_TOOL_NAMES = Object.freeze([
  "listarRecursosDeCard",
  "consultarRecursoDeCard",
  "listarColecoesDoCatalogo",
  "listarCursosDaColecao",
  "buscarCursosNoCatalogo",
  "criarColecaoNoCatalogo",
  "atualizarColecaoDoCatalogo",
  "retirarColecaoDoCatalogo",
  "moverCursoNoCatalogo",
  "retirarCursoDoCatalogo",
  "copiarEntidadeNoWorkspace",
  "renomearEntidadeNoWorkspace",
  "moverEntidadeNoWorkspace",
  "excluirEntidadeDoWorkspace",
  "juntarMicrossequencias",
  "separarMicrossequencia",
  "promoverModuloACurso",
  "rebaixarCursoAModulo",
  "excluirWorkspaceDeAutoria"
]);

test("registro externo fica abaixo do teto da Action e não conserva aliases antigos", () => {
  const names = AUTHORING_WORKSPACE_MCP_TOOLS.map(({ name }) => name);
  assert.equal(names.length, 30);
  assert.equal(new Set(names).size, names.length);
  assert.ok(names.length <= 30);
  for (const name of REMOVED_TOOL_NAMES) {
    assert.equal(names.includes(name), false, name);
    assert.equal(authoringMcpToolDefinition(name), null, name);
  }
  for (const name of [
    "consultarRecursosDeCard",
    "consultarCatalogo",
    "editarCatalogo",
    "retirarDoCatalogo",
    "reorganizarWorkspace",
    "excluirDoWorkspace",
    "criarEstruturaNoWorkspace",
    "salvarCardsNaMicrossequencia"
  ]) {
    assert.ok(authoringMcpToolDefinition(name), name);
  }
});

test("grupos mantêm leitura e consequência separadas", () => {
  const annotations = Object.fromEntries(
    AUTHORING_WORKSPACE_MCP_TOOLS.map(({ name, annotations: value }) => [
      name,
      value
    ])
  );
  assert.equal(annotations.consultarRecursosDeCard.readOnlyHint, true);
  assert.equal(annotations.consultarCatalogo.readOnlyHint, true);
  assert.equal(annotations.editarCatalogo.destructiveHint, true);
  assert.equal(annotations.retirarDoCatalogo.destructiveHint, true);
  assert.equal(annotations.reorganizarWorkspace.destructiveHint, true);
  assert.equal(annotations.excluirDoWorkspace.destructiveHint, true);
  assert.equal(annotations.criarWorkspaceDeAutoria.destructiveHint, false);
  assert.equal(annotations.importarCursoNoWorkspace.destructiveHint, false);
  assert.equal(annotations.criarEstruturaNoWorkspace.destructiveHint, false);
  assert.equal(annotations.salvarCardNoWorkspace.destructiveHint, true);

  const actionConsequential = (name) => authoringMcpToolDefinition(name)
    ._meta["aralearn/actionConsequentialHint"];
  assert.equal(actionConsequential("reorganizarWorkspace"), false);
  assert.equal(actionConsequential("salvarCardNoWorkspace"), false);
  assert.equal(actionConsequential("retirarDoCatalogo"), true);
  assert.equal(actionConsequential("excluirDoWorkspace"), true);

  const readSuccess = authoringMcpToolDefinition("consultarCatalogo")
    .outputSchema.oneOf[0];
  const writeSuccess = authoringMcpToolDefinition("reorganizarWorkspace")
    .outputSchema.oneOf[0];
  const branchedWriteSuccess = authoringMcpToolDefinition(
    "atualizarMetadadosDaEntidade"
  ).outputSchema.oneOf[0];
  assert.deepEqual(readSuccess.properties.requestId, { const: null });
  assert.equal(
    writeSuccess.properties.requestId.pattern,
    "^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$"
  );
  assert.equal(
    branchedWriteSuccess.properties.requestId.pattern,
    "^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$"
  );
});

test("consulta agrupada de resources e catálogo roteia somente leituras compactas", () => {
  assert.equal(
    mapAuthoringMcpToolCall("consultarRecursosDeCard", {}).path,
    "/v1/contracts/resources"
  );
  assert.equal(
    mapAuthoringMcpToolCall("consultarRecursosDeCard", {
      resource: "paragraph"
    }).path,
    "/v1/contracts/resources/paragraph"
  );
  assert.equal(
    mapAuthoringMcpToolCall("consultarCatalogo", {
      operation: "list_collections",
      limit: 10
    }).path,
    "/v1/catalog/collections?limit=10"
  );
  assert.equal(
    mapAuthoringMcpToolCall("consultarCatalogo", {
      operation: "list_collection_courses",
      collectionId: COLLECTION_ID
    }).path,
    `/v1/catalog/collections/${COLLECTION_ID}/courses`
  );
  assert.equal(
    mapAuthoringMcpToolCall("consultarCatalogo", {
      operation: "search_courses",
      query: "nuvem virtualização",
      limit: 20
    }).path,
    "/v1/catalog/courses/search?query=nuvem+virtualiza%C3%A7%C3%A3o&limit=20"
  );
});

test("edição e retirada agrupadas preservam CAS, hash e rotas administrativas", () => {
  const created = mapAuthoringMcpToolCall("editarCatalogo", {
    requestId: WRITE.requestId,
    operation: "create_collection",
    contractKey: "dataprev",
    title: "Dataprev"
  });
  assert.equal(created.path, "/v1/catalog/manage/collections");
  assert.equal(created.body.operation, undefined);

  const updated = mapAuthoringMcpToolCall("editarCatalogo", {
    requestId: WRITE.requestId,
    operation: "update_collection",
    collectionId: COLLECTION_ID,
    expectedRevision: 2,
    title: "Dataprev atualizada"
  });
  assert.equal(
    updated.path,
    `/v1/catalog/manage/collections/${COLLECTION_ID}/update`
  );
  assert.equal(updated.body.expectedRevision, 2);

  const moved = mapAuthoringMcpToolCall("editarCatalogo", {
    requestId: WRITE.requestId,
    operation: "move_course",
    courseId: COURSE_ID,
    expectedPlacementRevision: 4,
    targetCollectionId: TARGET_COLLECTION_ID,
    position: 1
  });
  assert.equal(moved.path, `/v1/catalog/manage/courses/${COURSE_ID}/move`);
  assert.equal(moved.body.expectedPlacementRevision, 4);

  const retired = mapAuthoringMcpToolCall("retirarDoCatalogo", {
    requestId: WRITE.requestId,
    operation: "retire_collection",
    collectionId: COLLECTION_ID,
    expectedRevision: 2,
    replacementCollectionId: TARGET_COLLECTION_ID
  });
  assert.equal(
    retired.path,
    `/v1/catalog/manage/collections/${COLLECTION_ID}/retire`
  );

  const removed = mapAuthoringMcpToolCall("retirarDoCatalogo", {
    requestId: WRITE.requestId,
    operation: "remove_course",
    courseId: COURSE_ID,
    expectedPlacementRevision: 4,
    expectedContentHash: HASH
  });
  assert.equal(
    removed.path,
    `/v1/catalog/manage/courses/${COURSE_ID}/remove`
  );
  assert.equal(removed.body.expectedContentHash, HASH);
});

test("reorganização agrupada traduz todas as operações estruturais atômicas", () => {
  const cases = [
    {
      operation: "copy_entity",
      arguments: {
        entityType: "course",
        entityPath: COURSE_PATH,
        newRootId: "course-copy"
      },
      internal: "copy_entity"
    },
    {
      operation: "rename_entity",
      arguments: {
        entityType: "course",
        entityPath: COURSE_PATH,
        title: "Curso renomeado"
      },
      internal: "rename_entity"
    },
    {
      operation: "move_entity",
      arguments: {
        entityType: "course",
        entityPath: COURSE_PATH,
        position: 1
      },
      internal: "move_entity"
    },
    {
      operation: "merge_microsequences",
      arguments: {
        targetPath: MICROSEQUENCE_PATH,
        sourcePaths: [[...MICROSEQUENCE_PATH.slice(0, 3), "micro-b"]]
      },
      internal: "merge_microsequences"
    },
    {
      operation: "split_microsequence",
      arguments: {
        sourcePath: MICROSEQUENCE_PATH,
        newId: "micro-b",
        title: "Nova microssequência",
        goal: "Consolidar a distinção.",
        role: "practice",
        cardIds: ["card-b"]
      },
      internal: "split_microsequence"
    },
    {
      operation: "promote_module",
      arguments: {
        modulePath: MODULE_PATH,
        courseId: "course-promoted",
        goal: "Transformar o módulo em curso autossuficiente."
      },
      internal: "promote_module"
    },
    {
      operation: "demote_course",
      arguments: {
        coursePath: COURSE_PATH,
        targetCoursePath: ["course-b"],
        moduleId: "module-demoted"
      },
      internal: "demote_course"
    }
  ];

  for (const item of cases) {
    const mapped = mapAuthoringMcpToolCall("reorganizarWorkspace", {
      ...WRITE,
      operation: item.operation,
      ...item.arguments
    });
    assert.equal(mapped.path, `/v1/workspaces/${WORKSPACE_ID}/mutations`);
    assert.equal(mapped.body.operation, item.internal);
    assert.equal(Object.hasOwn(mapped.body.arguments, "operation"), false);
  }
});

test("exclusão agrupada diferencia entidade e workspace", () => {
  const entity = mapAuthoringMcpToolCall("excluirDoWorkspace", {
    ...WRITE,
    operation: "delete_entity",
    entityType: "course",
    entityPath: COURSE_PATH
  });
  assert.equal(entity.method, "POST");
  assert.equal(entity.body.operation, "delete_entity");

  const workspace = mapAuthoringMcpToolCall("excluirDoWorkspace", {
    requestId: WRITE.requestId,
    operation: "delete_workspace",
    workspaceId: WORKSPACE_ID
  });
  assert.equal(workspace.method, "DELETE");
  assert.equal(workspace.path, `/v1/workspaces/${WORKSPACE_ID}`);
});

test("discriminadores são obrigatórios, fechados e autorizados por capacidade", () => {
  assert.throws(
    () => mapAuthoringMcpToolCall("consultarCatalogo", { query: "nuvem" }),
    ({ status, code }) => status === 422 && code === "invalid_tool_arguments"
  );
  assert.throws(
    () => mapAuthoringMcpToolCall("reorganizarWorkspace", {
      ...WRITE,
      operation: "rename_entity",
      entityType: "course",
      entityPath: COURSE_PATH,
      title: "Novo",
      entity: {}
    }),
    ({ status, code }) => status === 422 && code === "invalid_tool_arguments"
  );

  const principal = (scopes) => ({
    authenticationKind: "oauth",
    actorId: "40000000-0000-4000-8000-000000000001",
    scopes
  });
  assert.equal(
    authoringMcpToolIsAllowed("consultarCatalogo", principal(["catalog:read"])),
    true
  );
  assert.equal(
    authoringMcpToolIsAllowed("editarCatalogo", principal(["catalog:read"])),
    false
  );
  assert.equal(
    authoringMcpToolIsAllowed("editarCatalogo", principal(["catalog:manage"])),
    true
  );
  assert.equal(
    authoringMcpToolIsAllowed(
      "consultarCatalogo",
      principal(["authoring:private:read"])
    ),
    false
  );
});

test("as 30 assinaturas públicas validam, roteiam e recusam kwargs não anunciados", () => {
  const calls = new Map([
    ["prepararAutoriaAraLearn", { intent: "inspect" }],
    ["consultarRecursosDeCard", {}],
    ["listarCursosDaBibliotecaPessoal", {}],
    ["retirarCursoDasTrilhas", {
      requestId: WRITE.requestId,
      selectionId: SUBMISSION_ID,
      courseId: COURSE_ID,
      expectedContentHash: HASH
    }],
    ["consultarCatalogo", { operation: "list_collections" }],
    ["editarCatalogo", {
      requestId: WRITE.requestId,
      operation: "create_collection",
      contractKey: "dataprev",
      title: "Dataprev"
    }],
    ["retirarDoCatalogo", {
      requestId: WRITE.requestId,
      operation: "remove_course",
      courseId: COURSE_ID,
      expectedPlacementRevision: 1,
      expectedContentHash: HASH
    }],
    ["lerConteudoDoCurso", { courseId: COURSE_ID, view: "outline" }],
    ["listarWorkspacesDeAutoria", {}],
    ["gerirWorkspaceEducacional", {
      operation: "read",
      workspaceId: WORKSPACE_ID
    }],
    ["criarWorkspaceDeAutoria", {
      requestId: WRITE.requestId,
      title: "Workspace de teste"
    }],
    ["lerWorkspaceDeAutoria", { workspaceId: WORKSPACE_ID, view: "outline" }],
    ["revisarMicroteoriasDoWorkspace", {
      workspaceId: WORKSPACE_ID,
      entityPath: LESSON_PATH
    }],
    ["listarCardsDaMicrossequencia", {
      workspaceId: WORKSPACE_ID,
      microsequencePath: MICROSEQUENCE_PATH
    }],
    ["listarAlteracoesRecentesDoWorkspace", { workspaceId: WORKSPACE_ID }],
    ["importarCursoNoWorkspace", {
      ...WRITE,
      courseId: COURSE_ID,
      workspaceCourseId: "curso-importado"
    }],
    ["criarEstruturaNoWorkspace", {
      ...WRITE,
      parts: [{
        entityType: "course",
        id: "course-a",
        title: "Curso A",
        goal: "Ensinar o conteúdo A."
      }]
    }],
    ["salvarCardsNaMicrossequencia", {
      ...WRITE,
      microsequencePath: MICROSEQUENCE_PATH,
      mode: "replace",
      cardsJson: JSON.stringify([{
        id: "card-a",
        resource: "paragraph",
        kind: "theory",
        exercise: "none",
        title: "Conceito A",
        text: "Definição do conceito A.",
        after: "Síntese do conceito A."
      }])
    }],
    ["atualizarMetadadosDaEntidade", {
      ...WRITE,
      entityType: "course",
      entityPath: COURSE_PATH,
      title: "Curso A revisto"
    }],
    ["salvarCardNoWorkspace", {
      ...WRITE,
      cardPath: [...MICROSEQUENCE_PATH, "card-a"],
      cardJson: JSON.stringify({
        id: "card-a",
        resource: "paragraph",
        kind: "theory",
        exercise: "none",
        title: "Conceito A",
        text: "Definição revista.",
        after: "Síntese revista."
      })
    }],
    ["reorganizarWorkspace", {
      ...WRITE,
      operation: "rename_entity",
      entityType: "course",
      entityPath: COURSE_PATH,
      title: "Curso renomeado"
    }],
    ["excluirDoWorkspace", {
      ...WRITE,
      operation: "delete_entity",
      entityType: "course",
      entityPath: COURSE_PATH
    }],
    ["publicarCursoDoWorkspace", {
      ...WRITE,
      courseId: "course-a",
      target: "private"
    }],
    ["submeterCursoParaRevisaoEditorial", {
      requestId: WRITE.requestId,
      courseId: COURSE_ID,
      expectedContentHash: HASH
    }],
    ["listarRevisoesEditoriais", {}],
    ["atualizarContextoDoWorkspace", {
      ...WRITE,
      brief: "Público e objetivo do curso."
    }],
    ["lerRevisaoEditorial", { submissionId: SUBMISSION_ID, view: "outline" }],
    ["criarWorkspaceDeRevisaoEditorial", {
      requestId: WRITE.requestId,
      submissionId: SUBMISSION_ID,
      title: "Revisão editorial"
    }],
    ["decidirRevisaoEditorial", {
      requestId: WRITE.requestId,
      submissionId: SUBMISSION_ID,
      decision: "request_changes",
      note: "Ajustar a fonte."
    }],
    ["retirarCursoDaRevisaoEditorial", {
      requestId: WRITE.requestId,
      submissionId: SUBMISSION_ID
    }]
  ]);

  assert.deepEqual(
    [...calls.keys()],
    AUTHORING_WORKSPACE_MCP_TOOLS.map(({ name }) => name)
  );
  for (const [name, argumentsValue] of calls) {
    const mapped = mapAuthoringMcpToolCall(name, argumentsValue);
    if (mapped.kind !== "knowledge") {
      assert.doesNotThrow(
        () => routeRequest(mapped.method, new URL(`https://aralearn.invalid${mapped.path}`).pathname),
        `${name} não alcança uma rota executável.`
      );
    }
    assert.throws(
      () => mapAuthoringMcpToolCall(name, {
        ...argumentsValue,
        argumentoNaoAnunciado: true
      }),
      ({ status, code }) => status === 422 && code === "invalid_tool_arguments",
      `${name} aceitou um kwarg fora do schema.`
    );
  }
});
