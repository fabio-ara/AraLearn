import assert from "node:assert/strict";
import test from "node:test";

import {
  OAUTH_AUTHORING_PERMISSION_LABELS,
  assertOAuthAuthoringScope,
  readOAuthAuthorizationId,
  readOAuthAuthorizationRequest,
  renderOAuthAuthorizationConsent,
  redirectToOAuthClient
} from "../../src/ui/OAuthAuthorizationConsent.js";

test("consentimento aceita somente continuidade sem token de identidade", () => {
  assert.deepEqual(assertOAuthAuthoringScope("offline_access"), ["offline_access"]);
  for (const scope of ["openid", "email", "offline_access openid", "", "offline_access offline_access"]) {
    assert.throws(
      () => assertOAuthAuthoringScope(scope),
      /permissões incompatíveis/u
    );
  }
});

test("consentimento de Actions aceita somente a identidade solicitada pelo GPT", () => {
  assert.deepEqual(assertOAuthAuthoringScope("openid email", "actions"), ["openid", "email"]);
  for (const scope of ["openid", "email", "offline_access", "email openid", ""]) {
    assert.throws(
      () => assertOAuthAuthoringScope(scope, "actions"),
      /permissões incompatíveis/u
    );
  }
});

test("consentimento incompatível falha antes de oferecer ou enviar aprovação", async () => {
  let decisions = 0;
  const errorNode = { textContent: "" };
  const root = {
    innerHTML: "",
    querySelector(selector) {
      return selector === "[data-oauth-consent-error]" ? errorNode : null;
    }
  };
  const result = await renderOAuthAuthorizationConsent({
    root,
    authorizationId: "authorization-123",
    authClient: {
      async getOAuthAuthorizationDetails() {
        return {
          authorization_id: "authorization-123",
          scope: "offline_access openid",
          client: { id: "client-123", name: "Cliente" },
          user: { email: "pessoa@example.test" }
        };
      },
      async decideOAuthAuthorization() {
        decisions += 1;
      }
    }
  });
  assert.equal(decisions, 0);
  assert.equal(result.redirected, false);
  assert.match(errorNode.textContent, /permissões incompatíveis/u);
  assert.match(root.innerHTML, /Não foi possível revisar a conexão/u);
  assert.doesNotMatch(root.innerHTML, /data-oauth-decision/u);
});

test("consentimento não expõe transporte ou serviço em uma falha", async () => {
  const errorNode = { textContent: "" };
  const root = {
    innerHTML: "",
    querySelector(selector) {
      return selector === "[data-oauth-consent-error]" ? errorNode : null;
    }
  };
  const result = await renderOAuthAuthorizationConsent({
    root,
    authorizationId: "authorization-123",
    authClient: {
      async getOAuthAuthorizationDetails() {
        throw new Error("Supabase respondeu com HTTP 500.");
      },
      async decideOAuthAuthorization() {}
    }
  });

  assert.equal(result.redirected, false);
  assert.equal(errorNode.textContent, "Não foi possível revisar a conexão.");
  assert.doesNotMatch(errorNode.textContent, /Supabase|HTTP/iu);
});

test("consentimento orienta novo acesso quando a sessão expirou", async () => {
  const errorNode = { textContent: "" };
  const root = {
    innerHTML: "",
    querySelector(selector) {
      return selector === "[data-oauth-consent-error]" ? errorNode : null;
    }
  };
  const expired = Object.assign(new Error("Invalid JWT"), { status: 401 });
  const result = await renderOAuthAuthorizationConsent({
    root,
    authorizationId: "authorization-123",
    authClient: {
      async getOAuthAuthorizationDetails() { throw expired; },
      async decideOAuthAuthorization() {}
    }
  });

  assert.equal(result.redirected, false);
  assert.equal(errorNode.textContent, "Seu acesso expirou. Entre novamente e tente outra vez.");
  assert.doesNotMatch(errorNode.textContent, /Invalid JWT|401/iu);
});

test("consentimento explicita a autoridade de autoria efetivamente concedida", () => {
  assert.deepEqual(OAUTH_AUTHORING_PERMISSION_LABELS, [
    "Ler seus cursos, planejamento e conteúdo na autoria",
    "Criar cursos privados e alterar metadados, planejamento e conteúdo",
    "Consultar observações; incluir o texto somente quando você pedir explicitamente",
    "Consultar e validar os componentes didáticos disponíveis"
  ]);
});

test("consentimento lê somente o identificador OAuth da consulta", () => {
  assert.equal(
    readOAuthAuthorizationId({
      search: "?outro=valor&authorization_id=authorization-123"
    }),
    "authorization-123"
  );
  assert.equal(readOAuthAuthorizationId({ search: "?outro=valor" }), "");
  assert.deepEqual(
    readOAuthAuthorizationRequest({
      search: "?action_authorization_id=action-123&authorization_id=mcp-123"
    }),
    { authorizationId: "action-123", channel: "actions" }
  );
});

test("redirecionamento OAuth aceita HTTPS e HTTP estritamente local", () => {
  const assigned = [];
  const locationValue = {
    assign(value) {
      assigned.push(value);
    }
  };

  assert.equal(
    redirectToOAuthClient(
      "https://chatgpt.com/oauth/callback?code=resultado",
      locationValue
    ),
    "https://chatgpt.com/oauth/callback?code=resultado"
  );
  assert.equal(
    redirectToOAuthClient("http://localhost:54321/callback", locationValue),
    "http://localhost:54321/callback"
  );
  assert.deepEqual(assigned, [
    "https://chatgpt.com/oauth/callback?code=resultado",
    "http://localhost:54321/callback"
  ]);
});

test("redirecionamento OAuth rejeita destinos inseguros", () => {
  const locationValue = { assign() {} };
  assert.throws(
    () => redirectToOAuthClient("http://example.com/callback", locationValue),
    /destino inseguro/u
  );
  assert.throws(
    () => redirectToOAuthClient("https://usuario:senha@example.com/callback", locationValue),
    /destino inseguro/u
  );
  assert.throws(
    () => redirectToOAuthClient("javascript:alert(1)", locationValue),
    /destino inseguro/u
  );
});
