import assert from "node:assert/strict";
import test from "node:test";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

import { AuthoringApiError } from "../../supabase/functions/_shared/aralearn-authoring/errors.js";
import {
  ARALEARN_MCP_PROTOCOL_VERSION,
  createAuthoringMcpHandler
} from "../../supabase/functions/_shared/aralearn-authoring/mcpServer.js";
import {
  AUTHORING_WORKSPACE_MCP_TOOLS,
  authoringMcpToolsForPrincipal,
  mapAuthoringMcpToolCall
} from "../../supabase/functions/_shared/aralearn-authoring/workspaceMcpTools.js";
import {
  listResourceIds
} from "../../supabase/functions/_shared/aralearn/runtime/resources/registry/index.js";

const ORIGIN = "https://client.example";
const OAUTH_TOKEN = "header.oauth-payload.signature";
const ACCEPT = "application/json, text/event-stream";
const WORKSPACE_ID = "11111111-1111-4111-8111-111111111111";
const COURSE_ID = "22222222-2222-4222-8222-222222222222";
const RESOURCE_URL = "https://edge.example/functions/v1/aralearn-authoring-mcp";
const AUTHORIZATION_SERVER = "https://project.example/auth/v1";

function principal(scopes = [
  "authoring:private:read",
  "authoring:private:write"
]) {
  return {
    actorId: "33333333-3333-4333-8333-333333333333",
    oauthClientId: "chatgpt-client",
    authenticationKind: "oauth",
    scopes
  };
}

function adapter(overrides = {}) {
  return {
    async resolvePrincipal() {
      return principal();
    },
    ...overrides
  };
}

function handler(adapterValue = adapter()) {
  return createAuthoringMcpHandler({
    adapter: adapterValue,
    allowedOrigins: new Set([ORIGIN]),
    resourceUrl: RESOURCE_URL,
    authorizationServer: AUTHORIZATION_SERVER
  });
}

function request(message, {
  protocolVersion = ARALEARN_MCP_PROTOCOL_VERSION,
  authenticated = true
} = {}) {
  const headers = {
    Origin: ORIGIN,
    Accept: ACCEPT,
    "Content-Type": "application/json",
    "MCP-Protocol-Version": protocolVersion
  };
  if (authenticated) headers.Authorization = `Bearer ${OAUTH_TOKEN}`;
  return new Request("https://edge.example/functions/v1/aralearn-authoring-mcp", {
    method: "POST",
    headers,
    body: JSON.stringify(message)
  });
}

function rpc(method, params = {}, id = 1) {
  return { jsonrpc: "2.0", id, method, params };
}

function toolCall(name, argumentsValue, id = 1) {
  return rpc("tools/call", { name, arguments: argumentsValue }, id);
}

async function body(response) {
  return JSON.parse(await response.text());
}

function compileOutputSchema(schema) {
  const ajv = new Ajv2020({
    allErrors: true,
    strict: true,
    allowUnionTypes: true
  });
  addFormats(ajv);
  return ajv.compile(schema);
}

test("MCP publica protected-resource metadata e desafia com OAuth", async () => {
  const metadata = await handler()(new Request(
    `${RESOURCE_URL}/.well-known/oauth-protected-resource`
  ));
  assert.equal(metadata.status, 200);
  assert.deepEqual(await metadata.json(), {
    resource: RESOURCE_URL,
    authorization_servers: [AUTHORIZATION_SERVER],
    scopes_supported: ["openid"],
    bearer_methods_supported: ["header"]
  });

  const forwardedMetadata = await handler()(new Request(
    "https://edge.example/aralearn-authoring-mcp/.well-known/oauth-protected-resource"
  ));
  assert.equal(forwardedMetadata.status, 200);
  assert.equal((await forwardedMetadata.json()).resource, RESOURCE_URL);

  const locallyDerivedHandler = createAuthoringMcpHandler({
    adapter: adapter(),
    allowedOrigins: new Set([ORIGIN]),
    authorizationServer: AUTHORIZATION_SERVER
  });
  const locallyDerivedMetadata = await locallyDerivedHandler(new Request(
    "http://127.0.0.1:54321/functions/v1/aralearn-authoring-mcp/.well-known/oauth-protected-resource"
  ));
  assert.equal(locallyDerivedMetadata.status, 200);
  assert.equal(
    (await locallyDerivedMetadata.json()).resource,
    "http://127.0.0.1:54321/functions/v1/aralearn-authoring-mcp"
  );

  const rejected = await handler()(request(rpc("ping"), { authenticated: false }));
  assert.equal(rejected.status, 401);
  assert.match(rejected.headers.get("www-authenticate"), /resource_metadata=/u);
  assert.equal((await body(rejected)).error.data.code, "authentication_required");
});

test("MCP negocia o protocolo stateless e anuncia instruções do workspace", async () => {
  const response = await handler()(request(rpc("initialize", {
    protocolVersion: ARALEARN_MCP_PROTOCOL_VERSION,
    capabilities: {},
    clientInfo: { name: "teste", version: "1" }
  })));
  const payload = await body(response);
  assert.equal(response.status, 200);
  assert.equal(payload.result.protocolVersion, ARALEARN_MCP_PROTOCOL_VERSION);
  assert.match(payload.result.instructions, /expectedRevision/u);
  assert.match(payload.result.instructions, /microteorias/u);
});

test("ferramentas são focadas, têm outputSchema e não expõem o fluxo v3", async () => {
  const response = await handler()(request(rpc("tools/list")));
  const tools = (await body(response)).result.tools;
  const names = tools.map((entry) => entry.name);
  assert.equal(tools.length, authoringMcpToolsForPrincipal(principal()).length);
  assert.ok(names.includes("revisarMicroteoriasDoWorkspace"));
  assert.ok(names.includes("moverEntidadeNoWorkspace"));
  assert.ok(names.includes("publicarCursoDoWorkspace"));
  for (const obsolete of [
    "criarExecucaoDeAutoria",
    "gravarPlanoDeAutoria",
    "consultarProximaParte",
    "auditarParteDoCurso",
    "bloquearExecucaoDeAutoria"
  ]) {
    assert.equal(names.includes(obsolete), false);
  }
  assert.ok(tools.every((entry) => entry.outputSchema?.oneOf?.length === 2));
  assert.ok(tools.every((entry) => entry.securitySchemes?.[0]?.type === "oauth2"));
  assert.ok(tools.every((entry) => entry.securitySchemes?.[0]?.scopes?.includes("openid")));
  assert.ok(tools.every((entry) => entry.annotations.openWorldHint === false));
});

test("nenhuma ferramenta publica data genérico no ramo de sucesso", () => {
  for (const definition of AUTHORING_WORKSPACE_MCP_TOOLS) {
    const success = definition.outputSchema.oneOf.find(
      (branch) => branch.properties?.ok?.const === true
    );
    assert.ok(success, `${definition.name} deve anunciar ramo de sucesso.`);
    assert.notDeepEqual(
      success.properties.data,
      {},
      `${definition.name} não pode anunciar data: {}.`
    );
    assert.equal(
      success.properties.data.type,
      "object",
      `${definition.name} deve nomear um objeto de dados.`
    );
    assert.equal(
      success.properties.data.additionalProperties,
      false,
      `${definition.name} deve fechar os campos de controle e de rota.`
    );
    assert.doesNotThrow(
      () => compileOutputSchema(definition.outputSchema),
      `${definition.name} deve publicar JSON Schema 2020-12 compilável.`
    );
  }
});

test("enum de resources do MCP deriva exatamente do registro canônico Edge", () => {
  const definition = AUTHORING_WORKSPACE_MCP_TOOLS.find(
    (entry) => entry.name === "consultarRecursoDeCard"
  );
  assert.deepEqual(definition.inputSchema.properties.resource.enum, listResourceIds());
});

test("consulta detalhada devolve metadados e schema estrutural autoral", async () => {
  const response = await handler()(request(toolCall("consultarRecursoDeCard", {
    resource: "tree"
  })));
  const payload = await body(response);
  assert.equal(response.status, 200);
  assert.equal(payload.result.isError, false);
  const definition = payload.result.structuredContent.data.definition;
  assert.equal(definition.resource, "tree");
  assert.ok(definition.purpose);
  assert.ok(definition.selection.useWhen.length);
  assert.match(definition.schemaRole, /validação semântica/u);
  assert.deepEqual(definition.authoringSchema.properties.variant.enum, [
    "filesystem",
    "hierarchy",
    "taxonomy",
    "phylogeny",
    "syntax",
    "organization"
  ]);
});

test("matriz de escopos separa leitura, escrita e publicação", () => {
  const names = (scopes) => authoringMcpToolsForPrincipal(principal(scopes))
    .map((entry) => entry.name);
  const read = names(["authoring:read"]);
  assert.ok(read.includes("lerConteudoDoCurso"));
  assert.ok(read.includes("revisarMicroteoriasDoWorkspace"));
  assert.ok(read.includes("listarColecoesDoCatalogo"));
  assert.ok(read.includes("listarCursosDaColecao"));
  assert.equal(read.includes("renomearEntidadeNoWorkspace"), false);

  const write = names(["authoring:write"]);
  assert.ok(write.includes("renomearEntidadeNoWorkspace"));
  assert.equal(write.includes("lerWorkspaceDeAutoria"), false);

  const personal = names(["authoring:private:read", "authoring:private:write"]);
  assert.ok(personal.includes("listarCursosDaBibliotecaPessoal"));
  assert.ok(personal.includes("listarColecoesDoCatalogo"));
  assert.ok(personal.includes("listarCursosDaColecao"));
  assert.ok(personal.includes("publicarCursoDoWorkspace"));

  const catalog = names(["catalog:publish"]);
  assert.ok(catalog.includes("listarColecoesDoCatalogo"));
  assert.ok(catalog.includes("publicarCursoDoWorkspace"));
});

test("mapeamento usa operações atômicas e compare-and-swap", () => {
  const operation = mapAuthoringMcpToolCall("moverEntidadeNoWorkspace", {
    requestId: "move-workspace-0001",
    workspaceId: WORKSPACE_ID,
    expectedRevision: 7,
    entityType: "lesson",
    entityPath: ["course-source", "module-source", "lesson-source"],
    targetParentPath: ["course-target", "module-target"],
    position: 1
  });
  assert.equal(operation.method, "POST");
  assert.equal(operation.path, `/v1/workspaces/${WORKSPACE_ID}/mutations`);
  assert.deepEqual(operation.body, {
    requestId: "move-workspace-0001",
    expectedRevision: 7,
    operation: "move_entity",
    arguments: {
      entityType: "lesson",
      entityPath: ["course-source", "module-source", "lesson-source"],
      targetParentPath: ["course-target", "module-target"],
      position: 1
    }
  });
});

test("revisão de microteoria não solicita cards de prática", () => {
  const operation = mapAuthoringMcpToolCall("revisarMicroteoriasDoWorkspace", {
    workspaceId: WORKSPACE_ID,
    entityPath: ["course-conceptual", "module-conceptual", "lesson-conceptual"]
  });
  assert.equal(operation.method, "GET");
  assert.match(operation.path, /view=microtheories/u);
  assert.match(operation.path, /entityPath=/u);
  assert.doesNotMatch(operation.path, /courseId=/u);
});

test("revisão de microteorias anuncia e cumpre uma saída especializada", async () => {
  const definition = AUTHORING_WORKSPACE_MCP_TOOLS.find(
    (entry) => entry.name === "revisarMicroteoriasDoWorkspace"
  );
  const genericDefinition = AUTHORING_WORKSPACE_MCP_TOOLS.find(
    (entry) => entry.name === "listarWorkspacesDeAutoria"
  );
  const successSchema = definition.outputSchema.oneOf.find(
    (branch) => branch.properties?.ok?.const === true
  );
  assert.equal(successSchema.properties.data.type, "object");
  assert.deepEqual(successSchema.properties.data.properties.view, {
    const: "microtheories"
  });
  assert.deepEqual(
    definition.outputSchema.oneOf.find((branch) => branch.properties?.ok?.const === false),
    genericDefinition.outputSchema.oneOf.find(
      (branch) => branch.properties?.ok?.const === false
    )
  );

  let received = null;
  const reviewData = {
    workspaceId: WORKSPACE_ID,
    title: "Curso em revisão",
    revision: 4,
    currentRevision: 5,
    sourceCourseId: null,
    sourceRevisionHash: null,
    createdAt: "2026-07-29T17:00:00.000Z",
    updatedAt: "2026-07-29T18:00:00.000Z",
    idempotent: false,
    artifact: {
      hash: "a".repeat(64),
      bucket: "aralearn-authoring-artifacts",
      objectKey: `artifacts/sha256/aa/aa/${"a".repeat(64)}.json`,
      artifactType: "aralearn.authoring-workspace",
      mediaType: "application/json",
      sizeBytes: 2048
    },
    view: "microtheories",
    content: {
      courses: [{
        id: "course-a",
        entityPath: ["course-a"],
        title: "Curso A",
        modules: [{
          id: "module-a",
          entityPath: ["course-a", "module-a"],
          title: "Módulo A",
          lessons: [{
            id: "lesson-a",
            entityPath: ["course-a", "module-a", "lesson-a"],
            title: "Lição A",
            microtheories: [{
              id: "micro-a",
              entityPath: ["course-a", "module-a", "lesson-a", "micro-a"],
              title: "Microteoria A",
              goal: "Compreender a unidade conceitual.",
              status: "needs_review",
              content: "Definição consolidada.\n\nExemplo conceitual.",
              practiceCount: 4
            }]
          }]
        }]
      }]
    }
  };
  const response = await handler(adapter({
    async getWorkspace(options) {
      received = options;
      return reviewData;
    }
  }))(request(toolCall("revisarMicroteoriasDoWorkspace", {
    workspaceId: WORKSPACE_ID,
    revision: 4,
    entityPath: ["course-a", "module-a", "lesson-a", "micro-a"]
  })));
  const payload = await body(response);
  assert.equal(response.status, 200);
  assert.equal(payload.result.isError, false);
  assert.equal(received.view, "microtheories");
  assert.deepEqual(received.entityPath, [
    "course-a", "module-a", "lesson-a", "micro-a"
  ]);

  const validate = compileOutputSchema(definition.outputSchema);
  assert.equal(
    validate(payload.result.structuredContent),
    true,
    JSON.stringify(validate.errors, null, 2)
  );

  const cardByCard = structuredClone(payload.result.structuredContent);
  cardByCard.data.content.courses[0].modules[0].lessons[0]
    .microtheories[0].content = [{ title: "Card teórico indevido" }];
  assert.equal(validate(cardByCard), false);

  const errorResponse = await handler()(request(toolCall(
    "revisarMicroteoriasDoWorkspace",
    {
      workspaceId: WORKSPACE_ID,
      entityPath: ["course-a", "module-a", "lesson-a", "micro-a", "card-a"]
    }
  )));
  const errorPayload = await body(errorResponse);
  assert.equal(errorPayload.result.isError, true);
  assert.equal(errorPayload.result.structuredContent.ok, false);
  assert.equal(
    validate(errorPayload.result.structuredContent),
    true,
    JSON.stringify(validate.errors, null, 2)
  );
});

test("histórico usa cursor de revisão e pode ser percorrido até o início", () => {
  const operation = mapAuthoringMcpToolCall("listarHistoricoDoWorkspace", {
    workspaceId: WORKSPACE_ID,
    limit: 25,
    beforeRevision: 76
  });
  assert.equal(operation.method, "GET");
  assert.match(operation.path, /limit=25/u);
  assert.match(operation.path, /beforeRevision=76/u);
});

test("publicação parcial é expressa de forma explícita e privada", () => {
  const operation = mapAuthoringMcpToolCall("publicarCursoDoWorkspace", {
    requestId: "publish-preview-0001",
    workspaceId: WORKSPACE_ID,
    expectedRevision: 3,
    courseId: "course-preview",
    target: "private",
    completion: "partial",
    publicationMode: "create"
  });
  assert.equal(operation.path, `/v1/workspaces/${WORKSPACE_ID}/publications`);
  assert.equal(operation.body.completion, "partial");
  assert.equal(operation.body.target, "private");
});

test("validador MCP aplica condicionais de publicação antes do roteamento", () => {
  const base = {
    requestId: "publish-conditional-0001",
    workspaceId: WORKSPACE_ID,
    expectedRevision: 3,
    courseId: "course-preview",
    target: "catalog",
    completion: "complete",
    publicationMode: "create"
  };
  for (const invalid of [
    base,
    { ...base, collectionId: COURSE_ID, completion: "partial" },
    {
      ...base,
      target: "private",
      completion: "partial",
      collectionId: COURSE_ID
    },
    {
      ...base,
      collectionId: COURSE_ID,
      publicationMode: "update"
    },
    {
      ...base,
      collectionId: COURSE_ID,
      existingCourseId: COURSE_ID,
      expectedContentHash: "a".repeat(64)
    }
  ]) {
    assert.throws(
      () => mapAuthoringMcpToolCall("publicarCursoDoWorkspace", invalid),
      (error) => error instanceof AuthoringApiError
        && error.code === "invalid_tool_arguments"
    );
  }

  const valid = mapAuthoringMcpToolCall("publicarCursoDoWorkspace", {
    ...base,
    collectionId: COURSE_ID,
    publicationMode: "update",
    existingCourseId: COURSE_ID,
    expectedContentHash: "a".repeat(64)
  });
  assert.equal(valid.body.publicationMode, "update");
});

test("validador MCP percorre itens aninhados, bounds e date-time RFC 3339", () => {
  assert.throws(
    () => mapAuthoringMcpToolCall("moverEntidadeNoWorkspace", {
      requestId: "move-invalid-path-0001",
      workspaceId: WORKSPACE_ID,
      expectedRevision: 1,
      entityType: "course",
      entityPath: ["x".repeat(241)]
    }),
    (error) => error?.code === "invalid_tool_arguments"
      && error?.details?.path === "arguments.entityPath[0]"
  );
  assert.throws(
    () => mapAuthoringMcpToolCall("listarWorkspacesDeAutoria", {
      beforeUpdatedAt: "2026-02-30T10:00:00Z",
      beforeId: COURSE_ID
    }),
    (error) => error?.code === "invalid_tool_arguments"
      && error?.details?.field === "arguments.beforeUpdatedAt"
  );
  assert.throws(
    () => mapAuthoringMcpToolCall("listarWorkspacesDeAutoria", { limit: 101 }),
    (error) => error?.code === "invalid_tool_arguments"
  );
  assert.throws(
    () => mapAuthoringMcpToolCall("moverEntidadeNoWorkspace", {
      requestId: "move-invalid-depth-0001",
      workspaceId: WORKSPACE_ID,
      expectedRevision: 1,
      entityType: "module",
      entityPath: ["course-a"],
      targetParentPath: ["course-b"]
    }),
    (error) => error?.code === "invalid_tool_arguments"
      && error?.details?.path === "arguments.entityPath"
  );
  assert.throws(
    () => mapAuthoringMcpToolCall("inserirEntidadeNoWorkspace", {
      requestId: "insert-missing-parent-0001",
      workspaceId: WORKSPACE_ID,
      expectedRevision: 1,
      entityType: "lesson",
      entity: { id: "lesson-a" }
    }),
    (error) => error?.code === "invalid_tool_arguments"
      && error?.details?.path === "arguments.parentPath"
  );
  assert.doesNotThrow(
    () => mapAuthoringMcpToolCall("listarWorkspacesDeAutoria", {
      beforeUpdatedAt: "2026-07-29T10:15:30-03:00",
      beforeId: COURSE_ID,
      limit: 100
    })
  );
});

test("contratos recusam campos desconhecidos e revisões inválidas", () => {
  assert.throws(
    () => mapAuthoringMcpToolCall("renomearEntidadeNoWorkspace", {
      requestId: "rename-workspace-0001",
      workspaceId: WORKSPACE_ID,
      expectedRevision: 0,
      entityType: "course",
      entityPath: ["course-a"],
      title: "Novo",
      legacyRunId: WORKSPACE_ID
    }),
    (error) => error instanceof AuthoringApiError
      && error.code === "invalid_tool_arguments"
  );
});

test("tools/call devolve structuredContent no contrato anunciado", async () => {
  const response = await handler(adapter({
    async listWorkspaces() {
      return { items: [{ workspaceId: WORKSPACE_ID, title: "Curso", revision: 2 }] };
    }
  }))(request(toolCall("listarWorkspacesDeAutoria", {})));
  const payload = await body(response);
  assert.equal(response.status, 200);
  assert.equal(payload.result.isError, false);
  assert.equal(payload.result.structuredContent.ok, true);
  assert.equal(payload.result.structuredContent.requestId, null);
  assert.equal(payload.result.structuredContent.data.items[0].revision, 2);
});

test("erro de ferramenta satisfaz o ramo de erro do outputSchema", async () => {
  const response = await handler()(request(toolCall("renomearEntidadeNoWorkspace", {
    requestId: "rename-invalid-0001",
    workspaceId: WORKSPACE_ID,
    expectedRevision: 1,
    entityType: "course",
    entityPath: ["course-a"],
    title: ""
  })));
  const payload = await body(response);
  assert.equal(response.status, 200);
  assert.equal(payload.result.isError, true);
  assert.equal(payload.result.structuredContent.ok, false);
  assert.equal(payload.result.structuredContent.data, undefined);
  assert.equal(typeof payload.result.structuredContent.error.code, "string");
});

test("chamada de escrita atravessa o executor interno compartilhado", async () => {
  let received = null;
  const response = await handler(adapter({
    async mutateWorkspace(options) {
      received = options;
      return { workspaceId: WORKSPACE_ID, revision: 5 };
    }
  }))(request(toolCall("renomearEntidadeNoWorkspace", {
    requestId: "rename-workspace-0002",
    workspaceId: WORKSPACE_ID,
    expectedRevision: 4,
    entityType: "course",
    entityPath: ["course-a"],
    title: "Curso revisto"
  })));
  const payload = await body(response);
  assert.equal(payload.result.isError, false);
  assert.equal(received.workspaceId, WORKSPACE_ID);
  assert.equal(received.operation, "rename_entity");
  assert.deepEqual(received.arguments, {
    entityType: "course",
    entityPath: ["course-a"],
    title: "Curso revisto"
  });
});

test("curso publicado pode ser lido por árvore ou entidade", () => {
  const operation = mapAuthoringMcpToolCall("lerConteudoDoCurso", {
    courseId: COURSE_ID,
    view: "entity",
    entityType: "module",
    entityPath: ["course-a", "module-a"],
    includeDescendants: false
  });
  assert.match(operation.path, new RegExp(`/v1/courses/${COURSE_ID}/content`));
  assert.match(operation.path, /entityType=module/u);
});

test("o catálogo parcial não é disfarçado no contrato", () => {
  const definition = AUTHORING_WORKSPACE_MCP_TOOLS.find(
    (entry) => entry.name === "publicarCursoDoWorkspace"
  );
  assert.match(definition.description, /catálogo exige complete/u);
  assert.deepEqual(definition.inputSchema.properties.completion.enum, ["partial", "complete"]);
});
