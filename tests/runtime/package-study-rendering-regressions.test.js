import assert from "node:assert/strict";
import test from "node:test";

import {
  renderPackageStudyUnitArticle,
  renderPackageStudyUnitBlocks,
  renderPackageStudyUnitBlocksWithDock
} from "../../src/render/renderPackageStudyUnit.js";

function studyUnitWith(instance) {
  return {
    id: "card-package",
    position: 1,
    title: "Relações",
    role: "theory",
    content: [instance],
    response: null,
    feedback: [],
    topics: []
  };
}

test("artigos independentes isolam a memória visual pela identidade da Unidade de estudo", () => {
  const instance = {
    id: "shared-instance",
    package: "aralearn.resource.paragraph",
    version: "1.0.0",
    data: { text: "Mesmo conteúdo estrutural." }
  };
  const first = renderPackageStudyUnitArticle({ ...studyUnitWith(instance), id: "first-card" });
  const second = renderPackageStudyUnitArticle({ ...studyUnitWith(instance), id: "second-card" });
  assert.match(first, /data-package-render-key="study-unit:first-card::content:shared-instance"/u);
  assert.match(second, /data-package-render-key="study-unit:second-card::content:shared-instance"/u);
});

test("inspeção revela Choice, Gap, Ordering e feedback sem controles de resolução", () => {
  const choice = {
    ...studyUnitWith({
      id: "choice-context",
      package: "aralearn.resource.paragraph",
      version: "1.0.0",
      data: { text: "Compare os protocolos." }
    }),
    role: "practice",
    response: {
      id: "choice-answer",
      package: "aralearn.response.choice",
      version: "1.0.0",
      data: {
        question: "Qual entrega um fluxo confiável?",
        selectionMode: "single",
        selectionCriterion: "correct",
        options: [
          { id: "tcp", text: "TCP", feedback: "Confirma entrega e ordenação." },
          { id: "udp", text: "UDP", feedback: "Não confirma entrega nem ordenação." }
        ],
        answerIds: ["tcp"]
      }
    },
    feedback: [{
      id: "choice-feedback",
      package: "aralearn.resource.paragraph",
      version: "1.0.0",
      data: { text: "A confiabilidade decorre do contrato do TCP." }
    }]
  };
  const choiceHtml = renderPackageStudyUnitArticle(choice, {
    revealPracticeAnswers: true
  });
  assert.match(choiceHtml, /selected-correct/u);
  assert.match(choiceHtml, /Alternativas e resposta esperada\./u);
  assert.doesNotMatch(choiceHtml, /Selecione a alternativa correta\./u);
  assert.match(choiceHtml, /Confirma entrega e ordenação\./u);
  assert.match(choiceHtml, /Não confirma entrega nem ordenação\./u);
  assert.match(choiceHtml, /Resposta esperada exibida\./u);
  assert.match(choiceHtml, /A confiabilidade decorre do contrato do TCP\./u);
  assert.doesNotMatch(choiceHtml, /data-action="choice-toggle"|<button class="multiple-choice-option/u);

  const gap = {
    ...studyUnitWith({
      id: "gap-context",
      package: "aralearn.resource.paragraph",
      version: "1.0.0",
      data: { text: "O DNS resolve nomes." }
    }),
    role: "practice",
    response: {
      id: "gap-answer",
      package: "aralearn.response.gap",
      version: "1.0.0",
      data: {
        blanks: [{
          id: "dns",
          targetInstanceId: "gap-context",
          targetPath: "text:dns",
          responseMode: "choice",
          answer: "DNS",
          distractors: ["HTTP"]
        }]
      }
    }
  };
  const gapHtml = renderPackageStudyUnitArticle(gap, { revealPracticeAnswers: true });
  assert.match(gapHtml, /is-resolved/u);
  assert.match(gapHtml, /Resposta esperada: DNS/u);
  assert.match(gapHtml, /Respostas esperadas exibidas\./u);
  assert.doesNotMatch(gapHtml, /contenteditable="true"|text-gap-open-choice/u);

  const ordering = {
    ...studyUnitWith({
      id: "ordering-context",
      package: "aralearn.resource.paragraph",
      version: "1.0.0",
      data: { text: "Preparar. Executar." }
    }),
    role: "practice",
    response: {
      id: "ordering-answer",
      package: "aralearn.response.ordering",
      version: "3.0.0",
      data: {
        targets: [{
          id: "prepare",
          targetInstanceId: "ordering-context",
          targetPath: "text:prepare",
          answer: "Preparar"
        }, {
          id: "execute",
          targetInstanceId: "ordering-context",
          targetPath: "text:execute",
          answer: "Executar"
        }]
      }
    }
  };
  const orderingHtml = renderPackageStudyUnitArticle(ordering, {
    revealPracticeAnswers: true
  });
  assert.match(
    orderingHtml,
    /data-ordering-slot-index="0"[^>]*>[\s\S]*?runtime-ordering-value">Preparar[\s\S]*?data-ordering-slot-index="1"[^>]*>[\s\S]*?runtime-ordering-value">Executar/u
  );
});

test("edição manual preserva o resource e publica somente o mapa textual invisível", () => {
  const instance = {
    id: "paragraph-edit",
    package: "aralearn.resource.paragraph",
    version: "1.0.0",
    data: { text: "O próprio rótulo permanece na interface." }
  };
  const html = renderPackageStudyUnitBlocks(studyUnitWith(instance), {
    resourceSelectionEnabled: true,
    selectedResourceTargetIds: ["content:paragraph-edit"],
    manualEditingTargetId: "content:paragraph-edit"
  });
  assert.match(html, /class="runtime-block runtime-paragraph-block"/u);
  assert.match(html, /data-package-manual-targets=/u);
  assert.match(html, /O próprio rótulo permanece na interface\./u);
  assert.doesNotMatch(html, /class="package-manual-(?:editor|field)|<textarea/u);
  assert.doesNotMatch(html, /Textos editáveis|Representação — somente leitura/u);
});

test("edição manual mostra conteúdo canônico e suprime a prática de lacuna", () => {
  const card = {
    ...studyUnitWith({
      id: "body",
      package: "aralearn.resource.paragraph",
      version: "1.0.0",
      data: { text: "Use DNS aqui." }
    }),
    role: "practice",
    response: {
      id: "gap",
      package: "aralearn.response.gap",
      version: "1.0.0",
      data: {
        blanks: [{
          id: "protocol",
          targetInstanceId: "body",
          targetPath: "text:protocol",
          responseMode: "choice",
          answer: "DNS",
          distractors: ["HTTP"]
        }]
      }
    }
  };
  const rendered = renderPackageStudyUnitBlocksWithDock(card, {
    resourceSelectionEnabled: true,
    selectedResourceTargetIds: ["content:body"],
    manualEditingTargetId: "content:body"
  });
  assert.match(rendered.bodyHtml, /Use DNS aqui\./u);
  assert.match(rendered.bodyHtml, /data-package-manual-field-path="text"/u);
  assert.doesNotMatch(rendered.bodyHtml, /runtime-text-gap|text-gap-open-choice|data-package="aralearn\.response/u);
  assert.equal(rendered.dockHtml, "");
});

test("edição manual de célula suprime ordering e conserva a tabela", () => {
  const card = {
    ...studyUnitWith({
      id: "steps",
      package: "aralearn.resource.table",
      version: "1.0.0",
      data: { columns: ["Etapa"], rows: [["Preparar"], ["Executar"]] }
    }),
    role: "practice",
    response: {
      id: "order",
      package: "aralearn.response.ordering",
      version: "3.0.0",
      data: {
        targets: [
          { id: "prepare", targetInstanceId: "steps", targetPath: "rows[0][0]", answer: "Preparar" },
          { id: "execute", targetInstanceId: "steps", targetPath: "rows[1][0]", answer: "Executar" }
        ]
      }
    }
  };
  const rendered = renderPackageStudyUnitBlocksWithDock(card, {
    resourceSelectionEnabled: true,
    selectedResourceTargetIds: ["content:steps"],
    manualEditingTargetId: "content:steps"
  });
  assert.match(rendered.bodyHtml, /<table class="runtime-table">/u);
  assert.match(rendered.bodyHtml, /data-package-manual-field-path="rows%5B0%5D%5B0%5D"/u);
  assert.doesNotMatch(rendered.bodyHtml, /runtime-ordering|ordering-move|data-package="aralearn\.response/u);
  assert.equal(rendered.dockHtml, "");
});

test("edição manual de choice preserva a aparência sem resposta revelada ou controles de estudo", () => {
  const responseId = "answer";
  const blockKeyPrefix = "lesson::card";
  const blockKey = `${blockKeyPrefix}::response:${responseId}`;
  const card = {
    ...studyUnitWith({
      id: "context",
      package: "aralearn.resource.paragraph",
      version: "1.0.0",
      data: { text: "Compare os requisitos de transporte." }
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
          { id: "udp", text: "UDP" }
        ],
        answerIds: ["tcp"]
      }
    }
  };
  const rendered = renderPackageStudyUnitBlocksWithDock(card, {
    blockKeyPrefix,
    resourceSelectionEnabled: true,
    selectedResourceTargetIds: [`response:${responseId}`],
    manualEditingTargetId: `response:${responseId}`,
    responseStateByBlockKey: {
      [blockKey]: { selected: ["tcp"], feedback: "wrong" }
    }
  });
  assert.match(rendered.bodyHtml, /<div class="multiple-choice-option"/u);
  assert.match(rendered.bodyHtml, /data-package-manual-field-path="question"/u);
  assert.match(rendered.bodyHtml, /data-package-manual-field-path="options%5B0%5D\.text"/u);
  assert.doesNotMatch(rendered.bodyHtml, /<button class="multiple-choice-option|data-action="choice-/u);
  assert.doesNotMatch(rendered.bodyHtml, /\bactive\b|multiple-choice-dot|selected-(?:correct|incorrect)|inline-feedback/u);
  assert.equal(rendered.dockHtml, "");
});

test("edição manual ignora prompt de lacuna aberto e não inventa editor na response", () => {
  const responseId = "gap";
  const blockKeyPrefix = "lesson::card";
  const blockKey = `${blockKeyPrefix}::response:${responseId}`;
  const card = {
    ...studyUnitWith({
      id: "body",
      package: "aralearn.resource.paragraph",
      version: "1.0.0",
      data: { text: "Use DNS aqui." }
    }),
    role: "practice",
    response: {
      id: responseId,
      package: "aralearn.response.gap",
      version: "1.0.0",
      data: {
        blanks: [{
          id: "protocol",
          targetInstanceId: "body",
          targetPath: "text:protocol",
          responseMode: "choice",
          answer: "DNS",
          distractors: ["TCP"]
        }]
      }
    }
  };
  const rendered = renderPackageStudyUnitBlocksWithDock(card, {
    blockKeyPrefix,
    resourceSelectionEnabled: true,
    selectedResourceTargetIds: [`response:${responseId}`],
    manualEditingTargetId: `response:${responseId}`,
    activeTextGapPrompt: { blockKey, blankIndex: 0 },
    responseStateByBlockKey: {
      [blockKey]: { values: [""], feedback: "wrong" }
    }
  });
  assert.doesNotMatch(rendered.bodyHtml, /text-gap-(?:set-choice|open-choice)|runtime-flow-prompt/u);
  assert.doesNotMatch(rendered.bodyHtml, /data-manual-edit-path|data-package-manual-field-path/u);
  assert.doesNotMatch(rendered.bodyHtml, /package-manual-(?:editor|field)|textarea/u);
  assert.equal(rendered.dockHtml, "");
});

test("seleção manual omite response sem folha textual visível", () => {
  const responseId = "order";
  const card = {
    ...studyUnitWith({
      id: "first",
      package: "aralearn.resource.paragraph",
      version: "1.0.0",
      data: { text: "Preparar" }
    }),
    role: "practice",
    content: [{
      id: "first",
      package: "aralearn.resource.paragraph",
      version: "1.0.0",
      data: { text: "Preparar" }
    }, {
      id: "second",
      package: "aralearn.resource.paragraph",
      version: "1.0.0",
      data: { text: "Executar" }
    }],
    response: {
      id: responseId,
      package: "aralearn.response.ordering",
      version: "3.0.0",
      data: {
        targets: [
          { id: "first", targetInstanceId: "first", targetPath: "text", answer: "Preparar" },
          { id: "second", targetInstanceId: "second", targetPath: "text", answer: "Executar" }
        ]
      }
    }
  };
  const rendered = renderPackageStudyUnitBlocks(card, {
    resourceSelectionEnabled: true,
    resourceSelectionTargetIds: ["content:first", "content:second"],
    responseStateByBlockKey: {
      "runtime-study-unit::response:order": { order: ["first", "second"], feedback: "wrong" }
    }
  });
  assert.doesNotMatch(rendered, /data-resource-edit-target="response:order"/u);
  assert.match(rendered, /data-resource-edit-target="content:first"/u);
  assert.match(rendered, /data-resource-edit-target="content:second"/u);

  const explicitManual = renderPackageStudyUnitBlocksWithDock(card, {
    resourceSelectionEnabled: true,
    selectedResourceTargetIds: [`response:${responseId}`],
    manualEditingTargetId: `response:${responseId}`,
    responseStateByBlockKey: {
      "runtime-study-unit::response:order": { order: ["first", "second"], feedback: "wrong" }
    }
  });
  assert.doesNotMatch(explicitManual.bodyHtml, /ordering-(?:view-answer|try-again)|inline-feedback/u);
  assert.doesNotMatch(explicitManual.bodyHtml, /data-manual-edit-path|data-package-manual-field-path/u);
  assert.equal(explicitManual.dockHtml, "");
});

test("opções de cada lacuna usam ordem estável e independente do gabarito e do estado", () => {
  const card = {
    ...studyUnitWith({
      id: "body",
      package: "aralearn.resource.paragraph",
      version: "1.0.0",
      data: { text: "DNS depois TCP" }
    }),
    role: "practice",
    response: {
      id: "gap",
      package: "aralearn.response.gap",
      version: "1.0.0",
      data: {
        blanks: [{
          id: "dns",
          targetInstanceId: "body",
          targetPath: "text:dns",
          responseMode: "choice",
          answer: "DNS",
          distractors: ["UDP", "HTTP"]
        }, {
          id: "tcp",
          targetInstanceId: "body",
          targetPath: "text:tcp",
          responseMode: "choice",
          answer: "TCP",
          distractors: ["IP", "ICMP"]
        }]
      }
    }
  };
  const blockKeyPrefix = "lesson";
  const blockKey = `${blockKeyPrefix}::response:gap`;
  const optionOrder = (blankIndex, values) => {
    const rendered = renderPackageStudyUnitBlocksWithDock(card, {
      blockKeyPrefix,
      exerciseShuffleSeed: "stable",
      activeTextGapPrompt: { blockKey, blankIndex },
      responseStateByBlockKey: { [blockKey]: { values, feedback: null } }
    });
    return [...rendered.dockHtml.matchAll(/data-text-gap-value="([^"]+)"/gu)]
      .map((match) => match[1]);
  };
  assert.deepEqual(optionOrder(0, ["", ""]), ["UDP", "HTTP", "DNS"]);
  assert.deepEqual(optionOrder(0, ["UDP", ""]), ["UDP", "HTTP", "DNS"]);
  assert.deepEqual(optionOrder(1, ["", ""]), ["ICMP", "TCP", "IP"]);
});

test("modo Estudo não repete enunciado idêntico de paragraph e choice", () => {
  const question = "Qual protocolo confirma a entrega?";
  assert.throws(() => renderPackageStudyUnitBlocks({
    ...studyUnitWith({
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

test("modo Estudo entrega o grafo matemático ao Graphviz sem coordenadas autorais", () => {
  const html = renderPackageStudyUnitBlocks(studyUnitWith({
    id: "graph",
    package: "aralearn.resource.graph",
    version: "1.0.0",
    data: {
      prompt: "Observe o caminho.",
      name: "D",
      directed: true,
      layout: "hierarchical",
      vertices: [
        { id: "station", label: "Estação central de gerência" },
        { id: "agent", label: "Agente no dispositivo monitorado" }
      ],
      edges: [{ id: "request", from: "station", to: "agent", label: "envia solicitação de leitura" }]
    }
  }));
  assert.match(html, /package-math-graph/u);
  assert.match(html, /data-graphviz-engine="dot"/u);
  assert.match(html, /digraph/u);
  assert.match(html, /Estação central de gerência/u);
  assert.match(html, /envia solicitação de leitura/u);
  assert.doesNotMatch(html, /data-x=|data-y=|viewBox="0 0 320/u);
});

test("modo Estudo materializa relation_map como diagrama sem rótulos sobre arestas", () => {
  const html = renderPackageStudyUnitBlocks(studyUnitWith({
    id: "relations",
    package: "aralearn.resource.relation_map",
    version: "1.0.0",
    data: {
      prompt: "Relacione os componentes.",
      name: "R",
      relationMeaning: "cumpre",
      leftSet: { label: "Componente", items: [{ id: "agent", label: "Agente instalado no dispositivo monitorado" }] },
      rightSet: { label: "Responsabilidade", items: [{ id: "read", label: "Acessar o objeto gerenciado localmente" }] },
      relations: [{ id: "r1", from: "agent", to: "read" }]
    }
  }));
  assert.doesNotMatch(html, /package-system-diagram-svg/u);
  assert.match(html, /package-diagram-control-icon/u);
  assert.match(html, /package-relation-map/u);
  assert.match(html, /data-system-diagram-engine="dot"/u);
  assert.match(html, /digraph/u);
  assert.match(html, /Agente instalado no dispositivo monitorado/u);
  assert.match(html, /Acessar o objeto gerenciado localmente/u);
  assert.doesNotMatch(html, />executa</u);
});

test("choice incorreto não revela a alternativa esperada antes de Ver resposta", () => {
  const blockKeyPrefix = "lesson::card";
  const responseId = "answer";
  const blockKey = `${blockKeyPrefix}::response:${responseId}`;
  const html = renderPackageStudyUnitBlocks({
    ...studyUnitWith({
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

test("matrix e tree preservam a estrutura visual package-native na Unidade de estudo completa", () => {
  const matrixHtml = renderPackageStudyUnitBlocks(studyUnitWith({
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

  const treeHtml = renderPackageStudyUnitBlocks(studyUnitWith({
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
  assert.match(treeHtml, /class="package-system-diagram"/u);
  assert.match(treeHtml, /data-graphviz-source=/u);
  assert.match(treeHtml, /package-rooted-tree-node/u);
  assert.doesNotMatch(treeHtml, /runtime-tree-structure|runtime-tree-node-chip/u);
});

test("recursos visuais extraídos preservam representação própria em vez de texto cru", () => {
  const render = (instance) => renderPackageStudyUnitBlocks(studyUnitWith(instance));

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

  const systemContextHtml = render({
    id: "system",
    package: "aralearn.resource.software_system_context",
    version: "1.0.0",
    data: {
      prompt: "Observe o contexto.",
      system: { id: "app", label: "Aplicação", description: "Processa solicitações." },
      people: [{ id: "client", label: "Cliente", description: "Solicita uma operação." }],
      externalSystems: [{ id: "identity", label: "Identidade", description: "Autentica a sessão." }],
      relationships: [{ id: "request", from: "client", to: "app", label: "solicita operação" }, { id: "auth", from: "app", to: "identity", label: "valida sessão" }]
    }
  });
  assert.match(systemContextHtml, /package-system-diagram/u);
  assert.match(systemContextHtml, /data-system-diagram-engine="dot"/u);
  assert.match(systemContextHtml, /system-node-client/u);
  assert.match(systemContextHtml, /system-edge-request/u);
  assert.doesNotMatch(systemContextHtml, /package-system-map|package-system-group/u);
});

test("texto anotado ancora notas nos trechos sem revelar ids internos", () => {
  const html = renderPackageStudyUnitBlocks(studyUnitWith({
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
  const html = renderPackageStudyUnitBlocks(studyUnitWith({
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
