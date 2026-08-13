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
      prompt: "Observe a matriz identidade.",
      name: "I",
      values: [["1", "0"], ["0", "1"]]
    }
  }));
  assert.match(matrixHtml, /<span class="runtime-matrix-item"/u);
  assert.match(matrixHtml, /runtime-matrix-delimiter is-left/u);
  assert.match(matrixHtml, /vector-effect="non-scaling-stroke"/u);
  assert.match(matrixHtml, /<mtable class="runtime-matrix-grid"/u);
  assert.doesNotMatch(matrixHtml, /<table/u);

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
    data: {
      prompt: "Observe o vetor.",
      xAxis: { label: "Coordenada x", domain: [-1, 3] },
      yAxis: { label: "Coordenada y", domain: [-1, 2] },
      vectors: [{ id: "v", label: "v", from: [0, 0], to: [2, 1] }]
    }
  });
  assert.match(planeHtml, /package-plane-canvas/u);
  assert.match(planeHtml, /package-plane-legend/u);
  assert.match(planeHtml, /data-plane-data/u);

  const chartHtml = render({
    id: "chart",
    package: "aralearn.resource.chart",
    version: "1.0.0",
    data: {
      prompt: "Observe o crescimento.",
      chartType: "line",
      xAxis: { label: "Tempo", type: "quantitative" },
      yAxis: { label: "Latência", unit: "ms", type: "quantitative" },
      uncertainty: { label: "Intervalo de confiança de 95%" },
      series: [{ id: "latency", name: "Latência", values: [{ x: 1, y: 10, lower: 8, upper: 12 }, { x: 2, y: 18, lower: 15, upper: 21 }, { x: 3, y: 25, lower: 21, upper: 29 }] }]
    }
  });
  assert.match(chartHtml, /package-chart-canvas/u);
  assert.match(chartHtml, /package-chart-legend/u);
  assert.match(chartHtml, /Intervalo de confiança/u);

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
  assert.match(reactionHtml, /<math class="package-reaction-equation"/u);
  assert.match(reactionHtml, /<mrow class="package-reaction-species"/u);
  assert.match(reactionHtml, /package-reaction-coefficient-space" width="0\.35em"/u);
  assert.match(reactionHtml, /package-reaction-operator-space" width="0\.6em"/u);
  assert.match(reactionHtml, /package-reaction-transition-space" width="0\.8em"/u);
  assert.match(reactionHtml, /<mo class="package-reaction-arrow"/u);

  const flowHtml = render({
    id: "flow",
    package: "aralearn.resource.flow",
    version: "1.0.0",
    data: { structure: { id: "root", kind: "sequence", items: [{ id: "start", kind: "start", text: "Início" }, { id: "read", kind: "input", text: "Ler dados" }, { id: "choice", kind: "if_then_else", condition: "Dados válidos?", branchLabels: { yes: "Sim", no: "Não" }, thenBranch: [{ id: "save", kind: "process", text: "Salvar" }], elseBranch: [{ id: "warn", kind: "output", text: "Exibir erro" }] }, { id: "end", kind: "end", text: "Fim" }] } }
  });
  assert.match(flowHtml, /package-flowchart/u);
  assert.match(flowHtml, /package-flow-node is-terminal/u);
  assert.match(flowHtml, /package-flow-node is-input-output/u);
  assert.match(flowHtml, /package-flow-node is-decision/u);
  assert.match(flowHtml, /package-flow-node is-merge/u);
  assert.match(flowHtml, /data-flow-graphviz-source="digraph AraLearnFlow/u);
  assert.match(flowHtml, /label=&quot;Sim&quot;/u);
  assert.match(flowHtml, /label=&quot;Não&quot;/u);
  assert.doesNotMatch(flowHtml, /package-flow-tree|package-flow-node-card/u);

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

test("texto anotado ancora notas nos trechos sem revelar ids internos", () => {
  const html = renderPackageCardBlocks(cardWith({
    id: "annotated",
    package: "aralearn.resource.annotated_text",
    version: "1.0.0",
    data: {
      segments: [{ id: "before", text: "O " }, { id: "client", text: "cliente" }, { id: "after", text: " envia." }],
      annotations: [{ id: "role", targetIds: ["client"], category: "Papel", label: "Iniciador", note: "Inicia a comunicação." }]
    }
  }));
  assert.match(html, /runtime-annotated-text-segment/u);
  assert.match(html, /data-annotation-indexes="0"/u);
  assert.match(html, /<q>cliente<\/q>/u);
  assert.doesNotMatch(html, /Trechos:|>client</u);
});

test("glosa interlinear preserva linhas alinhadas, tradução livre e legenda", () => {
  const html = renderPackageCardBlocks(cardWith({
    id: "gloss",
    package: "aralearn.resource.interlinear_gloss",
    version: "1.0.0",
    data: {
      languageTag: "pt-BR",
      units: [{ id: "word", form: "casa-s", gloss: "casa-PL" }],
      translation: "casas",
      abbreviations: [{ code: "PL", meaning: "plural" }]
    }
  }));
  assert.match(html, /runtime-interlinear-form">casa-s/u);
  assert.match(html, /runtime-interlinear-unit-gloss">casa-PL/u);
  assert.match(html, /runtime-interlinear-translation[^>]*>“casas”/u);
  assert.match(html, /<dt>PL<\/dt><dd>plural<\/dd>/u);
});
