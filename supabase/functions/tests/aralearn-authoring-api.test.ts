import { createAuthoringHandler } from "../_shared/aralearn-authoring/router.js";

function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`Esperado ${JSON.stringify(expected)}, recebido ${JSON.stringify(actual)}.`);
  }
}

Deno.test("Edge rejeita chamada anônima antes de acessar o banco", async () => {
  let accessed = false;
  const handler = createAuthoringHandler({
    allowedOrigins: new Set(["https://example.test"]),
    adapter: {
      async resolvePrincipal() {
        accessed = true;
        return null;
      }
    }
  });
  const response = await handler(new Request("https://api.test/v1/runs", {
    method: "POST",
    headers: {
      Origin: "https://example.test",
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ requestId: "deno-auth-0001", target: "catalog", title: "Curso" })
  }));
  const body = await response.json();
  assertEquals(response.status, 401);
  assertEquals(body.error.code, "authentication_required");
  assertEquals(accessed, false);
});
Deno.test("preflight devolve somente a origem configurada", async () => {
  const handler = createAuthoringHandler({
    allowedOrigins: new Set(["https://example.test"]),
    adapter: {}
  });
  const response = await handler(new Request("https://api.test/v1/runs", {
    method: "OPTIONS",
    headers: { Origin: "https://example.test" }
  }));
  assertEquals(response.status, 204);
  assertEquals(response.headers.get("access-control-allow-origin"), "https://example.test");
});
