import assert from "node:assert/strict";
import test from "node:test";

import { SupabaseAuthoringAdapter } from "../../supabase/functions/_shared/aralearn-authoring/supabaseAdapter.js";

const SUPABASE_URL = "https://project.supabase.co";
const RESOURCE = `${SUPABASE_URL}/functions/v1/aralearn-authoring-mcp`;
const USER_ID = "11111111-1111-4111-8111-111111111111";

function token(claims) {
  return [
    Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url"),
    Buffer.from(JSON.stringify(claims)).toString("base64url"),
    "assinatura-validada-pelo-auth"
  ].join(".");
}

function claims(overrides = {}) {
  return {
    iss: `${SUPABASE_URL}/auth/v1`,
    aud: RESOURCE,
    client_id: "chatgpt-oauth-client",
    sub: USER_ID,
    iat: Math.floor(Date.now() / 1000) - 10,
    exp: Math.floor(Date.now() / 1000) + 600,
    ...overrides
  };
}

function adapter({
  userId = USER_ID,
  supabaseUrl = SUPABASE_URL,
  oauthIssuer = ""
} = {}) {
  const instance = new SupabaseAuthoringAdapter({
    supabaseUrl,
    ...(oauthIssuer ? { oauthIssuer } : {}),
    serverApiKey: `sb_secret_${"a".repeat(40)}`,
    publishableKey: `sb_publishable_${"b".repeat(32)}`,
    attempts: 1,
    fetchImpl: async (url, init) => {
      assert.equal(url, `${supabaseUrl}/auth/v1/user`);
      assert.equal(init.headers.apikey.startsWith("sb_publishable_"), true);
      assert.match(init.headers.Authorization, /^Bearer /u);
      return new Response(JSON.stringify({ id: userId }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    },
    scheduleBackground() {}
  });
  instance.rpc = async (functionName) => {
    if (functionName === "resolve_authoring_oauth_principal") {
      return [{
        active: true,
        actor_id: USER_ID,
        scopes: []
      }];
    }
    return { status: "idle" };
  };
  return instance;
}

test("OAuth associa token validado, audience MCP e identidade ao principal privado", async () => {
  const resolved = await adapter().resolvePrincipal({
    kind: "oauth",
    credential: token(claims()),
    resource: RESOURCE
  });

  assert.equal(resolved.actorId, USER_ID);
  assert.equal(resolved.authenticationKind, "oauth");
  assert.equal(resolved.oauthClientId, "chatgpt-oauth-client");
  assert.deepEqual(resolved.scopes.sort(), [
    "authoring:private:audit",
    "authoring:private:read",
    "authoring:private:write"
  ]);
});

test("OAuth distingue o issuer público da rota interna usada pela Edge Function", async () => {
  const internalSupabaseUrl = "http://kong:8000";
  const resolved = await adapter({
    supabaseUrl: internalSupabaseUrl,
    oauthIssuer: `${SUPABASE_URL}/auth/v1`
  }).resolvePrincipal({
    kind: "oauth",
    credential: token(claims()),
    resource: RESOURCE
  });

  assert.equal(resolved.actorId, USER_ID);
  await assert.rejects(
    adapter({ supabaseUrl: internalSupabaseUrl }).resolvePrincipal({
      kind: "oauth",
      credential: token(claims()),
      resource: RESOURCE
    }),
    (error) => error?.code === "invalid_oauth_token"
  );
});

test("OAuth recusa audience, issuer e expiração incompatíveis sem inventar claim de escopo", async () => {
  const invalidClaims = [
    claims({ aud: "https://example.test/outro-recurso" }),
    claims({ iss: "https://issuer.example.test" }),
    claims({ exp: Math.floor(Date.now() / 1000) - 1 }),
    claims({ iat: Math.floor(Date.now() / 1000) + 120 }),
    claims({ nbf: "depois" }),
    claims({ nbf: Math.floor(Date.now() / 1000) + 120 })
  ];

  for (const value of invalidClaims) {
    await assert.rejects(
      adapter().resolvePrincipal({
        kind: "oauth",
        credential: token(value),
        resource: RESOURCE
      }),
      (error) => error?.code === "invalid_oauth_token"
    );
  }

  const withoutScopeClaim = await adapter().resolvePrincipal({
    kind: "oauth",
    credential: token(claims()),
    resource: RESOURCE
  });
  assert.equal(withoutScopeClaim.oauthClientId, "chatgpt-oauth-client");
});

test("OAuth recusa divergência entre sub do token e usuário validado pelo Auth", async () => {
  await assert.rejects(
    adapter({ userId: "22222222-2222-4222-8222-222222222222" }).resolvePrincipal({
      kind: "oauth",
      credential: token(claims()),
      resource: RESOURCE
    }),
    (error) => error?.code === "invalid_oauth_token"
  );
});

test("validação SQL preserva caminho e regra estruturados sem expor a linha", async () => {
  const instance = new SupabaseAuthoringAdapter({
    supabaseUrl: SUPABASE_URL,
    serverApiKey: `sb_secret_${"a".repeat(40)}`,
    publishableKey: `sb_publishable_${"b".repeat(32)}`,
    attempts: 1,
    fetchImpl: async () => new Response(JSON.stringify({
      code: "23514",
      message: "O campo topics pertence à estrutura da entidade lesson.",
      details: JSON.stringify({
        path: "entities[lesson:licao-1].content.topics",
        rule: "workspace_entity_content_separation",
        errors: [{
          path: "entities[lesson:licao-1].content.topics",
          message: "O campo topics pertence à estrutura da entidade lesson.",
          reason: "child_collection_in_atomic_content",
          rule: "workspace_entity_content_separation"
        }]
      })
    }), {
      status: 400,
      headers: { "Content-Type": "application/json" }
    }),
    scheduleBackground() {}
  });

  await assert.rejects(
    instance.rpc("commit_authoring_workspace_changes_v5", {}),
    (error) => {
      assert.equal(error.status, 422);
      assert.equal(error.code, "invalid_command");
      assert.equal(
        error.details.path,
        "entities[lesson:licao-1].content.topics"
      );
      assert.equal(
        error.details.rule,
        "workspace_entity_content_separation"
      );
      assert.equal(
        error.details.errors[0].reason,
        "child_collection_in_atomic_content"
      );
      return true;
    }
  );
});
