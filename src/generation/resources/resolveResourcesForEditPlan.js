import { getContractCardKind } from "../../contract/contractCard.js";
import { getResourceSchemas, listGenerationResourceDefinitions } from "./cardResourceDefinitions.js";

const CONTRACT_TO_RESOURCE = {
  say: "paragraph",
  ask: "multiple_choice",
  code: "code_editor",
  table: "table",
  flow: "flowchart",
  tree: "paragraph"
};

function uniqueKnown(items = [], knownIds = new Set()) {
  const seen = new Set();
  return (items || []).filter((item) => {
    if (!knownIds.has(item) || seen.has(item)) return false;
    seen.add(item);
    return true;
  });
}

export function inferResourceTypesFromCards(cards = []) {
  return uniqueKnown(
    (cards || []).map((card) => CONTRACT_TO_RESOURCE[getContractCardKind(card)] || "paragraph"),
    new Set(listGenerationResourceDefinitions().map((item) => item.id))
  );
}

export function resolveResourcesForEditPlan({
  currentCards = [],
  userSelectedExtraResourceTypes = [],
  validatedEditPlan = {},
  resourceCatalog = listGenerationResourceDefinitions()
}) {
  const knownIds = new Set(resourceCatalog.map((item) => item.id));
  const currentResourceTypes = uniqueKnown(inferResourceTypesFromCards(currentCards), knownIds);
  const requestedExtraResourceTypes = uniqueKnown(userSelectedExtraResourceTypes, knownIds).filter((item) => !currentResourceTypes.includes(item));
  const planRequiredResourceTypes = uniqueKnown(validatedEditPlan.requiredResourceTypes || [], knownIds).filter(
    (item) => !currentResourceTypes.includes(item) && !requestedExtraResourceTypes.includes(item)
  );
  const allowedResourceTypes = uniqueKnown([...currentResourceTypes, ...requestedExtraResourceTypes, ...planRequiredResourceTypes], knownIds);

  return {
    selectionMode: "edit_current_plus_requested",
    currentResourceTypes,
    requestedExtraResourceTypes,
    planRequiredResourceTypes,
    allowedResourceTypes,
    resourceSchemas: getResourceSchemas(allowedResourceTypes)
  };
}
