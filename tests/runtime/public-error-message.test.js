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
    "Falha para 10000000-0000-4000-8000-000000000001."
  ]) {
    assert.equal(publicErrorMessage(new Error(message), FALLBACK), FALLBACK);
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

  const human = fixture();
  renderAuthGate({
    root: human.root,
    configured: true,
    authClient: { redirectError: "O link expirou. Solicite outro." }
  });
  assert.equal(human.status.textContent, "O link expirou. Solicite outro.");
});
