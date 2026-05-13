const BASE_SAFE_RESOURCE_TYPES = Object.freeze(["paragraph", "block_gap_fill", "multiple_choice"]);
const CAUTIOUS_RESOURCE_TYPES = Object.freeze(["table", "code_editor"]);
const ADVANCED_RESOURCE_TYPES = Object.freeze(["flowchart", "tree", "matrix", "plane"]);
const DEFAULT_SIZE_IDS = Object.freeze(["short", "medium"]);
const REVIEW_SIZE_IDS = Object.freeze(["short"]);
const ALL_SIZE_IDS = Object.freeze(["short", "medium", "long"]);

const TYPE_RESOURCE_JUSTIFICATIONS = Object.freeze({
  assisted: ["paragraph", "block_gap_fill", "multiple_choice", "table", "code_editor"],
  simple: ["paragraph", "multiple_choice", "table"],
  concept: ["paragraph", "multiple_choice", "table", "matrix", "plane"],
  procedure: ["paragraph", "multiple_choice", "table", "code_editor", "flowchart", "tree"],
  guided_practice: ["paragraph", "block_gap_fill", "multiple_choice", "table", "code_editor"],
  comparison: ["paragraph", "multiple_choice", "table", "matrix"],
  review: ["paragraph", "block_gap_fill", "multiple_choice", "table"],
  common_mistake: ["paragraph", "multiple_choice", "table"],
  rule_or_policy: ["paragraph", "multiple_choice", "table", "flowchart"],
  code_or_command: ["paragraph", "block_gap_fill", "multiple_choice", "code_editor", "tree"]
});

const ADVANCED_RESOURCE_SIGNAL_RULES = Object.freeze({
  matrix: {
    contentTypeTags: ["calculation", "comparison"],
    learningActionTags: ["solve", "compare"],
    typeIds: ["concept", "comparison"],
    sourceGuideTerms: ["matriz", "matrizes", "vetor", "vetores", "transformação linear"]
  },
  plane: {
    contentTypeTags: ["calculation", "interpretation"],
    learningActionTags: ["solve", "compare"],
    typeIds: ["concept", "comparison"],
    sourceGuideTerms: ["plano cartesiano", "vetor", "vetores", "distância", "ponto"]
  },
  flowchart: {
    contentTypeTags: ["procedure", "classification"],
    learningActionTags: ["understand", "practice"],
    typeIds: ["procedure", "rule_or_policy"],
    sourceGuideTerms: ["fluxo", "decisão", "procedimento", "algoritmo", "passo a passo"]
  },
  tree: {
    contentTypeTags: ["classification", "tool_use", "source_reading"],
    learningActionTags: ["understand", "use_tool", "read_source"],
    typeIds: ["procedure", "code_or_command"],
    sourceGuideTerms: ["diretório", "diretórios", "árvore", "arquivo", "pastas", "caminho"]
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

const POLICY_PRECEDENCE = Object.freeze([
  "context.lesson.sourceGuideStructured",
  "selectedLessonTopicRefs",
  "request.userPrompt"
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

function normalizeGuideText(sourceGuideStructured = {}) {
  return Object.values(sourceGuideStructured)
    .map((value) => text(value).toLowerCase())
    .filter(Boolean)
    .join(" ");
}

function typeSupportsResource(typeId, resourceType) {
  return (TYPE_RESOURCE_JUSTIFICATIONS[typeId] || []).includes(resourceType);
}

function hasStrongResourceNeed(resourceType, { lessonGuidance = {}, lessonSourceGuideStructured = {}, resolvedTypeId = "" } = {}) {
  const rule = ADVANCED_RESOURCE_SIGNAL_RULES[resourceType];
  if (!rule) {
    return false;
  }
  const contentTypeTags = list(lessonGuidance.contentTypeTags);
  const learningActionTags = list(lessonGuidance.learningActionTags);
  const guideText = normalizeGuideText(lessonSourceGuideStructured);
  return (
    includesAny(contentTypeTags, rule.contentTypeTags) ||
    includesAny(learningActionTags, rule.learningActionTags) ||
    rule.typeIds.includes(text(resolvedTypeId)) ||
    rule.sourceGuideTerms.some((term) => guideText.includes(term))
  );
}

function resolveAllowedTypeIds(lessonGuidance = {}) {
  const contentTypeTags = list(lessonGuidance.contentTypeTags);
  const learningActionTags = list(lessonGuidance.learningActionTags);
  const allowed = [];

  if (includesAny(learningActionTags, ["practice", "solve"])) {
    allowed.push("guided_practice");
  }
  if (includesAny(learningActionTags, ["use_tool"]) || includesAny(contentTypeTags, ["tool_use"])) {
    allowed.push("code_or_command");
  }
  if (includesAny(contentTypeTags, ["procedure"])) {
    allowed.push("procedure");
  }
  if (includesAny(contentTypeTags, ["comparison", "classification"])) {
    allowed.push("comparison");
  }
  if (includesAny(learningActionTags, ["review"]) || includesAny(contentTypeTags, ["review"])) {
    allowed.push("review");
  }
  if (includesAny(contentTypeTags, ["error_diagnosis"])) {
    allowed.push("common_mistake");
  }
  if (includesAny(contentTypeTags, ["concept", "interpretation", "source_reading"])) {
    allowed.push("concept");
  }
  allowed.push("simple");

  return TYPE_PRIORITY.filter((typeId) => unique(allowed).includes(typeId));
}

function resolveAllowedSizeIds(lessonGuidance = {}, modelCapabilities = {}) {
  const supportLevel = text(lessonGuidance.supportLevel);
  const maxCards = Math.min(
    Number(modelCapabilities.absoluteMaxCards || 7),
    Number(modelCapabilities.recommendedMaxCards || 5)
  );
  const sizeIds = supportLevel === "quick_review" ? REVIEW_SIZE_IDS : DEFAULT_SIZE_IDS;
  const allowed = sizeIds.filter((sizeId) => {
    const countBySize = { short: 3, medium: 5, long: 7 };
    return (countBySize[sizeId] || 99) <= maxCards;
  });
  return allowed.length ? allowed : ["short"];
}

function buildResourceDecision(resourceType, context) {
  const lessonResourceTags = list(context.lessonGuidance.resourceTags);
  const explicitlyAllowedByLesson = lessonResourceTags.includes(resourceType);
  const explicitlySelectedByUser = list(context.userSelectedExtraResourceTypes).includes(resourceType);
  const typeJustified = typeSupportsResource(context.resolvedTypeId, resourceType);
  const stronglyIndicated = hasStrongResourceNeed(resourceType, {
    lessonGuidance: context.lessonGuidance,
    lessonSourceGuideStructured: context.lessonSourceGuideStructured,
    resolvedTypeId: context.resolvedTypeId
  });

  if (BASE_SAFE_RESOURCE_TYPES.includes(resourceType)) {
    return {
      resourceType,
      allowed: explicitlyAllowedByLesson || BASE_SAFE_RESOURCE_TYPES.includes(resourceType),
      classification: "safe",
      reason: "recurso base seguro"
    };
  }

  if (CAUTIOUS_RESOURCE_TYPES.includes(resourceType)) {
    return {
      resourceType,
      allowed: explicitlyAllowedByLesson && typeJustified,
      classification: "cautious",
      reason: explicitlyAllowedByLesson && typeJustified ? "recurso cauteloso permitido" : "recurso cauteloso fora do envelope da lição ou do tipo"
    };
  }

  const advancedAllowed = explicitlyAllowedByLesson && typeJustified && (explicitlySelectedByUser || stronglyIndicated);
  return {
    resourceType,
    allowed: advancedAllowed,
    classification: "advanced",
    reason: advancedAllowed
      ? explicitlySelectedByUser
        ? "recurso avançado liberado por tag da lição, tipo compatível e escolha explícita do usuário"
        : "recurso avançado liberado por tag da lição, tipo compatível e indicação forte da lição"
      : "recurso avançado bloqueado por padrão"
  };
}

export function getWeakModelModePolicy(modelCapabilities = {}) {
  return {
    modeId: "weakModelMode",
    modeLabel: "Weak model mode",
    defaultMode: text(modelCapabilities.defaultMode) || "weak",
    recommendedMaxCards: Number(modelCapabilities.recommendedMaxCards || 5),
    absoluteMaxCards: Number(modelCapabilities.absoluteMaxCards || 7),
    defaultSizeIds: [...DEFAULT_SIZE_IDS],
    allSizeIds: [...ALL_SIZE_IDS],
    baseSafeResourceTypes: [...BASE_SAFE_RESOURCE_TYPES],
    cautiousResourceTypes: [...CAUTIOUS_RESOURCE_TYPES],
    advancedResourceTypes: [...ADVANCED_RESOURCE_TYPES],
    policyPrecedence: [...POLICY_PRECEDENCE],
    schemaPolicy: {
      responseMimeType: text(modelCapabilities.responseMimeType) || "application/json",
      supportsResponseJsonSchema: modelCapabilities.supportsResponseJsonSchema === true,
      supportsJsonSchemaSubset: modelCapabilities.supportsJsonSchemaSubset === true,
      schemaStrength: text(modelCapabilities.schemaStrength) || "partial",
      preferShortSchemas: modelCapabilities.preferShortSchemas !== false,
      sendOnlyEffectiveSchemas: true
    },
    repairPolicy: {
      deterministicRepairFirst: true,
      allowLlmRepairAfterDeterministicFailure: true,
      forbidCreativeDeterministicRepair: true
    },
    fallbackPolicy: {
      retryableCategories: ["rate_limited", "service_unavailable", "timeout"],
      allowAutomaticFallback: false
    }
  };
}

export function resolveWeakModelModePolicy({
  lessonGuidance = {},
  lessonSourceGuideStructured = {},
  modelCapabilities = {},
  resolvedTypeId = "",
  userSelectedExtraResourceTypes = []
} = {}) {
  const policy = getWeakModelModePolicy(modelCapabilities);
  const allowedTypeIds = resolveAllowedTypeIds(lessonGuidance);
  const allowedSizeIds = resolveAllowedSizeIds(lessonGuidance, modelCapabilities);
  const decisions = [
    ...BASE_SAFE_RESOURCE_TYPES,
    ...CAUTIOUS_RESOURCE_TYPES,
    ...ADVANCED_RESOURCE_TYPES
  ].map((resourceType) =>
    buildResourceDecision(resourceType, {
      lessonGuidance,
      lessonSourceGuideStructured,
      userSelectedExtraResourceTypes,
      resolvedTypeId
    })
  );

  return {
    ...policy,
    allowedTypeIds,
    allowedSizeIds,
    resourceDecisions: decisions,
    safeAllowedResourceTypes: decisions.filter((item) => item.allowed).map((item) => item.resourceType),
    rejectedResourceTypes: decisions.filter((item) => !item.allowed).map((item) => item.resourceType)
  };
}

export function assertUserSelectedResourcesAllowed({
  lessonGuidance = {},
  lessonSourceGuideStructured = {},
  modelCapabilities = {},
  resolvedTypeId = "",
  userSelectedExtraResourceTypes = []
} = {}) {
  const policy = resolveWeakModelModePolicy({
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

export function resolvePolicyResourceTypes(policy = {}, { includeAdvanced = false } = {}) {
  const allowed = list(policy.safeAllowedResourceTypes);
  if (includeAdvanced) {
    return allowed;
  }
  return allowed.filter((resourceType) => !ADVANCED_RESOURCE_TYPES.includes(resourceType));
}
