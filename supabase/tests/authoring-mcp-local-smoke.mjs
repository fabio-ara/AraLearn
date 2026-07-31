import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

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

  let workspaceId = null;
  try {
    const created = await tool("criarWorkspaceDeAutoria", {
      requestId: randomUUID(),
      title: "Workspace OAuth local"
    });
    workspaceId = created.workspaceId;
    const own = await tool("lerWorkspaceDeAutoria", {
      workspaceId,
      view: "outline"
    });
    assert.equal(own.workspaceId, workspaceId);
  } finally {
    if (workspaceId) {
      await tool("excluirDoWorkspace", {
        operation: "delete_workspace",
        requestId: randomUUID(),
        workspaceId
      });
    }
  }
  console.log("Smoke MCP local: metadata e fluxo OAuth mutável aprovados.");
}
