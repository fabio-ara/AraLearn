import test from "node:test";
import assert from "node:assert/strict";

import { buildCardRuntime, readCardText } from "../src/core/cardRuntime.js";

test("compila card choice para runtime interno de múltipla escolha", () => {
  const runtime = buildCardRuntime({
    key: "card-choice",
    title: "Leitura rápida",
    ask: "Qual alternativa combina com o card?",
    answer: "Resposta correta",
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

test("compila card say com lacuna para runtime interno de texto comum", () => {
  const runtime = buildCardRuntime({
    key: "card-complete",
    title: "Complete",
    say: "No modelo [[cascata]], mudanças tardias custam mais.",
    wrong: ["iterativo"]
  });

  assert.equal(runtime.blocks[1].kind, "paragraph");
  assert.equal(runtime.blocks[1].value, "No modelo [[cascata::cascata|iterativo]], mudanças tardias custam mais.");
});

test("compila card table para runtime interno com cabeçalhos e linhas", () => {
  const runtime = buildCardRuntime({
    key: "card-table",
    title: "Quadro",
    table: {
      columns: ["Campo", "Uso"],
      rows: [["say", "Intenção textual"]]
    }
  });

  assert.equal(runtime.blocks[1].kind, "table");
  assert.equal(runtime.blocks[1].title, "Quadro");
  assert.deepEqual(
    runtime.blocks[1].headers.map((item) => item.value),
    ["Campo", "Uso"]
  );
  assert.deepEqual(
    runtime.blocks[1].rows.map((row) => row.map((cell) => cell.value)),
    [["say", "Intenção textual"]]
  );
});

test("lê texto representativo de cards de fluxo e tabela", () => {
  assert.equal(
    readCardText({
      flow: [{ start: "Início" }, { process: "Validar" }, { end: "Fim" }]
    }),
    "start: Início\nprocess: Validar\nend: Fim"
  );

  assert.equal(
    readCardText({
      table: {
        columns: ["A", "B"],
        rows: [["1", "2"], ["3", "4"]]
      }
    }),
    "1 | 2\n3 | 4"
  );
});

test("compila card flow para runtime interno com structure validada", () => {
  const runtime = buildCardRuntime({
    key: "card-flow",
    title: "Decisão simples",
    flow: [
      { start: "Início" },
      {
        if: "x > 0",
        then: [{ process: "Seguir" }],
        else: [{ output: "Parar" }]
      },
      { end: "Fim" }
    ]
  });

  assert.equal(runtime.blocks[1].kind, "flowchart");
  assert.equal(runtime.blocks[1].structureVersion, 1);
  assert.equal(runtime.blocks[1].structureValid, true);
  assert.equal(runtime.blocks[1].structure.kind, "sequence");
  assert.equal(runtime.blocks[1].structure.items[1].kind, "if_then_else");
  assert.equal(runtime.blocks[1].projectionVersion, 1);
  assert.equal(runtime.blocks[1].projectionValid, true);
  assert.equal(runtime.blocks[1].projection.nodes[1].shape, "decision");
  assert.ok(runtime.blocks[1].projection.links.some((link) => link.role === "yes"));
});
