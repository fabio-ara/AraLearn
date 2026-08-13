import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";

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
assert.ok(Array.isArray(listed.tools) && listed.tools.length >= 10);
assert.ok(listed.tools.length <= 30, "A integração do ChatGPT aceita no máximo 30 operações.");
assert.ok(listed.tools.every((entry) => entry.securitySchemes?.[0]?.type === "oauth2"));
assert.equal(listed.tools.some((entry) => entry.name === "concluirCurso"), false);
assert.equal(
  listed.tools.some((entry) => entry.name === "inserirEntidadeNoWorkspace"),
  false
);
for (const expected of [
  "criarEstruturaNoWorkspace",
  "salvarCardsNaMicrossequencia",
  "reorganizarWorkspace",
  "excluirDoWorkspace"
]) {
  assert.equal(
    listed.tools.some((entry) => entry.name === expected),
    true,
    `Ferramenta incremental ausente: ${expected}.`
  );
}

const fixture = JSON.parse(await readFile(
  new URL("../../tests/fixtures/package/project-minimal.json", import.meta.url),
  "utf8"
));
const workspaceRequestId = randomUUID();
let workspaceId = null;
let workspaceRevision = null;
try {
  const createArguments = {
    requestId: workspaceRequestId,
    title: `Smoke MCP ${new Date().toISOString()}`
  };
  const created = await tool("criarWorkspaceDeAutoria", createArguments);
  workspaceId = created.workspaceId;
  workspaceRevision = created.revision;
  const replayed = await tool("criarWorkspaceDeAutoria", createArguments);
  assert.equal(replayed.workspaceId, workspaceId, "Retry não recuperou o workspace.");

  const course = fixture.courses[0];
  const moduleValue = course.modules[0];
  const lesson = moduleValue.lessons[0];
  const microsequence = lesson.microsequences[0];
  const microsequencePath = [
    course.id,
    moduleValue.id,
    lesson.id,
    microsequence.id
  ];
  const structured = await tool("criarEstruturaNoWorkspace", {
    requestId: randomUUID(),
    workspaceId,
    expectedRevision: created.revision,
    parts: [
      {
        entityType: "course",
        id: course.id,
        title: course.title,
        goal: course.goal
      },
      {
        entityType: "module",
        parentPath: [course.id],
        id: moduleValue.id,
        title: moduleValue.title,
        goal: moduleValue.guide.goal,
        include: moduleValue.guide.include,
        exclude: moduleValue.guide.exclude,
        notation: moduleValue.guide.notation,
        avoid: moduleValue.guide.avoid
      },
      {
        entityType: "lesson",
        parentPath: [course.id, moduleValue.id],
        id: lesson.id,
        title: lesson.title,
        goal: lesson.guide.goal,
        include: lesson.guide.include,
        exclude: lesson.guide.exclude,
        notation: lesson.guide.notation,
        avoid: lesson.guide.avoid,
        topics: lesson.topics
      },
      {
        entityType: "microsequence",
        parentPath: [course.id, moduleValue.id, lesson.id],
        id: microsequence.id,
        title: microsequence.title,
        goal: microsequence.goal,
        role: microsequence.role,
        dependsOn: microsequence.dependsOn,
        covers: microsequence.covers,
        checks: microsequence.checks
      }
    ]
  });
  workspaceRevision = structured.revision;
  const packageCatalog = await tool("consultarBibliotecaDeResources", {
    operation: "search",
    query: "explicação progressiva em prosa",
    slot: "content",
    structureIds: ["structure.prose"],
    limit: 4
  });
  assert.equal(
    packageCatalog.result.candidates.some(
      ({ packageId }) => packageId === "aralearn.resource.paragraph"
    ),
    true
  );
  const paragraphContract = await tool("consultarBibliotecaDeResources", {
    operation: "contracts",
    packages: [{
      packageId: "aralearn.resource.paragraph",
      version: "1.0.0"
    }]
  });
  assert.equal(
    paragraphContract.result.items[0].definition.manifest.id,
    "aralearn.resource.paragraph"
  );
  const authoringCards = structuredClone(microsequence.cards);
  const materialized = await tool("salvarCardsNaMicrossequencia", {
    requestId: randomUUID(),
    workspaceId,
    expectedRevision: structured.revision,
    microsequencePath,
    mode: "replace",
    cardsJson: JSON.stringify(authoringCards)
  });
  workspaceRevision = materialized.revision;
  const renamed = await tool("reorganizarWorkspace", {
    operation: "rename_entity",
    requestId: randomUUID(),
    workspaceId,
    expectedRevision: materialized.revision,
    entityType: "course",
    entityPath: [course.id],
    title: `${course.title} — smoke`
  });
  workspaceRevision = renamed.revision;
  const outline = await tool("lerWorkspaceDeAutoria", {
    workspaceId,
    view: "outline"
  });
  assert.equal(outline.revision, renamed.revision);
  assert.deepEqual(outline.content.courses[0].entityPath, [course.id]);
  const cards = await tool("listarCardsDaMicrossequencia", {
    workspaceId,
    microsequencePath,
    limit: 20
  });
  assert.equal(cards.items.length, authoringCards.length);
  const microtheories = await tool("revisarMicroteoriasDoWorkspace", {
    workspaceId,
    entityPath: microsequencePath
  });
  assert.ok(
    microtheories.content.courses[0].modules[0].lessons[0].microtheories.length > 0
  );
} finally {
  if (workspaceId) {
    await tool("excluirDoWorkspace", {
      operation: "delete_workspace",
      requestId: randomUUID(),
      workspaceId,
      expectedRevision: workspaceRevision
    });
  }
}

console.log(
  "Smoke MCP hospedado v5: OAuth, replay, autoria incremental, leitura e limpeza aprovados."
);
