import assert from "node:assert/strict";
import test from "node:test";

import { compileFlowGraph } from "../../src/resources/packages/flow/index.js";

function sourceNode(graph, sourceId) {
  return graph.nodes.find((node) => node.sourceId === sourceId);
}

test("fluxograma binário liga Sim e Não aos caminhos corretos e usa uma única junção", () => {
  const graph = compileFlowGraph({
    kind: "sequence",
    items: [
      { id: "start", kind: "start", text: "Início" },
      {
        id: "decision",
        kind: "if_then_else",
        condition: "Credenciais válidas?",
        branchLabels: { yes: "Sim", no: "Não" },
        thenBranch: [{ id: "open", kind: "process", text: "Abrir sessão" }],
        elseBranch: [{ id: "error", kind: "output", text: "Exibir erro" }]
      },
      { id: "end", kind: "end", text: "Fim" }
    ]
  });
  const decision = sourceNode(graph, "decision");
  const open = sourceNode(graph, "open");
  const error = sourceNode(graph, "error");
  const end = sourceNode(graph, "end");
  const merge = graph.nodes.find((node) => node.kind === "merge");

  assert.ok(graph.edges.some((edge) =>
    edge.source === decision.id && edge.target === open.id && edge.label === "Sim"
  ));
  assert.ok(graph.edges.some((edge) =>
    edge.source === decision.id && edge.target === error.id && edge.label === "Não"
  ));
  assert.equal(graph.nodes.filter((node) => node.kind === "merge").length, 1);
  assert.equal(graph.edges.filter((edge) => edge.target === end.id).length, 1);
  assert.ok(graph.edges.some((edge) => edge.source === merge.id && edge.target === end.id));
});

test("fluxograma complexo preserva laço, decisão aninhada e continuação sem duplicar arestas", () => {
  const graph = compileFlowGraph({
    kind: "sequence",
    items: [
      { id: "start", kind: "start", text: "Início" },
      { id: "read", kind: "input", text: "Ler limite" },
      {
        id: "loop",
        kind: "while",
        condition: "Ainda há itens?",
        branchLabels: { yes: "Sim", no: "Não" },
        body: [
          {
            id: "valid",
            kind: "if_then_else",
            condition: "Item é válido?",
            branchLabels: { yes: "Sim", no: "Não" },
            thenBranch: [{ id: "sum", kind: "process", text: "Somar valor" }],
            elseBranch: [{ id: "warn", kind: "output", text: "Registrar erro" }]
          },
          { id: "advance", kind: "process", text: "Avançar posição" }
        ]
      },
      { id: "result", kind: "output", text: "Exibir total" },
      { id: "end", kind: "end", text: "Fim" }
    ]
  });
  const loop = sourceNode(graph, "loop");
  const result = sourceNode(graph, "result");
  const advance = sourceNode(graph, "advance");
  const end = sourceNode(graph, "end");

  assert.ok(graph.edges.some((edge) =>
    edge.source === loop.id && edge.target === result.id && edge.label === "Não"
  ));
  assert.ok(graph.edges.some((edge) =>
    edge.source === advance.id && edge.target === loop.id && edge.kind === "loop"
  ));
  assert.equal(graph.edges.filter((edge) => edge.target === end.id).length, 1);
  assert.equal(new Set(graph.edges.map((edge) => `${edge.source}:${edge.target}:${edge.label}`)).size, graph.edges.length);
});

test("do while mantém o rótulo de repetição na aresta de retorno e uma única saída", () => {
  const graph = compileFlowGraph({
    kind: "sequence",
    items: [
      {
        id: "repeat",
        kind: "do_while",
        condition: "Ainda há tentativas?",
        branchLabels: { yes: "Sim", no: "Não" },
        body: [{ id: "try", kind: "process", text: "Tentar novamente" }]
      },
      { id: "end", kind: "end", text: "Fim" }
    ]
  });
  const decision = sourceNode(graph, "repeat");
  const body = sourceNode(graph, "try");
  const end = sourceNode(graph, "end");

  assert.ok(graph.edges.some((edge) =>
    edge.source === decision.id && edge.target === body.id && edge.kind === "loop" && edge.label === "Sim"
  ));
  assert.ok(graph.edges.some((edge) =>
    edge.source === decision.id && edge.target === end.id && edge.kind === "branch" && edge.label === "Não"
  ));
  assert.equal(graph.edges.filter((edge) => edge.visible && edge.target === end.id).length, 1);
});
