import test from "node:test";
import assert from "node:assert/strict";

import { buildCardRuntime, readCardText } from "../src/core/cardRuntime.js";

test("compila card choice para runtime interno de múltipla escolha", () => {
  const runtime = buildCardRuntime({
    key: "card-choice",
    type: "choice",
    title: "Leitura rápida",
    ask: "Qual alternativa combina com o card?",
    answer: ["Resposta correta"],
    wrong: ["Distrator A", "Distrator B"]
  });

  assert.equal(runtime.title, "Leitura rápida");
  assert.equal(runtime.blocks[0].kind, "heading");
  assert.equal(runtime.blocks[1].kind, "multiple_choice");
  assert.equal(runtime.blocks[1].ask, "Qual alternativa combina com o card?");
  assert.deepEqual(
    runtime.blocks[1].options.map((item) => [item.value, item.answer]),
    [
      ["Resposta correta", true],
      ["Distrator A", false],
      ["Distrator B", false]
    ]
  );
  assert.equal(runtime.blocks.at(-1).kind, "button");
});

test("compila card table para runtime interno com cabeçalhos e linhas", () => {
  const runtime = buildCardRuntime({
    key: "card-table",
    type: "table",
    title: "Quadro",
    columns: ["Campo", "Uso"],
    rows: [["type", "Tipo do card"]]
  });

  assert.equal(runtime.blocks[1].kind, "table");
  assert.equal(runtime.blocks[1].title, "Quadro");
  assert.deepEqual(
    runtime.blocks[1].headers.map((item) => item.value),
    ["Campo", "Uso"]
  );
  assert.deepEqual(
    runtime.blocks[1].rows.map((row) => row.map((cell) => cell.value)),
    [["type", "Tipo do card"]]
  );
});

test("lê texto representativo de cards de fluxo e tabela", () => {
  assert.equal(
    readCardText({
      type: "flow",
      flow: [{ start: "Início" }, { process: "Validar" }, { end: "Fim" }]
    }),
    "start: Início\nprocess: Validar\nend: Fim"
  );

  assert.equal(
    readCardText({
      type: "table",
      columns: ["A", "B"],
      rows: [["1", "2"], ["3", "4"]]
    }),
    "1 | 2\n3 | 4"
  );
});

