import assert from "node:assert/strict";
import test from "node:test";

import { compileFlowGraph, compileFlowGraphviz, flowPackage } from "../../src/resources/packages/flow/index.js";
import { createPackageGapMarker } from "../../src/resources/sdk/html.js";

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

test("compilador Graphviz deriva a notação visual sem receber geometria autoral", () => {
  const { source } = compileFlowGraphviz({
    kind: "sequence",
    items: [
      { id: "start", kind: "start", text: "Início" },
      { id: "input", kind: "input", text: "Ler valor" },
      {
        id: "decision",
        kind: "if_then_else",
        condition: "Valor válido?",
        thenBranch: [{ id: "process", kind: "process", text: "Calcular" }],
        elseBranch: [{ id: "output", kind: "output", text: "Exibir erro" }]
      },
      { id: "end", kind: "end", text: "Fim" }
    ]
  });

  assert.match(source, /^digraph AraLearnFlow/u);
  assert.match(source, /rankdir="TB"/u);
  assert.match(source, /shape="oval"/u);
  assert.match(source, /shape="parallelogram"/u);
  assert.match(source, /shape="diamond"/u);
  assert.match(source, /shape="box"/u);
  assert.doesNotMatch(source, /\bpos\s*=/u);
});

test("decisão encadeada testa a segunda condição apenas após negar a primeira", () => {
  const structure = { kind: "sequence", items: [{ id: "chain", kind: "if_chain", cases: [
    { id: "admin", condition: "É administrador?", branchLabels: { yes: "Administrador", no: "Outro perfil" }, thenBranch: [{ id: "all", kind: "process", text: "Permitir tudo" }] },
    { id: "author", condition: "É autor?", thenBranch: [{ id: "owned", kind: "process", text: "Permitir curso próprio" }] }
  ], elseBranch: [{ id: "deny", kind: "output", text: "Negar acesso" }] }, { id: "finish", kind: "end", text: "Fim" }] };
  const graph = compileFlowGraph(structure);
  const admin = sourceNode(graph, "admin");
  const author = sourceNode(graph, "author");
  const all = sourceNode(graph, "all");
  const deny = sourceNode(graph, "deny");
  assert.ok(graph.edges.some((edge) => edge.source === admin.id && edge.target === author.id && edge.label === "Outro perfil"));
  assert.ok(graph.edges.some((edge) => edge.source === admin.id && edge.target === all.id && edge.label === "Administrador"));
  assert.ok(graph.edges.some((edge) => edge.source === author.id && edge.target === deny.id && edge.label === "Não"));
  assert.equal(graph.edges.some((edge) => edge.source === admin.id && edge.target === deny.id), false);
  const text = flowPackage.accessibleText({ structure });
  assert.match(text, /na ordem.*primeira condição verdadeira/u);
  assert.match(text, /Administrador.*Permitir tudo.*Outro perfil.*próxima condição/u);
  assert.match(text, /É autor\?.*Permitir curso próprio.*Caso contrário.*Negar acesso/u);
});

test("for mantém inicialização, teste e atualização em suas posições operacionais", () => {
  const structure = { kind: "sequence", items: [{ id: "count", kind: "for", init: "i = 0", condition: "i < 3", update: "i = i + 1", body: [{ id: "print", kind: "output", text: "Exibir i" }] }, { id: "finish", kind: "end", text: "Fim" }] };
  const graph = compileFlowGraph(structure);
  const byLabel = (label) => graph.nodes.find((node) => node.label === label);
  const reaches = (source, target, kind = "flow") => graph.edges.some((edge) => edge.source === byLabel(source).id && edge.target === byLabel(target).id && edge.kind === kind);
  assert.ok(reaches("i = 0", "i < 3"));
  assert.ok(reaches("i < 3", "Exibir i", "branch"));
  assert.ok(reaches("Exibir i", "i = i + 1"));
  assert.ok(reaches("i = i + 1", "i < 3", "loop"));
  assert.ok(reaches("i < 3", "Fim", "branch"));
  assert.match(flowPackage.accessibleText({ structure }), /Inicialização: i = 0.*Condição: i < 3.*Após cada execução.*i = i \+ 1/u);
});

test("alternativa acessível conserva casos, ramos vazios e teste posterior sem revelar lacuna", () => {
  const secret = createPackageGapMarker({ blockKey: "flow-gap", index: 0, layoutText: "resposta reservada", value: "" });
  const structure = { kind: "sequence", items: [
    { kind: "switch_case", expression: "Status", cases: [{ match: "200", body: [{ kind: "output", text: "Sucesso" }] }], defaultBranch: [] },
    { kind: "do_while", condition: secret, branchLabels: { yes: "Repetir", no: "Encerrar" }, body: [{ kind: "process", text: "Tentar" }] }
  ] };
  const text = flowPackage.accessibleText({ structure });
  assert.match(text, /Caso 200.*Sucesso.*Outro caso.*Continuar após a decisão/u);
  assert.match(text, /Corpo da repetição.*Tentar.*Condição: lacuna.*Repetir: repetir o corpo.*Encerrar: continuar/u);
  assert.doesNotMatch(text, /resposta reservada|%22|\uE000/u);
  const html = flowPackage.render({ structure });
  assert.match(html, /package-flow-outline visually-hidden/u);
  assert.match(html, /Caso 200/u);
});

test("texto extenso recebe quebras calculadas sem coordenadas ou tooltip de identidade", () => {
  const { source } = compileFlowGraphviz({ kind: "sequence", items: [{ id: "private-node-id", kind: "process", text: "Uma explicação longa preserva todas as palavras e recebe mais de uma linha sem abreviar o significado." }] });
  assert.match(source, /label="Uma explicação longa preserva\\ntodas as palavras/u);
  assert.doesNotMatch(source, /tooltip=|pos=/u);
});
