import fs from "node:fs/promises";
import test from "node:test";
import assert from "node:assert/strict";

import { validateProjectDocument } from "../../src/domain/aralearnProject.js";
import {
  validateGraphResource,
  validateTreeResource
} from "../../src/generation/resources/cardResourceDefinitions.js";
import { contractToRelationalRows } from "../../src/persistence/contractToRelationalRows.js";
import { relationalRowsToContract } from "../../src/persistence/relationalRowsToContract.js";
import { validateRelationalCourse } from "../../src/persistence/validateRelationalCourse.js";
import { renderCardRuntimeBlocks } from "../../src/render/renderCardRuntime.js";

const visualFixtureUrl = new URL("../fixtures/package/project-visual.json", import.meta.url);

function graphCard(overrides = {}) {
  return {
    layout: "auto",
    position: 1,
    resource: "graph",
    kind: "theory",
    exercise: "none",
    title: "Dependências",
    prompt: "Observe as relações.",
    vertices: [
      { id: "origem", label: "Origem" },
      { id: "destino", label: "Destino" }
    ],
    edges: [
      { id: "edge-1", from: "origem", to: "destino", label: "causa", directed: true },
      { id: "edge-2", from: "destino", to: "origem", label: "associação", directed: false }
    ],
    after: "",
    ...overrides
  };
}

test("grafo rejeita geometria autoral e exige identidade estável de aresta", () => {
  assert.deepEqual(validateGraphResource(graphCard()), []);
  assert.deepEqual(validateGraphResource(graphCard({
    vertices: [{ id: "a", label: "A" }],
    edges: []
  })), []);

  assert.match(
    validateGraphResource(graphCard({
      vertices: [{ id: "a", label: "A", x: 101 }],
      edges: []
    })).join(" "),
    /geometria é calculada/
  );
  assert.match(
    validateGraphResource(graphCard({
      vertices: [{ id: "a", label: "A" }],
      edges: [{ id: "loop", from: "a", to: "a", directed: "sim" }]
    })).join(" "),
    /booleano/
  );
});

test("renderer calcula coordenadas e distingue arestas direcionadas", () => {
  const html = renderCardRuntimeBlocks(graphCard(), { blockKeyPrefix: "teste-grafo" });

  assert.match(html, /data-vertex-id="origem"[^>]*data-x="[0-9.]+"[^>]*data-y="[0-9.]+"/);
  assert.match(html, /data-vertex-id="destino"[^>]*data-x="[0-9.]+"[^>]*data-y="[0-9.]+"/);
  assert.match(html, /data-edge-key="edge-1" data-directed="true"[\s\S]*?marker-end="url\(#runtime-graph-arrow-/);
  assert.match(html, /data-edge-key="edge-2" data-directed="false"/);
  const undirectedGroup = html.match(/<g class="runtime-graph-edge-group[^>]*data-edge-key="edge-2"[\s\S]*?<\/g>/)?.[0] || "";
  assert.doesNotMatch(undirectedGroup, /marker-end=/);
  assert.match(html, /<desc>[^<]*Origem aponta para Destino, causa; Destino ligado a Origem, associação/);
  assert.match(html, /role="img" aria-label="[^"]*Grafo com 2 vértices e 2 arestas/);
});

test("renderer abrevia rótulos longos no desenho e os explica em legenda", () => {
  const html = renderCardRuntimeBlocks(graphCard({
    vertices: [
      { id: "norte-1", label: "Norte — computador 1" },
      { id: "norte-2", label: "Norte — computador 2" }
    ],
    edges: [
      { id: "ida", from: "norte-1", to: "norte-2", label: "enlace local" },
      { id: "volta", from: "norte-2", to: "norte-1", label: "enlace local" }
    ]
  }));
  const svg = html.match(/<svg class="runtime-graph-svg"[\s\S]*?<\/svg>/u)?.[0] || "";
  const legend = html.match(/<div class="runtime-graph-legend"[\s\S]*?<\/div>/u)?.[0] || "";
  const visibleSvgLabels = [...svg.matchAll(/<text[^>]*>([^<]*)<\/text>/gu)]
    .map((match) => match[1]);

  assert.equal(visibleSvgLabels.includes("Norte — computador 1"), false);
  assert.equal(visibleSvgLabels.includes("enlace local"), false);
  assert.match(svg, /runtime-graph-vertex-label[^>]*>V1<\/text>/u);
  assert.match(svg, /runtime-graph-vertex-label[^>]*>V2<\/text>/u);
  assert.equal((svg.match(/runtime-graph-edge-label/g) || []).length, 2);
  assert.match(legend, /is-vertex[^>]*[\s\S]*Norte — computador 1/u);
  assert.match(legend, /is-vertex[^>]*[\s\S]*Norte — computador 2/u);
  assert.equal((legend.match(/runtime-graph-legend-item is-edge/g) || []).length, 1);
  assert.match(legend, /is-edge[^>]*[\s\S]*enlace local/u);
});

test("descrições estruturais escapam conteúdo dinâmico", () => {
  const html = renderCardRuntimeBlocks(graphCard({
    prompt: "Relação <script>alert(1)</script>",
    vertices: [{ id: "a", label: "<img src=x onerror=alert(1)>" }],
    edges: []
  }));

  assert.doesNotMatch(html, /<script>|<img src=x/);
  assert.match(html, /&lt;script&gt;|&amp;lt;script&amp;gt;/);
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;|&amp;lt;img/);
});

test("árvore representa taxonomias com ramos, folhas e relações acessíveis", () => {
  const card = {
    variant: "taxonomy",
    position: 1,
    resource: "tree",
    kind: "theory",
    exercise: "none",
    title: "Taxonomia",
    prompt: "Classificação biológica.",
    nodes: [
      { id: "animalia", label: "Animalia", parentId: null },
      { id: "chordata", label: "Chordata", parentId: "animalia" },
      { id: "sapiens", label: "Homo sapiens", parentId: "chordata" },
      { id: "vazio", label: "Táxon sem descendentes", parentId: "animalia" }
    ],
    after: ""
  };
  assert.deepEqual(validateTreeResource(card), []);

  const html = renderCardRuntimeBlocks(card);
  assert.match(html, /role="tree" aria-label="[^"]*Homo sapiens, sob Chordata/);
  assert.match(html, /data-node-id="animalia" data-node-role="branch" role="treeitem" aria-level="1"/);
  assert.match(html, /data-node-id="sapiens" data-node-role="leaf" role="treeitem" aria-level="3"/);
  assert.match(html, /data-node-id="vazio" data-node-role="leaf"/);
  assert.match(html, /runtime-tree-node-chip">ramo<\/span>/);
  assert.match(html, /runtime-tree-node-chip">folha<\/span>/);
  assert.doesNotMatch(html, /runtime-tree-node-chip">(?:dir|file)<\/span>/);
});

test("árvore rejeita pais ausentes, folhas com filhos e ciclos", () => {
  const missingParent = validateTreeResource({
    variant: "hierarchy",
    nodes: [{ id: "filho", label: "Filho", parentId: "ausente" }]
  });
  assert.match(missingParent.join(" "), /pai inexistente/);

  const leafParent = validateTreeResource({
    variant: "filesystem",
    nodes: [
      { id: "folha", label: "Folha", parentId: null, entryType: "file" },
      { id: "filho", label: "Filho", parentId: "folha", entryType: "file" }
    ]
  });
  assert.match(leafParent.join(" "), /precisa ser um diretório/);

  const cycle = validateTreeResource({
    variant: "hierarchy",
    nodes: [
      { id: "a", label: "A", parentId: "b" },
      { id: "b", label: "B", parentId: "a" }
    ]
  });
  assert.match(cycle.join(" "), /contém um ciclo/);
});

test("round-trip relacional preserva directed verdadeiro, falso e omitido", async () => {
  const project = JSON.parse(await fs.readFile(visualFixtureUrl, "utf8"));
  const card = project.courses[0].modules[0].lessons[0].microsequences[0].cards[0];
  card.edges = [
    { id: "forward", from: "A", to: "B", directed: true },
    { id: "backward", from: "B", to: "A", directed: false },
    { id: "loop", from: "A", to: "A" }
  ];
  card.highlight = { vertices: ["A"], edges: ["forward"] };

  assert.equal(validateProjectDocument(project).ok, true);
  const rows = contractToRelationalRows(project);
  const graphEdges = rows.edges.filter((row) => row.edgeScope === "graph");
  assert.deepEqual(
    graphEdges.map((row) => [row.directed, row.hasDirected]),
    [[true, true], [false, true], [false, false]]
  );
  assert.equal(validateRelationalCourse(rows).ok, true);
  assert.deepEqual(relationalRowsToContract(rows), project);
});
