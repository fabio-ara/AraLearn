import assert from "node:assert/strict";
import test from "node:test";

import {
  OAUTH_AUTHORING_PERMISSION_LABELS,
  readActionOAuthAuthorizationId,
  readOAuthAuthorizationId,
  redirectToOAuthClient
} from "../../src/ui/OAuthAuthorizationConsent.js";

test("consentimento explicita a autoridade de autoria efetivamente concedida", () => {
  assert.deepEqual(OAUTH_AUTHORING_PERMISSION_LABELS, [
    "Ler seus Cursos, planejamento e conteúdo na Autoria",
    "Criar Cursos privados e alterar metadados, planejamento e conteúdo",
    "Ler e atualizar seu perfil e gerir acesso direto para Estudo após confirmação",
    "Consultar contratos e validar os componentes didáticos instalados"
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
  assert.equal(
    readActionOAuthAuthorizationId({
      search: `?action_authorization_id=${encodeURIComponent("22222222-2222-4222-8222-222222222222")}`
    }),
    "22222222-2222-4222-8222-222222222222"
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
