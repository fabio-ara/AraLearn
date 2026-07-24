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

export function isSupportedResourceType(value) {
  return RESOURCE_TYPES.includes(String(value || "").trim());
}

export function listSupportedResourceTypes() {
  return [...RESOURCE_TYPES];
}
