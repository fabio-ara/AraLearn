import assert from "node:assert/strict";
import test from "node:test";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

import {
  createAuthoringActionHandler
} from "../../supabase/functions/_shared/aralearn-authoring/actionServer.js";
import {
  ARALEARN_MCP_PROTOCOL_VERSION,
  createAuthoringMcpHandler
} from "../../supabase/functions/_shared/aralearn-authoring/mcpServer.js";
import {
  SupabaseAuthoringAdapter
} from "../../supabase/functions/_shared/aralearn-authoring/supabaseAdapter.js";
import {
  validateMoveCatalogCollectionPayload
} from "../../supabase/functions/_shared/aralearn-authoring/workspaceProtocol.js";
import {
  AUTHORING_WORKSPACE_MCP_TOOLS,
  authoringMcpToolIsAllowed,
  authoringMcpToolsForPrincipal,
  mapAuthoringMcpToolCall
} from "../../supabase/functions/_shared/aralearn-authoring/workspaceMcpTools.js";

const ACTION_ORIGIN = "https://chatgpt.com";
const ACTION_URL = "https://edge.example/functions/v1/aralearn-authoring-action";
const APP_URL = "https://app.example/aralearn/";
const MCP_ORIGIN = "https://client.example";
const MCP_URL = "https://edge.example/functions/v1/aralearn-authoring-mcp";
const AUTHORIZATION_SERVER = "https://project.example/auth/v1";
const OAUTH_TOKEN = "header.oauth-payload.signature";
const ACCEPT = "application/json, text/event-stream";

const ACTOR_ID = "11111111-1111-4111-8111-111111111111";
const SOURCE_COLLECTION_ID = "22222222-2222-4222-8222-222222222222";
const COURSE_ID = "33333333-3333-4333-8333-333333333333";
const CONTENT_HASH = "a".repeat(64);

const MANAGEMENT_TOOLS = Object.freeze([
  "editarCatalogo",
  "retirarDoCatalogo"
]);

function principal(scopes = ["catalog:manage"]) {
  return {
    actorId: ACTOR_ID,
    oauthClientId: "catalog-editor-client",
    authenticationKind: "oauth",
    scopes
  };
}

function privatePrincipal() {
  return principal(["authoring:private:read", "authoring:private:write"]);
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

function toolDefinition(name) {
  const definition = AUTHORING_WORKSPACE_MCP_TOOLS.find(
    (candidate) => candidate.name === name
  );
  assert.ok(definition, `Ferramenta ausente: ${name}`);
  return definition;
}

function inputBranch(name, operation) {
  const branch = toolDefinition(name).inputSchema.oneOf?.find(
    (candidate) => candidate.properties?.operation?.const === operation
  );
  assert.ok(branch, `Operação ausente em ${name}: ${operation}`);
  return branch;
}

function validateSuccessEnvelope(name, envelope) {
  const validate = compileOutputSchema(toolDefinition(name).outputSchema);
  assert.equal(
    validate(envelope),
    true,
    `${name}: ${JSON.stringify(validate.errors, null, 2)}`
  );
}

function createCatalogAdapter(principalValue = principal()) {
  const calls = [];
  const state = {
    createdCollectionId: null,
    collection: null,
    collectionRetired: false,
    course: {
      courseId: COURSE_ID,
      collectionId: SOURCE_COLLECTION_ID,
      position: 0,
      placementRevision: 7,
      contentHash: CONTENT_HASH,
      removed: false
    }
  };

  const adapter = {
    calls,
    state,
    async resolveActionPrincipal(accessTokenHash) {
      assert.match(accessTokenHash, /^[0-9a-f]{64}$/u);
      return principalValue;
    },
    async resolveApplicationPrincipal(accessToken) {
      assert.equal(accessToken, "application-session-token");
      return {
        ...principalValue,
        authenticationKind: "application"
      };
    },
    async resolvePrincipal() {
      return principalValue;
    },
    async listCatalogCollections(options) {
      calls.push({ method: "listCatalogCollections", options });
      return {
        items: [{
          collectionId: SOURCE_COLLECTION_ID,
          contractKey: "concursos-publicos",
          title: "Concursos públicos",
          description: "",
          position: 0,
          status: "active",
          revision: 3,
          courseCount: 1,
          createdAt: "2026-07-30T12:00:00.000Z",
          updatedAt: "2026-07-30T12:00:00.000Z"
        }],
        nextCursor: null
      };
    },
    async createCatalogCollection(options) {
      calls.push({ method: "createCatalogCollection", options });
      assert.equal(options.principal.actorId, ACTOR_ID);
      assert.match(
        options.collectionId,
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu
      );
      state.createdCollectionId = options.collectionId;
      state.collection = {
        collectionId: options.collectionId,
        contractKey: options.contractKey,
        title: options.title,
        description: options.description,
        position: 4,
        revision: 1,
        courseCount: 0
      };
      return {
        status: "created",
        ...state.collection,
        idempotent: false
      };
    },
    async updateCatalogCollection(options) {
      calls.push({ method: "updateCatalogCollection", options });
      assert.equal(options.collectionId, state.createdCollectionId);
      assert.equal(options.expectedRevision, state.collection.revision);
      state.collection.title = options.title ?? state.collection.title;
      state.collection.description = options.description ?? state.collection.description;
      state.collection.revision += 1;
      return {
        status: "updated",
        ...state.collection,
        idempotent: false
      };
    },
    async retireCatalogCollection(options) {
      calls.push({ method: "retireCatalogCollection", options });
      assert.equal(options.collectionId, state.createdCollectionId);
      assert.equal(options.expectedRevision, state.collection.revision);
      assert.equal(options.replacementCollectionId, SOURCE_COLLECTION_ID);
      state.collectionRetired = true;
      state.collection.revision += 1;
      return {
        status: "retired",
        collectionId: state.createdCollectionId,
        replacementCollectionId: options.replacementCollectionId,
        movedCourseCount: 0,
        revision: state.collection.revision,
        idempotent: false
      };
    },
    async moveCatalogCollection(options) {
      calls.push({ method: "moveCatalogCollection", options });
      assert.equal(options.collectionId, state.createdCollectionId);
      assert.equal(options.expectedRevision, state.collection.revision);
      const fromPosition = state.collection.position;
      state.collection.position = options.position;
      state.collection.revision += 1;
      return {
        status: fromPosition === state.collection.position ? "unchanged" : "moved",
        collectionId: state.createdCollectionId,
        fromPosition,
        position: state.collection.position,
        revision: state.collection.revision,
        idempotent: false
      };
    },
    async moveCatalogCourse(options) {
      calls.push({ method: "moveCatalogCourse", options });
      assert.equal(options.courseId, COURSE_ID);
      assert.equal(
        options.expectedPlacementRevision,
        state.course.placementRevision
      );
      const fromCollectionId = state.course.collectionId;
      state.course.collectionId = options.targetCollectionId;
      state.course.position = options.position;
      state.course.placementRevision += 1;
      state.collection.courseCount = 1;
      return {
        status: "moved",
        courseId: COURSE_ID,
        fromCollectionId,
        collectionId: state.course.collectionId,
        position: state.course.position,
        placementRevision: state.course.placementRevision,
        idempotent: false
      };
    },
    async removeCatalogCourse(options) {
      calls.push({ method: "removeCatalogCourse", options });
      assert.equal(options.courseId, COURSE_ID);
      assert.equal(
        options.expectedPlacementRevision,
        state.course.placementRevision
      );
      assert.equal(options.expectedContentHash, state.course.contentHash);
      state.course.removed = true;
      state.collection.courseCount = 0;
      return {
        status: "removed",
        courseId: COURSE_ID,
        collectionId: state.course.collectionId,
        idempotent: false
      };
    }
  };
  return adapter;
}

function actionHandler(adapter) {
  return createAuthoringActionHandler({
    adapter,
    allowedOrigins: new Set([ACTION_ORIGIN]),
    actionBaseUrl: ACTION_URL,
    publicAppUrl: APP_URL
  });
}

function actionRequest(name, argumentsValue) {
  return new Request(`${ACTION_URL}/${name}`, {
    method: "POST",
    headers: {
      Authorization: "Bearer action-oauth-token",
      "Content-Type": "application/json",
      Origin: ACTION_ORIGIN
    },
    body: JSON.stringify(argumentsValue)
  });
}

function applicationRequest(name, argumentsValue) {
  return new Request(`${ACTION_URL}/app/${name}`, {
    method: "POST",
    headers: {
      Authorization: "Bearer application-session-token",
      "Content-Type": "application/json",
      Origin: ACTION_ORIGIN
    },
    body: JSON.stringify(argumentsValue)
  });
}

function mcpHandler(adapter) {
  return createAuthoringMcpHandler({
    adapter,
    allowedOrigins: new Set([MCP_ORIGIN]),
    resourceUrl: MCP_URL,
    authorizationServer: AUTHORIZATION_SERVER
  });
}

function mcpRequest(name, argumentsValue, id = 1) {
  return new Request(MCP_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OAUTH_TOKEN}`,
      Origin: MCP_ORIGIN,
      Accept: ACCEPT,
      "Content-Type": "application/json",
      "MCP-Protocol-Version": ARALEARN_MCP_PROTOCOL_VERSION
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id,
      method: "tools/call",
      params: { name, arguments: argumentsValue }
    })
  });
}

function invoker(transport, adapter) {
  let id = 0;
  if (transport === "action" || transport === "app") {
    const handle = actionHandler(adapter);
    return async (name, argumentsValue) => {
      const response = await handle(
        transport === "app"
          ? applicationRequest(name, argumentsValue)
          : actionRequest(name, argumentsValue)
      );
      const envelope = await response.json();
      assert.equal(response.status, 200, JSON.stringify(envelope));
      assert.equal(envelope.ok, true);
      validateSuccessEnvelope(name, envelope);
      return envelope;
    };
  }
  const handle = mcpHandler(adapter);
  return async (name, argumentsValue) => {
    id += 1;
    const response = await handle(mcpRequest(name, argumentsValue, id));
    const payload = await response.json();
    assert.equal(response.status, 200);
    assert.equal(payload.result.isError, false, JSON.stringify(payload));
    const envelope = payload.result.structuredContent;
    validateSuccessEnvelope(name, envelope);
    return envelope;
  };
}

async function runCatalogJourney(transport) {
  const adapter = createCatalogAdapter();
  const call = invoker(transport, adapter);

  const created = await call("editarCatalogo", {
    operation: "create_collection",
    requestId: `${transport}-catalog-create-0001`,
    contractKey: `ciencias-${transport}`,
    title: "Ciências",
    description: "Coleção de ciências naturais."
  });
  const collectionId = created.data.collectionId;

  const updated = await call("editarCatalogo", {
    operation: "update_collection",
    requestId: `${transport}-catalog-update-0001`,
    collectionId,
    expectedRevision: 1,
    title: "Ciências da Natureza",
    description: "Coleção revista."
  });
  assert.equal(updated.data.revision, 2);

  const movedCollection = await call("editarCatalogo", {
    operation: "move_collection",
    requestId: `${transport}-catalog-move-collection-0001`,
    collectionId,
    expectedRevision: 2,
    position: 0
  });
  assert.equal(movedCollection.data.fromPosition, 4);
  assert.equal(movedCollection.data.position, 0);
  assert.equal(movedCollection.data.revision, 3);

  const moved = await call("editarCatalogo", {
    operation: "move_course",
    requestId: `${transport}-catalog-move-0001`,
    courseId: COURSE_ID,
    expectedPlacementRevision: 7,
    targetCollectionId: collectionId,
    position: 0
  });
  assert.equal(moved.data.fromCollectionId, SOURCE_COLLECTION_ID);
  assert.equal(moved.data.placementRevision, 8);

  const reordered = await call("editarCatalogo", {
    operation: "move_course",
    requestId: `${transport}-catalog-reorder-0001`,
    courseId: COURSE_ID,
    expectedPlacementRevision: 8,
    targetCollectionId: collectionId,
    position: 2
  });
  assert.equal(reordered.data.fromCollectionId, collectionId);
  assert.equal(reordered.data.position, 2);
  assert.equal(reordered.data.placementRevision, 9);

  const removed = await call("retirarDoCatalogo", {
    operation: "remove_course",
    requestId: `${transport}-catalog-remove-0001`,
    courseId: COURSE_ID,
    expectedPlacementRevision: 9,
    expectedContentHash: CONTENT_HASH
  });
  assert.equal(removed.data.collectionId, collectionId);

  const retired = await call("retirarDoCatalogo", {
    operation: "retire_collection",
    requestId: `${transport}-catalog-retire-0001`,
    collectionId,
    expectedRevision: 3,
    replacementCollectionId: SOURCE_COLLECTION_ID
  });
  assert.equal(retired.data.status, "retired");
  assert.equal(retired.data.revision, 4);

  assert.deepEqual(adapter.calls.map(({ method }) => method), [
    "createCatalogCollection",
    "updateCatalogCollection",
    "moveCatalogCollection",
    "moveCatalogCourse",
    "moveCatalogCourse",
    "removeCatalogCourse",
    "retireCatalogCollection"
  ]);
  assert.equal(adapter.calls[1].options.expectedRevision, 1);
  assert.equal(adapter.calls[2].options.expectedRevision, 2);
  assert.equal(adapter.calls[2].options.position, 0);
  assert.deepEqual(
    adapter.calls.slice(3, 6).map(({ options }) =>
      options.expectedPlacementRevision
    ),
    [7, 8, 9]
  );
  assert.equal(adapter.calls[5].options.expectedContentHash, CONTENT_HASH);
  assert.equal(adapter.calls[6].options.expectedRevision, 3);
  assert.equal(adapter.state.course.removed, true);
  assert.equal(adapter.state.collectionRetired, true);
}

test("somente catalog:manage anuncia as ferramentas administrativas agrupadas", () => {
  const editorNames = authoringMcpToolsForPrincipal(principal())
    .map(({ name }) => name);
  const privateNames = authoringMcpToolsForPrincipal(privatePrincipal())
    .map(({ name }) => name);
  const publisherNames = authoringMcpToolsForPrincipal(
    principal(["catalog:publish"])
  ).map(({ name }) => name);

  assert.deepEqual(editorNames.sort(), [...MANAGEMENT_TOOLS].sort());
  for (const name of MANAGEMENT_TOOLS) {
    assert.equal(authoringMcpToolIsAllowed(name, principal()), true);
    assert.equal(authoringMcpToolIsAllowed(name, privatePrincipal()), false);
    assert.equal(privateNames.includes(name), false);
    assert.equal(publisherNames.includes(name), false);

    const definition = toolDefinition(name);
    assert.ok(
      definition.inputSchema.oneOf.every(
        (branch) => branch.additionalProperties === false
      )
    );
    assert.doesNotThrow(() => compileOutputSchema(definition.outputSchema));
  }
  assert.equal(
    toolDefinition("retirarDoCatalogo").annotations.destructiveHint,
    true
  );
  assert.equal(toolDefinition("editarCatalogo").annotations.destructiveHint, true);
  assert.equal(
    toolDefinition("editarCatalogo")
      ._meta["aralearn/actionConsequentialHint"],
    false
  );
  const moveCollection = inputBranch("editarCatalogo", "move_collection");
  assert.deepEqual([...moveCollection.required].sort(), [
    "collectionId", "expectedRevision", "operation", "position", "requestId"
  ]);
  assert.equal(moveCollection.properties.expectedRevision.minimum, 1);
  assert.equal(moveCollection.properties.position.minimum, 0);
});

test("conta editorial pode solicitar coleções retiradas sem expor catálogo ao autor privado", () => {
  const branch = inputBranch("consultarCatalogo", "list_collections");
  assert.deepEqual(branch.properties.includeRetired, {
    type: "boolean",
    default: false,
    description: "Inclui coleções retiradas somente para quem pode publicar no catálogo."
  });
  assert.equal(
    authoringMcpToolsForPrincipal(privatePrincipal())
      .some(({ name }) => name === "consultarCatalogo"),
    false
  );
  assert.equal(
    authoringMcpToolsForPrincipal(
      principal(["catalog:read", "catalog:publish"])
    ).some(({ name }) => name === "consultarCatalogo"),
    true
  );

  const operation = mapAuthoringMcpToolCall("consultarCatalogo", {
    operation: "list_collections",
    limit: 20,
    includeRetired: true
  });
  assert.equal(operation.method, "GET");
  assert.equal(
    operation.path,
    "/v1/catalog/collections?limit=20&includeRetired=true"
  );
});

test("mapeamento mantém rotas, CAS e hash sem campos implícitos", () => {
  const collectionId = "44444444-4444-4444-8444-444444444444";
  const replacementCollectionId = "55555555-5555-4555-8555-555555555555";
  const fixtures = [
    [
      "editarCatalogo",
      {
        operation: "create_collection",
        requestId: "map-catalog-create-0001",
        contractKey: "linguagens",
        title: "Linguagens",
        description: "Área de linguagens."
      },
      "/v1/catalog/manage/collections"
    ],
    [
      "editarCatalogo",
      {
        operation: "update_collection",
        requestId: "map-catalog-update-0001",
        collectionId,
        expectedRevision: 3,
        title: "Linguagens e códigos",
        description: "Descrição revista."
      },
      `/v1/catalog/manage/collections/${collectionId}/update`
    ],
    [
      "editarCatalogo",
      {
        operation: "move_collection",
        requestId: "map-catalog-move-collection-0001",
        collectionId,
        expectedRevision: 4,
        position: 1
      },
      `/v1/catalog/manage/collections/${collectionId}/move`
    ],
    [
      "retirarDoCatalogo",
      {
        operation: "retire_collection",
        requestId: "map-catalog-retire-0001",
        collectionId,
        expectedRevision: 4,
        replacementCollectionId
      },
      `/v1/catalog/manage/collections/${collectionId}/retire`
    ],
    [
      "editarCatalogo",
      {
        operation: "move_course",
        requestId: "map-catalog-move-0001",
        courseId: COURSE_ID,
        expectedPlacementRevision: 5,
        targetCollectionId: collectionId,
        position: 2
      },
      `/v1/catalog/manage/courses/${COURSE_ID}/move`
    ],
    [
      "retirarDoCatalogo",
      {
        operation: "remove_course",
        requestId: "map-catalog-remove-0001",
        courseId: COURSE_ID,
        expectedPlacementRevision: 6,
        expectedContentHash: CONTENT_HASH
      },
      `/v1/catalog/manage/courses/${COURSE_ID}/remove`
    ]
  ];

  for (const [name, argumentsValue, path] of fixtures) {
    const operation = mapAuthoringMcpToolCall(name, argumentsValue);
    assert.equal(operation.method, "POST");
    assert.equal(operation.path, path);
    assert.equal(operation.requestId, argumentsValue.requestId);
    assert.equal(operation.body.requestId, argumentsValue.requestId);
    assert.equal(Object.hasOwn(operation.body, "collectionId"), false);
    assert.equal(Object.hasOwn(operation.body, "courseId"), false);
    assert.throws(
      () => mapAuthoringMcpToolCall(name, {
        ...argumentsValue,
        legacySnapshot: {}
      }),
      (error) => error?.code === "invalid_tool_arguments"
        && error?.details?.field === "legacySnapshot"
    );
  }

  assert.equal(
    mapAuthoringMcpToolCall(
      "editarCatalogo",
      fixtures[1][1]
    ).body.expectedRevision,
    3
  );
  assert.equal(
    mapAuthoringMcpToolCall("editarCatalogo", fixtures[2][1])
      .body.expectedRevision,
    4
  );
  assert.equal(
    mapAuthoringMcpToolCall("editarCatalogo", fixtures[4][1])
      .body.expectedPlacementRevision,
    5
  );
  assert.equal(
    mapAuthoringMcpToolCall("retirarDoCatalogo", fixtures[5][1])
      .body.expectedContentHash,
    CONTENT_HASH
  );

  for (const [name, argumentsValue] of [
    [
      "editarCatalogo",
      { ...fixtures[1][1], expectedRevision: 0 }
    ],
    [
      "editarCatalogo",
      { ...fixtures[2][1], position: -1 }
    ],
    [
      "editarCatalogo",
      { ...fixtures[4][1], expectedPlacementRevision: 0 }
    ],
    [
      "retirarDoCatalogo",
      { ...fixtures[5][1], expectedContentHash: "hash-invalido" }
    ]
  ]) {
    assert.throws(
      () => mapAuthoringMcpToolCall(name, argumentsValue),
      (error) => error?.code === "invalid_tool_arguments"
    );
  }
});

test("Action, aplicativo e MCP executam criação, edição, movimento, reordenação e retirada", async (t) => {
  await t.test("Action", () => runCatalogJourney("action"));
  await t.test("Aplicativo", () => runCatalogJourney("app"));
  await t.test("MCP", () => runCatalogJourney("mcp"));
});

test("aplicativo consulta o catálogo pelo mesmo contrato e preserva a identidade da sessão", async () => {
  const adapter = createCatalogAdapter(principal(["catalog:read", "catalog:manage"]));
  const response = await invoker("app", adapter)("consultarCatalogo", {
    operation: "list_collections",
    limit: 20
  });

  assert.equal(response.data.items[0].collectionId, SOURCE_COLLECTION_ID);
  assert.equal(adapter.calls.length, 1);
  assert.equal(adapter.calls[0].method, "listCatalogCollections");
  assert.equal(
    adapter.calls[0].options.principal.authenticationKind,
    "application"
  );
});

test("adaptador envia a reordenação estreita para o RPC v5", async () => {
  const calls = [];
  const adapter = new SupabaseAuthoringAdapter({
    supabaseUrl: "https://example.supabase.co",
    serverApiKey: "service-role-test",
    publishableKey: "publishable-test",
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return new Response(JSON.stringify([{
        status: "moved",
        collectionId: SOURCE_COLLECTION_ID,
        fromPosition: 2,
        position: 0,
        revision: 4,
        idempotent: false
      }]), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }
  });

  const result = await adapter.moveCatalogCollection({
    principal: principal(),
    collectionId: SOURCE_COLLECTION_ID,
    requestId: "adapter-catalog-move-collection-0001",
    expectedRevision: 3,
    position: 0
  });

  assert.equal(result.status, "moved");
  assert.match(calls[0].url, /\/rest\/v1\/rpc\/move_catalog_collection_v5$/u);
  assert.deepEqual(JSON.parse(calls[0].options.body), {
    p_actor_id: ACTOR_ID,
    p_collection_id: SOURCE_COLLECTION_ID,
    p_request_id: "adapter-catalog-move-collection-0001",
    p_expected_revision: 3,
    p_position: 0
  });
});

test("Action e MCP preservam a proteção semântica da coleção Outros", async () => {
  const calls = [];
  const adapter = new SupabaseAuthoringAdapter({
    supabaseUrl: "https://example.supabase.co",
    serverApiKey: "service-role-test",
    publishableKey: "publishable-test",
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return new Response(JSON.stringify({
        code: "23514",
        message: "A coleção estrutural deve permanecer como Outros cursos.",
        details: JSON.stringify({
          rule: "catalog_structural_collection_semantics",
          path: "collection"
        })
      }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }
  });
  adapter.resolveActionPrincipal = async () => principal();
  adapter.resolvePrincipal = async () => principal();
  const argumentsValue = {
    operation: "update_collection",
    requestId: "rename-structural-collection-0001",
    collectionId: SOURCE_COLLECTION_ID,
    expectedRevision: 3,
    title: "Diversos"
  };

  const actionResponse = await actionHandler(adapter)(
    actionRequest("editarCatalogo", argumentsValue)
  );
  const actionPayload = await actionResponse.json();
  assert.equal(actionResponse.status, 422);
  assert.equal(actionPayload.error.code, "invalid_command");
  assert.equal(
    actionPayload.error.details.rule,
    "catalog_structural_collection_semantics"
  );

  const mcpResponse = await mcpHandler(adapter)(
    mcpRequest("editarCatalogo", argumentsValue)
  );
  const mcpPayload = await mcpResponse.json();
  assert.equal(mcpResponse.status, 200);
  assert.equal(mcpPayload.result.isError, true);
  assert.deepEqual(
    mcpPayload.result.structuredContent.error,
    actionPayload.error
  );
  assert.equal(calls.length, 2);
  assert.ok(calls.every(({ url }) =>
    /\/rest\/v1\/rpc\/update_catalog_collection_v5$/u.test(url)
  ));
});

test("movimento de coleção recusa position ausente ou null na Action e no aplicativo", async () => {
  const adapter = createCatalogAdapter();
  const base = {
    operation: "move_collection",
    requestId: "missing-catalog-position-0001",
    collectionId: SOURCE_COLLECTION_ID,
    expectedRevision: 3
  };

  for (const [transport, makeRequest] of [
    ["Action", actionRequest],
    ["Aplicativo", applicationRequest]
  ]) {
    for (const [variant, argumentsValue] of [
      ["ausente", base],
      ["null", { ...base, position: null }]
    ]) {
      const response = await actionHandler(adapter)(
        makeRequest("editarCatalogo", argumentsValue)
      );
      const payload = await response.json();
      assert.equal(response.status, 422, `${transport}: ${variant}`);
      assert.equal(
        payload.error.code,
        "invalid_tool_arguments",
        `${transport}: ${variant}`
      );
    }
  }
  for (const payload of [
    { requestId: base.requestId, expectedRevision: 3 },
    { requestId: base.requestId, expectedRevision: 3, position: null }
  ]) {
    assert.throws(
      () => validateMoveCatalogCollectionPayload(payload),
      (error) => error?.code === "invalid_workspace_position"
        && error?.details?.field === "position"
    );
  }
  assert.deepEqual(adapter.calls, []);
});

test("conta privada e campos extras falham antes de chamar o adapter", async () => {
  const privateAdapter = createCatalogAdapter(privatePrincipal());
  const argumentsValue = {
    requestId: "private-catalog-create-0001",
    contractKey: "privada",
    title: "Coleção indevida"
  };

  const actionResponse = await actionHandler(privateAdapter)(
    actionRequest("editarCatalogo", {
      operation: "create_collection",
      ...argumentsValue
    })
  );
  const actionPayload = await actionResponse.json();
  assert.equal(actionResponse.status, 403);
  assert.equal(actionPayload.error.code, "insufficient_scope");

  const applicationMoveResponse = await actionHandler(privateAdapter)(
    applicationRequest("editarCatalogo", {
      operation: "move_collection",
      requestId: "private-catalog-move-collection-0001",
      collectionId: SOURCE_COLLECTION_ID,
      expectedRevision: 1,
      position: 0
    })
  );
  const applicationMovePayload = await applicationMoveResponse.json();
  assert.equal(applicationMoveResponse.status, 403);
  assert.equal(applicationMovePayload.error.code, "insufficient_scope");

  const mcpResponse = await mcpHandler(privateAdapter)(
    mcpRequest("editarCatalogo", {
      operation: "create_collection",
      ...argumentsValue
    })
  );
  const mcpPayload = await mcpResponse.json();
  assert.equal(mcpResponse.status, 200);
  assert.equal(mcpPayload.result.isError, true);
  assert.equal(
    mcpPayload.result.structuredContent.error.code,
    "insufficient_scope"
  );
  assert.deepEqual(privateAdapter.calls, []);

  const editorAdapter = createCatalogAdapter();
  const expanded = {
    operation: "create_collection",
    ...argumentsValue,
    unauthorizedField: true
  };
  const invalidAction = await actionHandler(editorAdapter)(
    actionRequest("editarCatalogo", expanded)
  );
  const invalidActionPayload = await invalidAction.json();
  assert.equal(invalidAction.status, 422);
  assert.equal(invalidActionPayload.error.code, "invalid_tool_arguments");

  const invalidMcp = await mcpHandler(editorAdapter)(
    mcpRequest("editarCatalogo", expanded)
  );
  const invalidMcpPayload = await invalidMcp.json();
  assert.equal(invalidMcp.status, 200);
  assert.equal(invalidMcpPayload.result.isError, true);
  assert.equal(
    invalidMcpPayload.result.structuredContent.error.code,
    "invalid_tool_arguments"
  );
  assert.deepEqual(editorAdapter.calls, []);
});
