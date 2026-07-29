import { getCardResourceDefinition, listGenerationResourceDefinitions } from "../resources/cardResourceDefinitions.js";

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function resourceIdOf(value) {
  if (typeof value === "string") {
    return text(value);
  }
  if (value && typeof value === "object") {
    return text(value.id);
  }
  return "";
}

function unique(items = []) {
  return [...new Set((Array.isArray(items) ? items : []).map((item) => text(item)).filter(Boolean))];
}

function schemaFields(resourceId) {
  const definition = getCardResourceDefinition(resourceId);
  return Object.keys(definition?.schema?.properties || {});
}

function catalogIds(resourceCatalog = listGenerationResourceDefinitions()) {
  return new Set(resourceCatalog.map((item) => item.id));
}

function keepCatalogResources(values = [], resourceCatalog = listGenerationResourceDefinitions()) {
  const known = catalogIds(resourceCatalog);
  return [...new Set((Array.isArray(values) ? values : []).map((item) => resourceIdOf(item)).filter((item) => known.has(item)))];
}

export function resolveAllowedResourceTypes({
  availableResources = [],
  requestExtraResources = [],
  planExtraResources = [],
  preferredResource = "",
  resourceCatalog = listGenerationResourceDefinitions()
} = {}) {
  const declared = keepCatalogResources(availableResources, resourceCatalog);
  const explicit = keepCatalogResources(
    [...requestExtraResources, ...planExtraResources, text(preferredResource)],
    resourceCatalog
  );
  if (declared.length) {
    return unique([...declared, ...explicit.filter((item) => declared.includes(item))]);
  }
  return unique([...resourceCatalog.map((item) => item.id), ...explicit]);
}

export function resolveResourceSchemasForCardPlan(cardPlan = [], resourceCatalog = listGenerationResourceDefinitions()) {
  const resources = keepCatalogResources(
    (Array.isArray(cardPlan) ? cardPlan : []).map((item) => item?.resource),
    resourceCatalog
  );
  return Object.fromEntries(resources.map((resourceId) => [resourceId, schemaFields(resourceId)]));
}

export function buildMicrosequenceGenerationRepresentation({ planningContract, validatedPlan }) {
  const plan = validatedPlan?.plan || validatedPlan || {};
  const didacticPlan = Array.isArray(plan.didacticPlan) ? plan.didacticPlan : [];
  const cardPlan = Array.isArray(plan.cardPlan) ? plan.cardPlan : [];
  const allowedResourceTypes = resolveAllowedResourceTypes({
    availableResources: planningContract?.availableResources || [],
    requestExtraResources: planningContract?.request?.extraResources || [],
    planExtraResources: plan.extraResources,
    preferredResource: planningContract?.request?.preferredResource
  });
  return {
    request: {
      type: plan.type,
      size: plan.size,
      cardCount: cardPlan.length || didacticPlan.length || 0
    },
    planning: {
      goal: text(plan.goal),
      didacticItems: didacticPlan,
      cardPlan
    },
    resources: {
      allowedResourceTypes,
      effectiveResourceSchemas: resolveResourceSchemasForCardPlan(cardPlan)
    }
  };
}
