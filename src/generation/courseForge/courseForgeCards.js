import { adaptResourceCardsToPublicCards } from "../resources/adaptResourceCardToPublicCard.js";
import { buildLessonDomainCoverageReport, isPracticeCoverageRole } from "../domain/lessonDomainModel.js";
import { summarizeDidacticProductionPolicyForPrompt } from "../policies/didacticProductionPolicy.js";
import { validateGeneratedCardsStructural } from "../validation/validateGeneratedCardsStructural.js";
import { auditCourseForgeBackstageVocabulary } from "./courseForgeBackstageAudit.js";
import { validateCourseForgeCardSourceRefs } from "./courseForgeSourceRefs.js";

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeArray(value) {
  return Array.isArray(value) ? value : [];
}

export function makeCourseForgeMicrosequenceId(entry = {}) {
  return [
    text(entry.courseKey),
    text(entry.moduleKey),
    text(entry.lessonKey),
    text(entry.microsequenceKey)
  ].join("::");
}

function pickAllowedResourceTypes(lessonPlan = {}) {
  const allowed = normalizeArray(lessonPlan.resourceTags)
    .map(text)
    .filter(Boolean)
    .filter((resourceType) => ["paragraph", "multiple_choice", "block_gap_fill", "table", "code_editor", "plane", "matrix"].includes(resourceType));
  if (allowed.length) {
    return allowed;
  }
  return ["paragraph", "multiple_choice"];
}

function pickPracticeResourceType(allowedResourceTypes = []) {
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
  if (allowedResourceTypes.includes("paragraph")) {
    return "paragraph";
  }
  if (allowedResourceTypes.includes("table")) {
    return "table";
  }
  return allowedResourceTypes[0] || "paragraph";
}

function buildSimpleCardPlan(microsequence = {}, lessonPlan = {}, sourceLedger = []) {
  const allowedResourceTypes = pickAllowedResourceTypes(lessonPlan);
  const expositoryResourceType = pickExpositoryResourceType(allowedResourceTypes);
  const practiceResourceType = pickPracticeResourceType(allowedResourceTypes);
  const sourceRefs = normalizeArray(sourceLedger).map((item) => text(item?.id)).filter(Boolean);
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
      sourceRefs: sourceRefs.slice(0, 1)
    },
    {
      position: 2,
      role: wantsThreeCards ? "guided_example" : "practice",
      label: wantsThreeCards ? "Exemplo guiado" : "Prática breve",
      resourceType: wantsThreeCards ? expositoryResourceType : practiceResourceType,
      sourceRefs: sourceRefs.slice(0, 1)
    }
  ];

  if (wantsThreeCards) {
    plan.push({
      position: 3,
      role: "practice",
      label: "Prática de consolidação",
      resourceType: practiceResourceType,
      sourceRefs: sourceRefs.slice(0, 1)
    });
  }

  return plan;
}

export function buildCourseForgeMicrosequenceContracts({ lessonPlans = [], microsequencePlans = [], sourceLedger = [] } = {}) {
  const lessonByKey = new Map(
    normalizeArray(lessonPlans)
      .map((lessonPlan) => [text(lessonPlan?.lessonKey), lessonPlan])
      .filter(([lessonKey]) => lessonKey)
  );

  return normalizeArray(microsequencePlans).flatMap((lessonPlan) => {
    const lessonKey = text(lessonPlan?.lessonKey);
    const lessonMeta = lessonByKey.get(lessonKey) || {};
    return normalizeArray(lessonPlan?.microsequences).map((microsequence) => {
      const contract = {
        version: "aralearn.courseforge.microsequence-contract.v1",
        courseKey: text(lessonPlan?.courseKey || lessonMeta.courseKey),
        moduleKey: text(lessonPlan?.moduleKey || lessonMeta.moduleKey),
        lessonKey,
        lessonTitle: text(lessonMeta.lessonTitle),
        lessonDescription: text(lessonMeta.lessonDescription),
        microsequenceKey: text(microsequence?.key),
        microsequenceTitle: text(microsequence?.title),
        microsequenceGoal: text(microsequence?.objective || microsequence?.didacticPurpose),
        didacticPurpose: text(microsequence?.didacticPurpose),
        coverageRole: text(microsequence?.coverageRole),
        lessonContext: {
          title: text(lessonMeta.lessonTitle),
          description: text(lessonMeta.lessonDescription),
          tags: normalizeArray(microsequence?.tags).map(text).filter(Boolean),
          sourceGuideStructured: structuredClone(lessonMeta.sourceGuideStructured || {}),
          resourceTags: structuredClone(lessonMeta.resourceTags || []),
          contentTypeTags: structuredClone(lessonMeta.contentTypeTags || []),
          learningActionTags: structuredClone(lessonMeta.learningActionTags || []),
          supportLevel: text(lessonMeta.supportLevel),
          presetId: text(lessonMeta.presetId)
        },
        didacticProductionPolicy: summarizeDidacticProductionPolicyForPrompt({
          weakModelMode: true,
          lessonGuidance: lessonMeta,
          lessonSourceGuideStructured: lessonMeta.sourceGuideStructured || {},
          lessonDomainMap: lessonMeta.domainMap || {},
          studyTrackPolicy: {}
        })
      };
      const cardPlan = buildSimpleCardPlan(microsequence, lessonMeta, sourceLedger);
      return {
        ...contract,
        contractId: makeCourseForgeMicrosequenceId({
          courseKey: contract.courseKey,
          moduleKey: contract.moduleKey,
          lessonKey: contract.lessonKey,
          microsequenceKey: contract.microsequenceKey
        }),
        didacticPlan: {
          microsequenceGoal: contract.microsequenceGoal,
          coverageRole: contract.coverageRole,
          cardPlan
        },
        output: {
          format: "json",
          expectedCardCount: cardPlan.length
        },
        sources: structuredClone(sourceLedger)
      };
    });
  });
}

export function normalizeCourseForgeCardsPayload(payload = {}, contract = {}) {
  const entry = payload?.value || payload;
  const cards = Array.isArray(entry?.cards) ? entry.cards : Array.isArray(entry) ? entry : [];
  return {
    contractId: text(contract.contractId),
    courseKey: text(contract.courseKey),
    moduleKey: text(contract.moduleKey),
    lessonKey: text(contract.lessonKey),
    microsequenceKey: text(contract.microsequenceKey),
    microsequenceTitle: text(contract.microsequenceTitle),
    cards: structuredClone(cards)
  };
}

function makeAuditIssue(entry = {}, type, evidence, requiredFix, severity = "blocking") {
  return {
    contractId: text(entry.contractId),
    courseKey: text(entry.courseKey),
    moduleKey: text(entry.moduleKey),
    lessonKey: text(entry.lessonKey),
    microsequenceKey: text(entry.microsequenceKey),
    severity,
    type,
    evidence,
    requiredFix
  };
}

function hasExplicitDomainMap(domainMap = null) {
  return !!(
    domainMap &&
    typeof domainMap === "object" &&
    (normalizeArray(domainMap.items).length > 0 || normalizeArray(domainMap.practiceVariants).length > 0)
  );
}

function buildLessonEntry(entry = {}, lessonPlan = {}) {
  return {
    key: text(lessonPlan?.lessonKey),
    title: text(lessonPlan?.lessonTitle),
    sourceGuideStructured: structuredClone(lessonPlan?.sourceGuideStructured || {}),
    domainMap: structuredClone(lessonPlan?.domainMap || {}),
    microsequences: normalizeArray(entry?.microsequences).map((microsequence) => ({
      ...structuredClone(microsequence),
      status: "ready",
      included: true
    }))
  };
}

function mergeAuditResults(...results) {
  const issues = [];
  const warnings = [];
  results.forEach((result) => {
    issues.push(...(Array.isArray(result?.issues) ? result.issues : []));
    warnings.push(...(Array.isArray(result?.warnings) ? result.warnings : []));
  });
  return {
    ok: issues.length === 0,
    approved: issues.length === 0,
    issues,
    warnings
  };
}

export function auditCourseForgeCardDrafts({ cardDrafts = [], microsequenceContracts = [] } = {}) {
  const issues = [];
  const warnings = [];
  const contractById = new Map(
    normalizeArray(microsequenceContracts)
      .map((contract) => [text(contract?.contractId), contract])
      .filter(([contractId]) => contractId)
  );
  const normalizedDrafts = [];

  normalizeArray(cardDrafts).forEach((entry) => {
    const contractId = text(entry?.contractId);
    const contract = contractById.get(contractId);
    if (!contract) {
      issues.push(makeAuditIssue(entry, "missing_contract", "Cards sem contrato de microssequência correspondente.", "Reconstruir o contrato antes de gerar os cards."));
      return;
    }

    const structural = validateGeneratedCardsStructural({ cards: entry.cards || [] }, contract);
    if (!structural.ok) {
      issues.push(
        ...structural.structuralErrors.map((error) =>
          makeAuditIssue(entry, "structural_invalid", error, "Regerar os cards obedecendo a posição, o recurso e o schema do plano.")
        )
      );
      return;
    }

    const publicAdaptation = adaptResourceCardsToPublicCards(structural.cards);
    if (!publicAdaptation.ok) {
      issues.push(
        ...publicAdaptation.errors.map((error) =>
          makeAuditIssue(entry, "public_adaptation_failed", error, "Corrigir o card interno para que ele caia no contrato público.")
        )
      );
      return;
    }

    const publicCards = publicAdaptation.cards;
    publicCards.forEach((card, cardIndex) => {
      const backstageAudit = auditCourseForgeBackstageVocabulary({
        card,
        lessonContext: contract.lessonContext || {}
      });
      if (!backstageAudit.ok && !backstageAudit.requiresReview) {
        issues.push(
          makeAuditIssue(
            entry,
            "backstage_vocabulary",
            `Card ${cardIndex + 1} expõe vocabulário de bastidor: ${backstageAudit.issues.join(", ")}.`,
            "Reescrever o card em linguagem didática autossuficiente."
          )
        );
      } else if (backstageAudit.requiresReview) {
        warnings.push(
          makeAuditIssue(
            entry,
            "backstage_review",
            `Card ${cardIndex + 1} usa vocabulário técnico que parece pertencer ao domínio do curso.`,
            "Revisar manualmente se o termo é conteúdo legítimo ou bastidor.",
            "warning"
          )
        );
      }
    });

    const practiceCount = normalizeArray(structural.cards).filter((card) =>
      ["multiple_choice", "block_gap_fill", "table", "code_editor"].includes(text(card?.resourceType))
    ).length;
    if (contract.output?.expectedCardCount >= 3 && practiceCount < 1) {
      issues.push(
        makeAuditIssue(
          entry,
          "practice_gap",
          "Microssequência longa sem card de prática.",
          "Distribuir pelo menos um card de prática ou consolidação."
        )
      );
    }

    normalizedDrafts.push({
      ...structuredClone(entry),
      cards: structuredClone(structural.cards),
      publicCards
    });
  });

  return {
    ok: issues.length === 0,
    approved: issues.length === 0,
    issues,
    warnings,
    normalizedDrafts
  };
}

export function auditCourseForgeSourceAdherence({ cardDrafts = [], sourceLedger = [] } = {}) {
  const issues = [];
  const warnings = [];
  const sourceIds = normalizeArray(sourceLedger).map((item) => text(item?.id)).filter(Boolean);
  const hasSources = sourceIds.length > 0;

  normalizeArray(cardDrafts).forEach((entry) => {
    let cardsWithRefs = 0;
    normalizeArray(entry?.cards).forEach((card, cardIndex) => {
      const sourceRefs = normalizeArray(card?.sourceRefs).map(text).filter(Boolean);
      if (sourceRefs.length) {
        cardsWithRefs += 1;
      }
      const result = validateCourseForgeCardSourceRefs(sourceRefs, sourceLedger);
      if (!result.ok) {
        issues.push(
          ...result.errors.map((error) =>
            makeAuditIssue(
              entry,
              "invalid_source_ref",
              `Card ${cardIndex + 1}: ${error}`,
              "Usar apenas sourceRefs existentes no ledger da run."
            )
          )
        );
      }
    });

    if (hasSources && cardsWithRefs === 0) {
      issues.push(
        makeAuditIssue(
          entry,
          "missing_grounding",
          "Microssequência sem grounding mínimo nas fontes disponíveis.",
          "Adicionar sourceRefs ao menos no card âncora ou no exemplo guiado."
        )
      );
    } else if (hasSources && cardsWithRefs < normalizeArray(entry?.cards).length) {
      warnings.push(
        makeAuditIssue(
          entry,
          "partial_grounding",
          "Nem todos os cards carregam sourceRefs explícitos.",
          "Verificar se a distribuição do grounding está suficiente.",
          "warning"
        )
      );
    }
  });

  return {
    ok: issues.length === 0,
    approved: issues.length === 0,
    issues,
    warnings
  };
}

export function auditCourseForgeDomainCoverage({ microsequencePlans = [], lessonPlans = [] } = {}) {
  const issues = [];
  const warnings = [];
  const lessonByKey = new Map(
    normalizeArray(lessonPlans)
      .map((lessonPlan) => [text(lessonPlan?.lessonKey), lessonPlan])
      .filter(([lessonKey]) => lessonKey)
  );

  normalizeArray(microsequencePlans).forEach((lessonEntry) => {
    const lessonKey = text(lessonEntry?.lessonKey);
    const lessonPlan = lessonByKey.get(lessonKey);
    if (!lessonPlan || !hasExplicitDomainMap(lessonPlan.domainMap)) {
      return;
    }

    const domainMap = lessonPlan.domainMap || {};
    const domainItems = normalizeArray(domainMap.items);
    const practiceVariants = normalizeArray(domainMap.practiceVariants);
    const variantsByDomain = new Map();
    practiceVariants.forEach((variant) => {
      const key = text(variant?.domainItemRef);
      if (!key) {
        return;
      }
      const list = variantsByDomain.get(key) || [];
      list.push(variant);
      variantsByDomain.set(key, list);
    });

    normalizeArray(lessonEntry?.microsequences).forEach((microsequence, microIndex) => {
      const label = text(microsequence?.title) || `microssequência ${microIndex + 1}`;
      const domainRefs = normalizeArray(microsequence?.domainRefs).map(text).filter(Boolean);
      const practiceVariantRefs = normalizeArray(microsequence?.practiceVariantRefs).map(text).filter(Boolean);

      if (!domainRefs.length) {
        issues.push(
          makeAuditIssue(
            {
              lessonKey,
              microsequenceKey: text(microsequence?.key)
            },
            "missing_domain_refs",
            `${label} não referencia nenhum item do domainMap explícito da lição.`,
            "Vincular a microssequência a pelo menos um domainRef da lição."
          )
        );
      }

      if (isPracticeCoverageRole(text(microsequence?.coverageRole))) {
        const hasEligibleVariants = domainRefs.some((domainRef) => normalizeArray(variantsByDomain.get(domainRef)).length > 0);
        if (hasEligibleVariants && !practiceVariantRefs.length) {
          issues.push(
            makeAuditIssue(
              {
                lessonKey,
                microsequenceKey: text(microsequence?.key)
              },
              "missing_practice_variant_refs",
              `${label} pratica um item do domínio, mas não declara practiceVariantRefs.`,
              "Escolher ao menos uma variação de prática compatível com os domainRefs."
            )
          );
        }
      }
    });

    const coverageReport = buildLessonDomainCoverageReport(buildLessonEntry(lessonEntry, lessonPlan));
    const domainItemById = new Map(domainItems.map((item) => [text(item?.id), item]));
    coverageReport.domainMap.gapSummary.uncoveredDomainItemIds.forEach((domainItemId) => {
      const item = domainItemById.get(domainItemId);
      if (text(item?.priority) !== "core") {
        warnings.push(
          makeAuditIssue(
            { lessonKey },
            "uncovered_support_domain_item",
            `O item de domínio ${text(item?.label) || domainItemId} ainda está descoberto.`,
            "Verificar se ele precisa virar nova microssequência ou ajuste local.",
            "warning"
          )
        );
        return;
      }
      issues.push(
        makeAuditIssue(
          { lessonKey },
          "uncovered_core_domain_item",
          `O item central ${text(item?.label) || domainItemId} ficou sem cobertura.`,
          "Adicionar ou corrigir microssequência para cobrir esse item central."
        )
      );
    });
    coverageReport.domainMap.gapSummary.explainedWithoutPracticeIds.forEach((domainItemId) => {
      const item = domainItemById.get(domainItemId);
      issues.push(
        makeAuditIssue(
          { lessonKey },
          "explained_without_practice",
          `O item ${text(item?.label) || domainItemId} foi explicado sem prática correspondente.`,
          "Distribuir prática explícita para esse item."
        )
      );
    });
    coverageReport.domainMap.gapSummary.weakDomainItemIds.forEach((domainItemId) => {
      const item = domainItemById.get(domainItemId);
      warnings.push(
        makeAuditIssue(
          { lessonKey },
          "weak_domain_item",
          `O item ${text(item?.label) || domainItemId} ficou com cobertura fraca.`,
          "Revisar progressão, clareza ou prática associada.",
          "warning"
        )
      );
    });
    coverageReport.domainMap.gapSummary.practiceWithoutVariationIds.forEach((domainItemId) => {
      const item = domainItemById.get(domainItemId);
      warnings.push(
        makeAuditIssue(
          { lessonKey },
          "practice_without_variation",
          `O item ${text(item?.label) || domainItemId} recebeu prática sem variação suficiente.`,
          "Considerar nova variação de prática para reduzir repetição.",
          "warning"
        )
      );
    });
    coverageReport.domainMap.gapSummary.redundantDomainItemIds.forEach((domainItemId) => {
      const item = domainItemById.get(domainItemId);
      warnings.push(
        makeAuditIssue(
          { lessonKey },
          "redundant_domain_item",
          `O item ${text(item?.label) || domainItemId} parece coberto de forma redundante.`,
          "Reduzir duplicação ou diferenciar a função didática das microssequências.",
          "warning"
        )
      );
    });
  });

  return {
    ok: issues.length === 0,
    approved: issues.length === 0,
    issues,
    warnings
  };
}

export function repairCourseForgeDraftCardsDeterministically({ cardDrafts = [], sourceLedger = [] } = {}) {
  const fallbackSourceId = text(normalizeArray(sourceLedger)[0]?.id);
  return normalizeArray(cardDrafts).map((entry) => {
    const cards = normalizeArray(entry?.cards).map((card, cardIndex) => {
      const validSourceRefs = normalizeArray(card?.sourceRefs)
        .map(text)
        .filter(Boolean)
        .filter((sourceId) => validateCourseForgeCardSourceRefs([sourceId], sourceLedger).ok);
      const nextSourceRefs = validSourceRefs.length
        ? validSourceRefs
        : fallbackSourceId && cardIndex === 0
          ? [fallbackSourceId]
          : [];
      return {
        ...structuredClone(card),
        sourceRefs: nextSourceRefs
      };
    });
    return {
      ...structuredClone(entry),
      cards
    };
  });
}

export function repairCourseForgeMicrosequenceMetadataDeterministically({ microsequencePlans = [], lessonPlans = [] } = {}) {
  const lessonByKey = new Map(
    normalizeArray(lessonPlans)
      .map((lessonPlan) => [text(lessonPlan?.lessonKey), lessonPlan])
      .filter(([lessonKey]) => lessonKey)
  );

  return normalizeArray(microsequencePlans).map((lessonEntry) => {
    const lessonPlan = lessonByKey.get(text(lessonEntry?.lessonKey));
    if (!lessonPlan || !hasExplicitDomainMap(lessonPlan.domainMap)) {
      return structuredClone(lessonEntry);
    }

    const domainMap = lessonPlan.domainMap || {};
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

    return {
      ...structuredClone(lessonEntry),
      microsequences: normalizeArray(lessonEntry?.microsequences).map((microsequence) => {
        const currentDomainRefs = normalizeArray(microsequence?.domainRefs).map(text).filter(Boolean);
        const nextDomainRefs = currentDomainRefs.length
          ? currentDomainRefs
          : coreDomainIds.length === 1
            ? [coreDomainIds[0]]
            : [];
        const currentPracticeVariantRefs = normalizeArray(microsequence?.practiceVariantRefs).map(text).filter(Boolean);
        const nextPracticeVariantRefs =
          currentPracticeVariantRefs.length
            ? currentPracticeVariantRefs
            : isPracticeCoverageRole(text(microsequence?.coverageRole))
              ? nextDomainRefs.flatMap((domainRef) => normalizeArray(variantsByDomain.get(domainRef)).map((variant) => text(variant?.id))).slice(0, 1)
              : [];

        return {
          ...structuredClone(microsequence),
          domainRefs: nextDomainRefs,
          practiceVariantRefs: nextPracticeVariantRefs
        };
      })
    };
  });
}

export function mergeCourseForgeAdherenceAudits(...audits) {
  return mergeAuditResults(...audits);
}
