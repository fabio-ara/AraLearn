import { listGenerationResourceDefinitions } from "../resources/cardResourceDefinitions.js";
import { getMicrosequenceSize } from "../types/microsequenceSizes.js";
import { resolveResourcesForGenerationPlan } from "../didactics/microsequenceGenerationRepresentation.js";

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function unique(items = []) {
  return [...new Set((Array.isArray(items) ? items : []).map((item) => text(item)).filter(Boolean))];
}

function inferDidacticKind(typeId = "", packet = {}) {
  const direct = text(packet?.didacticKind || packet?.currentMicrosequence?.didacticKind);
  if (direct) {
    return direct;
  }
  const normalized = text(typeId);
  if (normalized === "comparison") return "discrimination";
  if (normalized === "guided_practice" || normalized === "review") return "cumulative_practice";
  if (normalized === "rule_or_policy" || normalized === "code_or_command") return "procedure";
  if (normalized === "concept" || normalized === "procedure" || normalized === "formalization") {
    return normalized;
  }
  return "concept";
}

function defaultEvidence(packet = {}) {
  const expected = unique(packet?.expectedEvidence || packet?.currentMicrosequence?.expectedEvidence);
  return expected.length ? expected : ["explicar o ponto central", "aplicar o procedimento"];
}

function expandPlanForEvidence(baseRoles = [], evidence = []) {
  const normalized = evidence.join(" ").toLowerCase();
  const expanded = [...baseRoles];
  if (/\b(corrigir|erro|correction)\b/u.test(normalized) && !expanded.includes("correction")) {
    expanded.splice(Math.max(1, expanded.length - 1), 0, "correction");
  }
  if (/\b(comparar|classificar|variation|variaç)/u.test(normalized) && !expanded.includes("analogous_practice")) {
    expanded.splice(Math.max(1, expanded.length - 1), 0, "analogous_practice");
  }
  if (/\b(ler|interpretar|reconhecer representação)\b/u.test(normalized) && !expanded.includes("example_reading")) {
    expanded.splice(1, 0, "example_reading");
  }
  return expanded;
}

function resolveBaseRoles(didacticKind = "concept") {
  switch (didacticKind) {
    case "procedure":
      return ["microtheory", "guided_example", "example_reading", "active_practice", "analogous_practice", "correction", "bridge_or_consolidation"];
    case "formalization":
      return ["microtheory", "guided_example", "example_reading", "active_practice", "analogous_practice", "bridge_or_consolidation"];
    case "representation_reading":
      return ["guided_example", "example_reading", "active_practice", "analogous_practice", "bridge_or_consolidation"];
    case "cumulative_practice":
      return ["microtheory", "active_practice", "analogous_practice", "analogous_practice", "correction", "bridge_or_consolidation"];
    case "discrimination":
      return ["microtheory", "contrast", "active_practice", "analogous_practice", "bridge_or_consolidation"];
    case "concept":
    default:
      return ["microtheory", "guided_example", "contrast", "active_practice", "bridge_or_consolidation"];
  }
}

function pickPreferredResource(candidates = [], allowed = []) {
  const allowedSet = new Set(allowed);
  return candidates.find((candidate) => allowedSet.has(candidate)) || allowed[0] || "say";
}

function mapLegacyAllowedResourceTypes(allowed = []) {
  return unique(
    allowed.map((resourceType) => ({
      paragraph: "say",
      multiple_choice: "block_gap_fill",
      code_editor: "code",
      table: "table",
      graph: "graph",
      block_gap_fill: "block_gap_fill"
    }[resourceType] || resourceType))
  );
}

function mapPlanResourceTypeToLegacy(resourceType = "", allowed = []) {
  const legacyCandidates = {
    say: ["paragraph", "multiple_choice"],
    table: ["table", "paragraph"],
    code: ["code_editor", "paragraph"],
    graph: ["graph", "table", "paragraph"],
    block_gap_fill: ["block_gap_fill", "multiple_choice", "paragraph"]
  }[resourceType] || ["paragraph"];
  return pickPreferredResource(legacyCandidates, allowed);
}

export function chooseResourceTypeForRole(role = "", params = {}) {
  const allowed = unique(params?.allowedResourceTypes?.length ? params.allowedResourceTypes : ["say", "table", "code", "graph", "block_gap_fill"]);
  const representationNeed = text(params?.representationNeed || params?.currentMicrosequence?.representationNeed);
  const practiceMode = text(params?.practiceMode || params?.currentMicrosequence?.practiceMode);
  const preferred = text(params?.preferredContainerLabel).toLowerCase();
  const preferredMap = {
    texto: "say",
    tabela: "table",
    código: "code",
    codigo: "code",
    grafo: "graph",
    lacuna: "block_gap_fill"
  };
  const explicitPreferred = preferredMap[preferred];
  if (explicitPreferred && allowed.includes(explicitPreferred)) {
    return explicitPreferred;
  }

  const representationFallback =
    representationNeed === "table" ? "table"
      : representationNeed === "code" ? "code"
        : representationNeed === "visual_structure" ? pickPreferredResource(["graph", "table", "say"], allowed)
          : representationNeed === "sequence" ? pickPreferredResource(["table", "say"], allowed)
            : representationNeed === "formula" ? pickPreferredResource(["table", "say"], allowed)
              : "say";

  switch (text(role)) {
    case "microtheory":
    case "bridge_or_consolidation":
      return pickPreferredResource(["say", "table"], allowed);
    case "guided_example":
      return pickPreferredResource([representationFallback, "table", "say"], allowed);
    case "example_reading":
      return pickPreferredResource([representationFallback, "say", "table"], allowed);
    case "contrast":
      return pickPreferredResource(["table", "say"], allowed);
    case "active_practice":
      if (practiceMode === "execution") return pickPreferredResource(["code", "block_gap_fill", "say"], allowed);
      if (practiceMode === "classification" || practiceMode === "calculation") return pickPreferredResource(["table", "block_gap_fill", "say"], allowed);
      return pickPreferredResource(["block_gap_fill", representationFallback, "say"], allowed);
    case "analogous_practice":
      return pickPreferredResource([representationFallback, "block_gap_fill", "say"], allowed);
    case "cumulative_review":
      return pickPreferredResource(["block_gap_fill", "table", "say"], allowed);
    case "correction":
      return pickPreferredResource(["table", "block_gap_fill", "say"], allowed);
    default:
      return pickPreferredResource(["say"], allowed);
  }
}

function buildPlanEntries(roles = [], packet = {}, allowedResourceTypes = []) {
  const evidence = defaultEvidence(packet);
  const dependencyPolicy = text(packet?.dependencyPolicy || packet?.currentMicrosequence?.dependencyPolicy) || "self_contained";
  return roles.map((role, index) => ({
    position: index + 1,
    role,
    label: `${role}_${index + 1}`,
    purpose: {
      microtheory: "explicar a ideia central",
      guided_example: "mostrar um caso guiado",
      example_reading: "ler a representação ou o passo crítico",
      contrast: "comparar casos ou critérios",
      active_practice: "pedir uma ação observável",
      analogous_practice: "variar a prática no mesmo eixo",
      cumulative_review: "retomar o que já foi visto",
      correction: "corrigir erro típico",
      bridge_or_consolidation: "reconectar à trilha"
    }[role] || "cumprir a função didática do passo",
    resourceType: chooseResourceTypeForRole(role, {
      ...packet,
      allowedResourceTypes
    }),
    usesDependency: dependencyPolicy === "self_contained" ? [] : unique(packet?.dependsOn || packet?.currentMicrosequence?.dependsOn || []).slice(0, 2),
    expectedEvidence: evidence
  }));
}

export function buildDidacticCardPlan(packet = {}, options = {}) {
  const didacticKind = inferDidacticKind(options?.typeId, packet);
  const evidence = defaultEvidence(packet);
  const baseRoles = expandPlanForEvidence(resolveBaseRoles(didacticKind), evidence);
  const targetCount = Math.max(1, Number(options?.targetCount) || baseRoles.length);
  const allowedResourceTypes = unique(options?.allowedResourceTypes?.length ? options.allowedResourceTypes : ["say", "table", "code", "graph", "block_gap_fill"]);
  const roles = baseRoles.slice(0, targetCount);
  if (baseRoles.length < targetCount) {
    while (roles.length < targetCount) {
      roles.splice(Math.max(roles.length - 1, 0), 0, "analogous_practice");
    }
  }
  return buildPlanEntries(roles, packet, allowedResourceTypes);
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
  resourceCatalog = listGenerationResourceDefinitions(),
  packet = {}
}) {
  const size = getMicrosequenceSize(sizeId) || getMicrosequenceSize("medium");
  const resources = resolveResourcesForGenerationPlan({
    resolvedMicrosequenceTypeId: typeId,
    userSelectedExtraResourceTypes,
    planSelectedExtraResourceTypes: selectedExtraResourceTypes,
    lessonAllowedResourceTypes,
    lessonGuidance,
    lessonSourceGuideStructured,
    modelCapabilities,
    resourceCatalog
  });
  const legacyMetadata = {
    code_or_command: { didacticKind: "procedure", practiceMode: "execution", representationNeed: "code" },
    rule_or_policy: { didacticKind: "procedure", practiceMode: "classification", representationNeed: "sequence" },
    comparison: { didacticKind: "discrimination", practiceMode: "classification", representationNeed: "table" },
    guided_practice: { didacticKind: "cumulative_practice", practiceMode: "guided_production", representationNeed: "text" },
    review: { didacticKind: "cumulative_practice", practiceMode: "recognition", representationNeed: "text" },
    concept: { didacticKind: "concept", practiceMode: "explanation", representationNeed: "text" }
  }[typeId] || {};
  const basePlan = buildDidacticCardPlan(
    {
      ...packet,
      currentMicrosequence: {
        ...(packet?.currentMicrosequence || {}),
        ...legacyMetadata,
        didacticKind: legacyMetadata.didacticKind || inferDidacticKind(typeId, packet)
      }
    },
    {
      typeId,
      targetCount: size?.recommendedBatchCards || size?.cardCount || 5,
      allowedResourceTypes: mapLegacyAllowedResourceTypes(resources.allowedResourceTypes)
    }
  );
  const sourceIds = unique((Array.isArray(sourceUsePlan) ? sourceUsePlan : []).map((item) => item?.sourceId));
  return basePlan.map((item) => ({
    ...item,
    resourceType: mapPlanResourceTypeToLegacy(item.resourceType, resources.allowedResourceTypes),
    sourceRefs: sourceIds.length === 1 ? [sourceIds[0]] : []
  }));
}
