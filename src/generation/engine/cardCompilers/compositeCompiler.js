import { parseGraphEdgesSlot, parseGraphVerticesSlot } from "./graphCompiler.js";

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function buildGraphBlock(title = "", verticesSlot = "", edgesSlot = "") {
  const vertexLabels = parseGraphVerticesSlot(verticesSlot);
  return {
    title: text(title),
    block: {
      kind: "graph",
      prompt: text(title) ? `Observe ${text(title)}.` : "Observe o grafo.",
      vertices: vertexLabels.map((label) => ({ id: label, label })),
      edges: parseGraphEdgesSlot(edgesSlot, vertexLabels)
    }
  };
}

export function compileCompositeCard({ slots = {}, position = 0 }) {
  const graph1 = buildGraphBlock(slots[3], slots[4], slots[5]);
  const graph2 = buildGraphBlock(slots[6], slots[7], slots[8]);
  return {
    position,
    resource: "composite",
    kind: "exercise",
    exercise: "choice",
    title: text(slots[1]),
    blocks: [
      {
        kind: "paragraph",
        value: text(slots[2])
      },
      {
        kind: "heading",
        value: graph1.title || "G1"
      },
      graph1.block,
      {
        kind: "heading",
        value: graph2.title || "G2"
      },
      graph2.block,
      {
        kind: "choice",
        question: text(slots[9]),
        options: [
          { id: "a", text: text(slots[10]) },
          { id: "b", text: text(slots[11]) },
          { id: "c", text: text(slots[12]) }
        ],
        answer: text(slots[13]).toLowerCase()
      }
    ],
    after: text(slots[14])
  };
}
