import { adaptResourceCardsToPublicCards } from "../resources/adaptResourceCardToPublicCard.js";
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
        }
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
