import test from "node:test";
import assert from "node:assert/strict";

import {
  applyManualCardEdit,
  buildManualCardEditModel
} from "../../src/ui/manualCardEdit.js";

function base(resource, patch = {}) {
  return {
    id: `card-${resource}`,
    position: 1,
    resource,
    kind: "theory",
    exercise: "none",
    title: "Título",
    after: "",
    ...patch
  };
}

test("edição manual altera título, parágrafo e lacuna sem expor contrato", () => {
  const card = base("paragraph", {
    kind: "exercise",
    exercise: "gap",
    text: "Duas mais duas são [[quatro::três|cinco]]."
  });
  const model = buildManualCardEditModel(card, "card");
  assert.deepEqual(model.fields.map((field) => field.key), ["title", "text", "after"]);

  const edited = applyManualCardEdit(card, "card", {
    title: "Soma",
    text: "Três mais três são [[seis::cinco|sete]].",
    after: "Confira a operação."
  });
  assert.equal(edited.title, "Soma");
  assert.match(edited.text, /\[\[seis::cinco\|sete\]\]/u);
  assert.equal(edited.after, "Confira a operação.");
});

test("edição manual preserva identidades de alternativas e troca a resposta", () => {
  const card = base("choice", {
    kind: "exercise",
    exercise: "choice",
    question: "Qual é o resultado?",
    selectionMode: "single",
    selectionCriterion: "correct",
    options: [
      { id: "a", kind: "text", text: "3" },
      { id: "b", kind: "text", text: "4" }
    ],
    answerIds: ["b"]
  });
  const edited = applyManualCardEdit(card, "card", {
    title: "Escolha",
    question: "Qual é o valor?",
    optionValues: ["quatro", "cinco"],
    correctOptionIndexes: [0]
  });
  assert.deepEqual(edited.options.map((option) => option.id), ["a", "b"]);
  assert.deepEqual(edited.options.map((option) => option.text), ["quatro", "cinco"]);
  assert.deepEqual(edited.answerIds, ["a"]);
});

test("edição manual troca cabeçalhos e células de tabela", () => {
  const card = base("table", {
    columns: ["Conceito", "Definição"],
    rows: [["A", "Primeiro"], ["B", "Segundo"]]
  });
  const edited = applyManualCardEdit(card, "card", {
    title: "Tabela",
    columns: ["Item", "Sentido"],
    rows: [["A", "Inicial"], ["B", "Posterior"]]
  });
  assert.deepEqual(edited.columns, ["Item", "Sentido"]);
  assert.deepEqual(edited.rows, [["A", "Inicial"], ["B", "Posterior"]]);
});
