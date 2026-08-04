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

test("alvos main, response e after:text expõem e alteram somente o recurso prometido", () => {
  const card = base("formula", {
    kind: "exercise",
    exercise: "choice",
    prompt: "Observe a expressão.",
    notation: "mathematics",
    accessibleText: "alfa ao quadrado.",
    expression: {
      type: "superscript",
      base: { type: "identifier", value: "α" },
      exponent: { type: "number", value: "2" }
    },
    question: "Qual descrição corresponde?",
    options: [
      { id: "a", text: "alfa ao quadrado" },
      { id: "b", text: "alfa dividido por dois" }
    ],
    selectionMode: "single",
    selectionCriterion: "correct",
    answerIds: ["a"],
    after: "Leia o expoente."
  });

  const main = buildManualCardEditModel(card, "main");
  assert.deepEqual(main.fields.map((field) => field.key), ["prompt", "accessibleText"]);
  assert.equal(main.options, undefined);

  const response = buildManualCardEditModel(card, "response");
  assert.deepEqual(response.fields.map((field) => field.key), ["question"]);
  assert.deepEqual(response.options.map((option) => option.id), ["a", "b"]);

  const after = buildManualCardEditModel(card, "after:text");
  assert.deepEqual(after.fields.map((field) => field.key), ["after"]);
  assert.equal(after.options, undefined);

  const editedMain = applyManualCardEdit(card, "main", {
    title: "Não alterar",
    prompt: "Observe a potência.",
    question: "Não alterar",
    after: "Não alterar"
  });
  assert.equal(editedMain.title, card.title);
  assert.equal(editedMain.prompt, "Observe a potência.");
  assert.equal(editedMain.question, card.question);
  assert.equal(editedMain.after, card.after);

  const editedResponse = applyManualCardEdit(card, "response", {
    prompt: "Não alterar",
    question: "Como se lê a expressão?",
    optionValues: ["alfa elevado a dois", "alfa sobre dois"],
    correctOptionIndexes: [0],
    after: "Não alterar"
  });
  assert.equal(editedResponse.prompt, card.prompt);
  assert.equal(editedResponse.question, "Como se lê a expressão?");
  assert.deepEqual(
    editedResponse.options.map((option) => option.text),
    ["alfa elevado a dois", "alfa sobre dois"]
  );
  assert.equal(editedResponse.after, card.after);

  const editedAfter = applyManualCardEdit(card, "after:text", {
    title: "Não alterar",
    prompt: "Não alterar",
    after: "Compare base e expoente."
  });
  assert.equal(editedAfter.title, card.title);
  assert.equal(editedAfter.prompt, card.prompt);
  assert.equal(editedAfter.after, "Compare base e expoente.");
});
