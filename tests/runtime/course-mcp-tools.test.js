import test from "node:test";
import assert from "node:assert/strict";

import {
  COURSE_MCP_TOOLS,
  authoringMcpToolIsAllowed,
  authoringMcpToolsForPrincipal,
  mapAuthoringMcpToolCall,
  validateAuthoringMcpToolOutput
} from "../../supabase/functions/_shared/aralearn-authoring/courseMcpTools.js";

const COURSE_ID = "10000000-0000-4000-8000-000000000001";
const REQUEST_ID = "request-course-0001";

test("registro expõe somente ferramentas centradas no Curso e nos componentes", () => {
  assert.deepEqual(COURSE_MCP_TOOLS.map(({ name }) => name), [
    "listarCursos",
    "lerCurso",
    "criarCurso",
    "alterarCurso",
    "gerirPessoas",
    "consultarComponentesDidaticos"
  ]);
  const serialized = JSON.stringify(COURSE_MCP_TOOLS);
  assert.doesNotMatch(serialized, /workspace|trilha|coleç|publicaç/iu);
  assert.equal(
    COURSE_MCP_TOOLS.find(({ name }) => name === "criarCurso").annotations.destructiveHint,
    false
  );
  assert.equal(
    COURSE_MCP_TOOLS.find(({ name }) => name === "alterarCurso").annotations.destructiveHint,
    true
  );
});

test("leitura exige identidade e escrita também exige escopo", () => {
  const reader = { actorId: COURSE_ID, scopes: ["authoring:read"] };
  assert.equal(authoringMcpToolIsAllowed("listarCursos", reader), true);
  assert.equal(authoringMcpToolIsAllowed("criarCurso", reader), false);
  assert.deepEqual(
    authoringMcpToolsForPrincipal(reader).map(({ name }) => name),
    ["listarCursos", "lerCurso", "consultarComponentesDidaticos"]
  );
  assert.equal(authoringMcpToolIsAllowed("criarCurso", {
    actorId: COURSE_ID,
    scopes: ["authoring:write"]
  }), true);
  for (const substitutedScope of ["authoring:private:write", "*"]) {
    const principal = { actorId: COURSE_ID, scopes: [substitutedScope] };
    assert.equal(authoringMcpToolIsAllowed("criarCurso", principal), false);
    assert.deepEqual(
      authoringMcpToolsForPrincipal(principal).map(({ name }) => name),
      ["listarCursos", "lerCurso", "consultarComponentesDidaticos"]
    );
  }
});

test("mapeia lista, leitura, criação e alteração sem identidade indireta", () => {
  assert.deepEqual(mapAuthoringMcpToolCall("listarCursos", {
    query: "redes",
    limit: 12,
    cursor: {
      beforeUpdatedAt: "2026-08-17T10:00:00Z",
      beforeId: COURSE_ID
    }
  }), {
    kind: "route",
    method: "GET",
    path: `/v1/courses?query=redes&limit=12&beforeUpdatedAt=2026-08-17T10%3A00%3A00Z&beforeId=${COURSE_ID}`,
    requestId: null,
    body: null
  });

  assert.equal(
    mapAuthoringMcpToolCall("lerCurso", { courseId: COURSE_ID }).path,
    `/v1/courses/${COURSE_ID}?view=outline`
  );
  assert.equal(
    mapAuthoringMcpToolCall("lerCurso", {
      courseId: COURSE_ID,
      view: "entities",
      expectedRevision: 4,
      limit: 25,
      cursor: { entityType: "microsequence", entityId: "micro-a" }
    }).path,
    `/v1/courses/${COURSE_ID}/entities?expectedRevision=4&limit=25` +
      "&afterEntityType=microsequence&afterEntityId=micro-a"
  );

  assert.deepEqual(mapAuthoringMcpToolCall("criarCurso", {
    requestId: REQUEST_ID,
    title: "Curso",
    goal: "Aprender"
  }).body, {
    requestId: REQUEST_ID,
    title: "Curso",
    goal: "Aprender",
    brief: ""
  });

  const change = mapAuthoringMcpToolCall("alterarCurso", {
    requestId: REQUEST_ID,
    courseId: COURSE_ID,
    expectedRevision: 2,
    operation: "update_metadata",
    title: "Novo título"
  });
  assert.equal(change.path, `/v1/courses/${COURSE_ID}/changes`);
  assert.deepEqual(change.body, {
    requestId: REQUEST_ID,
    expectedRevision: 2,
    operation: "update_metadata",
    title: "Novo título"
  });
});

test("rejeita argumentos desconhecidos e alteração vazia", () => {
  assert.throws(
    () => mapAuthoringMcpToolCall("lerCurso", {
      courseId: COURSE_ID,
      view: "entities"
    }),
    (error) => error.code === "invalid_tool_argument"
  );
  assert.throws(
    () => mapAuthoringMcpToolCall("lerCurso", {
      courseId: COURSE_ID,
      workspaceId: COURSE_ID
    }),
    (error) => error.code === "unknown_tool_argument"
  );
  assert.throws(
    () => mapAuthoringMcpToolCall("alterarCurso", {
      requestId: REQUEST_ID,
      courseId: COURSE_ID,
      expectedRevision: 1,
      operation: "commit_entities",
      upserts: [],
      deletes: []
    }),
    (error) => error.code === "invalid_tool_argument"
  );
});

test("estado autoral tem forma exata e limites idênticos ao banco", () => {
  const state = {
    version: 1,
    parts: [{ id: "parte-1" }],
    decisions: [{ id: "decisao-1" }],
    mandate: null
  };
  const mapped = mapAuthoringMcpToolCall("alterarCurso", {
    requestId: REQUEST_ID,
    courseId: COURSE_ID,
    expectedRevision: 2,
    operation: "update_metadata",
    authoringState: state
  });
  assert.deepEqual(mapped.body.authoringState, state);

  for (const invalidState of [
    {},
    { ...state, extra: true },
    { ...state, parts: Array.from({ length: 65 }, () => ({})) },
    { ...state, decisions: Array.from({ length: 513 }, () => ({})) }
  ]) {
    assert.throws(
      () => mapAuthoringMcpToolCall("alterarCurso", {
        requestId: REQUEST_ID,
        courseId: COURSE_ID,
        expectedRevision: 2,
        operation: "update_metadata",
        authoringState: invalidState
      }),
      (error) => error.code === "invalid_tool_argument"
    );
  }

  const schema = COURSE_MCP_TOOLS.find(({ name }) => name === "alterarCurso").inputSchema;
  assert.deepEqual(schema.properties.authoringState.required, [
    "version", "parts", "decisions", "mandate"
  ]);
  assert.equal(schema.properties.authoringState.additionalProperties, false);
  assert.equal(schema.properties.authoringState.properties.parts.maxItems, 64);
  assert.equal(schema.properties.authoringState.properties.decisions.maxItems, 512);
});

test("schema MCP anuncia posição 1 para card e 0 para as demais entidades", () => {
  const schema = COURSE_MCP_TOOLS.find(({ name }) => name === "alterarCurso")
    .inputSchema.properties.upserts.items;
  assert.equal(schema.properties.position.minimum, 0);
  assert.deepEqual(schema.allOf, [{
    if: {
      properties: { entityType: { const: "card" } },
      required: ["entityType"]
    },
    then: { properties: { position: { minimum: 1 } } }
  }]);
});

test("perfil e acesso direto ao Estudo usam uma única ferramenta sem diretório", () => {
  assert.deepEqual(mapAuthoringMcpToolCall("gerirPessoas", {
    operation: "read_profile"
  }), {
    kind: "route",
    method: "GET",
    path: "/v1/profile",
    requestId: null,
    body: null
  });
  assert.deepEqual(mapAuthoringMcpToolCall("gerirPessoas", {
    operation: "update_profile",
    displayName: "Pesquisadora",
    avatarObjectKey: `${COURSE_ID}/20000000-0000-4000-8000-000000000002.webp`
  }).body, {
    displayName: "Pesquisadora",
    avatarObjectKey: `${COURSE_ID}/20000000-0000-4000-8000-000000000002.webp`
  });
  assert.equal(mapAuthoringMcpToolCall("gerirPessoas", {
    operation: "list_access",
    courseId: COURSE_ID
  }).path, `/v1/courses/${COURSE_ID}/access`);
  assert.deepEqual(mapAuthoringMcpToolCall("gerirPessoas", {
    operation: "grant_access",
    requestId: REQUEST_ID,
    courseId: COURSE_ID,
    email: "Pessoa@Example.com",
    confirmed: true
  }).body, {
    requestId: REQUEST_ID,
    email: "pessoa@example.com",
    confirmed: true
  });
  assert.equal(mapAuthoringMcpToolCall("gerirPessoas", {
    operation: "revoke_access",
    requestId: REQUEST_ID,
    courseId: COURSE_ID,
    userId: "20000000-0000-4000-8000-000000000002",
    confirmed: true
  }).path, `/v1/courses/${COURSE_ID}/access/20000000-0000-4000-8000-000000000002`);

  assert.throws(
    () => mapAuthoringMcpToolCall("gerirPessoas", {
      operation: "grant_access",
      requestId: REQUEST_ID,
      courseId: COURSE_ID,
      email: "pessoa@example.com",
      confirmed: false
    }),
    (error) => error.code === "access_confirmation_required"
  );
});

test("valida envelope de saída e limita payload", () => {
  const envelope = { ok: true, requestId: null, data: { items: [] } };
  assert.equal(validateAuthoringMcpToolOutput("listarCursos", envelope), envelope);
  assert.throws(
    () => validateAuthoringMcpToolOutput("listarCursos", { ok: false, data: null }),
    /contrato/u
  );
});
