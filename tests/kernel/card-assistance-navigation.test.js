import assert from "node:assert/strict";
import test from "node:test";

import {
  appendCardAssistanceLedgerTurn,
  createCardAssistanceLedger,
  restoreCardAssistanceLedgerVersion
} from "../../src/assist/cardAssistanceLedger.js";
import {
  cardAssistanceLedgerNavigation,
  resolveCardAssistanceChatOperation,
  resolveCardAssistanceNavigationPrompt
} from "../../src/assist/cardAssistanceNavigation.js";

const selection = {
  courseKey: "c",
  moduleKey: "m",
  lessonKey: "l",
  microsequenceKey: "s",
  cardKey: "card"
};

function card(title) {
  return { id: "card", position: 0, title };
}

function append(ledger, before, after) {
  return appendCardAssistanceLedgerTurn(ledger, {
    beforeCard: before,
    afterCard: after,
    operation: "edit_text",
    request: `mudar para ${after.title}`,
    assistantResponse: "Alterado.",
    outcome: "applied"
  }).ledger;
}

test("navegação identifica versões anterior e seguinte no ramo ativo", () => {
  const first = card("A");
  const second = card("B");
  const third = card("C");
  let ledger = createCardAssistanceLedger({ selection, card: first });
  ledger = append(ledger, first, second);
  ledger = append(ledger, second, third);
  assert.deepEqual(cardAssistanceLedgerNavigation(ledger), {
    canUndo: true,
    canRedo: false,
    previousVersionId: "v1",
    nextVersionId: ""
  });
  ledger = restoreCardAssistanceLedgerVersion(ledger, "v1").ledger;
  assert.equal(cardAssistanceLedgerNavigation(ledger).nextVersionId, "v2");
});

test("chat resolve retorno, avanço e versão numerada sem chamar modelo", () => {
  const first = card("A");
  const second = card("B");
  const third = card("C");
  let ledger = createCardAssistanceLedger({ selection, card: first });
  ledger = append(ledger, first, second);
  ledger = append(ledger, second, third);
  assert.equal(
    resolveCardAssistanceNavigationPrompt("Volte ao resultado anterior.", ledger).versionId,
    "v1"
  );
  assert.equal(
    resolveCardAssistanceNavigationPrompt("Restaure a versão 1.", ledger).versionId,
    "v1"
  );
  assert.equal(
    resolveCardAssistanceNavigationPrompt("Explique a versão 1 do protocolo.", ledger),
    null
  );
  assert.equal(
    resolveCardAssistanceNavigationPrompt("Na versão 1 da norma, corrija o título.", ledger),
    null
  );
  assert.equal(
    resolveCardAssistanceNavigationPrompt(
      "Não volte à versão 0; corrija apenas o título.",
      ledger
    ),
    null
  );
  assert.equal(
    resolveCardAssistanceNavigationPrompt(
      "Não restaure a versão 0; ajuste o texto.",
      ledger
    ),
    null
  );
  assert.equal(
    resolveCardAssistanceNavigationPrompt("Pode voltar à versão 0.", ledger).versionId,
    "v0"
  );
  assert.equal(
    resolveCardAssistanceNavigationPrompt("Quero voltar à versão 0.", ledger).versionId,
    "v0"
  );
  assert.equal(
    resolveCardAssistanceNavigationPrompt("Desfaça a última alteração.", ledger).versionId,
    "v1"
  );
  ledger = restoreCardAssistanceLedgerVersion(ledger, "v1").ledger;
  assert.equal(
    resolveCardAssistanceNavigationPrompt("Avance ao resultado seguinte.", ledger).versionId,
    "v2"
  );
  assert.equal(
    resolveCardAssistanceNavigationPrompt("Pode refazer o resultado seguinte.", ledger).versionId,
    "v2"
  );
  assert.equal(resolveCardAssistanceNavigationPrompt("Ajuste somente o título.", ledger), null);
});

test("chat reserva recomposição para pedidos estruturais sobre o card inteiro", () => {
  assert.equal(
    resolveCardAssistanceChatOperation("Explique o mesmo texto com mais clareza.", {
      wholeCardSelected: true
    }),
    "edit_text"
  );
  assert.equal(
    resolveCardAssistanceChatOperation("Troque a representação por um gráfico estatístico.", {
      wholeCardSelected: true
    }),
    "recompose_card"
  );
  assert.equal(
    resolveCardAssistanceChatOperation("Troque a representação por um gráfico.", {
      wholeCardSelected: false
    }),
    "edit_text"
  );
  assert.equal(
    resolveCardAssistanceChatOperation("Não mude o diagrama; apenas clareie o texto.", {
      wholeCardSelected: true
    }),
    "edit_text"
  );
  for (const prompt of [
    "Quero trocar o gráfico.",
    "Pode mudar a tabela para comparar as séries?",
    "Preciso adicionar uma fórmula ao card.",
    "Gostaria de incluir um diagrama de estados.",
    "Use uma árvore no lugar desta lista.",
    "Troque por uma matriz.",
    "Combine matriz e fórmula.",
    "Quero um gráfico estatístico.",
    "Quero gráfico em vez de tabela.",
    "Gostaria de gráfico no lugar da tabela.",
    "Prefiro um gráfico à tabela.",
    "Faça um diagrama."
  ]) {
    assert.equal(
      resolveCardAssistanceChatOperation(prompt, { wholeCardSelected: true }),
      "recompose_card",
      prompt
    );
  }
  for (const prompt of [
    "Não quero trocar o gráfico.",
    "Não precisa mudar a tabela; somente explique melhor o texto.",
    "Quero manter o texto sem adicionar fórmula.",
    "Quero um texto mais claro.",
    "Gostaria de uma explicação mais simples.",
    "Mude o texto para ficar mais claro.",
    "Altere o parágrafo sem mudar a estrutura.",
    "Troque o texto por uma redação mais clara.",
    "Substitua o parágrafo por uma explicação melhor.",
    "Substitua o texto por uma versão mais clara.",
    "Altere o rótulo do gráfico.",
    "Altere o título da tabela.",
    "Quero manter o gráfico e alterar o título.",
    "Jamais remova a lacuna.",
    "Evite alterar o diagrama e corrija apenas o rótulo."
  ]) {
    assert.equal(
      resolveCardAssistanceChatOperation(prompt, { wholeCardSelected: true }),
      "edit_text",
      prompt
    );
  }
  assert.equal(
    resolveCardAssistanceChatOperation(
      "Não mude o texto, mas quero trocar o gráfico.",
      { wholeCardSelected: true }
    ),
    "recompose_card"
  );
});
