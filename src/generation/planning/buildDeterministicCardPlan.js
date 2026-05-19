import { listGenerationResourceDefinitions } from "../resources/cardResourceDefinitions.js";
import { getMicrosequenceSize } from "../types/microsequenceSizes.js";
import { getMicrosequenceType } from "../types/microsequenceTypes.js";
import { resolveResourcesForGenerationPlan } from "../didactics/microsequenceGenerationRepresentation.js";

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function splitSourceRefsAcrossPlan(sourceUsePlan = [], cardCount = 0) {
  const sourceIds = (Array.isArray(sourceUsePlan) ? sourceUsePlan : [])
    .map((item) => normalizeText(item?.sourceId))
    .filter(Boolean);
  if (sourceIds.length === 1) {
    return Array.from({ length: cardCount }, () => [sourceIds[0]]);
  }
  return Array.from({ length: cardCount }, () => []);
}

function pickPreferredResource(
  preferredResources = [],
  allowedResourceTypes = [],
  prioritizedResourceTypes = [],
  fallbackResourceType = "paragraph"
) {
  const allowed = new Set(allowedResourceTypes);
  const prioritized = preferredResources.find(
    (resourceType) => prioritizedResourceTypes.includes(resourceType) && allowed.has(resourceType)
  );
  return (
    prioritized ||
    preferredResources.find((resourceType) => allowed.has(resourceType)) ||
    (allowed.has(fallbackResourceType) ? fallbackResourceType : allowedResourceTypes[0] || fallbackResourceType)
  );
}

export function buildDeterministicCardPlan({
  typeId,
  sizeId,
  selectedExtraResourceTypes = [],
  userSelectedExtraResourceTypes = [],
  lessonAllowedResourceTypes = [],
  lessonGuidance = {},
  lessonSourceGuideStructured = {},
  modelCapabilities = {},
  sourceUsePlan = [],
  resourceCatalog = listGenerationResourceDefinitions()
}) {
  const type = getMicrosequenceType(typeId) || getMicrosequenceType("simple");
  const size = getMicrosequenceSize(sizeId) || getMicrosequenceSize("short");
  const planItems = type?.cardPlansBySize?.[size?.id] || type?.cardPlansBySize?.short || [];
  const resources = resolveResourcesForGenerationPlan({
    resolvedMicrosequenceTypeId: type?.id || "simple",
    userSelectedExtraResourceTypes,
    planSelectedExtraResourceTypes: selectedExtraResourceTypes,
    lessonAllowedResourceTypes,
    lessonGuidance,
    lessonSourceGuideStructured,
    modelCapabilities,
    resourceCatalog
  });
  const distributedSourceRefs = splitSourceRefsAcrossPlan(sourceUsePlan, size.cardCount);
  const prioritizedResourceTypes = [...userSelectedExtraResourceTypes, ...selectedExtraResourceTypes];

  return planItems.slice(0, size.cardCount).map((item, index) => ({
    position: index + 1,
    role: normalizeText(item?.roleId) || `card_${index + 1}`,
    label: normalizeText(item?.label) || `Card ${index + 1}`,
    resourceType: pickPreferredResource(item?.preferredResources || [], resources.allowedResourceTypes, prioritizedResourceTypes),
    sourceRefs: distributedSourceRefs[index] || []
  }));
}
