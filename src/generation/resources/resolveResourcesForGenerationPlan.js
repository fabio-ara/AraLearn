import { getMicrosequenceType } from "../types/microsequenceTypes.js";
import { getResourceSchemas, listGenerationResourceDefinitions } from "./cardResourceDefinitions.js";

function uniqueKnown(items = [], knownIds = new Set()) {
  const seen = new Set();
  return (items || []).filter((item) => {
    if (!knownIds.has(item) || seen.has(item)) return false;
    seen.add(item);
    return true;
  });
}

export function resolveResourcesForGenerationPlan({
  resolvedMicrosequenceTypeId,
  userSelectedExtraResourceTypes = [],
  planSelectedExtraResourceTypes = [],
  resourceCatalog = listGenerationResourceDefinitions()
}) {
  const knownIds = new Set(resourceCatalog.map((item) => item.id));
  const type = getMicrosequenceType(resolvedMicrosequenceTypeId) || getMicrosequenceType("simple");
  const baseResourceTypes = uniqueKnown(type?.baseResourceTypes || [], knownIds);
  const userExtraResourceTypes = uniqueKnown(userSelectedExtraResourceTypes, knownIds).filter((item) => !baseResourceTypes.includes(item));
  const planExtraResourceTypes = uniqueKnown(planSelectedExtraResourceTypes, knownIds).filter(
    (item) => !baseResourceTypes.includes(item) && !userExtraResourceTypes.includes(item)
  );
  const allowedResourceTypes = uniqueKnown([...baseResourceTypes, ...userExtraResourceTypes, ...planExtraResourceTypes], knownIds);

  return {
    selectionMode: "type_default_plus_user_extra_plus_plan_extra",
    baseResourceTypes,
    userExtraResourceTypes,
    planExtraResourceTypes,
    allowedResourceTypes,
    resourceSchemas: getResourceSchemas(allowedResourceTypes)
  };
}

export function buildResourceSelectorState({ resolvedMicrosequenceTypeId, userSelectedExtraResourceTypes = [], resourceCatalog = listGenerationResourceDefinitions() }) {
  const type = getMicrosequenceType(resolvedMicrosequenceTypeId) || getMicrosequenceType("assisted");
  const base = new Set(type?.id === "assisted" ? [] : type?.baseResourceTypes || []);
  const extras = new Set(userSelectedExtraResourceTypes);
  return resourceCatalog.map((resource) => ({
    ...resource,
    selected: base.has(resource.id) || extras.has(resource.id),
    disabled: base.has(resource.id),
    selectionKind: base.has(resource.id) ? "base" : extras.has(resource.id) ? "extra" : "available"
  }));
}
