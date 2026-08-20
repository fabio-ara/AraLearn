import { academicProfile } from "../../sdk/academic.js";
import { stripPackageManualTextMarkersDeep } from "../../kernel/manualTextMarkers.js";
import {
  appendGraphvizForeignLabel,
  dotAttributes,
  dotQuote,
  graphvizGroupById,
  hasGraphvizGap,
  graphvizLayoutAttributes,
  plainGraphvizLabel,
  renderGraphvizSvg,
  unionGraphvizTextBounds
} from "../../sdk/graphviz.js";
import {
  escapePackageAttribute,
  renderPackageInline,
  renderPackageInlineReference,
  renderPackageProse
} from "../../sdk/html.js";

const LAYOUTS = Object.freeze(["auto", "force", "hierarchical", "circular", "radial"]);

function text(value) {
  return String(value ?? "").trim();
}

function graphName(value) {
  return text(value) || "G";
}

function edgeLabel(edge) {
  if (edge.label) return edge.label;
  return edge.weight === undefined ? "" : String(edge.weight);
}

function degreeByVertex(data) {
  const degree = new Map(data.vertices.map(({ id }) => [id, 0]));
  data.edges.forEach(({ from, to }) => {
    degree.set(from, (degree.get(from) || 0) + 1);
    degree.set(to, (degree.get(to) || 0) + 1);
  });
  return degree;
}

function graphvizEngine(data) {
  if (data.layout === "hierarchical") return "dot";
  if (data.layout === "circular") return "circo";
  if (data.layout === "radial") return "twopi";
  if (data.layout === "force") return "neato";
  if (data.directed) return "dot";
  const degrees = [...degreeByVertex(data).values()];
  if (data.vertices.length > 2 && data.edges.length === data.vertices.length && degrees.every((value) => value === 2)) return "circo";
  if (degrees.some((value) => value === data.vertices.length - 1)) return "twopi";
  return "neato";
}

function radialRoot(data) {
  const degree = degreeByVertex(data);
  return [...degree.entries()].sort((left, right) => right[1] - left[1])[0]?.[0] || data.vertices[0]?.id;
}

function graphAccessibleText(data) {
  const names = new Map(data.vertices.map(({ id, label }) => [id, label]));
  const connector = data.directed ? "leva a" : "liga-se a";
  const relations = data.edges.map((edge) => {
    const relation = edgeLabel(edge);
    return `${names.get(edge.from)} ${connector} ${names.get(edge.to)}${relation ? `, com ${relation}` : ""}`;
  });
  return [
    data.prompt,
    `${data.directed ? "Dígrafo" : "Grafo"} ${data.name}, com ${data.vertices.length} vértices e ${data.edges.length} arestas.`,
    `Vértices: ${data.vertices.map(({ label }) => label).join(", ")}.`,
    relations.length ? `Arestas: ${relations.join("; ")}.` : "Sem arestas."
  ].filter(Boolean).join(" ");
}

function edgeAccessibleText(data, edge) {
  const names = new Map(data.vertices.map(({ id, label }) => [id, label]));
  const relation = edgeLabel(edge);
  return `${names.get(edge.from)} ${data.directed ? "leva a" : "liga-se a"} ${names.get(edge.to)}${relation ? `, com ${relation}` : ""}.`;
}

function graphvizSource(data) {
  const engine = graphvizEngine(data);
  const operator = data.directed ? "->" : "--";
  const graphType = data.directed ? "digraph" : "graph";
  const graphAttributes = graphvizLayoutAttributes(engine === "dot" ? "block" : "free", {
    id: `graph-${data.name}`,
    bgcolor: "transparent",
    pad: "0.18",
    margin: "0",
    overlap: "false",
    splines: "true",
    outputorder: "edgesfirst",
    ...(engine === "dot" ? { nodesep: "0.48", ranksep: "0.58" } : {}),
    ...(engine === "twopi" ? { root: radialRoot(data), ranksep: "1.05" } : {})
  });
  const nodeLines = data.vertices.map((vertex) => `  ${dotQuote(vertex.id)} ${dotAttributes({
    id: `graph-vertex-${vertex.id}`,
    class: `package-math-graph-vertex${data.highlight?.vertices?.includes(vertex.id) ? " is-highlighted" : ""}`,
    label: plainGraphvizLabel(vertex.label),
    shape: "circle",
    width: "0.44",
    height: "0.44",
    margin: "0.07,0.04"
  })};`);
  const edgeLines = data.edges.map((edge) => `  ${dotQuote(edge.from)} ${operator} ${dotQuote(edge.to)} ${dotAttributes({
    id: `graph-edge-${edge.id}`,
    class: `package-math-graph-edge${data.highlight?.edges?.includes(edge.id) ? " is-highlighted" : ""}`,
    ...(edgeLabel(edge) ? { label: plainGraphvizLabel(edgeLabel(edge)) } : {}),
    ...(data.directed ? { arrowsize: "0.72" } : {})
  })};`);
  return {
    engine,
    source: [
      `${graphType} ${dotQuote(data.name)} {`,
      `  graph ${dotAttributes(graphAttributes)};`,
      "  node [fontname=\"Arial\", fontsize=\"16\", penwidth=\"1.15\", color=\"#64748b\", fontcolor=\"#111827\", style=\"solid\"];",
      "  edge [fontname=\"Arial\", fontsize=\"14\", penwidth=\"1.15\", color=\"#64748b\", fontcolor=\"#111827\"];",
      ...nodeLines,
      ...edgeLines,
      "}"
    ].join("\n")
  };
}

function labelTemplate(kind, id, value) {
  if (!value) return "";
  return `<template data-math-graph-${kind}-template="${escapePackageAttribute(id)}"><span class="package-math-graph-label-content">${renderPackageInline(value)}</span></template>`;
}

function renderGraphFigure(data) {
  const { engine, source } = graphvizSource(data);
  const templates = [
    ...data.vertices.map((vertex) => labelTemplate("vertex", vertex.id, vertex.label)),
    ...data.edges.filter((edge) => edgeLabel(edge)).map((edge) => labelTemplate("edge", edge.id, edgeLabel(edge)))
  ].join("");
  return `<figure class="package-math-graph" data-graphviz-engine="${engine}"><div class="package-math-graph-canvas" data-resource-scroll-frame="diagram" role="img" aria-label="${escapePackageAttribute(graphAccessibleText(data))}" aria-busy="true" tabindex="0" data-graphviz-source="${escapePackageAttribute(source)}"></div>${templates}<figcaption><i>${renderPackageInline(data.name)}</i> = (<i>V</i>, <i>E</i>) · |<i>V</i>| = ${data.vertices.length} · |<i>E</i>| = ${data.edges.length}</figcaption><p class="package-math-graph-layout-error" hidden>Não foi possível diagramar o grafo.</p><ol class="visually-hidden">${data.edges.map((edge) => `<li>${renderPackageInlineReference(edgeAccessibleText(data, edge))}</li>`).join("")}</ol></figure>`;
}

function vertexBounds(group) {
  const shape = group?.querySelector("ellipse, polygon, path");
  if (!shape) return null;
  const box = shape.getBBox();
  return { x: box.x + 4, y: box.y + 3, width: Math.max(1, box.width - 8), height: Math.max(1, box.height - 6) };
}

function replaceInteractiveLabels(figure, svg, data) {
  data.vertices.forEach((vertex) => {
    const group = graphvizGroupById(svg, `graph-vertex-${vertex.id}`);
    if (!group) return;
    group.dataset.graphVertexId = vertex.id;
    const template = figure.querySelector(`template[data-math-graph-vertex-template="${CSS.escape(vertex.id)}"]`);
    if (!hasGraphvizGap(vertex.label) &&
        !template?.content.querySelector("[data-package-manual-field-path]")) return;
    group.querySelectorAll("text").forEach((element) => { element.style.visibility = "hidden"; });
    appendGraphvizForeignLabel(group, template, vertexBounds(group), "package-math-graph-vertex-label");
  });
  data.edges.forEach((edge) => {
    const group = graphvizGroupById(svg, `graph-edge-${edge.id}`);
    if (!group) return;
    group.dataset.graphEdgeId = edge.id;
    const label = edgeLabel(edge);
    if (!label) return;
    const texts = [...group.querySelectorAll("text")];
    const bounds = unionGraphvizTextBounds(texts);
    const template = figure.querySelector(`template[data-math-graph-edge-template="${CSS.escape(edge.id)}"]`);
    const hasGap = hasGraphvizGap(label);
    if (!hasGap && !template?.content.querySelector("[data-package-manual-field-path]")) return;
    texts.forEach((element) => { element.style.visibility = "hidden"; });
    if (!bounds) return;
    appendGraphvizForeignLabel(group, template, hasGap ? {
      x: bounds.x - 8,
      y: bounds.y - 4,
      width: Math.max(54, bounds.width + 16),
      height: Math.max(26, bounds.height + 8)
    } : bounds, "package-math-graph-edge-label");
  });
}

async function hydrateGraph(figure) {
  const canvas = figure.querySelector(".package-math-graph-canvas");
  if (!canvas || canvas.dataset.graphvizStatus === "ready") return;
  try {
    const data = JSON.parse(decodeURIComponent(figure.dataset.graphData || ""));
    const svg = await renderGraphvizSvg(canvas, {
      source: canvas.dataset.graphvizSource,
      engine: figure.dataset.graphvizEngine,
      className: "package-math-graph-svg"
    });
    replaceInteractiveLabels(figure, svg, data);
    canvas.dataset.graphvizStatus = "ready";
    canvas.setAttribute("aria-busy", "false");
  } catch (error) {
    canvas.dataset.graphvizStatus = "error";
    canvas.setAttribute("aria-busy", "false");
    const message = figure.querySelector(".package-math-graph-layout-error");
    if (message) message.hidden = false;
    throw error;
  }
}

function editableTargets(data) {
  return [
    { path: "prompt", label: "Editar orientação" },
    { path: "name", label: "Editar símbolo do grafo" },
    ...data.vertices.map((_, index) => ({ path: `vertices[${index}].label`, label: `Editar rótulo do vértice ${index + 1}` })),
    ...data.edges.flatMap((edge, index) => edge.label ? [{ path: `edges[${index}].label`, label: `Editar rótulo da aresta ${index + 1}` }] : [])
  ];
}

export const graphPackage = Object.freeze({
  manifest: Object.freeze({
    id: "aralearn.resource.graph",
    version: "1.0.0",
    label: "Grafo matemático",
    purpose: "Representar grafos e dígrafos abstratos segundo a notação de teoria dos grafos.",
    slots: Object.freeze(["content", "feedback"]),
    taskOperations: Object.freeze(["inspect-adjacency", "trace-path", "identify-cycle", "compare-degree", "locate-bridge", "analyze-connectivity"]),
    academic: academicProfile({
      domains: ["teoria dos grafos", "algoritmos", "pesquisa operacional", "matemática discreta"],
      knowledgeObjects: ["grafo", "dígrafo", "vértice", "aresta", "caminho", "ciclo", "ponte", "componente"],
      conventions: ["vértices como círculos discretos", "arestas sem seta em grafos", "setas apenas em dígrafos", "pesos e rótulos associados à aresta", "layout calculado com redução de cruzamentos"],
      appropriateWhen: ["a topologia abstrata é o próprio objeto de estudo"],
      avoidWhen: ["os nós são componentes de software, equipamentos de rede, estados ou conceitos", "uma matriz de adjacência é mais adequada à tarefa"],
      technologies: ["Graphviz", "Viz.js WebAssembly", "SVG", "HTML semântico"],
      practiceModes: ["exposition", "gap", "typing", "selection"]
    }),
    responseCompatibility: Object.freeze(["aralearn.response.gap", "aralearn.response.choice"]),
    limitations: Object.freeze(["Diagramas nó-aresta densos devem ser divididos ou substituídos por representação matricial apropriada.", "A geometria é derivada e nunca autoral."]),
    accessibility: "Vértices, cardinalidades e arestas possuem descrição textual equivalente."
  }),
  authoringContract: Object.freeze({
    intent: "Declare o grafo abstrato; o renderer escolhe engine, posição, curvas e recorte das arestas nos vértices.",
    required: Object.freeze(["prompt", "name", "directed", "vertices", "edges"]),
    optional: Object.freeze(["layout", "highlight"]),
    fieldSemantics: Object.freeze({
      directed: "false produz grafo sem setas; true produz dígrafo com todas as arestas orientadas.",
      vertices: "Cada item é um vértice abstrato com identificador estrutural e rótulo matemático curto.",
      edges: "Cada item liga from a to; repetições formam arestas paralelas e from igual a to forma laço.",
      weight: "Peso escalar ou simbólico materializado junto da aresta.",
      layout: "Preferência semântica; auto escolhe pela estrutura, nunca por coordenadas."
    }),
    visualGrammar: Object.freeze(["Círculo = vértice.", "Linha sem ponta = aresta de grafo.", "Linha com ponta = arco de dígrafo.", "Texto junto da linha = rótulo ou peso da aresta.", "Cor de destaque não altera a classe matemática do objeto."]),
    rules: Object.freeze(["Use rótulos curtos e convencionais nos vértices; explicações pertencem ao prompt ou a paragraph.", "Não use graph para arquitetura, mapas conceituais, topologia física ou máquinas de estados.", "Não declare coordenadas, formas ou rotas.", "Divida a tarefa quando a densidade impedir leitura móvel.", "Não declare label e weight simultaneamente na mesma aresta."]),
    example: Object.freeze({
      prompt: "Observe os dois ciclos ligados por uma ponte e identifique os vértices de articulação.",
      name: "G",
      directed: false,
      layout: "auto",
      vertices: ["v1", "v2", "v3", "v4", "v5", "v6", "v7", "v8"].map((label) => ({ id: label, label })),
      edges: [
        { id: "e12", from: "v1", to: "v2" }, { id: "e23", from: "v2", to: "v3" }, { id: "e31", from: "v3", to: "v1" },
        { id: "bridge", from: "v3", to: "v4", label: "ponte" },
        { id: "e45", from: "v4", to: "v5" }, { id: "e56", from: "v5", to: "v6" }, { id: "e64", from: "v6", to: "v4" },
        { id: "e47", from: "v4", to: "v7" }, { id: "e78", from: "v7", to: "v8" }
      ],
      highlight: { vertices: ["v3", "v4"], edges: ["bridge"] }
    })
  }),
  schema: Object.freeze({
    type: "object",
    additionalProperties: false,
    required: ["prompt", "name", "directed", "vertices", "edges"],
    properties: {
      prompt: { type: "string", minLength: 1 },
      name: { type: "string", minLength: 1, maxLength: 12 },
      directed: { type: "boolean" },
      layout: { type: "string", enum: LAYOUTS },
      vertices: { type: "array", minItems: 1, maxItems: 24, items: { type: "object", additionalProperties: false, required: ["id", "label"], properties: { id: { type: "string", minLength: 1 }, label: { type: "string", minLength: 1, maxLength: 64 } } } },
      edges: { type: "array", maxItems: 60, items: { type: "object", additionalProperties: false, required: ["id", "from", "to"], properties: { id: { type: "string", minLength: 1 }, from: { type: "string", minLength: 1 }, to: { type: "string", minLength: 1 }, label: { type: "string", minLength: 1, maxLength: 120 }, weight: { anyOf: [{ type: "string", minLength: 1, maxLength: 48 }, { type: "number" }] } } } },
      highlight: { type: "object", additionalProperties: false, properties: { vertices: { type: "array", uniqueItems: true, items: { type: "string" } }, edges: { type: "array", uniqueItems: true, items: { type: "string" } } } }
    }
  }),
  normalize(data) {
    return {
      prompt: text(data?.prompt),
      name: graphName(data?.name),
      directed: Boolean(data?.directed),
      layout: LAYOUTS.includes(data?.layout) ? data.layout : "auto",
      vertices: (data?.vertices || []).map((vertex) => ({ id: text(vertex?.id), label: text(vertex?.label) })),
      edges: (data?.edges || []).map((edge) => ({ id: text(edge?.id), from: text(edge?.from), to: text(edge?.to), ...(text(edge?.label) ? { label: text(edge.label) } : {}), ...(edge?.weight !== undefined ? { weight: edge.weight } : {}) })),
      ...((data?.highlight?.vertices?.length || data?.highlight?.edges?.length) ? { highlight: { vertices: (data.highlight.vertices || []).map(text), edges: (data.highlight.edges || []).map(text) } } : {})
    };
  },
  validate(data) {
    const vertexIds = data.vertices.map(({ id }) => id);
    const edgeIds = data.edges.map(({ id }) => id);
    const vertices = new Set(vertexIds);
    const errors = [];
    if (vertices.size !== vertexIds.length) errors.push("Vértices precisam de ids únicos.");
    if (new Set(edgeIds).size !== edgeIds.length) errors.push("Arestas precisam de ids únicos.");
    if (data.edges.some(({ from, to }) => !vertices.has(from) || !vertices.has(to))) errors.push("Aresta referencia vértice inexistente.");
    if (data.edges.some((edge) => edge.label !== undefined && edge.weight !== undefined)) errors.push("Aresta declara label e weight simultaneamente.");
    if ((data.highlight?.vertices || []).some((id) => !vertices.has(id))) errors.push("Destaque referencia vértice inexistente.");
    if ((data.highlight?.edges || []).some((id) => !edgeIds.includes(id))) errors.push("Destaque referencia aresta inexistente.");
    return errors;
  },
  render(data) {
    const encodedData = encodeURIComponent(JSON.stringify(stripPackageManualTextMarkersDeep(data)));
    return `<div class="runtime-block runtime-graph-block">${renderPackageProse(data.prompt)}<div data-graph-data="${escapePackageAttribute(encodedData)}">${renderGraphFigure(data)}</div></div>`;
  },
  async hydrate(instanceRoot) {
    await Promise.all([...instanceRoot.querySelectorAll("[data-graph-data]")].map(async (host) => {
      const figure = host.querySelector(".package-math-graph");
      if (figure) {
        figure.dataset.graphData = host.dataset.graphData;
        await hydrateGraph(figure);
      }
    }));
  },
  accessibleText(data) { return graphAccessibleText(data); },
  editableTargets,
  practiceTargets(data) {
    return editableTargets(data)
      .filter(({ path }) => /^(?:vertices|edges)\[/u.test(path))
      .map((target) => ({ ...target, label: target.label.replace("Editar", "Lacuna em"), modes: ["gap", "typing"] }));
  }
});
