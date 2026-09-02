import assert from "node:assert/strict";

import {
  COURSE_HUMAN_TASK_CATALOG_HEADER,
  COURSE_HUMAN_TASK_CATALOG_METADATA,
  COURSE_HUMAN_TASKS
} from "../functions/_shared/aralearn-authoring/courseHumanTasks.js";

const projectUrl = String(
  process.env.SUPABASE_URL || process.env.API_URL || "http://127.0.0.1:54321"
).replace(/\/+$/u, "");
const accessToken = String(
  process.env.ARALEARN_AUTHORING_MCP_OAUTH_TOKEN || ""
).trim();
const requireOAuth =
  String(process.env.ARALEARN_AUTHORING_MCP_REQUIRE_OAUTH || "").trim() === "1";
const serviceRole = String(
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SERVICE_ROLE_KEY || ""
).trim();
const origin = "http://127.0.0.1:4182";
const edgeUrl = `${projectUrl}/functions/v1/aralearn-authoring-mcp`;
const protocolVersion = "2025-11-25";

assert(
  new Set(["127.0.0.1", "localhost"]).has(new URL(projectUrl).hostname),
  "Este smoke só usa o Supabase local."
);
if (accessToken && serviceRole) {
  assert.notEqual(
    accessToken,
    serviceRole,
    "A service role não pode ser usada como bearer do MCP."
  );
}

async function json(response, label) {
  const source = await response.text();
  try {
    return source ? JSON.parse(source) : null;
  } catch {
    assert.fail(`${label}: resposta não contém JSON.`);
  }
}

const metadataResponse = await fetch(`${edgeUrl}/.well-known/oauth-protected-resource`);
assert.equal(metadataResponse.status, 200);
assert.equal(
  metadataResponse.headers.get("x-aralearn-authoring-mcp-catalog"),
  COURSE_HUMAN_TASK_CATALOG_HEADER
);
const metadata = await metadataResponse.json();
assert.equal(metadata.resource, edgeUrl);
assert.deepEqual(metadata.scopes_supported, ["offline_access"]);

const anonymousResponse = await fetch(edgeUrl, {
  method: "POST",
  headers: {
    Accept: "application/json, text/event-stream",
    "Content-Type": "application/json",
    Origin: origin,
    "MCP-Protocol-Version": protocolVersion
  },
  body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "ping", params: {} })
});
assert.equal(anonymousResponse.status, 401);
assert.match(anonymousResponse.headers.get("www-authenticate"), /resource_metadata=/u);

if (!accessToken) {
  assert.equal(requireOAuth, false, "O smoke autenticado exige um access token OAuth.");
  console.log("Smoke MCP local: metadata e isolamento anônimo aprovados.");
} else {
  let rpcId = 1;
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
    const body = await json(response, method);
    assert.equal(response.status, 200, `${method}: ${body?.error?.message || response.status}`);
    assert.equal(body.error, undefined, body?.error?.message);
    assert.equal(
      response.headers.get("x-aralearn-authoring-mcp-catalog"),
      COURSE_HUMAN_TASK_CATALOG_HEADER
    );
    return body.result;
  }
  const initialized = await call("initialize", {
    protocolVersion,
    capabilities: {},
    clientInfo: { name: "aralearn-local-smoke", version: "2" }
  }, { initialize: true });
  assert.deepEqual(initialized._meta.humanTaskCatalog, COURSE_HUMAN_TASK_CATALOG_METADATA);
  const listed = await call("tools/list");
  assert.deepEqual(
    listed.tools.map(({ name }) => name),
    COURSE_HUMAN_TASKS.map(({ name }) => name)
  );
  console.log("Smoke MCP local: OAuth e catálogo humano aprovados.");
}
