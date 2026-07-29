import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";

const projectUrl = String(
  process.env.SUPABASE_URL || process.env.API_URL || "http://127.0.0.1:54321"
).replace(/\/+$/u, "");
const serviceRoleKey = String(
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SERVICE_ROLE_KEY || ""
).trim();
const origin = "http://127.0.0.1:4182";
const edgeUrl = `${projectUrl}/functions/v1/aralearn-authoring-mcp`;
const protocolVersion = "2025-11-25";
const hostname = new URL(projectUrl).hostname;

assert(new Set(["127.0.0.1", "localhost"]).has(hostname), "Este smoke só pode alterar o Supabase local.");
assert(serviceRoleKey, "Service role local ausente.");

async function readBody(response) {
  const source = await response.text();
  try {
    return source ? JSON.parse(source) : null;
  } catch {
    return source;
  }
}

async function request(url, options, expectedStatus = 200) {
  const response = await fetch(url, options);
  const body = await readBody(response);
  assert.equal(response.status, expectedStatus, `HTTP ${response.status}: ${body?.error?.message || body?.message || body}`);
  return { response, body };
}

function adminHeaders() {
  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    "Content-Type": "application/json"
  };
}

async function rpc(name, payload) {
  return (await request(`${projectUrl}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: adminHeaders(),
    body: JSON.stringify(payload)
  })).body;
}

async function createUser(label) {
  const password = `Arl!${randomBytes(18).toString("base64url")}`;
  return (await request(`${projectUrl}/auth/v1/admin/users`, {
    method: "POST",
    headers: adminHeaders(),
    body: JSON.stringify({
      email: `mcp-${label}-${randomBytes(5).toString("hex")}@aralearn.local`,
      password,
      email_confirm: true
    })
  })).body;
}

async function createClient(userId, label) {
  const key = `arl_${randomBytes(36).toString("base64url")}`;
  const created = await rpc("create_authoring_api_client", {
    p_actor_user_id: userId,
    p_owner_user_id: userId,
    p_name: `MCP ${label}`,
    p_key_prefix: key.slice(0, 16),
    p_api_key_hash: createHash("sha256").update(key).digest("hex"),
    p_scopes: [
      "authoring:private:read",
      "authoring:private:write",
      "authoring:private:audit"
    ],
    p_rate_limit_per_minute: 120,
    p_expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString()
  });
  assert.match(created.clientId, /^[0-9a-f-]{36}$/u, "A criação da chave deve devolver clientId.");
  return { key, clientId: created.clientId, ownerUserId: userId };
}

let rpcId = 0;
async function mcp(apiKey, method, params = {}, expectedStatus = 200) {
  rpcId += 1;
  return request(edgeUrl, {
    method: "POST",
    headers: {
      Accept: "application/json, text/event-stream",
      "Content-Type": "application/json",
      Origin: origin,
      "MCP-Protocol-Version": protocolVersion,
      "X-AraLearn-API-Key": apiKey
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: rpcId, method, params })
  }, expectedStatus);
}

function toolResult(response, { error = false } = {}) {
  assert.equal(response.body?.jsonrpc, "2.0");
  assert.equal(response.body?.result?.isError, error);
  return response.body.result.structuredContent;
}

let userA = null;
let userB = null;
let clientA = null;
let clientB = null;
let workspaceId = null;
try {
  userA = await createUser("a");
  userB = await createUser("b");
  clientA = await createClient(userA.id, "A");
  clientB = await createClient(userB.id, "B");
  const keyA = clientA.key;
  const keyB = clientB.key;

  const initialized = await mcp(keyA, "initialize", {
    protocolVersion,
    capabilities: {},
    clientInfo: { name: "aralearn-local-smoke", version: "1" }
  });
  assert.equal(initialized.body.result.protocolVersion, protocolVersion);
  assert.equal(initialized.response.headers.get("mcp-session-id"), null);
  const tools = await mcp(keyA, "tools/list");
  assert.ok(tools.body.result.tools.length >= 10);

  const createRequestId = randomUUID();
  const createArguments = {
    requestId: createRequestId,
    title: "Workspace privado do smoke MCP"
  };
  const created = toolResult(await mcp(keyA, "tools/call", {
    name: "criarWorkspaceDeAutoria",
    arguments: createArguments
  }));
  assert.equal(created.ok, true);
  assert.match(created.data.workspaceId, /^[0-9a-f-]{36}$/u);
  workspaceId = created.data.workspaceId;

  const replayed = toolResult(await mcp(keyA, "tools/call", {
    name: "criarWorkspaceDeAutoria",
    arguments: createArguments
  }));
  assert.equal(replayed.data.workspaceId, created.data.workspaceId);

  const ownWorkspace = toolResult(await mcp(keyA, "tools/call", {
    name: "lerWorkspaceDeAutoria",
    arguments: { workspaceId: created.data.workspaceId, view: "outline" }
  }));
  assert.equal(ownWorkspace.data.workspaceId, created.data.workspaceId);

  const foreignWorkspace = await mcp(keyB, "tools/call", {
    name: "lerWorkspaceDeAutoria",
    arguments: { workspaceId: created.data.workspaceId, view: "outline" }
  }, 403);
  assert.equal(foreignWorkspace.body?.error?.data?.code, "not_authorized");

  const anonymous = await request(edgeUrl, {
    method: "POST",
    headers: {
      Accept: "application/json, text/event-stream",
      "Content-Type": "application/json",
      Origin: origin,
      "MCP-Protocol-Version": protocolVersion
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 999, method: "ping", params: {} })
  }, 401);
  assert.equal(anonymous.body.error.data.code, "authentication_required");

  console.log("Smoke MCP local: aprovado (protocolo, chave pessoal, idempotência e isolamento A/B).");
} finally {
  if (workspaceId && clientA?.key) {
    try {
      const removed = await mcp(clientA.key, "tools/call", {
        name: "excluirWorkspaceDeAutoria",
        arguments: {
          requestId: randomUUID(),
          workspaceId
        }
      });
      if (removed.body?.result?.isError) {
        throw new Error(removed.body.result.structuredContent?.error?.message || "exclusão rejeitada");
      }
    } catch (error) {
      console.warn(`Teardown não removeu o workspace MCP ${workspaceId}: ${error.message}`);
    }
  }
  for (const client of [clientA, clientB]) {
    if (!client?.clientId || !client?.ownerUserId) continue;
    try {
      await rpc("revoke_authoring_api_client", {
        p_actor_user_id: client.ownerUserId,
        p_client_id: client.clientId
      });
    } catch (error) {
      console.warn(`Teardown não revogou o cliente MCP ${client.clientId}: ${error.message}`);
    }
  }
  for (const user of [userA, userB]) {
    if (!user?.id) continue;
    const response = await fetch(`${projectUrl}/auth/v1/admin/users/${user.id}`, {
      method: "DELETE",
      headers: adminHeaders()
    });
    if (!response.ok) {
      console.warn(`Teardown não removeu o usuário MCP ${user.id}: HTTP ${response.status}.`);
    }
  }
}
