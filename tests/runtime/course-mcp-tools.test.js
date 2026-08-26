import test from "node:test";
import assert from "node:assert/strict";
import Ajv2020 from "ajv/dist/2020.js";

import {
  COURSE_APPLICATION_ONLY_TOOLS,
  COURSE_MCP_TOOLS,
  authoringApplicationToolDefinition,
  authoringApplicationToolIsAllowed,
  authoringMcpToolIsAllowed,
  authoringMcpToolsForPrincipal,
  mapAuthoringApplicationToolCall,
  mapAuthoringMcpToolCall,
  validateAuthoringMcpToolOutput
} from "../../supabase/functions/_shared/aralearn-authoring/courseMcpTools.js";

const COURSE_ID = "10000000-0000-4000-8000-000000000001";
const PART_ID = "20000000-0000-4000-8000-000000000002";
const MATERIALIZATION_ID = "30000000-0000-4000-8000-000000000003";
const STEP_ID = "40000000-0000-4000-8000-000000000004";
const REQUEST_ID = "request-course-0001";
const AUDIT_RUN_ID = "50000000-0000-5000-8000-000000000005";
const FINDING_ID = "60000000-0000-5000-8000-000000000006";
const CORRECTION_ID = "70000000-0000-5000-8000-000000000007";

function auditCheck(dimension, index, result = "not_checked") {
  const adequacy = {
    passed: "sufficient",
    failed: "insufficient",
    uncertain: "uncertain",
    not_applicable: "not_applicable",
    not_checked: "not_assessed"
  }[result];
  return {
    checkId: `80000000-0000-5000-8000-00000000000${index}`,
    dimension,
    criterion: {
      code: `${dimension}.review`,
      version: "1",
      statement: `Critério público de ${dimension}.`
    },
    result,
    publicEvidence: `Evidência pública de ${dimension}.`,
    adequacy,
    planItemRefs: [],
    parameterRefs: [],
    sourceLinks: []
  };
}

function recordAuditCommand() {
  return {
    type: "record_audit",
    auditRunId: AUDIT_RUN_ID,
    targetStudyUnitId: "unit-a",
    contextHash: "a".repeat(64),
    origin: "human_audit",
    method: { id: "manual-review", version: "1" },
    checks: [
      auditCheck("pedagogical_quality", 1),
      auditCheck("factual_quality", 2, "failed"),
      auditCheck("editorial_quality", 3)
    ],
    findings: []
  };
}

test("registro expõe somente ferramentas centradas no Curso e nos componentes", () => {
  assert.deepEqual(COURSE_MCP_TOOLS.map(({ name }) => name), [
    "listarCursos",
    "lerCurso",
    "criarCurso",
    "alterarCurso",
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
  const componentUri = "ui://aralearn/course-inspector/0.0.23.html";
  for (const name of ["lerCurso", "consultarComponentesDidaticos"]) {
    const definition = COURSE_MCP_TOOLS.find((tool) => tool.name === name);
    assert.equal(definition._meta.ui.resourceUri, componentUri);
    assert.equal(definition._meta["openai/outputTemplate"], componentUri);
  }
  assert.equal(COURSE_MCP_TOOLS.find(({ name }) => name === "listarCursos")._meta, undefined);
  assert.deepEqual(COURSE_APPLICATION_ONLY_TOOLS, [
    { name: "gerirPessoas" },
    { name: "criarCopiaPessoalDoCurso" },
    { name: "manterCursos" },
    { name: "manterAraLearn" }
  ]);
  assert.equal(authoringApplicationToolDefinition("gerirPessoas")?.name, "gerirPessoas");
  assert.equal(authoringMcpToolIsAllowed("gerirPessoas", {
    actorId: COURSE_ID,
    scopes: ["authoring:write"]
  }), false);
  assert.equal(authoringApplicationToolIsAllowed("gerirPessoas", {
    actorId: COURSE_ID,
    scopes: ["authoring:write"]
  }), true);
  assert.equal(
    authoringApplicationToolDefinition("criarCopiaPessoalDoCurso")?.name,
    "criarCopiaPessoalDoCurso"
  );
  assert.equal(authoringMcpToolIsAllowed("criarCopiaPessoalDoCurso", {
    actorId: COURSE_ID,
    scopes: ["authoring:write"]
  }), false);
  assert.equal(authoringApplicationToolIsAllowed("criarCopiaPessoalDoCurso", {
    actorId: COURSE_ID,
    scopes: ["authoring:write"]
  }), true);
  for (const name of ["manterCursos", "manterAraLearn"]) {
    assert.equal(authoringApplicationToolDefinition(name)?.name, name);
    assert.equal(authoringMcpToolIsAllowed(name, {
      actorId: COURSE_ID,
      scopes: ["authoring:write"]
    }), false);
    assert.equal(authoringApplicationToolIsAllowed(name, {
      actorId: COURSE_ID,
      scopes: ["authoring:write"]
    }), true);
  }
  assert.doesNotMatch(serialized, /criarCopiaPessoalDoCurso/u);
  assert.doesNotMatch(serialized, /manterCursos|manterAraLearn/u);
});

test("aplicação mapeia ciclo de vida e Manutenção sem expô-los ao MCP", () => {
  assert.deepEqual(mapAuthoringApplicationToolCall("manterCursos", {
    operation: "delete_owned_course",
    requestId: REQUEST_ID,
    courseId: COURSE_ID,
    confirmed: true
  }), {
    kind: "route",
    method: "DELETE",
    path: `/v1/courses/${COURSE_ID}`,
    requestId: REQUEST_ID,
    body: {
      requestId: REQUEST_ID,
      operation: "delete_owned_course",
      confirmed: true
    }
  });
  assert.deepEqual(mapAuthoringApplicationToolCall("manterAraLearn", {
    operation: "inspect",
    limit: 40
  }), {
    kind: "route",
    method: "GET",
    path: "/v1/maintenance?limit=40",
    requestId: null,
    body: null
  });
  assert.throws(
    () => mapAuthoringMcpToolCall("manterCursos", {}),
    (error) => error.code === "unknown_tool"
  );
});

test("cópia pessoal é ação fechada da aplicação e não altera o contrato MCP", () => {
  const studyUnit = {
    id: "unit-a",
    position: 1,
    title: "Unidade revista",
    role: "theory",
    content: [{
      id: "paragraph-a",
      package: "aralearn.resource.paragraph",
      version: "1.0.0",
      data: { text: "Conteúdo revisto." }
    }],
    response: null,
    feedback: [],
    topics: []
  };
  const operation = mapAuthoringApplicationToolCall("criarCopiaPessoalDoCurso", {
    requestId: "request-personal-copy-0001",
    sourceCourseId: COURSE_ID,
    expectedSourceCourseRevision: 4,
    expectedStudyUnitVersion: 2,
    didacticMicrosequenceId: "micro-a",
    studyUnit,
    applicationOrigin: "provider_assistance"
  });

  assert.deepEqual(operation, {
    kind: "route",
    method: "POST",
    path: `/v1/courses/${COURSE_ID}/personal-copy/composition`,
    requestId: "request-personal-copy-0001",
    body: {
      requestId: "request-personal-copy-0001",
      sourceCourseId: COURSE_ID,
      expectedSourceCourseRevision: 4,
      expectedStudyUnitVersion: 2,
      didacticMicrosequenceId: "micro-a",
      studyUnit,
      applicationOrigin: "provider_assistance"
    }
  });
  assert.throws(
    () => mapAuthoringMcpToolCall("criarCopiaPessoalDoCurso", operation.body),
    (error) => error.code === "unknown_tool"
  );
  assert.throws(
    () => mapAuthoringApplicationToolCall("criarCopiaPessoalDoCurso", {
      ...operation.body,
      actorId: COURSE_ID
    }),
    (error) => error.code === "unknown_tool_argument"
  );
  assert.throws(
    () => mapAuthoringApplicationToolCall("criarCopiaPessoalDoCurso", {
      ...operation.body,
      applicationOrigin: "conversa"
    }),
    (error) => error.code === "invalid_tool_argument"
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

test("prévia de componente aceita somente um alvo persistido completo", () => {
  const mapped = mapAuthoringMcpToolCall("consultarComponentesDidaticos", {
    operation: "preview_study_unit",
    courseId: COURSE_ID,
    studyUnitId: "unit-a",
    studyUnitJson: "{}"
  });
  assert.equal(mapped.kind, "resource-library");
  assert.equal(mapped.body.courseId, COURSE_ID);
  assert.equal(mapped.body.studyUnitId, "unit-a");

  assert.throws(() => mapAuthoringMcpToolCall("consultarComponentesDidaticos", {
    operation: "preview_study_unit",
    courseId: COURSE_ID,
    studyUnitJson: "{}"
  }), /courseId e studyUnitId/iu);
  assert.throws(() => mapAuthoringMcpToolCall("consultarComponentesDidaticos", {
    operation: "search",
    courseId: COURSE_ID,
    studyUnitId: "unit-a",
    query: "tabela"
  }), /só pertence a preview_study_unit/iu);
});

test("contrato de componente exige uma única identidade por chamada", () => {
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  const schema = COURSE_MCP_TOOLS.find(
    ({ name }) => name === "consultarComponentesDidaticos"
  ).inputSchema;
  const validate = ajv.compile(schema);
  const mapped = mapAuthoringMcpToolCall("consultarComponentesDidaticos", {
    operation: "contracts",
    packages: ["aralearn.resource.paragraph@1.0.0"]
  });
  assert.equal(mapped.kind, "resource-library");
  assert.deepEqual(mapped.body.packages, ["aralearn.resource.paragraph@1.0.0"]);
  assert.equal(validate({
    operation: "contracts",
    packages: ["aralearn.resource.paragraph@1.0.0"]
  }), true, JSON.stringify(validate.errors));
  assert.equal(validate({
    operation: "contracts",
    packages: [
      "aralearn.resource.paragraph@1.0.0",
      "aralearn.resource.chart@1.0.0"
    ]
  }), false);
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
    `/v2/courses/${COURSE_ID}/study-units?expectedRevision=4` +
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

  const broadApplicationComposition = mapAuthoringApplicationToolCall("alterarCurso", {
    requestId: REQUEST_ID,
    courseId: COURSE_ID,
    expectedRevision: 4,
    operation: "commit_course_composition",
    upserts: [upsert],
    deletes: [],
    sourceAttributionApplications: []
  });
  assert.deepEqual(broadApplicationComposition.body, composition.body);

  const applicationComposition = mapAuthoringApplicationToolCall("alterarCurso", {
    requestId: REQUEST_ID,
    courseId: COURSE_ID,
    expectedRevision: 4,
    expectedStudyUnitVersion: 2,
    applicationOrigin: "provider_assistance",
    operation: "commit_course_composition",
    upserts: [{
      entityType: "study_unit",
      entityId: "unit-a",
      parentType: "microsequence",
      parentId: "micro-a",
      position: 1,
      content: { title: "Unidade" }
    }],
    deletes: [],
    sourceAttributionApplications: [{ studyUnitId: "unit-a", sourceLinks: [] }]
  });
  assert.equal(applicationComposition.body.expectedStudyUnitVersion, 2);
  assert.equal(applicationComposition.body.applicationOrigin, "provider_assistance");
  assert.throws(
    () => mapAuthoringApplicationToolCall("alterarCurso", {
      requestId: REQUEST_ID,
      courseId: COURSE_ID,
      expectedRevision: 4,
      expectedStudyUnitVersion: 2,
      operation: "commit_course_composition",
      upserts: [upsert],
      deletes: [],
      sourceAttributionApplications: []
    }),
    (error) => error.code === "invalid_tool_argument"
  );
  assert.throws(
    () => mapAuthoringMcpToolCall("alterarCurso", {
      requestId: REQUEST_ID,
      courseId: COURSE_ID,
      expectedRevision: 4,
      expectedStudyUnitVersion: 2,
      applicationOrigin: "manual",
      operation: "commit_course_composition",
      upserts: [],
      deletes: [],
      sourceAttributionApplications: []
    }),
    (error) => error.code === "unknown_tool_argument"
  );

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
      "update_anchored_annotations",
      "update_audit_cycle",
      "update_course_variants",
      "commit_course_composition",
      "advance_part_materialization"
  ]);
  const planBranches = schema.properties.planCommand.oneOf;
  const planBranch = (type) => planBranches.find((branch) =>
    branch.properties.type.const === type
  );
  assert.match(
    mapAuthoringApplicationToolCall("lerCurso", {
      courseId: COURSE_ID,
      view: "study_units",
      expectedRevision: 4
    }).path,
    new RegExp(`^/v1/courses/${COURSE_ID}/study-units\\?`, "u")
  );
  assert.match(
    mapAuthoringApplicationToolCall("lerCurso", {
      courseId: COURSE_ID,
      view: "study_units",
      expectedRevision: 4
    }, { inspectionVersion: 2 }).path,
    new RegExp(`^/v2/courses/${COURSE_ID}/study-units\\?`, "u")
  );
  assert.equal(planBranches.length, 14);
  assert.equal(planBranch("add_part").additionalProperties, false);
  assert.deepEqual(planBranch("add_part").required, ["type", "id", "position", "title"]);
  assert.equal(Object.hasOwn(planBranch("add_part").properties, "partId"), false);
  assert.equal(Object.hasOwn(planBranch("remove_part").properties, "title"), false);
  assert.equal(planBranch("update_plan").anyOf.length, 5);
  assert.equal(schema.properties.designCommand.oneOf.length, 8);
  assert.equal(
    schema.properties.designCommand.oneOf[7].properties.type.const,
    "set_target_plan_items"
  );
  assert.equal(schema.properties.designCommand.oneOf[0].allOf.length, 5);
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
  assert.equal(schema.allOf.length, 8);
  const operationBranch = (operation) => schema.allOf.find((branch) =>
    branch.if?.properties?.operation?.const === operation
  );
  assert.ok(operationBranch("update_course_design").then.required.includes("designCommand"));
  assert.ok(operationBranch("update_course_sources").then.required.includes("sourceCommand"));
  assert.ok(operationBranch("update_anchored_annotations").then.required
    .includes("annotationCommand"));
  assert.ok(operationBranch("update_audit_cycle").then.required
    .includes("auditCommand"));
  assert.ok(operationBranch("update_instructional_plan").then.required.includes("planCommand"));
  assert.equal(operationBranch("commit_course_composition").then.anyOf.length, 2);
  assert.ok(operationBranch("commit_course_composition").then.required
    .includes("sourceAttributionApplications"));
  assert.ok(operationBranch("advance_part_materialization").then.required
    .includes("materializationCommand"));
  assert.equal(planBranch("split_part").properties.microsequenceIds.maxItems, 64);
  assert.deepEqual(planBranch("assign_microsequence").required, [
    "type", "partId", "microsequenceId", "position"
  ]);
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

  const validateMaterialization = ajv.compile({
    ...schema.properties.materializationCommand,
    $defs: schema.$defs
  });
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
  const changeSchema = COURSE_MCP_TOOLS.find(({ name }) => name === "alterarCurso").inputSchema;
  const sourceCommand = changeSchema.properties.sourceCommand;
  assert.equal(sourceCommand.oneOf[0].properties.sourceId.maxLength, 2_048);
  assert.equal(sourceCommand.oneOf[2].properties.sourceId.maxLength, 2_048);
  const setTargetSources = sourceCommand.oneOf.find(({ properties }) =>
    properties.type.const === "set_target_sources");
  assert.equal(setTargetSources.properties.sourceLinks.$ref, "#/$defs/sourceLinks");
  assert.equal(changeSchema.$defs.sourceLinks.items.properties.sourceId.maxLength, 2_048);
  assert.equal(sourceCommand.oneOf[2].properties.anchorId.maxLength, 240);
  const designBranch = schema.allOf.find((branch) =>
    branch.if?.properties?.view?.const === "course_design"
  );
  assert.deepEqual(designBranch.then.properties.scope, schema.properties.scope.anyOf[1]);
  assert.ok(designBranch.then.not.anyOf
    .some(({ required }) => required.includes("expectedRevision")));
});

test("schema MCP discrimina os três modos de observações sem cruzá-los com Fontes", () => {
  const schema = COURSE_MCP_TOOLS.find(({ name }) => name === "lerCurso").inputSchema;
  const validate = new Ajv2020({ allErrors: true, strict: false }).compile(schema);
  const base = {
    courseId: COURSE_ID,
    view: "anchored_annotations",
    expectedRevision: 7
  };
  assert.equal(validate({ ...base, mode: "inbox" }), true, JSON.stringify(validate.errors));
  assert.equal(validate({
    ...base,
    mode: "target",
    targetKind: "study_unit",
    targetId: "unit-a",
    includeDescendants: false
  }), true, JSON.stringify(validate.errors));
  const literalSourceId = `  Fonte ${"x".repeat(260)}  `;
  assert.equal(validate({
    ...base,
    mode: "target",
    targetKind: "source",
    targetId: literalSourceId,
    includeDescendants: true
  }), true, JSON.stringify(validate.errors));
  assert.equal(validate({
    ...base,
    mode: "target",
    targetKind: "source",
    targetId: "   ",
    includeDescendants: true
  }), false);
  assert.equal(validate({
    ...base,
    mode: "detail",
    annotationId: "60000000-0000-4000-8000-000000000006",
    includeObservationText: true
  }), true, JSON.stringify(validate.errors));
  assert.equal(validate({
    ...base,
    mode: "detail",
    annotationId: "60000000-0000-4000-8000-000000000006"
  }), false);
  assert.equal(validate({ ...base, mode: "inbox", includeObservationText: true }), false);
  assert.equal(validate({
    ...base,
    view: "course_sources",
    mode: "inbox"
  }), false);
  assert.equal(validate({ ...base, mode: "catalog" }), false);
  assert.equal(validate({ ...base, mode: "inbox", includeDescendants: true }), false);
  assert.equal(validate({
    ...base,
    mode: "target",
    targetKind: "course",
    targetId: "course-not-a-uuid"
  }), false);
  assert.equal(schema.properties.subjectIds.maxItems, 16);
  assert.equal(validate({
    ...base,
    mode: "inbox",
    subjectIds: Array.from({ length: 17 }, (_, index) => `topic-${index}`)
  }), false);
  assert.equal(validate({
    courseId: COURSE_ID,
    view: "course_sources",
    expectedRevision: 7,
    mode: "target",
    targetKind: "course",
    targetId: COURSE_ID
  }), false);
});

test("MCP lê e altera o ciclo de auditoria sem criar ferramenta nem rota paralela", () => {
  const annotationId = "90000000-0000-5000-8000-000000000009";
  assert.deepEqual(mapAuthoringMcpToolCall("lerCurso", {
    courseId: COURSE_ID,
    view: "audit_cycle",
    expectedRevision: 7,
    auditSetVersion: 3,
    mode: "context",
    targetStudyUnitId: "unit-a",
    annotationIds: [annotationId],
    includeObservationText: true,
    limit: 1
  }), {
    kind: "route",
    method: "GET",
    path: `/v1/courses/${COURSE_ID}/audit-cycle?expectedRevision=7&auditSetVersion=3` +
      `&mode=context&targetStudyUnitId=unit-a&annotationId=${annotationId}&limit=1`,
    requestId: null,
    body: null
  });
  assert.equal(mapAuthoringMcpToolCall("lerCurso", {
    courseId: COURSE_ID,
    view: "audit_cycle",
    expectedRevision: 7,
    mode: "findings",
    targetStudyUnitId: "unit-a",
    states: ["open"],
    dimensions: ["factual_quality"],
    severities: ["high"],
    cursor: "YWZ0ZXI=",
    limit: 12
  }).path, `/v1/courses/${COURSE_ID}/audit-cycle?expectedRevision=7&mode=findings` +
    "&targetStudyUnitId=unit-a&state=open&dimension=factual_quality&severity=high" +
    "&cursor=YWZ0ZXI%3D&limit=12");
  assert.equal(mapAuthoringMcpToolCall("lerCurso", {
    courseId: COURSE_ID,
    view: "audit_cycle",
    expectedRevision: 7,
    mode: "runs",
    targetStudyUnitId: "unit-a",
    cursor: "YWZ0ZXI=",
    limit: 12
  }).path, `/v1/courses/${COURSE_ID}/audit-cycle?expectedRevision=7&mode=runs` +
    "&targetStudyUnitId=unit-a&cursor=YWZ0ZXI%3D&limit=12");
  assert.equal(mapAuthoringMcpToolCall("lerCurso", {
    courseId: COURSE_ID,
    view: "audit_cycle",
    expectedRevision: 7,
    mode: "detail",
    findingId: FINDING_ID,
    correctionId: CORRECTION_ID
  }).path, `/v1/courses/${COURSE_ID}/audit-cycle?expectedRevision=7&mode=detail` +
    `&findingId=${FINDING_ID}&correctionId=${CORRECTION_ID}&limit=12`);
  assert.equal(mapAuthoringMcpToolCall("lerCurso", {
    courseId: COURSE_ID,
    view: "audit_cycle",
    expectedRevision: 7,
    mode: "detail",
    auditRunId: AUDIT_RUN_ID
  }).path, `/v1/courses/${COURSE_ID}/audit-cycle?expectedRevision=7&mode=detail` +
    `&auditRunId=${AUDIT_RUN_ID}&limit=12`);

  const mapped = mapAuthoringMcpToolCall("alterarCurso", {
    requestId: REQUEST_ID,
    courseId: COURSE_ID,
    expectedRevision: 7,
    operation: "update_audit_cycle",
    auditCommand: recordAuditCommand()
  });
  assert.equal(mapped.path, `/v1/courses/${COURSE_ID}/audit-cycle/changes`);
  assert.deepEqual(mapped.body.command, recordAuditCommand());

  const applyCommand = {
    type: "apply_authoring_correction",
    findingId: FINDING_ID,
    expectedFindingVersion: 2,
    correctionId: CORRECTION_ID,
    expectedCorrectionVersion: 1
  };
  assert.throws(() => mapAuthoringMcpToolCall("alterarCurso", {
    requestId: REQUEST_ID,
    courseId: COURSE_ID,
    expectedRevision: 7,
    operation: "update_audit_cycle",
    auditCommand: applyCommand
  }), (error) => error.code === "authoring_correction_confirmation_required");
  const confirmedApply = mapAuthoringMcpToolCall("alterarCurso", {
    requestId: REQUEST_ID,
    courseId: COURSE_ID,
    expectedRevision: 7,
    operation: "update_audit_cycle",
    auditCommand: { ...applyCommand, confirmed: true }
  });
  assert.deepEqual(confirmedApply.body.command, applyCommand);
  assert.equal(Object.hasOwn(confirmedApply.body.command, "confirmed"), false);
  assert.deepEqual(mapAuthoringApplicationToolCall("alterarCurso", {
    requestId: REQUEST_ID,
    courseId: COURSE_ID,
    expectedRevision: 7,
    operation: "update_audit_cycle",
    auditCommand: applyCommand
  }).body.command, applyCommand);

  assert.throws(() => mapAuthoringMcpToolCall("alterarCurso", {
    requestId: REQUEST_ID,
    courseId: COURSE_ID,
    expectedRevision: 7,
    operation: "update_audit_cycle",
    auditCommand: {
      ...recordAuditCommand(),
      checks: [
        ...recordAuditCommand().checks,
        auditCheck("structural_conformance", 4, "passed")
      ]
    }
  }), (error) => error.code === "invalid_course_audit_checks");
});

test("MCP lê, cria e desvincula variantes pela mesma dupla de ferramentas", () => {
  const comparisonSetId = "81000000-0000-4000-8000-000000000008";
  assert.equal(mapAuthoringMcpToolCall("lerCurso", {
    courseId: COURSE_ID,
    view: "variant_comparison",
    comparisonSetId,
    expectedRevision: 7
  }).path, `/v1/courses/${COURSE_ID}/variant-comparisons/${comparisonSetId}?expectedRevision=7`);
  const create = {
    type: "create_comparison_variants", comparisonSetId, expectedCourseRevision: 7,
    variants: [
      { label: "A", title: "Curso A", goal: "Objetivo A", parameterDifferences: [], componentPolicyDifference: null },
      {
        label: "B", title: "Curso B", goal: "Objetivo B", parameterDifferences: [],
        componentPolicyDifference: {
          catalogVersion: "1-3e5629f8", availability: "all", allowedRefs: [],
          excludedRefs: [], preferredRefs: []
        }
      }
    ]
  };
  const mapped = mapAuthoringMcpToolCall("alterarCurso", {
    requestId: REQUEST_ID, courseId: COURSE_ID, expectedRevision: 7,
    operation: "update_course_variants", variantCommand: create
  });
  assert.equal(mapped.path, `/v1/courses/${COURSE_ID}/variant-comparisons/changes`);
  assert.deepEqual(mapped.body.command, create);
  const detach = mapAuthoringMcpToolCall("alterarCurso", {
    requestId: REQUEST_ID, courseId: COURSE_ID,
    operation: "update_course_variants",
    variantCommand: {
      type: "detach_comparison_variant", comparisonSetId,
      courseId: "82000000-0000-4000-8000-000000000009"
    }
  });
  assert.equal(Object.hasOwn(detach.body, "expectedCourseRevision"), false);
  assert.deepEqual(detach.body.command, {
    type: "detach_comparison_variant",
    comparisonSetId,
    courseId: "82000000-0000-4000-8000-000000000009"
  });

  const ajv = new Ajv2020({ allErrors: true, strict: false });
  const schema = COURSE_MCP_TOOLS.find(({ name }) => name === "alterarCurso").inputSchema;
  const validate = ajv.compile(schema);
  assert.equal(validate({
    requestId: REQUEST_ID,
    courseId: COURSE_ID,
    expectedRevision: 7,
    operation: "update_course_variants",
    variantCommand: create
  }), true, JSON.stringify(validate.errors));
  assert.equal(validate({
    requestId: REQUEST_ID,
    courseId: COURSE_ID,
    operation: "update_course_variants",
    variantCommand: {
      type: "detach_comparison_variant",
      comparisonSetId,
      variantCourseId: "82000000-0000-4000-8000-000000000009"
    }
  }), false);
});

test("MCP lê fatos de Pesquisa por recorte sem criar ferramenta paralela", () => {
  const path = mapAuthoringMcpToolCall("lerCurso", {
    courseId: COURSE_ID,
    view: "research",
    expectedRevision: 7,
    datasets: ["materializations", "annotations"],
    channels: ["authoring_chat"],
    origins: ["automatic"],
    states: ["completed"],
    from: "2026-08-01T00:00:00.000Z",
    to: "2026-08-20T23:59:59.000Z",
    limit: 40,
    cursor: "cGFnZS0y"
  }).path;
  assert.equal(path,
    `/v1/courses/${COURSE_ID}/research?expectedRevision=7` +
    "&dataset=materializations&dataset=annotations&channel=authoring_chat" +
    "&origin=automatic&state=completed&from=2026-08-01T00%3A00%3A00.000Z" +
    "&to=2026-08-20T23%3A59%3A59.000Z&limit=40&cursor=cGFnZS0y");

  const ajv = new Ajv2020({ allErrors: true, strict: false });
  const schema = COURSE_MCP_TOOLS.find(({ name }) => name === "lerCurso").inputSchema;
  const validate = ajv.compile(schema);
  assert.equal(validate({
    courseId: COURSE_ID,
    view: "research",
    expectedRevision: 7,
    datasets: ["sources"],
    limit: 200
  }), true, JSON.stringify(validate.errors));
  assert.equal(validate({
    courseId: COURSE_ID,
    view: "research",
    expectedRevision: 7,
    datasets: ["sources"],
    mode: "catalog"
  }), false);
  assert.throws(() => mapAuthoringMcpToolCall("lerCurso", {
    courseId: COURSE_ID,
    view: "research",
    expectedRevision: 7,
    datasets: ["unknown"]
  }), /conjunto|fatos|Analytics/iu);
});

test("schema MCP fecha modos e os sete comandos públicos do ciclo de auditoria", () => {
  const tools = Object.fromEntries(COURSE_MCP_TOOLS.map((tool) => [tool.name, tool]));
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  const validateRead = ajv.compile(tools.lerCurso.inputSchema);
  const validateChange = ajv.compile(tools.alterarCurso.inputSchema);
  const context = {
    courseId: COURSE_ID,
    view: "audit_cycle",
    expectedRevision: 7,
    mode: "context",
    targetStudyUnitId: "unit-a"
  };
  assert.equal(validateRead(context), true, JSON.stringify(validateRead.errors));
  assert.equal(validateRead({ ...context, annotationIds: [FINDING_ID] }), false);
  assert.equal(validateRead({
    ...context,
    annotationIds: [FINDING_ID],
    includeObservationText: true
  }), true, JSON.stringify(validateRead.errors));
  assert.equal(validateRead({
    ...context,
    annotationIds: [],
    includeObservationText: true
  }), false);
  assert.equal(validateRead({ ...context, includeObservationText: true }), false);
  assert.equal(validateRead({ ...context, states: ["open"] }), false);
  assert.equal(validateRead({
    ...context,
    mode: "detail",
    targetStudyUnitId: undefined,
    findingId: FINDING_ID,
    correctionId: CORRECTION_ID
  }), true, JSON.stringify(validateRead.errors));
  assert.equal(validateRead({ ...context, mode: "findings", targetStudyUnitId: undefined }), true);
  assert.equal(validateRead({ ...context, mode: "findings" }), true,
    JSON.stringify(validateRead.errors));
  assert.equal(validateRead({ ...context, mode: "findings", correctionId: CORRECTION_ID }), false);
  assert.equal(validateRead({ ...context, mode: "runs" }), true,
    JSON.stringify(validateRead.errors));
  assert.equal(validateRead({ ...context, mode: "runs", states: ["open"] }), false);
  assert.equal(validateRead({
    ...context,
    mode: "detail",
    targetStudyUnitId: undefined,
    auditRunId: AUDIT_RUN_ID
  }), true, JSON.stringify(validateRead.errors));
  assert.equal(validateRead({
    ...context,
    mode: "detail",
    targetStudyUnitId: undefined,
    findingId: FINDING_ID,
    auditRunId: AUDIT_RUN_ID
  }), false);

  const base = {
    requestId: REQUEST_ID,
    courseId: COURSE_ID,
    expectedRevision: 7,
    operation: "update_audit_cycle"
  };
  assert.equal(validateChange({ ...base, auditCommand: recordAuditCommand() }), true,
    JSON.stringify(validateChange.errors));
  const parameterBoundary = recordAuditCommand();
  parameterBoundary.checks[0].parameterRefs = [{
    parameterId: `p${"a".repeat(159)}`,
    changeId: "1"
  }];
  assert.equal(validateChange({ ...base, auditCommand: parameterBoundary }), true,
    JSON.stringify(validateChange.errors));
  for (const parameterRef of [
    { parameterId: "Inválido", changeId: "1" },
    { parameterId: `p${"a".repeat(160)}`, changeId: "1" },
    { parameterId: "valid_parameter", changeId: "0" }
  ]) {
    const invalidParameter = recordAuditCommand();
    invalidParameter.checks[0].parameterRefs = [parameterRef];
    assert.equal(validateChange({ ...base, auditCommand: invalidParameter }), false);
  }
  const annotationRefs = Array.from({ length: 13 }, (_, index) => ({
    annotationId: `90000000-0000-5000-8000-${String(index + 1).padStart(12, "0")}`,
    annotationVersion: 1
  }));
  const twelveAnnotations = recordAuditCommand();
  twelveAnnotations.findings = [{
    findingId: FINDING_ID,
    checkId: twelveAnnotations.checks[1].checkId,
    code: "missing_source_anchor",
    severity: "high",
    annotationRefs: annotationRefs.slice(0, 12)
  }];
  assert.equal(validateChange({ ...base, auditCommand: twelveAnnotations }), true,
    JSON.stringify(validateChange.errors));
  assert.equal(validateChange({
    ...base,
    auditCommand: {
      ...twelveAnnotations,
      findings: [{ ...twelveAnnotations.findings[0], annotationRefs }]
    }
  }), false);
  const referenced = (type) => ({
    type,
    findingId: FINDING_ID,
    expectedFindingVersion: 2,
    correctionId: CORRECTION_ID,
    expectedCorrectionVersion: 1
  });
  assert.equal(validateChange({
    ...base,
    auditCommand: referenced("reject_authoring_correction")
  }), true, JSON.stringify(validateChange.errors));
  assert.equal(validateChange({
    ...base,
    auditCommand: { ...referenced("reject_authoring_correction"), confirmed: true }
  }), false);
  for (const type of ["apply_authoring_correction", "rollback_authoring_correction"]) {
    assert.equal(validateChange({ ...base, auditCommand: referenced(type) }), false, type);
    assert.equal(validateChange({
      ...base,
      auditCommand: { ...referenced(type), confirmed: false }
    }), false, type);
    assert.equal(validateChange({
      ...base,
      auditCommand: { ...referenced(type), confirmed: true }
    }), true, `${type}: ${JSON.stringify(validateChange.errors)}`);
  }
  assert.equal(validateChange({
    ...base,
    auditCommand: {
      type: "decide_finding",
      findingId: FINDING_ID,
      expectedFindingVersion: 2,
      decision: "dismiss"
    }
  }), true, JSON.stringify(validateChange.errors));
  assert.equal(validateChange({
    ...base,
    auditCommand: {
      type: "propose_authoring_correction",
      correctionId: CORRECTION_ID,
      findingId: FINDING_ID,
      expectedFindingVersion: 2,
      expectedCorrectionVersion: 0,
      afterContent: { title: "Unidade corrigida" },
      afterSourceLinks: [],
      rationale: "Corrigir o achado focal."
    }
  }), true, JSON.stringify(validateChange.errors));
  assert.equal(validateChange({
    ...base,
    auditCommand: {
      ...referenced("verify_finding"),
      auditRunId: AUDIT_RUN_ID,
      contextHash: "a".repeat(64),
      origin: "human_audit",
      method: { id: "manual-review", version: "1" },
      checks: recordAuditCommand().checks,
      outcome: "still_open"
    }
  }), true, JSON.stringify(validateChange.errors));
});

test("schema MCP discrimina Fontes e bloqueia spoof e campos excedentes", () => {
  const changeSchema = COURSE_MCP_TOOLS.find(({ name }) => name === "alterarCurso").inputSchema;
  const readSchema = COURSE_MCP_TOOLS.find(({ name }) => name === "lerCurso").inputSchema;
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  const validateChange = ajv.compile(changeSchema);
  const validateRead = ajv.compile(readSchema);
  const readDescription = COURSE_MCP_TOOLS.find(({ name }) => name === "lerCurso").description;
  const changeDescription = COURSE_MCP_TOOLS.find(({ name }) => name === "alterarCurso").description;
  assert.ok(readDescription.length < 320);
  assert.ok(changeDescription.length < 320);
  assert.match(readDescription, /phaseGuidance focal/iu);
  assert.match(changeDescription, /Proponha antes de aplicar e verifique depois/iu);
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
        authorship: "Autoria",
        publicationDate: "2026",
        identifier: null,
        language: "pt-BR",
        citationText: "Fonte A, 2026.",
        url: "https://example.test/fonte-a",
        editionOrVersion: null,
        origin: "external",
        availability: "open_access",
        verificationStatus: "author_verified",
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
    sourceCommand: {
      ...astralAnchor,
      humanLocator: "Unidade 4 · Slide 12 · Figura 2"
    }
  }), true, JSON.stringify(validateChange.errors));
  assert.equal(validateChange({
    ...sourceChange,
    sourceCommand: { ...astralAnchor, humanLocator: "x".repeat(501) }
  }), false);
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

test("preparo de anexo exige a aplicação e MCP só mapeia download após disclosure explícito", () => {
  const contentHash = "a".repeat(64);
  assert.throws(
    () => mapAuthoringMcpToolCall("lerCurso", {
      courseId: COURSE_ID,
      view: "course_source_attachment",
      expectedRevision: 4,
      attachmentOperation: "prepare_upload",
      sourceId: "source-pdf",
      sourceRevision: 2,
      contentHash,
      byteSize: 1_024,
      mediaType: "application/pdf"
    }),
    (error) => error.code === "application_session_required"
  );
  const read = mapAuthoringApplicationToolCall("lerCurso", {
    courseId: COURSE_ID,
    view: "course_source_attachment",
    expectedRevision: 4,
    attachmentOperation: "prepare_upload",
    sourceId: "source-pdf",
    sourceRevision: 2,
    contentHash,
    byteSize: 1_024,
    mediaType: "application/pdf"
  });
  assert.equal(read.method, "GET");
  assert.equal(read.path,
    `/v1/courses/${COURSE_ID}/source-attachments/access?expectedRevision=4` +
    `&operation=prepare_upload&sourceId=source-pdf&sourceRevision=2` +
    `&contentHash=${contentHash}&byteSize=1024&mediaType=application%2Fpdf`);

  const command = {
    type: "attach_pdf",
    sourceId: "source-pdf",
    sourceRevision: 2,
    attachment: {
      contentHash,
      byteSize: 1_024,
      mediaType: "application/pdf",
      storagePath: `${COURSE_ID}/${contentHash}.pdf`
    }
  };
  const change = mapAuthoringMcpToolCall("alterarCurso", {
    requestId: REQUEST_ID,
    courseId: COURSE_ID,
    expectedRevision: 4,
    operation: "update_course_sources",
    sourceCommand: command
  });
  assert.equal(change.path, `/v1/courses/${COURSE_ID}/sources/changes`);
  assert.deepEqual(change.body.command, command);

  const ajv = new Ajv2020({ allErrors: true, strict: false });
  const tools = Object.fromEntries(COURSE_MCP_TOOLS.map((tool) => [tool.name, tool]));
  const validateRead = ajv.compile(tools.lerCurso.inputSchema);
  const validateChange = ajv.compile(tools.alterarCurso.inputSchema);
  const download = {
    courseId: COURSE_ID,
    view: "course_source_attachment",
    expectedRevision: 4,
    attachmentOperation: "download",
    sourceId: "source-pdf",
    sourceRevision: 2,
    contentHash
  };
  assert.equal(validateRead(download), false);
  assert.equal(validateRead({
    ...download,
    includeAttachmentDownloadUrl: true
  }), true, JSON.stringify(validateRead.errors));
  assert.equal(validateRead({
    ...download,
    includeAttachmentDownloadUrl: true,
    byteSize: 1_024
  }), false);
  assert.equal(validateRead({
    courseId: COURSE_ID,
    view: "course_source_attachment",
    expectedRevision: 4,
    attachmentOperation: "prepare_upload",
    sourceId: "source-pdf",
    sourceRevision: 2,
    contentHash,
    byteSize: 1_024,
    mediaType: "application/pdf",
    includeAttachmentDownloadUrl: true
  }), false);
  assert.throws(
    () => mapAuthoringMcpToolCall("lerCurso", download),
    (error) => error.code === "attachment_download_url_disclosure_required" &&
      !String(error.message).includes(contentHash)
  );
  const mappedDownload = mapAuthoringMcpToolCall("lerCurso", {
    ...download,
    includeAttachmentDownloadUrl: true
  });
  assert.equal(mappedDownload.path,
    `/v1/courses/${COURSE_ID}/source-attachments/access?expectedRevision=4` +
    `&operation=download&sourceId=source-pdf&sourceRevision=2` +
    `&contentHash=${contentHash}`);
  assert.equal(mappedDownload.path.includes("includeAttachmentDownloadUrl"), false);
  assert.equal(
    mapAuthoringApplicationToolCall("lerCurso", download).path,
    mappedDownload.path
  );
  assert.equal(validateChange({
    requestId: REQUEST_ID,
    courseId: COURSE_ID,
    expectedRevision: 4,
    operation: "update_course_sources",
    sourceCommand: command
  }), true, JSON.stringify(validateChange.errors));
  assert.equal(validateChange({
    requestId: REQUEST_ID,
    courseId: COURSE_ID,
    expectedRevision: 4,
    operation: "update_course_sources",
    sourceCommand: {
      ...command,
      attachment: { ...command.attachment, mediaType: "text/plain" }
    }
  }), false);
});

test("schema MCP anuncia posição 1 para Unidade de estudo e 0 para as demais entidades", () => {
  const changeSchema = COURSE_MCP_TOOLS.find(({ name }) => name === "alterarCurso")
    .inputSchema;
  assert.equal(changeSchema.properties.upserts.items.$ref, "#/$defs/courseEntity");
  const schema = changeSchema.$defs.courseEntity;
  const entityBranch = (type) => schema.oneOf.find((branch) =>
    branch.properties.entityType.const === type
  );
  assert.equal(entityBranch("module").properties.position.minimum, 0);
  assert.equal(entityBranch("study_unit").properties.position.minimum, 1);
  assert.equal(entityBranch("module").properties.parentType.type, "null");
  assert.equal(entityBranch("lesson").properties.parentType.const, "module");
  assert.deepEqual(entityBranch("microsequence").properties.content.properties.role.enum, [
    "explain", "practice", "review", "support"
  ]);
  for (const type of ["module", "lesson", "topic", "microsequence"]) {
    assert.equal(entityBranch(type).properties.content.properties.id, undefined);
    assert.equal(entityBranch(type).properties.content.required.includes("id"), false);
  }
  assert.deepEqual(entityBranch("module").properties.content.properties.guide.required, [
    "goal", "include", "exclude", "notation", "avoid"
  ]);
});

test("perfil e acesso direto ao Estudo permanecem na aplicação e fora do MCP público", () => {
  assert.throws(() => mapAuthoringMcpToolCall("gerirPessoas", {
    operation: "read_profile"
  }), (error) => error.code === "unknown_tool");
  assert.deepEqual(mapAuthoringApplicationToolCall("gerirPessoas", {
    operation: "read_profile"
  }), {
    kind: "route",
    method: "GET",
    path: "/v1/profile",
    requestId: null,
    body: null
  });
  assert.deepEqual(mapAuthoringApplicationToolCall("gerirPessoas", {
    operation: "update_profile",
    displayName: "Pesquisadora",
    avatarObjectKey: `${COURSE_ID}/20000000-0000-4000-8000-000000000002.webp`
  }).body, {
    displayName: "Pesquisadora",
    avatarObjectKey: `${COURSE_ID}/20000000-0000-4000-8000-000000000002.webp`
  });
  assert.equal(mapAuthoringApplicationToolCall("gerirPessoas", {
    operation: "list_access",
    courseId: COURSE_ID
  }).path, `/v1/courses/${COURSE_ID}/access`);
  assert.deepEqual(mapAuthoringApplicationToolCall("gerirPessoas", {
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
  assert.equal(mapAuthoringApplicationToolCall("gerirPessoas", {
    operation: "revoke_access",
    requestId: REQUEST_ID,
    courseId: COURSE_ID,
    userId: "20000000-0000-4000-8000-000000000002",
    confirmed: true
  }).path, `/v1/courses/${COURSE_ID}/access/20000000-0000-4000-8000-000000000002`);

  assert.throws(
    () => mapAuthoringApplicationToolCall("gerirPessoas", {
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

test("MCP lê a inbox situada e preserva filtros e cursor sem aliases", () => {
  const operation = mapAuthoringMcpToolCall("lerCurso", {
    courseId: COURSE_ID,
    view: "anchored_annotations",
    expectedRevision: 7,
    annotationSetVersion: 11,
    mode: "target",
    origins: ["author", "learner"],
    channels: ["authoring_chat", "study_interface"],
    states: ["open"],
    categories: ["possible_error"],
    includeUncategorized: false,
    subjectIds: ["topic-a"],
    targetKind: "study_unit",
    targetId: "unit-a",
    includeDescendants: false,
    cursor: "Y3Vyc29yLTE=",
    limit: 12
  });
  const url = new URL(`https://aralearn.invalid${operation.path}`);
  assert.equal(url.pathname, `/v1/courses/${COURSE_ID}/anchored-annotations`);
  assert.equal(url.searchParams.get("expectedRevision"), "7");
  assert.equal(url.searchParams.get("annotationSetVersion"), "11");
  assert.deepEqual(url.searchParams.getAll("origin"), ["author", "learner"]);
  assert.deepEqual(url.searchParams.getAll("channel"), [
    "authoring_chat", "study_interface"
  ]);
  assert.equal(url.searchParams.get("targetKind"), "study_unit");
  assert.equal(url.searchParams.get("targetId"), "unit-a");
  assert.equal(url.searchParams.get("cursor"), "Y3Vyc29yLTE=");
  assert.equal(Object.hasOwn(operation, "body"), true);
  assert.equal(operation.body, null);
});

test("MCP exige disclosure explícito antes de ler o texto integral de Observação", () => {
  const annotationId = "60000000-0000-4000-8000-000000000006";
  assert.throws(() => mapAuthoringMcpToolCall("lerCurso", {
    courseId: COURSE_ID,
    view: "anchored_annotations",
    expectedRevision: 7,
    mode: "detail",
    annotationId
  }), (error) => error.code === "observation_text_disclosure_required");
  const operation = mapAuthoringMcpToolCall("lerCurso", {
    courseId: COURSE_ID,
    view: "anchored_annotations",
    expectedRevision: 7,
    mode: "detail",
    annotationId,
    includeObservationText: true
  });
  const url = new URL(`https://aralearn.invalid${operation.path}`);
  assert.equal(url.searchParams.get("mode"), "detail");
  assert.equal(url.searchParams.get("annotationId"), annotationId);
  assert.equal(url.searchParams.has("includeObservationText"), false);

  const applicationOperation = mapAuthoringApplicationToolCall("lerCurso", {
    courseId: COURSE_ID,
    view: "anchored_annotations",
    expectedRevision: 7,
    mode: "detail",
    annotationId
  });
  assert.equal(applicationOperation.path, operation.path);
});

test("MCP recusa query de observações que ultrapassa o request-target de 8 KiB", () => {
  const subjectIds = Array.from({ length: 16 }, (_, index) => {
    const prefix = `s${index}-`;
    return `${prefix}${"é".repeat(240 - [...prefix].length)}`;
  });
  assert.throws(
    () => mapAuthoringMcpToolCall("lerCurso", {
      courseId: COURSE_ID,
      view: "anchored_annotations",
      expectedRevision: 7,
      mode: "inbox",
      subjectIds
    }),
    (error) => error.code === "course_anchored_annotations_query_too_large"
  );
});

test("MCP confirma a criação de observação e nunca transporta a conversa", () => {
  const annotationId = "60000000-0000-4000-8000-000000000006";
  const rawText = "  O exemplo contradiz a definição.\nConfira o segundo passo.  ";
  const create = mapAuthoringMcpToolCall("alterarCurso", {
    requestId: REQUEST_ID,
    courseId: COURSE_ID,
    expectedRevision: 7,
    operation: "update_anchored_annotations",
    annotationCommand: {
      type: "create_anchored_annotation",
      annotationId,
      target: { kind: "study_unit", id: "unit-a" },
      rawText,
      category: "possible_error",
      capturedAt: null,
      briefSummary: "Possível contradição no exemplo",
      confirmed: true
    }
  });
  assert.equal(
    create.path,
    `/v1/courses/${COURSE_ID}/anchored-annotations/changes`
  );
  assert.equal(create.body.command.rawText, rawText);
  assert.equal(Object.hasOwn(create.body.command, "confirmed"), false);
  assert.equal(create.body.expectedCourseRevision, 7);

  assert.throws(
    () => mapAuthoringMcpToolCall("alterarCurso", {
      requestId: REQUEST_ID,
      courseId: COURSE_ID,
      expectedRevision: 7,
      operation: "update_anchored_annotations",
      annotationCommand: {
        type: "create_anchored_annotation",
        annotationId,
        target: { kind: "study_unit", id: "unit-a" },
        rawText,
        category: null,
        capturedAt: null,
        briefSummary: "Possível contradição no exemplo"
      }
    }),
    (error) => error.code === "anchored_annotation_confirmation_required"
  );
  assert.throws(
    () => mapAuthoringMcpToolCall("alterarCurso", {
      requestId: REQUEST_ID,
      courseId: COURSE_ID,
      expectedRevision: 7,
      operation: "update_anchored_annotations",
      annotationCommand: {
        type: "create_anchored_annotation",
        annotationId,
        target: { kind: "study_unit", id: "unit-a" },
        rawText,
        category: null,
        capturedAt: null,
        briefSummary: "Possível contradição no exemplo",
        confirmed: true,
        transcript: "conversa completa"
      }
    }),
    (error) => error.code === "invalid_course_anchored_annotation_command"
  );
});

test("MCP separa CAS do Curso da versão da observação", () => {
  const annotationId = "60000000-0000-4000-8000-000000000006";
  const revised = mapAuthoringMcpToolCall("alterarCurso", {
    requestId: REQUEST_ID,
    courseId: COURSE_ID,
    operation: "update_anchored_annotations",
    annotationCommand: {
      type: "revise_anchored_annotation",
      annotationId,
      expectedAnnotationVersion: 2,
      rawText: "Texto revisto",
      category: "confusing",
      briefSummary: null
    }
  });
  assert.equal(revised.body.expectedCourseRevision, null);
  assert.equal(revised.body.command.expectedAnnotationVersion, 2);
  assert.throws(
    () => mapAuthoringMcpToolCall("alterarCurso", {
      requestId: REQUEST_ID,
      courseId: COURSE_ID,
      expectedRevision: 7,
      operation: "update_anchored_annotations",
      annotationCommand: revised.body.command
    }),
    (error) => error.code === "invalid_tool_argument"
  );

  const corrected = mapAuthoringMcpToolCall("alterarCurso", {
    requestId: REQUEST_ID,
    courseId: COURSE_ID,
    expectedRevision: 7,
    operation: "update_anchored_annotations",
    annotationCommand: {
      type: "correct_anchored_annotation_subjects",
      annotationId,
      expectedAnnotationVersion: 2,
      subjectIds: ["topic-a"]
    }
  });
  assert.equal(corrected.body.expectedCourseRevision, 7);
});

test("MCP usa o mesmo fato de Fonte e exige referências na reformulação", () => {
  const annotationId = "60000000-0000-4000-8000-000000000006";
  const sourceId = `  Fonte ${"x".repeat(260)}  `;
  const query = mapAuthoringMcpToolCall("lerCurso", {
    courseId: COURSE_ID,
    view: "anchored_annotations",
    expectedRevision: 7,
    mode: "target",
    targetKind: "source",
    targetId: sourceId,
    includeDescendants: true
  });
  assert.equal(new URL(`https://aralearn.invalid${query.path}`).searchParams.get(
    "targetId"
  ), sourceId);

  const consideredSourceLinks = [{
    sourceId,
    sourceRevision: 3,
    relation: "supported_by",
    anchors: [{ anchorId: "anchor-a", anchorRevision: 2 }]
  }];
  const reformulation = mapAuthoringMcpToolCall("alterarCurso", {
    requestId: REQUEST_ID,
    courseId: COURSE_ID,
    operation: "update_anchored_annotations",
    annotationCommand: {
      type: "respond_to_anchored_annotation",
      annotationId,
      expectedAnnotationVersion: 2,
      ownerResponse: "Interpretação reformulada.",
      responseKind: "reformulation",
      consideredSourceLinks
    }
  });
  assert.deepEqual(reformulation.body.command.consideredSourceLinks,
    consideredSourceLinks);
  assert.equal(reformulation.body.expectedCourseRevision, null);
  assert.throws(() => mapAuthoringMcpToolCall("alterarCurso", {
    requestId: REQUEST_ID,
    courseId: COURSE_ID,
    operation: "update_anchored_annotations",
    annotationCommand: {
      ...reformulation.body.command,
      consideredSourceLinks: []
    }
  }), (error) => error.code === "invalid_course_anchored_annotation_command");
});

test("schema MCP condiciona revisão do Curso sem aumentar o registro de tools", () => {
  assert.equal(COURSE_MCP_TOOLS.length, 5);
  const schema = COURSE_MCP_TOOLS.find(({ name }) => name === "alterarCurso")
    .inputSchema;
  const validate = new Ajv2020({ allErrors: true, strict: false }).compile(schema);
  const annotationId = "60000000-0000-4000-8000-000000000006";
  const create = {
    requestId: REQUEST_ID,
    courseId: COURSE_ID,
    expectedRevision: 7,
    operation: "update_anchored_annotations",
    annotationCommand: {
      type: "create_anchored_annotation",
      annotationId,
      target: { kind: "study_unit", id: "unit-a" },
      rawText: "Possível erro",
      category: "possible_error",
      capturedAt: null,
      briefSummary: "Possível erro na Unidade",
      confirmed: true
    }
  };
  assert.equal(validate(create), true, JSON.stringify(validate.errors));
  assert.equal(validate({ ...create, expectedRevision: undefined }), false);
  assert.equal(validate({
    ...create,
    annotationCommand: { ...create.annotationCommand, capturedAt: "ontem" }
  }), false);
  assert.equal(validate({
    ...create,
    annotationCommand: {
      ...create.annotationCommand,
      capturedAt: "0000-08-17T12:00:00Z"
    }
  }), false);
  assert.equal(validate({
    ...create,
    annotationCommand: {
      ...create.annotationCommand,
      capturedAt: "2026-08-17T12:00:00-03:00"
    }
  }), true, JSON.stringify(validate.errors));
  const revise = {
    requestId: REQUEST_ID,
    courseId: COURSE_ID,
    operation: "update_anchored_annotations",
    annotationCommand: {
      type: "revise_anchored_annotation",
      annotationId,
      expectedAnnotationVersion: 1,
      rawText: "Texto revisto",
      category: null,
      briefSummary: null
    }
  };
  assert.equal(validate(revise), true, JSON.stringify(validate.errors));
  assert.equal(validate({ ...revise, expectedRevision: 7 }), false);
});

test("parâmetro externo distingue herança, resolução automática e decisão explícita", () => {
  const base = {
    requestId: REQUEST_ID,
    courseId: COURSE_ID,
    expectedRevision: 4,
    operation: "update_course_design"
  };
  const automatic = mapAuthoringMcpToolCall("alterarCurso", {
    ...base,
    designCommand: {
      type: "set_parameter",
      scope: { kind: "didactic_microsequence", ref: "micro-a" },
      parameterId: "minimum_distinct_practice_opportunities_per_evidence_requirement",
      value: 3,
      mode: "automatic",
      reason: "O contexto pede três oportunidades distintas para variar suporte e caso."
    }
  });
  assert.deepEqual(automatic.body.command, {
    type: "set_parameter",
    scope: { kind: "didactic_microsequence", ref: "micro-a" },
    parameterId: "minimum_distinct_practice_opportunities_per_evidence_requirement",
    value: 3,
    reason: "O contexto pede três oportunidades distintas para variar suporte e caso.",
    origin: "automatic"
  });
  const explicit = mapAuthoringMcpToolCall("alterarCurso", {
    ...base,
    designCommand: {
      type: "set_parameter",
      scope: { kind: "didactic_microsequence", ref: "micro-a" },
      parameterId: "new_analysis_unit_ceiling_per_expository_study_unit",
      value: 2,
      mode: "explicit",
      origin: "research_condition",
      reason: "Condição experimental fixada antes da produção."
    }
  });
  assert.equal(explicit.body.command.mode, undefined);
  assert.equal(explicit.body.command.origin, "research_condition");
  assert.throws(
    () => mapAuthoringMcpToolCall("alterarCurso", {
      ...base,
      designCommand: {
        type: "set_parameter",
        scope: { kind: "didactic_microsequence", ref: "micro-a" },
        parameterId: "new_analysis_unit_ceiling_per_expository_study_unit",
        value: 2,
        origin: "automatic",
        reason: "Rótulo antigo ambíguo."
      }
    }),
    (error) => error.code === "invalid_tool_argument" &&
      error.details?.field === "designCommand.mode"
  );
  const inherited = mapAuthoringMcpToolCall("alterarCurso", {
    ...base,
    designCommand: {
      type: "clear_parameter",
      scope: { kind: "didactic_microsequence", ref: "micro-a" },
      parameterId: "new_analysis_unit_ceiling_per_expository_study_unit"
    }
  });
  assert.equal(inherited.body.command.type, "clear_parameter");
});
