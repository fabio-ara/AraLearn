import { listGenerationResourceDefinitions } from "../resources/cardResourceDefinitions.js";
import { getMicrosequenceSize } from "../types/microsequenceSizes.js";
import { getMicrosequenceType } from "../types/microsequenceTypes.js";

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function uniqueKnown(items = [], knownIds = new Set()) {
  const seen = new Set();
  return (items || []).map(normalizeText).filter((item) => {
    if (!knownIds.has(item) || seen.has(item)) return false;
    seen.add(item);
    return true;
  });
}

function pickPreferredResource(preferredResources = [], availableResources = []) {
  const available = new Set(availableResources);
  return preferredResources.find((resourceType) => available.has(resourceType)) || (available.has("paragraph") ? "paragraph" : availableResources[0] || "paragraph");
}

export function buildDeterministicCardPlan({
  typeId,
  sizeId,
  selectedExtraResourceTypes = [],
  userSelectedExtraResourceTypes = [],
  resourceCatalog = listGenerationResourceDefinitions()
}) {
  const knownIds = new Set(resourceCatalog.map((item) => item.id));
  const type = getMicrosequenceType(typeId) || getMicrosequenceType("simple");
  const size = getMicrosequenceSize(sizeId) || getMicrosequenceSize("short");
  const planItems = type?.cardPlansBySize?.[size?.id] || type?.cardPlansBySize?.short || [];
  const baseResourceTypes = uniqueKnown(type?.baseResourceTypes || [], knownIds);
  const extras = uniqueKnown([...userSelectedExtraResourceTypes, ...selectedExtraResourceTypes], knownIds);
  const availableResources = uniqueKnown(["paragraph", ...baseResourceTypes, ...extras, "multiple_choice"], knownIds);

  return planItems.slice(0, size.cardCount).map((item, index) => ({
    position: index + 1,
    role: normalizeText(item?.roleId) || `card_${index + 1}`,
    label: normalizeText(item?.label) || `Card ${index + 1}`,
    resourceType: pickPreferredResource(item?.preferredResources || [], availableResources),
    sourceRefs: []
  }));
}
