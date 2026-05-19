export const RESOURCE_TYPES = Object.freeze([
  "say",
  "table",
  "code",
  "flow",
  "tree",
  "graph",
  "block_gap_fill"
]);

export function isSupportedResourceType(value) {
  return RESOURCE_TYPES.includes(String(value || "").trim());
}

export function listSupportedResourceTypes() {
  return [...RESOURCE_TYPES];
}

