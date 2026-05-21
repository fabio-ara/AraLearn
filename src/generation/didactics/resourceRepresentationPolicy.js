const BASE_SAFE_RESOURCE_TYPES = Object.freeze(["paragraph", "block_gap_fill", "multiple_choice"]);
const CAUTIOUS_RESOURCE_TYPES = Object.freeze(["table", "code_editor"]);
const ADVANCED_RESOURCE_TYPES = Object.freeze(["flowchart", "tree", "matrix", "plane", "graph"]);
const DEFAULT_SIZE_IDS = Object.freeze(["short", "medium", "long"]);
const REVIEW_SIZE_IDS = Object.freeze(["short", "medium"]);

const TYPE_RESOURCE_JUSTIFICATIONS = Object.freeze({
  assisted: ["paragraph", "block_gap_fill", "multiple_choice", "table", "code_editor"],
  simple: ["paragraph", "multiple_choice", "table"],
  concept: ["paragraph", "multiple_choice", "table", "matrix", "plane", "graph"],
  procedure: ["paragraph", "multiple_choice", "table", "code_editor", "flowchart", "tree"],
  guided_practice: ["paragraph", "block_gap_fill", "multiple_choice", "table", "code_editor"],
  comparison: ["paragraph", "multiple_choice", "table", "matrix", "graph"],
  review: ["paragraph", "block_gap_fill", "multiple_choice", "table"],
  common_mistake: ["paragraph", "multiple_choice", "table"],
  rule_or_policy: ["paragraph", "multiple_choice", "table", "flowchart"],
  code_or_command: ["paragraph", "block_gap_fill", "multiple_choice", "code_editor", "tree"]
});

const GENERIC_ADVANCED_RULES = Object.freeze({
  matrix: {
    representationNeeds: ["table", "formula", "sequence"],
    practiceModes: ["calculation", "classification"]
  },
  plane: {
    representationNeeds: ["visual_structure", "formula"],
    practiceModes: ["calculation", "variation"]
  },
  flowchart: {
    representationNeeds: ["sequence", "visual_structure"],
    practiceModes: ["execution", "correction"]
  },
  tree: {
    representationNeeds: ["visual_structure", "sequence"],
    practiceModes: ["classification", "execution"]
  },
  graph: {
    representationNeeds: ["visual_structure", "table"],
    practiceModes: ["classification", "variation", "calculation"]
  }
});

const TYPE_PRIORITY = Object.freeze([
  "guided_practice",
  "code_or_command",
  "procedure",
  "comparison",
  "review",
  "common_mistake",
  "concept",
  "simple"
]);

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function list(value) {
  return Array.isArray(value) ? value.map((item) => text(item)).filter(Boolean) : [];
}

function unique(items = []) {
  return [...new Set(items.filter(Boolean))];
}

function includesAny(values = [], candidates = []) {
  const set = new Set(values);
  return candidates.some((candidate) => set.has(candidate));
}

function typeSupportsResource(typeId, resourceType) {
  return (TYPE_RESOURCE_JUSTIFICATIONS[typeId] || []).includes(resourceType);
}

function resolveMetadata(lessonGuidance = {}) {
  return {
    didacticKind: text(lessonGuidance.didacticKind),
    practiceMode: text(lessonGuidance.practiceMode),
    representationNeed: text(lessonGuidance.representationNeed),
    coverageRole: text(lessonGuidance.coverageRole)
  };
}

function hasStrongResourceNeed(resourceType, { lessonGuidance = {}, resolvedTypeId = "" } = {}) {
  const rule = GENERIC_ADVANCED_RULES[resourceType];
  if (!rule) {
    return false;
  }
  const metadata = resolveMetadata(lessonGuidance);
  const courseSemantics = lessonGuidance?.courseSemantics || {};
  return (
    includesAny([metadata.representationNeed, text(courseSemantics?.primaryRepresentation), text(courseSemantics?.secondaryRepresentation)], rule.representationNeeds) ||
    includesAny([metadata.practiceMode, text(courseSemantics?.preferredPracticeMode)], rule.practiceModes) ||
    (resourceType === "graph" && ["comparison", "concept"].includes(text(resolvedTypeId))) ||
    (resourceType === "matrix" && ["comparison", "concept"].includes(text(resolvedTypeId)))
  );
}

function resolveAllowedTypeIds(lessonGuidance = {}) {
  const metadata = resolveMetadata(lessonGuidance);
  const allowed = ["simple", "concept", "procedure", "guided_practice", "comparison", "review", "common_mistake", "rule_or_policy", "code_or_command"];

  if (includesAny([metadata.practiceMode], ["guided_production", "execution", "construction", "variation"])) {
    allowed.unshift("guided_practice");
  }
  if (includesAny([metadata.practiceMode], ["execution"]) || metadata.representationNeed === "code") {
    allowed.unshift("code_or_command");
  }
  if (metadata.didacticKind === "procedure") {
    allowed.unshift("procedure");
  }
  if (includesAny([metadata.didacticKind, metadata.practiceMode], ["discrimination", "classification", "variation"])) {
    allowed.unshift("comparison");
  }
  if (metadata.coverageRole === "review") {
    allowed.unshift("review");
  }
  if (metadata.coverageRole === "repair_gap" || metadata.practiceMode === "correction") {
    allowed.unshift("common_mistake");
  }
  if (includesAny([metadata.didacticKind], ["concept", "formalization", "representation_reading", "cumulative_practice"])) {
    allowed.unshift("concept");
  }

  return TYPE_PRIORITY.filter((typeId) => unique(allowed).includes(typeId));
}

function resolveAllowedSizeIds(lessonGuidance = {}, modelCapabilities = {}) {
  const supportLevel = text(lessonGuidance.supportLevel);
  const maxCards = Math.max(1, Number(modelCapabilities.absoluteMaxCards || 8));
  const sizeIds = supportLevel === "quick_review" ? REVIEW_SIZE_IDS : DEFAULT_SIZE_IDS;
  const countBySize = { short: 3, medium: 5, long: 8 };
  const allowed = sizeIds.filter((sizeId) => (countBySize[sizeId] || 99) <= maxCards);
  return allowed.length ? allowed : ["short"];
}

function buildResourceDecision(resourceType, context) {
  const lessonResourceTags = list(context.lessonGuidance.resourceTags);
  const explicitlyAllowedByLesson = lessonResourceTags.includes(resourceType);
  const explicitlySelectedByUser = list(context.userSelectedExtraResourceTypes).includes(resourceType);
  const typeJustified = typeSupportsResource(context.resolvedTypeId, resourceType);
  const stronglyIndicated = hasStrongResourceNeed(resourceType, {
    lessonGuidance: context.lessonGuidance,
    resolvedTypeId: context.resolvedTypeId
  });
  const preferredResourceTypes = list(context.resourcePreferences?.preferredResourceTypes);
  const discouragedResourceTypes = list(context.resourcePreferences?.discouragedResourceTypes);
  const preferredByCourse = preferredResourceTypes.includes(resourceType);
  const discouragedByCourse = discouragedResourceTypes.includes(resourceType);

  if (BASE_SAFE_RESOURCE_TYPES.includes(resourceType)) {
    return {
      resourceType,
      allowed: explicitlyAllowedByLesson || BASE_SAFE_RESOURCE_TYPES.includes(resourceType),
      classification: "safe",
      preferred: preferredByCourse,
      reason: "recurso base seguro"
    };
  }

  if (CAUTIOUS_RESOURCE_TYPES.includes(resourceType)) {
    const cautiousAllowed = (explicitlyAllowedByLesson || preferredByCourse) && typeJustified && !discouragedByCourse;
    return {
      resourceType,
      allowed: cautiousAllowed,
      classification: "cautious",
      preferred: preferredByCourse,
      reason: cautiousAllowed ? "recurso cauteloso permitido" : "recurso cauteloso fora do envelope didático"
    };
  }

  const advancedAllowed =
    (explicitlyAllowedByLesson || preferredByCourse) &&
    typeJustified &&
    !discouragedByCourse &&
    (explicitlySelectedByUser || stronglyIndicated || preferredByCourse);
  return {
    resourceType,
    allowed: advancedAllowed,
    classification: "advanced",
    preferred: preferredByCourse,
    reason: advancedAllowed ? "recurso avançado liberado por necessidade didática genérica" : "recurso avançado bloqueado por padrão"
  };
}

export function resolveWeakModelRepresentationPolicy({
  lessonGuidance = {},
  lessonSourceGuideStructured = {},
  modelCapabilities = {},
  resolvedTypeId = "",
  userSelectedExtraResourceTypes = [],
  courseSemantics = {},
  resourcePreferences = {}
} = {}) {
  const mergedLessonGuidance = {
    ...lessonGuidance,
    courseSemantics: { ...(lessonGuidance?.courseSemantics || {}), ...courseSemantics }
  };
  const allowedTypeIds = resolveAllowedTypeIds(mergedLessonGuidance);
  const allowedSizeIds = resolveAllowedSizeIds(mergedLessonGuidance, modelCapabilities);
  const resourceDecisions = [
    ...BASE_SAFE_RESOURCE_TYPES,
    ...CAUTIOUS_RESOURCE_TYPES,
    ...ADVANCED_RESOURCE_TYPES
  ].map((resourceType) =>
    buildResourceDecision(resourceType, {
      lessonGuidance: mergedLessonGuidance,
      lessonSourceGuideStructured,
      userSelectedExtraResourceTypes,
      resolvedTypeId,
      courseSemantics,
      resourcePreferences
    })
  );

  return {
    policyId: "weakModelRepresentationPolicy",
    allowedTypeIds,
    allowedSizeIds,
    resourceDecisions,
    preferredResourceTypes: resourceDecisions.filter((item) => item.allowed && item.preferred).map((item) => item.resourceType),
    safeAllowedResourceTypes: resourceDecisions.filter((item) => item.allowed).map((item) => item.resourceType),
    rejectedResourceTypes: resourceDecisions.filter((item) => !item.allowed).map((item) => item.resourceType),
    baseSafeResourceTypes: [...BASE_SAFE_RESOURCE_TYPES],
    cautiousResourceTypes: [...CAUTIOUS_RESOURCE_TYPES],
    advancedResourceTypes: [...ADVANCED_RESOURCE_TYPES]
  };
}

export function assertUserSelectedResourcesAllowed({
  lessonGuidance = {},
  lessonSourceGuideStructured = {},
  modelCapabilities = {},
  resolvedTypeId = "",
  userSelectedExtraResourceTypes = []
} = {}) {
  const policy = resolveWeakModelRepresentationPolicy({
    lessonGuidance,
    lessonSourceGuideStructured,
    modelCapabilities,
    resolvedTypeId,
    userSelectedExtraResourceTypes
  });
  const invalid = list(userSelectedExtraResourceTypes).filter(
    (resourceType) => !policy.safeAllowedResourceTypes.includes(resourceType)
  );
  if (!invalid.length) {
    return { ok: true, policy };
  }
  return {
    ok: false,
    policy,
    errors: invalid.map((resourceType) => {
      const decision = policy.resourceDecisions.find((item) => item.resourceType === resourceType);
      return `Recurso extra não permitido pela lição atual: ${resourceType}. ${decision?.reason || ""}`.trim();
    })
  };
}
