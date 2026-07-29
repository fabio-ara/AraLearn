import assert from "node:assert/strict";
import test from "node:test";

import { renderRuntimeBlockList } from "../../src/render/renderCardRuntime.js";

test("tabela informa dimensões, cabeçalhos e idioma sem alterar sua estrutura visual", () => {
  const html = renderRuntimeBlockList([{
    kind: "table",
    columns: ["Termo", "Definição"],
    rows: [["ידע", "conhecimento"]],
    languageTag: "he",
    textDirection: "rtl"
  }]);

  assert.match(html, /<table class="runtime-table" aria-label="Tabela com 2 colunas e 1 linha\. Colunas: Termo; Definição\.">/u);
  assert.match(html, /<th scope="col" lang="he" dir="rtl" class="is-align-left is-wrap">Termo<\/th>/u);
  assert.match(html, /<td lang="he" dir="rtl" class="is-align-left is-wrap">ידע<\/td>/u);
});

test("mapa de relações descreve conjuntos e ligações e neutraliza marcação", () => {
  const html = renderRuntimeBlockList([{
    kind: "relation_map",
    prompt: "Associe.",
    leftSet: {
      label: "Conceitos",
      items: [{ id: "a", label: "Entrada <script>alert(1)</script>" }]
    },
    rightSet: {
      label: "Funções",
      items: [{ id: "b", label: "Receber dados" }]
    },
    relations: [{ from: "a", to: "b", label: "realiza" }],
    relationTable: {
      columns: ["Origem", "Destino"],
      rows: [["Entrada", "Receber dados"]]
    }
  }]);

  assert.match(html, /role="img" aria-label="Mapa entre Conceitos e Funções\./u);
  assert.match(html, /Entrada &lt;script&gt;alert\(1\)&lt;\/script&gt; se relaciona com Receber dados por realiza/u);
  assert.match(html, /<desc>Mapa entre Conceitos e Funções\./u);
  assert.match(html, /aria-label="Tabela auxiliar do mapa de relações"/u);
  assert.match(html, /<th scope="col" dir="auto">Origem<\/th>/u);
  assert.doesNotMatch(html, /<script>/u);
});

test("matriz expõe dimensões, células, operador e destaques como uma unidade", () => {
  const html = renderRuntimeBlockList([{
    kind: "matrix",
    prompt: "Compare.",
    sequence: [
      { values: [["1", "2"], ["3", "4"]], highlight: { cells: [[0, 1]] } },
      { connector: "+", values: [["5", "6"], ["7", "8"]] }
    ]
  }]);

  assert.match(html, /runtime-matrix-equation is-sequence" role="img" aria-label="Sequência com 2 matrizes\./u);
  assert.match(html, /Matriz 1, 2 linhas por 2 colunas\. linha 1: 1; 2\. linha 2: 3; 4\./u);
  assert.match(html, /Destaques: linha 1, coluna 2\./u);
  assert.match(html, /Operador \+\./u);
});

test("plano cartesiano descreve intervalos e elementos geométricos", () => {
  const html = renderRuntimeBlockList([{
    kind: "plane",
    prompt: "Observe os vetores.",
    sum: [[2, 1], [-1, 3]],
    result: [1, 4]
  }]);

  assert.match(html, /role="img" aria-label="Plano cartesiano para soma de vetores\./u);
  assert.match(html, /Eixo x de -2 a 3; eixo y de -1 a 5\./u);
  assert.match(html, /v de \(0, 0\) até \(2, 1\)/u);
  assert.match(html, /v\+w de \(0, 0\) até \(1, 4\)/u);
  assert.match(html, /<desc>Plano cartesiano para soma de vetores\./u);
});

test("fluxograma mantém controles interativos e descreve nós e ligações", () => {
  const html = renderRuntimeBlockList([{
    kind: "flow",
    prompt: "Siga o processo.",
    structure: {
      kind: "sequence",
      items: [
        { kind: "start", text: "Receber pedido" },
        { kind: "process", text: "Validar dados" },
        { kind: "end", text: "Concluir" }
      ]
    }
  }]);

  assert.match(html, /runtime-flow-board" role="group" aria-label="Fluxograma com 3 nós e 2 ligações\./u);
  assert.match(html, /Nós: Receber pedido, símbolo/u);
  assert.match(html, /Ligações: Receber pedido leva a Validar dados; Validar dados leva a Concluir\./u);
  assert.match(html, /data-action="flowchart-zoom-in" title="Aumentar zoom" aria-label="Aumentar zoom"/u);
});
