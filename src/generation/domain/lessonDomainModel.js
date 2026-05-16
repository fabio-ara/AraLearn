const DOMAIN_ITEM_KINDS = new Set([
  "concept",
  "procedure",
  "comparison",
  "calculation",
  "interpretation",
  "notation",
  "tool_use",
  "error_diagnosis",
  "exam_pattern",
  "synthesis"
]);

const DOMAIN_ITEM_PRIORITIES = new Set(["core", "support", "extension"]);
const DOMAIN_ITEM_STATUSES = new Set(["uncovered", "drafted", "ready", "weak", "redundant"]);
const PRACTICE_VARIANT_KINDS = new Set([
  "fluency",
  "near_transfer",
  "far_transfer",
  "representation_shift",
  "discrimination",
  "common_error",
  "boundary_case",
  "exam_format",
  "integration",
  "explanation",
  "reverse_problem"
]);
const COVERAGE_ROLES = new Set([
  "introduce",
  "explain",
  "demonstrate",
  "practice",
  "discriminate",
  "diagnose_error",
  "consolidate",
  "exam_apply",
  "integrate"
]);

const PRACTICE_ROLES = new Set(["practice", "discriminate", "diagnose_error", "consolidate", "exam_apply", "integrate"]);
const EXPLANATION_ROLES = new Set(["introduce", "explain", "demonstrate"]);

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeComparableText(value) {
  return text(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function slugify(value) {
  return normalizeComparableText(value)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

function list(value, { limit = 8, unique = true } = {}) {
  const seen = new Set();
  return (Array.isArray(value) ? value : [])
    .map((item) => text(item))
    .filter((item) => {
      if (!item) {
        return false;
      }
      if (!unique) {
        return true;
      }
      const key = item.toLowerCase();
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    })
    .slice(0, limit);
}

function sentenceParts(value, limit = 4) {
  return text(value)
    .split(/[\n.;•]+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, limit);
}

function buildFallbackId(prefix, label, index) {
  return `${prefix}-${slugify(label) || String(index + 1)}`;
}

function normalizeDomainItem(item, index = 0) {
  const label = text(item?.label);
  if (!label) {
    return null;
  }

  return {
    id: text(item?.id) || buildFallbackId("domain", label, index),
    label,
    kind: DOMAIN_ITEM_KINDS.has(text(item?.kind)) ? text(item.kind) : "concept",
    priority: DOMAIN_ITEM_PRIORITIES.has(text(item?.priority)) ? text(item.priority) : "core",
    status: DOMAIN_ITEM_STATUSES.has(text(item?.status)) ? text(item.status) : "uncovered",
    sourceRefs: list(item?.sourceRefs, { limit: 8 }),
    expectedEvidence: list(item?.expectedEvidence, { limit: 6 }),
    commonErrors: list(item?.commonErrors, { limit: 6 }),
    prerequisites: list(item?.prerequisites, { limit: 8 }),
    representations: list(item?.representations, { limit: 6 }),
    assessmentFormats: list(item?.assessmentFormats, { limit: 6 })
  };
}

function normalizePracticeVariant(variant, index = 0) {
  const domainItemRef = text(variant?.domainItemRef);
  if (!domainItemRef) {
    return null;
  }

  return {
    id: text(variant?.id) || buildFallbackId("variant", `${domainItemRef}-${variant?.variantKind || "practice"}`, index),
    domainItemRef,
    variantKind: PRACTICE_VARIANT_KINDS.has(text(variant?.variantKind)) ? text(variant.variantKind) : "fluency",
    purpose: text(variant?.purpose),
    difficulty: text(variant?.difficulty),
    representation: text(variant?.representation),
    expectedStudentAction: text(variant?.expectedStudentAction),
    commonErrorTarget: text(variant?.commonErrorTarget)
  };
}

function normalizeMicrosequenceDidacticMetadata(value = {}) {
  return {
    ...(text(value?.description) ? { description: text(value.description) } : {}),
    ...(list(value?.tags, { limit: 5 }).length ? { tags: list(value.tags, { limit: 5 }) } : {}),
    ...(list(value?.domainRefs, { limit: 8 }).length ? { domainRefs: list(value.domainRefs, { limit: 8 }) } : {}),
    ...(list(value?.practiceVariantRefs, { limit: 8 }).length
      ? { practiceVariantRefs: list(value.practiceVariantRefs, { limit: 8 }) }
      : {}),
    ...(text(value?.didacticPurpose) ? { didacticPurpose: text(value.didacticPurpose) } : {}),
    ...(COVERAGE_ROLES.has(text(value?.coverageRole)) ? { coverageRole: text(value.coverageRole) } : {})
  };
}

function buildFallbackDomainItems(sourceGuideStructured = {}) {
  const items = [];
  const lessonGoal = text(sourceGuideStructured?.lessonGoal);
  const notationRules = sentenceParts(sourceGuideStructured?.notationRules);
  const commonErrors = sentenceParts(sourceGuideStructured?.commonErrors);

  if (lessonGoal) {
    items.push(
      normalizeDomainItem({
        id: "lesson-goal",
        label: lessonGoal,
        kind: "concept",
        priority: "core",
        expectedEvidence: ["explicar o ponto central", "resolver prática correspondente"]
      })
    );
  }

  notationRules.forEach((entry, index) => {
    items.push(
      normalizeDomainItem({
        id: `notation-${index + 1}`,
        label: entry,
        kind: "notation",
        priority: "support",
        expectedEvidence: ["ler a notação corretamente"],
        representations: ["simbólica", "linguagem comum"]
      })
    );
  });

  commonErrors.forEach((entry, index) => {
    items.push(
      normalizeDomainItem({
        id: `error-${index + 1}`,
        label: entry,
        kind: "error_diagnosis",
        priority: "core",
        expectedEvidence: ["identificar o erro", "corrigir o procedimento"],
        commonErrors: [entry]
      })
    );
  });

  return items.filter(Boolean);
}

function buildFallbackPracticeVariants(items = []) {
  return items
    .map((item, index) => {
      const label = text(item?.label);
      const idBase = text(item?.id) || buildFallbackId("domain", label, index);
      if (!label) {
        return null;
      }
      if (text(item?.kind) === "notation") {
        return normalizePracticeVariant({
          id: `${idBase}-fluency`,
          domainItemRef: text(item?.id),
          variantKind: "fluency",
          purpose: `Ler e usar ${label}.`,
          representation: text(item?.representations?.[0]) || "simbólica",
          expectedStudentAction: "reconhecer e interpretar a notação"
        });
      }
      if (text(item?.kind) === "error_diagnosis") {
        return normalizePracticeVariant({
          id: `${idBase}-error`,
          domainItemRef: text(item?.id),
          variantKind: "common_error",
          purpose: `Identificar e corrigir ${label}.`,
          expectedStudentAction: "diagnosticar e corrigir o erro",
          commonErrorTarget: text(item?.commonErrors?.[0] || label)
        });
      }
      if (text(item?.kind) === "comparison") {
        return normalizePracticeVariant({
          id: `${idBase}-compare`,
          domainItemRef: text(item?.id),
          variantKind: "discrimination",
          purpose: `Distinguir ${label}.`,
          expectedStudentAction: "comparar e discriminar casos próximos"
        });
      }
      if (["procedure", "calculation", "tool_use"].includes(text(item?.kind))) {
        return normalizePracticeVariant({
          id: `${idBase}-apply`,
          domainItemRef: text(item?.id),
          variantKind: "near_transfer",
          purpose: `Aplicar ${label}.`,
          expectedStudentAction: "executar o procedimento em caso próximo"
        });
      }
      return normalizePracticeVariant({
        id: `${idBase}-explain`,
        domainItemRef: text(item?.id),
        variantKind: "explanation",
        purpose: `Explicar ou reconhecer ${label}.`,
        expectedStudentAction: "explicar o conceito em palavras próprias"
      });
    })
    .filter(Boolean);
}

function buildDomainItemCoverageIndex(microsequences = [], practiceVariants = []) {
  const variantById = new Map(practiceVariants.map((variant) => [variant.id, variant]));
  const index = new Map();

  (Array.isArray(microsequences) ? microsequences : []).forEach((microsequence) => {
    const refs = list(microsequence?.domainRefs, { limit: 12 });
    if (!refs.length) {
      return;
    }

    refs.forEach((domainRef) => {
      const record = index.get(domainRef) || {
        explainCount: 0,
        practiceCount: 0,
        examCount: 0,
        errorCount: 0,
        representations: new Set(),
        variantKinds: new Set(),
        purposes: new Set(),
        microsequenceKeys: new Set(),
        signatures: new Set(),
        onlyDraft: true
      };
      const role = text(microsequence?.coverageRole);
      const signature = [
        role,
        list(microsequence?.practiceVariantRefs, { limit: 8 }).sort().join("|"),
        normalizeComparableText(microsequence?.didacticPurpose),
        normalizeComparableText(microsequence?.title)
      ].join("::");

      record.microsequenceKeys.add(text(microsequence?.key) || text(microsequence?.title));
      record.signatures.add(signature);
      if (EXPLANATION_ROLES.has(role)) {
        record.explainCount += 1;
      }
      if (PRACTICE_ROLES.has(role)) {
        record.practiceCount += 1;
      }
      if (role === "exam_apply") {
        record.examCount += 1;
      }
      if (role === "diagnose_error") {
        record.errorCount += 1;
      }
      if (text(microsequence?.status) === "ready" && microsequence?.included !== false) {
        record.onlyDraft = false;
      }

      list(microsequence?.practiceVariantRefs, { limit: 8 }).forEach((variantRef) => {
        const variant = variantById.get(variantRef);
        if (!variant) {
          return;
        }
        if (variant.variantKind) {
          record.variantKinds.add(variant.variantKind);
        }
        if (variant.purpose) {
          record.purposes.add(normalizeComparableText(variant.purpose));
        }
        if (variant.representation) {
          record.representations.add(normalizeComparableText(variant.representation));
        }
      });

      index.set(domainRef, record);
    });
  });

  return index;
}

function summarizeLessonDomainCoverage(items = [], practiceVariants = [], microsequences = []) {
  const coverageIndex = buildDomainItemCoverageIndex(microsequences, practiceVariants);
  const updatedItems = items.map((item) => {
    const coverage = coverageIndex.get(item.id);
    if (!coverage) {
      return { ...item, status: "uncovered" };
    }
    const redundant = coverage.microsequenceKeys.size > 1 && coverage.signatures.size <= 1;
    const ready = coverage.practiceCount > 0 || (item.kind === "notation" && coverage.explainCount > 0);
    const status = redundant
      ? "redundant"
      : coverage.onlyDraft
        ? "drafted"
        : ready
          ? "ready"
          : "weak";
    return { ...item, status };
  });

  const missingPractice = updatedItems.filter((item) => {
    const coverage = coverageIndex.get(item.id);
    return coverage && coverage.explainCount > 0 && coverage.practiceCount === 0;
  });

  const weakVariants = updatedItems.filter((item) => {
    const coverage = coverageIndex.get(item.id);
    return coverage && coverage.practiceCount > 0 && coverage.variantKinds.size < 2 && item.priority === "core";
  });

  return {
    items: updatedItems,
    gapSummary: {
      uncoveredDomainItemIds: updatedItems.filter((item) => item.status === "uncovered").map((item) => item.id),
      weakDomainItemIds: updatedItems.filter((item) => item.status === "weak").map((item) => item.id),
      redundantDomainItemIds: updatedItems.filter((item) => item.status === "redundant").map((item) => item.id),
      explainedWithoutPracticeIds: missingPractice.map((item) => item.id),
      practiceWithoutVariationIds: weakVariants.map((item) => item.id),
      examMissingIds: updatedItems
        .filter((item) => item.priority === "core" && item.kind !== "notation")
        .filter((item) => (coverageIndex.get(item.id)?.examCount || 0) === 0)
        .map((item) => item.id),
      errorCoverageIds: updatedItems
        .filter((item) => item.kind === "error_diagnosis")
        .filter((item) => (coverageIndex.get(item.id)?.errorCount || 0) > 0)
        .map((item) => item.id)
    }
  };
}

export function normalizeLessonDomainMap(value = {}, { lessonMicrosequences = [], sourceGuideStructured = {} } = {}) {
  const explicitItems = Array.isArray(value?.items) ? value.items.map(normalizeDomainItem).filter(Boolean) : [];
  const fallbackItems = explicitItems.length ? [] : buildFallbackDomainItems(sourceGuideStructured);
  const items = [...explicitItems, ...fallbackItems];
  const itemIds = new Set(items.map((item) => item.id));
  const explicitPracticeVariants = (Array.isArray(value?.practiceVariants) ? value.practiceVariants : [])
    .map(normalizePracticeVariant)
    .filter((item) => item && itemIds.has(item.domainItemRef));
  const fallbackPracticeVariants = explicitPracticeVariants.length ? [] : buildFallbackPracticeVariants(items);
  const practiceVariants = [...explicitPracticeVariants, ...fallbackPracticeVariants];
  const coverage = summarizeLessonDomainCoverage(items, practiceVariants, lessonMicrosequences);

  return {
    items: coverage.items,
    practiceVariants,
    updatedAt: text(value?.updatedAt) || new Date().toISOString(),
    sourceRefs: list(value?.sourceRefs, { limit: 8 }),
    gapSummary: coverage.gapSummary
  };
}

export function buildLessonDomainMap(lesson = {}) {
  return normalizeLessonDomainMap(lesson?.domainMap || {}, {
    lessonMicrosequences: Array.isArray(lesson?.microsequences) ? lesson.microsequences : [],
    sourceGuideStructured: lesson?.sourceGuideStructured || {}
  });
}

export function buildLessonDomainCoverageReport(lesson = {}) {
  const domainMap = normalizeLessonDomainMap(lesson?.domainMap || {}, {
    lessonMicrosequences: Array.isArray(lesson?.microsequences) ? lesson.microsequences : [],
    sourceGuideStructured: lesson?.sourceGuideStructured || {}
  });
  const itemById = new Map(domainMap.items.map((item) => [item.id, item]));
  const mapIdsToLabels = (ids = []) =>
    ids
      .map((id) => itemById.get(id))
      .filter(Boolean)
      .map((item) => item.label);

  return {
    domainMap,
    uncoveredItems: mapIdsToLabels(domainMap.gapSummary.uncoveredDomainItemIds),
    weakItems: mapIdsToLabels(domainMap.gapSummary.weakDomainItemIds),
    explainedWithoutPractice: mapIdsToLabels(domainMap.gapSummary.explainedWithoutPracticeIds),
    practiceWithoutVariation: mapIdsToLabels(domainMap.gapSummary.practiceWithoutVariationIds),
    examMissing: mapIdsToLabels(domainMap.gapSummary.examMissingIds)
  };
}

export function listCoverageRoles() {
  return [...COVERAGE_ROLES];
}

export function isPracticeCoverageRole(role) {
  return PRACTICE_ROLES.has(text(role));
}

export function isExplanationCoverageRole(role) {
  return EXPLANATION_ROLES.has(text(role));
}

export { normalizeMicrosequenceDidacticMetadata };
