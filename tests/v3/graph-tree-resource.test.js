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

const visualFixtureUrl = new URL("../fixtures/v3/project-visual.json", import.meta.url);

function graphCard(overrides = {}) {
  return {
    position: 1,
    resource: "graph",
    kind: "theory",
    exercise: "none",
    title: "Dependências",
    prompt: "Observe as relações.",
    vertices: [
      { id: "origem", label: "Origem", x: 18, y: 27 },
      { id: "destino", label: "Destino", x: 82 }
    ],
    edges: [
      { from: "origem", to: "destino", label: "causa", directed: true },
      { from: "destino", to: "origem", label: "associação", directed: false }
    ],
    after: "",
    ...overrides
  };
}

test("grafo valida coordenadas e direção opcionais sem mudar a forma anterior", () => {
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
    /entre 0 e 100/
  );
  assert.match(
    validateGraphResource(graphCard({
      vertices: [{ id: "a", label: "A" }],
      edges: [{ from: "a", to: "a", directed: "sim" }]
    })).join(" "),
    /booleano/
  );
});

test("renderer preserva coordenadas persistidas e distingue arestas direcionadas", () => {
  const html = renderCardRuntimeBlocks(graphCard(), { blockKeyPrefix: "teste-grafo" });

  assert.match(html, /data-vertex-id="origem"[^>]*data-x="18"[^>]*data-y="27"/);
  assert.match(html, /data-vertex-id="destino"[^>]*data-x="82"[^>]*data-y="[0-9.]+"/);
  assert.match(html, /data-edge-key="origem::destino" data-directed="true"[\s\S]*?marker-end="url\(#runtime-graph-arrow-/);
  assert.match(html, /data-edge-key="destino::origem" data-directed="false"/);
  const undirectedGroup = html.match(/<g class="runtime-graph-edge-group[^>]*data-edge-key="destino::origem"[\s\S]*?<\/g>/)?.[0] || "";
  assert.doesNotMatch(undirectedGroup, /marker-end=/);
  assert.match(html, /<desc>[^<]*Origem aponta para Destino, causa; Destino ligado a Origem, associação/);
  assert.match(html, /role="img" aria-label="[^"]*Grafo com 2 vértices e 2 arestas/);
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
    position: 1,
    resource: "tree",
    kind: "theory",
    exercise: "none",
    title: "Taxonomia",
    prompt: "Classificação biológica.",
    nodes: [
      { id: "animalia", label: "Animalia", parentId: null, type: "folder" },
      { id: "chordata", label: "Chordata", parentId: "animalia", type: "folder" },
      { id: "sapiens", label: "Homo sapiens", parentId: "chordata", type: "file" },
      { id: "vazio", label: "Táxon sem descendentes", parentId: null, type: "folder" }
    ],
    after: ""
  };
  assert.deepEqual(validateTreeResource(card), []);

  const html = renderCardRuntimeBlocks(card);
  assert.match(html, /role="tree" aria-label="[^"]*Homo sapiens, sob Chordata/);
  assert.match(html, /data-node-id="animalia" data-node-role="branch" role="treeitem" aria-level="1"/);
  assert.match(html, /data-node-id="sapiens" data-node-role="leaf" role="treeitem" aria-level="3"/);
  assert.match(html, /data-node-id="vazio" data-node-role="branch"/);
  assert.match(html, /runtime-tree-node-chip">ramo<\/span>/);
  assert.match(html, /runtime-tree-node-chip">folha<\/span>/);
  assert.doesNotMatch(html, /runtime-tree-node-chip">(?:dir|file)<\/span>/);
});

test("árvore rejeita pais ausentes, folhas com filhos e ciclos", () => {
  const missingParent = validateTreeResource({
    nodes: [{ id: "filho", label: "Filho", parentId: "ausente", type: "file" }]
  });
  assert.match(missingParent.join(" "), /pai inexistente/);

  const leafParent = validateTreeResource({
    nodes: [
      { id: "folha", label: "Folha", parentId: null, type: "file" },
      { id: "filho", label: "Filho", parentId: "folha", type: "file" }
    ]
  });
  assert.match(leafParent.join(" "), /precisa ser um ramo/);

  const cycle = validateTreeResource({
    nodes: [
      { id: "a", label: "A", parentId: "b", type: "folder" },
      { id: "b", label: "B", parentId: "a", type: "folder" }
    ]
  });
  assert.match(cycle.join(" "), /contém um ciclo/);
});

test("round-trip relacional preserva directed verdadeiro, falso e omitido", async () => {
  const project = JSON.parse(await fs.readFile(visualFixtureUrl, "utf8"));
  const card = project.courses[0].modules[0].lessons[0].microsequences[0].cards[0];
  card.edges = [
    { from: "A", to: "B", directed: true },
    { from: "B", to: "A", directed: false },
    { from: "A", to: "A" }
  ];
  card.highlight = { vertices: ["A"], edges: [["A", "B"]] };

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
