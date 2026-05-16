import { normalizeLessonDomainMap } from "../domain/lessonDomainModel.js";
import { listCourseForgeSourceClaims, listCourseForgeSourceSpans, listCourseForgeSources } from "./courseForgeSourceLedger.js";

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeArray(value) {
  return Array.isArray(value) ? value : [];
}

function unique(values = []) {
  return [...new Set(normalizeArray(values).map(text).filter(Boolean))];
}

const MATCH_STOPWORDS = new Set(["para", "com", "uma", "das", "dos", "que", "por", "ser", "sao", "são", "como", "mais", "menos"]);

function normalizeForMatch(value = "") {
  return text(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function tokenizeForMatch(value = "") {
  return [...new Set(
    normalizeForMatch(value)
      .split(/[^a-z0-9_]+/u)
      .map((item) => item.trim())
      .filter((item) => item.length >= 3)
      .filter((item) => !MATCH_STOPWORDS.has(item))
  )];
}

function slugify(value = "") {
  return normalizeForMatch(value)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

function findMatchingSourceClaims(queryValues = [], sourceClaims = [], { minimumOverlap = null } = {}) {
  const queryTokens = unique(normalizeArray(queryValues).flatMap((value) => tokenizeForMatch(value)));
  if (queryTokens.length < 2) {
    return [];
  }
  const overlapThreshold = Number.isInteger(minimumOverlap) ? minimumOverlap : Math.min(2, queryTokens.length);
  return normalizeArray(sourceClaims)
    .map((claim) => ({
      ...claim,
      overlap: normalizeArray(claim?.tokens).filter((token) => queryTokens.includes(token)).length
    }))
    .filter((claim) => claim.overlap >= overlapThreshold)
    .sort((left, right) => right.overlap - left.overlap || text(left?.claimId).localeCompare(text(right?.claimId)))
    .slice(0, 4);
}

function extractConceptLabelFromClaim(claimText = "") {
  const normalized = text(claimText)
    .replace(/^[AaOo]\s+/u, "")
    .replace(/^[Aa]s\s+/u, "")
    .replace(/^[Oo]s\s+/u, "");
  const parts = normalized
    .split(/\b(e|sao|são|é|exige|aceita|permite|representa|usa|define|indica|compara)\b/iu)
    .map((item) => text(item))
    .filter(Boolean);
  const candidate = text(parts[0] || normalized)
    .replace(/[.:,;!?]+$/u, "")
    .trim();
  if (candidate.length < 4 || candidate.length > 80) {
    return "";
  }
  return candidate.charAt(0).toUpperCase() + candidate.slice(1);
}

function inferConceptKindFromLabel(label = "") {
  if (/[`∧∨¬→↔=+\-*/]/u.test(text(label))) {
    return "notation";
  }
  if (/\b(diferenca|diferença|compar|contraste|versus)\b/iu.test(text(label))) {
    return "comparison";
  }
  return "concept";
}

function buildClaimDrivenConcepts({ lessonKey = "", lessonPlan = {}, sourceClaims = [], existingLabels = new Set(), usedConceptIds = new Set() } = {}) {
  const lessonQuery = [
    lessonPlan?.lessonTitle,
    lessonPlan?.lessonDescription,
    lessonPlan?.sourceGuideStructured?.lessonGoal,
    lessonPlan?.sourceGuideStructured?.notationRules,
    lessonPlan?.sourceGuideStructured?.commonErrors
  ];
  const matchedClaims = findMatchingSourceClaims(lessonQuery, sourceClaims, { minimumOverlap: 1 });
  return matchedClaims
    .map((claim, index) => {
      const label = extractConceptLabelFromClaim(claim?.text);
      const normalizedLabel = normalizeForMatch(label);
      if (!label || existingLabels.has(normalizedLabel)) {
        return null;
      }
      existingLabels.add(normalizedLabel);
      return {
        conceptId: ensureUniqueGraphId(`claim-${slugify(label) || index + 1}`, lessonKey, usedConceptIds),
        label,
        kind: inferConceptKindFromLabel(label),
        priority: "support",
        sourceRefs: unique([claim?.sourceId]),
        sourceClaimRefs: unique([claim?.claimId]),
        expectedEvidence: unique([claim?.text]),
        representations: [],
        assessmentFormats: [],
        lessonKey,
        inferredFrom: "source_claim"
      };
    })
    .filter(Boolean)
    .slice(0, 4);
}

function containsComparisonSignal(value = "") {
  return /\b(compar\w*|contraste\w*|disting\w*|diferenc\w*|versus|entre)\b/iu.test(text(value));
}

function findMentionedConceptsInText(value = "", lessonConcepts = []) {
  const normalizedValue = normalizeForMatch(value);
  const valueTokens = tokenizeForMatch(value);
  return normalizeArray(lessonConcepts)
    .filter((concept) => {
      const normalizedLabel = normalizeForMatch(concept?.label);
      if (!normalizedLabel) {
        return false;
      }
      if (normalizedValue.includes(normalizedLabel)) {
        return true;
      }
      const labelTokens = tokenizeForMatch(concept?.label);
      return labelTokens.length > 0 && labelTokens.every((token) => valueTokens.includes(token));
    })
    .sort((left, right) => normalizedValue.indexOf(normalizeForMatch(left?.label)) - normalizedValue.indexOf(normalizeForMatch(right?.label)));
}

function buildComparisonSignals({ lessonPlan = {}, sourceClaims = [], lessonConcepts = [] } = {}) {
  const evidenceCandidates = [
    lessonPlan?.sourceGuideStructured?.lessonGoal,
    lessonPlan?.lessonDescription,
    ...findMatchingSourceClaims(
      [
        lessonPlan?.lessonTitle,
        lessonPlan?.lessonDescription,
        lessonPlan?.sourceGuideStructured?.lessonGoal
      ],
      sourceClaims,
      { minimumOverlap: 1 }
    ).map((claim) => claim?.text)
  ]
    .map(text)
    .filter(Boolean)
    .filter((value) => containsComparisonSignal(value));

  const comparisons = [];
  const seenPairs = new Set();
  evidenceCandidates.forEach((evidence) => {
    const mentionedConcepts = findMentionedConceptsInText(evidence, lessonConcepts);
    for (let index = 0; index < mentionedConcepts.length - 1; index += 1) {
      const left = mentionedConcepts[index];
      const right = mentionedConcepts[index + 1];
      const leftId = text(left?.conceptId);
      const rightId = text(right?.conceptId);
      if (!leftId || !rightId || leftId === rightId) {
        continue;
      }
      const pairKey = [leftId, rightId].sort().join("::");
      if (seenPairs.has(pairKey)) {
        continue;
      }
      seenPairs.add(pairKey);
      const matchedClaims = findMatchingSourceClaims([evidence, left?.label, right?.label], sourceClaims, { minimumOverlap: 1 });
      comparisons.push({
        left,
        right,
        evidence,
        sourceRefs: unique(matchedClaims.map((claim) => claim.sourceId)),
        sourceClaimRefs: unique(matchedClaims.map((claim) => claim.claimId))
      });
    }
  });
  return comparisons;
}

function ensurePrerequisiteEdge(prerequisiteEdges = [], { from = "", to = "", lessonKey = "", sourceClaimRefs = [], inferredFrom = "" } = {}) {
  const normalizedFrom = text(from);
  const normalizedTo = text(to);
  if (!normalizedFrom || !normalizedTo) {
    return;
  }
  const existing = prerequisiteEdges.find((edge) => text(edge?.from) === normalizedFrom && text(edge?.to) === normalizedTo);
  if (existing) {
    existing.sourceClaimRefs = unique([...(existing.sourceClaimRefs || []), ...normalizeArray(sourceClaimRefs)]);
    if (!text(existing?.inferredFrom) && text(inferredFrom)) {
      existing.inferredFrom = text(inferredFrom);
    }
    return;
  }
  prerequisiteEdges.push({
    edgeId: `${normalizedFrom}=>${normalizedTo}`,
    from: normalizedFrom,
    to: normalizedTo,
    lessonKey,
    sourceClaimRefs: unique(sourceClaimRefs),
    inferredFrom: text(inferredFrom)
  });
}

function buildConfusionSignals({ lessonPlan = {}, sourceClaims = [], lessonConcepts = [] } = {}) {
  const evidenceCandidates = [
    lessonPlan?.sourceGuideStructured?.commonErrors,
    ...findMatchingSourceClaims(
      [
        lessonPlan?.sourceGuideStructured?.commonErrors,
        lessonPlan?.sourceGuideStructured?.lessonGoal,
        lessonPlan?.lessonDescription
      ],
      sourceClaims,
      { minimumOverlap: 1 }
    ).map((claim) => claim?.text)
  ]
    .map(text)
    .filter(Boolean)
    .filter((value) => /\b(confund\w*|mistur\w*|troc\w*)\b/iu.test(value));

  const confusions = [];
  const seenPairs = new Set();
  evidenceCandidates.forEach((evidence) => {
    const mentionedConcepts = findMentionedConceptsInText(evidence, lessonConcepts);
    for (let index = 0; index < mentionedConcepts.length - 1; index += 1) {
      const left = mentionedConcepts[index];
      const right = mentionedConcepts[index + 1];
      const leftId = text(left?.conceptId);
      const rightId = text(right?.conceptId);
      if (!leftId || !rightId || leftId === rightId) {
        continue;
      }
      const pairKey = [leftId, rightId].sort().join("::");
      if (seenPairs.has(pairKey)) {
        continue;
      }
      seenPairs.add(pairKey);
      const matchedClaims = findMatchingSourceClaims([evidence, left?.label, right?.label], sourceClaims, { minimumOverlap: 1 });
      confusions.push({
        left,
        right,
        evidence,
        sourceClaimRefs: unique(matchedClaims.map((claim) => claim.claimId)),
        sourceRefs: unique(matchedClaims.map((claim) => claim.sourceId))
      });
    }
  });
  return confusions;
}

export function buildCourseIntentArtifact(intent = {}) {
  return {
    operation: text(intent.operation) || "create",
    scope: structuredClone(intent.scope || { level: "project" }),
    intervention: structuredClone(intent.intervention || {}),
    rawUserText: text(intent.rawUserText || intent.promptText),
    goal: text(intent.goal || intent.promptText),
    audienceLevel: text(intent.audienceLevel) || "beginner",
    timeHorizon: text(intent.timeHorizon),
    requestedDepth: text(intent.requestedDepth || intent.requestedGenerationDepth || intent.generationDepth) || "full_course",
    didacticProfileId: text(intent.didacticProfileId || intent.selectedTopDownProfileId) || "ads_general",
    generationDepth: text(intent.generationDepth) || "full_course",
    deferredGenerationDepth: text(intent.deferredGenerationDepth),
    attachments: structuredClone(intent.attachments || []),
    assessmentHints: {
      teacherSignals: unique(intent.assessmentProfile?.teacherSignals),
      questionTypes: unique(intent.assessmentProfile?.questionTypes),
      examTypes: unique(intent.assessmentProfile?.examTypes)
    },
    createdAt: text(intent.createdAt) || new Date().toISOString()
  };
}

function inferSourceKind(kind = "") {
  const normalized = text(kind).toLowerCase();
  if (["syllabus", "bibliography", "exercise", "exam", "slide", "note", "user_instruction", "external"].includes(normalized)) {
    return normalized;
  }
  if (normalized.includes("pdf")) {
    return "slide";
  }
  if (normalized.includes("instruction")) {
    return "user_instruction";
  }
  return "note";
}

function inferTopicsFromText(value = "") {
  const normalized = text(value);
  if (!normalized) {
    return [];
  }
  const chunks = normalized
    .split(/[\n.;:!?-]+/u)
    .map((item) => text(item))
    .filter((item) => item.length >= 4);
  return unique(chunks.slice(0, 6));
}

function inferAssessmentSignals(value = "") {
  const normalized = text(value).toLowerCase();
  const signals = [];
  if (/(prova|avaliacao|avaliação|exercicio|exercício|questao|questão)/.test(normalized)) {
    signals.push("assessment_reference");
  }
  if (/(pegadinha|comparar|distinguir|identificar|aplicar)/.test(normalized)) {
    signals.push("discrimination_or_application");
  }
  return signals;
}

function inferNotationSignals(value = "") {
  const normalized = text(value);
  const signals = [];
  if (/[A-Z]{2,}/.test(normalized)) {
    signals.push("uppercase_acronym");
  }
  if (/[`∧∨¬→↔=+\-*/]/u.test(normalized)) {
    signals.push("symbolic_notation");
  }
  return signals;
}

function inferTeacherConventions(value = "") {
  const normalized = text(value);
  const conventions = [];
  if (!normalized) {
    return conventions;
  }
  if (/(professor|cobranca|cobrança|estilo)/i.test(normalized)) {
    conventions.push(normalized);
  }
  return conventions;
}

function chunkSourceText(value = "", maxLength = 320) {
  const normalized = text(value);
  if (!normalized) {
    return [];
  }
  const paragraphs = normalized
    .split(/\n{2,}/u)
    .map((item) => text(item))
    .filter(Boolean);
  const chunks = [];
  paragraphs.forEach((paragraph) => {
    if (paragraph.length <= maxLength) {
      chunks.push(paragraph);
      return;
    }
    const sentences = paragraph
      .split(/(?<=[.!?])\s+/u)
      .map((item) => text(item))
      .filter(Boolean);
    let current = "";
    sentences.forEach((sentence) => {
      const candidate = current ? `${current} ${sentence}` : sentence;
      if (candidate.length > maxLength && current) {
        chunks.push(current);
        current = sentence;
      } else {
        current = candidate;
      }
    });
    if (current) {
      chunks.push(current);
    }
  });
  return chunks.length ? chunks : [normalized];
}

function buildSourceSpans({
  sourceId = "",
  locator = "",
  rawText = "",
  fallbackText = "",
  baseTopics = [],
  baseAssessmentSignals = [],
  baseNotationSignals = [],
  baseTeacherConventions = [],
  confidence = "medium"
} = {}) {
  const chunks = chunkSourceText(rawText || fallbackText);
  return chunks.map((chunk, index) => ({
    spanId: `${sourceId}:span:${index + 1}`,
    locator: locator || `${sourceId}:chunk:${index + 1}`,
    text: chunk,
    topics: unique([...baseTopics, ...inferTopicsFromText(chunk)]).slice(0, 8),
    assessmentSignals: unique([...baseAssessmentSignals, ...inferAssessmentSignals(chunk)]),
    notationSignals: unique([...baseNotationSignals, ...inferNotationSignals(chunk)]),
    teacherConventions: unique([...baseTeacherConventions, ...inferTeacherConventions(chunk)]).slice(0, 6),
    confidence
  }));
}

export function buildSourceLedgerArtifact({ attachments = [], promptText = "" } = {}) {
  const sources = normalizeArray(attachments).map((item, index) => {
    const sourceId = text(item?.id) || `source_${index + 1}`;
    const title = text(item?.name) || `Anexo ${index + 1}`;
    const bodyText = text(item?.textContent);
    const topics = inferTopicsFromText(bodyText || title);
    const assessmentSignals = inferAssessmentSignals(bodyText || title);
    const notationSignals = inferNotationSignals(bodyText || title);
    const teacherConventions = inferTeacherConventions(bodyText);

    return {
      sourceId,
      id: sourceId,
      title,
      kind: inferSourceKind(item?.kind || item?.mimeType || item?.type),
      priority: index + 1,
      locator: text(item?.fileRef),
      mimeType: text(item?.mimeType || item?.type),
      fileRef: text(item?.fileRef),
      extractedTopics: topics,
      assessmentSignals,
      notationSignals,
      teacherConventions,
      spans: buildSourceSpans({
        sourceId,
        locator: text(item?.fileRef) || `attachment:${index + 1}`,
        rawText: bodyText,
        fallbackText: title,
        baseTopics: topics,
        baseAssessmentSignals: assessmentSignals,
        baseNotationSignals: notationSignals,
        baseTeacherConventions: teacherConventions,
        confidence: bodyText ? "medium" : "low"
      })
    };
  });

  if (text(promptText)) {
    sources.push({
      sourceId: "user_instruction",
      id: "user_instruction",
      title: "Instrucao do usuario",
      kind: "user_instruction",
      priority: Math.max(1, sources.length + 1),
      locator: "prompt",
      mimeType: "text/plain",
      fileRef: "",
      extractedTopics: inferTopicsFromText(promptText),
      assessmentSignals: inferAssessmentSignals(promptText),
      notationSignals: inferNotationSignals(promptText),
      teacherConventions: inferTeacherConventions(promptText),
      spans: buildSourceSpans({
        sourceId: "user_instruction",
        locator: "prompt",
        rawText: promptText,
        baseTopics: inferTopicsFromText(promptText),
        baseAssessmentSignals: inferAssessmentSignals(promptText),
        baseNotationSignals: inferNotationSignals(promptText),
        baseTeacherConventions: inferTeacherConventions(promptText),
        confidence: "high"
      })
    });
  }

  return {
    ledgerId: "courseforge-source-ledger",
    sources,
    summary: {
      sourceCount: sources.length,
      spanCount: listCourseForgeSourceSpans({ sources }).length,
      topicHints: unique(sources.flatMap((item) => item.extractedTopics)),
      teacherSignalCount: sources.reduce((count, item) => count + normalizeArray(item.teacherConventions).length, 0)
    }
  };
}

export function buildAssessmentProfileArtifact({ intent = {}, sourceLedger = null } = {}) {
  const sources = listCourseForgeSources(sourceLedger);
  const prompt = text(intent?.rawUserText || intent?.promptText);
  const teacherSignals = unique([
    ...sources.flatMap((item) => item.teacherConventions || []),
    ...inferTeacherConventions(prompt)
  ]);
  const questionTypes = unique([
    ...(teacherSignals.length ? ["teacher_signaled"] : []),
    ...((/lacuna|completar/i.test(prompt) && ["gap_fill"]) || []),
    ...((/multipla escolha|múltipla escolha/i.test(prompt) && ["multiple_choice"]) || [])
  ]);
  const examTypes = unique([
    ...((/prova|avaliacao|avaliação/i.test(prompt) && ["exam"]) || []),
    ...((/lista|exercicio|exercício/i.test(prompt) && ["exercise_list"]) || [])
  ]);

  return {
    examTypes,
    questionTypes,
    teacherSignals,
    correctionCriteria: unique([
      ...(sources.some((item) => normalizeArray(item.notationSignals).length) ? ["terminological_precision"] : []),
      ...(sources.some((item) => normalizeArray(item.assessmentSignals).length) ? ["source_adherence"] : [])
    ]),
    expectedPrecision: sources.some((item) => normalizeArray(item.notationSignals).length) ? "high" : "medium"
  };
}

function buildObjectiveId(lessonKey = "", index = 0) {
  return `${lessonKey || "lesson"}:objective:${index + 1}`;
}

function ensureUniqueGraphId(baseId = "", lessonKey = "", usedIds = new Set()) {
  const normalizedBaseId = text(baseId);
  if (!normalizedBaseId) {
    return "";
  }
  if (!usedIds.has(normalizedBaseId)) {
    usedIds.add(normalizedBaseId);
    return normalizedBaseId;
  }
  const lessonScopedId = `${lessonKey || "lesson"}:${normalizedBaseId}`;
  if (!usedIds.has(lessonScopedId)) {
    usedIds.add(lessonScopedId);
    return lessonScopedId;
  }
  let suffix = 2;
  while (usedIds.has(`${lessonScopedId}:${suffix}`)) {
    suffix += 1;
  }
  const resolvedId = `${lessonScopedId}:${suffix}`;
  usedIds.add(resolvedId);
  return resolvedId;
}

export function buildCourseGraphArtifact({ architectureDraft = {}, lessonPlans = [], microsequencePlans = [], sourceLedger = null } = {}) {
  const concepts = [];
  const objectives = [];
  const prerequisiteEdges = [];
  const misconceptions = [];
  const assessmentTargets = [];
  const practiceVariants = [];
  const sourceClaims = listCourseForgeSourceClaims(sourceLedger);

  const lessonByKey = new Map(normalizeArray(lessonPlans).map((item) => [text(item?.lessonKey), item]));
  const usedConceptIds = new Set();
  const usedPracticeVariantIds = new Set();

  normalizeArray(lessonPlans).forEach((lessonPlan) => {
    const lessonKey = text(lessonPlan?.lessonKey);
    const domainMap = normalizeLessonDomainMap(lessonPlan?.domainMap || {}, {
      lessonMicrosequences: [],
      sourceGuideStructured: lessonPlan?.sourceGuideStructured || {}
    });
    const conceptIdByBaseRef = new Map();
    const lessonConceptLabels = new Set();
    normalizeArray(domainMap.items).forEach((item, index) => {
      const baseConceptId = text(item?.id) || `${lessonKey}:concept:${index + 1}`;
      const conceptId = ensureUniqueGraphId(baseConceptId, lessonKey, usedConceptIds);
      conceptIdByBaseRef.set(baseConceptId, conceptId);
      lessonConceptLabels.add(normalizeForMatch(item?.label));
      const matchedClaims = findMatchingSourceClaims(
        [item?.label, ...(normalizeArray(item?.expectedEvidence)), ...(normalizeArray(item?.commonErrors))],
        sourceClaims
      );
      concepts.push({
        conceptId,
        label: text(item?.label) || conceptId,
        kind: text(item?.kind) || "concept",
        priority: text(item?.priority) || "support",
        sourceRefs: unique([...normalizeArray(item?.sourceRefs), ...matchedClaims.map((claim) => claim.sourceId)]),
        sourceClaimRefs: unique(matchedClaims.map((claim) => claim.claimId)),
        expectedEvidence: unique(item?.expectedEvidence),
        representations: unique(item?.representations),
        assessmentFormats: unique(item?.assessmentFormats),
        lessonKey
      });
      normalizeArray(item?.prerequisites).forEach((prerequisiteId) => {
        const prerequisiteRef = text(prerequisiteId);
        ensurePrerequisiteEdge(prerequisiteEdges, {
          from: conceptIdByBaseRef.get(prerequisiteRef) || prerequisiteRef,
          to: conceptId,
          lessonKey,
          inferredFrom: "domain_map"
        });
      });
      normalizeArray(item?.commonErrors).forEach((commonError, errorIndex) => {
        misconceptions.push({
          misconceptionId: `${conceptId}:misconception:${errorIndex + 1}`,
          lessonKey,
          conceptRef: conceptId,
          description: text(commonError)
        });
      });
      normalizeArray(item?.assessmentFormats).forEach((assessmentFormat, formatIndex) => {
        assessmentTargets.push({
          targetId: `${conceptId}:assessment:${formatIndex + 1}`,
          lessonKey,
          conceptRef: conceptId,
          description: text(assessmentFormat)
        });
      });
    });
    buildClaimDrivenConcepts({
      lessonKey,
      lessonPlan,
      sourceClaims,
      existingLabels: lessonConceptLabels,
      usedConceptIds
    }).forEach((concept) => {
      concepts.push(concept);
    });
    const lessonConcepts = concepts.filter((concept) => text(concept?.lessonKey) === lessonKey);
    buildComparisonSignals({
      lessonPlan,
      sourceClaims,
      lessonConcepts
    }).forEach((comparison, index) => {
      const leftLabel = text(comparison?.left?.label);
      const rightLabel = text(comparison?.right?.label);
      const comparisonLabel = `Diferença entre ${leftLabel} e ${rightLabel}`;
      const normalizedComparisonLabel = normalizeForMatch(comparisonLabel);
      const existingComparisonConcept = lessonConcepts.find((concept) =>
        text(concept?.kind) === "comparison" && normalizeForMatch(concept?.label) === normalizedComparisonLabel
      );
      let comparisonConceptId = text(existingComparisonConcept?.conceptId);
      if (!comparisonConceptId) {
        const comparisonConcept = {
          conceptId: ensureUniqueGraphId(`comparison-${slugify(leftLabel)}-${slugify(rightLabel) || index + 1}`, lessonKey, usedConceptIds),
          label: comparisonLabel,
          kind: "comparison",
          priority: "support",
          sourceRefs: unique(comparison?.sourceRefs),
          sourceClaimRefs: unique(comparison?.sourceClaimRefs),
          expectedEvidence: unique([comparison?.evidence]),
          representations: [],
          assessmentFormats: ["comparison"],
          lessonKey,
          relatedConceptRefs: unique([comparison?.left?.conceptId, comparison?.right?.conceptId]),
          inferredFrom: "comparison_goal"
        };
        concepts.push(comparisonConcept);
        lessonConcepts.push(comparisonConcept);
        lessonConceptLabels.add(normalizedComparisonLabel);
        comparisonConceptId = comparisonConcept.conceptId;
      }
      unique([comparison?.left?.conceptId, comparison?.right?.conceptId]).forEach((ref) => {
        ensurePrerequisiteEdge(prerequisiteEdges, {
          from: ref,
          to: comparisonConceptId,
          lessonKey,
          sourceClaimRefs: comparison?.sourceClaimRefs,
          inferredFrom: "comparison_goal"
        });
      });
      const comparisonTargetId = `${lessonKey}:assessment:comparison:${index + 1}`;
      if (!assessmentTargets.some((target) => text(target?.targetId) === comparisonTargetId)) {
        assessmentTargets.push({
          targetId: comparisonTargetId,
          lessonKey,
          conceptRef: comparisonConceptId,
          targetKind: "comparison",
          relatedConceptRefs: unique([comparison?.left?.conceptId, comparison?.right?.conceptId]),
          sourceClaimRefs: unique(comparison?.sourceClaimRefs),
          description: text(comparison?.evidence) || `Comparar ${leftLabel} e ${rightLabel}.`,
          inferredFrom: "comparison_goal"
        });
      }
    });
    buildConfusionSignals({
      lessonPlan,
      sourceClaims,
      lessonConcepts
    }).forEach((confusion, index) => {
      const relatedConceptRefs = unique([confusion?.left?.conceptId, confusion?.right?.conceptId]);
      if (relatedConceptRefs.length < 2) {
        return;
      }
      misconceptions.push({
        misconceptionId: `${lessonKey}:misconception:contrast:${index + 1}`,
        lessonKey,
        conceptRef: confusion?.left?.conceptId,
        relatedConceptRefs,
        description: text(confusion?.evidence) || `Confundir ${text(confusion?.left?.label)} com ${text(confusion?.right?.label)}.`,
        misconceptionKind: "contrast_confusion",
        sourceRefs: unique(confusion?.sourceRefs),
        sourceClaimRefs: unique(confusion?.sourceClaimRefs),
        inferredFrom: "common_error_signal"
      });
    });
    normalizeArray(domainMap.practiceVariants).forEach((item, index) => {
      const baseDomainRef = text(item?.domainItemRef);
      practiceVariants.push({
        practiceVariantId: ensureUniqueGraphId(text(item?.id) || `${lessonKey}:variant:${index + 1}`, lessonKey, usedPracticeVariantIds),
        domainItemRef: conceptIdByBaseRef.get(baseDomainRef) || baseDomainRef,
        variantKind: text(item?.variantKind) || "practice",
        purpose: text(item?.purpose),
        difficulty: text(item?.difficulty),
        representation: text(item?.representation),
        expectedStudentAction: text(item?.expectedStudentAction),
        commonErrorTarget: text(item?.commonErrorTarget),
        lessonKey
      });
    });
    const sourceGuide = lessonPlan?.sourceGuideStructured || {};
    if (text(sourceGuide.lessonGoal)) {
      const matchedClaims = findMatchingSourceClaims([sourceGuide.lessonGoal], sourceClaims);
      objectives.push({
        objectiveId: buildObjectiveId(lessonKey, objectives.length),
        lessonKey,
        description: text(sourceGuide.lessonGoal),
        sourceClaimRefs: unique(matchedClaims.map((claim) => claim.claimId))
      });
      assessmentTargets.push({
        targetId: `${lessonKey}:assessment:${assessmentTargets.length + 1}`,
        lessonKey,
        description: text(sourceGuide.lessonGoal)
      });
    }
    if (text(sourceGuide.commonErrors)) {
      misconceptions.push({
        misconceptionId: `${lessonKey}:misconception:${misconceptions.length + 1}`,
        lessonKey,
        description: text(sourceGuide.commonErrors)
      });
    }
  });

  normalizeArray(microsequencePlans).forEach((lessonPlan) => {
    const lessonKey = text(lessonPlan?.lessonKey);
    if (concepts.some((item) => item.lessonKey === lessonKey)) {
      return;
    }
    const lessonMeta = lessonByKey.get(lessonKey) || {};
    normalizeArray(lessonPlan?.microsequences).forEach((microsequence) => {
      normalizeArray(microsequence?.domainRefs).forEach((ref) => {
        const conceptId = ensureUniqueGraphId(text(ref), lessonKey, usedConceptIds);
        if (!conceptId) {
          return;
        }
        concepts.push({
          conceptId,
          label: conceptId,
          kind: "concept",
          priority: text(microsequence?.coverageRole) || "support",
          sourceRefs: [],
          expectedEvidence: [],
          representations: [],
          assessmentFormats: [],
          lessonKey,
          inferredFrom: text(lessonMeta?.lessonTitle)
        });
      });
    });
  });

  return {
    graphId: text(architectureDraft?.course?.key) || "courseforge-graph",
    concepts: unique(concepts.map((item) => item.conceptId)).map((conceptId) => concepts.find((item) => item.conceptId === conceptId)),
    objectives,
    prerequisiteEdges,
    misconceptions,
    assessmentTargets,
    practiceVariants
  };
}

export function buildLessonGovernanceArtifact({ lessonPlans = [], courseGraph = null } = {}) {
  const graph = courseGraph && typeof courseGraph === "object" ? courseGraph : {};
  return normalizeArray(lessonPlans).map((lessonPlan) => ({
    lessonKey: text(lessonPlan?.lessonKey),
    sourceGuideStructured: structuredClone(lessonPlan?.sourceGuideStructured || {}),
    domainMap: structuredClone(lessonPlan?.domainMap || {}),
    prerequisites: unique(lessonPlan?.prerequisites),
    targetObjectives: unique([
      lessonPlan?.sourceGuideStructured?.lessonGoal,
      ...normalizeArray(graph.objectives)
        .filter((item) => text(item?.lessonKey) === text(lessonPlan?.lessonKey))
        .map((item) => text(item?.objectiveId))
    ]),
    allowedResources: unique(lessonPlan?.resourceTags),
    learningActions: unique(lessonPlan?.learningActionTags),
    supportLevel: text(lessonPlan?.supportLevel) || "guided",
    assessmentTargets: unique([
      ...normalizeArray(lessonPlan?.assessmentTargets),
      ...normalizeArray(graph.assessmentTargets)
        .filter((item) => text(item?.lessonKey) === text(lessonPlan?.lessonKey))
        .map((item) => text(item?.targetId))
    ])
  }));
}

export function buildCardPlansArtifact({ microsequenceContracts = [] } = {}) {
  return normalizeArray(microsequenceContracts).map((contract) => ({
    microsequenceKey: text(contract?.microsequenceKey),
    contractId: text(contract?.contractId),
    cards: normalizeArray(contract?.didacticPlan?.cardPlan).map((item) => ({
      position: Number.isInteger(item?.position) ? item.position : 0,
      role: text(item?.role),
      resourceType: text(item?.resourceType),
      learningGoal: text(item?.label || item?.role),
      requiredConceptRefs: unique(contract?.domainRefs),
      sourceSpanRefs: unique(normalizeArray(item?.sourceSpanRefs)),
      sourceClaimRefs: unique(normalizeArray(item?.sourceClaimRefs)),
      transformationState: text(item?.transformationState)
    }))
  }));
}
