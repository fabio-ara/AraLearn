import test from "node:test";
import assert from "node:assert/strict";
import { CourseSupabaseAdapter } from "../../supabase/functions/_shared/aralearn-authoring/courseSupabaseAdapter.js";
import { authoringErrorIsRetryable, readDependencyDiagnostic } from "../../supabase/functions/_shared/aralearn-authoring/errors.js";
import { ARALEARN_MCP_PROTOCOL_VERSION, createAuthoringMcpHandler } from "../../supabase/functions/_shared/aralearn-authoring/mcpServer.js";

const RESOURCE = "https://edge.example/functions/v1/aralearn-authoring-mcp";
const ORIGIN = "https://app.example";
function adapter(fetchImpl) {
  return new CourseSupabaseAdapter({ supabaseUrl: "https://project.example",
    serverApiKey: "test-server-key", publishableKey: "test-public-key",
    publicAppUrl: ORIGIN, fetchImpl, attempts: 3, responseLimitBytes: 128 });
}

test("HTTP 402 é terminal antes da leitura do corpo em todos os domínios do adapter", async () => {
  for (const errorDomain of ["course", "course_admin", "oauth_request", "oauth_grant"]) {
    for (const body of ['{"message":"provider-private-data"}', "provider-private-data", "x".repeat(1_024)]) {
      let fetches = 0;
      let cancelled = false;
      const value = adapter(async () => {
        fetches += 1;
        return new Response(new ReadableStream({ start(controller) {
          controller.enqueue(new TextEncoder().encode(body));
          controller.close();
        }, cancel() { cancelled = true; } }), { status: 402 });
      });
      await assert.rejects(value.rpc("get_owned_course_for_actor_v1", {}, { errorDomain }), error => {
        assert.equal(error.status, 402);
        assert.equal(error.code, "course_service_restricted");
        assert.equal(authoringErrorIsRetryable(error), false);
        assert.equal(readDependencyDiagnostic(error).attemptsStarted, 1);
        assert.doesNotMatch(error.message, /provider-private-data|test-server-key|upgrade|Pro\b/u);
        return true;
      });
      assert.equal(fetches, 1, errorDomain);
      assert.equal(cancelled, true, "o corpo da recusa não continua sendo transferido");
    }
  }
});

test("a interrupção de 402 preserva a recuperação existente de 503", async () => {
  let fetches = 0;
  const value = adapter(async () => ++fetches === 1
    ? new Response('{}', { status: 503 }) : new Response('{"ok":true}'));
  assert.deepEqual(await value.rpc("get_owned_course_for_actor_v1", {}), { ok: true });
  assert.equal(fetches, 2);
});

test("MCP preserva a restrição e não manda repetir nem autenticar, antes e depois do principal", async () => {
  for (const phase of ["resolucao_principal", "execucao"]) {
    let fetches = 0;
    let toolReads = 0;
    const value = adapter(async () => { fetches += 1; return new Response('provider-private-data', { status: 402 }); });
    value.resolvePrincipal = async () => phase === "resolucao_principal"
      ? value.rpc("resolve_mcp_oauth_principal_v1", {})
      : { actorId: "10000000-0000-4000-8000-000000000001", authenticationKind: "oauth",
        scopes: ["authoring:read", "authoring:write"] };
    value.listCourses = async () => { toolReads += 1; return value.rpc("list_owned_courses_for_actor_v1", {}); };
    const handler = createAuthoringMcpHandler({ adapter: value, resourceUrl: RESOURCE,
      authorizationServer: "https://project.example/auth/v1", allowedOrigins: new Set([ORIGIN]) });
    const response = await handler(new Request(RESOURCE, { method: "POST", headers: {
      Origin: ORIGIN, Authorization: "Bearer test-token", Accept: "application/json, text/event-stream",
      "Content-Type": "application/json", "MCP-Protocol-Version": ARALEARN_MCP_PROTOCOL_VERSION
    }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call",
      params: { name: "preparar_revisao", arguments: { curso: "Curso de teste" } } }) }));
    const payload = await response.json();
    assert.equal(response.status, 200);
    assert.equal(payload.result.isError, true);
    const projected = payload.result.structuredContent;
    assert.equal(projected.error.code, "course_service_restricted");
    assert.equal(projected.error.retryable, false);
    assert.equal(projected.error.diagnostico.status, 402);
    assert.equal(projected.error.diagnostico.fase, phase);
    assert.match(projected.nextDecision, /aguarde|libera[çc][ãa]o/iu);
    assert.doesNotMatch(projected.nextDecision, /refaça|autentiqu|upgrade|Pro\b/iu);
    assert.deepEqual(JSON.parse(payload.result.content[0].text), projected);
    assert.equal(response.headers.get("www-authenticate"), null);
    assert.equal(response.headers.get("retry-after"), null);
    assert.equal(fetches, 1);
    assert.equal(toolReads, phase === "execucao" ? 1 : 0);
    assert.doesNotMatch(JSON.stringify(payload), /provider-private-data|test-token/u);
  }
});
