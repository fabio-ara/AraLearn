import { createAuthoringHandler } from "../_shared/aralearn-authoring/routerV4.js";

function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`Esperado ${JSON.stringify(expected)}, recebido ${JSON.stringify(actual)}.`);
  }
}

Deno.test("Edge cria workspace autenticado e devolve envelope estável", async () => {
  const handler = createAuthoringHandler({
    allowedOrigins: new Set(["https://example.test"]),
    adapter: {
      async resolvePrincipal() {
        return {
          actorId: "11111111-1111-4111-8111-111111111111",
          clientId: "22222222-2222-4222-8222-222222222222",
          authenticationKind: "api_key",
          scopes: ["authoring:private:write"]
        };
      },
      async createWorkspace(command: Record<string, unknown>) {
        return { workspaceId: command.workspaceId, revision: 1 };
      }
    }
  });
  const response = await handler(new Request("https://api.test/v1/workspaces", {
    method: "POST",
    headers: {
      Origin: "https://example.test",
      "Content-Type": "application/json",
      "X-AraLearn-API-Key": `arl_${"P".repeat(32)}`
    },
    body: JSON.stringify({
      requestId: "deno-workspace-create-0001",
      title: "Curso"
    })
  }));
  const body = await response.json();
  assertEquals(response.status, 200);
  assertEquals(body.ok, true);
  assertEquals(body.data.revision, 1);
});

Deno.test("preflight devolve somente a origem configurada", async () => {
  const handler = createAuthoringHandler({
    allowedOrigins: new Set(["https://example.test"]),
    adapter: {}
  });
  const response = await handler(new Request("https://api.test/v1/workspaces", {
    method: "OPTIONS",
    headers: { Origin: "https://example.test" }
  }));
  assertEquals(response.status, 204);
  assertEquals(response.headers.get("access-control-allow-origin"), "https://example.test");
});
