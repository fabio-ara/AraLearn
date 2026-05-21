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
  assert.equal(runtime.blocks[1].title, "");
  assert.deepEqual(
    runtime.blocks[1].headers.map((item) => item.value),
    ["Campo", "Uso"]
  );
  assert.deepEqual(
    runtime.blocks[1].rows.map((row) => row.map((cell) => cell.value)),
    [["say", "Intenção textual"]]
  );
});

test("preserva subtítulo explícito de tabela quando ele difere do título do card", () => {
  const runtime = buildCardRuntime({
    key: "card-table-subtitle",
    title: "Comparação",
    table: {
      title: "Critérios principais",
      columns: ["Campo", "Uso"],
      rows: [["say", "Intenção textual"]]
    }
  });

  assert.equal(runtime.blocks[1].kind, "table");
  assert.equal(runtime.blocks[1].title, "Critérios principais");
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

test("compila card graph para runtime interno com layout e destaque estáveis", () => {
  const runtime = buildCardRuntime({
    key: "card-graph",
    title: "Grafo",
    graph: {
      vertices: [
        { id: "A" },
        { id: "B" },
        { id: "C" }
      ],
      edges: [
        { from: "A", to: "B", weight: 2 },
        { from: "A", to: "C" }
      ],
      highlight: {
        vertices: ["A"],
        edges: [["B", "A"]]
      }
    }
  });

  assert.equal(runtime.blocks[1].kind, "graph");
  assert.equal(runtime.blocks[1].vertices.length, 3);
  assert.equal(runtime.blocks[1].edges.length, 2);
  assert.equal(runtime.blocks[1].edges[0].weight, "2");
  assert.equal(runtime.blocks[1].vertices[0].highlighted, true);
  assert.equal(runtime.blocks[1].edges[0].highlighted, true);
  assert.match(runtime.blocks[1].summaryText, /arestas A-B, A-C/i);
  assert.deepEqual(
    runtime.blocks[1].vertices.map((vertex) => [vertex.id, vertex.x, vertex.y]),
    [
      ["A", 50, 16],
      ["B", 79.44, 67],
      ["C", 20.56, 67]
    ]
  );
});

test("compila graph com coordenadas didáticas pequenas ajustando ao canvas", () => {
  const runtime = buildCardRuntime({
    key: "card-graph-small-scale",
    title: "Königsberg",
    graph: {
      vertices: [
        { id: "N", label: "Margem norte", x: 0, y: 0 },
        { id: "S", label: "Margem sul", x: 0, y: 4 },
        { id: "I1", label: "Ilha central", x: 3, y: 1.4 },
        { id: "I2", label: "Ilha leste", x: 6, y: 2.2 }
      ],
      edges: [
        { from: "N", to: "I1", label: "ponte 1" },
        { from: "N", to: "I1", label: "ponte 2" },
        { from: "S", to: "I2", label: "ponte 3" }
      ]
    }
  });

  assert.equal(runtime.blocks[1].kind, "graph");
  assert.deepEqual(
    runtime.blocks[1].vertices.map((vertex) => [vertex.id, vertex.x, vertex.y]),
    [
      ["N", 16, 27.33],
      ["S", 16, 72.67],
      ["I1", 50, 43.2],
      ["I2", 84, 52.27]
    ]
  );
  assert.deepEqual(
    runtime.blocks[1].labelLegend.map((item) => [item.id, item.label]),
    [
      ["N", "Margem norte"],
      ["S", "Margem sul"],
      ["I1", "Ilha central"],
      ["I2", "Ilha leste"]
    ]
  );
  assert.equal(runtime.blocks[1].edges.length, 3);
  assert.deepEqual(
    runtime.blocks[1].edges.slice(0, 2).map((edge) => [edge.from, edge.to, edge.parallelIndex, edge.parallelCount]),
    [
      ["N", "I1", 0, 2],
      ["N", "I1", 1, 2]
    ]
  );
});

test("compila card plane para runtime interno com vetor resultante e texto de resposta", () => {
  const runtime = buildCardRuntime({
    key: "card-plane",
    title: "Soma",
    say: "Complete o vetor resultante.",
    plane: {
      sum: [[1, 2], [3, 1]],
      result: ["[[4::3|5]]", "[[3::2|4]]"]
    }
  });

  assert.equal(runtime.blocks[1].kind, "paragraph");
  assert.equal(runtime.blocks[2].kind, "plane");
  assert.equal(runtime.blocks[2].mode, "sum");
  assert.equal(runtime.blocks[2].vectors[1].label, "w");
  assert.equal(runtime.blocks[2].vectors[2].label, "w deslocado");
  assert.equal(runtime.blocks[2].vectors[2].dashed, true);
  assert.equal(runtime.blocks[2].vectors[2].tone, "tertiary");
  assert.equal(runtime.blocks[2].vectors[3].label, "v+w");
  assert.match(runtime.blocks[2].note, /copie w=\(3, 1\)/);
  assert.equal(runtime.blocks[2].resultText, "v+w = ([[4::3|5]], [[3::2|4]])");
});

test("compila plane de soma sem expor resposta textual quando result nao foi pedido", () => {
  const runtime = buildCardRuntime({
    key: "card-plane-hidden-result",
    title: "Soma",
    say: "Observe a soma.",
    plane: {
      sum: [[1, 2], [3, 1]]
    }
  });

  assert.equal(runtime.blocks[2].kind, "plane");
  assert.equal(runtime.blocks[2].resultText, "");
  assert.equal(runtime.blocks[2].vectors[3].label, "v+w");
});

test("compila card matrix para runtime interno com destaques resolvidos", () => {
  const runtime = buildCardRuntime({
    key: "card-matrix",
    title: "Diagonal",
    matrix: {
      name: "A",
      values: [[1, 2, 3], [4, 5, 6], [7, 8, 9]],
      highlight: "mainDiagonal",
      dividerAfterColumn: 2
    }
  });

  assert.equal(runtime.blocks[1].kind, "matrix");
  assert.equal(runtime.blocks[1].name, "A");
  assert.deepEqual(runtime.blocks[1].highlightCells, ["0:0", "1:1", "2:2"]);
  assert.equal(runtime.blocks[1].dividerAfterColumn, 2);
});

test("compila card matrix com sequência de resolução", () => {
  const runtime = buildCardRuntime({
    key: "card-matrix-sequence",
    title: "Soma",
    matrix: {
      sequence: [
        { name: "A", values: [[1, 2], [3, 4]] },
        { connector: "+", name: "B", values: [[5, 6], [7, 8]] },
        { connector: "=", name: "A+B", values: [["1 + 5", "2 + 6"], ["3 + 7", "4 + 8"]], highlight: "cell:1,1" }
      ]
    }
  });

  assert.equal(runtime.blocks[1].kind, "matrix");
  assert.equal(runtime.blocks[1].sequence.length, 3);
  assert.equal(runtime.blocks[1].sequence[1].connector, "+");
  assert.deepEqual(runtime.blocks[1].sequence[2].highlightCells, ["0:0"]);
});
