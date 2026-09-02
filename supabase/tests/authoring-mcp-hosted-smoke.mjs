import assert from "node:assert/strict";

import {
  COURSE_HUMAN_TASK_CATALOG_HEADER,
  COURSE_HUMAN_TASK_CATALOG_METADATA,
  COURSE_HUMAN_TASKS
} from "../functions/_shared/aralearn-authoring/courseHumanTasks.js";

const projectUrl = String(process.env.SUPABASE_URL || "").trim().replace(/\/+$/u, "");
const accessToken = String(
  process.env.ARALEARN_AUTHORING_MCP_OAUTH_TOKEN || ""
).trim();
const origin = String(process.env.ARALEARN_AUTHORING_MCP_ORIGIN || "")
  .trim()
  .replace(/\/+$/u, "");

assert.match(projectUrl, /^https:\/\/[^/]+$/u, "Informe SUPABASE_URL HTTPS.");
assert.match(accessToken, /^[^.]+\.[^.]+\.[^.]+$/u, "Informe o access token OAuth MCP.");
assert.match(origin, /^https:\/\/[^/]+$/u, "Informe uma origem HTTPS permitida.");
assert.equal(
  Object.hasOwn(process.env, "SUPABASE_SERVICE_ROLE_KEY"),
  false,
  "O smoke hospedado não aceita service role."
);

const edgeUrl = `${projectUrl}/functions/v1/aralearn-authoring-mcp`;
const protocolVersion = "2025-11-25";
let rpcId = 0;

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
  const body = await response.json();
  assert.equal(response.status, 200, `${method}: ${body?.error?.message || response.status}`);
  assert.equal(body.error, undefined, body?.error?.message);
  assert.equal(
    response.headers.get("x-aralearn-authoring-mcp-catalog"),
    COURSE_HUMAN_TASK_CATALOG_HEADER
  );
  assert.equal(response.headers.get("x-aralearn-authoring-projection"), null);
  return body.result;
}

const initialized = await call("initialize", {
  protocolVersion,
  capabilities: {},
  clientInfo: { name: "aralearn-hosted-smoke", version: "2" }
}, { initialize: true });
assert.deepEqual(initialized._meta.humanTaskCatalog, COURSE_HUMAN_TASK_CATALOG_METADATA);

const listed = await call("tools/list");
assert.deepEqual(
  listed.tools.map(({ name }) => name),
  COURSE_HUMAN_TASKS.map(({ name }) => name)
);

console.log("Smoke MCP hospedado: OAuth e catálogo humano aprovados.");
