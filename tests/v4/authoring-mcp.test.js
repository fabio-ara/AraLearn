import assert from "node:assert/strict";
import test from "node:test";

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

const ORIGIN = "https://client.example";
const API_KEY = `arl_${"A".repeat(32)}`;
const ACCEPT = "application/json, text/event-stream";
const WORKSPACE_ID = "11111111-1111-4111-8111-111111111111";
const COURSE_ID = "22222222-2222-4222-8222-222222222222";

function principal(scopes = [
  "authoring:private:read",
  "authoring:private:write"
]) {
  return {
    actorId: "33333333-3333-4333-8333-333333333333",
    clientId: "44444444-4444-4444-8444-444444444444",
    authenticationKind: "api_key",
    scopes
  };
}

function adapter(overrides = {}) {
  return {
    receiptSecret: "authoring-mcp-test-receipt-secret-32-bytes",
    async resolvePrincipal() {
      return principal();
    },
    ...overrides
  };
}

function handler(adapterValue = adapter()) {
  return createAuthoringMcpHandler({
    adapter: adapterValue,
    allowedOrigins: new Set([ORIGIN])
  });
}

function request(message, { protocolVersion = ARALEARN_MCP_PROTOCOL_VERSION } = {}) {
  return new Request("https://edge.example/functions/v1/aralearn-authoring-mcp", {
    method: "POST",
    headers: {
      Origin: ORIGIN,
      Accept: ACCEPT,
      "Content-Type": "application/json",
      "MCP-Protocol-Version": protocolVersion,
      "X-AraLearn-API-Key": API_KEY
    },
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
  assert.ok(tools.every((entry) => entry.outputSchema?.required?.includes("data")));
  assert.ok(tools.every((entry) => entry.annotations.openWorldHint === false));
});

test("matriz de escopos separa leitura, escrita e publicação", () => {
  const names = (scopes) => authoringMcpToolsForPrincipal(principal(scopes))
    .map((entry) => entry.name);
  const read = names(["authoring:read"]);
  assert.ok(read.includes("lerConteudoDoCurso"));
  assert.ok(read.includes("revisarMicroteoriasDoWorkspace"));
  assert.equal(read.includes("renomearEntidadeNoWorkspace"), false);

  const write = names(["authoring:write"]);
  assert.ok(write.includes("renomearEntidadeNoWorkspace"));
  assert.equal(write.includes("lerWorkspaceDeAutoria"), false);

  const personal = names(["authoring:private:read", "authoring:private:write"]);
  assert.ok(personal.includes("listarCursosDaBibliotecaPessoal"));
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
    entityId: "lesson-source",
    targetParentId: "module-target",
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
      entityId: "lesson-source",
      targetParentId: "module-target",
      position: 1
    }
  });
});

test("revisão de microteoria não solicita cards de prática", () => {
  const operation = mapAuthoringMcpToolCall("revisarMicroteoriasDoWorkspace", {
    workspaceId: WORKSPACE_ID,
    courseId: "course-conceptual"
  });
  assert.equal(operation.method, "GET");
  assert.match(operation.path, /view=microtheories/u);
  assert.match(operation.path, /courseId=course-conceptual/u);
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

test("contratos recusam campos desconhecidos e revisões inválidas", () => {
  assert.throws(
    () => mapAuthoringMcpToolCall("renomearEntidadeNoWorkspace", {
      requestId: "rename-workspace-0001",
      workspaceId: WORKSPACE_ID,
      expectedRevision: 0,
      entityType: "course",
      entityId: "course-a",
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

test("chamada de escrita atravessa a mesma rota REST do backend", async () => {
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
    entityId: "course-a",
    title: "Curso revisto"
  })));
  const payload = await body(response);
  assert.equal(payload.result.isError, false);
  assert.equal(received.workspaceId, WORKSPACE_ID);
  assert.equal(received.operation, "rename_entity");
  assert.deepEqual(received.arguments, {
    entityType: "course",
    entityId: "course-a",
    title: "Curso revisto"
  });
});

test("curso publicado pode ser lido por árvore ou entidade", () => {
  const operation = mapAuthoringMcpToolCall("lerConteudoDoCurso", {
    courseId: COURSE_ID,
    view: "entity",
    entityType: "module",
    entityId: "module-a",
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
