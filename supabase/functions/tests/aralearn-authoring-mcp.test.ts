import {
  ARALEARN_MCP_PROTOCOL_VERSION,
  createAuthoringMcpHandler
} from "../_shared/aralearn-authoring/mcpServer.js";
import {
  COURSE_HUMAN_TASKS
} from "../_shared/aralearn-authoring/courseHumanTasks.js";

const ORIGIN = "https://client.example";
const RESOURCE = "https://edge.example/functions/v1/aralearn-authoring-mcp";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function request(method: string, params: Record<string, unknown> = {}) {
  return new Request(RESOURCE, {
    method: "POST",
    headers: {
      Origin: ORIGIN,
      Authorization: "Bearer token",
      Accept: "application/json, text/event-stream",
      "Content-Type": "application/json",
      "MCP-Protocol-Version": ARALEARN_MCP_PROTOCOL_VERSION
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params })
  });
}

Deno.test("#272 MCP Edge publica somente tarefas humanas", async () => {
  const handler = createAuthoringMcpHandler({
    adapter: {
      supabaseUrl: "https://project.example",
      async resolvePrincipal() {
        return {
          actorId: "10000000-0000-4000-8000-000000000001",
          authenticationKind: "oauth",
          scopes: ["authoring:read", "authoring:write"]
        };
      }
    },
    allowedOrigins: new Set([ORIGIN]),
    resourceUrl: RESOURCE,
    authorizationServer: "https://project.example/auth/v1"
  });
  const response = await handler(request("tools/list"));
  const payload = await response.json();
  const names = payload.result.tools.map(({ name }: { name: string }) => name);
  assert(
    JSON.stringify(names) === JSON.stringify(COURSE_HUMAN_TASKS.map(({ name }) => name)),
    "tools/list divergiu do catálogo humano"
  );
});

Deno.test("#272 MCP Edge filtra writes sem authoring:write", async () => {
  const handler = createAuthoringMcpHandler({
    adapter: {
      supabaseUrl: "https://project.example",
      async resolvePrincipal() {
        return {
          actorId: "10000000-0000-4000-8000-000000000001",
          authenticationKind: "oauth",
          scopes: ["authoring:read"]
        };
      }
    },
    allowedOrigins: new Set([ORIGIN]),
    resourceUrl: RESOURCE,
    authorizationServer: "https://project.example/auth/v1"
  });
  const response = await handler(request("tools/list"));
  const payload = await response.json();
  assert(
    payload.result.tools.every(({ annotations }: { annotations: { readOnlyHint: boolean } }) => (
      annotations.readOnlyHint === true
    )),
    "tools/list expôs escrita sem escopo"
  );
});
