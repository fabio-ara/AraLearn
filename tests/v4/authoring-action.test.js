import assert from "node:assert/strict";
import test from "node:test";

import {
  createAuthoringActionHandler
} from "../../supabase/functions/_shared/aralearn-authoring/actionServer.js";

const ORIGIN = "https://chatgpt.com";
const ACTION_URL = "https://edge.example/functions/v1/aralearn-authoring-action";
const APP_URL = "https://app.example/aralearn/";
const WORKSPACE_ID = "11111111-1111-4111-8111-111111111111";
const AUTHORIZATION_ID = "22222222-2222-4222-8222-222222222222";

function principal() {
  return {
    actorId: "33333333-3333-4333-8333-333333333333",
    oauthClientId: "chatbot-client",
    authenticationKind: "oauth",
    scopes: ["authoring:private:read", "authoring:private:write"]
  };
}

function adapter(overrides = {}) {
  return {
    async resolveActionPrincipal(accessTokenHash) {
      assert.match(accessTokenHash, /^[0-9a-f]{64}$/u);
      return principal();
    },
    ...overrides
  };
}

function handler(adapterValue = adapter()) {
  return createAuthoringActionHandler({
    adapter: adapterValue,
    allowedOrigins: new Set([ORIGIN]),
    actionBaseUrl: ACTION_URL,
    publicAppUrl: APP_URL
  });
}

function request(name, body = {}, { authenticated = true, origin = ORIGIN } = {}) {
  const headers = {
    "Content-Type": "application/json",
    Origin: origin
  };
  if (authenticated) headers.Authorization = "Bearer oauth-token";
  return new Request(`${ACTION_URL}/${name}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body)
  });
}

test("Action exige OAuth e uma origem autorizada quando Origin está presente", async () => {
  const unauthenticated = await handler()(request(
    "prepararAutoriaAraLearn",
    { intent: "inspect" },
    { authenticated: false }
  ));
  assert.equal(unauthenticated.status, 401);
  assert.equal(unauthenticated.headers.get("www-authenticate"), "Bearer");
  assert.equal((await unauthenticated.json()).error.code, "authentication_required");

  const foreign = await handler()(request(
    "prepararAutoriaAraLearn",
    { intent: "inspect" },
    { origin: "https://malicious.example" }
  ));
  assert.equal(foreign.status, 403);
  assert.equal((await foreign.json()).error.code, "origin_not_allowed");
});

test("Action recupera conhecimento pelo mesmo contrato da ferramenta MCP", async () => {
  const response = await handler()(request("prepararAutoriaAraLearn", {
    intent: "restructure",
    targetEntity: "module",
    context: "Mover um módulo para outro curso e revisar dependências."
  }));
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.equal(payload.ok, true);
  assert.equal(payload.requestId, null);
  assert.equal(payload.data.intent, "restructure");
  assert.ok(payload.data.guidance.some(({ id }) => id === "structural-editing"));
});

test("Action atravessa o executor compartilhado e preserva expectedRevision", async () => {
  let received = null;
  const response = await handler(adapter({
    async mutateWorkspace(options) {
      received = options;
      return {
        workspaceId: WORKSPACE_ID,
        revision: 8,
        currentRevision: 8
      };
    }
  }))(request("renomearEntidadeNoWorkspace", {
    requestId: "action-rename-0001",
    workspaceId: WORKSPACE_ID,
    expectedRevision: 7,
    entityType: "course",
    entityPath: ["course-a"],
    title: "Curso revisto"
  }));
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.equal(payload.ok, true);
  assert.equal(payload.requestId, "action-rename-0001");
  assert.equal(received.expectedRevision, 7);
  assert.equal(received.operation, "rename_entity");
});

test("Action limita payload e não aceita operação fora do registro canônico", async () => {
  const unknown = await handler()(request("executarQualquerCoisa", {}));
  assert.equal(unknown.status, 404);
  assert.equal((await unknown.json()).error.code, "unknown_action");

  const oversized = await handler()(request("prepararAutoriaAraLearn", {
    intent: "create",
    context: "x".repeat(100_000)
  }));
  assert.equal(oversized.status, 413);
  assert.equal((await oversized.json()).error.code, "action_payload_too_large");
});

test("cadastro OAuth da Action autentica a conta e devolve o segredo somente na resposta", async () => {
  let registered = null;
  const response = await handler(adapter({
    async resolveApplicationUser(token) {
      assert.equal(token, "app-session");
      return { id: "33333333-3333-4333-8333-333333333333", email: "autor@example.com" };
    },
    async registerActionOAuthClient(options) {
      registered = options;
      return { clientId: "44444444-4444-4444-8444-444444444444" };
    }
  }))(new Request(`${ACTION_URL}/oauth/clients/register`, {
    method: "POST",
    headers: {
      Authorization: "Bearer app-session",
      "Content-Type": "application/json",
      Origin: ORIGIN
    },
    body: JSON.stringify({ gptId: "g-abcdef123456" })
  }));
  const payload = await response.json();
  assert.equal(response.status, 201);
  assert.equal(payload.client_id, "44444444-4444-4444-8444-444444444444");
  assert.match(payload.client_secret, /^ars_[A-Za-z0-9_-]+$/u);
  assert.equal(
    payload.authorization_url,
    `${ACTION_URL}/oauth/authorize`
  );
  assert.match(registered.clientSecretHash, /^[0-9a-f]{64}$/u);
  assert.notEqual(registered.clientSecretHash, payload.client_secret);
  assert.deepEqual(registered.redirectUris, [
    "https://chatgpt.com/aip/g-abcdef123456/oauth/callback",
    "https://chat.openai.com/aip/g-abcdef123456/oauth/callback"
  ]);
});

test("OAuth da Action cria consentimento, aprova com state e troca código uma única vez", async () => {
  const calls = [];
  const oauthAdapter = adapter({
    async createActionOAuthAuthorization(options) {
      calls.push(["authorize", options]);
      return { authorizationId: AUTHORIZATION_ID };
    },
    async resolveApplicationUser(token) {
      assert.equal(token, "app-session");
      return { id: "33333333-3333-4333-8333-333333333333", email: "autor@example.com" };
    },
    async getActionOAuthAuthorization(options) {
      calls.push(["details", options]);
      return {
        authorization_id: AUTHORIZATION_ID,
        client: { id: "44444444-4444-4444-8444-444444444444", name: "AraLearn Chatbot" },
        user: { id: options.userId, email: "autor@example.com" },
        scope: "openid email"
      };
    },
    async decideActionOAuthAuthorization(options) {
      calls.push(["decide", options]);
      return {
        redirectUri: "https://chatgpt.com/aip/g-abcdef123456/oauth/callback",
        state: "state-seguro-123"
      };
    },
    async exchangeActionOAuthCode(options) {
      calls.push(["exchange", options]);
      return { expiresIn: 3600, scope: "openid email" };
    }
  });
  const authorizeUrl = new URL(`${ACTION_URL}/oauth/authorize`);
  authorizeUrl.search = new URLSearchParams({
    response_type: "code",
    client_id: "44444444-4444-4444-8444-444444444444",
    redirect_uri: "https://chatgpt.com/aip/g-abcdef123456/oauth/callback",
    scope: "openid email",
    state: "state-seguro-123"
  });
  const authorize = await handler(oauthAdapter)(new Request(authorizeUrl, {
    headers: { Origin: ORIGIN }
  }));
  assert.equal(authorize.status, 302);
  assert.equal(
    authorize.headers.get("location"),
    `${APP_URL}?action_authorization_id=${AUTHORIZATION_ID}`
  );

  const details = await handler(oauthAdapter)(new Request(
    `${ACTION_URL}/oauth/authorizations/${AUTHORIZATION_ID}`,
    {
      headers: {
        Authorization: "Bearer app-session",
        Origin: ORIGIN
      }
    }
  ));
  assert.equal(details.status, 200);
  assert.equal((await details.json()).authorization_id, AUTHORIZATION_ID);

  const approval = await handler(oauthAdapter)(new Request(
    `${ACTION_URL}/oauth/authorizations/${AUTHORIZATION_ID}`,
    {
      method: "POST",
      headers: {
        Authorization: "Bearer app-session",
        "Content-Type": "application/json",
        Origin: ORIGIN
      },
      body: JSON.stringify({ action: "approve" })
    }
  ));
  const approvalPayload = await approval.json();
  const callback = new URL(approvalPayload.redirect_url);
  assert.equal(callback.searchParams.get("state"), "state-seguro-123");
  assert.match(callback.searchParams.get("code"), /^arc_[A-Za-z0-9_-]+$/u);

  const token = await handler(oauthAdapter)(new Request(`${ACTION_URL}/oauth/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Origin: ORIGIN
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: "44444444-4444-4444-8444-444444444444",
      client_secret: "ars_client-secret-value-123456",
      code: callback.searchParams.get("code"),
      redirect_uri: "https://chatgpt.com/aip/g-abcdef123456/oauth/callback"
    })
  }));
  const tokenPayload = await token.json();
  assert.equal(token.status, 200);
  assert.match(tokenPayload.access_token, /^ara_[A-Za-z0-9_-]+$/u);
  assert.match(tokenPayload.refresh_token, /^arr_[A-Za-z0-9_-]+$/u);
  assert.equal(tokenPayload.expires_in, 3600);
  assert.ok(calls.some(([name]) => name === "authorize"));
  assert.ok(calls.some(([name]) => name === "details"));
  assert.ok(calls.some(([name]) => name === "decide"));
  assert.ok(calls.some(([name]) => name === "exchange"));
});

test("token endpoint rotaciona o refresh token sem reutilizar o valor recebido", async () => {
  let refreshed = null;
  const response = await handler(adapter({
    async exchangeActionOAuthRefresh(options) {
      refreshed = options;
      return { expiresIn: 3600, scope: "openid email" };
    }
  }))(new Request(`${ACTION_URL}/oauth/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Origin: ORIGIN
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: "44444444-4444-4444-8444-444444444444",
      client_secret: "ars_client-secret-value-123456",
      refresh_token: "arr_previous-refresh-token-value"
    })
  }));
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.match(payload.access_token, /^ara_[A-Za-z0-9_-]+$/u);
  assert.match(payload.refresh_token, /^arr_[A-Za-z0-9_-]+$/u);
  assert.notEqual(payload.refresh_token, "arr_previous-refresh-token-value");
  assert.match(refreshed.refreshTokenHash, /^[0-9a-f]{64}$/u);
  assert.match(refreshed.newRefreshTokenHash, /^[0-9a-f]{64}$/u);
  assert.notEqual(refreshed.refreshTokenHash, refreshed.newRefreshTokenHash);
});
