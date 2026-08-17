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
const oauthToken = "header.oauth-payload.signature";
const resourceUrl = "https://edge.example/functions/v1/aralearn-authoring-mcp";
const authorizationServer = "https://project.example/auth/v1";

function request(method: string, params: Record<string, unknown> = {}, id = 1): Request {
  return new Request("https://edge.example/functions/v1/aralearn-authoring-mcp", {
    method: "POST",
    headers: {
      Accept: "application/json, text/event-stream",
      "Content-Type": "application/json",
      "MCP-Protocol-Version": ARALEARN_MCP_PROTOCOL_VERSION,
      Origin: origin,
      Authorization: `Bearer ${oauthToken}`
    },
    body: JSON.stringify({ jsonrpc: "2.0", id, method, params })
  });
}

function adapter() {
  return {
    async resolvePrincipal() {
      return {
        actorId: "11111111-1111-4111-8111-111111111111",
        oauthClientId: "chatgpt-client",
        authenticationKind: "oauth",
        scopes: ["authoring:read", "authoring:write"]
      };
    },
    async createCourse(command: Record<string, unknown>) {
      return {
        courseId: "10000000-0000-4000-8000-000000000001",
        title: command.title,
        revision: 1,
        createdAt: "2026-08-13T00:00:00.000Z",
        updatedAt: "2026-08-13T00:00:00.000Z",
        idempotent: false
      };
    }
  };
}

Deno.test("gateway MCP negocia protocolo stateless e anuncia ferramentas de Curso", async () => {
  const handler = createAuthoringMcpHandler({
    adapter: adapter(),
    allowedOrigins: new Set([origin]),
    resourceUrl,
    authorizationServer
  });
  const response = await handler(request("initialize", {
    protocolVersion: ARALEARN_MCP_PROTOCOL_VERSION,
    capabilities: {},
    clientInfo: { name: "deno", version: "1" }
  }));
  const body = await response.json();
  assertEquals(response.status, 200);
  assertEquals(body.result.protocolVersion, ARALEARN_MCP_PROTOCOL_VERSION);
  assertEquals(response.headers.get("mcp-session-id"), null);
});

Deno.test("gateway MCP cria Curso pelo mesmo caso de uso do aplicativo", async () => {
  const handler = createAuthoringMcpHandler({
    adapter: adapter(),
    allowedOrigins: new Set([origin]),
    resourceUrl,
    authorizationServer
  });
  const response = await handler(request("tools/call", {
    name: "criarCurso",
    arguments: {
      requestId: "deno-course-create-0001",
      title: "Curso",
      goal: "Compreender o tema."
    }
  }));
  const body = await response.json();
  assertEquals(response.status, 200);
  assertEquals(body.result.isError, false);
  assertEquals(body.result.structuredContent.data.revision, 1);
});

Deno.test("gateway MCP rejeita Origin hostil antes de resolver a sessão OAuth", async () => {
  let resolved = 0;
  const handler = createAuthoringMcpHandler({
    allowedOrigins: new Set([origin]),
    resourceUrl,
    authorizationServer,
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
