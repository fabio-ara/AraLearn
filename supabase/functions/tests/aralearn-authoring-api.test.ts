import { createAuthoringHandler } from "../_shared/aralearn-authoring/router.js";

function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`Esperado ${JSON.stringify(expected)}, recebido ${JSON.stringify(actual)}.`);
  }
}

Deno.test("Edge reconhece os caminhos do gateway e rejeita chamada anônima", async () => {
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
  for (const path of [
    "/v1/runs",
    "/aralearn-authoring-api/v1/runs",
    "/functions/v1/aralearn-authoring-api/v1/runs"
  ]) {
    const response = await handler(new Request(`https://api.test${path}`, {
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
  }
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
  if (!response.headers.get("access-control-allow-headers")?.toLowerCase().includes("apikey")) {
    throw new Error("O preflight precisa permitir o cabeçalho apikey do cliente web.");
  }
});

Deno.test("Edge limita uma chave pessoal ao destino private", async () => {
  let commands = 0;
  const handler = createAuthoringHandler({
    allowedOrigins: new Set(["https://example.test"]),
    adapter: {
      receiptSecret: "deno-private-authoring-secret-32-bytes",
      async resolvePrincipal() {
        return {
          actorId: "private-user",
          clientId: "private-client",
          authenticationKind: "api_key",
          scopes: [
            "authoring:private:read",
            "authoring:private:write",
            "authoring:private:audit"
          ]
        };
      },
      async command({ payload }: { payload: Record<string, unknown> }) {
        commands += 1;
        return { status: "planning", publicationTarget: payload.publicationTarget };
      }
    }
  });
  const makeRequest = (target: string, requestId: string) => new Request(
    "https://api.test/v1/runs",
    {
      method: "POST",
      headers: {
        Origin: "https://example.test",
        "Content-Type": "application/json",
        "X-AraLearn-API-Key": `arl_${"D".repeat(24)}`,
        "Idempotency-Key": requestId
      },
      body: JSON.stringify({
        requestId,
        target,
        title: "Curso privado",
        contractKey: `curso-${target}`,
        brief: {},
        publicationIntent: { mode: "create" }
      })
    }
  );
  const accepted = await handler(makeRequest("private", "deno-private-0001"));
  assertEquals(accepted.status, 200);
  const rejected = await handler(makeRequest("catalog", "deno-catalog-0001"));
  assertEquals(rejected.status, 403);
  assertEquals(commands, 1);
});

Deno.test("Edge reserva a gestão de integrações pessoais para a sessão autenticada", async () => {
  let created = 0;
  const handler = createAuthoringHandler({
    allowedOrigins: new Set(["https://example.test"]),
    adapter: {
      receiptSecret: "deno-private-authoring-secret-32-bytes",
      async resolvePrincipal(authentication: { kind: string }) {
        return {
          actorId: "11111111-1111-4111-8111-111111111111",
          clientId: authentication.kind === "api_key"
            ? "22222222-2222-4222-8222-222222222222"
            : null,
          authenticationKind: authentication.kind,
          scopes: [
            "authoring:private:read",
            "authoring:private:write",
            "authoring:private:audit"
          ]
        };
      },
      async createPrivateIntegration() {
        created += 1;
        return {
          clientId: "33333333-3333-4333-8333-333333333333",
          secretAvailable: true,
          apiKey: `arl_${"K".repeat(32)}`
        };
      }
    }
  });
  const body = JSON.stringify({
    requestId: "deno-integration-0001",
    name: "Assistente pessoal",
    expiresInDays: 90
  });
  const denied = await handler(new Request("https://api.test/v1/integrations", {
    method: "POST",
    headers: {
      Origin: "https://example.test",
      "Content-Type": "application/json",
      "X-AraLearn-API-Key": `arl_${"P".repeat(32)}`
    },
    body
  }));
  const deniedBody = await denied.json();
  assertEquals(denied.status, 403);
  assertEquals(deniedBody.error.code, "session_required");
  assertEquals(created, 0);

  const accepted = await handler(new Request("https://api.test/v1/integrations", {
    method: "POST",
    headers: {
      Origin: "https://example.test",
      "Content-Type": "application/json",
      Authorization: "Bearer user-session-token"
    },
    body
  }));
  const acceptedBody = await accepted.json();
  assertEquals(accepted.status, 200);
  assertEquals(acceptedBody.data.secretAvailable, true);
  assertEquals(created, 1);
});
