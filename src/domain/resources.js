import {
  listCompositeBlockLabels,
  listCompositeBlockTypes,
  listResourceIds,
  listResourceLabels
} from "../resources/registry/index.js";

export const RESOURCE_TYPES = Object.freeze(listResourceIds());

export const RESOURCE_LABELS = Object.freeze(listResourceLabels());

export const COMPOSITE_BLOCK_TYPES = Object.freeze(listCompositeBlockTypes());

export const COMPOSITE_BLOCK_LABELS = Object.freeze(listCompositeBlockLabels());

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
