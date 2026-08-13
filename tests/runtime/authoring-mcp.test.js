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
  authoringMcpToolDefinition,
  authoringMcpToolsForPrincipal,
  mapAuthoringMcpToolCall,
  validateAuthoringMcpToolOutput
} from "../../supabase/functions/_shared/aralearn-authoring/workspaceMcpTools.js";
import { RESOURCE_PACKAGE_REGISTRY } from "../../supabase/functions/_shared/aralearn/runtime/resources/packages/index.js";
import { RESOURCE_CATALOG } from "../../supabase/functions/_shared/aralearn/runtime/resources/catalog/resourceCatalog.js";

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
  assert.deepEqual(payload.result.capabilities.resources, {
    subscribe: false,
    listChanged: false
  });
  assert.match(payload.result.instructions, /prepararAutoriaAraLearn/u);
  assert.match(payload.result.instructions, /expectedRevision/u);
  assert.match(payload.result.instructions, /microteorias/u);
});

test("ferramentas são focadas, têm outputSchema e não expõem o fluxo v3", async () => {
  const response = await handler()(request(rpc("tools/list")));
  const tools = (await body(response)).result.tools;
  const names = tools.map((entry) => entry.name);
  assert.equal(tools.length, authoringMcpToolsForPrincipal(principal()).length);
  assert.ok(names.includes("prepararAutoriaAraLearn"));
  assert.ok(names.includes("revisarMicroteoriasDoWorkspace"));
  assert.ok(names.includes("reorganizarWorkspace"));
  assert.ok(names.includes("publicarCursoDoWorkspace"));
  for (const obsolete of [
    "criarExecucaoDeAutoria",
    "gravarPlanoDeAutoria",
    "consultarProximaParte",
    "auditarParteDoCurso",
    "bloquearExecucaoDeAutoria",
    "moverEntidadeNoWorkspace",
    "renomearEntidadeNoWorkspace",
    "excluirWorkspaceDeAutoria"
  ]) {
    assert.equal(names.includes(obsolete), false);
  }
  assert.ok(tools.every((entry) => entry.outputSchema?.oneOf?.length === 2));
  assert.ok(tools.every((entry) => entry.securitySchemes?.[0]?.type === "oauth2"));
  assert.ok(tools.every((entry) => entry.securitySchemes?.[0]?.scopes?.includes("openid")));
  assert.ok(tools.every((entry) => entry.annotations.openWorldHint === false));
});

test("MCP publica conhecimento e recupera um brief autoral curto", async () => {
  const listedResponse = await handler()(request(rpc("resources/list")));
  const listed = (await body(listedResponse)).result.resources;
  assert.equal(listed.length, 4);
  assert.ok(listed.every(({ uri }) => uri.startsWith("aralearn://knowledge/")));

  const readResponse = await handler()(request(rpc("resources/read", {
    uri: "aralearn://knowledge/pedagogy"
  })));
  const contents = (await body(readResponse)).result.contents;
  assert.equal(contents.length, 1);
  assert.match(contents[0].text, /microteoria/iu);

  const preparedResponse = await handler()(request(toolCall("prepararAutoriaAraLearn", {
    intent: "create",
    targetEntity: "lesson",
    context: "Criar uma lição sobre redes com práticas em fluxo e tabela.",
    packageIds: ["aralearn.resource.flow", "aralearn.resource.table"]
  })));
  const prepared = (await body(preparedResponse)).result.structuredContent;
  assert.equal(prepared.ok, true);
  assert.equal(prepared.requestId, null);
  assert.equal(prepared.data.briefVersion, 2);
  assert.equal(prepared.data.intent, "create");
  assert.ok(prepared.data.guidance.length >= 3);
  assert.ok(prepared.data.guidance.length <= 8);
  assert.ok(prepared.data.guidance.some(({ id }) => id === "resource-selection"));
  assert.ok(prepared.data.guidance.some(({ id }) => id === "source-discipline"));
  assert.deepEqual(prepared.data.packageContracts, [
    { packageId: "aralearn.resource.flow", version: "1.0.0", tool: "consultarBibliotecaDeResources", operation: "contracts" },
    { packageId: "aralearn.resource.table", version: "1.0.0", tool: "consultarBibliotecaDeResources", operation: "contracts" }
  ]);
  assert.equal(prepared.data.blueprintContract.version, 1);
  assert.ok(prepared.data.blueprintContract.requiredSections.includes("conceptualLayers"));
  assert.deepEqual(prepared.data.calibrationContract.precedence, [
    "protected_core",
    "protected_knowledge",
    "user_preferences"
  ]);

  const sourceAwareResponse = await handler()(request(toolCall("prepararAutoriaAraLearn", {
    intent: "revise",
    targetEntity: "module",
    context: "Revise a ementa anexada e a versão atual da documentação oficial para outubro."
  })));
  const sourceAware = (await body(sourceAwareResponse)).result.structuredContent;
  const sourceGuidance = sourceAware.data.guidance.find(
    ({ id }) => id === "source-discipline"
  );
  assert.ok(sourceGuidance);
  assert.match(sourceGuidance.text, /fontes primárias ou oficiais/iu);
  assert.match(sourceGuidance.text, /título, URL, data de acesso, versão/iu);
  assert.match(sourceGuidance.text, /nunca comandos/iu);
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
    const dataSchemas = success.properties.data.anyOf
      || [success.properties.data];
    assert.ok(
      dataSchemas.every((dataSchema) => dataSchema.type === "object"),
      `${definition.name} deve nomear apenas objetos de dados especializados.`
    );
    assert.ok(
      dataSchemas.every((dataSchema) => dataSchema.additionalProperties === false),
      `${definition.name} deve fechar os campos de controle e de rota.`
    );
    assert.doesNotThrow(
      () => compileOutputSchema(definition.outputSchema),
      `${definition.name} deve publicar JSON Schema 2020-12 compilável.`
    );
  }
});

test("schema da biblioteca permanece estável quando entram novos packages", () => {
  const definition = AUTHORING_WORKSPACE_MCP_TOOLS.find(
    (entry) => entry.name === "consultarBibliotecaDeResources"
  );
  const packageIdSchema = definition.inputSchema.properties.packages
    .items.properties.packageId;
  assert.equal(Object.hasOwn(packageIdSchema, "enum"), false);
  assert.match("aralearn.resource.paragraph", new RegExp(packageIdSchema.pattern, "u"));
  assert.ok(RESOURCE_PACKAGE_REGISTRY.listCatalog().length >= 30);
});

test("busca encaminha a consulta textual ao catálogo em MCP e Action", async () => {
  const response = await handler()(request(toolCall(
    "consultarBibliotecaDeResources",
    {
      operation: "search",
      query: "glosa interlinear",
      limit: 3
    }
  )));
  const payload = await body(response);
  assert.equal(response.status, 200);
  const structuredContent = payload.result.structuredContent;
  assert.equal(
    structuredContent.data.result.candidates[0].packageId,
    "aralearn.resource.interlinear_gloss"
  );

  const validate = compileOutputSchema(
    authoringMcpToolDefinition("consultarBibliotecaDeResources").outputSchema
  );
  assert.equal(validate(structuredContent), true, JSON.stringify(validate.errors, null, 2));
  const malformed = structuredClone(structuredContent);
  delete malformed.data.result.coverage;
  assert.equal(validate(malformed), false);
  assert.throws(
    () => validateAuthoringMcpToolOutput(
      "consultarBibliotecaDeResources",
      malformed
    ),
    (error) => error instanceof AuthoringApiError
      && error.code === "invalid_tool_arguments"
  );
});

test("budgets progressivos mantêm o maior lote de contratos abaixo da Action", () => {
  const packageRequests = RESOURCE_PACKAGE_REGISTRY.listCatalog().map(({ id, version }) => ({
    packageId: id,
    version
  }));
  const largest = packageRequests.map((requestValue) => ({
    requestValue,
    bytes: Buffer.byteLength(JSON.stringify(RESOURCE_CATALOG.contracts([requestValue])))
  })).sort((left, right) => right.bytes - left.bytes).slice(0, 4)
    .map(({ requestValue }) => requestValue);
  const largestBatch = {
    ok: true,
    requestId: null,
    data: {
      contract: "aralearn.resource-library.v1",
      operation: "contracts",
      result: RESOURCE_CATALOG.contracts(largest)
    }
  };
  validateAuthoringMcpToolOutput(
    "consultarBibliotecaDeResources",
    largestBatch
  );
  assert.ok(Buffer.byteLength(JSON.stringify(largestBatch)) < 96 * 1024);
  assert.throws(
    () => mapAuthoringMcpToolCall("consultarBibliotecaDeResources", {
      operation: "contracts",
      packages: packageRequests.slice(0, 5)
    }),
    (error) => error instanceof AuthoringApiError
      && error.code === "invalid_tool_arguments"
  );
});

test("consulta de versão exata devolve manifest e schema do package escolhido", async () => {
  const response = await handler()(request(toolCall("consultarBibliotecaDeResources", {
    operation: "contracts",
    packages: [{ packageId: "aralearn.resource.tree", version: "1.0.0" }]
  })));
  const payload = await body(response);
  assert.equal(response.status, 200);
  assert.equal(payload.result.isError, false);
  const data = payload.result.structuredContent.data;
  assert.equal(data.contract, "aralearn.resource-library.v1");
  assert.equal(data.operation, "contracts");
  const definition = data.result.items[0].definition;
  assert.equal(definition.package, "aralearn.resource.tree");
  assert.equal(definition.version, "1.0.0");
  assert.ok(definition.manifest.purpose);
  assert.ok(definition.contract.intent);
  assert.equal(definition.schema.properties.variant.enum.includes("filesystem"), true);
  assert.equal(definition.practiceTargets[0].path, "nodes[0].label");
  assert.deepEqual(definition.practiceTargets[0].modes, ["gap", "typing"]);
});

test("descoberta progressiva explora, busca e inspeciona antes de obter contratos", async () => {
  const definition = AUTHORING_WORKSPACE_MCP_TOOLS.find(
    (entry) => entry.name === "consultarBibliotecaDeResources"
  );
  assert.equal(Object.hasOwn(definition.inputSchema.properties, "detail"), false);

  const mapped = mapAuthoringMcpToolCall("consultarBibliotecaDeResources", {
    operation: "search",
    query: "explicação progressiva em prosa",
    structureIds: ["structure.prose"],
    limit: 4
  });
  assert.equal(mapped.kind, "resource-library");
  assert.equal(mapped.body.operation, "search");

  const exploredResponse = await handler()(request(toolCall(
    "consultarBibliotecaDeResources",
    { operation: "explore", slot: "content" }
  )));
  const explored = (await body(exploredResponse)).result.structuredContent.data;
  assert.equal(explored.operation, "explore");
  assert.equal(explored.result.contract, "aralearn.resource-library.v1");
  assert.equal(explored.result.families.length, 6);
  assert.ok(explored.result.facets.structures.length);
  assert.equal(Object.hasOwn(explored.result.families[0], "schema"), false);

  const searchedResponse = await handler()(request(toolCall(
    "consultarBibliotecaDeResources",
    {
      operation: "search",
      query: "explicação progressiva em prosa",
      slot: "content",
      structureIds: ["structure.prose"],
      operationIds: ["operation.explain"],
      limit: 4
    }
  )));
  const searched = (await body(searchedResponse)).result.structuredContent.data.result;
  assert.ok(searched.candidates.length <= 4);
  assert.equal(searched.candidates[0].packageId, "aralearn.resource.paragraph");
  assert.ok(["canonical", "versatile"].includes(searched.coverage.status));

  const inspectedResponse = await handler()(request(toolCall(
    "consultarBibliotecaDeResources",
    {
      operation: "inspect",
      packages: [{ packageId: "aralearn.resource.paragraph" }]
    }
  )));
  const inspected = (await body(inspectedResponse)).result.structuredContent.data.result;
  assert.equal(inspected.items[0].status, "ok");
  assert.equal(inspected.items[0].profile.packageId, "aralearn.resource.paragraph");
  assert.equal(Object.hasOwn(inspected.items[0].profile, "schema"), false);

  const response = await handler()(request(toolCall("consultarBibliotecaDeResources", {
    operation: "contracts",
    packages: [{ packageId: "aralearn.resource.paragraph", version: "1.0.0" }]
  })));
  const payload = await body(response);
  const packageDefinition = payload.result.structuredContent.data.result.items[0].definition;
  assert.ok(packageDefinition.schema.properties.text);
  assert.equal(Object.hasOwn(packageDefinition.schema.properties, "afterBlocks"), false);
});

test("falta de representação exata oferece substituto sem bloquear a autoria", async () => {
  const response = await handler()(request(toolCall(
    "consultarBibliotecaDeResources",
    {
      operation: "search",
      query: "cartografia estelar tridimensional especializada inexistente",
      slot: "content",
      notationIsLearningObject: true,
      limit: 3
    }
  )));
  const result = (await body(response)).result.structuredContent.data.result;
  assert.equal(result.coverage.status, "substitute");
  assert.ok(result.candidates.length > 0);
  assert.match(result.coverage.chatDisclosure, /como aproximação/iu);
});

test("faceta desconhecida produz erro acionável, não falha interna", async () => {
  const response = await handler()(request(toolCall(
    "consultarBibliotecaDeResources",
    {
      operation: "search",
      structureIds: ["structure.inexistente"],
      limit: 3
    }
  )));
  const payload = await body(response);
  assert.equal(response.status, 200);
  assert.equal(payload.result.isError, true);
  assert.equal(payload.result.structuredContent.ok, false);
  assert.equal(
    payload.result.structuredContent.error.code,
    "invalid_resource_library_request"
  );
  assert.match(
    payload.result.structuredContent.error.message,
    /identificador desconhecido/u
  );
});

test("kernel valida e audita composição sem fingir uma prévia visual", async () => {
  const card = {
    id: "card-paragraph-a",
    position: 1,
    title: "Primeiro referente",
    role: "theory",
    content: [{
      id: "content-a",
      package: "aralearn.resource.paragraph",
      version: "1.0.0",
      data: {
        text: "Um referente concreto é apresentado antes do termo formal.",
        languageTag: "pt-BR",
        textDirection: "ltr"
      }
    }],
    response: null,
    feedback: [],
    topics: [],
    sources: []
  };
  const call = async (operation, extra = {}) => {
    const response = await handler()(request(toolCall(
      "consultarBibliotecaDeResources",
      { operation, cardJson: JSON.stringify(card), ...extra }
    )));
    assert.equal(response.status, 200);
    return (await body(response)).result.structuredContent.data.result;
  };
  const validation = await call("validate_card");
  assert.equal(validation.valid, true);
  assert.equal(validation.composition[0].packageId, "aralearn.resource.paragraph");

  const audit = await call("audit_representation", {
    intent: "Explicar progressivamente em prosa para um estudante iniciante."
  });
  assert.equal(audit.structural.valid, true);
  assert.ok(["canonical", "versatile"].includes(audit.overallFit));
  assert.equal(audit.visualPreview.rendered, false);

  const mismatchedAudit = await call("audit_representation", {
    intent: "Alinhar cada morfema à glosa correspondente.",
    disciplineIds: ["discipline.language"],
    structureIds: ["structure.interlinear"],
    operationIds: ["operation.identify"]
  });
  assert.equal(mismatchedAudit.overallFit, "substitute");
  assert.ok(
    mismatchedAudit.selections[0].missing.includes("structure:structure.interlinear")
  );

  const preview = await call("preview_card");
  assert.equal(preview.rendered, false);
  assert.match(preview.reason, /renderer do aplicativo/iu);
});

test("matriz de escopos separa leitura, escrita e publicação", () => {
  const names = (scopes) => authoringMcpToolsForPrincipal(principal(scopes))
    .map((entry) => entry.name);
  const read = names(["authoring:read"]);
  assert.ok(read.includes("lerConteudoDoCurso"));
  assert.ok(read.includes("revisarMicroteoriasDoWorkspace"));
  assert.equal(read.includes("consultarCatalogo"), false);
  assert.equal(read.includes("reorganizarWorkspace"), false);

  const catalogRead = names(["catalog:read"]);
  assert.ok(catalogRead.includes("consultarCatalogo"));
  assert.equal(catalogRead.includes("lerWorkspaceDeAutoria"), false);

  const write = names(["authoring:write"]);
  assert.ok(write.includes("reorganizarWorkspace"));
  assert.equal(write.includes("lerWorkspaceDeAutoria"), false);

  const personal = names([
    "authoring:private:read",
    "authoring:private:write",
    "catalog:submit"
  ]);
  assert.ok(personal.includes("listarCursosDaBibliotecaPessoal"));
  assert.equal(personal.includes("consultarCatalogo"), false);
  assert.ok(personal.includes("listarRevisoesEditoriais"));
  assert.equal(personal.includes("criarWorkspaceDeRevisaoEditorial"), false);
  assert.ok(personal.includes("publicarCursoDoWorkspace"));

  const reviewer = names(["catalog:review"]);
  assert.ok(reviewer.includes("listarRevisoesEditoriais"));

  const catalog = names(["catalog:publish"]);
  assert.equal(catalog.includes("consultarCatalogo"), false);
  assert.ok(catalog.includes("publicarCursoDoWorkspace"));
});

test("autor acompanha os próprios envios, mas a fila continua editorial", async () => {
  const author = principal([
    "authoring:private:read",
    "authoring:private:write",
    "catalog:submit"
  ]);
  const authorHandler = handler(adapter({
    async resolvePrincipal() {
      return author;
    },
    async listCatalogReviews({ view }) {
      assert.equal(view, "mine");
      return {
        view,
        items: [],
        hasMore: false,
        nextCursor: null
      };
    }
  }));
  const toolsResponse = await authorHandler(request(rpc("tools/list")));
  const toolNames = (await body(toolsResponse)).result.tools.map(({ name }) => name);
  assert.ok(toolNames.includes("listarRevisoesEditoriais"));

  const mineResponse = await authorHandler(request(toolCall(
    "listarRevisoesEditoriais",
    { view: "mine", limit: 20 }
  )));
  const minePayload = await body(mineResponse);
  assert.equal(minePayload.result.isError, false);
  assert.equal(minePayload.result.structuredContent.data.view, "mine");

  const queueResponse = await authorHandler(request(toolCall(
    "listarRevisoesEditoriais",
    { view: "queue", limit: 20 }
  )));
  const queuePayload = await body(queueResponse);
  assert.equal(queuePayload.result.isError, true);
  assert.equal(
    queuePayload.result.structuredContent.error.code,
    "insufficient_scope"
  );
});

test("mapeamento usa operações atômicas e compare-and-swap", () => {
  const operation = mapAuthoringMcpToolCall("reorganizarWorkspace", {
    operation: "move_entity",
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
  assert.throws(
    () => mapAuthoringMcpToolCall("revisarMicroteoriasDoWorkspace", {
      workspaceId: WORKSPACE_ID
    }),
    (error) => error?.code === "invalid_tool_arguments"
  );
  assert.throws(
    () => mapAuthoringMcpToolCall("revisarMicroteoriasDoWorkspace", {
      workspaceId: WORKSPACE_ID,
      entityPath: ["course-conceptual", "module-conceptual"]
    }),
    (error) => error?.code === "invalid_tool_arguments"
  );
});

test("estrutura incremental aceita defaults canônicos e limita o lote", () => {
  const accepted = mapAuthoringMcpToolCall("criarEstruturaNoWorkspace", {
    requestId: "structure-defaults-0001",
    workspaceId: WORKSPACE_ID,
    expectedRevision: 1,
    parts: [
      {
        entityType: "course",
        id: "course-defaults",
        title: "Curso",
        goal: "Criar o curso."
      },
      {
        entityType: "lesson",
        parentPath: ["course-defaults", "module-defaults"],
        id: "lesson-defaults",
        title: "Lição",
        goal: "Criar a lição.",
        topics: [{
          id: "topic-defaults",
          label: "Conceito",
          kind: "concept"
        }]
      }
    ]
  });
  assert.equal(accepted.body.arguments.parts[0].parentPath, undefined);
  assert.equal(accepted.body.arguments.parts[1].topics[0].checks, undefined);

  assert.throws(
    () => mapAuthoringMcpToolCall("criarEstruturaNoWorkspace", {
      requestId: "structure-limit-0001",
      workspaceId: WORKSPACE_ID,
      expectedRevision: 1,
      parts: Array.from({ length: 41 }, (_, index) => ({
        entityType: "course",
        id: `course-${index}`,
        title: `Curso ${index}`,
        goal: "Exceder o limite."
      }))
    }),
    (error) => error?.code === "invalid_tool_arguments"
  );
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
    entityCount: 5,
    sourceCourseId: null,
    sourceRevisionHash: null,
    publications: [],
    brief: "Revisar as microteorias antes de publicar.",
    createdAt: "2026-07-29T17:00:00.000Z",
    updatedAt: "2026-07-29T18:00:00.000Z",
    idempotent: false,
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
              covers: ["unidade conceitual"],
              checks: ["explica a relação central"],
              errors: ["confundir relação com sequência"],
              resources: ["paragraph", "relation_map"],
              topics: ["topic-unidade"],
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

test("alterações recentes usam cursor de revisão sem snapshots integrais", () => {
  const operation = mapAuthoringMcpToolCall("listarAlteracoesRecentesDoWorkspace", {
    workspaceId: WORKSPACE_ID,
    limit: 25,
    beforeRevision: 76
  });
  assert.equal(operation.method, "GET");
  assert.match(operation.path, /limit=25/u);
  assert.match(operation.path, /beforeRevision=76/u);
});

test("revisões editoriais usam cursor keyset completo e resposta pequena", () => {
  const submittedAt = "2026-07-30T12:34:56.000Z";
  const operation = mapAuthoringMcpToolCall("listarRevisoesEditoriais", {
    view: "queue",
    limit: 25,
    beforeSubmittedAt: submittedAt,
    beforeId: COURSE_ID
  });
  const url = new URL(operation.path, "https://edge.example");
  assert.equal(operation.method, "GET");
  assert.equal(url.pathname, "/v1/catalog/reviews");
  assert.equal(url.searchParams.get("view"), "queue");
  assert.equal(url.searchParams.get("limit"), "25");
  assert.equal(url.searchParams.get("beforeSubmittedAt"), submittedAt);
  assert.equal(url.searchParams.get("beforeId"), COURSE_ID);

  assert.throws(
    () => mapAuthoringMcpToolCall("listarRevisoesEditoriais", {
      beforeSubmittedAt: submittedAt
    }),
    (error) => error?.code === "invalid_tool_arguments"
  );
  assert.throws(
    () => mapAuthoringMcpToolCall("listarRevisoesEditoriais", {
      beforeSubmittedAt: "2026-02-30T12:34:56Z",
      beforeId: COURSE_ID
    }),
    (error) => error?.code === "invalid_tool_arguments"
  );

  const definition = AUTHORING_WORKSPACE_MCP_TOOLS.find(
    (entry) => entry.name === "listarRevisoesEditoriais"
  );
  const validate = compileOutputSchema(definition.outputSchema);
  assert.equal(validate({
    ok: true,
    requestId: null,
    data: {
      view: "queue",
      items: [{
        submissionId: COURSE_ID,
        courseId: WORKSPACE_ID,
        sourceRevisionHash: "a".repeat(64),
        title: "Curso para revisão",
        status: "submitted",
        authorNote: "Avaliar a progressão inicial.",
        reviewerNote: null,
        claimExpiresAt: null,
        submittedAt,
        decidedAt: null,
        updatedAt: submittedAt
      }],
      hasMore: true,
      nextCursor: {
        beforeSubmittedAt: submittedAt,
        beforeId: COURSE_ID
      }
    }
  }), true, JSON.stringify(validate.errors, null, 2));

  const closed = {
    ok: true,
    requestId: null,
    data: {
      view: "mine",
      items: [{
        submissionId: COURSE_ID,
        courseId: WORKSPACE_ID,
        sourceRevisionHash: "b".repeat(64),
        title: "Curso substituído",
        status: "superseded",
        authorNote: null,
        reviewerNote: "Submissão substituída automaticamente por uma revisão mais recente deste curso.",
        claimExpiresAt: null,
        submittedAt,
        decidedAt: submittedAt,
        updatedAt: submittedAt
      }],
      hasMore: false,
      nextCursor: null
    }
  };
  assert.equal(
    validate(closed),
    true,
    JSON.stringify(validate.errors, null, 2)
  );
});

test("artefato privado de submissão não expõe estado conversacional", () => {
  const operation = mapAuthoringMcpToolCall("publicarCursoDoWorkspace", {
    requestId: "publish-submission-artifact-0001",
    workspaceId: WORKSPACE_ID,
    expectedRevision: 3,
    courseId: "course-preview",
    target: "private"
  });
  assert.equal(operation.path, `/v1/workspaces/${WORKSPACE_ID}/publications`);
  assert.equal(Object.hasOwn(operation.body, "completion"), false);
  assert.equal(operation.body.target, "private");

  const definition = authoringMcpToolDefinition("publicarCursoDoWorkspace");
  const validate = compileOutputSchema(definition.outputSchema);
  assert.equal(validate({
    ok: true,
    requestId: "publish-submission-artifact-0001",
    data: {
      workspaceId: WORKSPACE_ID,
      revision: 3,
      courseId: COURSE_ID,
      contentHash: "a".repeat(64),
      target: "private",
      submissionId: null,
      publicationSeq: 4,
      unchanged: true,
      idempotent: false
    }
  }), true, JSON.stringify(validate.errors, null, 2));
});

test("validador MCP aplica condicionais de publicação antes do roteamento", () => {
  const base = {
    requestId: "publish-conditional-0001",
    workspaceId: WORKSPACE_ID,
    expectedRevision: 3,
    courseId: "course-preview",
    target: "catalog"
  };
  for (const invalid of [
    base,
    {
      ...base,
      target: "private",
      collectionId: COURSE_ID
    },
    {
      ...base,
      collectionId: COURSE_ID,
      existingCourseId: COURSE_ID
    },
    {
      ...base,
      collectionId: COURSE_ID,
      expectedContentHash: "a".repeat(64)
    },
    {
      ...base,
      collectionId: COURSE_ID,
      publicationMode: "create"
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
    existingCourseId: COURSE_ID,
    expectedContentHash: "a".repeat(64)
  });
  assert.equal(Object.hasOwn(valid.body, "publicationMode"), false);
  assert.equal(valid.body.existingCourseId, COURSE_ID);
});

test("validador MCP percorre itens aninhados, bounds e date-time RFC 3339", () => {
  assert.throws(
    () => mapAuthoringMcpToolCall("reorganizarWorkspace", {
      operation: "move_entity",
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
    () => mapAuthoringMcpToolCall("reorganizarWorkspace", {
      operation: "move_entity",
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
    () => mapAuthoringMcpToolCall("criarEstruturaNoWorkspace", {
      requestId: "structure-missing-parent-0001",
      workspaceId: WORKSPACE_ID,
      expectedRevision: 1,
      parts: [{
        entityType: "lesson",
        id: "lesson-a",
        title: "Lição A",
        goal: "Ensinar o conceito A."
      }]
    }),
    (error) => error?.code === "invalid_tool_arguments"
      && error?.details?.path === "arguments.parts[0].parentPath"
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
    () => mapAuthoringMcpToolCall("reorganizarWorkspace", {
      operation: "rename_entity",
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
  const metadataBase = {
    requestId: "metadata-workspace-0001",
    workspaceId: WORKSPACE_ID,
    expectedRevision: 1,
    entityType: "module",
    entityPath: ["course-a", "module-a"]
  };
  assert.throws(
    () => mapAuthoringMcpToolCall(
      "atualizarMetadadosDaEntidade",
      metadataBase
    ),
    (error) => error instanceof AuthoringApiError
      && error.code === "invalid_tool_arguments"
  );
  assert.throws(
    () => mapAuthoringMcpToolCall("atualizarMetadadosDaEntidade", {
      ...metadataBase,
      topics: []
    }),
    (error) => error instanceof AuthoringApiError
      && error.code === "invalid_tool_arguments"
  );
  assert.doesNotThrow(
    () => mapAuthoringMcpToolCall("atualizarMetadadosDaEntidade", {
      ...metadataBase,
      entityType: "lesson",
      entityPath: ["course-a", "module-a", "lesson-a"],
      topics: []
    })
  );
  assert.throws(
    () => mapAuthoringMcpToolCall("atualizarMetadadosDaEntidade", {
      ...metadataBase,
      entityType: "microsequence",
      entityPath: ["course-a", "module-a", "lesson-a", "microsequence-a"],
      goal: "Objetivo semanticamente alterado.",
      status: "ready"
    }),
    (error) => error instanceof AuthoringApiError
      && error.code === "invalid_tool_arguments"
  );
});

test("tools/call devolve structuredContent no contrato anunciado", async () => {
  const response = await handler(adapter({
    async listWorkspaces() {
      return {
        items: [{
          workspaceId: WORKSPACE_ID,
          title: "Curso",
          purpose: "",
          workspaceKind: "personal",
          visibility: "private",
          role: "owner",
          revision: 2,
          sourceCourseId: null,
          publicationCount: 0,
          updatedAt: "2026-08-01T12:01:00.000Z",
          createdAt: "2026-08-01T12:00:00.000Z"
        }],
        hasMore: false,
        nextCursor: null
      };
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
  const response = await handler()(request(toolCall("reorganizarWorkspace", {
    operation: "rename_entity",
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
  assert.deepEqual(
    payload.result.structuredContent.error.issues.map(({ path }) => path),
    ["arguments.title"]
  );
  assert.equal(
    payload.result.structuredContent.error.recovery.strategy,
    "correct_and_retry"
  );
  assert.equal(
    payload.result.structuredContent.error.recovery.requestIdMode,
    "new"
  );
});

test("chamada de escrita atravessa o executor interno compartilhado", async () => {
  let received = null;
  const response = await handler(adapter({
    async mutateWorkspace(options) {
      received = options;
      return {
        workspaceId: WORKSPACE_ID,
        title: "Curso revisto",
        revision: 5,
        currentRevision: 5,
        entityCount: 1,
        createdAt: "2026-08-01T12:00:00.000Z",
        updatedAt: "2026-08-01T12:01:00.000Z",
        idempotent: false
      };
    }
  }))(request(toolCall("reorganizarWorkspace", {
    operation: "rename_entity",
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

test("publicação explícita não é requisito de Trilhas e distribui artefatos", () => {
  const definition = AUTHORING_WORKSPACE_MCP_TOOLS.find(
    (entry) => entry.name === "publicarCursoDoWorkspace"
  );
  assert.match(definition.description, /Trilhas.*sem esta operação/u);
  assert.match(definition.description, /private.*submissão editorial/u);
  assert.match(definition.description, /catalog.*Coleções/u);
  assert.equal(Object.hasOwn(definition.inputSchema.properties, "completion"), false);
});
