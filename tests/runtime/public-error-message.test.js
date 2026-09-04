import assert from "node:assert/strict";
import test from "node:test";

import { renderAuthGate } from "../../src/ui/AuthGate.js";
import { publicErrorMessage } from "../../src/ui/publicErrorMessage.js";

const FALLBACK = "Não foi possível carregar esta área agora.";

test("fronteira pública preserva uma orientação humana segura", () => {
  assert.equal(
    publicErrorMessage(
      new Error("O curso mudou durante a leitura. Recarregue para ver a versão atual."),
      FALLBACK
    ),
    "O curso mudou durante a leitura. Recarregue para ver a versão atual."
  );
});

test("fronteira pública substitui detalhes internos pelo contexto da operação", () => {
  for (const message of [
    "A leitura de Fontes não contém contract.",
    "A página de observações não contém courseRevision.",
    "A mudança de observação não contém requestId.",
    "A identidade do Curso precisa ser um UUID canônico.",
    "A paginação repetiu um cursor sem avançar.",
    "Informe um endpoint válido para o serviço escolhido.",
    "Supabase respondeu com HTTP 500.",
    "A sugestão não respeitou o formato estruturado exigido.",
    "O resultado contém o campo desconhecido foo.",
    "O resumo byOrigin é inválido.",
    "Uma Fonte visível não contém texto de citação.",
    "Falha em $.studyUnit.response.id.",
    "Falha para 10000000-0000-4000-8000-000000000001.",
    "Failed to fetch",
    "Invalid login credentials",
    "Forbidden",
    "Invalid JWT",
    "CourseVersion is invalid",
    "CourseDocument is invalid",
    "PostgREST request failed",
    "Cannot read properties of undefined"
  ]) {
    assert.equal(publicErrorMessage(new Error(message), FALLBACK), FALLBACK);
  }
});

test("fronteira pública orienta conflito e acesso mesmo sem texto específico da tela", () => {
  for (const error of [
    Object.assign(new Error("Conflict"), { status: 409 }),
    Object.assign(new Error("Registro divergente"), { code: "course_revision_changed" })
  ]) {
    assert.equal(
      publicErrorMessage(error, FALLBACK),
      "O conteúdo mudou. Recarregue e tente novamente."
    );
  }

  for (const error of [
    Object.assign(new Error("Unauthorized"), { status: 401 }),
    Object.assign(new Error("Token inválido"), { code: "invalid_jwt" })
  ]) {
    assert.equal(
      publicErrorMessage(error, FALLBACK),
      "Seu acesso expirou. Entre novamente e tente outra vez."
    );
  }

  for (const error of [
    Object.assign(new Error("Forbidden"), { status: 403 }),
    Object.assign(new Error("Permissão negada"), { code: "permission_denied" })
  ]) {
    assert.equal(
      publicErrorMessage(error, FALLBACK),
      "Você não tem permissão para concluir esta operação."
    );
  }
});

test("fronteira pública orienta conexão e conflito pelos sinais técnicos", () => {
  for (const networkError of [
    new TypeError("Failed to fetch"),
    Object.assign(new Error("Pedido interrompido."), { code: "offline" })
  ]) {
    assert.equal(publicErrorMessage(networkError, FALLBACK, {
      network: "Sem conexão para salvar a fonte."
    }), "Sem conexão para salvar a fonte.");
  }

  for (const error of [
    Object.assign(new Error("O registro mudou."), { code: "course_revision_changed" }),
    Object.assign(new Error("Conflict"), { status: 409 })
  ]) {
    assert.equal(publicErrorMessage(error, FALLBACK, {
      conflict: "O curso mudou. Recarregue as fontes antes de salvar."
    }), "O curso mudou. Recarregue as fontes antes de salvar.");
  }
});

test("acesso não apresenta a mensagem bruta do transporte", () => {
  const fixture = () => {
    const status = { textContent: "", dataset: {} };
    return {
      status,
      root: {
        innerHTML: "",
        querySelector(selector) {
          return selector === "[data-auth-status]" ? status : null;
        },
        querySelectorAll() { return []; }
      }
    };
  };
  const technical = fixture();
  renderAuthGate({
    root: technical.root,
    configured: true,
    authClient: { redirectError: "Supabase respondeu com HTTP 500." }
  });
  assert.equal(technical.status.textContent, "Não foi possível confirmar o acesso.");

  const missing = fixture();
  renderAuthGate({ root: missing.root, configured: false });
  assert.equal(missing.status.textContent, "A configuração de acesso está ausente neste ambiente.");
  assert.doesNotMatch(missing.status.textContent, /Supabase|HTTP/iu);

  for (const redirectError of [
    "O link expirou. Solicite outro.",
    Object.assign(new Error("User already registered"), { status: 422 })
  ]) {
    const untrusted = fixture();
    renderAuthGate({ root: untrusted.root, configured: true, authClient: { redirectError } });
    assert.equal(untrusted.status.textContent, "Não foi possível confirmar o acesso.");
    assert.doesNotMatch(untrusted.status.textContent, /link expirou|User already registered|422/iu);
  }
});
