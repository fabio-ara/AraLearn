import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizePersonalIntegration,
  PersonalIntegrationClient
} from "../../src/supabase/PersonalIntegrationClient.js";

const clientId = "22222222-2222-4222-8222-222222222222";

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  });
}

function authClient(accessToken = "session-token") {
  const events = [];
  let clearCount = 0;
  return {
    events,
    get clearCount() {
      return clearCount;
    },
    setAccessToken(value) {
      accessToken = value;
    },
    async getAccessToken() {
      return accessToken;
    },
    async clearSession() {
      clearCount += 1;
      accessToken = null;
    },
    emit(event) {
      events.push(event);
    }
  };
}

test("cliente lista integrações e distingue estados ativo, expirado e revogado", async () => {
  const requests = [];
  const client = new PersonalIntegrationClient({
    projectUrl: "https://example.supabase.co",
    publishableKey: "sb_publishable_test",
    authClient: authClient(),
    fetchImpl: async (url, options) => {
      requests.push({ url: String(url), options });
      return jsonResponse({ ok: true, data: {
        activeCount: 1,
        activeLimit: 5,
        items: [
          {
            clientId,
            name: "Ativa",
            keyPrefix: "arl_ativa",
            expiresAt: "2099-01-01T00:00:00.000Z",
            active: true
          },
          {
            clientId: "33333333-3333-4333-8333-333333333333",
            name: "Expirada",
            keyPrefix: "arl_expirada",
            expiresAt: "2020-01-01T00:00:00.000Z",
            active: false
          },
          {
            clientId: "44444444-4444-4444-8444-444444444444",
            name: "Revogada",
            keyPrefix: "arl_revogada",
            revokedAt: "2026-07-01T00:00:00.000Z",
            active: false
          }
        ]
      } });
    }
  });

  const result = await client.list();
  assert.equal(result.activeCount, 1);
  assert.equal(result.activeLimit, 5);
  assert.deepEqual(result.items.map((item) => item.state), ["active", "expired", "revoked"]);
  assert.match(requests[0].url, /\/functions\/v1\/aralearn-authoring-api\/v1\/integrations$/u);
  assert.equal(requests[0].options.headers.get("Authorization"), "Bearer session-token");
  assert.equal(requests[0].options.headers.get("apikey"), "sb_publishable_test");
});

test("criação e rotação repetem falhas transitórias com requestId e corpo estáveis", async () => {
  const requests = [];
  const sleeps = [];
  let call = 0;
  let requestSequence = 0;
  const client = new PersonalIntegrationClient({
    projectUrl: "https://example.supabase.co",
    publishableKey: "sb_publishable_test",
    authClient: authClient(),
    createRequestId: () => ["integration-create-stable", "integration-rotate-stable"][requestSequence++],
    sleep: async (milliseconds) => sleeps.push(milliseconds),
    fetchImpl: async (url, options) => {
      call += 1;
      requests.push({
        url: String(url),
        idempotencyKey: options.headers.get("Idempotency-Key"),
        body: options.body ? JSON.parse(options.body) : null
      });
      if (call === 1 || call === 3) {
        return jsonResponse({ error: { code: "temporarily_unavailable", message: "Tente depois." } }, 503);
      }
      return jsonResponse({ ok: true, data: call === 2
        ? { clientId, apiKey: "test-secret-create", secretAvailable: true }
        : {
          clientId: "33333333-3333-4333-8333-333333333333",
          apiKey: "test-secret-rotate",
          secretAvailable: true
        } });
    }
  });

  const created = await client.create({ name: "Agente pessoal", expiresInDays: 90 });
  const rotated = await client.rotate(clientId, { expiresInDays: 180 });
  assert.equal(created.apiKey, "test-secret-create");
  assert.equal(rotated.apiKey, "test-secret-rotate");
  assert.deepEqual(sleeps, [400, 400]);
  assert.deepEqual(requests[0].body, requests[1].body);
  assert.deepEqual(requests[2].body, requests[3].body);
  assert.equal(requests[0].idempotencyKey, "integration-create-stable");
  assert.equal(requests[1].idempotencyKey, requests[0].idempotencyKey);
  assert.equal(requests[2].idempotencyKey, requests[3].idempotencyKey);
  assert.equal(requests[2].idempotencyKey, "integration-rotate-stable");
  assert.match(requests[2].url, new RegExp(`/integrations/${clientId}/rotate$`, "u"));
});

test("revogação usa apenas o identificador da própria integração", async () => {
  let request = null;
  const client = new PersonalIntegrationClient({
    projectUrl: "https://example.supabase.co",
    publishableKey: "sb_publishable_test",
    authClient: authClient(),
    fetchImpl: async (url, options) => {
      request = { url: String(url), method: options.method, body: options.body };
      return jsonResponse({ ok: true, data: { clientId, active: false } });
    }
  });

  await client.revoke(clientId);
  assert.match(request.url, new RegExp(`/integrations/${clientId}$`, "u"));
  assert.equal(request.method, "DELETE");
  assert.equal(request.body, undefined);
});

test("401 invalida a sessão sem repetição e 403 permanece autorização negada", async () => {
  const expiredAuth = authClient();
  let expiredRequests = 0;
  const expired = new PersonalIntegrationClient({
    projectUrl: "https://example.supabase.co",
    publishableKey: "sb_publishable_test",
    authClient: expiredAuth,
    fetchImpl: async () => {
      expiredRequests += 1;
      return jsonResponse({ error: { code: "jwt_expired", message: "JWT expired" } }, 401);
    }
  });
  await assert.rejects(
    () => expired.list(),
    (error) => error?.authRequired === true && error?.status === 401
  );
  assert.equal(expiredRequests, 1);
  assert.equal(expiredAuth.clearCount, 1);
  assert.deepEqual(expiredAuth.events, ["SESSION_INVALID"]);

  const forbiddenAuth = authClient();
  const forbidden = new PersonalIntegrationClient({
    projectUrl: "https://example.supabase.co",
    publishableKey: "sb_publishable_test",
    authClient: forbiddenAuth,
    fetchImpl: async () => jsonResponse({
      error: { code: "session_required", message: "Acesso negado." }
    }, 403)
  });
  await assert.rejects(
    () => forbidden.create({ name: "Agente", expiresInDays: 30 }),
    (error) => error?.status === 403 && error?.authRequired !== true
  );
  assert.equal(forbiddenAuth.clearCount, 0);
  assert.deepEqual(forbiddenAuth.events, []);
});

test("sessão ausente abre novamente a autenticação sem acessar a rede", async () => {
  const missingAuth = authClient(null);
  const client = new PersonalIntegrationClient({
    projectUrl: "https://example.supabase.co",
    publishableKey: "sb_publishable_test",
    authClient: missingAuth,
    fetchImpl: async () => assert.fail("A rede não deveria ser acessada.")
  });
  await assert.rejects(() => client.list(), (error) => error?.authRequired === true);
  assert.deepEqual(missingAuth.events, ["SESSION_INVALID"]);
});

test("novo acesso bem-sucedido permite sinalizar uma ausência de sessão posterior", async () => {
  const reconnectingAuth = authClient(null);
  let requests = 0;
  const client = new PersonalIntegrationClient({
    projectUrl: "https://example.supabase.co",
    publishableKey: "sb_publishable_test",
    authClient: reconnectingAuth,
    fetchImpl: async () => {
      requests += 1;
      return jsonResponse({ ok: true, data: { items: [] } });
    }
  });

  await assert.rejects(() => client.list(), (error) => error?.authRequired === true);
  reconnectingAuth.setAccessToken("new-session-token");
  await client.list();
  reconnectingAuth.setAccessToken(null);
  await assert.rejects(() => client.list(), (error) => error?.authRequired === true);

  assert.equal(requests, 1);
  assert.deepEqual(reconnectingAuth.events, ["SESSION_INVALID", "SESSION_INVALID"]);
});

test("cliente rejeita identificadores, nomes e validades fora do contrato sem acessar a rede", async () => {
  const client = new PersonalIntegrationClient({
    projectUrl: "https://example.supabase.co",
    publishableKey: "sb_publishable_test",
    authClient: authClient(),
    fetchImpl: async () => assert.fail("A rede não deveria ser acessada."),
    createRequestId: () => "integration-request-valid"
  });
  await assert.rejects(() => client.create({ name: "", expiresInDays: 90 }), /nome da integração/u);
  await assert.rejects(() => client.create({ name: "Agente", expiresInDays: 366 }), /validade/u);
  await assert.rejects(() => client.rotate("não-é-uuid"), /Identificador/u);
  await assert.rejects(
    () => client.create({ name: "Agente", requestId: "curto" }),
    /pedido inválido/u
  );
});

test("normalização não transporta a chave completa para o estado de listagem", () => {
  const normalized = normalizePersonalIntegration({
    clientId,
    name: "Agente",
    keyPrefix: "arl_prefixo",
    apiKey: "test-secret-not-retained",
    expiresAt: "2099-01-01T00:00:00.000Z"
  }, Date.parse("2026-07-22T00:00:00.000Z"));
  assert.equal(Object.hasOwn(normalized, "apiKey"), false);
  assert.equal(JSON.stringify(normalized).includes("test-secret-not-retained"), false);
});
