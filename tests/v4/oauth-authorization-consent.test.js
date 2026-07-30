import assert from "node:assert/strict";
import test from "node:test";

import {
  OAUTH_AUTHORING_PERMISSION_LABELS,
  readOAuthAuthorizationId,
  redirectToOAuthClient
} from "../../src/ui/OAuthAuthorizationConsent.js";

test("consentimento explicita a autoridade de autoria efetivamente concedida", () => {
  assert.deepEqual(OAUTH_AUTHORING_PERMISSION_LABELS, [
    "Ler os cursos acessíveis pela sua conta",
    "Criar, editar, reorganizar e excluir rascunhos de workspace",
    "Publicar versões completas ou parciais na sua biblioteca privada",
    "Publicar no catálogo somente se sua conta já tiver permissão editorial"
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
