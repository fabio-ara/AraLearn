import {
  ARALEARN_MCP_PROTOCOL_VERSION,
  createAuthoringMcpHandler
} from "../_shared/aralearn-authoring/mcpServer.js";

function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`Esperado ${JSON.stringify(expected)}, recebido ${JSON.stringify(actual)}.`);
  }
}

const origin = "https://mcp.example";
const apiKey = `arl_${"M".repeat(32)}`;

function request(method: string, params: Record<string, unknown> = {}, id = 1): Request {
  return new Request("https://edge.example/functions/v1/aralearn-authoring-mcp", {
    method: "POST",
    headers: {
      Accept: "application/json, text/event-stream",
      "Content-Type": "application/json",
      "MCP-Protocol-Version": ARALEARN_MCP_PROTOCOL_VERSION,
      Origin: origin,
      "X-AraLearn-API-Key": apiKey
    },
    body: JSON.stringify({ jsonrpc: "2.0", id, method, params })
  });
}

function adapter() {
  return {
    receiptSecret: "deno-authoring-mcp-receipt-secret-32-bytes",
    async resolvePrincipal() {
      return {
        actorId: "deno-mcp-user",
        clientId: "deno-mcp-client",
        authenticationKind: "api_key",
        scopes: [
          "authoring:private:read",
          "authoring:private:write",
          "authoring:private:audit"
        ]
      };
    },
    async command(command: Record<string, unknown>) {
      return { status: "planning", runId: command.runId };
    }
  };
}

Deno.test("gateway MCP negocia o protocolo stateless e anuncia somente ferramentas", async () => {
  const handler = createAuthoringMcpHandler({ adapter: adapter(), allowedOrigins: new Set([origin]) });
  const response = await handler(request("initialize", {
    protocolVersion: ARALEARN_MCP_PROTOCOL_VERSION,
    capabilities: {},
    clientInfo: { name: "deno", version: "1" }
  }));
  const body = await response.json();
  assertEquals(response.status, 200);
  assertEquals(body.result.protocolVersion, ARALEARN_MCP_PROTOCOL_VERSION);
  assertEquals(body.result.capabilities, { tools: { listChanged: false } });
  assertEquals(response.headers.get("mcp-session-id"), null);
});

Deno.test("gateway MCP executa ferramenta privada pelo mesmo adaptador", async () => {
  const handler = createAuthoringMcpHandler({ adapter: adapter(), allowedOrigins: new Set([origin]) });
  const response = await handler(request("tools/call", {
    name: "criarExecucaoDeAutoria",
    arguments: {
      requestId: "deno-mcp-create-0001",
      target: "private",
      title: "Curso",
      contractKey: "curso-deno-mcp",
      brief: {},
      publicationIntent: { mode: "create" }
    }
  }));
  const body = await response.json();
  assertEquals(response.status, 200);
  assertEquals(body.result.isError, false);
  assertEquals(body.result.structuredContent.data.status, "planning");
});

Deno.test("gateway MCP rejeita Origin hostil antes de resolver a chave", async () => {
  let resolved = 0;
  const handler = createAuthoringMcpHandler({
    allowedOrigins: new Set([origin]),
    adapter: {
      async resolvePrincipal() {
        resolved += 1;
        return null;
      }
    }
  });
  const hostile = request("ping");
  hostile.headers.set("Origin", "https://hostile.example");
  const response = await handler(hostile);
  const body = await response.json();
  assertEquals(response.status, 403);
  assertEquals(body.error.data.code, "origin_not_allowed");
  assertEquals(resolved, 0);
});
