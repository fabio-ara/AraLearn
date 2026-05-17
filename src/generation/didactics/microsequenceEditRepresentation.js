import { getContractCardKind } from "../../contract/contractCard.js";
import {
  getResourceSchemas,
  listCardResourceSummaries,
  listGenerationResourceDefinitions
} from "../resources/cardResourceDefinitions.js";

const CONTRACT_TO_RESOURCE = Object.freeze({
  say: "paragraph",
  ask: "multiple_choice",
  code: "code_editor",
  table: "table",
  flow: "flowchart",
  tree: "tree"
});

function uniqueKnown(items = [], knownIds = new Set()) {
  const seen = new Set();
  return (items || [])
    .map((item) => String(item || "").trim())
    .filter((item) => {
      if (!knownIds.has(item) || seen.has(item)) {
        return false;
      }
      seen.add(item);
      return true;
    });
}

export function inferResourceTypesFromCards(cards = [], resourceCatalog = listGenerationResourceDefinitions()) {
  return uniqueKnown(
    (cards || []).map((card) => CONTRACT_TO_RESOURCE[getContractCardKind(card)] || "paragraph"),
    new Set(resourceCatalog.map((item) => item.id))
  );
}

export function pickAllowedResourceSchemas(
  resourceEnvelope = {},
  { additionalResourceTypes = [], resourceCatalog = listGenerationResourceDefinitions() } = {}
) {
  const knownIds = new Set(resourceCatalog.map((item) => item.id));
  const allowedResourceTypes = uniqueKnown(
    [...(resourceEnvelope.allowedResourceTypes || []), ...additionalResourceTypes],
    knownIds
  );
  const declaredSchemas = resourceEnvelope.effectiveResourceSchemas || resourceEnvelope.resourceSchemas || {};
  const fallbackSchemas = getResourceSchemas(allowedResourceTypes);

  return Object.fromEntries(
    allowedResourceTypes
      .map((resourceType) => [resourceType, declaredSchemas[resourceType] || fallbackSchemas[resourceType]])
      .filter(([, schema]) => schema)
  );
}

export function buildMicrosequenceEditPlanningRepresentation({
  currentCards = [],
  lessonAllowedResourceTypes = [],
  userSelectedExtraResourceTypes = [],
  resourceCatalog = listGenerationResourceDefinitions()
}) {
  const knownIds = new Set(resourceCatalog.map((item) => item.id));
  const currentResourceTypes = inferResourceTypesFromCards(currentCards, resourceCatalog);
  const lessonResourceTypes = uniqueKnown(lessonAllowedResourceTypes, knownIds);
  const requestedExtraResourceTypes = uniqueKnown(userSelectedExtraResourceTypes, knownIds).filter(
    (resourceType) => !currentResourceTypes.includes(resourceType)
  );
  const allowedResourceTypes = uniqueKnown(
    [...currentResourceTypes, ...lessonResourceTypes, ...requestedExtraResourceTypes],
    knownIds
  );

  return {
    selectionMode: "edit_lesson_governed",
    currentResourceTypes,
    lessonResourceTypes,
    requestedExtraResourceTypes,
    allowedResourceTypes,
    availableResources: listCardResourceSummaries().filter((item) => allowedResourceTypes.includes(item.id))
  };
}

export function resolveResourcesForEditPlan({
  currentCards = [],
  lessonAllowedResourceTypes = [],
  userSelectedExtraResourceTypes = [],
  validatedEditPlan = {},
  resourceCatalog = listGenerationResourceDefinitions()
}) {
  const planningRepresentation = buildMicrosequenceEditPlanningRepresentation({
    currentCards,
    lessonAllowedResourceTypes,
    userSelectedExtraResourceTypes,
    resourceCatalog
  });
  const knownIds = new Set(resourceCatalog.map((item) => item.id));
  const planRequiredResourceTypes = uniqueKnown(validatedEditPlan.requiredResourceTypes || [], knownIds).filter(
    (resourceType) =>
      !planningRepresentation.currentResourceTypes.includes(resourceType) &&
      !planningRepresentation.requestedExtraResourceTypes.includes(resourceType)
  );
  const allowedResourceTypes = uniqueKnown(
    [...planningRepresentation.allowedResourceTypes, ...planRequiredResourceTypes],
    knownIds
  );
  const resourceEnvelope = {
    ...planningRepresentation,
    selectionMode: "edit_current_plus_requested",
    planRequiredResourceTypes,
    allowedResourceTypes
  };

  return {
    ...resourceEnvelope,
    resourceSchemas: getResourceSchemas(allowedResourceTypes),
    effectiveResourceSchemas: pickAllowedResourceSchemas(resourceEnvelope, { resourceCatalog })
  };
}
