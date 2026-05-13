import { getMicrosequenceType } from "../types/microsequenceTypes.js";
import { getResourceSchemas, listGenerationResourceDefinitions } from "./cardResourceDefinitions.js";
import { resolveWeakModelModePolicy } from "../policies/weakModelPolicy.js";

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
  const policy = resolveWeakModelModePolicy({
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
    policy.safeAllowedResourceTypes.includes(resourceType)
  );
  const userExtraResourceTypes = uniqueKnown(userSelectedExtraResourceTypes, knownIds).filter((resourceType) =>
    policy.safeAllowedResourceTypes.includes(resourceType) && !baseResourceTypes.includes(resourceType)
  );
  const planExtraResourceTypes = uniqueKnown(planSelectedExtraResourceTypes, knownIds).filter((resourceType) =>
    policy.safeAllowedResourceTypes.includes(resourceType) &&
    !baseResourceTypes.includes(resourceType) &&
    !userExtraResourceTypes.includes(resourceType)
  );
  const allowedResourceTypes = uniqueKnown(
    [...baseResourceTypes, ...userExtraResourceTypes, ...planExtraResourceTypes],
    knownIds
  );

  return {
    selectionMode: "weak_model_policy",
    policy,
    baseResourceTypes,
    userExtraResourceTypes,
    planExtraResourceTypes,
    allowedResourceTypes,
    rejectedResourceTypes: policy.rejectedResourceTypes,
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
  const policy = resolveWeakModelModePolicy({
    lessonGuidance,
    lessonSourceGuideStructured,
    modelCapabilities,
    resolvedTypeId: type?.id || "simple",
    userSelectedExtraResourceTypes
  });
  const base = new Set(
    uniqueKnown(type?.baseResourceTypes || [], new Set(resourceCatalog.map((resource) => resource.id))).filter((resourceType) =>
      policy.safeAllowedResourceTypes.includes(resourceType)
    )
  );
  const extras = new Set(uniqueKnown(userSelectedExtraResourceTypes, new Set(resourceCatalog.map((resource) => resource.id))));
  return resourceCatalog.map((resource) => {
    const decision = policy.resourceDecisions.find((item) => item.resourceType === resource.id);
    const policyAllowed = policy.safeAllowedResourceTypes.includes(resource.id);
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
