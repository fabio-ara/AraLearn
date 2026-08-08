import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

import {
  buildTextGapToken,
  hasTextGapSyntax,
  normalizeTextGapResponse,
  parseTextGapTokens,
  textGapResponseMatches
} from "../../src/core/textGaps.js";
import { validateContractDocument } from "../../src/contract/validateContract.js";
import {
  getRuntimePopupButtonEntry,
  renderCardRuntimeBlocks,
  renderPopupButtonDock
} from "../../src/render/renderCardRuntime.js";
import { computeFlowchartBoardLayout } from "../../src/flowchart/flowchartLayout.js";
import { deriveFlowchartProjectionFromStructure } from "../../src/flowchart/flowchartProjection.js";
import { computeFlowchartAutoFitScale } from "../../src/flowchart/flowchartViewport.js";
import { renderHomeScreen } from "../../src/ui/renderHomeScreen.js";
import { buildCourseNavigationState } from "../../src/ui/lessonEditorNavigation.js";
import { renderLessonScreen } from "../../src/ui/renderLessonScreen.js";
import { createEmptyProgressDocument } from "../../src/storage/progressStore.js";
import {
  createExampleProjectDocument,
  createLogicPlaneMatrixTestProjectDocument,
  createTeoriaDosGrafosProvaProjectDocument
} from "../support/exampleProjectDocument.js";
import {
  getCatalogCourseFixture,
  getCatalogFixtureManifest,
  getCatalogFixtureProject
} from "../support/catalogPublicationFixture.js";
import { loadCourseFixture, loadCourseFixtureManifest } from "../support/loadCourseFixture.js";
import { homeTrailSnapshotForProject } from "../support/homeTrailSnapshot.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test("respostas de lacuna com representação Unicode equivalente são comparáveis", () => {
  assert.equal(normalizeTextGapResponse("  AÇÃO  "), normalizeTextGapResponse("ação"));
  assert.equal(normalizeTextGapResponse("ＡＢＣ"), "abc");
});

test("lacuna digitada aceita somente variantes literais declaradas", () => {
  const tokenText = buildTextGapToken(
    "São Paulo",
    [],
    ["S. Paulo", "sao paulo"]
  );
  const [token] = parseTextGapTokens(tokenText);

  assert.equal(tokenText, "[[São Paulo;;S. Paulo|sao paulo]]");
  assert.deepEqual(token.acceptedAnswers, ["S. Paulo", "sao paulo"]);
  assert.equal(textGapResponseMatches(token, " S. PAULO "), true);
  assert.equal(textGapResponseMatches(token, "SAO PAULO"), true);
  assert.equal(textGapResponseMatches(token, "paulistana"), false);
});

function pointsEqual(a, b) {
  return Array.isArray(a) && Array.isArray(b) && a[0] === b[0] && a[1] === b[1];
}

function segmentIntersection(startA, endA, startB, endB) {
  const aVertical = startA[0] === endA[0];
  const bVertical = startB[0] === endB[0];
  if (aVertical && bVertical) {
    if (startA[0] !== startB[0]) return null;
    const minA = Math.min(startA[1], endA[1]);
    const maxA = Math.max(startA[1], endA[1]);
    const minB = Math.min(startB[1], endB[1]);
    const maxB = Math.max(startB[1], endB[1]);
    const from = Math.max(minA, minB);
    const to = Math.min(maxA, maxB);
    if (from > to) return null;
    if (from === to) return { kind: "point", point: [startA[0], from] };
    return { kind: "overlap", from: [startA[0], from], to: [startA[0], to] };
  }
  if (!aVertical && !bVertical) {
    if (startA[1] !== startB[1]) return null;
    const minA = Math.min(startA[0], endA[0]);
    const maxA = Math.max(startA[0], endA[0]);
    const minB = Math.min(startB[0], endB[0]);
    const maxB = Math.max(startB[0], endB[0]);
    const from = Math.max(minA, minB);
    const to = Math.min(maxA, maxB);
    if (from > to) return null;
    if (from === to) return { kind: "point", point: [from, startA[1]] };
    return { kind: "overlap", from: [from, startA[1]], to: [to, startA[1]] };
  }
  const verticalStart = aVertical ? startA : startB;
  const verticalEnd = aVertical ? endA : endB;
  const horizontalStart = aVertical ? startB : startA;
  const horizontalEnd = aVertical ? endB : endA;
  const x = verticalStart[0];
  const y = horizontalStart[1];
  const minY = Math.min(verticalStart[1], verticalEnd[1]);
  const maxY = Math.max(verticalStart[1], verticalEnd[1]);
  const minX = Math.min(horizontalStart[0], horizontalEnd[0]);
  const maxX = Math.max(horizontalStart[0], horizontalEnd[0]);
  if (x < minX || x > maxX || y < minY || y > maxY) return null;
  return { kind: "point", point: [x, y] };
}

function extractFlowRoutePoints(html) {
  return [...String(html || "").matchAll(/<polyline class="runtime-flow-route"[^>]*points="([^"]+)"/g)]
    .map((match) =>
      String(match[1] || "")
        .split(/\s+/)
        .filter(Boolean)
        .map((pair) => pair.split(",").map(Number))
    );
}

function assertFlowRoutesAreOrthogonal(html, context = "flow") {
  extractFlowRoutePoints(html).forEach((points, routeIndex) => {
    for (let index = 1; index < points.length; index += 1) {
      const start = points[index - 1];
      const end = points[index];
      assert.ok(
        start[0] === end[0] || start[1] === end[1],
        `${context}: rota ${routeIndex} tem segmento diagonal entre ${start.join(",")} e ${end.join(",")}`
      );
    }
  });
}

test("o renderer renderiza paragraph gap corretamente", () => {
  const html = renderCardRuntimeBlocks({
    position: 1,
    resource: "paragraph",
    kind: "exercise",
    exercise: "gap",
    title: "Complete",
    text: "A conjunção é verdadeira quando [[P e Q são verdadeiras::P e Q são verdadeiras|só P é verdadeira|só Q é verdadeira]].",
    after: "As duas partes precisam ser verdadeiras."
  });

  assert.match(html, /runtime-text-gap-blank/);
  assert.match(html, /runtime-text-gap-choice-blank/);
  assert.match(html, /data-action="text-gap-open-choice"/);
  assert.doesNotMatch(html, /P e Q são verdadeiras\s*<\/span>/);
});

test("o renderer não destaca 'for' em prosa portuguesa quando a palavra não é sintaxe", () => {
  const html = renderCardRuntimeBlocks({
    position: 1,
    resource: "paragraph",
    kind: "theory",
    exercise: "none",
    title: "Decisão",
    text: "`if` pode ser entendido como “se”: se o teste for verdadeiro, o bloco associado é executado.",
    after: ""
  });

  assert.match(html, /<code>if<\/code>/);
  assert.doesNotMatch(html, /<code>for<\/code> verdadeiro/);
});

test("text gap preserva caracteres reservados quando serializa respostas e opções", () => {
  const token = buildTextGapToken("case 2:", [
    "case 2:",
    "default:",
    "nota < 0 || nota > 10",
    "v[5]"
  ]);
  const parsed = parseTextGapTokens(`Complete ${token}.`);

  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].answer, "case 2:");
  assert.deepEqual(parsed[0].options, ["case 2:", "default:", "nota < 0 || nota > 10", "v[5]"]);
});

test("text gap sem distratores produz campo de resposta digitada", () => {
  const token = buildTextGapToken("2x");
  const parsed = parseTextGapTokens(`Complete ${token}.`);
  const html = renderCardRuntimeBlocks({
    position: 1,
    resource: "paragraph",
    kind: "exercise",
    exercise: "gap",
    title: "Derivada",
    text: `A derivada de x ao quadrado é ${token}.`,
    after: ""
  });

  assert.equal(token, "[[2x;;]]");
  assert.equal(parsed[0].valid, true);
  assert.equal(parsed[0].hasOptions, false);
  assert.deepEqual(parsed[0].options, []);
  assert.match(html, /contenteditable="true"/u);
  assert.match(html, /data-text-gap-field="true"/u);
  assert.doesNotMatch(html, /data-action="text-gap-open-choice"/u);
});

test("colchetes duplos de seleção tabular não viram lacuna", () => {
  const source = "df[[\"nome\", \"idade\"]]";
  assert.equal(hasTextGapSyntax(source), false);
  assert.deepEqual(parseTextGapTokens(source), []);
});

test("o renderer renderiza recurso contextual com escolha no próprio card", () => {
  const html = renderCardRuntimeBlocks({
    position: 1,
    resource: "table",
    kind: "exercise",
    exercise: "choice",
    title: "Leia a tabela",
    columns: ["Caso", "Valor"],
    rows: [["VV", "V"], ["VF", "F"]],
    question: "Qual linha mostra o caso verdadeiro da conjunção?",
    options: [
      { id: "a", text: "VV" },
      { id: "b", text: "VF" },
      { id: "c", text: "FF" }
    ],
    selectionMode: "single",
    selectionCriterion: "correct",
    answerIds: ["a"],
    after: "A conjunção só fica verdadeira em VV."
  });

  assert.match(html, /runtime-table-block/);
  assert.match(html, /runtime-choice-block/);
  assert.match(html, /Qual linha mostra o caso verdadeiro da conjunção/);
});

test("o renderer reconstrói tree como hierarquia aninhada", () => {
  const html = renderCardRuntimeBlocks({
    variant: "filesystem",
    position: 1,
    resource: "tree",
    kind: "theory",
    exercise: "none",
    title: "Árvore",
    prompt: "Observe a estrutura.",
    nodes: [
      { id: "root", label: "workspace", parentId: null, entryType: "directory" },
      { id: "src", label: "src", parentId: "root", entryType: "directory" },
      { id: "file", label: "index.js", parentId: "src", entryType: "file" }
    ],
    after: ""
  });

  assert.match(html, /runtime-tree-block/);
  assert.equal((html.match(/<ul class="runtime-tree-list" role="group">/g) || []).length, 3);
  assert.match(html, /runtime-tree-node-chip">diretório<\/span><span class="runtime-tree-node-label"[^>]*\bdir="auto"[^>]*>workspace/);
  assert.match(html, /runtime-tree-node-chip">arquivo<\/span><span class="runtime-tree-node-label"[^>]*\bdir="auto"[^>]*>index\.js/);
});

test("o renderer renderiza card composto com recursos repetidos", () => {
  const html = renderCardRuntimeBlocks({
    position: 1,
    resource: "composite",
    kind: "exercise",
    exercise: "choice",
    title: "Comparação entre grafos",
    blocks: [
      {
        id: "paragraph-1",
        kind: "paragraph",
        value: "Use A -> 1 e B -> 2 para comparar os dois grafos."
      },
      {
        id: "heading-1",
        kind: "heading",
        value: "G1"
      },
      {
        layout: "auto",
        id: "graph-1",
        kind: "graph",
        prompt: "Observe G1.",
        vertices: [
          { id: "A", label: "A" },
          { id: "B", label: "B" }
        ],
        edges: [{ id: "edge-1", from: "A", to: "B" }]
      },
      {
        id: "heading-2",
        kind: "heading",
        value: "G2"
      },
      {
        layout: "auto",
        id: "graph-2",
        kind: "graph",
        prompt: "Observe G2.",
        vertices: [
          { id: "1", label: "1" },
          { id: "2", label: "2" }
        ],
        edges: [{ id: "edge-1", from: "1", to: "2" }]
      },
      {
        id: "choice-1",
        kind: "choice",
        question: "AB vira qual aresta em G2?",
        options: [
          { id: "a", text: "1-2" },
          { id: "b", text: "1-1" },
          { id: "c", text: "2-2" }
        ],
        selectionMode: "single",
        selectionCriterion: "correct",
        answerIds: ["a"]
      }
    ],
    after: "A correspondência preserva a aresta."
  });

  assert.match(html, /Use A -&gt; 1 e B -&gt; 2/);
  assert.match(html, />G1</);
  assert.match(html, />G2</);
  assert.equal((html.match(/runtime-graph-block/g) || []).length, 2);
  assert.match(html, /AB vira qual aresta em G2/);
});

test("o renderer resolve ciclo de graph pela estrutura sem depender de coordenadas", () => {
  const html = renderCardRuntimeBlocks({
    layout: "auto",
    position: 1,
    resource: "graph",
    kind: "theory",
    exercise: "none",
    title: "Ciclo",
    prompt: "Analise o ciclo a seguir.",
    vertices: [
      { id: "P", label: "P" },
      { id: "Q", label: "Q" },
      { id: "R", label: "R" }
    ],
    edges: [
      { id: "edge-1", from: "P", to: "Q" },
      { id: "edge-2", from: "Q", to: "R" },
      { id: "edge-3", from: "R", to: "P" }
    ],
    after: ""
  });

  assert.match(html, /translate\(50 22\)/);
  assert.match(html, /translate\(74\.25 64\)|translate\(74\.24 64\)/);
  assert.match(html, /translate\(25\.75 64\)|translate\(25\.76 64\)/);
});

test("o renderer de caminho evita alinhar todos os vértices na mesma linha", () => {
  const html = renderCardRuntimeBlocks({
    layout: "auto",
    position: 1,
    resource: "graph",
    kind: "theory",
    exercise: "none",
    title: "Caminho",
    prompt: "Analise o caminho a seguir.",
    vertices: [
      { id: "A", label: "A" },
      { id: "B", label: "B" },
      { id: "C", label: "C" },
      { id: "D", label: "D" },
      { id: "E", label: "E" }
    ],
    edges: [
      { id: "edge-1", from: "A", to: "B" },
      { id: "edge-2", from: "B", to: "C" },
      { id: "edge-3", from: "C", to: "D" },
      { id: "edge-4", from: "D", to: "E" }
    ],
    after: ""
  });

  assert.match(html, /translate\(14(?:\.0+)? 62(?:\.0+)?\)/);
  assert.match(html, /translate\(50(?:\.0+)? 38(?:\.0+)?\)/);
  assert.match(html, /translate\(86(?:\.0+)? 62(?:\.0+)?\)/);
});

test("o renderer renderiza relation_map com pares e tabela suplementar", () => {
  const html = renderCardRuntimeBlocks({
    position: 1,
    resource: "relation_map",
    kind: "theory",
    exercise: "none",
    title: "Mapa",
    prompt: "Observe os conjuntos.",
    leftSet: {
      label: "U",
      items: [
        { id: "u1", label: "A" },
        { id: "u2", label: "B" }
      ]
    },
    rightSet: {
      label: "V",
      items: [
        { id: "v1", label: "1" },
        { id: "v2", label: "2" }
      ]
    },
    relations: [
      { from: "u1", to: "v1" },
      { from: "u2", to: "v2" }
    ],
    pairList: ["(A, 1)", "(B, 2)"],
    relationTable: {
      columns: ["Elemento de U", "Elemento de V"],
      rows: [["A", "1"], ["B", "2"]]
    },
    after: ""
  });

  assert.match(html, /runtime-relation-map-block/);
  assert.match(html, /runtime-relation-map-set-shell/);
  assert.match(html, /runtime-relation-map-item-dot/);
  assert.match(html, /runtime-relation-map-item-box/);
  assert.match(html, /runtime-relation-map-pair/);
  assert.match(html, /<path class="runtime-relation-map-link/);
  assert.doesNotMatch(html, /<line class="runtime-relation-map-link/);
  assert.match(html, /Elemento de U/);
});

test("o renderer de relation_map distribui rótulos longos sem manter texto linearizado", () => {
  const html = renderCardRuntimeBlocks({
    position: 1,
    resource: "relation_map",
    kind: "theory",
    exercise: "none",
    title: "Mapa longo",
    prompt: "Observe as relações.",
    leftSet: {
      label: "Tecnologias",
      items: [
        { id: "u1", label: "VB editor do Office" },
        { id: "u2", label: "Visual Studio IDE .NET" },
        { id: "u3", label: "VS Code editor leve" }
      ]
    },
    rightSet: {
      label: "Papéis",
      items: [
        { id: "v1", label: "automação no Office" },
        { id: "v2", label: "plataforma .NET" },
        { id: "v-code", label: "editor de código" }
      ]
    },
    relations: [
      { from: "u1", to: "v1" },
      { from: "u2", to: "v2" },
      { from: "u3", to: "v-code" }
    ],
    after: ""
  });

  assert.match(html, /viewBox="0 0 132 /);
  assert.match(html, /runtime-relation-map-item-label-group/);
  assert.match(html, /runtime-relation-map-item-box/);
  assert.match(html, /<path class="runtime-relation-map-link/);
});

test("o renderer de matrix destaca linha e coluna quando o card pede faixas inteiras", () => {
  const lineHtml = renderCardRuntimeBlocks({
    position: 1,
    resource: "matrix",
    kind: "exercise",
    exercise: "choice",
    title: "Linha",
    prompt: "Observe a linha destacada.",
    name: "M",
    values: [
      ["1", "2", "3"],
      ["4", "5", "6"],
      ["7", "8", "9"]
    ],
    highlight: { rows: [1] },
    question: "",
    options: [],
    selectionMode: "single",
    selectionCriterion: "correct",
    answerIds: [""],
    after: ""
  });
  const columnHtml = renderCardRuntimeBlocks({
    position: 1,
    resource: "matrix",
    kind: "exercise",
    exercise: "choice",
    title: "Coluna",
    prompt: "Observe a coluna destacada.",
    name: "M",
    values: [
      ["1", "2", "3"],
      ["4", "5", "6"],
      ["7", "8", "9"]
    ],
    highlight: { columns: [2] },
    question: "",
    options: [],
    selectionMode: "single",
    selectionCriterion: "correct",
    answerIds: [""],
    after: ""
  });

  assert.equal((lineHtml.match(/runtime-matrix-cell is-highlighted/g) || []).length, 3);
  assert.equal((columnHtml.match(/runtime-matrix-cell is-highlighted/g) || []).length, 3);
});

test("o renderer de matrix posiciona a divisória depois da coluna zero-based informada", () => {
  const html = renderCardRuntimeBlocks({
    position: 1,
    resource: "matrix",
    kind: "exercise",
    exercise: "choice",
    title: "Média",
    prompt: "Observe a coluna extra.",
    name: "notas",
    values: [
      ["8.0", "7.0", "9.0", "8.0"],
      ["6.0", "5.0", "7.0", "6.0"]
    ],
    dividerAfterColumn: 2,
    highlight: { columns: [3] },
    question: "",
    options: [],
    selectionMode: "single",
    selectionCriterion: "correct",
    answerIds: [""],
    after: ""
  });

  assert.match(html, /class="runtime-matrix-divider" style="grid-column:4;grid-row:1 \/ span 2;"/);
});

test("o renderer de flow usa o board geométrico de fluxograma", () => {
  const html = renderCardRuntimeBlocks({
    position: 1,
    resource: "flow",
    kind: "exercise",
    exercise: "choice",
    title: "Roteiro",
    prompt: "Procedimento.",
    structure: {
      kind: "sequence",
      items: [
        { kind: "start", text: "Escolher um vértice inicial" },
        { kind: "end", text: "Colocar vizinhos no grupo oposto" }
      ]
    },
    question: "Qual passo vem depois?",
    options: [
      { id: "a", text: "Colocar vizinhos no grupo oposto" },
      { id: "b", text: "Encerrar" }
    ],
    selectionMode: "single",
    selectionCriterion: "correct",
    answerIds: ["a"],
    after: ""
  });

  assert.match(html, /runtime-flow-board-shell/);
  assert.match(html, /runtime-flow-board-links/);
  assert.match(html, /flowchart-shape-svg/);
  assert.match(html, /Escolher um vértice inicial/);
  assert.match(html, /Colocar vizinhos no grupo oposto/);
  assert.doesNotMatch(html, /runtime-flow-edge/);
  assert.doesNotMatch(html, /n1 → n2/);
});

test("o renderer de flow respeita ramos explícitos de decisão", () => {
  const html = renderCardRuntimeBlocks({
    position: 1,
    resource: "flow",
    kind: "theory",
    exercise: "none",
    title: "Decisão",
    prompt: "Observe o fluxograma.",
    structure: {
      kind: "sequence",
      items: [
        { kind: "start", text: "Ler condição" },
        {
          kind: "if_then_else",
          condition: "A condição vale?",
          thenBranch: [{ kind: "end", text: "Executar A" }],
          elseBranch: [{ kind: "end", text: "Executar B" }]
        }
      ]
    },
    after: ""
  });

  assert.match(html, /runtime-flow-route-label/);
  assert.match(html, />Sim</);
  assert.match(html, />Não</);
  assert.match(html, /data-link-role="yes"/);
  assert.match(html, /data-link-role="no"/);
});

test("o layout de switch_case roteia o case horizontal até a lateral do processo", () => {
  const projection = deriveFlowchartProjectionFromStructure({
    kind: "sequence",
    items: [
      { kind: "start", text: "ler opcao" },
      {
        kind: "switch_case",
        expression: "opcao",
        cases: [
          {
            match: "1",
            body: [{ kind: "process", text: "executar case 1" }]
          },
          {
            match: "2",
            body: [{ kind: "process", text: "executar case 2" }]
          }
        ],
        defaultBranch: [{ kind: "process", text: "executar default" }]
      },
      { kind: "end", text: "fim" }
    ]
  });
  const layout = computeFlowchartBoardLayout(projection.nodes, projection.links);
  const labeledRoutes = (layout.routes || []).filter((route) => route.label === "1" || route.label === "2");

  assert.equal(labeledRoutes.length, 2);
  labeledRoutes.forEach((route) => {
    assert.equal(route.startSide, "right");
    assert.equal(route.points.length, 2);
    assert.equal(route.points[0][1], route.points[1][1]);
    assert.ok(route.points[1][0] > route.points[0][0]);
  });
});

test("o autofit de flow considera também a altura disponível do viewport", () => {
  const scale = computeFlowchartAutoFitScale({
    viewportWidth: 420,
    viewportHeight: 300,
    baseWidth: 220,
    baseHeight: 900,
    preferredScale: 1,
    padding: 12,
    minScale: 0.2,
    maxScale: 1.2
  });

  assert.equal(scale < 0.35, true);
  assert.equal(scale > 0.2, true);
});

test("o layout de flow mantém o ramo forward de decisão com back-edge no lado lógico do slot", () => {
  const layout = computeFlowchartBoardLayout(
    [
      { id: "retirar", shape: "process", text: "Retirar" },
      { id: "decisao", shape: "decision", text: "Todos os graus chegaram a zero?" },
      { id: "fim", shape: "terminal", text: "Lista gráfica: possível" }
    ],
    [
      { id: "l1", fromNodeId: "retirar", toNodeId: "decisao", outputSlot: 0, role: "next" },
      { id: "l2", fromNodeId: "decisao", toNodeId: "retirar", outputSlot: 0, role: "no", label: "Não" },
      { id: "l3", fromNodeId: "decisao", toNodeId: "fim", outputSlot: 1, role: "yes", label: "Sim" }
    ]
  );

  assert.ok(layout.positions.fim.left > layout.positions.decisao.left);
  const yesRoute = layout.routes.find((route) => route.link.id === "l3");
  assert.ok(yesRoute);
  assert.equal(yesRoute.startSide, "right");
  assert.ok(Array.isArray(yesRoute.points));
  assert.ok(yesRoute.points[1][0] > yesRoute.points[0][0]);
});

test("o layout de flow usa queda vertical pura quando origem e destino já estão alinhados", () => {
  const layout = computeFlowchartBoardLayout(
    [
      { id: "a", shape: "process", text: "Subtrair 1 dos próximos d termos" },
      { id: "b", shape: "decision", text: "Apareceu negativo ou faltou termo?" }
    ],
    [
      { id: "ab", fromNodeId: "a", toNodeId: "b", outputSlot: 0, role: "next" }
    ]
  );

  const route = layout.routes.find((entry) => entry.link.id === "ab");
  assert.ok(route);
  assert.equal(route.points.length, 2);
  assert.equal(route.points[0][0], route.points[1][0]);
});

test("o label de ramo à direita fica próximo ao ponto de saída", () => {
  const layout = computeFlowchartBoardLayout(
    [
      { id: "n1", shape: "decision", text: "A condição vale?" },
      { id: "n2", shape: "terminal", text: "Executar A" },
      { id: "n3", shape: "terminal", text: "Executar B" }
    ],
    [
      { id: "l1", fromNodeId: "n1", toNodeId: "n2", outputSlot: 1, role: "yes", label: "Sim" },
      { id: "l2", fromNodeId: "n1", toNodeId: "n3", outputSlot: 0, role: "no", label: "Não" }
    ]
  );

  const yesRoute = layout.routes.find((entry) => entry.link.id === "l1");
  assert.ok(yesRoute?.labelPos);
  assert.equal(yesRoute.labelPos.x - yesRoute.points[0][0], 6);
});

test("while com decisão interna e junction não cruza nem sobrepõe rotas", () => {
  const projection = deriveFlowchartProjectionFromStructure({
    kind: "sequence",
    items: [
      { kind: "start", text: "Ordenar do maior para o menor" },
      {
        kind: "while",
        condition: "Ainda existem graus não nulos?",
        body: [
          { kind: "process", text: "Retirar o maior valor d" },
          { kind: "process", text: "Subtrair 1 dos próximos d termos" },
          {
            kind: "if_then",
            condition: "Apareceu negativo ou faltou termo?",
            thenBranch: [{ kind: "end", text: "Lista não gráfica: impossível" }]
          },
          { kind: "process", text: "Reordenar a lista" }
        ]
      },
      { kind: "end", text: "Lista gráfica: possível" }
    ]
  });
  const layout = computeFlowchartBoardLayout(projection.nodes, projection.links);
  const routes = layout.routes;

  for (let routeIndex = 0; routeIndex < routes.length; routeIndex += 1) {
    const routeA = routes[routeIndex];
    for (let otherIndex = routeIndex + 1; otherIndex < routes.length; otherIndex += 1) {
      const routeB = routes[otherIndex];
      for (let aIndex = 1; aIndex < routeA.points.length; aIndex += 1) {
        const aStart = routeA.points[aIndex - 1];
        const aEnd = routeA.points[aIndex];
        for (let bIndex = 1; bIndex < routeB.points.length; bIndex += 1) {
          const bStart = routeB.points[bIndex - 1];
          const bEnd = routeB.points[bIndex];
          const intersection = segmentIntersection(aStart, aEnd, bStart, bEnd);
          if (!intersection) continue;
          if (intersection.kind === "overlap") {
            assert.fail(`rotas ${routeA.link.id} e ${routeB.link.id} se sobrepõem`);
          }
          const p = intersection.point;
          const sharedEndpointA = pointsEqual(p, routeA.points[0]) || pointsEqual(p, routeA.points[routeA.points.length - 1]);
          const sharedEndpointB = pointsEqual(p, routeB.points[0]) || pointsEqual(p, routeB.points[routeB.points.length - 1]);
          if (!(sharedEndpointA && sharedEndpointB)) {
            assert.fail(`rotas ${routeA.link.id} e ${routeB.link.id} se cruzam em ${p[0]},${p[1]}`);
          }
        }
      }
    }
  }
});

test("o renderer de flow mantém rotas ortogonais mesmo com switch_case e merge lateral", () => {
  const html = renderCardRuntimeBlocks({
    position: 1,
    resource: "flow",
    kind: "theory",
    exercise: "none",
    title: "Menu",
    prompt: "Observe o fluxograma.",
    structure: {
      kind: "sequence",
      items: [
        { kind: "start", text: "ler opcao" },
        {
          kind: "switch_case",
          expression: "opcao",
          cases: [
            {
              match: "1",
              body: [{ kind: "process", text: "executar case 1" }]
            },
            {
              match: "2",
              body: [{ kind: "process", text: "executar case 2" }]
            }
          ],
          defaultBranch: [{ kind: "process", text: "executar default" }]
        },
        { kind: "end", text: "fim" }
      ]
    },
    after: ""
  });

  assertFlowRoutesAreOrthogonal(html, "switch_case");
});

test("o renderer mantém paragraph teórico sem lacuna como texto normal", () => {
  const html = renderCardRuntimeBlocks({
    position: 1,
    resource: "paragraph",
    kind: "theory",
    exercise: "none",
    title: "Definição",
    text: "A conjunção só é verdadeira quando as duas proposições são verdadeiras.",
    after: ""
  });

  assert.match(html, /runtime-paragraph/);
  assert.match(html, /A conjunção só é verdadeira quando as duas proposições são verdadeiras\./);
  assert.doesNotMatch(html, /runtime-text-gap-blank/);
});

test("o renderer destaca sintaxe inline em paragraph mesmo sem crases explícitas", () => {
  const html = renderCardRuntimeBlocks({
    position: 1,
    resource: "paragraph",
    kind: "theory",
    exercise: "none",
    title: "Sintaxe",
    text: "Use #include <stdio.h>, main, main(), %d e &idade dentro do bloco { ... }.",
    after: ""
  });

  assert.match(html, /<code>#include &lt;stdio\.h&gt;<\/code>/);
  assert.match(html, /<code>main<\/code>/);
  assert.match(html, /<code>main\(\)<\/code>/);
  assert.match(html, /<code>%d<\/code>/);
  assert.match(html, /<code>&amp;idade<\/code>/);
  assert.match(html, /<code>\{<\/code>/);
  assert.match(html, /<code>\}<\/code>/);
});

test("o renderer destaca palavras-chave, comparações e chamadas curtas de C em texto corrido", () => {
  const html = renderCardRuntimeBlocks({
    position: 1,
    resource: "paragraph",
    kind: "theory",
    exercise: "none",
    title: "Sintaxe expandida",
    text: "Use for(i = 0; i <= 4; i++), while (idade < 18), switch (opcao), case 1:, default:, break, return, typedef, struct, mostrarNota(8.5); e alterar(&idade).",
    after: ""
  });

  assert.match(html, /<code>for\(i = 0; i &lt;= 4; i\+\+\)<\/code>/);
  assert.match(html, /<code>while \(idade &lt; 18\)<\/code>/);
  assert.match(html, /<code>switch \(opcao\)<\/code>/);
  assert.match(html, /<code>case 1:<\/code>/);
  assert.match(html, /<code>default:<\/code>/);
  assert.match(html, /<code>break<\/code>/);
  assert.match(html, /<code>return<\/code>/);
  assert.match(html, /<code>typedef<\/code>/);
  assert.match(html, /<code>struct<\/code>/);
  assert.match(html, /<code>mostrarNota\(8\.5\);<\/code>/);
  assert.match(html, /<code>alterar\(&amp;idade\)<\/code>/);
});

test("o renderer destaca assinaturas e chamadas de função em alternativas textuais de choice", () => {
  const html = renderCardRuntimeBlocks({
    position: 1,
    resource: "choice",
    kind: "exercise",
    exercise: "choice",
    title: "Assinaturas",
    question: "Qual alternativa está correta?",
    options: [
      { id: "a", text: "void mostrarIdade(int idade)" },
      { id: "b", text: "mostrarIdade(int idade);" },
      { id: "c", text: "alterar(&idade);" }
    ],
    selectionMode: "single",
    selectionCriterion: "correct",
    answerIds: ["a"],
    after: ""
  });

  assert.match(html, /<code>void<\/code>\s*<code>mostrarIdade\(int idade\)<\/code>/);
  assert.match(html, /<code>mostrarIdade\(int idade\);<\/code>/);
  assert.match(html, /<code>alterar\(&amp;idade\);<\/code>/);
});

test("o renderer preserva quebra e indentação em opções de choice com código", () => {
  const html = renderCardRuntimeBlocks({
    position: 1,
    resource: "code",
    kind: "exercise",
    exercise: "choice",
    title: "Escolha o código correto",
    prompt: "Compare as opções.",
    language: "c",
    code: "___",
    question: "Qual opção está correta?",
    options: [
      {
        id: "a",
        kind: "code",
        language: "c",
        code: "#include <stdio.h>\nmain()\n{\n    printf(\"Ola\");\n}"
      },
      {
        id: "b",
        text: "main()"
      }
    ],
    selectionMode: "single",
    selectionCriterion: "correct",
    answerIds: ["a"],
    after: ""
  });

  assert.match(html, /<pre class="multiple-choice-code"><code data-language="c">#include &lt;stdio\.h&gt;\nmain\(\)\n\{\n {4}printf\(&quot;Ola&quot;\);\n\}<\/code><\/pre>/);
  assert.match(html, /<span class="multiple-choice-label"[^>]*\bdir="auto"[^>]*><span class="runtime-manual-choice-value"><code>main\(\)<\/code><\/span><\/span>/);
});

test("o renderer expõe after como popup de continuação", () => {
  const card = {
    position: 1,
    resource: "choice",
    kind: "exercise",
    exercise: "choice",
    title: "Escolha a correta",
    question: "Qual é a correta?",
    options: [
      { id: "a", text: "A" },
      { id: "b", text: "B" }
    ],
    selectionMode: "single",
    selectionCriterion: "correct",
    answerIds: ["a"],
    after: "A alternativa correta é a A."
  };

  const popupEntry = getRuntimePopupButtonEntry(card);
  assert.ok(popupEntry);
  const popup = renderPopupButtonDock(popupEntry.block, { blockKeyPrefix: "runtime-block" });
  assert.match(popup.bodyHtml, /A alternativa correta é a A\./);
});

test("os documentos públicos de exemplo usam o contrato v4", () => {
  [
    createExampleProjectDocument(),
    createTeoriaDosGrafosProvaProjectDocument(),
    createLogicPlaneMatrixTestProjectDocument(),
    getCatalogFixtureProject()
  ].forEach((document) => {
    const result = validateContractDocument(document);
    assert.equal(result.ok, true);
    assert.equal(result.value.version, 4);
  });
});

test("todos os fixtures v4 validam no contrato atual", () => {
  const fixturesDir = path.resolve(__dirname, "../fixtures/v4");
  const fileNames = fs.readdirSync(fixturesDir).filter((fileName) => fileName.endsWith(".json")).sort();
  assert.ok(fileNames.length >= 2);
  fileNames.forEach((fileName) => {
    const document = JSON.parse(fs.readFileSync(path.join(fixturesDir, fileName), "utf8"));
    const result = validateContractDocument(document);
    assert.equal(result.ok, true, fileName);
    assert.equal(result.value.version, 4, fileName);
  });
});

test("README e docs públicos descrevem o contrato atual", () => {
  const targets = [
    path.resolve(__dirname, "../../README.md"),
    ...fs.readdirSync(path.resolve(__dirname, "../../docs"))
      .filter((fileName) => fileName.endsWith(".md"))
      .map((fileName) => path.resolve(__dirname, "../../docs", fileName))
  ];
  targets.forEach((target) => {
    const source = fs.readFileSync(target, "utf8");
    assert.ok(source.trim().length > 0, path.basename(target));
  });
});

test("a home renderiza abrir curso com ids reais do contrato v4", () => {
  const project = getCatalogFixtureProject();
  const trailSnapshot = homeTrailSnapshotForProject(project);
  const html = renderHomeScreen({
    project,
    progress: createEmptyProgressDocument(),
    editorSupport: { trailSnapshot }
  });

  assert.match(html, /data-action="open-course"/);
  assert.match(html, new RegExp(`value="${trailSnapshot.items[0].trailItemId}"`, "u"));
  assert.match(html, new RegExp(`value="${trailSnapshot.items[1].trailItemId}"`, "u"));
  assert.equal((html.match(/data-action="open-course"/g) || []).length, 1);
});

test("a home usa menu contextual compacto sem atalhos órfãos", () => {
  const fixture = getCatalogFixtureProject();
  const course = fixture.courses[0];
  const project = { ...fixture, courses: [course] };
  const trailSnapshot = homeTrailSnapshotForProject(project);
  const html = renderHomeScreen({
    project,
    progress: createEmptyProgressDocument(),
    editorSupport: {
      trailSnapshot
    }
  });

  assert.doesNotMatch(html, /open-authoring-assistant|open-generation-panel/u);
  assert.match(html, /data-action="reset-course-progress-direct"/);
  assert.doesNotMatch(html, /data-action="edit-course"/);
  assert.doesNotMatch(html, /data-action="delete-course-direct"/);
  assert.doesNotMatch(html, /data-action="open-course-actions"/);
  assert.match(html, /data-action="open-course"/);
  assert.match(html, /home-course-context-menu/u);
});

test("a home agrupa pelo id relacional sem expor essa identidade na navegação", () => {
  const fixture = getCatalogFixtureProject();
  const course = fixture.courses[0];
  const project = { ...fixture, courses: [course] };
  const trailSnapshot = homeTrailSnapshotForProject(project, {
    groupId: "11111111-1111-4111-8111-111111111111",
    groupTitle: "Certificações",
    permissions: {
      [course.id]: { origin: "catalog" }
    }
  });
  const html = renderHomeScreen({
    project,
    progress: createEmptyProgressDocument(),
    editorSupport: { trailSnapshot }
  });
  assert.match(html, /<optgroup label="Certificações">/u);
  assert.match(html, new RegExp(`value="${trailSnapshot.items[0].trailItemId}"`, "u"));
  assert.doesNotMatch(html, /value="11111111-1111-4111-8111-111111111111"/u);
  assert.match(html, /home-course-origin is-catalog/u);
});

test("a home abre planejamento sem inventar progresso nem oferecer zerar", () => {
  const fixture = getCatalogFixtureProject();
  const project = { ...fixture, courses: [fixture.courses[0]] };
  const baseSnapshot = homeTrailSnapshotForProject(project);
  const trailSnapshot = {
    ...baseSnapshot,
    items: [{
      ...baseSnapshot.items[0],
      workspaceId: "22222222-2222-4222-8222-222222222222",
      courseId: null,
      selectionId: null,
      kind: "plan",
      source: "workspace",
      origin: "workspace",
      cardCount: 0,
      completedCardCount: 0,
      revision: 1,
      canEdit: true
    }]
  };
  const html = renderHomeScreen({
    project,
    progress: createEmptyProgressDocument(),
    editorSupport: { trailSnapshot }
  });

  assert.match(html, /aria-label="Planejamento"/u);
  assert.match(html, /aria-label="Abrir planejamento"/u);
  assert.doesNotMatch(html, /Progresso: 0\/0/u);
  assert.doesNotMatch(html, /data-action="reset-course-progress-direct"/u);
});

test("a edição estrutural seleciona o card e leva as ações para o dock externo", () => {
  const project = getCatalogFixtureProject();
  const course = project.courses[0];
  const moduleValue = course.modules[0];
  const html = renderLessonScreen({
    project,
    view: "course",
    selection: { courseKey: course.id, moduleKey: moduleValue.id },
    course,
    moduleValue,
    lesson: null,
    microsequence: null,
    cards: [],
    microsequenceMode: "play",
    editorSupport: {
      progress: createEmptyProgressDocument(),
      coursePermissions: {
        canAuthorContent: true,
        canEdit: true,
        canDelete: true
      },
      entityModes: { course: "edit" },
      inlineStructureEditor: {
        level: "module",
        courseKey: course.id,
        moduleKey: moduleValue.id
      }
    }
  });

  assert.match(html, /data-action="select-inline-structure-entity"/);
  assert.match(html, /data-inline-structure-editor="true"/);
  assert.match(html, /data-action="reset-entity-progress-direct"/);
  assert.match(html, /data-action="delete-entity-direct"/);
  assert.match(html, /data-action="save-inline-entity"/);
  assert.match(html, /data-action="open-central"/);
  assert.doesNotMatch(html, /structure-actions-placeholder/u);
  assert.match(html, /data-action="open-module"/u);
  assert.doesNotMatch(html, /data-action="edit-entity-direct"|data-action="structure-drag-handle"/u);
  assert.doesNotMatch(html, /open-module-actions|open-course-screen-actions|open-authoring-assistant|open-generation-panel|quick-create-module/u);
});

test("a hierarquia nomeia cabeçalhos, seções e modos do curso à microssequência", () => {
  const project = getCatalogFixtureProject();
  const course = project.courses[0];
  const moduleValue = course.modules[0];
  const lesson = moduleValue.lessons[0];
  const microsequence = lesson.microsequences[0];
  const common = {
    project,
    selection: {
      courseKey: course.id,
      moduleKey: moduleValue.id,
      lessonKey: lesson.id,
      microsequenceKey: microsequence.id,
      cardKey: microsequence.cards?.[0]?.id || null,
      cardIndex: 0
    },
    course,
    moduleValue,
    lesson,
    microsequence,
    cards: microsequence.cards || [],
    editorSupport: {
      progress: createEmptyProgressDocument(),
      coursePermissions: {
        canAuthorContent: true,
        canEdit: true,
        canDelete: true
      },
      entityModes: {}
    }
  };
  const cases = [
    { view: "course", microsequenceMode: "play", level: "course", heading: "Curso", section: "Módulos", ai: false },
    { view: "module", microsequenceMode: "play", level: "module", heading: "Módulo", section: "Lições", ai: false },
    { view: "lesson", microsequenceMode: "play", level: "lesson", heading: "Lições", section: "Microssequências", ai: true },
    { view: "microsequence", microsequenceMode: "overview", level: "microsequence", heading: "Microssequência", section: "Cards", ai: true }
  ];

  for (const entry of cases) {
    const html = renderLessonScreen({ ...common, ...entry });
    assert.match(html, new RegExp(`<div class="topbar-title">${entry.heading}</div>`, "u"), entry.level);
    assert.match(html, new RegExp(`<h2 class="section-heading">${entry.section}</h2>`, "u"), entry.level);
    assert.match(html, new RegExp(`data-entity-level="${entry.level}"[^>]+data-entity-mode="view"`, "u"), entry.level);
    assert.match(html, new RegExp(`data-entity-level="${entry.level}"[^>]+data-entity-mode="edit"`, "u"), entry.level);
    if (entry.ai) {
      assert.match(html, new RegExp(`data-entity-level="${entry.level}"[^>]+data-entity-mode="ai"`, "u"), entry.level);
    } else {
      assert.doesNotMatch(html, new RegExp(`data-entity-level="${entry.level}"[^>]+data-entity-mode="ai"`, "u"), entry.level);
    }
  }
});

test("a navegação de curso resolve seleção válida a partir de ids do contrato v4", () => {
  const project = getCatalogFixtureProject();
  const navigationState = buildCourseNavigationState(project, "course-microsoft-azure-ai-fundamentals-ai900");

  assert.ok(navigationState);
  assert.equal(navigationState.view, "course");
  assert.equal(navigationState.selection.courseKey, "course-microsoft-azure-ai-fundamentals-ai900");
  assert.equal(typeof navigationState.selection.moduleKey, "string");
});

test("as fixtures de publicação mantêm os cursos oficiais materializados fora do runtime", () => {
  const project = getCatalogFixtureProject();
  const manifest = getCatalogFixtureManifest();
  const fixtureManifest = loadCourseFixtureManifest();
  const praticasCourse = loadCourseFixture("praticas-ferramentas-seed-course.json");
  const organizacaoCourse = loadCourseFixture("organizacao-arquitetura-computadores-seed-course.json");
  const frameworkCourse = loadCourseFixture("framework-ia-generativa-seed-course.json");
  const logicaCourse = loadCourseFixture("logica-programacao-seed-course.json");
  const fundamentosCourse = getCatalogCourseFixture("fundamentos-ia-analise-dados-seed-course.json");
  const ai900Course = project.courses.find((course) => course.id === "course-microsoft-azure-ai-fundamentals-ai900");
  const dataprevCourse = project.courses.find(
    (course) => course.id === "course-dataprev-2026-analista-processamento-seguranca-informacao"
  );

  assert.ok(ai900Course);
  assert.ok(dataprevCourse);
  for (const course of project.courses) {
    for (const module of course.modules) {
      for (const lesson of module.lessons) {
        for (const microsequence of lesson.microsequences) {
          assert.equal(
            microsequence.status,
            "ready",
            `${course.id}/${module.id}/${lesson.id}/${microsequence.id} precisa estar pronta para publicação`
          );
        }
      }
    }
  }
  assert.deepEqual(
    fs
      .readdirSync(path.resolve(__dirname, "../../supabase/fixtures/catalog"))
      .filter((fileName) => fileName.endsWith(".json") && fileName !== "catalog-fixtures.json")
      .sort(),
    [
      "dataprev-analista-processamento-seed-course.json",
      "fundamentos-ia-analise-dados-seed-course.json",
      "microsoft-azure-ai-fundamentals-ai900-seed-course.json"
    ]
  );
  assert.deepEqual(
    fs
      .readdirSync(path.resolve(__dirname, "../fixtures/course-catalog"))
      .filter((fileName) => fileName.endsWith(".json") && fileName !== "course-catalog-manifest.json")
      .sort(),
    [
      "framework-ia-generativa-seed-course.json",
      "logica-programacao-seed-course.json",
      "organizacao-arquitetura-computadores-seed-course.json",
      "praticas-ferramentas-seed-course.json",
      "teoria-dos-grafos-prova.json"
    ]
  );
  assert.deepEqual(fixtureManifest.courseFiles, [
    "teoria-dos-grafos-prova.json",
    "logica-programacao-seed-course.json",
    "praticas-ferramentas-seed-course.json",
    "organizacao-arquitetura-computadores-seed-course.json",
    "framework-ia-generativa-seed-course.json"
  ]);
  assert.deepEqual(manifest.courseFiles, [
    "microsoft-azure-ai-fundamentals-ai900-seed-course.json",
    "dataprev-analista-processamento-seed-course.json",
    "fundamentos-ia-analise-dados-seed-course.json"
  ]);
  assert.equal(project.courses.length, manifest.courseFiles.length);

  const dataprevMicrosequences = dataprevCourse.modules
    .flatMap((moduleValue) => moduleValue.lessons || [])
    .flatMap((lesson) => lesson.microsequences || []);
  const dataprevServerLessons = dataprevCourse.modules[1].lessons || [];
  const dataprevServerMicrosequences = dataprevServerLessons.flatMap((lesson) => lesson.microsequences || []);
  const dataprevNetworkLessons = dataprevCourse.modules[2].lessons || [];
  const dataprevNetworkMicrosequences = dataprevNetworkLessons.flatMap((lesson) => lesson.microsequences || []);

  assert.equal(dataprevCourse.title, "Dataprev: Analista de Processamento");
  assert.equal(
    dataprevCourse.goal,
    "Preparação para o cargo de Analista de Processamento da Dataprev: Segurança da Informação, Gestão de Servidores, Computação em Nuvem e Virtualização, Redes de Computadores, Banco de Dados, Inteligência de Negócios e Gestão e Governança de Tecnologia da Informação."
  );
  assert.equal(dataprevCourse.modules.length, 3);
  assert.equal(dataprevCourse.modules[0].title, "Segurança da Informação");
  assert.equal(dataprevCourse.modules[0].lessons.length, 8);
  assert.equal(dataprevMicrosequences.length, 175);
  assert.deepEqual(
    dataprevCourse.modules[0].lessons.map((lesson) => lesson.title),
    [
      "Fundamentos, pilares e vocabulário de segurança",
      "Políticas, procedimentos e gerenciamento de segurança",
      "Segurança de redes e redes sem fio",
      "Vulnerabilidades, ataques e softwares maliciosos",
      "Criptografia e certificação digital",
      "LGPD aplicada à Segurança da Informação",
      "IDS, IPS e SIEM",
      "NIST Cybersecurity Framework 1.1 e revisão integrada"
    ]
  );
  assert.equal(dataprevCourse.modules[1].id, "module-gestao-de-servidores");
  assert.equal(dataprevCourse.modules[1].title, "Gestão de Servidores");
  assert.equal(dataprevServerLessons.length, 8);
  assert.equal(dataprevServerMicrosequences.length, 64);
  assert.equal(
    dataprevServerMicrosequences.reduce(
      (count, microsequence) =>
        count +
        (microsequence.cards || []).length,
      0
    ),
    322
  );
  assert.equal(dataprevCourse.modules[2].id, "module-redes-computadores");
  assert.equal(dataprevCourse.modules[2].title, "Redes de Computadores");
  assert.equal(dataprevNetworkLessons.length, 8);
  assert.equal(dataprevNetworkMicrosequences.length, 40);
  assert.equal(
    dataprevNetworkMicrosequences.reduce((count, microsequence) => count + (microsequence.cards || []).length, 0),
    307
  );
  const ai900Microsequences = ai900Course.modules
    .flatMap((moduleValue) => moduleValue.lessons || [])
    .flatMap((lesson) => lesson.microsequences || []);

  assert.equal(ai900Course.title, "Microsoft Azure AI Fundamentals (AI-900)");
  assert.equal(ai900Course.modules.length, 9);
  assert.equal(ai900Course.modules.flatMap((moduleValue) => moduleValue.lessons || []).length, 12);
  assert.equal(ai900Microsequences.length, 72);
  assert.equal(
    ai900Microsequences.reduce((count, microsequence) => {
      const active = microsequence;
      return count + ((active?.cards || []).length);
    }, 0),
    858
  );
  const ai900TableProblems = ai900Microsequences.flatMap((microsequence) =>
    (microsequence.cards || [])
        .filter((card) => card.resource === "table")
        .flatMap((card) => {
          const columns = Array.isArray(card.columns) ? card.columns.length : 0;
          return (card.rows || []).flatMap((row, rowIndex) => {
            if (!Array.isArray(row) || !row.length) {
              return [`${card.id}.rows[${rowIndex}] vazia`];
            }
            if (columns && row.length !== columns) {
              return [`${card.id}.rows[${rowIndex}] com ${row.length} células para ${columns} colunas`];
            }
            return [];
          });
        })
  );
  assert.deepEqual(ai900TableProblems, []);
  ai900Microsequences.forEach((microsequence) => {
    const visibleTexts = [
      microsequence.title,
      microsequence.goal,
      ...(microsequence.cards || []).flatMap((card) => [
        card.title,
        card.text,
        card.prompt,
        card.question,
        card.after,
        ...(card.options || []).map((option) => option.text)
      ])
    ].filter((value) => typeof value === "string");
    visibleTexts.forEach((value) => {
      assert.doesNotMatch(value, /handoff|planner\/auditor|materializar|json completo/iu);
    });
  });

  const praticasMicrosequences = praticasCourse.modules
    .flatMap((moduleValue) => moduleValue.lessons || [])
    .flatMap((lesson) => lesson.microsequences || []);

  assert.ok(praticasMicrosequences.length > 0);
  assert.equal(praticasMicrosequences.some((microsequence) => (microsequence.cards || []).length > 0), true);
  assert.equal(praticasMicrosequences.some((microsequence) => (microsequence.cards || []).length > 0), true);

  const organizacaoMicrosequences = organizacaoCourse.modules
    .flatMap((moduleValue) => moduleValue.lessons || [])
    .flatMap((lesson) => lesson.microsequences || []);

  assert.equal(organizacaoCourse.modules.length, 3);
  assert.equal(
    organizacaoCourse.modules.some((moduleValue) => moduleValue.title === "MobileRAG"),
    true
  );
  assert.equal(
    organizacaoCourse.modules.some((moduleValue) => moduleValue.title === "Filosofia da Computação Quântica"),
    true
  );
  assert.equal(
    organizacaoCourse.modules.some((moduleValue) => moduleValue.title === "Bases numéricas, arquitetura da CPU e paralelismo"),
    true
  );
  assert.ok(organizacaoMicrosequences.length > 0);
  assert.equal(organizacaoMicrosequences.some((microsequence) => (microsequence.cards || []).length > 0), true);
  assert.equal(organizacaoMicrosequences.some((microsequence) => (microsequence.cards || []).length > 0), true);

  const frameworkMicrosequences = frameworkCourse.modules
    .flatMap((moduleValue) => moduleValue.lessons || [])
    .flatMap((lesson) => lesson.microsequences || []);

  assert.equal(frameworkCourse.modules.length, 8);
  assert.equal(frameworkCourse.modules.flatMap((moduleValue) => moduleValue.lessons || []).length, 25);
  assert.equal(frameworkMicrosequences.length, 52);
  assert.equal(
    frameworkMicrosequences.reduce((count, microsequence) => {
      const active = microsequence;
      return count + ((active?.cards || []).length);
    }, 0),
    180
  );
  assert.equal(
    frameworkMicrosequences
      .flatMap((microsequence) => microsequence.cards || [])
      .filter((card) => card.resource === "flow")
      .every((card) => card.structure && !("nodes" in card) && !("edges" in card)),
    true
  );

  assert.equal(
    organizacaoMicrosequences
      .flatMap((microsequence) => microsequence.cards || [])
      .filter((card) => card.resource === "flow")
      .every((card) => card.structure && !("nodes" in card) && !("edges" in card)),
    true
  );

  const logicaMicrosequences = logicaCourse.modules
    .flatMap((moduleValue) => moduleValue.lessons || [])
    .flatMap((lesson) => lesson.microsequences || []);

  assert.equal(logicaCourse.modules.length, 8);
  assert.equal(logicaCourse.modules.flatMap((moduleValue) => moduleValue.lessons || []).length, 29);
  assert.equal(logicaMicrosequences.length, 170);
  assert.equal(
    logicaMicrosequences
      .reduce((count, microsequence) => count + ((microsequence.cards || []).length), 0),
    924
  );
  assert.equal(
    logicaMicrosequences
      .flatMap((microsequence) => microsequence.cards || [])
      .filter((card) => card.resource === "flow")
      .every((card) => card.structure && !("nodes" in card) && !("edges" in card)),
    true
  );
  assert.equal(
    logicaMicrosequences
      .flatMap((microsequence) => microsequence.cards || [])
      .filter((card) => card.resource === "flow")
      .every((card) => {
        const html = renderCardRuntimeBlocks(card);
        assertFlowRoutesAreOrthogonal(html, card.id);
        return true;
      }),
    true
  );

  const fundamentosMicrosequences = fundamentosCourse.modules
    .flatMap((moduleValue) => moduleValue.lessons || [])
    .flatMap((lesson) => lesson.microsequences || []);

  assert.equal(fundamentosCourse.title, "Fundamentos de IA e Análise de Dados");
  assert.equal(fundamentosCourse.modules.length, 8);
  assert.equal(fundamentosCourse.modules.flatMap((moduleValue) => moduleValue.lessons || []).length, 8);
  assert.equal(fundamentosMicrosequences.length, 96);
  assert.equal(fundamentosMicrosequences.some((microsequence) => (microsequence.cards || []).length > 0), true);
  assert.equal(fundamentosMicrosequences.some((microsequence) => (microsequence.cards || []).length > 0), true);
  assert.equal(
    fundamentosCourse.modules.some(
      (moduleValue) => moduleValue.title === "Aula 3 — Bibliotecas para análise de dados com NumPy e Pandas"
    ),
    true
  );
  assert.equal(
    fundamentosCourse.modules.some(
      (moduleValue) => moduleValue.title === "Aula 4 — Fundamentos de dados, tipos, Excel e análise com Pandas"
    ),
    true
  );
  assert.equal(
    fundamentosCourse.modules.some(
      (moduleValue) => moduleValue.title === "Aula 5 — Tratamento e Preparação de Dados com Pandas e introdução ao PySpark"
    ),
    true
  );
  assert.equal(
    fundamentosCourse.modules.some(
      (moduleValue) => moduleValue.title === "Aula 6 — Visualização de Dados com Matplotlib e Seaborn"
    ),
    true
  );
  assert.equal(
    fundamentosCourse.modules.some((moduleValue) => moduleValue.title === "Aula 7 — Estatística Aplicada"),
    true
  );
  assert.equal(
    fundamentosCourse.modules.some((moduleValue) => moduleValue.title === "Aula 8 — Análise Exploratória de Dados (EDA)"),
    true
  );
  assert.equal(
    fundamentosMicrosequences.reduce((count, microsequence) => {
      const active = microsequence;
      return count + ((active?.cards || []).length);
    }, 0),
    582
  );

  const fundamentosCards = fundamentosMicrosequences
    .flatMap((microsequence) => microsequence.cards || []);

  assert.equal(
    fundamentosCards.some((card) => JSON.stringify(card).includes("dataset_aula6_numpy_pandas.csv")),
    false
  );
  assert.equal(
    fundamentosCards.some((card) => JSON.stringify(card).includes("dataset_aula3_numpy_pandas.csv")),
    true
  );
  assert.equal(
    fundamentosCards.some((card) => JSON.stringify(card).includes("dataset_aula4_qualidade_inspecao.xlsx")),
    true
  );
  assert.equal(
    fundamentosCards.some((card) => JSON.stringify(card).includes("SparkSession.builder")),
    true
  );
  assert.equal(
    fundamentosCards.some((card) => JSON.stringify(card).includes("dataset_aula7_estatistica.csv")),
    true
  );
  assert.equal(
    fundamentosCards.some((card) => JSON.stringify(card).includes("dataset_aula8_eda.csv")),
    true
  );
  assert.equal(
    fundamentosCards.some((card) => JSON.stringify(card).includes("dataset_qualidade_problemas.xlsx")),
    false
  );
  assert.equal(
    fundamentosCards.some((card) => JSON.stringify(card).includes("gabarito_tipos_dados.xlsx")),
    false
  );
  assert.equal(
    fundamentosCards
      .filter((card) => card.resource === "composite")
      .every((card) => {
        const choiceBlocks = (card.blocks || []).filter((block) => block.kind === "choice");
        const hasNormalizedBlocks = (card.blocks || []).every((block) => block.kind && !("resource" in block));
        if (card.kind === "exercise" && card.exercise === "choice") {
          return (
            hasNormalizedBlocks &&
            choiceBlocks.length === 1 &&
            !("question" in card) &&
            !("options" in card) &&
            !("answer" in card)
          );
        }
        return (
          hasNormalizedBlocks &&
          !("question" in card) &&
          !("options" in card) &&
          !("answer" in card)
        );
      }),
    true
  );
  assert.equal(
    JSON.stringify(fundamentosCourse).match(/handoff|materializad|materializar/gi),
    null
  );
});

test("o popup de continuação não pode avançar o card que já o substituiu", () => {
  const source = fs.readFileSync(path.resolve(__dirname, "../../src/ui/lessonEditorApp.js"), "utf8");

  assert.match(source, /function isCurrentContinuePopupOpen\(/);
  assert.match(source, /function continueFromPopup\(event\)/);
  assert.match(source, /if \(!isCurrentContinuePopupOpen\(\)\) \{\s*return;/);
  assert.match(source, /data-action='continue-popup-next'.*continueFromPopup/);
  assert.match(source, /data-action='next-card'.*advanceToNextCard/);
  assert.doesNotMatch(source, /continuePopupAdvanceLocked|forwardCardAdvanceLocked/);
});

test("as fixtures de publicação não possuem wrappers executáveis em src/ui", () => {
  const seedWrapperFiles = fs
    .readdirSync(path.resolve(__dirname, "../../src/ui"))
    .filter((fileName) => /SeedCourse\.js$/u.test(fileName))
    .sort();

  assert.deepEqual(seedWrapperFiles, []);
});

test("o seed de Matemática para Informática mantém textos visíveis focados no conteúdo", () => {
  const project = createTeoriaDosGrafosProvaProjectDocument();
  const course = project.courses.find((item) => item.id === "course-matematica-para-informatica");

  assert.ok(course);
  assert.doesNotMatch(course.title, /prova|simulado/i);
  assert.doesNotMatch(course.goal, /prova|simulado/i);

  course.modules.forEach((moduleValue) => {
    assert.doesNotMatch(moduleValue.title, /prova|simulado/i);
    assert.doesNotMatch(moduleValue.guide?.goal || "", /prova|simulado/i);
    (moduleValue.lessons || []).forEach((lesson) => {
      assert.doesNotMatch(lesson.title, /prova|simulado/i);
      assert.doesNotMatch(lesson.guide?.goal || "", /prova|simulado/i);
      (lesson.microsequences || []).forEach((microsequence) => {
        assert.doesNotMatch(microsequence.title, /prova|simulado/i);
        assert.doesNotMatch(microsequence.goal || "", /prova|simulado/i);
      });
    });
  });
});

test("o seed de Fundamentos evita texto de bastidor e vocabulário proibido nos textos visíveis", () => {
  const course = getCatalogCourseFixture("fundamentos-ia-analise-dados-seed-course.json");

  assert.ok(course);

  const visibleTexts = [
    course.title,
    course.goal,
    ...course.modules.flatMap((moduleValue) => [
      moduleValue.title,
      moduleValue.guide?.goal,
      ...(moduleValue.lessons || []).flatMap((lesson) => [
        lesson.title,
        lesson.guide?.goal,
        ...(lesson.microsequences || []).flatMap((microsequence) => [
          microsequence.title,
          microsequence.goal,
          ...(microsequence.cards || []).flatMap((card) => [
              card.title,
              card.text,
              card.after,
              card.prompt,
              card.question,
              ...(card.options || []).flatMap((option) => [option.text, option.value]),
              ...(card.blocks || []).flatMap((block) => [block.value, block.prompt, block.question]),
              ...(card.afterBlocks || []).flatMap((block) => [block.value, block.prompt, block.question])
            ])
        ])
      ])
    ])
  ].filter((value) => typeof value === "string");

  const forbiddenPatterns = [
    /\bcurto\b|\bcurta\b/iu,
    /materializar/iu,
    /curso aprovado/iu,
    /no contexto da aula/iu,
    /^A leitura\b/iu,
    /\bassinatura\b/iu,
    /\bo aluno deve\b/iu
  ];

  visibleTexts.forEach((text) => {
    forbiddenPatterns.forEach((pattern) => {
      assert.doesNotMatch(text, pattern);
    });
  });
});

test("o seed de Fundamentos também remove texto de bastidor dos metadados internos", () => {
  const course = getCatalogCourseFixture("fundamentos-ia-analise-dados-seed-course.json");

  assert.ok(course);

  const forbiddenPatterns = [
    /\bcurto\b|\bcurta\b/iu,
    /materializar/iu,
    /curso aprovado/iu,
    /no contexto da aula/iu,
    /^A leitura\b/iu,
    /\bassinatura\b/iu,
    /\bo aluno deve\b/iu,
    /\bhandoff\b/iu,
    /prompt_builder/iu,
    /materializada/iu
  ];
  const hits = [];

  function walk(value, path = []) {
    if (typeof value === "string") {
      if (forbiddenPatterns.some((pattern) => pattern.test(value))) {
        hits.push({ path: path.join("."), value });
      }
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((item, index) => walk(item, [...path, index]));
      return;
    }
    if (value && typeof value === "object") {
      Object.entries(value).forEach(([key, nestedValue]) => {
        walk(nestedValue, [...path, key]);
      });
    }
  }

  walk(course);
  assert.deepEqual(hits, []);
});

test("exercícios de Fundamentos que dependem de contexto mostrado trazem esse contexto no próprio card", () => {
  const course = getCatalogCourseFixture("fundamentos-ia-analise-dados-seed-course.json");

  assert.ok(course);

  const cards = course.modules
    .flatMap((moduleValue) => moduleValue.lessons || [])
    .flatMap((lesson) => lesson.microsequences || [])
    .flatMap((microsequence) => microsequence.cards || []);
  const contextMarkers = [
    /\bobserve\b/iu,
    /\bcompare\b/iu,
    /\bquadro\b/iu,
    /\bregra mostrada\b/iu,
    /\bresumo mostrado\b/iu,
    /\bmostrad[ao]\b/iu
  ];
  const contextKinds = new Set(["code", "table", "graph", "flow", "matrix", "relation_map", "plane", "tree"]);

  function hasLocalContext(card) {
    if (contextKinds.has(card.resource)) {
      return true;
    }
    return (card.blocks || []).some((block) => contextKinds.has(block.kind) && block.kind !== "choice");
  }

  const cardsWithShownContext = cards.filter((card) => {
    if (card.kind !== "exercise") return false;
    const texts = [
      card.title,
      card.text,
      card.prompt,
      card.question,
      ...(card.blocks || []).flatMap((block) => [block.value, block.prompt, block.question])
    ].filter((value) => typeof value === "string");
    return texts.some((text) => contextMarkers.some((pattern) => pattern.test(text)));
  });

  assert.ok(cardsWithShownContext.length > 0);
  cardsWithShownContext.forEach((card) => {
    assert.equal(hasLocalContext(card), true, `card ${card.id} precisa materializar o contexto no próprio card`);
  });
});

test("cards de Fundamentos com resultados globais da base repetem o contexto no próprio card", () => {
  const course = getCatalogCourseFixture("fundamentos-ia-analise-dados-seed-course.json");

  assert.ok(course);

  const cards = course.modules
    .flatMap((moduleValue) => moduleValue.lessons || [])
    .flatMap((lesson) => lesson.microsequences || [])
    .flatMap((microsequence) => microsequence.cards || []);

  const targetIds = [
    "card-a03-09-media-verificavel",
    "card-a03-10-contagens-filtros",
    "card-a03-11-contagem-classificacao",
    "card-a03-12-contagem-setor",
    "card-a03-14-resultados-chave"
  ];

  targetIds.forEach((cardId) => {
    const card = cards.find((entry) => entry.id === cardId);
    assert.ok(card, `card ${cardId} ausente`);
    assert.equal(card.resource, "composite");
    const kinds = new Set((card.blocks || []).map((block) => block.kind));
    assert.ok(kinds.has("table"), `card ${cardId} deve repetir o quadro de contexto`);
    assert.ok(kinds.has("choice"), `card ${cardId} deve manter a decisão no próprio card`);
    assert.equal((card.blocks || []).every((block) => block.kind && !("resource" in block)), true);
  });
});

test("o seed de Fundamentos não mantém lacunas em after nem em afterBlocks", () => {
  const course = getCatalogCourseFixture("fundamentos-ia-analise-dados-seed-course.json");

  assert.ok(course);

  const cards = course.modules
    .flatMap((moduleValue) => moduleValue.lessons || [])
    .flatMap((lesson) => lesson.microsequences || [])
    .flatMap((microsequence) => microsequence.cards || []);

  cards.forEach((card) => {
    assert.equal(hasTextGapSyntax(card.after || ""), false, `${card.id}.after`);
    (card.afterBlocks || []).forEach((block, index) => {
      if (typeof block?.value === "string") {
        assert.equal(hasTextGapSyntax(block.value), false, `${card.id}.afterBlocks[${index}].value`);
      }
      if (typeof block?.code === "string") {
        assert.equal(hasTextGapSyntax(block.code), false, `${card.id}.afterBlocks[${index}].code`);
      }
    });
  });
});

test("cards de grafo que prometem subgrafo destacado no seed materializam esse destaque", () => {
  const project = createTeoriaDosGrafosProvaProjectDocument();
  const course = project.courses.find((item) => item.id === "course-matematica-para-informatica");

  assert.ok(course);

  const cards = course.modules
    .flatMap((moduleValue) => moduleValue.lessons || [])
    .flatMap((lesson) => lesson.microsequences || [])
    .flatMap((microsequence) => microsequence.cards || []);

  const highlightedGraphCards = cards.filter((card) => {
    if (card?.resource !== "graph") return false;
    const prompt = String(card?.prompt || "");
    return /destacad[oa]/i.test(prompt);
  });

  assert.ok(highlightedGraphCards.length > 0);

  highlightedGraphCards.forEach((card) => {
    const highlightedVertices = Array.isArray(card?.highlight?.vertices) ? card.highlight.vertices : [];
    const highlightedEdges = Array.isArray(card?.highlight?.edges) ? card.highlight.edges : [];
    assert.ok(
      highlightedVertices.length > 0 || highlightedEdges.length > 0,
      `o card ${card.id} promete destaque visual, mas não define highlight`
    );
  });
});

test("cards de sequência local em grafos materializam o recorte relevante no seed", () => {
  const project = createTeoriaDosGrafosProvaProjectDocument();
  const course = project.courses.find((item) => item.id === "course-matematica-para-informatica");

  assert.ok(course);

  const targetIds = new Set([
    "card-arestas-triangulo-03",
    "card-classifica-abcd-03",
    "card-classifica-abcd-a-04",
    "card-classifica-abca-05",
    "card-porque-trilha-03",
    "card-porque-caminho-05",
    "card-nao-bipartido-triangulo"
  ]);

  const found = new Map();
  const cards = course.modules
    .flatMap((moduleValue) => moduleValue.lessons || [])
    .flatMap((lesson) => lesson.microsequences || [])
    .flatMap((microsequence) => microsequence.cards || []);

  cards.forEach((card) => {
    if (targetIds.has(card?.id)) {
      found.set(card.id, card);
    }
  });

  assert.deepEqual([...found.keys()].sort(), [...targetIds].sort());

  found.forEach((card) => {
    const highlightedVertices = Array.isArray(card?.highlight?.vertices) ? card.highlight.vertices : [];
    const highlightedEdges = Array.isArray(card?.highlight?.edges) ? card.highlight.edges : [];
    assert.ok(
      highlightedVertices.length > 0 || highlightedEdges.length > 0,
      `o card ${card.id} deve materializar o recorte local discutido no enunciado`
    );
    assert.notEqual(card.prompt, "Observe o grafo mostrado.");
  });
});

test("cards de exercício com grafo no seed evitam prompts genéricos demais", () => {
  const project = createTeoriaDosGrafosProvaProjectDocument();
  const course = project.courses.find((item) => item.id === "course-matematica-para-informatica");

  assert.ok(course);

  const graphExerciseCards = course.modules
    .flatMap((moduleValue) => moduleValue.lessons || [])
    .flatMap((lesson) => lesson.microsequences || [])
    .flatMap((microsequence) => microsequence.cards || [])
    .filter((card) => card?.resource === "graph" && ["exercise", "practice", "review"].includes(String(card?.kind || "")));

  graphExerciseCards.forEach((card) => {
    const prompt = String(card?.prompt || "");
    assert.doesNotMatch(
      prompt,
      /^Observe o grafo mostrado\.$|^Observe o caminho mostrado\.$|^Observe o grafo construído\.$|mesmos vértices/iu,
      `o card ${card.id} ainda usa prompt genérico demais`
    );
  });
});

test("a síntese de vértices, arestas, graus e soma repete o grafo-base nos exercícios que dependem dele", () => {
  const project = createTeoriaDosGrafosProvaProjectDocument();
  const course = project.courses.find((item) => item.id === "course-matematica-para-informatica");

  assert.ok(course);

  const lesson = course.modules
    .flatMap((moduleValue) => moduleValue.lessons || [])
    .find((entry) => entry.title === "Síntese e integração dos tópicos");
  assert.ok(lesson);

  const micro = (lesson.microsequences || []).find((entry) => entry.id === "micro-revisao-fundamentos-graus-prova");
  assert.ok(micro);

  assert.ok((micro.cards || []).length);

  const requiredIds = [
    "card-contar-n-m",
    "card-grau-c",
    "card-lista-graus-ordenada",
    "card-vertices-impares",
    "card-erro-lista-sem-ordenar-revisao"
  ];

  requiredIds.forEach((cardId) => {
    const card = (micro.cards || []).find((entry) => entry.id === cardId);
    assert.ok(card, `card ${cardId} ausente`);
    assert.equal(card.resource, "composite");
    const graphBlock = (card.blocks || []).find((block) => block.kind === "graph");
    const choiceBlock = (card.blocks || []).find((block) => block.kind === "choice");
    assert.ok(graphBlock, `card ${cardId} deve repetir o grafo-base`);
    assert.ok(choiceBlock, `card ${cardId} deve manter o exercício de escolha`);
  });
});

test("microssequências anteriores repetem o grafo-base quando a prática depende dele", () => {
  const project = createTeoriaDosGrafosProvaProjectDocument();
  const course = project.courses.find((item) => item.id === "course-matematica-para-informatica");

  assert.ok(course);

  const expectedByMicro = new Map([
    [
      "micro-grafo-como-conjuntos",
      [
        "card-identificar-v",
        "card-identificar-a",
        "card-calcular-n",
        "card-calcular-m",
        "card-troca-vertices-arestas"
      ]
    ],
    [
      "micro-contagem-de-graus",
      [
        "card-lista-graus",
        "card-erro-contar-aresta-que-nao-toca",
        "card-erro-lista-sem-ordenar"
      ]
    ],
    [
      "micro-grafo-correspondente-matriz",
      [
        "card-quantidade-arestas-03",
        "card-tentativa-incorreta-grafo-07"
      ]
    ],
    [
      "micro-bipartido-pela-matriz",
      [
        "card-comprimento-triangulo-04",
        "card-justificativa-bipartido-06",
        "card-justificativa-inadequada-07"
      ]
    ],
    [
      "micro-ciclo-impar-pegadinha",
      [
        "card-comprimento-triangulo",
        "card-triangulo-nao-bipartido"
      ]
    ],
    [
      "micro-passeio-trilha-caminho-ciclo",
      [
        "card-comprimento-abcd-06",
        "card-erro-contar-vertices-07"
      ]
    ],
    [
      "micro-criterio-euleriano",
      [
        "card-graus-c4",
        "card-classificar-c4-euleriano",
        "card-circuito-c4",
        "card-erro-c4-ciclo"
      ]
    ],
    [
      "micro-criterio-semieuleriano",
      [
        "card-graus-p4",
        "card-impares-p4",
        "card-classificar-p4",
        "card-trilha-aberta-p4",
        "card-erro-p4-fechado"
      ]
    ],
    [
      "micro-nao-euleriano-por-muitos-impares",
      [
        "card-graus-estrela",
        "card-contar-impares-estrela",
        "card-classificar-estrela",
        "card-erro-quatro-impares",
        "card-erro-conexao-basta"
      ]
    ],
    [
      "micro-conexao-no-criterio-euler",
      [
        "card-identificar-desconexo",
        "card-graus-dois-triangulos",
        "card-conclusao-dois-triangulos",
        "card-erro-so-graus-pares"
      ]
    ],
    [
      "micro-duplicar-caminho-entre-impares",
      [
        "card-caminho-extremidades",
        "card-caminho-internos",
        "card-caminho-acrescimos",
        "card-caminho-internos-paridade",
        "card-caminho-impares-viram-pares"
      ]
    ],
    [
      "micro-eulerizar-caminho-p4",
      [
        "card-p4-graus-originais",
        "card-p4-impares",
        "card-p4-duplicacao-correta",
        "card-p4-conclusao-euleriano",
        "card-p4-erro-duplicar-ab"
      ]
    ],
    [
      "micro-eulerizar-estrela-k13",
      [
        "card-estrela-graus-originais",
        "card-estrela-contar-impares",
        "card-estrela-classificacao-original",
        "card-estrela-duplicacao-possivel",
        "card-estrela-final-pares",
        "card-estrela-erro-so-ab"
      ]
    ],
    [
      "micro-revisao-matriz-trilha-caminho-prova",
      [
        "card-revisao-bipartido-03",
        "card-revisao-justificativa-04"
      ]
    ]
  ]);

  const microById = new Map(
    course.modules
      .flatMap((moduleValue) => moduleValue.lessons || [])
      .flatMap((lesson) => lesson.microsequences || [])
      .map((micro) => [micro.id, micro])
  );

  expectedByMicro.forEach((cardIds, microId) => {
    const micro = microById.get(microId);
    assert.ok(micro, `microssequência ${microId} ausente`);

    assert.ok((micro.cards || []).length, `cards ausentes em ${microId}`);

    cardIds.forEach((cardId) => {
      const card = (micro.cards || []).find((entry) => entry.id === cardId);
      assert.ok(card, `card ${cardId} ausente em ${microId}`);
      assert.equal(card.resource, "composite");
      const kinds = new Set((card.blocks || []).map((block) => block.kind));
      assert.ok(kinds.has("graph"), `card ${cardId} deve repetir o grafo-base`);
      assert.ok(kinds.has("choice"), `card ${cardId} deve manter o exercício de escolha`);
    });
  });
});

test("o seed de Lógica de Programação evita linguagem editorial interna nos textos visíveis", () => {
  const course = loadCourseFixture("logica-programacao-seed-course.json");

  assert.ok(course);
  assert.doesNotMatch(course.title, /prova|simulado|professor|disciplina/i);
  assert.doesNotMatch(course.goal, /prova|simulado|professor|disciplina/i);

  course.modules.forEach((moduleValue) => {
    assert.doesNotMatch(moduleValue.title, /prova|simulado|professor|disciplina/i);
    assert.doesNotMatch(moduleValue.guide?.goal || "", /prova|simulado|professor|disciplina/i);
    (moduleValue.lessons || []).forEach((lesson) => {
      assert.doesNotMatch(lesson.title, /prova|simulado|professor|disciplina/i);
      assert.doesNotMatch(lesson.guide?.goal || "", /prova|simulado|professor|disciplina/i);
      (lesson.microsequences || []).forEach((microsequence) => {
        assert.doesNotMatch(microsequence.title, /prova|simulado|professor|disciplina/i);
        assert.doesNotMatch(microsequence.goal || "", /prova|simulado|professor|disciplina/i);
      });
    });
  });
});

test("o seed de Lógica de Programação preserva quebra de linha em cards de code e destaca sintaxe inline em paragraph", () => {
  const course = loadCourseFixture("logica-programacao-seed-course.json");

  assert.ok(course);

  const cards = course.modules
    .flatMap((moduleValue) => moduleValue.lessons || [])
    .flatMap((lesson) => lesson.microsequences || [])
    .flatMap((microsequence) => microsequence.cards || []);

  const codeCard = cards.find((card) => card.id === "card-m1-02-exemplo-completo");
  const paragraphCard = cards.find((card) => card.id === "card-m1-01-regra-esqueleto");

  assert.ok(codeCard);
  assert.ok(paragraphCard);
  assert.match(codeCard.code, /\n/);
  assert.match(codeCard.code, /printf\("Mensagem"\);/);
  assert.match(paragraphCard.text, /`main\(\)`/);
  assert.match(paragraphCard.text, /`int main\(\)`/);
});

test("o seed de Lógica de Programação preserva lacunas de code com case, operador lógico e colchete final", () => {
  const course = loadCourseFixture("logica-programacao-seed-course.json");

  assert.ok(course);

  const cards = course.modules
    .flatMap((moduleValue) => moduleValue.lessons || [])
    .flatMap((lesson) => lesson.microsequences || [])
    .flatMap((microsequence) => microsequence.cards || []);
  const menuCard = cards.find((card) => card.id === "card-menu-switch-02");
  const whileCard = cards.find((card) => card.id === "card-while-validacao-02");
  const vectorCard = cards.find((card) => card.id === "card-02-01-05-02");

  assert.ok(menuCard);
  assert.ok(whileCard);
  assert.ok(vectorCard);

  const menuToken = parseTextGapTokens(menuCard.code || "")[0];
  const whileToken = parseTextGapTokens(whileCard.code || "")[0];
  const vectorToken = parseTextGapTokens(vectorCard.code || "")[0];

  assert.equal(menuToken?.answer, "case 2:");
  assert.deepEqual(menuToken?.options, ["case 2:", "case 1:", "default:", "break;"]);
  assert.equal(whileToken?.answer, "nota < 0 || nota > 10");
  assert.deepEqual(
    whileToken?.options,
    ["nota < 0 || nota > 10", "nota >= 0 && nota <= 10", "nota == 10", "nota == 0"]
  );
  assert.equal(vectorToken?.answer, "v[i]");
  assert.deepEqual(vectorToken?.options, ["v[i]", "v", "v(i)", "v[5]"]);
});

test("o seed de Lógica de Programação mantém lacunas de code com fragmentos exatos de C, sem texto descritivo", () => {
  const course = loadCourseFixture("logica-programacao-seed-course.json");

  assert.ok(course);

  const cards = course.modules
    .flatMap((moduleValue) => moduleValue.lessons || [])
    .flatMap((lesson) => lesson.microsequences || [])
    .flatMap((microsequence) => microsequence.cards || []);
  const accessCard = cards.find((card) => card.id === "card-02-01-04-05");
  const restartCard = cards.find((card) => card.id === "card-02-03-01-05");
  const maxPositionCard = cards.find((card) => card.id === "card-02-03-04-03");
  const minPositionCard = cards.find((card) => card.id === "card-02-03-04-04");

  assert.ok(accessCard);
  assert.ok(restartCard);
  assert.ok(maxPositionCard);
  assert.ok(minPositionCard);

  const accessToken = parseTextGapTokens(accessCard.code || "")[0];
  const restartToken = parseTextGapTokens(restartCard.code || "")[0];
  const maxPositionToken = parseTextGapTokens(maxPositionCard.code || "")[0];
  const minPositionToken = parseTextGapTokens(minPositionCard.code || "")[0];

  assert.equal(accessToken?.answer, "v[i]");
  assert.deepEqual(accessToken?.options, ["v[i]", "v", "v[10]", "valor"]);
  assert.equal(restartToken?.answer, "soma = 0;");
  assert.deepEqual(restartToken?.options, ["soma = 0;", "soma = 1;", "soma = v[i];", "soma = i;"]);
  assert.equal(maxPositionToken?.answer, "i");
  assert.deepEqual(maxPositionToken?.options, ["i", "v[i]", "maior", "0"]);
  assert.equal(minPositionToken?.answer, "i");
  assert.deepEqual(minPositionToken?.options, ["i", "v[i]", "menor", "1"]);

  const accentedGapValues = cards
    .filter((card) => card.resource === "code" && card.exercise === "gap")
    .flatMap((card) =>
      parseTextGapTokens(card.code || "").flatMap((token) => [token.answer, ...token.options].filter((value) => /[À-ÿ]/u.test(value)))
    );

  assert.deepEqual(accentedGapValues, []);
});

test("o renderer do seed de Lógica de Programação materializa alternativas multiline de código como blocos", () => {
  const course = loadCourseFixture("logica-programacao-seed-course.json");

  assert.ok(course);

  const cards = course.modules
    .flatMap((moduleValue) => moduleValue.lessons || [])
    .flatMap((lesson) => lesson.microsequences || [])
    .flatMap((microsequence) => microsequence.cards || []);
  const codeChoiceCard = cards.find((card) => card.id === "card-m5-04-identificar-erro-getch-fora");

  assert.ok(codeChoiceCard);
  assert.equal((codeChoiceCard.options || []).every((option) => option.kind === "code"), true);

  const html = renderCardRuntimeBlocks(codeChoiceCard);
  assert.equal((html.match(/<pre class="multiple-choice-code">/g) || []).length, 4);
});

test("o seed de Lógica de Programação mantém sintaxe de C destacada e sem crases quebradas nos textos visíveis", () => {
  const course = loadCourseFixture("logica-programacao-seed-course.json");

  assert.ok(course);

  const issues = [];
  const inspect = (value, where) => {
    const text = String(value || "");
    const tickCount = (text.match(/`/g) || []).length;
    const stripped = text
      .replace(/`[^`]*`/g, "")
      .replace(/\[\[[\s\S]*?\]\]/g, "");

    if (tickCount % 2 === 1) {
      issues.push(`${where}: crase sem par`);
    }
    if (/`(?:int|float|char)\s+`/.test(text)) {
      issues.push(`${where}: declaração fragmentada`);
    }
    if (/`[A-Za-z_][A-Za-z0-9_]*\[[^\]]+\]`\[/.test(text)) {
      issues.push(`${where}: índice fragmentado`);
    }
    if (/`(?:void|int|float|char|double)`\s+[A-Za-z_][A-Za-z0-9_]*\(/u.test(text)) {
      issues.push(`${where}: assinatura fragmentada`);
    }
    if (/[A-Za-z_][A-Za-z0-9_]*\(`(?:&|int|float|char|double)/u.test(text)) {
      issues.push(`${where}: chamada fragmentada`);
    }
    if (/`&[A-Za-z_][A-Za-z0-9_]*`\(/u.test(text)) {
      issues.push(`${where}: endereço fragmentado`);
    }
    if (/\b(?:printf|scanf|getch|main|#include|puts|gets|strlen|strcmp|strcpy|strupr|int|float|char|struct|typedef)\b/.test(stripped)) {
      issues.push(`${where}: sintaxe sem destaque`);
    }
    if (/%(?:\.\d+)?[dfcs]/.test(stripped)) {
      issues.push(`${where}: formatador sem destaque`);
    }
  };

  course.modules.forEach((moduleValue) => {
    (moduleValue.lessons || []).forEach((lesson) => {
      (lesson.microsequences || []).forEach((microsequence) => {
        (microsequence.cards || []).forEach((card) => {
          ["text", "after", "prompt", "question"].forEach((field) => {
            if (typeof card?.[field] === "string") {
              inspect(card[field], `${card.id}.${field}`);
            }
          });
          (card.options || []).forEach((option, index) => {
            ["text", "value"].forEach((field) => {
              if (typeof option?.[field] === "string" && !option[field].includes("\n")) {
                inspect(option[field], `${card.id}.options[${index}].${field}`);
              }
            });
          });
        });
      });
    });
  });

  assert.deepEqual(issues, []);
});

test("o seed de Lógica de Programação corrige vícios recorrentes e fragmentos corrompidos nos cards revisados", () => {
  const course = loadCourseFixture("logica-programacao-seed-course.json");

  assert.ok(course);

  const cards = course.modules
    .flatMap((moduleValue) => moduleValue.lessons || [])
    .flatMap((lesson) => lesson.microsequences || [])
    .flatMap((microsequence) => microsequence.cards || []);

  const visibleTexts = cards.flatMap((card) => [
    card.title,
    card.text,
    card.after,
    card.prompt,
    card.question,
    ...(card.options || []).map((option) => option.text)
  ].filter((value) => typeof value === "string"));

  visibleTexts.forEach((text) => {
    assert.doesNotMatch(text, /\bprograma curto\b|\btrecho curto\b/iu);
    assert.doesNotMatch(text, /\bassinatura\b/iu);
    assert.doesNotMatch(text, /`(?:int|float|char|void)\s+(?:usa|com|pode|recebe|precisa|e)\b/u);
    assert.doesNotMatch(text, /`[A-Za-z_][A-Za-z0-9_]*\[[^\]]+\];`\[[^\]]+\];/u);
    assert.doesNotMatch(text, /ALUNO\.`|`&ALUNO\[[^\]]+\]`\./u);
    assert.doesNotMatch(text, /`&[A-Za-z_][A-Za-z0-9_]*(?:\[[^\]]+\])?\.`/u);
    assert.doesNotMatch(text, /`void n`ão/u);
  });

  const matrixDeclarationCard = cards.find((card) => card.id === "card-declarar-matriz-base");
  const menuFlowCard = cards.find((card) => card.id === "card-menu-switch-04");
  const matrixProgramCard = cards.find((card) => card.id === "card-printf-matriz-programa-curto");
  const menuFlowProjection = menuFlowCard ? deriveFlowchartProjectionFromStructure(menuFlowCard.structure) : null;
  const menuFlowLabels = (menuFlowProjection?.links || [])
    .map((link) => link.label)
    .filter(Boolean);

  assert.equal(matrixDeclarationCard?.text.includes("`int mat[3][4];`"), true);
  assert.equal(menuFlowCard?.structure?.items?.[1]?.kind, "switch_case");
  assert.deepEqual(menuFlowLabels, ["1", "2", "Outro caso"]);
  assert.equal(matrixProgramCard?.title, "Programa simples");
});

test("o seed de Lógica de Programação usa lacunas e opções de código válidas", () => {
  const course = loadCourseFixture("logica-programacao-seed-course.json");

  assert.ok(course);

  const cards = course.modules
    .flatMap((moduleValue) => moduleValue.lessons || [])
    .flatMap((lesson) => lesson.microsequences || [])
    .flatMap((microsequence) => microsequence.cards || []);

  assert.equal(
    cards.some((card) => card.resource === "code" && /_{3,}/.test(String(card.code || ""))),
    false
  );

  const gapCard = cards.find((card) => card.id === "card-m1-04-completar-getch");
  const codeChoiceCard = cards.find((card) => card.id === "card-programa-escolher-int-correto");
  const isMultilineCodeOption = (source) =>
    source.includes("\n") &&
    /#include|\b(?:main|printf|scanf|getch|for|if|while|switch)\s*\(|\b(?:do|case|default|struct|typedef)\b|[{};]/u.test(source);
  const mixedCodeChoiceCards = cards.filter((card) =>
    card.exercise === "choice" &&
    (card.options || []).some((option) => {
      const source = String(option?.code ?? option?.text ?? "");
      return isMultilineCodeOption(source);
    }) &&
    !(card.options || []).every((option) => {
      const source = String(option?.code ?? option?.text ?? "");
      if (!isMultilineCodeOption(source)) {
        return true;
      }
      return option.kind === "code";
    })
  );
  const printfReviewCard = cards.find((card) => card.id === "card-printf-texto-revisao");

  assert.equal(gapCard?.exercise, "gap");
  assert.match(gapCard?.code || "", /\[\[getch\(\);::getch\(\);\|/);
  assert.equal(codeChoiceCard?.resource, "choice");
  assert.equal(
    (codeChoiceCard?.options || []).every((option) => option.kind === "code" || typeof option.text === "string"),
    true
  );
  assert.equal(
    (codeChoiceCard?.options || []).some((option) => option.kind === "code"),
    true
  );
  assert.deepEqual(mixedCodeChoiceCards.map((card) => card.id), []);
  assert.match(printfReviewCard?.question || "", /`printf\("Aprovado"\);`/);
  assert.match(printfReviewCard?.after || "", /`Aprovado`/);
});

test("card estrutural da lição abre a microssequência com o ícone Play", () => {
  const project = getCatalogFixtureProject();
  const course = project.courses[0];
  const moduleValue = course.modules[0];
  const lesson = moduleValue.lessons[0];
  const microsequence = lesson.microsequences[0];
  microsequence.cards = [
    {
      id: "card-1",
      position: 1,
      resource: "paragraph",
      kind: "theory",
      exercise: "none",
      title: "Base",
      text: "Texto.",
      after: ""
    }
  ];
  microsequence.status = "generated";

  const html = renderLessonScreen({
    project,
    view: "lesson",
    selection: {
      courseKey: course.id,
      moduleKey: moduleValue.id,
      lessonKey: lesson.id,
      microsequenceKey: microsequence.id,
      cardKey: "card-1",
      cardIndex: 0
    },
    course,
    moduleValue,
    lesson,
    microsequence,
    cards: microsequence.cards,
    microsequenceMode: "play",
    editorSupport: {
      progress: createEmptyProgressDocument(),
      coursePermissions: {
        canAuthorContent: true,
        canEdit: true,
        canDelete: true
      },
      entityModes: { lesson: "view" }
    }
  });

  assert.match(html, /data-structure-target="microsequence"/u);
  assert.match(html, /class="card-progress-fill" style="width:0%"/u);
  assert.match(html, /aria-label="Progresso: 0\/1"/u);
  assert.match(html, /data-action="reset-entity-progress-direct"[^>]+data-structure-level="microsequence"/u);
  assert.match(html, /data-action="open-microsequence-overview"[^>]+title="Abrir microssequência"/u);
  assert.match(
    html,
    /data-action="open-microsequence-overview"[^>]*>[\s\S]*?<path d="M5\.2 3\.1l7\.1 4\.9-7\.1 4\.9z"/u
  );
  assert.doesNotMatch(html, /data-action="edit-entity-direct"|data-action="delete-entity-direct"/u);
  assert.doesNotMatch(html, /data-action="play-microsequence"/u);
});

test("overview da microssequência usa preenchimento visual sem fração redundante", () => {
  const project = getCatalogFixtureProject();
  const course = project.courses[0];
  const moduleValue = course.modules[0];
  const lesson = moduleValue.lessons[0];
  const microsequence = lesson.microsequences[0];
  microsequence.cards = [{
    id: "card-overview",
    position: 1,
    resource: "paragraph",
    kind: "theory",
    exercise: "none",
    title: "Base",
    text: "Texto.",
    after: ""
  }];
  microsequence.status = "generated";

  const html = renderLessonScreen({
    project,
    view: "microsequence",
    selection: {
      courseKey: course.id,
      moduleKey: moduleValue.id,
      lessonKey: lesson.id,
      microsequenceKey: microsequence.id,
      cardKey: "card-overview",
      cardIndex: 0
    },
    course,
    moduleValue,
    lesson,
    microsequence,
    cards: microsequence.cards,
    microsequenceMode: "overview",
    editorSupport: {
      progress: createEmptyProgressDocument(),
      coursePermissions: {
        canAuthorContent: true,
        canEdit: true,
        canDelete: true
      },
      entityModes: { microsequence: "view" }
    }
  });

  assert.match(html, /data-structure-target="card"/u);
  assert.doesNotMatch(html, /aria-label="Progresso: [01]\/1"/u);
  assert.doesNotMatch(html, /class="muted tiny progress-meta"/u);
  assert.match(html, /role="progressbar" aria-label="Conclusão do card"[^>]+aria-valuenow="0"[^>]+aria-valuetext="Card não concluído"/u);
  assert.match(html, /data-action="reset-entity-progress-direct"[^>]+data-structure-level="card"/u);
  assert.match(html, /data-action="open-microsequence-card"[^>]+data-card-index="0"/u);
  assert.doesNotMatch(html, /data-action="edit-entity-direct"|data-action="delete-entity-direct"/u);
  assert.doesNotMatch(html, /card-subtitle/u);
});

test("microssequências geradas com cards continuam na trilha principal da lição", () => {
  const project = getCatalogFixtureProject();
  const course = project.courses[0];
  const moduleValue = course.modules[0];
  const lesson = moduleValue.lessons[0];
  const microsequence = lesson.microsequences[0];
  microsequence.cards = [
    {
      id: "card-1",
      position: 1,
      resource: "paragraph",
      kind: "theory",
      exercise: "none",
      title: "Base",
      text: "Texto.",
      after: ""
    }
  ];
  microsequence.status = "generated";

  const html = renderLessonScreen({
    project,
    view: "lesson",
    selection: {
      courseKey: course.id,
      moduleKey: moduleValue.id,
      lessonKey: lesson.id,
      microsequenceKey: microsequence.id,
      cardKey: "card-1",
      cardIndex: 0
    },
    course,
    moduleValue,
    lesson,
    microsequence,
    cards: microsequence.cards,
    microsequenceMode: "play",
    editorSupport: { progress: createEmptyProgressDocument() }
  });

  assert.doesNotMatch(html, /Não há microssequências prontas para estudar aqui/);
  assert.doesNotMatch(html, /Em revisão/);
  assert.match(html, new RegExp(lesson.title));
});

test("curso selecionado abre a microssequência com autoria e assistência por API", () => {
  const project = getCatalogFixtureProject();
  const course = project.courses[0];
  const moduleValue = course.modules[0];
  const lesson = moduleValue.lessons[0];
  const microsequence = lesson.microsequences[0];
  microsequence.cards = [{
    id: "card-read-only",
    position: 1,
    resource: "paragraph",
    kind: "theory",
    exercise: "none",
    title: "Leitura",
    text: "Conteúdo para estudo.",
    after: ""
  }];
  microsequence.status = "generated";

  const renderWorkbench = (mode, composerOpen = false) => renderLessonScreen({
    project,
    view: "microsequence",
    selection: {
      courseKey: course.id,
      moduleKey: moduleValue.id,
      lessonKey: lesson.id,
      microsequenceKey: microsequence.id,
      cardKey: "card-read-only",
      cardIndex: 0
    },
    course,
    moduleValue,
    lesson,
    microsequence,
    cards: microsequence.cards,
    microsequenceMode: mode === "view" ? "play" : "assist",
    editorSupport: {
      progress: createEmptyProgressDocument(),
      coursePermissions: {
        canAuthorContent: true,
        canEdit: true,
        canDelete: true
      },
      entityModes: { card: mode },
      cardAssistanceState: {
        repairScope: "card",
        wholeCardSelected: true,
        selectedCardKeys: ["card-read-only"],
        resourceTargetIds: []
      },
      promptText: "Corrija o card.",
      cardAssistanceRequestReady: true,
      cardAssistanceComposerOpen: composerOpen
    }
  });
  const authoringHtml = renderWorkbench("ai");
  const openComposerHtml = renderWorkbench("ai", true);
  const readingHtml = renderWorkbench("view");

  assert.doesNotMatch(authoringHtml, /Disponível somente para estudo nesta conta/);
  assert.match(authoringHtml, /data-action="open-central"/);
  assert.doesNotMatch(authoringHtml, /data-action="open-microsequence-actions"/);
  assert.match(authoringHtml, /data-action="select-entity-mode"/);
  assert.doesNotMatch(authoringHtml, /data-action="select-workbench-pane"/);
  assert.match(authoringHtml, /data-action="toggle-card-assistance-composer"/);
  assert.doesNotMatch(authoringHtml, /data-field="assist-prompt"/);
  assert.match(openComposerHtml, /data-action="submit-card-assistance"/);
  assert.match(openComposerHtml, /data-field="assist-prompt"/);
  assert.match(readingHtml, /Conteúdo para estudo/);
  assert.doesNotMatch(readingHtml, /data-action="decorative-card-drag-handle"/);
  assert.doesNotMatch(readingHtml, /runtime-card-drag-handle/);
});

test("o leitor clampa a barra de progresso e protege títulos longos contra vazamento horizontal", () => {
  const project = getCatalogFixtureProject();
  const course = project.courses[0];
  const moduleValue = course.modules[0];
  const lesson = moduleValue.lessons[0];
  const microsequence = lesson.microsequences[0];
  microsequence.title = "Microssequência com um título extremamente longo para validar contenção horizontal no leitor móvel sem estourar a largura útil";
  microsequence.cards = [
    {
      id: "card-1",
      position: 1,
      resource: "paragraph",
      kind: "theory",
      exercise: "none",
      title: "Título de card muito grande para confirmar wrap e contenção horizontal dentro da superfície do leitor",
      text: "Texto.",
      after: ""
    }
  ];
  microsequence.status = "generated";

  renderLessonScreen({
    project,
    view: "lesson",
    selection: {
      courseKey: course.id,
      moduleKey: moduleValue.id,
      lessonKey: lesson.id,
      microsequenceKey: microsequence.id,
      cardKey: "card-1",
      cardIndex: 999
    },
    course,
    moduleValue,
    lesson,
    microsequence,
    cards: microsequence.cards,
    microsequenceMode: "play",
    editorSupport: { progress: createEmptyProgressDocument() }
  });

  const stylesPath = path.join(__dirname, "../../public/styles.css");
  const styles = fs.readFileSync(stylesPath, "utf8");
  const lessonScreenSource = fs.readFileSync(path.join(__dirname, "../../src/ui/renderLessonScreen.js"), "utf8");
  assert.match(lessonScreenSource, /function clampPercent\(value\)/);
  assert.match(lessonScreenSource, /const cardProgressPercent = clampPercent\(/);
  assert.match(styles, /\.study-reader-course-title\s*\{[\s\S]*width:\s*100%;[\s\S]*min-width:\s*0;[\s\S]*max-width:\s*100%;/);
  assert.match(styles, /\.runtime-card-title\s*\{[\s\S]*overflow-wrap:\s*anywhere;[\s\S]*word-break:\s*break-word;[\s\S]*white-space:\s*normal;/);
});
