import assert from "node:assert/strict";
import test from "node:test";

import { renderPackageCardBlocks } from "../../src/render/renderPackageCard.js";

function cardWith(instance) {
  return {
    id: "card-package",
    position: 1,
    title: "Relações",
    role: "theory",
    content: [instance],
    response: null,
    feedback: [],
    topics: [],
    sources: []
  };
}

test("modo Estudo não repete enunciado idêntico de paragraph e choice", () => {
  const question = "Qual protocolo confirma a entrega?";
  assert.throws(() => renderPackageCardBlocks({
    ...cardWith({
      id: "context",
      package: "aralearn.resource.paragraph",
      version: "1.0.0",
      data: { text: question }
    }),
    role: "practice",
    response: {
      id: "answer",
      package: "aralearn.response.choice",
      version: "1.0.0",
      data: {
        question,
        selectionMode: "single",
        selectionCriterion: "correct",
        options: [{ id: "tcp", text: "TCP" }, { id: "udp", text: "UDP" }],
        answerIds: ["tcp"]
      }
    }
  }), /não pode repetir/u);
});

test("modo Estudo mantém rótulos de arestas fora do desenho do graph", () => {
  const html = renderPackageCardBlocks(cardWith({
    id: "graph",
    package: "aralearn.resource.graph",
    version: "1.0.0",
    data: {
      prompt: "Observe o caminho.",
      layout: "path",
      vertices: [
        { id: "station", label: "Estação central de gerência" },
        { id: "agent", label: "Agente no dispositivo monitorado" }
      ],
      edges: [{ id: "request", from: "station", to: "agent", label: "envia solicitação de leitura", directed: true }]
    }
  }));
  assert.doesNotMatch(html, /package-graph-edge-index/u);
  assert.match(html, /package-graph-relations/u);
  assert.match(html, /Estação central de gerência/u);
  assert.match(html, /envia solicitação de leitura/u);
});

test("modo Estudo materializa relation_map em linhas sem SVG nem setas sobre rótulos", () => {
  const html = renderPackageCardBlocks(cardWith({
    id: "relations",
    package: "aralearn.resource.relation_map",
    version: "1.0.0",
    data: {
      prompt: "Relacione os componentes.",
      leftSet: { label: "Componente", items: [{ id: "agent", label: "Agente instalado no dispositivo monitorado" }] },
      rightSet: { label: "Responsabilidade", items: [{ id: "read", label: "Acessar o objeto gerenciado localmente" }] },
      relations: [{ id: "r1", from: "agent", to: "read", label: "executa" }]
    }
  }));
  assert.doesNotMatch(html, /<svg/u);
  assert.match(html, /package-relation-map/u);
  assert.match(html, /Agente instalado no dispositivo monitorado/u);
  assert.match(html, /Acessar o objeto gerenciado localmente/u);
});

test("choice incorreto não revela a alternativa esperada antes de Ver resposta", () => {
  const blockKeyPrefix = "lesson::card";
  const responseId = "answer";
  const blockKey = `${blockKeyPrefix}::response:${responseId}`;
  const html = renderPackageCardBlocks({
    ...cardWith({
      id: "context",
      package: "aralearn.resource.paragraph",
      version: "1.0.0",
      data: { text: "Escolha pelo requisito de entrega." }
    }),
    role: "practice",
    response: {
      id: responseId,
      package: "aralearn.response.choice",
      version: "1.0.0",
      data: {
        question: "Qual protocolo entrega um fluxo confiável?",
        selectionMode: "single",
        selectionCriterion: "correct",
        options: [
          { id: "tcp", text: "TCP" },
          { id: "dns", text: "DNS" }
        ],
        answerIds: ["tcp"]
      }
    }
  }, {
    blockKeyPrefix,
    responseStateByBlockKey: {
      [blockKey]: { selected: ["dns"], feedback: "wrong" }
    }
  });
  const tcpButton = html.match(/<button class="multiple-choice-option[^"]*"[^>]*data-choice-option-id="tcp"[^>]*>/u)?.[0] || "";
  const dnsButton = html.match(/<button class="multiple-choice-option[^"]*"[^>]*data-choice-option-id="dns"[^>]*>/u)?.[0] || "";
  assert.doesNotMatch(tcpButton, /expected-selection|selected-correct/u);
  assert.match(dnsButton, /selected-incorrect/u);
  assert.match(html, /class="runtime-feedback-icon"/u);
  assert.doesNotMatch(html, /<svg(?![^>]*class="runtime-feedback-icon")/u);
});

test("matrix e tree preservam a estrutura visual package-native no card completo", () => {
  const matrixHtml = renderPackageCardBlocks(cardWith({
    id: "matrix",
    package: "aralearn.resource.matrix",
    version: "1.0.0",
    data: {
      prompt: "Compare os fluxos.",
      name: "Fluxos",
      values: [["F1", "TCP", "51000"], ["F2", "TCP", "51001"]]
    }
  }));
  assert.match(matrixHtml, /runtime-matrix-shell/u);
  assert.match(matrixHtml, /runtime-matrix-bracket is-left/u);
  assert.match(matrixHtml, /runtime-matrix-table/u);

  const treeHtml = renderPackageCardBlocks(cardWith({
    id: "tree",
    package: "aralearn.resource.tree",
    version: "1.0.0",
    data: {
      prompt: "Observe a hierarquia.",
      variant: "hierarchy",
      nodes: [
        { id: "root", label: "raiz lógica", parentId: null },
        { id: "test", label: "test", parentId: "root" },
        { id: "example", label: "example", parentId: "test" }
      ]
    }
  }));
  assert.match(treeHtml, /runtime-tree-structure/u);
  assert.match(treeHtml, /runtime-tree-node-chip/u);
  assert.match(treeHtml, /aria-level="3"/u);
});

test("recursos visuais extraídos preservam representação própria em vez de texto cru", () => {
  const render = (instance) => renderPackageCardBlocks(cardWith(instance));

  const planeHtml = render({
    id: "plane",
    package: "aralearn.resource.plane",
    version: "1.0.0",
    data: { prompt: "Observe o vetor.", vector: [2, 1] }
  });
  assert.match(planeHtml, /package-plane-grid/u);
  assert.match(planeHtml, /package-plane-axis-arrow/u);
  assert.match(planeHtml, /\(2, 1\)/u);

  const chartHtml = render({
    id: "chart",
    package: "aralearn.resource.chart",
    version: "1.0.0",
    data: {
      prompt: "Observe o crescimento.",
      chartType: "line",
      xAxis: { label: "Tempo" },
      yAxis: { label: "Latência", unit: "ms" },
      series: [{ id: "latency", name: "Latência", values: [["1", 10], ["2", 18], ["3", 25]] }]
    }
  });
  assert.match(chartHtml, /package-chart-line/u);
  assert.match(chartHtml, /package-chart-legend/u);

  const formulaHtml = render({
    id: "formula",
    package: "aralearn.resource.formula",
    version: "1.0.0",
    data: {
      notation: "mathematics",
      accessibleText: "x ao quadrado",
      expression: { type: "superscript", base: { type: "identifier", value: "x" }, exponent: { type: "number", value: "2" } }
    }
  });
  assert.match(formulaHtml, /<math display="block"/u);
  assert.match(formulaHtml, /<msup><mi>x<\/mi><mn>2<\/mn><\/msup>/u);

  const reactionHtml = render({
    id: "reaction",
    package: "aralearn.resource.reaction",
    version: "1.0.0",
    data: {
      reactionType: "forward",
      reactants: [{ id: "h", formula: "H₂", name: "hidrogênio", coefficient: 2, state: "g" }, { id: "o", formula: "O₂", name: "oxigênio", state: "g" }],
      products: [{ id: "w", formula: "H₂O", name: "água", coefficient: 2, state: "l" }]
    }
  });
  assert.match(reactionHtml, /package-reaction-species/u);
  assert.match(reactionHtml, /package-reaction-arrow/u);

  const flowHtml = render({
    id: "flow",
    package: "aralearn.resource.flow",
    version: "1.0.0",
    data: { structure: { id: "root", kind: "sequence", items: [{ id: "start", kind: "start", text: "Início" }, { id: "end", kind: "end", text: "Fim" }] } }
  });
  assert.match(flowHtml, /package-flow-node-card/u);
  assert.match(flowHtml, /package-flow-kind/u);

  const systemMapHtml = render({
    id: "system",
    package: "aralearn.resource.system_map",
    version: "1.0.0",
    data: {
      groups: [{ id: "app", label: "Aplicação", kind: "boundary", parentId: null }],
      nodes: [{ id: "client", label: "Cliente", kind: "client", groupId: null }, { id: "api", label: "API", kind: "service", groupId: "app" }],
      links: [{ id: "request", from: "client", to: "api", label: "requisição", directed: true }]
    }
  });
  assert.match(systemMapHtml, /package-system-ungrouped/u);
  assert.match(systemMapHtml, /package-system-group/u);
  assert.match(systemMapHtml, /package-system-link-number/u);
});
