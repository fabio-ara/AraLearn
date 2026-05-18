import { isPracticeCoverageRole } from "../domain/lessonDomainModel.js";
import { listCourseForgeSourceClaims, listCourseForgeSourceSpans, listCourseForgeSources } from "../courseForge/courseForgeSourceLedger.js";
import { text } from "./didacticText.js";

function normalizeArray(value) {
  return Array.isArray(value) ? value : [];
}

const CLAIM_STOPWORDS = new Set(["para", "com", "uma", "das", "dos", "que", "por", "ser", "sao", "são", "como", "mais", "menos"]);

function normalizeComparableText(value = "") {
  return text(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function tokenizeClaimMatch(value = "") {
  return [...new Set(
    normalizeComparableText(value)
      .split(/[^a-z0-9_]+/u)
      .map((item) => item.trim())
      .filter((item) => item.length >= 3)
      .filter((item) => !CLAIM_STOPWORDS.has(item))
  )];
}

function pickTransformationStateForPlan(role = "") {
  const normalized = text(role);
  if (normalized === "anchor") return "literal";
  if (["guided_example", "minimal_example"].includes(normalized)) return "example";
  if (["practice", "guided_practice", "independent_practice", "exam_transfer"].includes(normalized)) return "application";
  if (["contrast", "common_error"].includes(normalized)) return "inference";
  return "paraphrase";
}

export function inferCoverageRoleFromMicrosequence(microsequence = {}) {
  const explicit = text(microsequence?.coverageRole);
  if (explicit) {
    return explicit;
  }
  const combined = normalizeComparableText([
    microsequence?.title,
    microsequence?.objective,
    microsequence?.didacticPurpose
  ].filter(Boolean).join(" "));
  if (/\b(compare|comparacao|comparar|contraste|distinguir|diferenciar)\b/u.test(combined)) {
    return "discriminate";
  }
  if (/\b(erro|corrigir|corrija|diagnosticar|pegadinha|confus)\b/u.test(combined)) {
    return "diagnose_error";
  }
  if (/\b(pratica|praticar|exercicio|aplicar|aplicacao|resolver|treino)\b/u.test(combined)) {
    return "practice";
  }
  if (/\b(exemplo|demonstracao|demonstrar)\b/u.test(combined)) {
    return "demonstrate";
  }
  return "explain";
}

export function selectDomainRefsForMicrosequence(microsequence = {}, domainItems = []) {
  const currentDomainRefs = normalizeArray(microsequence?.domainRefs).map(text).filter(Boolean);
  if (currentDomainRefs.length) {
    return currentDomainRefs;
  }
  const microTokens = tokenizeClaimMatch([
    microsequence?.title,
    microsequence?.objective,
    microsequence?.didacticPurpose
  ].filter(Boolean).join(" "));
  if (!microTokens.length) {
    const coreDomainIds = normalizeArray(domainItems)
      .filter((item) => text(item?.priority) === "core")
      .map((item) => text(item?.id))
      .filter(Boolean);
    return coreDomainIds.length === 1 ? [coreDomainIds[0]] : [];
  }
  const matched = normalizeArray(domainItems)
    .map((item) => ({
      id: text(item?.id),
      overlap: tokenizeClaimMatch(`${text(item?.label)} ${normalizeArray(item?.expectedEvidence).join(" ")}`)
        .filter((token) => microTokens.includes(token))
        .length,
      priority: text(item?.priority)
    }))
    .filter((item) => item.id && item.overlap > 0)
    .sort((left, right) => right.overlap - left.overlap || (left.priority === "core" ? -1 : 1))
    .slice(0, 2)
    .map((item) => item.id);
  return matched.length ? matched : [];
}

export function pickVariantRefsForRole(domainRefs = [], variantsByDomain = new Map(), coverageRole = "") {
  const current = domainRefs.flatMap((domainRef) => normalizeArray(variantsByDomain.get(domainRef)));
  if (!current.length) {
    return [];
  }
  const preferredKinds =
    coverageRole === "discriminate"
      ? ["discrimination", "common_error", "exam_format"]
      : coverageRole === "diagnose_error"
        ? ["common_error", "discrimination"]
        : coverageRole === "practice" || coverageRole === "exam_apply"
          ? ["near_transfer", "fluency", "exam_format", "integration"]
          : ["explanation", "fluency", "representation_shift"];
  const sorted = [...current].sort((left, right) => {
    const leftIndex = preferredKinds.indexOf(text(left?.variantKind));
    const rightIndex = preferredKinds.indexOf(text(right?.variantKind));
    return (leftIndex < 0 ? 99 : leftIndex) - (rightIndex < 0 ? 99 : rightIndex);
  });
  return sorted.slice(0, 2).map((variant) => text(variant?.id)).filter(Boolean);
}

export function inferDidacticPurpose(microsequence = {}, domainItemsById = new Map(), domainRefs = [], coverageRole = "") {
  const explicit = text(microsequence?.didacticPurpose || microsequence?.objective);
  if (explicit) {
    return explicit;
  }
  const labels = domainRefs
    .map((domainRef) => text(domainItemsById.get(domainRef)?.label))
    .filter(Boolean)
    .slice(0, 2);
  if (!labels.length) {
    return "";
  }
  if (coverageRole === "discriminate") {
    return `Distinguir ${labels.join(" e ")}.`;
  }
  if (coverageRole === "diagnose_error") {
    return `Diagnosticar erros em ${labels.join(" e ")}.`;
  }
  if (coverageRole === "practice" || coverageRole === "exam_apply") {
    return `Praticar ${labels.join(" e ")} em casos próximos.`;
  }
  if (coverageRole === "demonstrate") {
    return `Demonstrar ${labels.join(" e ")} com exemplo guiado.`;
  }
  return `Explicar ${labels.join(" e ")}.`;
}

export function pickAllowedResourceTypes(lessonPlan = {}) {
  const allowed = normalizeArray(lessonPlan.resourceTags)
    .map(text)
    .filter(Boolean)
    .filter((resourceType) => ["paragraph", "multiple_choice", "block_gap_fill", "table", "code_editor", "plane", "matrix", "flowchart", "tree", "graph"].includes(resourceType));
  if (allowed.length) {
    return allowed;
  }
  const courseRepresentations = [
    text(lessonPlan?.courseSemantics?.primaryRepresentation),
    text(lessonPlan?.courseSemantics?.secondaryRepresentation)
  ].filter(Boolean);
  if (courseRepresentations.includes("matrix")) {
    return ["paragraph", "multiple_choice", "matrix"];
  }
  if (courseRepresentations.includes("flowchart")) {
    return ["paragraph", "multiple_choice", "flowchart"];
  }
  if (courseRepresentations.includes("code") || courseRepresentations.includes("pseudocode")) {
    return ["paragraph", "multiple_choice", "code_editor"];
  }
  if (courseRepresentations.includes("graph")) {
    return ["paragraph", "multiple_choice", "graph"];
  }
  if (courseRepresentations.includes("table") || courseRepresentations.includes("spreadsheet")) {
    return ["paragraph", "multiple_choice", "table"];
  }
  if (courseRepresentations.includes("tree")) {
    return ["paragraph", "multiple_choice", "tree"];
  }
  return ["paragraph", "multiple_choice"];
}

function pickPracticeResourceType(allowedResourceTypes = []) {
  if (allowedResourceTypes.includes("matrix")) {
    return "matrix";
  }
  if (allowedResourceTypes.includes("graph")) {
    return "graph";
  }
  if (allowedResourceTypes.includes("flowchart")) {
    return "flowchart";
  }
  if (allowedResourceTypes.includes("tree")) {
    return "tree";
  }
  if (allowedResourceTypes.includes("block_gap_fill")) {
    return "block_gap_fill";
  }
  if (allowedResourceTypes.includes("multiple_choice")) {
    return "multiple_choice";
  }
  if (allowedResourceTypes.includes("table")) {
    return "table";
  }
  return allowedResourceTypes[0] || "paragraph";
}

function pickExpositoryResourceType(allowedResourceTypes = []) {
  if (allowedResourceTypes.includes("matrix")) {
    return "matrix";
  }
  if (allowedResourceTypes.includes("graph")) {
    return "graph";
  }
  if (allowedResourceTypes.includes("flowchart")) {
    return "flowchart";
  }
  if (allowedResourceTypes.includes("tree")) {
    return "tree";
  }
  if (allowedResourceTypes.includes("paragraph")) {
    return "paragraph";
  }
  if (allowedResourceTypes.includes("table")) {
    return "table";
  }
  return allowedResourceTypes[0] || "paragraph";
}

export function buildSimpleCardPlan(microsequence = {}, lessonPlan = {}, sourceLedger = []) {
  const allowedResourceTypes = pickAllowedResourceTypes(lessonPlan);
  const expositoryResourceType = pickExpositoryResourceType(allowedResourceTypes);
  const practiceResourceType = pickPracticeResourceType(allowedResourceTypes);
  const sourceRefs = listCourseForgeSources(sourceLedger).map((item) => text(item?.sourceId || item?.id)).filter(Boolean);
  const sourceSpans = listCourseForgeSourceSpans(sourceLedger);
  const sourceClaims = listCourseForgeSourceClaims(sourceLedger);
  const firstSourceId = sourceRefs[0] || "";
  const firstSpanId = sourceSpans.find((span) => text(span?.sourceId) === firstSourceId)?.spanId || sourceSpans[0]?.spanId || "";
  const firstClaimId = sourceClaims.find((claim) => text(claim?.spanId) === firstSpanId)?.claimId || "";
  const coverageRole = text(microsequence.coverageRole);
  const supportLevel = text(lessonPlan.supportLevel);
  const wantsThreeCards =
    coverageRole === "core" ||
    coverageRole === "foundation" ||
    coverageRole === "introduction" ||
    supportLevel === "guided";

  const plan = [
    {
      position: 1,
      role: "anchor",
      label: "Âncora conceitual",
      resourceType: expositoryResourceType,
      sourceRefs: sourceRefs.slice(0, 1),
      sourceSpanRefs: firstSpanId ? [firstSpanId] : [],
      sourceClaimRefs: firstClaimId ? [firstClaimId] : [],
      transformationState: pickTransformationStateForPlan("anchor")
    },
    {
      position: 2,
      role: wantsThreeCards ? "guided_example" : "practice",
      label: wantsThreeCards ? "Exemplo guiado" : "Prática breve",
      resourceType: wantsThreeCards ? expositoryResourceType : practiceResourceType,
      sourceRefs: sourceRefs.slice(0, 1),
      sourceSpanRefs: firstSpanId ? [firstSpanId] : [],
      sourceClaimRefs: firstClaimId ? [firstClaimId] : [],
      transformationState: pickTransformationStateForPlan(wantsThreeCards ? "guided_example" : "practice")
    }
  ];

  if (wantsThreeCards) {
    plan.push({
      position: 3,
      role: "practice",
      label: "Prática de consolidação",
      resourceType: practiceResourceType,
      sourceRefs: sourceRefs.slice(0, 1),
      sourceSpanRefs: firstSpanId ? [firstSpanId] : [],
      sourceClaimRefs: firstClaimId ? [firstClaimId] : [],
      transformationState: pickTransformationStateForPlan("practice")
    });
  }

  return plan;
}

export function repairMicrosequenceMetadataAgainstDomainMap({ microsequencePlans = [], lessonPlans = [], normalizeLessonDomainMap, sortLessonMicrosequencesDeterministically }) {
  const lessonByKey = new Map(
    normalizeArray(lessonPlans)
      .map((lessonPlan) => [text(lessonPlan?.lessonKey), lessonPlan])
      .filter(([lessonKey]) => lessonKey)
  );

  return normalizeArray(microsequencePlans).map((lessonEntry) => {
    const lessonPlan = lessonByKey.get(text(lessonEntry?.lessonKey));
    if (!lessonPlan) {
      return structuredClone(lessonEntry);
    }

    const domainMap = normalizeLessonDomainMap(lessonPlan.domainMap || {}, {
      lessonMicrosequences: [],
      sourceGuideStructured: lessonPlan.sourceGuideStructured || {}
    });
    const domainItems = normalizeArray(domainMap.items);
    const domainItemsById = new Map(domainItems.map((item) => [text(item?.id), item]));
    const coreDomainIds = normalizeArray(domainMap.items)
      .filter((item) => text(item?.priority) === "core")
      .map((item) => text(item?.id))
      .filter(Boolean);
    const variantsByDomain = new Map();
    normalizeArray(domainMap.practiceVariants).forEach((variant) => {
      const key = text(variant?.domainItemRef);
      if (!key) {
        return;
      }
      const list = variantsByDomain.get(key) || [];
      list.push(variant);
      variantsByDomain.set(key, list);
    });

    const repairedMicrosequences = normalizeArray(lessonEntry?.microsequences).map((microsequence) => {
      const nextCoverageRole = inferCoverageRoleFromMicrosequence(microsequence);
      const currentDomainRefs = normalizeArray(microsequence?.domainRefs).map(text).filter(Boolean);
      const inferredDomainRefs = selectDomainRefsForMicrosequence(microsequence, domainItems);
      const nextDomainRefs = currentDomainRefs.length
        ? currentDomainRefs
        : inferredDomainRefs.length
          ? inferredDomainRefs
          : nextCoverageRole === "discriminate" && coreDomainIds.length >= 2
            ? coreDomainIds.slice(0, 2)
            : coreDomainIds.length >= 1
              ? [coreDomainIds[0]]
              : [];
      const currentPracticeVariantRefs = normalizeArray(microsequence?.practiceVariantRefs).map(text).filter(Boolean);
      const nextPracticeVariantRefs =
        currentPracticeVariantRefs.length
          ? currentPracticeVariantRefs
          : isPracticeCoverageRole(nextCoverageRole)
            ? pickVariantRefsForRole(nextDomainRefs, variantsByDomain, nextCoverageRole)
            : [];

      return {
        ...structuredClone(microsequence),
        coverageRole: nextCoverageRole,
        didacticPurpose: inferDidacticPurpose(microsequence, domainItemsById, nextDomainRefs, nextCoverageRole),
        domainRefs: nextDomainRefs,
        practiceVariantRefs: nextPracticeVariantRefs
      };
    });

    return {
      ...structuredClone(lessonEntry),
      microsequences: sortLessonMicrosequencesDeterministically({
        microsequences: repairedMicrosequences,
        lessonDomainMap: domainMap
      })
    };
  });
}
