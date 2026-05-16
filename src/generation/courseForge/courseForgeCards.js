import { adaptResourceCardsToPublicCards } from "../resources/adaptResourceCardToPublicCard.js";
import { buildLessonDomainCoverageReport, isPracticeCoverageRole } from "../domain/lessonDomainModel.js";
import { sortLessonMicrosequencesDeterministically } from "../domain/resolveLessonMicrosequenceOrder.js";
import { summarizeDidacticProductionPolicyForPrompt } from "../policies/didacticProductionPolicy.js";
import { validateGeneratedCardsStructural } from "../validation/validateGeneratedCardsStructural.js";
import { auditCourseForgeBackstageVocabulary } from "./courseForgeBackstageAudit.js";
import { listCourseForgeSourceSpans, listCourseForgeSources } from "./courseForgeSourceLedger.js";
import { normalizeCourseForgeCardSourceRefs, validateCourseForgeCardSourceRefs } from "./courseForgeSourceRefs.js";

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeArray(value) {
  return Array.isArray(value) ? value : [];
}

function containsDidacticTerm(value = "", terms = []) {
  const normalized = text(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  return normalizeArray(terms).some((term) => normalized.includes(String(term).toLowerCase()));
}

function hasExplanationCoverageRole(role = "") {
  return ["introduce", "explain", "demonstrate", "consolidate"].includes(text(role));
}

function pickTransformationStateForPlan(role = "") {
  const normalized = text(role);
  if (normalized === "anchor") return "literal";
  if (["guided_example", "minimal_example"].includes(normalized)) return "example";
  if (["practice", "guided_practice", "independent_practice", "exam_transfer"].includes(normalized)) return "application";
  if (["contrast", "common_error"].includes(normalized)) return "inference";
  return "paraphrase";
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
  const sourceRefs = listCourseForgeSources(sourceLedger).map((item) => text(item?.sourceId || item?.id)).filter(Boolean);
  const sourceSpans = listCourseForgeSourceSpans(sourceLedger);
  const firstSourceId = sourceRefs[0] || "";
  const firstSpanId = sourceSpans.find((span) => text(span?.sourceId) === firstSourceId)?.spanId || sourceSpans[0]?.spanId || "";
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
      transformationState: pickTransformationStateForPlan("anchor")
    },
    {
      position: 2,
      role: wantsThreeCards ? "guided_example" : "practice",
      label: wantsThreeCards ? "Exemplo guiado" : "Prática breve",
      resourceType: wantsThreeCards ? expositoryResourceType : practiceResourceType,
      sourceRefs: sourceRefs.slice(0, 1),
      sourceSpanRefs: firstSpanId ? [firstSpanId] : [],
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
      transformationState: pickTransformationStateForPlan("practice")
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
        sources: structuredClone(listCourseForgeSources(sourceLedger)),
        domainRefs: normalizeArray(microsequence?.domainRefs).map(text).filter(Boolean)
      };
    });
  });
}

function buildSourceSupportForCard(card = {}, plannedCard = {}, sourceLedger = []) {
  const explicit = normalizeCourseForgeCardSourceRefs(card?.sourceRefs, sourceLedger);
  if (explicit.length) {
    return explicit;
  }
  const fallbackSourceIds = normalizeArray(plannedCard?.sourceRefs).map(text).filter(Boolean);
  const fallbackSpanIds = normalizeArray(plannedCard?.sourceSpanRefs).map(text).filter(Boolean);
  if (!fallbackSourceIds.length && !fallbackSpanIds.length) {
    return [];
  }
  return normalizeCourseForgeCardSourceRefs(
    fallbackSourceIds.map((sourceId, index) => ({
      sourceId,
      spanId: fallbackSpanIds[index] || fallbackSpanIds[0] || "",
      confidence: "medium",
      transformationState: text(plannedCard?.transformationState) || pickTransformationStateForPlan(plannedCard?.role),
      note: ""
    })),
    sourceLedger
  );
}

export function normalizeCourseForgeCardsPayload(payload = {}, contract = {}) {
  const entry = payload?.value || payload;
  const cards = Array.isArray(entry?.cards) ? entry.cards : Array.isArray(entry) ? entry : [];
  const plannedByPosition = new Map(
    normalizeArray(contract?.didacticPlan?.cardPlan)
      .filter((item) => Number.isInteger(item?.position))
      .map((item) => [item.position, item])
  );
  return {
    contractId: text(contract.contractId),
    courseKey: text(contract.courseKey),
    moduleKey: text(contract.moduleKey),
    lessonKey: text(contract.lessonKey),
    microsequenceKey: text(contract.microsequenceKey),
    microsequenceTitle: text(contract.microsequenceTitle),
    cards: structuredClone(cards),
    sourceSupport: cards.map((card, index) =>
      buildSourceSupportForCard(
        card,
        plannedByPosition.get(Number(card?.position)) || normalizeArray(contract?.didacticPlan?.cardPlan)[index] || {},
        contract?.sources || []
      )
    )
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
  const sourceIds = listCourseForgeSources(sourceLedger).map((item) => text(item?.sourceId || item?.id)).filter(Boolean);
  const hasSources = sourceIds.length > 0;

  normalizeArray(cardDrafts).forEach((entry) => {
    let cardsWithRefs = 0;
    normalizeArray(entry?.cards).forEach((card, cardIndex) => {
      const sourceSupport = normalizeArray(entry?.sourceSupport?.[cardIndex]).length
        ? normalizeArray(entry?.sourceSupport?.[cardIndex])
        : buildSourceSupportForCard(card, {}, sourceLedger);
      const sourceRefs = sourceSupport.map((item) => text(item?.sourceId)).filter(Boolean);
      if (sourceSupport.length) {
        cardsWithRefs += 1;
      }
      const result = validateCourseForgeCardSourceRefs(sourceSupport, sourceLedger);
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
      result.normalized.forEach((support) => {
        if (support.transformationState === "unsupported") {
          issues.push(
            makeAuditIssue(
              entry,
              "unsupported_grounding",
              `Card ${cardIndex + 1} foi marcado como unsupported.`,
              "Reescrever o card com suporte real em source span ou marcar enriquecimento externo responsável."
            )
          );
        }
        if (support.transformationState === "contradicted") {
          issues.push(
            makeAuditIssue(
              entry,
              "contradicted_grounding",
              `Card ${cardIndex + 1} contradiz a evidência de origem declarada.`,
              "Corrigir o card ou trocar a evidência usada."
            )
          );
        }
        if (support.transformationState === "external_enrichment") {
          warnings.push(
            makeAuditIssue(
              entry,
              "external_enrichment",
              `Card ${cardIndex + 1} depende de enriquecimento externo além da fonte principal.`,
              "Revisar se o enriquecimento externo é desejável para esta lição.",
              "warning"
            )
          );
        }
      });
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

function summarizeMicrosequenceDidacticText(microsequence = {}) {
  return [
    text(microsequence?.title),
    text(microsequence?.description),
    text(microsequence?.didacticPurpose || microsequence?.objective),
    text(microsequence?.coverageRole),
    normalizeArray(microsequence?.tags).map(text).join(" ")
  ].join(" ");
}

function scoreMicrosequenceForInterventionType(microsequence = {}, didacticInterventionType = "") {
  const combined = summarizeMicrosequenceDidacticText(microsequence);
  const coverageRole = text(microsequence?.coverageRole);
  const explanationRole = hasExplanationCoverageRole(coverageRole);
  const practiceRole = isPracticeCoverageRole(coverageRole);
  if (didacticInterventionType === "contrast_reinforcement") {
    return containsDidacticTerm(combined, ["contrast", "contraste", "contraexemplo", "diferenca", "diferença", "erro"]) ? 10 : 0;
  }
  if (didacticInterventionType === "guided_practice_bridge") {
    return practiceRole || containsDidacticTerm(combined, ["pratica", "practice", "treino", "guiad", "exercicio", "exercício"]) ? 10 : 0;
  }
  if (didacticInterventionType === "prerequisite_tightening") {
    return explanationRole && !practiceRole ? 10 : 0;
  }
  if (didacticInterventionType === "explanatory_bridge") {
    return explanationRole && !practiceRole ? 10 : 0;
  }
  if (didacticInterventionType === "local_semantic_rewrite") {
    return 10;
  }
  return 0;
}

function explainInterventionTypeExpectation(didacticInterventionType = "") {
  if (didacticInterventionType === "contrast_reinforcement") {
    return "explicitar contraste, contraexemplo ou discriminação local";
  }
  if (didacticInterventionType === "guided_practice_bridge") {
    return "materializar um degrau de prática guiada antes da prática principal";
  }
  if (didacticInterventionType === "prerequisite_tightening") {
    return "fechar a lacuna preparatória com explicação ou preparação explícita";
  }
  if (didacticInterventionType === "explanatory_bridge") {
    return "criar uma ponte explicativa local antes da aplicação";
  }
  if (didacticInterventionType === "local_semantic_rewrite") {
    return "reescrever localmente a microssequência mantendo o alvo explícito";
  }
  return "obedecer ao tipo didático explícito da intervenção";
}

function selectInterventionMicrosequencesByLesson({ lessonEntry = {}, actions = [] } = {}) {
  const remaining = normalizeArray(lessonEntry?.microsequences).map((microsequence) => structuredClone(microsequence));
  const selected = [];
  normalizeArray(actions).forEach((action) => {
    let bestIndex = -1;
    let bestScore = -1;
    remaining.forEach((microsequence, index) => {
      const score = scoreMicrosequenceForInterventionType(microsequence, text(action?.didacticInterventionType));
      if (score > bestScore) {
        bestScore = score;
        bestIndex = index;
      }
    });
    if (bestIndex >= 0) {
      const [microsequence] = remaining.splice(bestIndex, 1);
      selected.push({ action, microsequence, score: bestScore });
    } else {
      selected.push({ action, microsequence: null, score: -1 });
    }
  });
  return selected;
}

export function auditCourseForgeInterventionDidacticCoherence({ microsequencePlans = [], interventionPlan = null } = {}) {
  const issues = [];
  const warnings = [];
  const actions = normalizeArray(interventionPlan?.actions);
  if (!actions.length) {
    return { ok: true, approved: true, issues, warnings };
  }

  const lessonEntryByKey = new Map(
    normalizeArray(microsequencePlans)
      .map((lessonEntry) => [text(lessonEntry?.lessonKey), lessonEntry])
      .filter(([lessonKey]) => lessonKey)
  );

  const existingActions = actions.filter((action) => !action?.expectsNewMicrosequence);
  existingActions.forEach((action) => {
    const lessonKey = text(action?.target?.lessonKey) || text(action?.lessonTargets?.[0]?.lessonKey);
    const lessonEntry = lessonEntryByKey.get(lessonKey);
    const targetedMicrosequence = normalizeArray(lessonEntry?.microsequences).find(
      (microsequence) => text(microsequence?.key) === text(action?.existingMicrosequenceKey)
    ) || null;

    if (!targetedMicrosequence) {
      issues.push(
        {
          ...makeAuditIssue(
          {
            courseKey: action?.target?.courseKey,
            moduleKey: action?.target?.moduleKey,
            lessonKey,
            microsequenceKey: action?.existingMicrosequenceKey
          },
          "missing_intervention_target",
          `A ação ${text(action?.requestedChangeId) || text(action?.actionId)} não encontrou a microssequência alvo no plano resultante.`,
          "Preservar a microssequência alvo no plano local ou reparar a resolução do alvo."
          ),
          requestedChangeId: text(action?.requestedChangeId),
          didacticInterventionType: text(action?.didacticInterventionType)
        }
      );
      return;
    }

    const score = scoreMicrosequenceForInterventionType(targetedMicrosequence, text(action?.didacticInterventionType));
    if (score <= 0) {
      issues.push(
        {
          ...makeAuditIssue(
          {
            courseKey: action?.target?.courseKey,
            moduleKey: action?.target?.moduleKey,
            lessonKey,
            microsequenceKey: targetedMicrosequence?.key
          },
          "intervention_type_mismatch",
          `A ação ${text(action?.requestedChangeId) || text(action?.actionId)} pediu ${text(action?.didacticInterventionType)}, mas ${text(targetedMicrosequence?.title) || text(targetedMicrosequence?.key)} não parece ${explainInterventionTypeExpectation(text(action?.didacticInterventionType))}.`,
          "Reescrever a microssequência para materializar explicitamente a função didática pedida."
          ),
          requestedChangeId: text(action?.requestedChangeId),
          didacticInterventionType: text(action?.didacticInterventionType)
        }
      );
    }
  });

  const newActionsByLesson = new Map();
  actions
    .filter((action) => action?.expectsNewMicrosequence)
    .forEach((action) => {
      const lessonKey = text(action?.target?.lessonKey) || text(action?.lessonTargets?.[0]?.lessonKey);
      if (!lessonKey) {
        return;
      }
      const items = newActionsByLesson.get(lessonKey) || [];
      items.push(action);
      newActionsByLesson.set(lessonKey, items);
    });

  newActionsByLesson.forEach((lessonActions, lessonKey) => {
    const lessonEntry = lessonEntryByKey.get(lessonKey);
    const selections = selectInterventionMicrosequencesByLesson({ lessonEntry, actions: lessonActions });
    selections.forEach(({ action, microsequence, score }) => {
      if (!microsequence) {
        issues.push(
          {
            ...makeAuditIssue(
            {
              courseKey: action?.target?.courseKey,
              moduleKey: action?.target?.moduleKey,
              lessonKey
            },
            "missing_intervention_microsequence",
            `A ação ${text(action?.requestedChangeId) || text(action?.actionId)} não encontrou nenhuma nova microssequência correspondente no plano resultante.`,
            "Gerar a microssequência local pedida antes de compilar o patch."
            ),
            requestedChangeId: text(action?.requestedChangeId),
            didacticInterventionType: text(action?.didacticInterventionType)
          }
        );
        return;
      }
      if (score <= 0) {
        issues.push(
          {
            ...makeAuditIssue(
            {
              courseKey: action?.target?.courseKey,
              moduleKey: action?.target?.moduleKey,
              lessonKey,
              microsequenceKey: microsequence?.key
            },
            "intervention_type_mismatch",
            `A ação ${text(action?.requestedChangeId) || text(action?.actionId)} pediu ${text(action?.didacticInterventionType)}, mas ${text(microsequence?.title) || text(microsequence?.key)} não parece ${explainInterventionTypeExpectation(text(action?.didacticInterventionType))}.`,
            "Ajustar o plano da nova microssequência para refletir explicitamente a função didática pedida."
            ),
            requestedChangeId: text(action?.requestedChangeId),
            didacticInterventionType: text(action?.didacticInterventionType)
          }
        );
      }
    });
  });

  return {
    ok: issues.length === 0,
    approved: issues.length === 0,
    issues,
    warnings
  };
}

function buildInterventionRepairDirective(issue = {}, action = null) {
  const didacticInterventionType = text(action?.didacticInterventionType);
  if (text(issue?.type) === "missing_intervention_target") {
    return {
      directiveType: "preserve_target_microsequence",
      requestedChangeId: text(action?.requestedChangeId),
      didacticInterventionType,
      target: {
        courseKey: text(action?.target?.courseKey || issue?.courseKey),
        moduleKey: text(action?.target?.moduleKey || issue?.moduleKey),
        lessonKey: text(action?.target?.lessonKey || issue?.lessonKey),
        microsequenceKey: text(action?.existingMicrosequenceKey || issue?.microsequenceKey)
      },
      instruction: "Preserve a microssequência alvo pedida pela intervenção e reescreva seu conteúdo sem trocar o alvo local.",
      evidence: text(issue?.evidence)
    };
  }
  if (text(issue?.type) === "missing_intervention_microsequence") {
    return {
      directiveType: "generate_missing_intervention_microsequence",
      requestedChangeId: text(action?.requestedChangeId),
      didacticInterventionType,
      target: {
        courseKey: text(action?.target?.courseKey || issue?.courseKey),
        moduleKey: text(action?.target?.moduleKey || issue?.moduleKey),
        lessonKey: text(action?.target?.lessonKey || issue?.lessonKey),
        microsequenceKey: ""
      },
      instruction: `Gere exatamente uma nova microssequência que materialize ${explainInterventionTypeExpectation(didacticInterventionType)}.`,
      evidence: text(issue?.evidence)
    };
  }
  if (text(issue?.type) === "intervention_type_mismatch") {
    return {
      directiveType: "rewrite_for_didactic_intervention_type",
      requestedChangeId: text(action?.requestedChangeId),
      didacticInterventionType,
      target: {
        courseKey: text(action?.target?.courseKey || issue?.courseKey),
        moduleKey: text(action?.target?.moduleKey || issue?.moduleKey),
        lessonKey: text(action?.target?.lessonKey || issue?.lessonKey),
        microsequenceKey: text(action?.existingMicrosequenceKey || issue?.microsequenceKey)
      },
      instruction: `Reescreva a microssequência para ${explainInterventionTypeExpectation(didacticInterventionType)}.`,
      evidence: text(issue?.evidence)
    };
  }
  return null;
}

function buildCoverageRepairDirective(issue = {}) {
  return {
    directiveType: "repair_domain_coverage",
    requestedChangeId: "",
    didacticInterventionType: "",
    target: {
      courseKey: text(issue?.courseKey),
      moduleKey: text(issue?.moduleKey),
      lessonKey: text(issue?.lessonKey),
      microsequenceKey: text(issue?.microsequenceKey)
    },
    instruction: text(issue?.requiredFix) || "Corrigir a cobertura de domínio e a progressão didática local.",
    evidence: text(issue?.evidence)
  };
}

export function buildCourseForgeMicrosequenceRepairDirectives({
  adherenceAudit = {},
  interventionDidacticAudit = {},
  interventionPlan = null
} = {}) {
  const interventionActions = new Map(
    normalizeArray(interventionPlan?.actions)
      .map((action) => [text(action?.requestedChangeId), action])
      .filter(([requestedChangeId]) => requestedChangeId)
  );
  const directives = [];

  normalizeArray(interventionDidacticAudit?.issues).forEach((issue) => {
    const action = interventionActions.get(text(issue?.requestedChangeId)) || interventionActions.get(text(issue?.metadata?.requestedChangeId)) || null;
    const directive = buildInterventionRepairDirective(issue, action);
    if (directive) {
      directives.push(directive);
    }
  });

  normalizeArray(adherenceAudit?.issues).forEach((issue) => {
    directives.push(buildCoverageRepairDirective(issue));
  });

  return {
    kind: "microsequence_repair_directives",
    directives: directives.filter(Boolean)
  };
}

export function auditCourseForgePrerequisiteCoverage({ microsequencePlans = [], courseGraph = {} } = {}) {
  const issues = [];
  const warnings = [];
  const prerequisiteRefsByConcept = new Map();

  normalizeArray(courseGraph?.prerequisiteEdges).forEach((edge) => {
    const targetId = text(edge?.to);
    const sourceId = text(edge?.from);
    if (!targetId || !sourceId) {
      return;
    }
    const refs = prerequisiteRefsByConcept.get(targetId) || [];
    refs.push(sourceId);
    prerequisiteRefsByConcept.set(targetId, refs);
  });

  normalizeArray(microsequencePlans).forEach((lessonEntry) => {
    const explainedConcepts = new Set();
    normalizeArray(lessonEntry?.microsequences).forEach((microsequence, microIndex) => {
      const label = text(microsequence?.title) || `microssequência ${microIndex + 1}`;
      const role = text(microsequence?.coverageRole);
      const domainRefs = normalizeArray(microsequence?.domainRefs).map(text).filter(Boolean);

      domainRefs.forEach((domainRef) => {
        const prerequisiteRefs = normalizeArray(prerequisiteRefsByConcept.get(domainRef)).map(text).filter(Boolean);
        const missingPrerequisites = prerequisiteRefs.filter((ref) => !explainedConcepts.has(ref));
        if (missingPrerequisites.length && !hasExplanationCoverageRole(role)) {
          issues.push(
            makeAuditIssue(
              {
                courseKey: lessonEntry?.courseKey,
                moduleKey: lessonEntry?.moduleKey,
                lessonKey: lessonEntry?.lessonKey,
                microsequenceKey: microsequence?.key
              },
              "missing_prerequisite_preparation",
              `${label} usa ${domainRef} antes de preparar seus pré-requisitos: ${missingPrerequisites.join(", ")}.`,
              "Reordenar a microssequência ou introduzir os pré-requisitos antes da prática."
            )
          );
        }
        if (isPracticeCoverageRole(role) && prerequisiteRefs.length && !explainedConcepts.has(domainRef)) {
          issues.push(
            makeAuditIssue(
              {
                courseKey: lessonEntry?.courseKey,
                moduleKey: lessonEntry?.moduleKey,
                lessonKey: lessonEntry?.lessonKey,
                microsequenceKey: microsequence?.key
              },
              "practice_before_explanation",
              `${label} pratica ${domainRef} antes de haver preparação explícita no fluxo.`,
              "Mover a prática para depois de uma microssequência de introdução, explicação ou demonstração."
            )
          );
        }
      });

      if (hasExplanationCoverageRole(role)) {
        domainRefs.forEach((domainRef) => explainedConcepts.add(domainRef));
      } else if (!role && domainRefs.length) {
        warnings.push(
          makeAuditIssue(
            {
              courseKey: lessonEntry?.courseKey,
              moduleKey: lessonEntry?.moduleKey,
              lessonKey: lessonEntry?.lessonKey,
              microsequenceKey: microsequence?.key
            },
            "missing_coverage_role",
            `${label} não declara coverageRole, então a auditoria de pré-requisito perde precisão.`,
            "Definir coverageRole explícito na microssequência.",
            "warning"
          )
        );
      }
    });
  });

  return {
    ok: issues.length === 0,
    approved: issues.length === 0,
    issues,
    warnings
  };
}

export function auditCourseForgeAssessmentAlignment({ cardsFinal = [], assessmentProfile = {}, courseGraph = {}, lessonPlans = [] } = {}) {
  const issues = [];
  const warnings = [];
  const publicCards = normalizeArray(cardsFinal).flatMap((entry) => normalizeArray(entry?.publicCards));
  const questionTypes = normalizeArray(assessmentProfile?.questionTypes).map(text).filter(Boolean);
  const examTypes = normalizeArray(assessmentProfile?.examTypes).map(text).filter(Boolean);
  const expectedPrecision = text(assessmentProfile?.expectedPrecision);
  const hasMultipleChoice = publicCards.some((card) => text(card?.ask) && normalizeArray(card?.wrong).length > 0);
  const hasGapFill = publicCards.some((card) => text(card?.say).includes("[["));
  const hasAssessmentTargets = normalizeArray(courseGraph?.assessmentTargets).length > 0;
  const hasNotationSensitiveCard = publicCards.some((card) =>
    /[`∧∨¬→↔=+\-*/]/u.test(`${text(card?.title)} ${text(card?.say)} ${text(card?.after)} ${text(card?.ask)}`)
  );
  const supportsGapFill = lessonPlans.some((lessonPlan) => normalizeArray(lessonPlan?.resourceTags).map(text).includes("block_gap_fill"));

  if (questionTypes.includes("multiple_choice") && !hasMultipleChoice) {
    issues.push(
      makeAuditIssue(
        {},
        "missing_multiple_choice",
        "O AssessmentProfile pede múltipla escolha, mas os cards finais não materializaram esse formato.",
        "Gerar ao menos um card de múltipla escolha alinhado ao perfil avaliativo."
      )
    );
  }

  if (questionTypes.includes("gap_fill") && !hasGapFill) {
    const target = supportsGapFill ? issues : warnings;
    target.push(
      makeAuditIssue(
        {},
        "missing_gap_fill",
        "O AssessmentProfile pede lacuna/completar, mas os cards finais não materializaram esse formato.",
        supportsGapFill
          ? "Gerar ao menos um card de lacuna alinhado ao perfil avaliativo."
          : "O perfil pediu lacuna, mas a lição atual não declara esse contêiner como recurso permitido.",
        supportsGapFill ? "blocking" : "warning"
      )
    );
  }

  if (examTypes.length && !hasAssessmentTargets) {
    warnings.push(
      makeAuditIssue(
        {},
        "missing_assessment_targets",
        "Há sinais de prova ou lista avaliativa, mas o grafo não declarou assessmentTargets explícitos.",
        "Projetar assessmentTargets no CourseGraph para governar melhor a cobrança.",
        "warning"
      )
    );
  }

  if (expectedPrecision === "high" && !hasNotationSensitiveCard) {
    warnings.push(
      makeAuditIssue(
        {},
        "low_precision_surface",
        "O AssessmentProfile pede alta precisão terminológica, mas os cards finais não mostram sinal claro de notação ou precisão formal.",
        "Revisar se a superfície dos cards preserva notação, nomes técnicos e precisão de cobrança.",
        "warning"
      )
    );
  }

  return {
    ok: issues.length === 0,
    approved: issues.length === 0,
    issues,
    warnings
  };
}

export function repairCourseForgeDraftCardsDeterministically({ cardDrafts = [], sourceLedger = [] } = {}) {
  const fallbackSourceId = text(listCourseForgeSources(sourceLedger)[0]?.sourceId || listCourseForgeSources(sourceLedger)[0]?.id);
  const fallbackSpanId = text(listCourseForgeSourceSpans(sourceLedger)[0]?.spanId);
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
    const sourceSupport = cards.map((card, cardIndex) => {
      const existingSupport = normalizeArray(entry?.sourceSupport?.[cardIndex]);
      const repaired = normalizeCourseForgeCardSourceRefs(existingSupport.length ? existingSupport : card?.sourceRefs, sourceLedger);
      if (repaired.length) {
        return repaired.map((item) => ({
          ...item,
          spanId: text(item?.spanId) || fallbackSpanId,
          note: text(item?.note)
        }));
      }
      if (!fallbackSourceId || !fallbackSpanId || cardIndex !== 0) {
        return [];
      }
      return normalizeCourseForgeCardSourceRefs(
        [
          {
            sourceId: fallbackSourceId,
            spanId: fallbackSpanId,
            confidence: "medium",
            transformationState: "paraphrase",
            note: ""
          }
        ],
        sourceLedger
      );
    });
    return {
      ...structuredClone(entry),
      cards,
      sourceSupport
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
    if (!lessonPlan) {
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

    const repairedMicrosequences = normalizeArray(lessonEntry?.microsequences).map((microsequence) => {
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

export function mergeCourseForgeAdherenceAudits(...audits) {
  return mergeAuditResults(...audits);
}
