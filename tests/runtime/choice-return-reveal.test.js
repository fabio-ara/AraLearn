import assert from "node:assert/strict";
import test from "node:test";
import { choiceResponseInteraction } from "../../src/resources/packages/choice-response/interaction.js";

// Issue 466: o package de escolha pede ao host que revele o retorno autoral da alternativa
// marcada. Regra do contrato: havendo alternativa marcada incorreta, só uma dessas pode ser
// revelada e, se nenhuma delas declarar retorno, nada é revelado; o retorno de uma marcada
// qualquer só serve no erro por omissão. Este teste exercita o contrato do host, sem DOM,
// sem browser e sem servidor.

const option = (id, feedback) => (feedback ? { id, text: id, feedback } : { id, text: id });

function submit({ options, answerIds, selected, selectionMode = "single" }) {
  const data = { question: "Q", selectionMode, selectionCriterion: "correct", options, answerIds };
  const reveals = [];
  const state = { selected: [...selected], feedback: null };
  const host = {
    blockKey: "study-unit::response:r",
    evaluate: ({ selectedIds }) => ({
      correct: selectedIds.length === answerIds.length && selectedIds.every((id) => answerIds.includes(id))
    }),
    reveal: (...args) => { reveals.push(args); }
  };
  const result = choiceResponseInteraction.submit(data, state, host);
  return { result, state, reveals };
}

test("escolha: a marcada incorreta com retorno é o alvo revelado", () => {
  const { result, state, reveals } = submit({
    options: [option("correta", "Retorno da correta."), option("errada", "Retorno da errada.")],
    answerIds: ["correta"], selected: ["correta", "errada"]
  });
  assert.equal(result, false);
  assert.equal(state.feedback, "wrong");
  assert.equal(reveals.length, 1);
  assert.deepEqual(reveals[0], ["[data-choice-return-option]", {
    "data-choice-return-option": "errada", "data-choice-return-block": "study-unit::response:r"
  }]);
});

test("escolha: marcada incorreta sem retorno não desvia o olhar para a correta marcada", () => {
  const { state, reveals } = submit({
    options: [option("correta", "Retorno da correta."), option("errada", null)],
    answerIds: ["correta"], selected: ["correta", "errada"]
  });
  assert.equal(state.feedback, "wrong");
  assert.deepEqual(reveals, [], "sem retorno na alternativa incorreta, nada é revelado");
});

test("escolha: erro por omissão revela o retorno da marcada que declara retorno", () => {
  const { state, reveals } = submit({
    options: [option("a", "Retorno de a."), option("b", "Retorno de b.")],
    answerIds: ["a", "b"], selected: ["a"], selectionMode: "multiple"
  });
  assert.equal(state.feedback, "wrong");
  assert.equal(reveals.length, 1);
  assert.equal(reveals[0][1]["data-choice-return-option"], "a");
});

test("escolha: sem retorno declarado em nenhuma marcada, nada é revelado", () => {
  const { reveals } = submit({ options: [option("a", null), option("b", null)], answerIds: ["a"], selected: ["b"] });
  assert.deepEqual(reveals, []);
});

test("escolha: acerto não pede revelação", () => {
  const { result, state, reveals } = submit({ options: [option("a", "Retorno de a.")], answerIds: ["a"], selected: ["a"] });
  assert.equal(result, true);
  assert.equal(state.feedback, "correct");
  assert.deepEqual(reveals, []);
});

test("escolha: host sem reveal é ignorado sem erro", () => {
  const data = { question: "Q", selectionMode: "single", selectionCriterion: "correct",
    options: [option("a", "Retorno de a.")], answerIds: ["a"] };
  const state = { selected: ["b"], feedback: null };
  const result = choiceResponseInteraction.submit(data, state, { blockKey: "k", evaluate: () => ({ correct: false }) });
  assert.equal(result, false);
  assert.equal(state.feedback, "wrong");
});
