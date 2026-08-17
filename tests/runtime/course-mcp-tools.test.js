import test from "node:test";
import assert from "node:assert/strict";
import Ajv2020 from "ajv/dist/2020.js";

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
      view: "course_design",
      scope: { kind: "lesson", ref: "lesson-a" },
      limit: 16,
      cursor: "micro-a"
    }).path,
    `/v1/courses/${COURSE_ID}/course-design?scopeKind=lesson&scopeRef=lesson-a` +
      "&limit=16&cursor=micro-a"
  );
  assert.equal(
    mapAuthoringMcpToolCall("lerCurso", {
      courseId: COURSE_ID,
      view: "course_sources",
      expectedRevision: 4,
      mode: "source",
      sourceId: "source-a",
      cursor: "YWZ0ZXI="
    }).path,
    `/v1/courses/${COURSE_ID}/sources?expectedRevision=4&mode=source` +
      "&sourceId=source-a&cursor=YWZ0ZXI%3D&limit=10"
  );
  assert.equal(
    mapAuthoringMcpToolCall("lerCurso", {
      courseId: COURSE_ID,
      view: "course_sources",
      expectedRevision: 4,
      mode: "source",
      sourceId: "source-a",
      targetKind: "study_unit",
      targetId: "unit-a"
    }).path,
    `/v1/courses/${COURSE_ID}/sources?expectedRevision=4&mode=source` +
      "&sourceId=source-a&targetKind=study_unit&targetId=unit-a&limit=10"
  );
  const astralTargetId = "🔎".repeat(240);
  assert.equal(
    mapAuthoringMcpToolCall("lerCurso", {
      courseId: COURSE_ID,
      view: "course_sources",
      expectedRevision: 4,
      mode: "target",
      targetKind: "study_unit",
      targetId: astralTargetId
    }).path,
    `/v1/courses/${COURSE_ID}/sources?expectedRevision=4&mode=target` +
      `&targetKind=study_unit&targetId=${encodeURIComponent(astralTargetId)}&limit=10`
  );
  assert.throws(
    () => mapAuthoringMcpToolCall("lerCurso", {
      courseId: COURSE_ID,
      view: "course_sources",
      expectedRevision: 4,
      mode: "target",
      targetKind: "study_unit",
      targetId: "🔎".repeat(241)
    }),
    (error) => error.code === "invalid_tool_argument" &&
      error.details?.field === "targetId"
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

  const designCommand = {
    type: "set_target_plan_items",
    scope: { kind: "didactic_microsequence", ref: "micro-a" },
    instructionalAnalysisUnitIds: [PART_ID],
    evidenceRequirementIds: [STEP_ID]
  };
  const designChange = mapAuthoringMcpToolCall("alterarCurso", {
    requestId: REQUEST_ID,
    courseId: COURSE_ID,
    expectedRevision: 4,
    operation: "update_course_design",
    designCommand
  });
  assert.equal(designChange.path, `/v1/courses/${COURSE_ID}/course-design/changes`);
  assert.deepEqual(designChange.body, {
    requestId: REQUEST_ID,
    expectedCourseRevision: 4,
    command: designCommand
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
    deletes: [],
    sourceAttributionApplications: []
  });
  assert.equal(composition.path, `/v1/courses/${COURSE_ID}/composition`);
  assert.deepEqual(composition.body, {
    requestId: REQUEST_ID,
    expectedRevision: 4,
    upserts: [upsert],
    deletes: [],
    sourceAttributionApplications: []
  });

  const sourceCommand = {
    type: "set_target_sources",
    targetKind: "study_unit",
    targetId: "unit-a",
    expectedTargetVersion: 3,
    sourceLinks: [{
      sourceId: "source-a",
      sourceRevision: 2,
      relation: "quoted_from",
      anchors: [{ anchorId: "anchor-a", anchorRevision: 1 }]
    }]
  };
  assert.deepEqual(mapAuthoringMcpToolCall("alterarCurso", {
    requestId: REQUEST_ID,
    courseId: COURSE_ID,
    expectedRevision: 4,
    operation: "update_course_sources",
    sourceCommand
  }), {
    kind: "route",
    method: "POST",
    path: `/v1/courses/${COURSE_ID}/sources/changes`,
    requestId: REQUEST_ID,
    body: {
      requestId: REQUEST_ID,
      expectedCourseRevision: 4,
      command: sourceCommand
    }
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

test("mapeamento MCP limita comando de Fontes a 196608 bytes", () => {
  const base = {
    requestId: REQUEST_ID,
    courseId: COURSE_ID,
    expectedRevision: 4,
    operation: "update_course_sources"
  };
  const overhead = new TextEncoder().encode(JSON.stringify({ padding: "" })).byteLength;
  const atLimit = { padding: "x".repeat(196_608 - overhead) };
  assert.equal(
    new TextEncoder().encode(JSON.stringify(atLimit)).byteLength,
    196_608
  );
  assert.deepEqual(
    mapAuthoringMcpToolCall("alterarCurso", { ...base, sourceCommand: atLimit }).body.command,
    atLimit
  );
  assert.throws(
    () => mapAuthoringMcpToolCall("alterarCurso", {
      ...base,
      sourceCommand: { padding: `${atLimit.padding}x` }
    }),
    (error) => error.code === "invalid_tool_argument" &&
      error.details?.field === "sourceCommand"
  );
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
    "update_course_design",
    "update_course_sources",
    "commit_course_composition",
    "advance_part_materialization"
  ]);
  assert.equal(schema.properties.planCommand.additionalProperties, false);
  assert.equal(Object.hasOwn(schema.properties.planCommand.properties, "authoringGuidance"), false);
  assert.equal(schema.properties.designCommand.oneOf.length, 8);
  assert.equal(
    schema.properties.designCommand.oneOf[7].properties.type.const,
    "set_target_plan_items"
  );
  assert.equal(schema.properties.designCommand.oneOf[0].allOf.length, 4);
  assert.equal(
    schema.properties.designCommand.oneOf[0].properties.value.anyOf[1].minItems,
    1
  );
  assert.equal(
    schema.properties.designCommand.oneOf[4].properties.interpretation.properties
      .directives.uniqueItems,
    true
  );
  assert.equal(
    schema.properties.designCommand.oneOf[0].properties.scope.properties.kind.enum
      .includes("module"),
    false
  );
  assert.equal(
    schema.properties.designCommand.oneOf[5].properties.policy.properties.catalogVersion.const,
    "1-3e5629f8"
  );
  assert.equal(schema.allOf.length, 5);
  assert.ok(schema.allOf[0].then.required.includes("designCommand"));
  assert.ok(schema.allOf[1].then.required.includes("sourceCommand"));
  assert.ok(schema.allOf[2].then.required.includes("planCommand"));
  assert.equal(schema.allOf[3].then.anyOf.length, 2);
  assert.ok(schema.allOf[3].then.required.includes("sourceAttributionApplications"));
  assert.ok(schema.allOf[4].then.required.includes("materializationCommand"));
  assert.ok(schema.properties.planCommand.properties.type.enum.includes("split_part"));
  assert.ok(schema.properties.planCommand.properties.type.enum.includes("assign_microsequence"));
  assert.equal(schema.properties.planCommand.properties.microsequenceIds.maxItems, 64);
  assert.equal(schema.properties.materializationCommand.properties.steps.maxItems, 64);
  assert.equal(
    schema.properties.materializationCommand.properties.designApplication.anyOf[1].type,
    "null"
  );
  assert.equal(
    schema.properties.materializationCommand.properties.designApplication.anyOf[0]
      .properties.studyUnits.items.properties.introducedInstructionalAnalysisUnitIds.maxItems,
    256
  );
  assert.equal(
    schema.properties.materializationCommand.properties.sourceAttributionApplication.anyOf[0]
      .properties.contract.const,
    "aralearn.course-source-attribution-application.v1"
  );
  assert.ok(schema.properties.materializationCommand.allOf[1].then.required
    .includes("designApplication"));
  assert.ok(schema.properties.materializationCommand.allOf[0].then.not.anyOf
    .some(({ required }) => required.includes("designApplication")));
  assert.equal(
    schema.properties.materializationCommand.properties.entityChanges.properties.upserts.maxItems,
    64
  );
});

test("schema MCP fecha policy, alvos de etapa e versões como o Router", () => {
  const schema = COURSE_MCP_TOOLS.find(({ name }) => name === "alterarCurso").inputSchema;
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  const validatePolicy = ajv.compile(
    schema.properties.designCommand.oneOf[5].properties.policy
  );
  const ref = "aralearn.resource.paragraph@1.0.0";
  assert.equal(validatePolicy({
    catalogVersion: "1-3e5629f8",
    availability: "all",
    allowedRefs: [ref],
    excludedRefs: [],
    preferredRefs: []
  }), false);

  const validateTargetItems = ajv.compile(schema.properties.designCommand.oneOf[7]);
  const targetItems = {
    type: "set_target_plan_items",
    scope: { kind: "didactic_microsequence", ref: "micro-a" },
    instructionalAnalysisUnitIds: [PART_ID],
    evidenceRequirementIds: [STEP_ID]
  };
  assert.equal(validateTargetItems(targetItems), true, JSON.stringify(validateTargetItems.errors));
  assert.equal(validateTargetItems({
    ...targetItems,
    scope: { kind: "lesson", ref: "lesson-a" }
  }), false);
  assert.equal(validateTargetItems({
    ...targetItems,
    instructionalAnalysisUnitIds: [PART_ID, PART_ID]
  }), false);
  assert.equal(validatePolicy({
    catalogVersion: "1-3e5629f8",
    availability: "allow_only",
    allowedRefs: [],
    excludedRefs: [],
    preferredRefs: []
  }), false);

  const validateMaterialization = ajv.compile(schema.properties.materializationCommand);
  const start = {
    operation: "start",
    authoringPartId: PART_ID,
    materializationId: MATERIALIZATION_ID,
    expectedMaterializationVersion: 0,
    authoringPartVersion: 2,
    steps: [{
      id: STEP_ID,
      position: 0,
      kind: "context_load",
      targetDidacticMicrosequenceId: null,
      productionPosition: null
    }]
  };
  assert.equal(validateMaterialization(start), true, JSON.stringify(validateMaterialization.errors));
  assert.equal(validateMaterialization({ ...start, expectedMaterializationVersion: 1 }), false);
  assert.equal(validateMaterialization({
    ...start,
    steps: [{
      ...start.steps[0],
      targetDidacticMicrosequenceId: "micro-a",
      productionPosition: 0
    }]
  }), false);
});

test("schema MCP anuncia leitura retomável somente com as duas identidades", () => {
  const schema = COURSE_MCP_TOOLS.find(({ name }) => name === "lerCurso").inputSchema;
  assert.ok(schema.properties.view.enum.includes("part_materialization"));
  assert.equal(schema.properties.authoringPartId.pattern, schema.properties.courseId.pattern);
  assert.equal(schema.properties.materializationId.pattern, schema.properties.courseId.pattern);
  assert.ok(schema.properties.view.enum.includes("study_units"));
  assert.equal(schema.properties.maxBytes.maximum, 1_500_000);
  assert.ok(schema.properties.view.enum.includes("course_sources"));
  assert.equal(schema.properties.sourceId.maxLength, 2_048);
  const sourceCommand = COURSE_MCP_TOOLS.find(({ name }) => name === "alterarCurso")
    .inputSchema.properties.sourceCommand;
  assert.equal(sourceCommand.oneOf[0].properties.sourceId.maxLength, 2_048);
  assert.equal(sourceCommand.oneOf[2].properties.sourceId.maxLength, 2_048);
  assert.equal(
    sourceCommand.oneOf[4].properties.sourceLinks.items.properties.sourceId.maxLength,
    2_048
  );
  assert.equal(sourceCommand.oneOf[2].properties.anchorId.maxLength, 240);
  assert.deepEqual(schema.allOf[2].then.properties.scope, schema.properties.scope.anyOf[1]);
  assert.ok(schema.allOf[2].then.not.anyOf
    .some(({ required }) => required.includes("expectedRevision")));
});

test("schema MCP discrimina Fontes e bloqueia spoof e campos excedentes", () => {
  const changeSchema = COURSE_MCP_TOOLS.find(({ name }) => name === "alterarCurso").inputSchema;
  const readSchema = COURSE_MCP_TOOLS.find(({ name }) => name === "lerCurso").inputSchema;
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  const validateChange = ajv.compile(changeSchema);
  const validateRead = ajv.compile(readSchema);
  const sourceChange = {
    requestId: REQUEST_ID,
    courseId: COURSE_ID,
    expectedRevision: 4,
    operation: "update_course_sources",
    sourceCommand: {
      type: "save_source",
      sourceId: "source-a",
      expectedSourceRevision: 0,
      source: {
        kind: "web_page",
        title: "Fonte A",
        citationText: "Fonte A, 2026.",
        url: "https://example.test/fonte-a",
        editionOrVersion: null,
        studyVisibility: "citation_and_link"
      }
    }
  };
  assert.equal(validateChange(sourceChange), true, JSON.stringify(validateChange.errors));
  const legacySourceId = ` legacy-${"s".repeat(300)} `;
  assert.equal(validateChange({
    ...sourceChange,
    sourceCommand: {
      ...sourceChange.sourceCommand,
      sourceId: legacySourceId,
      expectedSourceRevision: 1
    }
  }), true, JSON.stringify(validateChange.errors));
  assert.equal(validateChange({
    ...sourceChange,
    sourceCommand: {
      ...sourceChange.sourceCommand,
      sourceId: "🔎".repeat(2_048),
      expectedSourceRevision: 1,
      source: {
        ...sourceChange.sourceCommand.source,
        title: "🔎".repeat(300)
      }
    }
  }), true, JSON.stringify(validateChange.errors));
  assert.equal(validateChange({
    ...sourceChange,
    sourceCommand: {
      ...sourceChange.sourceCommand,
      source: {
        ...sourceChange.sourceCommand.source,
        title: "🔎".repeat(301)
      }
    }
  }), false);
  const astralAnchor = {
    type: "save_anchor",
    anchorId: "anchor-unicode",
    sourceId: "source-a",
    sourceRevision: 1,
    expectedAnchorRevision: 0,
    selector: {
      kind: "text_quote",
      exact: "🔎".repeat(4_000),
      prefix: null,
      suffix: null
    },
    verificationExcerpt: "🧭".repeat(2_000)
  };
  assert.equal(validateChange({
    ...sourceChange,
    sourceCommand: astralAnchor
  }), true, JSON.stringify(validateChange.errors));
  assert.equal(validateChange({
    ...sourceChange,
    sourceCommand: {
      ...astralAnchor,
      selector: { ...astralAnchor.selector, exact: "🔎".repeat(4_001) },
      verificationExcerpt: null
    }
  }), false);
  assert.equal(validateChange({
    ...sourceChange,
    sourceCommand: {
      ...astralAnchor,
      selector: { ...astralAnchor.selector, exact: "trecho" },
      verificationExcerpt: "🧭".repeat(2_001)
    }
  }), false);
  assert.equal(validateChange({
    ...sourceChange,
    sourceCommand: {
      ...sourceChange.sourceCommand,
      source: {
        ...sourceChange.sourceCommand.source,
        title: "Título\ninválido"
      }
    }
  }), false);
  assert.equal(validateChange({
    ...sourceChange,
    sourceCommand: {
      ...astralAnchor,
      selector: {
        kind: "text_quote",
        exact: " \ttrecho\r\n ",
        prefix: "antes\tcontexto",
        suffix: "depois\ncontexto"
      },
      verificationExcerpt: " \ttrecho\r\n "
    }
  }), true, JSON.stringify(validateChange.errors));
  assert.equal(validateChange({
    ...sourceChange,
    sourceCommand: {
      type: "save_anchor",
      anchorId: "anchor-a",
      sourceId: legacySourceId,
      sourceRevision: 1,
      expectedAnchorRevision: 0,
      selector: { kind: "page_range", startPage: 1, endPage: 1 },
      verificationExcerpt: null
    }
  }), true, JSON.stringify(validateChange.errors));
  assert.equal(validateChange({
    ...sourceChange,
    sourceCommand: {
      type: "set_target_sources",
      targetKind: "study_unit",
      targetId: "unit-a",
      expectedTargetVersion: 2,
      sourceLinks: [{
        sourceId: legacySourceId,
        sourceRevision: 1,
        relation: "supported_by",
        anchors: [{ anchorId: "anchor-a", anchorRevision: 1 }]
      }]
    }
  }), true, JSON.stringify(validateChange.errors));
  assert.equal(validateChange({
    ...sourceChange,
    sourceCommand: { ...sourceChange.sourceCommand, sourceId: "legacy\u0000source" }
  }), false);
  assert.equal(validateChange({
    ...sourceChange,
    sourceCommand: { ...sourceChange.sourceCommand, actorId: COURSE_ID }
  }), false);
  assert.equal(validateChange({
    ...sourceChange,
    sourceCommand: {
      type: "set_target_sources",
      targetKind: "study_unit",
      targetId: "unit-a",
      expectedTargetVersion: 2,
      sourceLinks: [{
        sourceId: "source-a",
        sourceRevision: 1,
        relation: "quoted_from",
        anchors: []
      }]
    }
  }), false);
  assert.equal(validateChange({
    ...sourceChange,
    sourceCommand: {
      type: "set_target_sources",
      targetKind: "study_unit",
      targetId: "unit-a",
      expectedTargetVersion: 2,
      sourceLinks: [{
        sourceId: "source-a",
        sourceRevision: 1,
        relation: "supported_by",
        anchors: []
      }]
    }
  }), false);
  assert.equal(validateRead({
    courseId: COURSE_ID,
    view: "course_sources",
    expectedRevision: 4,
    mode: "target",
    targetKind: "study_unit",
    targetId: "unit-a"
  }), true, JSON.stringify(validateRead.errors));
  assert.equal(validateRead({
    courseId: COURSE_ID,
    view: "course_sources",
    expectedRevision: 4,
    mode: "source",
    sourceId: "source-a",
    targetKind: "study_unit",
    targetId: "unit-a"
  }), true, JSON.stringify(validateRead.errors));
  assert.equal(validateRead({
    courseId: COURSE_ID,
    view: "course_sources",
    expectedRevision: 4,
    mode: "source",
    sourceId: "🔎".repeat(2_048),
    targetKind: "study_unit",
    targetId: "unit-a"
  }), true, JSON.stringify(validateRead.errors));
  assert.equal(validateRead({
    courseId: COURSE_ID,
    view: "course_sources",
    expectedRevision: 4,
    mode: "target",
    targetKind: "study_unit",
    targetId: "🔎".repeat(240)
  }), true, JSON.stringify(validateRead.errors));
  assert.equal(validateRead({
    courseId: COURSE_ID,
    view: "course_sources",
    expectedRevision: 4,
    mode: "target",
    targetKind: "study_unit",
    targetId: "🔎".repeat(241)
  }), false);
  assert.equal(validateRead({
    courseId: COURSE_ID,
    view: "course_sources",
    expectedRevision: 4,
    mode: "source",
    sourceId: "界".repeat(2_049)
  }), false);
  assert.equal(validateRead({
    courseId: COURSE_ID,
    view: "course_sources",
    expectedRevision: 4,
    mode: "source",
    sourceId: "source-a",
    targetKind: "study_unit",
    targetId: "unit-a",
    cursor: "YWZ0ZXI="
  }), false);
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
