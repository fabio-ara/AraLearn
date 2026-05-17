import { getMicrosequenceCardCount } from "../types/microsequenceSizes.js";
import { getMicrosequenceType } from "../types/microsequenceTypes.js";
import { getResourceSchemas, listGenerationResourceDefinitions } from "../resources/cardResourceDefinitions.js";
import { resolveWeakModelRepresentationPolicy } from "./resourceRepresentationPolicy.js";

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

export function resolveResourcesForGenerationPlan({
  resolvedMicrosequenceTypeId,
  userSelectedExtraResourceTypes = [],
  planSelectedExtraResourceTypes = [],
  lessonAllowedResourceTypes = [],
  lessonGuidance = {},
  lessonSourceGuideStructured = {},
  modelCapabilities = {},
  resourceCatalog = listGenerationResourceDefinitions()
}) {
  const knownIds = new Set(resourceCatalog.map((item) => item.id));
  const type = getMicrosequenceType(resolvedMicrosequenceTypeId) || getMicrosequenceType("simple");
  const representationPolicy = resolveWeakModelRepresentationPolicy({
    lessonGuidance: {
      ...lessonGuidance,
      resourceTags: Array.isArray(lessonAllowedResourceTypes) && lessonAllowedResourceTypes.length
        ? lessonAllowedResourceTypes
        : lessonGuidance.resourceTags
    },
    lessonSourceGuideStructured,
    modelCapabilities,
    resolvedTypeId: type?.id || "simple",
    userSelectedExtraResourceTypes
  });

  const baseResourceTypes = uniqueKnown(type?.baseResourceTypes || [], knownIds).filter((resourceType) =>
    representationPolicy.safeAllowedResourceTypes.includes(resourceType)
  );
  const userExtraResourceTypes = uniqueKnown(userSelectedExtraResourceTypes, knownIds).filter((resourceType) =>
    representationPolicy.safeAllowedResourceTypes.includes(resourceType) && !baseResourceTypes.includes(resourceType)
  );
  const planExtraResourceTypes = uniqueKnown(planSelectedExtraResourceTypes, knownIds).filter((resourceType) =>
    representationPolicy.safeAllowedResourceTypes.includes(resourceType) &&
    !baseResourceTypes.includes(resourceType) &&
    !userExtraResourceTypes.includes(resourceType)
  );
  const allowedResourceTypes = uniqueKnown(
    [...baseResourceTypes, ...userExtraResourceTypes, ...planExtraResourceTypes],
    knownIds
  );

  return {
    selectionMode: "weak_model_policy",
    representationPolicy,
    baseResourceTypes,
    userExtraResourceTypes,
    planExtraResourceTypes,
    allowedResourceTypes,
    rejectedResourceTypes: representationPolicy.rejectedResourceTypes,
    resourceSchemas: getResourceSchemas(allowedResourceTypes)
  };
}

export function buildResourceSelectorState({
  resolvedMicrosequenceTypeId,
  userSelectedExtraResourceTypes = [],
  lessonGuidance = {},
  lessonSourceGuideStructured = {},
  modelCapabilities = {},
  resourceCatalog = listGenerationResourceDefinitions()
}) {
  const type = getMicrosequenceType(resolvedMicrosequenceTypeId) || getMicrosequenceType("assisted");
  const representationPolicy = resolveWeakModelRepresentationPolicy({
    lessonGuidance,
    lessonSourceGuideStructured,
    modelCapabilities,
    resolvedTypeId: type?.id || "simple",
    userSelectedExtraResourceTypes
  });
  const knownIds = new Set(resourceCatalog.map((resource) => resource.id));
  const base = new Set(
    uniqueKnown(type?.baseResourceTypes || [], knownIds).filter((resourceType) =>
      representationPolicy.safeAllowedResourceTypes.includes(resourceType)
    )
  );
  const extras = new Set(uniqueKnown(userSelectedExtraResourceTypes, knownIds));
  return resourceCatalog.map((resource) => {
    const decision = representationPolicy.resourceDecisions.find((item) => item.resourceType === resource.id);
    const policyAllowed = representationPolicy.safeAllowedResourceTypes.includes(resource.id);
    return {
      ...resource,
      selected: base.has(resource.id) || extras.has(resource.id),
      disabled: base.has(resource.id),
      allowed: policyAllowed,
      selectionKind: base.has(resource.id) ? "base" : extras.has(resource.id) ? "extra" : "available",
      policyReason: decision?.reason || ""
    };
  });
}

export function pickAllowedResourceSchemas(
  resourceEnvelope = {},
  { additionalResourceTypes = [], resourceCatalog = listGenerationResourceDefinitions() } = {}
) {
  const knownIds = new Set(resourceCatalog.map((item) => item.id));
  const allowed = uniqueKnown(
    [...(resourceEnvelope.allowedResourceTypes || []), ...additionalResourceTypes],
    knownIds
  );
  const declaredSchemas = resourceEnvelope.effectiveResourceSchemas || resourceEnvelope.resourceSchemas || {};
  const fallbackSchemas = getResourceSchemas(allowed);

  return Object.fromEntries(
    allowed.map((resourceType) => [resourceType, declaredSchemas[resourceType] || fallbackSchemas[resourceType]]).filter(([, schema]) => schema)
  );
}

export function buildMicrosequenceGenerationRepresentation({
  planningContract,
  validatedPlan,
  resourceCatalog = listGenerationResourceDefinitions()
}) {
  const plan = validatedPlan?.plan || validatedPlan || {};
  const type = getMicrosequenceType(plan.typeId);
  const cardCount = getMicrosequenceCardCount(plan.sizeId);
  const resourceEnvelope = resolveResourcesForGenerationPlan({
    resolvedMicrosequenceTypeId: plan.typeId,
    lessonAllowedResourceTypes: planningContract?.context?.lesson?.resourceTags || [],
    lessonGuidance: planningContract?.context?.lesson || {},
    lessonSourceGuideStructured: planningContract?.context?.lesson?.sourceGuideStructured || {},
    modelCapabilities: planningContract?.model?.capabilities || {},
    userSelectedExtraResourceTypes: planningContract?.request?.userSelectedExtraResourceTypes || [],
    planSelectedExtraResourceTypes: plan.selectedExtraResourceTypes,
    resourceCatalog
  });

  return {
    request: {
      typeId: plan.typeId,
      sizeId: plan.sizeId,
      cardCount
    },
    didacticPlan: {
      microsequenceGoal: plan.microsequenceGoal,
      typeId: plan.typeId,
      typeLabel: type?.label || plan.typeId,
      cardPlan: plan.cardPlan
    },
    resources: {
      ...resourceEnvelope,
      effectiveResourceSchemas: pickAllowedResourceSchemas(resourceEnvelope, { resourceCatalog })
    }
  };
}
