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

  const own = await tool("listarCursos", { query: "OAuth local" });
  assert.equal(
    own.items.some(({ courseId }) => courseId === created.courseId),
    true
  );
  const profile = await tool("gerirPessoas", { operation: "read_profile" });
  assert.match(String(profile.userId || ""), /^[0-9a-f-]{36}$/iu);

  console.log("Smoke MCP local: OAuth e Curso vivo aprovados.");
}
