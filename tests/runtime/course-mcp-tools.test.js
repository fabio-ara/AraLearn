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
const PART_ID = "20000000-0000-4000-8000-000000000002";
const MATERIALIZATION_ID = "30000000-0000-4000-8000-000000000003";
const STEP_ID = "40000000-0000-4000-8000-000000000004";
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

test("mapeia lista, leituras e criação sem identidade indireta", () => {
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
  assert.equal(
    mapAuthoringMcpToolCall("lerCurso", {
      courseId: COURSE_ID,
      view: "study_units",
      expectedRevision: 4,
      scope: { kind: "authoring_part", id: PART_ID },
      anchorStudyUnitId: "unit-a",
      direction: "backward",
      limit: 12,
      maxBytes: 262144
    }).path,
    `/v1/courses/${COURSE_ID}/study-units?expectedRevision=4` +
      `&scopeKind=authoring_part&scopeId=${PART_ID}&anchorStudyUnitId=unit-a` +
      "&direction=backward&limit=12&maxBytes=262144"
  );
  assert.equal(
    mapAuthoringMcpToolCall("lerCurso", {
      courseId: COURSE_ID,
      view: "instructional_plan"
    }).path,
    `/v1/courses/${COURSE_ID}/instructional-plan`
  );
  assert.equal(
    mapAuthoringMcpToolCall("lerCurso", {
      courseId: COURSE_ID,
      view: "part_materialization",
      authoringPartId: PART_ID,
      materializationId: MATERIALIZATION_ID
    }).path,
    `/v1/courses/${COURSE_ID}/authoring-parts/${PART_ID}` +
      `/materializations/${MATERIALIZATION_ID}`
  );

  assert.deepEqual(mapAuthoringMcpToolCall("criarCurso", {
    requestId: REQUEST_ID,
    title: "Curso",
    objective: "Aprender"
  }).body, {
    requestId: REQUEST_ID,
    title: "Curso",
    objective: "Aprender"
  });
});

test("mapeia plano, composição e materialização com cercas CAS explícitas", () => {
  const planCommand = {
    type: "update_plan",
    audience: "Docentes",
    preferredPartCount: { minimum: 7, maximum: 10, origin: "author" }
  };
  const planChange = mapAuthoringMcpToolCall("alterarCurso", {
    requestId: REQUEST_ID,
    courseId: COURSE_ID,
    expectedRevision: 4,
    expectedPlanVersion: 2,
    operation: "update_instructional_plan",
    planCommand
  });
  assert.equal(
    planChange.path,
    `/v1/courses/${COURSE_ID}/instructional-plan/changes`
  );
  assert.deepEqual(planChange.body, {
    requestId: REQUEST_ID,
    expectedCourseRevision: 4,
    expectedPlanVersion: 2,
    command: planCommand
  });

  const upsert = {
    entityType: "module",
    entityId: "module-a",
    parentType: null,
    parentId: null,
    position: 0,
    content: { title: "Módulo" }
  };
  const composition = mapAuthoringMcpToolCall("alterarCurso", {
    requestId: REQUEST_ID,
    courseId: COURSE_ID,
    expectedRevision: 4,
    operation: "commit_course_composition",
    upserts: [upsert],
    deletes: []
  });
  assert.equal(composition.path, `/v1/courses/${COURSE_ID}/composition`);
  assert.deepEqual(composition.body, {
    requestId: REQUEST_ID,
    expectedRevision: 4,
    upserts: [upsert],
    deletes: []
  });

  const materialization = mapAuthoringMcpToolCall("alterarCurso", {
    requestId: REQUEST_ID,
    courseId: COURSE_ID,
    expectedRevision: 4,
    operation: "advance_part_materialization",
    materializationCommand: {
      operation: "start",
      authoringPartId: PART_ID,
      materializationId: MATERIALIZATION_ID,
      expectedMaterializationVersion: 0,
      authoringPartVersion: 2,
      designContext: { audience: "Docentes" },
      steps: [{
        id: STEP_ID,
        position: 0,
        kind: "context_load",
        targetDidacticMicrosequenceId: null,
        productionPosition: null
      }]
    }
  });
  assert.equal(
    materialization.path,
    `/v1/courses/${COURSE_ID}/authoring-parts/${PART_ID}` +
      `/materializations/${MATERIALIZATION_ID}/changes`
  );
  assert.deepEqual(materialization.body, {
    requestId: REQUEST_ID,
    expectedCourseRevision: 4,
    expectedMaterializationVersion: 0,
    operation: "start",
    payload: {
      authoringPartVersion: 2,
      designContext: { audience: "Docentes" },
      steps: [{
        id: STEP_ID,
        position: 0,
        kind: "context_load",
        targetDidacticMicrosequenceId: null,
        productionPosition: null
      }]
    }
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
    () => mapAuthoringMcpToolCall("lerCurso", {
      courseId: COURSE_ID,
      view: "part_materialization",
      authoringPartId: PART_ID
    }),
    (error) => error.code === "invalid_tool_argument"
  );
  assert.throws(
    () => mapAuthoringMcpToolCall("lerCurso", {
      courseId: COURSE_ID,
      view: "outline",
      authoringPartId: PART_ID,
      materializationId: MATERIALIZATION_ID
    }),
    (error) => error.code === "invalid_tool_argument"
  );
  assert.throws(
    () => mapAuthoringMcpToolCall("alterarCurso", {
      requestId: REQUEST_ID,
      courseId: COURSE_ID,
      expectedRevision: 1,
      operation: "commit_course_composition",
      upserts: [],
      deletes: []
    }),
    (error) => error.code === "invalid_tool_argument"
  );
});

test("schema MCP anuncia comandos do plano, Partes e materialização delimitada", () => {
  const schema = COURSE_MCP_TOOLS.find(({ name }) => name === "alterarCurso").inputSchema;
  assert.deepEqual(schema.properties.operation.enum, [
    "update_instructional_plan",
    "commit_course_composition",
    "advance_part_materialization"
  ]);
  assert.equal(schema.properties.planCommand.additionalProperties, false);
  assert.ok(schema.properties.planCommand.properties.type.enum.includes("split_part"));
  assert.ok(schema.properties.planCommand.properties.type.enum.includes("assign_microsequence"));
  assert.equal(schema.properties.planCommand.properties.microsequenceIds.maxItems, 64);
  assert.equal(schema.properties.materializationCommand.properties.steps.maxItems, 64);
  assert.equal(
    schema.properties.materializationCommand.properties.entityChanges.properties.upserts.maxItems,
    64
  );
});

test("schema MCP anuncia leitura retomável somente com as duas identidades", () => {
  const schema = COURSE_MCP_TOOLS.find(({ name }) => name === "lerCurso").inputSchema;
  assert.ok(schema.properties.view.enum.includes("part_materialization"));
  assert.equal(schema.properties.authoringPartId.pattern, schema.properties.courseId.pattern);
  assert.equal(schema.properties.materializationId.pattern, schema.properties.courseId.pattern);
  assert.ok(schema.properties.view.enum.includes("study_units"));
  assert.equal(schema.properties.maxBytes.maximum, 1_500_000);
});

test("schema MCP anuncia posição 1 para Unidade de estudo e 0 para as demais entidades", () => {
  const schema = COURSE_MCP_TOOLS.find(({ name }) => name === "alterarCurso")
    .inputSchema.properties.upserts.items;
  assert.equal(schema.properties.position.minimum, 0);
  assert.deepEqual(schema.allOf, [{
    if: {
      properties: { entityType: { const: "study_unit" } },
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
