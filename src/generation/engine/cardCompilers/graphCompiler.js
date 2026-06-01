import { parsePipeList } from "../slotParser.js";

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

export function parseGraphVerticesSlot(value = "") {
  const source = text(value);
  const labels = source.includes("|")
    ? parsePipeList(source)
    : source.split(",").map((item) => text(item)).filter(Boolean);
  if (!labels.length) {
    throw new Error("grafo precisa de ao menos um vértice");
  }
  return labels;
}

export function parseGraphEdgesSlot(value = "", vertices = []) {
  const vertexSet = new Set((Array.isArray(vertices) ? vertices : []).map((item) => text(item)));
  const source = text(value);
  const rawEntries = source.includes("|")
    ? parsePipeList(source)
    : source.split(",").map((item) => text(item)).filter(Boolean);
  const edges = rawEntries.map((entry) => {
    const normalizedEntry = entry.includes(">") ? entry : entry.replace("-", ">");
    const [from, to] = normalizedEntry.split(">").map((item) => text(item));
    if (!from || !to) {
      throw new Error("aresta do grafo precisa usar from>to");
    }
    if (!vertexSet.has(from) || !vertexSet.has(to)) {
      throw new Error("aresta do grafo precisa apontar para vértices existentes");
    }
    return { from, to };
  });
  if (!edges.length) {
    throw new Error("grafo precisa de ao menos uma aresta");
  }
  return edges;
}

export function compileGraphCard({ slots = {}, position = 0 }) {
  const vertexLabels = parseGraphVerticesSlot(slots[3]);
  return {
    position,
    resource: "graph",
    kind: "exercise",
    exercise: "choice",
    title: text(slots[1]),
    prompt: text(slots[2]),
    vertices: vertexLabels.map((label) => ({ id: label, label })),
    edges: parseGraphEdgesSlot(slots[4], vertexLabels),
    question: text(slots[5]),
    options: [
      { id: "a", text: text(slots[6]) },
      { id: "b", text: text(slots[7]) },
      { id: "c", text: text(slots[8]) }
    ],
    answer: text(slots[9]).toLowerCase(),
    after: text(slots[10])
  };
}
