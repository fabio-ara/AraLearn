import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";

const projectUrl = String(
  process.env.SUPABASE_URL || process.env.API_URL || "http://127.0.0.1:54321"
).replace(/\/+$/u, "");
const serviceRoleKey = String(
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SERVICE_ROLE_KEY || ""
).trim();
const edgeUrl = `${projectUrl}/functions/v1/aralearn-authoring-api`;
const origin = "http://127.0.0.1:4182";

assert(
  new Set(["127.0.0.1", "localhost"]).has(new URL(projectUrl).hostname),
  "Este smoke só pode alterar o Supabase local."
);
assert(serviceRoleKey, "Service role local ausente.");

async function body(response) {
  const source = await response.text();
  try {
    return source ? JSON.parse(source) : null;
  } catch {
    return source;
  }
}

async function request(url, options, expected = 200) {
  const response = await fetch(url, options);
  const value = await body(response);
  assert.equal(
    response.status,
    expected,
    `HTTP ${response.status}: ${value?.error?.message || value?.message || value}`
  );
  return value;
}

function adminHeaders() {
  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    "Content-Type": "application/json"
  };
}

async function rpc(name, payload) {
  return request(`${projectUrl}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: adminHeaders(),
    body: JSON.stringify(payload)
  });
}

let user = null;
let clientId = null;
let apiKey = null;
let workspaceId = null;
try {
  user = await request(`${projectUrl}/auth/v1/admin/users`, {
    method: "POST",
    headers: adminHeaders(),
    body: JSON.stringify({
      email: `workspace-${randomBytes(6).toString("hex")}@aralearn.local`,
      password: `Arl!${randomBytes(18).toString("base64url")}`,
      email_confirm: true
    })
  });
  apiKey = `arl_${randomBytes(36).toString("base64url")}`;
  const client = await rpc("create_authoring_api_client", {
    p_actor_user_id: user.id,
    p_owner_user_id: user.id,
    p_name: "Smoke workspace REST",
    p_key_prefix: apiKey.slice(0, 16),
    p_api_key_hash: createHash("sha256").update(apiKey).digest("hex"),
    p_scopes: ["authoring:private:read", "authoring:private:write"],
    p_rate_limit_per_minute: 120,
    p_expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString()
  });
  clientId = client.clientId;
  const headers = {
    Origin: origin,
    "Content-Type": "application/json",
    "X-AraLearn-API-Key": apiKey
  };
  const requestId = randomUUID();
  const created = await request(`${edgeUrl}/v1/workspaces`, {
    method: "POST",
    headers,
    body: JSON.stringify({ requestId, title: "Smoke workspace REST" })
  });
  assert.equal(created.ok, true);
  assert.match(created.data.workspaceId, /^[0-9a-f-]{36}$/u);
  workspaceId = created.data.workspaceId;

  const replayed = await request(`${edgeUrl}/v1/workspaces`, {
    method: "POST",
    headers,
    body: JSON.stringify({ requestId, title: "Smoke workspace REST" })
  });
  assert.equal(replayed.data.workspaceId, workspaceId);

  const read = await request(`${edgeUrl}/v1/workspaces/${workspaceId}?view=outline`, {
    method: "GET",
    headers
  });
  assert.equal(read.data.workspaceId, workspaceId);

  const removed = await request(`${edgeUrl}/v1/workspaces/${workspaceId}`, {
    method: "DELETE",
    headers,
    body: JSON.stringify({ requestId: randomUUID() })
  });
  assert.equal(removed.data.deleted, true);
  workspaceId = null;
  console.log("Smoke REST de workspace: aprovado.");
} finally {
  if (clientId && user?.id) {
    await rpc("revoke_authoring_api_client", {
      p_actor_user_id: user.id,
      p_client_id: clientId
    }).catch(() => null);
  }
  if (user?.id) {
    await fetch(`${projectUrl}/auth/v1/admin/users/${user.id}`, {
      method: "DELETE",
      headers: adminHeaders()
    }).catch(() => null);
  }
}
