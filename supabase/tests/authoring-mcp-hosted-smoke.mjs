import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import { flattenCourseDocument } from "../../src/domain/courseEntities.js";

const projectUrl = String(process.env.SUPABASE_URL || "").trim().replace(/\/+$/u, "");
const accessToken = String(
  process.env.ARALEARN_AUTHORING_MCP_OAUTH_TOKEN || ""
).trim();
const origin = String(process.env.ARALEARN_AUTHORING_MCP_ORIGIN || "")
  .trim()
  .replace(/\/+$/u, "");

assert.match(projectUrl, /^https:\/\/[^/]+$/u, "Informe a Project URL HTTPS em SUPABASE_URL.");
assert.match(accessToken, /^[^.]+\.[^.]+\.[^.]+$/u, "Informe um access token OAuth em ARALEARN_AUTHORING_MCP_OAUTH_TOKEN.");
assert.match(origin, /^https:\/\/[^/]+$/u, "Informe uma origem HTTPS permitida.");
assert.equal(
  Object.hasOwn(process.env, "SUPABASE_SERVICE_ROLE_KEY"),
  false,
  "O smoke hospedado do MCP não aceita service role."
);
const edgeUrl = `${projectUrl}/functions/v1/aralearn-authoring-mcp`;
const protocolVersion = "2025-11-25";
let rpcId = 0;

async function readJson(response, label) {
  const source = await response.text();
  try {
    return source ? JSON.parse(source) : null;
  } catch {
    assert.fail(`${label}: resposta não contém JSON.`);
  }
}

async function call(method, params = {}, { initialize = false } = {}) {
  rpcId += 1;
  const response = await fetch(edgeUrl, {
    method: "POST",
    headers: {
      Accept: "application/json, text/event-stream",
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      Origin: origin,
      ...(initialize ? {} : { "MCP-Protocol-Version": protocolVersion })
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: rpcId, method, params })
  });
  const body = await readJson(response, method);
  assert.equal(
    response.status,
    200,
    `${method}: HTTP ${response.status}: ${body?.error?.message || JSON.stringify(body)}`
  );
  assert.equal(body?.jsonrpc, "2.0");
  assert.equal(body?.id, rpcId);
  assert.equal(body?.error, undefined, body?.error?.message);
  assert.equal(response.headers.get("mcp-session-id"), null, "O servidor deve permanecer stateless.");
  return body.result;
}

async function tool(name, argumentsValue = {}) {
  const result = await call("tools/call", { name, arguments: argumentsValue });
  assert.equal(
    result?.isError,
    false,
    `${name}: ${result?.structuredContent?.error?.message || "erro MCP"}`
  );
  assert.equal(result.structuredContent.ok, true);
  return result.structuredContent.data;
}

const metadataResponse = await fetch(
  `${edgeUrl}/.well-known/oauth-protected-resource`
);
assert.equal(metadataResponse.status, 200, "Protected-resource metadata indisponível.");
const metadata = await metadataResponse.json();
assert.equal(metadata.resource, edgeUrl);
assert.deepEqual(metadata.scopes_supported, ["openid"]);
assert.deepEqual(metadata.authorization_servers, [`${projectUrl}/auth/v1`]);

const discoveryResponse = await fetch(
  `${projectUrl}/.well-known/oauth-authorization-server/auth/v1`
);
assert.equal(discoveryResponse.status, 200, "OAuth discovery do Supabase indisponível.");
const discovery = await discoveryResponse.json();
assert.match(discovery.authorization_endpoint, /\/auth\/v1\/oauth\/authorize$/u);
assert.match(discovery.token_endpoint, /\/auth\/v1\/oauth\/token$/u);
assert.ok(
  discovery.code_challenge_methods_supported?.includes("S256"),
  "OAuth Server não anuncia PKCE S256."
);

const initialized = await call("initialize", {
  protocolVersion,
  capabilities: {},
  clientInfo: { name: "aralearn-hosted-smoke", version: "2" }
}, { initialize: true });
assert.equal(initialized.protocolVersion, protocolVersion);
assert.equal(initialized.capabilities.tools.listChanged, false);

await call("ping");
const listed = await call("tools/list");
assert.deepEqual(listed.tools.map(({ name }) => name), [
  "listarCursos",
  "lerCurso",
  "criarCurso",
  "alterarCurso",
  "gerirPessoas",
  "consultarComponentesDidaticos"
]);
assert.ok(listed.tools.every((entry) => entry.securitySchemes?.[0]?.type === "oauth2"));
assert.equal(
  listed.tools.some(({ name }) =>
    /workspace|trilha|cole(?:ç|c)[aã]o|publica(?:ç|c)[aã]o/iu.test(name)
  ),
  false
);

const profile = await tool("gerirPessoas", { operation: "read_profile" });
assert.match(String(profile.userId || ""), /^[0-9a-f-]{36}$/iu);
const componentSearch = await tool("consultarComponentesDidaticos", {
  operation: "search",
  query: "explicação progressiva em prosa",
  slot: "content",
  limit: 4
});
assert.equal(componentSearch.contract, "aralearn.instructional-component-library.v1");
assert.equal(
  componentSearch.result.candidates.some(
    ({ packageId }) => packageId === "aralearn.resource.paragraph"
  ),
  true
);

if (process.env.ARALEARN_AUTHORING_MCP_EPHEMERAL_USER === "1") {
  const createArguments = {
    requestId: randomUUID(),
    title: `Smoke MCP ${new Date().toISOString()}`,
    objective: "Validar o contrato hospedado corrente sem conservar dados de teste."
  };
  const created = await tool("criarCurso", createArguments);
  const replayed = await tool("criarCurso", createArguments);
  assert.equal(replayed.courseId, created.courseId, "Retry não recuperou o Curso.");
  assert.equal(replayed.idempotent, true);

  const compositionRows = flattenCourseDocument({
    contract: "aralearn.course.v1",
    courses: [{
      id: created.courseId,
      title: createArguments.title,
      goal: createArguments.objective,
      modules: [{
        id: "module-hosted-smoke",
        title: "Módulo hospedado",
        guide: {
          goal: "Validar o módulo.", include: ["Curso"], exclude: [], notation: [], avoid: []
        },
        lessons: [{
          id: "lesson-hosted-smoke",
          title: "Lição hospedada",
          guide: {
            goal: "Validar a lição.", include: ["Curso"], exclude: [], notation: [], avoid: []
          },
          topics: [],
          microsequences: [{
            id: "microsequence-hosted-smoke",
            title: "Microssequência hospedada",
            goal: "Validar a paginação owner-only.",
            role: "explain",
            dependsOn: [], covers: [], checks: [], errors: [],
            studyUnits: [1, 2].map((position) => ({
              id: `study-unit-hosted-smoke-${position}`,
              position,
              title: `Unidade hospedada ${position}`,
              role: "theory",
              content: [{
                id: `content-hosted-smoke-${position}`,
                package: "aralearn.resource.paragraph",
                version: "1.0.0",
                data: { text: `Conteúdo hospedado ${position}.` }
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
  assert.equal(compositionRows.some(({ entityType }) => entityType === "study_unit"), true);
  const changed = await tool("alterarCurso", {
    requestId: randomUUID(),
    courseId: created.courseId,
    expectedRevision: created.revision,
    operation: "commit_course_composition",
    upserts: compositionRows,
    deletes: []
  });
  assert.equal(changed.revision, 2);

  const firstPage = await tool("lerCurso", {
    courseId: created.courseId,
    view: "study_units",
    expectedRevision: changed.revision,
    scope: { kind: "course" },
    direction: "forward",
    limit: 1,
    maxBytes: 65_536
  });
  assert.equal(firstPage.contract, "aralearn.course-study-unit-inspection-page.v1");
  assert.equal(firstPage.items[0].studyUnit.id, "study-unit-hosted-smoke-1");
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
  assert.equal(secondPage.items[0].studyUnit.id, "study-unit-hosted-smoke-2");

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
        ref: "microsequence-hosted-smoke"
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
      ref: "microsequence-hosted-smoke"
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
      reason: "Exercitar o desenho parametrizado no smoke hospedado."
    }
  });
  assert.equal(designChange.courseRevision, changed.revision + 4);
  assert.equal(designChange.change.type, "set_parameter");
}

console.log(
  "Smoke MCP hospedado: OAuth, ferramentas correntes, desenho, componentes e Inspeção aprovados."
);
