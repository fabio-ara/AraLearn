import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import { flattenCourseDocument } from "../../src/domain/courseEntities.js";

const projectUrl = String(
  process.env.SUPABASE_URL || process.env.API_URL || "http://127.0.0.1:54321"
).replace(/\/+$/u, "");
const accessToken = String(
  process.env.ARALEARN_AUTHORING_MCP_OAUTH_TOKEN || ""
).trim();
const requireOAuth =
  String(process.env.ARALEARN_AUTHORING_MCP_REQUIRE_OAUTH || "").trim() === "1";
const origin = "http://127.0.0.1:4182";
const edgeUrl = `${projectUrl}/functions/v1/aralearn-authoring-mcp`;
const protocolVersion = "2025-11-25";
const hostname = new URL(projectUrl).hostname;

assert(new Set(["127.0.0.1", "localhost"]).has(hostname), "Este smoke só usa o Supabase local.");

async function json(response) {
  const source = await response.text();
  try {
    return source ? JSON.parse(source) : null;
  } catch {
    return source;
  }
}

const metadataResponse = await fetch(
  `${edgeUrl}/.well-known/oauth-protected-resource`
);
assert.equal(metadataResponse.status, 200);
const metadata = await metadataResponse.json();
assert.equal(metadata.resource, edgeUrl);
assert.deepEqual(metadata.scopes_supported, ["openid"]);
assert.deepEqual(metadata.authorization_servers, [`${projectUrl}/auth/v1`]);

const rejectedAnonymous = await fetch(edgeUrl, {
  method: "POST",
  headers: {
    Accept: "application/json, text/event-stream",
    "Content-Type": "application/json",
    Origin: origin,
    "MCP-Protocol-Version": protocolVersion
  },
  body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "ping", params: {} })
});
assert.equal(rejectedAnonymous.status, 401);
assert.match(rejectedAnonymous.headers.get("www-authenticate"), /resource_metadata=/u);
assert.equal((await json(rejectedAnonymous)).error.data.code, "authentication_required");

if (!accessToken) {
  assert.equal(
    requireOAuth,
    false,
    "O smoke MCP autenticado exige um access token OAuth provisionado."
  );
  console.log(
    "Smoke MCP local: metadata e separação da chave HTTP aprovadas; "
    + "defina ARALEARN_AUTHORING_MCP_OAUTH_TOKEN para executar mutações OAuth locais."
  );
} else {
  assert.notEqual(
    accessToken,
    String(
      process.env.SUPABASE_SERVICE_ROLE_KEY
      || process.env.SERVICE_ROLE_KEY
      || ""
    ).trim(),
    "A service role não pode ser usada como bearer do MCP."
  );
  let rpcId = 1;
  async function call(method, params = {}) {
    rpcId += 1;
    const response = await fetch(edgeUrl, {
      method: "POST",
      headers: {
        Accept: "application/json, text/event-stream",
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        Origin: origin,
        "MCP-Protocol-Version": protocolVersion
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: rpcId, method, params })
    });
    const body = await json(response);
    assert.equal(response.status, 200, JSON.stringify(body));
    assert.equal(body.error, undefined, body.error?.message);
    return body.result;
  }
  async function tool(name, argumentsValue = {}) {
    const result = await call("tools/call", { name, arguments: argumentsValue });
    assert.equal(result.isError, false, result.structuredContent?.error?.message);
    return result.structuredContent.data;
  }

  const initialized = await call("initialize", {
    protocolVersion,
    capabilities: {},
    clientInfo: { name: "aralearn-local-smoke", version: "1" }
  });
  assert.equal(initialized.protocolVersion, protocolVersion);

  const listed = await call("tools/list");
  const toolNames = listed.tools.map(({ name }) => name);
  assert.deepEqual(toolNames, [
    "listarCursos",
    "lerCurso",
    "criarCurso",
    "alterarCurso",
    "gerirPessoas",
    "consultarComponentesDidaticos"
  ]);
  assert.equal(
    toolNames.some((name) => /workspace|trilha|cole(?:ç|c)[aã]o|publica(?:ç|c)[aã]o/iu.test(name)),
    false
  );

  const created = await tool("criarCurso", {
    requestId: randomUUID(),
    title: "Curso OAuth local",
    objective: "Validar a autoria canônica pelo MCP"
  });
  assert.match(String(created.courseId || ""), /^[0-9a-f-]{36}$/iu);
  assert.equal(created.revision, 1);

  const read = await tool("lerCurso", {
    courseId: created.courseId,
    view: "outline"
  });
  assert.equal(read.courseId, created.courseId);
  assert.equal(read.revision, 1);

  const compositionRows = flattenCourseDocument({
    contract: "aralearn.course.v1",
    courses: [{
      id: created.courseId,
      title: "Curso OAuth local",
      goal: "Validar a autoria canônica pelo MCP",
      modules: [{
        id: "module-mcp-smoke",
        title: "Módulo MCP",
        guide: {
          goal: "Validar a escrita MCP.",
          include: ["Curso"],
          exclude: [],
          notation: [],
          avoid: []
        },
        lessons: [{
          id: "lesson-mcp-smoke",
          title: "Lição MCP",
          guide: {
            goal: "Validar a leitura MCP.",
            include: ["Curso"],
            exclude: [],
            notation: [],
            avoid: []
          },
          topics: [],
          microsequences: [{
            id: "microsequence-mcp-smoke",
            title: "Microssequência MCP",
            goal: "Paginar Unidades pelo contrato corrente.",
            role: "explain",
            dependsOn: [],
            covers: [],
            checks: [],
            errors: [],
            studyUnits: [1, 2].map((position) => ({
              id: `study-unit-mcp-smoke-${position}`,
              position,
              title: `Unidade MCP ${position}`,
              role: "theory",
              content: [{
                id: `content-mcp-smoke-${position}`,
                package: "aralearn.resource.paragraph",
                version: "1.0.0",
                data: { text: `Conteúdo MCP ${position}.` }
              }],
              response: null,
              feedback: [],
              topics: [],
              sources: []
            }))
          }]
        }]
      }]
    }]
  }).rows;
  assert.equal(
    compositionRows.some(({ entityType }) => entityType === "study_unit"),
    true
  );

  const changed = await tool("alterarCurso", {
    requestId: randomUUID(),
    courseId: created.courseId,
    expectedRevision: read.revision,
    operation: "commit_course_composition",
    upserts: compositionRows,
    deletes: []
  });
  assert.equal(changed.revision, 2);
  assert.equal(changed.upsertedCount, 5);

  const firstPage = await tool("lerCurso", {
    courseId: created.courseId,
    view: "study_units",
    expectedRevision: changed.revision,
    scope: { kind: "course" },
    direction: "forward",
    limit: 1,
    maxBytes: 65_536
  });
  assert.equal(
    firstPage.contract,
    "aralearn.course-study-unit-inspection-page.v1"
  );
  assert.equal(firstPage.totalCount, 2);
  assert.equal(firstPage.items[0].studyUnit.id, "study-unit-mcp-smoke-1");
  assert.deepEqual(firstPage.nextCursor, {
    studyUnitId: "study-unit-mcp-smoke-1"
  });

  const secondPage = await tool("lerCurso", {
    courseId: created.courseId,
    view: "study_units",
    expectedRevision: changed.revision,
    scope: { kind: "course" },
    cursor: firstPage.nextCursor,
    direction: "forward",
    limit: 1,
    maxBytes: 65_536
  });
  assert.equal(secondPage.items[0].studyUnit.id, "study-unit-mcp-smoke-2");
  assert.equal(secondPage.hasPrevious, true);
  assert.equal(secondPage.hasMore, false);

  const analysisItemId = randomUUID();
  const evidenceItemId = randomUUID();
  const analysisChange = await tool("alterarCurso", {
    requestId: randomUUID(),
    courseId: created.courseId,
    expectedRevision: changed.revision,
    expectedPlanVersion: 1,
    operation: "update_instructional_plan",
    planCommand: {
      type: "add_plan_item",
      kind: "instructional_analysis_unit",
      id: analysisItemId,
      position: 0,
      statement: "Distinguir configuração DNS de concessão DHCP."
    }
  });
  assert.equal(analysisChange.courseRevision, changed.revision + 1);
  assert.equal(analysisChange.planVersion, 2);
  const evidenceChange = await tool("alterarCurso", {
    requestId: randomUUID(),
    courseId: created.courseId,
    expectedRevision: analysisChange.courseRevision,
    expectedPlanVersion: analysisChange.planVersion,
    operation: "update_instructional_plan",
    planCommand: {
      type: "add_plan_item",
      kind: "evidence_requirement",
      id: evidenceItemId,
      position: 0,
      statement: "Explicar a relação DNS–DHCP em um caso novo."
    }
  });
  assert.equal(evidenceChange.courseRevision, changed.revision + 2);
  assert.equal(evidenceChange.planVersion, 3);

  const targetChange = await tool("alterarCurso", {
    requestId: randomUUID(),
    courseId: created.courseId,
    expectedRevision: evidenceChange.courseRevision,
    operation: "update_course_design",
    designCommand: {
      type: "set_target_plan_items",
      scope: {
        kind: "didactic_microsequence",
        ref: "microsequence-mcp-smoke"
      },
      instructionalAnalysisUnitIds: [analysisItemId],
      evidenceRequirementIds: [evidenceItemId]
    }
  });
  assert.equal(targetChange.courseRevision, changed.revision + 3);
  assert.equal(targetChange.change.type, "set_target_plan_items");

  const targetDesign = await tool("lerCurso", {
    courseId: created.courseId,
    view: "course_design",
    scope: {
      kind: "didactic_microsequence",
      ref: "microsequence-mcp-smoke"
    },
    limit: 32
  });
  assert.deepEqual(targetDesign.targetPlanItems, {
    instructionalAnalysisUnitIds: [analysisItemId],
    evidenceRequirementIds: [evidenceItemId]
  });

  const initialDesign = await tool("lerCurso", {
    courseId: created.courseId,
    view: "course_design",
    scope: { kind: "course", ref: created.courseId },
    limit: 32
  });
  assert.equal(initialDesign.contract, "aralearn.course-design.v1");
  assert.equal(initialDesign.targetPlanItems, null);
  assert.equal(initialDesign.definitions.length, 4);
  assert.equal(initialDesign.componentCatalog.options.length, 32);

  const designChange = await tool("alterarCurso", {
    requestId: randomUUID(),
    courseId: created.courseId,
    expectedRevision: targetChange.courseRevision,
    operation: "update_course_design",
    designCommand: {
      type: "set_parameter",
      scope: { kind: "course", ref: created.courseId },
      parameterId: "new_analysis_unit_ceiling_per_expository_study_unit",
      value: 3,
      origin: "author",
      reason: "Exercitar a resolução explícita pelo MCP local."
    }
  });
  assert.equal(designChange.courseRevision, changed.revision + 4);
  assert.equal(designChange.change.type, "set_parameter");

  const resolvedDesign = await tool("lerCurso", {
    courseId: created.courseId,
    view: "course_design",
    scope: { kind: "course", ref: created.courseId },
    limit: 32
  });
  const resolvedCeiling = resolvedDesign.parameters.find(
    ({ parameterId }) => parameterId
      === "new_analysis_unit_ceiling_per_expository_study_unit"
  );
  assert.equal(resolvedCeiling.effectiveAssignment.value, 3);

  const own = await tool("listarCursos", { query: "OAuth local" });
  assert.equal(
    own.items.some(({ courseId }) => courseId === created.courseId),
    true
  );
  const profile = await tool("gerirPessoas", { operation: "read_profile" });
  assert.match(String(profile.userId || ""), /^[0-9a-f-]{36}$/iu);

  console.log("Smoke MCP local: OAuth e Curso vivo aprovados.");
}
