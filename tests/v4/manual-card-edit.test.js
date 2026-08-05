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

test("edição manual separa o título dos resources do card", () => {
  const card = base("paragraph", {
    kind: "exercise",
    exercise: "gap",
    text: "Duas mais duas são [[quatro::três|cinco]]."
  });
  const model = buildManualCardEditModel(card, "card");
  assert.deepEqual(model.fields.map((field) => field.key), ["title"]);

  const renamed = applyManualCardEdit(card, "card", {
    title: "Soma"
  });
  assert.equal(renamed.title, "Soma");
  assert.equal(renamed.text, card.text);
  assert.equal(renamed.after, card.after);

  const editedMain = applyManualCardEdit(renamed, "main", {
    pathValues: { text: "Três mais três são [[seis::cinco|sete]]." }
  });
  assert.equal(editedMain.title, "Soma");
  assert.match(editedMain.text, /\[\[seis::cinco\|sete\]\]/u);

  const editedAfter = applyManualCardEdit(editedMain, "after:text", {
    pathValues: { after: "Confira a operação." }
  });
  assert.equal(editedAfter.text, editedMain.text);
  assert.equal(editedAfter.after, "Confira a operação.");
});

test("edição manual preserva identidades e resposta ao editar o texto das alternativas", () => {
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
  const edited = applyManualCardEdit(card, "main", {
    pathValues: {
      question: "Qual é o valor?",
      "options[0].text": "quatro",
      "options[1].text": "cinco"
    }
  });
  assert.deepEqual(edited.options.map((option) => option.id), ["a", "b"]);
  assert.deepEqual(edited.options.map((option) => option.text), ["quatro", "cinco"]);
  assert.deepEqual(edited.answerIds, ["b"]);
});

test("edição manual troca cabeçalhos e células de tabela", () => {
  const card = base("table", {
    columns: ["Conceito", "Definição"],
    rows: [["A", "Primeiro"], ["B", "Segundo"]]
  });
  const edited = applyManualCardEdit(card, "main", {
    pathValues: {
      "columns[0]": "Item",
      "columns[1]": "Sentido",
      "rows[0][1]": "Inicial",
      "rows[1][1]": "Posterior"
    }
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
  assert.deepEqual(main.pathFields.map((field) => field.path), [
    "prompt",
    "expression.base.value",
    "expression.exponent.value"
  ]);

  const response = buildManualCardEditModel(card, "response");
  assert.deepEqual(response.pathFields.map((field) => field.path), [
    "question",
    "options[0].text",
    "options[1].text"
  ]);

  const after = buildManualCardEditModel(card, "after:text");
  assert.deepEqual(after.fields.map((field) => field.key), ["after"]);

  const editedMain = applyManualCardEdit(card, "main", {
    pathValues: {
      title: "Não alterar",
      prompt: "Observe a potência.",
      question: "Não alterar",
      after: "Não alterar",
      accessibleText: "Não alterar",
      "expression.exponent.value": "3"
    }
  });
  assert.equal(editedMain.title, card.title);
  assert.equal(editedMain.prompt, "Observe a potência.");
  assert.equal(editedMain.expression.exponent.value, "3");
  assert.equal(editedMain.accessibleText, card.accessibleText);
  assert.equal(editedMain.question, card.question);
  assert.equal(editedMain.after, card.after);

  const editedResponse = applyManualCardEdit(card, "response", {
    pathValues: {
      prompt: "Não alterar",
      question: "Como se lê a expressão?",
      "options[0].text": "alfa elevado a dois",
      "options[1].text": "alfa sobre dois",
      answerIds: ["b"],
      after: "Não alterar"
    }
  });
  assert.equal(editedResponse.prompt, card.prompt);
  assert.equal(editedResponse.question, "Como se lê a expressão?");
  assert.deepEqual(
    editedResponse.options.map((option) => option.text),
    ["alfa elevado a dois", "alfa sobre dois"]
  );
  assert.equal(editedResponse.after, card.after);

  const editedAfter = applyManualCardEdit(card, "after:text", {
    pathValues: {
      title: "Não alterar",
      prompt: "Não alterar",
      after: "Compare base e expoente."
    }
  });
  assert.equal(editedAfter.title, card.title);
  assert.equal(editedAfter.prompt, card.prompt);
  assert.equal(editedAfter.after, "Compare base e expoente.");
});
