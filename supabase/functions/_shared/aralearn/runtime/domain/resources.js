export const RESOURCE_TYPES = Object.freeze([
  "paragraph",
  "choice",
  "composite",
  "code",
  "table",
  "flow",
  "tree",
  "graph",
  "relation_map",
  "matrix",
  "plane",
  "formula"
]);

export const RESOURCE_LABELS = Object.freeze({
  paragraph: "Parágrafo",
  choice: "Escolha",
  composite: "Composto",
  code: "Código",
  table: "Tabela",
  flow: "Fluxo",
  tree: "Árvore",
  graph: "Grafo",
  relation_map: "Mapa de relações",
  matrix: "Matriz",
  plane: "Plano",
  formula: "Fórmula"
});

export const COMPOSITE_BLOCK_TYPES = Object.freeze([
  "heading",
  ...RESOURCE_TYPES.filter((resource) => resource !== "composite")
]);

export const COMPOSITE_BLOCK_LABELS = Object.freeze({
  heading: "Título",
  ...RESOURCE_LABELS
});

export function isSupportedResourceType(value) {
  return RESOURCE_TYPES.includes(String(value || "").trim());
}

export function isSupportedCompositeBlockType(value) {
  return COMPOSITE_BLOCK_TYPES.includes(String(value || "").trim());
}

export function listSupportedResourceTypes() {
  return [...RESOURCE_TYPES];
}

export function getResourceLabel(value, fallback = "Recurso") {
  const resource = String(value || "").trim();
  return RESOURCE_LABELS[resource] || fallback;
}

export function getCompositeBlockLabel(value, fallback = "Bloco") {
  const kind = String(value || "").trim();
  return COMPOSITE_BLOCK_LABELS[kind] || fallback;
}
