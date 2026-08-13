import {
  escapePackageAttribute,
  escapePackageHtml,
  renderPackageInline,
  renderPackageProse
} from "../../sdk/html.js";
import { academicProfile } from "../../sdk/academic.js";

const LAYOUTS = Object.freeze(["auto", "path", "cycle", "star", "hierarchical", "network", "causal"]);

function normalizeText(value) {
  return String(value ?? "").trim();
}

function wrapLabel(value, limit = 16) {
  const words = normalizeText(value).split(/\s+/u).filter(Boolean);
  const lines = [];
  let line = "";
  words.forEach((word) => {
    if (!line || `${line} ${word}`.length <= limit) line = line ? `${line} ${word}` : word;
    else {
      lines.push(line);
      line = word;
    }
  });
  if (line) lines.push(line);
  if (lines.length <= 3) return lines;
  return [...lines.slice(0, 2), `${lines.slice(2).join(" ").slice(0, limit - 1)}…`];
}

function nodePositions(vertices, layout) {
  const count = vertices.length;
  const width = 320;
  const columns = count <= 4 ? 2 : 3;
  if (["cycle", "star", "network"].includes(layout) && count <= 8) {
    const radius = count <= 5 ? 88 : 104;
    return vertices.map((vertex, index) => {
      if (layout === "star" && index === 0) return { id: vertex.id, x: 160, y: 128 };
      const ringCount = layout === "star" ? count - 1 : count;
      const ringIndex = layout === "star" ? index - 1 : index;
      const angle = ((Math.PI * 2 * ringIndex) / Math.max(1, ringCount)) - (Math.PI / 2);
      return { id: vertex.id, x: 160 + Math.cos(angle) * radius, y: 128 + Math.sin(angle) * radius };
    });
  }
  const rowCount = Math.ceil(count / columns);
  return vertices.map((vertex, index) => {
    const row = Math.floor(index / columns);
    const itemsInRow = Math.min(columns, count - row * columns);
    const column = index % columns;
    const effectiveGap = width / itemsInRow;
    return {
      id: vertex.id,
      x: effectiveGap * (column + 0.5),
      y: 48 + row * 78
    };
  }).map((position) => ({ ...position, height: 80 + rowCount * 78 }));
}

function inferredLayout(data) {
  if (data.layout && data.layout !== "auto") return data.layout;
  if (data.vertices.length > 8 || data.edges.length > 12) return "hierarchical";
  const degree = new Map(data.vertices.map(({ id }) => [id, 0]));
  data.edges.forEach(({ from, to }) => {
    degree.set(from, (degree.get(from) || 0) + 1);
    degree.set(to, (degree.get(to) || 0) + 1);
  });
  if ([...degree.values()].some((value) => value >= data.vertices.length - 1)) return "star";
  if (data.edges.length === data.vertices.length) return "cycle";
  if (data.edges.length <= Math.max(0, data.vertices.length - 1)) return "path";
  return "network";
}

function graphAccessibleText(data) {
  const names = new Map(data.vertices.map(({ id, label }) => [id, label]));
  const relations = data.edges.map((edge) => {
    const verb = edge.label || edge.weight || (edge.directed ? "leva a" : "se relaciona com");
    return `${names.get(edge.from)} ${verb} ${names.get(edge.to)}`;
  });
  return `${data.prompt} Vértices: ${data.vertices.map(({ label }) => label).join(", ")}. Relações: ${relations.join("; ")}.`;
}

function renderNode(vertex, position, highlighted) {
  const lines = wrapLabel(vertex.label);
  const y = position.y - ((lines.length - 1) * 8);
  return `<g class="package-graph-node${highlighted ? " is-highlighted" : ""}" data-graph-node="${escapePackageAttribute(vertex.id)}"><rect x="${position.x - 43}" y="${position.y - 25}" width="86" height="50" rx="12"/><text x="${position.x}" y="${y}" text-anchor="middle">${lines.map((line, index) => `<tspan x="${position.x}" dy="${index ? 16 : 0}">${escapePackageHtml(line)}</tspan>`).join("")}</text></g>`;
}

function renderEdge(edge, positions, highlighted) {
  const from = positions.get(edge.from);
  const to = positions.get(edge.to);
  if (!from || !to) return "";
  return `<g class="package-graph-edge${highlighted ? " is-highlighted" : ""}" data-graph-edge="${escapePackageAttribute(edge.id)}"><line x1="${from.x}" y1="${from.y}" x2="${to.x}" y2="${to.y}"${edge.directed ? " marker-end=\"url(#package-graph-arrow)\"" : ""}/></g>`;
}

export const graphPackage = Object.freeze({
  manifest: Object.freeze({
    id: "aralearn.resource.graph",
    version: "1.0.0",
    label: "Grafo",
    purpose: "Representar entidades e relações quando a topologia é parte do conceito ensinado.",
    slots: Object.freeze(["content", "feedback"]),
    cognitiveOperations: Object.freeze(["trace-relation", "inspect-topology", "compare-path", "identify-connectivity"]),
    academic: academicProfile({ domains: ["teoria dos grafos", "algoritmos", "pesquisa operacional"], knowledgeObjects: ["grafo", "vértice", "aresta", "caminho"], conventions: ["vértices e arestas distinguíveis", "direção e peso explícitos", "rótulo associado inequivocamente à aresta"], appropriateWhen: ["conectividade ou topologia abstrata é o próprio objeto estudado"], avoidWhen: ["os nós são equipamentos de rede com convenções próprias", "a relação é apenas hierárquica ou bipartida"], technologies: ["SVG", "layout determinístico derivado"], practiceModes: ["exposition", "gap", "typing", "selection"] }),
    responseCompatibility: Object.freeze(["aralearn.response.choice", "aralearn.response.gap"]),
    limitations: Object.freeze(["Relações densas são acompanhadas por lista semântica; não comprima muitas ideias em um único grafo.", "Coordenadas e dimensões não são autorais."]),
    accessibility: "Vértices e relações são integralmente repetidos em texto; rótulos de arestas ficam em uma lista legível."
  }),
  authoringContract: Object.freeze({
    intent: "Declare entidades e relações semanticamente; o package calcula geometria e decide quando priorizar a leitura textual.",
    required: Object.freeze(["prompt", "vertices", "edges"]),
    optional: Object.freeze(["layout", "highlight"]),
    rules: Object.freeze(["Todo from e to referencia um vértice existente.", "Rótulos expressam a relação, não códigos de legenda.", "Divida o conteúdo quando o grafo exigir mais de uma tarefa cognitiva central."]),
    example: Object.freeze({
      prompt: "Observe como a estação consulta o agente.",
      layout: "path",
      vertices: [{ id: "station", label: "Estação de gerência" }, { id: "agent", label: "Agente no dispositivo" }, { id: "object", label: "Objeto gerenciado" }],
      edges: [{ id: "request", from: "station", to: "agent", label: "envia solicitação", directed: true }, { id: "read", from: "agent", to: "object", label: "consulta", directed: true }]
    })
  }),
  schema: Object.freeze({
    type: "object",
    additionalProperties: false,
    required: ["prompt", "vertices", "edges"],
    properties: {
      prompt: { type: "string", minLength: 1 },
      layout: { type: "string", enum: LAYOUTS },
      vertices: { type: "array", minItems: 1, maxItems: 12, items: { type: "object", additionalProperties: false, required: ["id", "label"], properties: { id: { type: "string", minLength: 1 }, label: { type: "string", minLength: 1 } } } },
      edges: { type: "array", maxItems: 20, items: { type: "object", additionalProperties: false, required: ["id", "from", "to"], properties: { id: { type: "string", minLength: 1 }, from: { type: "string", minLength: 1 }, to: { type: "string", minLength: 1 }, label: { type: "string" }, weight: { anyOf: [{ type: "string" }, { type: "number" }] }, directed: { type: "boolean" } } } },
      highlight: { type: "object", additionalProperties: false, properties: { vertices: { type: "array", uniqueItems: true, items: { type: "string" } }, edges: { type: "array", uniqueItems: true, items: { type: "string" } } } }
    }
  }),
  normalize(data) {
    return {
      prompt: normalizeText(data?.prompt),
      layout: LAYOUTS.includes(data?.layout) ? data.layout : "auto",
      vertices: (data?.vertices || []).map((vertex) => ({ id: normalizeText(vertex?.id), label: normalizeText(vertex?.label) })),
      edges: (data?.edges || []).map((edge) => ({ id: normalizeText(edge?.id), from: normalizeText(edge?.from), to: normalizeText(edge?.to), ...(normalizeText(edge?.label) ? { label: normalizeText(edge.label) } : {}), ...(edge?.weight !== undefined ? { weight: edge.weight } : {}), directed: edge?.directed !== false })),
      ...((data?.highlight?.vertices?.length || data?.highlight?.edges?.length) ? { highlight: { vertices: (data.highlight.vertices || []).map(normalizeText), edges: (data.highlight.edges || []).map(normalizeText) } } : {})
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
    if ((data.highlight?.vertices || []).some((id) => !vertices.has(id))) errors.push("Destaque referencia vértice inexistente.");
    if ((data.highlight?.edges || []).some((id) => !edgeIds.includes(id))) errors.push("Destaque referencia aresta inexistente.");
    return errors;
  },
  render(data) {
    const layout = inferredLayout(data);
    const rawPositions = nodePositions(data.vertices, layout);
    const positions = new Map(rawPositions.map((position) => [position.id, position]));
    const height = Math.max(256, ...rawPositions.map(({ y }) => y + 42));
    const highlightedVertices = new Set(data.highlight?.vertices || []);
    const highlightedEdges = new Set(data.highlight?.edges || []);
    const names = new Map(data.vertices.map(({ id, label }) => [id, label]));
    return `<div class="runtime-block runtime-graph-block package-graph" data-layout="${layout}" data-density="${data.vertices.length > 8 || data.edges.length > 12 ? "high" : "normal"}">${renderPackageProse(data.prompt)}<svg viewBox="0 0 320 ${height}" role="img" aria-label="${escapePackageAttribute(graphAccessibleText(data))}"><defs><marker id="package-graph-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z"/></marker></defs>${data.edges.map((edge) => renderEdge(edge, positions, highlightedEdges.has(edge.id))).join("")}${data.vertices.map((vertex) => renderNode(vertex, positions.get(vertex.id), highlightedVertices.has(vertex.id))).join("")}</svg><ol class="package-graph-relations" aria-label="Relações do grafo">${data.edges.map((edge, index) => `<li><span class="package-graph-relation-number">${index + 1}</span><span><strong>${renderPackageInline(names.get(edge.from))}</strong> ${edge.directed ? "→" : "—"} <strong>${renderPackageInline(names.get(edge.to))}</strong>${edge.label || edge.weight ? `: ${renderPackageInline(edge.label || String(edge.weight))}` : ""}</span></li>`).join("")}</ol></div>`;
  },
  accessibleText(data) { return graphAccessibleText(data); },
  editableTargets(data) { return [{ path: "prompt", label: "Editar orientação" }, ...data.vertices.map((_, index) => ({ path: `vertices[${index}].label`, label: `Editar vértice ${index + 1}` })), ...data.edges.flatMap((edge, index) => edge.label ? [{ path: `edges[${index}].label`, label: `Editar relação ${index + 1}` }] : [])]; },
  practiceTargets(data) { return data.edges.flatMap((edge, index) => edge.label ? [{ path: `edges[${index}].label`, label: `Lacuna na relação ${index + 1}`, modes: ["gap", "typing"] }] : []); }
});
