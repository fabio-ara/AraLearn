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
assert.deepEqual(initialized.capabilities, { tools: { listChanged: false } });

await call("ping");
const listed = await call("tools/list");
assert.ok(Array.isArray(listed.tools) && listed.tools.length >= 10);
assert.ok(listed.tools.every((entry) => entry.securitySchemes?.[0]?.type === "oauth2"));
assert.equal(listed.tools.some((entry) => entry.name === "concluirCurso"), false);

const fixture = JSON.parse(await readFile(
  new URL("../../docs/examples/aralearn-contract.logic-plane-matrix-course.json", import.meta.url),
  "utf8"
));
const workspaceRequestId = randomUUID();
let workspaceId = null;
try {
  const createArguments = {
    requestId: workspaceRequestId,
    title: `Smoke MCP ${new Date().toISOString()}`
  };
  const created = await tool("criarWorkspaceDeAutoria", createArguments);
  workspaceId = created.workspaceId;
  const replayed = await tool("criarWorkspaceDeAutoria", createArguments);
  assert.equal(replayed.workspaceId, workspaceId, "Retry não recuperou o workspace.");

  const inserted = await tool("inserirEntidadeNoWorkspace", {
    requestId: randomUUID(),
    workspaceId,
    expectedRevision: created.revision,
    entityType: "course",
    parentPath: null,
    entity: fixture.courses[0]
  });
  const renamed = await tool("renomearEntidadeNoWorkspace", {
    requestId: randomUUID(),
    workspaceId,
    expectedRevision: inserted.revision,
    entityType: "course",
    entityPath: [fixture.courses[0].id],
    title: `${fixture.courses[0].title} — smoke`
  });
  const outline = await tool("lerWorkspaceDeAutoria", {
    workspaceId,
    revision: renamed.revision,
    view: "outline"
  });
  assert.deepEqual(outline.content.courses[0].entityPath, [fixture.courses[0].id]);
  const microtheories = await tool("revisarMicroteoriasDoWorkspace", {
    workspaceId,
    revision: renamed.revision,
    entityPath: [fixture.courses[0].id]
  });
  assert.ok(
    microtheories.content.courses[0].modules[0].lessons[0].microtheories.length > 0
  );
} finally {
  if (workspaceId) {
    await tool("excluirWorkspaceDeAutoria", {
      requestId: randomUUID(),
      workspaceId
    });
  }
}

console.log("Smoke MCP hospedado v4: OAuth, metadata, replay, mutação e leitura aprovados.");
