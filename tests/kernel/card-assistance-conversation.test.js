import assert from "node:assert/strict";
import test from "node:test";

import {
  appendCardAssistanceConversationTurn,
  cardAssistanceConversationContext,
  cardAssistanceConversationKey,
  normalizeCardAssistanceConversation
} from "../../src/assist/cardAssistanceConversation.js";

const selection = Object.freeze({
  courseKey: "course-1",
  moduleKey: "module-1",
  lessonKey: "lesson-1",
  microsequenceKey: "micro-1",
  cardKey: "card-1"
});

test("conversa de reparo permanece isolada pela identidade completa do card", () => {
  const key = cardAssistanceConversationKey(selection);
  assert.equal(key, "course-1::module-1::lesson-1::micro-1::card-1");
  assert.notEqual(key, cardAssistanceConversationKey({ ...selection, cardKey: "card-2" }));
});

test("cada iteração registra instrução e seleção já aplicadas", () => {
  const first = appendCardAssistanceConversationTurn(null, selection, {
    request: "Explique o referente antes da sigla.",
    assistantResponse: "Situei o referente antes da primeira ocorrência da sigla.",
    scope: "resources",
    targetIds: ["content:paragraph-1"],
    modelId: "provider/model"
  });
  const second = appendCardAssistanceConversationTurn(first, selection, {
    request: "Agora dê um exemplo concreto.",
    assistantResponse: "Acrescentei um exemplo concreto após a explicação.",
    scope: "card",
    targetIds: [],
    modelId: "provider/model"
  });
  assert.deepEqual(cardAssistanceConversationContext(second, selection), [
    {
      turn: 1,
      userRequest: "Explique o referente antes da sigla.",
      assistantResponse: "Situei o referente antes da primeira ocorrência da sigla.",
      appliedTo: ["content:paragraph-1"]
    },
    {
      turn: 2,
      userRequest: "Agora dê um exemplo concreto.",
      assistantResponse: "Acrescentei um exemplo concreto após a explicação.",
      appliedTo: ["card"]
    }
  ]);
});

test("contexto para modelos menores é limitado às oito iterações recentes", () => {
  const turns = Array.from({ length: 12 }, (_, index) => ({
    request: `Pedido ${index + 1}`,
    assistantResponse: `Resposta ${index + 1}`,
    scope: "resources",
    targetIds: [`content:${index + 1}`]
  }));
  const normalized = normalizeCardAssistanceConversation({ turns }, selection);
  assert.equal(normalized.turns.length, 8);
  assert.equal(normalized.turns[0].request, "Pedido 5");
  assert.equal(normalized.turns.at(-1).request, "Pedido 12");
});
