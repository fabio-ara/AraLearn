import assert from "node:assert/strict";

const projectUrl = String(process.env.SUPABASE_URL || "").trim().replace(/\/+$/u, "");
const apiKey = String(process.env.ARALEARN_AUTHORING_MCP_API_KEY || "").trim();
const origin = String(process.env.ARALEARN_AUTHORING_MCP_ORIGIN || "").trim().replace(/\/+$/u, "");

assert.match(projectUrl, /^https:\/\/[^/]+$/u, "Informe a Project URL HTTPS em SUPABASE_URL.");
assert.match(apiKey, /^arl_[A-Za-z0-9_-]{24,192}$/u, "Informe uma chave arl_ restrita.");
assert.match(origin, /^https:\/\/[^/]+$/u, "Informe uma origem HTTPS permitida.");
assert.equal(
  Object.hasOwn(process.env, "SUPABASE_SERVICE_ROLE_KEY"),
  false,
  "O smoke hospedado do MCP não aceita service role."
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
      "Content-Type": "application/json",
      Origin: origin,
      "X-AraLearn-API-Key": apiKey,
      ...(initialize ? {} : { "MCP-Protocol-Version": protocolVersion })
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: rpcId, method, params })
  });
  const source = await response.text();
  let body = null;
  try {
    body = source ? JSON.parse(source) : null;
  } catch {
    assert.fail(`${method}: resposta não contém JSON.`);
  }
  assert.equal(response.status, 200, `${method}: HTTP ${response.status}: ${body?.error?.message || source}`);
  assert.equal(body?.jsonrpc, "2.0");
  assert.equal(body?.id, rpcId);
  assert.equal(body?.error, undefined, body?.error?.message);
  assert.equal(response.headers.get("mcp-session-id"), null, "O servidor deve permanecer stateless.");
  return body.result;
}

const initialized = await call("initialize", {
  protocolVersion,
  capabilities: {},
  clientInfo: { name: "aralearn-hosted-smoke", version: "1" }
}, { initialize: true });
assert.equal(initialized.protocolVersion, protocolVersion);
assert.deepEqual(initialized.capabilities, { tools: { listChanged: false } });

await call("ping");
const listed = await call("tools/list");
assert.ok(Array.isArray(listed.tools) && listed.tools.length >= 10);
assert.equal(
  listed.tools.every((tool) =>
    tool.annotations?.readOnlyHint === true
    || tool.inputSchema?.required?.includes("requestId")
  ),
  true,
  "Toda ferramenta mutável deve exigir requestId."
);
assert.equal(listed.tools.some((tool) => tool.name === "concluirCurso"), true);
assert.equal(listed.tools.some((tool) => /integracao|importarDocumento/iu.test(tool.name)), false);

console.log("Smoke MCP hospedado: aprovado sem criar ou alterar dados.");
