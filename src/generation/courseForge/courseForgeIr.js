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

function normalizedUnique(values = []) {
  return [...new Set(normalizeArray(values).map(normalizeForMatch).filter(Boolean))];
}

function firstSentence(value = "") {
  return text(value).split(/(?<=[.!?])\s+/u).map(text).find(Boolean) || "";
}

function stripInstructionalPrefix(value = "", instructionalRole = "") {
  const normalized = text(value);
  if (!normalized) {
    return "";
  }
  if (instructionalRole === "objective") {
    return normalized.replace(/^(objetivo|objetivos|meta|metas|compet[eê]ncia|compet[eê]ncias|habilidade|habilidades)\s*[:\-]\s*/iu, "").trim();
  }
  if (instructionalRole === "misconception") {
    return normalized.replace(/^(erro\s+comum|erros\s+comuns|pegadinha|pegadinhas|confus[aã]o|confus[oõ]es|cuidado)\s*[:\-]\s*/iu, "").trim();
  }
  if (instructionalRole === "exercise") {
    return normalized.replace(/^(exerc[ií]cio|exerc[ií]cios|atividade|atividades|quest[aã]o|quest[oõ]es|desafio|desafios|pr[aá]tica)\s*[:\-]\s*/iu, "").trim();
  }
  if (instructionalRole === "definition") {
    return normalized.replace(/^(defini[cç][aã]o|conceito)\s*[:\-]\s*/iu, "").trim();
  }
  if (instructionalRole === "example") {
    return normalized.replace(/^(exemplo|exemplos|por exemplo)\s*[:\-]\s*/iu, "").trim();
  }
  return normalized;
}

function extractDomainLabelFromInstructionalText(value = "", instructionalRole = "") {
  const stripped = stripInstructionalPrefix(value, instructionalRole)
    .replace(/^[0-9]+[.)]\s+/u, "")
    .trim();
  if (!stripped) {
    return "";
  }
  const first = firstSentence(stripped);
  const parts = first
    .split(/\b(e|sao|são|é|define|representa|significa|permite|exige|consiste|usa|aplica|compara|distingue|conecta|interliga)\b/iu)
    .map(text)
    .filter(Boolean);
  const candidate = text(parts[0] || first)
    .replace(/[.:,;!?]+$/u, "")
    .trim();
  if (candidate.length < 4 || candidate.length > 90) {
    return "";
  }
  return candidate.charAt(0).toUpperCase() + candidate.slice(1);
}

function inferPracticeVariantKindFromText(value = "") {
  const normalized = normalizeForMatch(value);
  if (/\b(compare|comparar|contraste|distinga|distinguir|diferencie)\b/u.test(normalized)) {
    return "discrimination";
  }
  if (/\b(erro|erros|corrija|corrigir|diagnostique|diagnosticar|confunda|confundir)\b/u.test(normalized)) {
    return "common_error";
  }
  if (/\b(explique|explicar|justifique|justificar)\b/u.test(normalized)) {
    return "explanation";
  }
  if (/\b(aplique|aplicar|resolva|resolver|use|usar)\b/u.test(normalized)) {
    return "near_transfer";
  }
  return "fluency";
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

function containsPrerequisiteSignal(value = "") {
  return /\b(depende\w*\s+de|requer\w*|exige\w*|pressup[oõ]e\w*|precisa\s+de|necessita\s+de|base\s+para|serve\s+de\s+base\s+para|prepara\s+para|fundamenta\w*)\b/iu.test(text(value));
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

function findMentionedConceptMentionsInText(value = "", lessonConcepts = []) {
  const normalizedValue = normalizeForMatch(value);
  return normalizeArray(lessonConcepts)
    .map((concept) => {
      const normalizedLabel = normalizeForMatch(concept?.label);
      const index = normalizedLabel ? normalizedValue.indexOf(normalizedLabel) : -1;
      if (index < 0) {
        return null;
      }
      return {
        concept,
        index,
        end: index + normalizedLabel.length
      };
    })
    .filter(Boolean)
    .sort((left, right) => left.index - right.index);
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

function buildPrerequisiteSignals({ lessonPlan = {}, sourceClaims = [], lessonConcepts = [] } = {}) {
  const evidenceClaims = findMatchingSourceClaims(
    [
      lessonPlan?.lessonTitle,
      lessonPlan?.lessonDescription,
      lessonPlan?.sourceGuideStructured?.lessonGoal,
      lessonPlan?.sourceGuideStructured?.commonErrors
    ],
    sourceClaims,
    { minimumOverlap: 1 }
  ).filter((claim) => containsPrerequisiteSignal(claim?.text));

  const signals = [];
  const seenEdges = new Set();
  const targetRequiresSourcePattern = /\b(depende\w*\s+de|requer\w*|exige\w*|pressup[oõ]e\w*|precisa\s+de|necessita\s+de)\b/iu;
  const sourcePreparesTargetPattern = /\b(base\s+para|serve\s+de\s+base\s+para|prepara\s+para|fundamenta\w*)\b/iu;

  evidenceClaims.forEach((claim) => {
    const evidence = text(claim?.text);
    const mentions = findMentionedConceptMentionsInText(evidence, lessonConcepts);
    if (mentions.length < 2) {
      return;
    }
    [
      { pattern: targetRequiresSourcePattern, direction: "target_requires_source" },
      { pattern: sourcePreparesTargetPattern, direction: "source_prepares_target" }
    ].forEach(({ pattern, direction }) => {
      const match = pattern.exec(evidence);
      if (!match || typeof match.index !== "number") {
        return;
      }
      const before = [...mentions].reverse().find((item) => item.end <= match.index);
      const after = mentions.find((item) => item.index >= match.index + match[0].length);
      if (!before || !after) {
        return;
      }
      const from = direction === "target_requires_source"
        ? text(after?.concept?.conceptId)
        : text(before?.concept?.conceptId);
      const to = direction === "target_requires_source"
        ? text(before?.concept?.conceptId)
        : text(after?.concept?.conceptId);
      if (!from || !to || from === to) {
        return;
      }
      const edgeKey = `${from}=>${to}`;
      if (seenEdges.has(edgeKey)) {
        return;
      }
      seenEdges.add(edgeKey);
      signals.push({
        from,
        to,
        evidence,
        sourceClaimRefs: unique([claim?.claimId]),
        inferredFrom: "prerequisite_claim"
      });
    });
  });

  return signals;
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

function buildLessonSourceQueryValues(lessonPlan = {}) {
  const domainMapItems = normalizeArray(lessonPlan?.domainMap?.items);
  return unique([
    lessonPlan?.lessonTitle,
    lessonPlan?.lessonDescription,
    lessonPlan?.sourceGuideStructured?.lessonGoal,
    lessonPlan?.sourceGuideStructured?.commonErrors,
    ...domainMapItems.map((item) => item?.label),
    ...domainMapItems.flatMap((item) => normalizeArray(item?.expectedEvidence)),
    ...domainMapItems.flatMap((item) => normalizeArray(item?.commonErrors))
  ]);
}

function findRelevantInstructionalSpans({
  lessonPlan = {},
  sourceLedger = null,
  instructionalRole = "",
  allowSingleLessonFallback = false,
  maxItems = 3
} = {}) {
  const relevantRole = text(instructionalRole);
  if (!relevantRole) {
    return [];
  }
  const queryTokens = normalizedUnique(buildLessonSourceQueryValues(lessonPlan).flatMap((value) => tokenizeForMatch(value)));
  const spans = listCourseForgeSourceSpans(sourceLedger)
    .filter((span) => text(span?.instructionalRole) === relevantRole)
    .map((span) => {
      const overlap = queryTokens.length
        ? tokenizeForMatch(`${text(span?.text)} ${normalizeArray(span?.topics).join(" ")}`)
            .filter((token) => queryTokens.includes(token))
            .length
        : 0;
      return {
        ...span,
        overlap
      };
    })
    .filter((span) => span.overlap > 0 || allowSingleLessonFallback)
    .sort((left, right) =>
      right.overlap - left.overlap
      || text(left?.spanId).localeCompare(text(right?.spanId))
    );
  return spans.slice(0, maxItems);
}

function claimIdsBySpanId(sourceLedger = null) {
  return listCourseForgeSourceClaims(sourceLedger).reduce((map, claim) => {
    const spanId = text(claim?.spanId);
    if (!spanId) {
      return map;
    }
    if (!map.has(spanId)) {
      map.set(spanId, []);
    }
    map.get(spanId).push(text(claim?.claimId));
    return map;
  }, new Map());
}

function deriveGuideValueFromInstructionalSpans(spans = [], instructionalRole = "") {
  return spans
    .map((span) => stripInstructionalPrefix(span?.text, instructionalRole))
    .map(text)
    .find((value) => value.length >= 8) || "";
}

function deriveGoalValueFromExerciseSpans(spans = []) {
  return ensureTrailingSentence(
    normalizeArray(spans)
      .map((span) => stripInstructionalPrefix(span?.text, "exercise"))
      .map(text)
      .find((value) => value.length >= 8) || ""
  );
}

function selectMatchingDomainItemIds(span = {}, items = []) {
  const spanTokens = tokenizeForMatch(text(span?.text));
  if (!spanTokens.length) {
    return [];
  }
  return normalizeArray(items)
    .map((item) => ({
      item,
      overlap: tokenizeForMatch(`${text(item?.label)} ${normalizeArray(item?.expectedEvidence).join(" ")}`)
        .filter((token) => spanTokens.includes(token))
        .length
    }))
    .filter((entry) => entry.overlap > 0)
    .sort((left, right) => right.overlap - left.overlap || text(left?.item?.id).localeCompare(text(right?.item?.id)))
    .slice(0, 2)
    .map((entry) => text(entry?.item?.id))
    .filter(Boolean);
}

export function enrichLessonPlansFromSourceLedger({ lessonPlans = [], sourceLedger = null } = {}) {
  const normalizedLessonPlans = normalizeArray(lessonPlans);
  const allowSingleLessonFallback = normalizedLessonPlans.length === 1;
  return normalizedLessonPlans.map((lessonPlan) => {
    const sourceGuideStructured = structuredClone(lessonPlan?.sourceGuideStructured || {});
    const objectiveSpans = findRelevantInstructionalSpans({
      lessonPlan,
      sourceLedger,
      instructionalRole: "objective",
      allowSingleLessonFallback,
      maxItems: 1
    });
    const misconceptionSpans = findRelevantInstructionalSpans({
      lessonPlan,
      sourceLedger,
      instructionalRole: "misconception",
      allowSingleLessonFallback,
      maxItems: 1
    });
    const exerciseSpans = findRelevantInstructionalSpans({
      lessonPlan,
      sourceLedger,
      instructionalRole: "exercise",
      allowSingleLessonFallback,
      maxItems: 4
    });
    const derivedGoal = !text(sourceGuideStructured?.lessonGoal)
      ? deriveGuideValueFromInstructionalSpans(
          objectiveSpans,
          "objective"
        ) || deriveGoalValueFromExerciseSpans(exerciseSpans)
      : "";
    const derivedCommonErrors = !text(sourceGuideStructured?.commonErrors)
      ? deriveGuideValueFromInstructionalSpans(
          misconceptionSpans,
          "misconception"
        )
      : "";
    const nextSourceGuideStructured = {
      ...sourceGuideStructured,
      ...(derivedGoal ? { lessonGoal: derivedGoal } : {}),
      ...(derivedCommonErrors ? { commonErrors: derivedCommonErrors } : {})
    };
    const definitionSpans = findRelevantInstructionalSpans({
      lessonPlan,
      sourceLedger,
      instructionalRole: "definition",
      allowSingleLessonFallback,
      maxItems: 4
    });
    const exampleSpans = findRelevantInstructionalSpans({
      lessonPlan,
      sourceLedger,
      instructionalRole: "example",
      allowSingleLessonFallback,
      maxItems: 3
    });
    const explicitDomainItems = normalizeArray(lessonPlan?.domainMap?.items).map((item) => structuredClone(item));
    const existingNormalizedLabels = new Set(explicitDomainItems.map((item) => normalizeForMatch(item?.label)));
    definitionSpans.forEach((span, index) => {
      const label = extractDomainLabelFromInstructionalText(span?.text, "definition");
      if (!label || existingNormalizedLabels.has(normalizeForMatch(label))) {
        return;
      }
      explicitDomainItems.push({
        id: `source-definition-${index + 1}`,
        label,
        kind: "concept",
        priority: index === 0 ? "core" : "support",
        sourceRefs: unique([text(span?.sourceId)]),
        expectedEvidence: unique([stripInstructionalPrefix(span?.text, "definition")])
      });
      existingNormalizedLabels.add(normalizeForMatch(label));
    });
    const enrichedItems = explicitDomainItems.map((item) => {
      const matchedSpan = [...definitionSpans, ...exampleSpans].find((span) =>
        selectMatchingDomainItemIds(span, [item]).includes(text(item?.id))
      );
      if (!matchedSpan) {
        return item;
      }
      return {
        ...structuredClone(item),
        sourceRefs: unique([...(normalizeArray(item?.sourceRefs)), text(matchedSpan?.sourceId)]),
        expectedEvidence: unique([
          ...(normalizeArray(item?.expectedEvidence)),
          stripInstructionalPrefix(matchedSpan?.text, text(matchedSpan?.instructionalRole))
        ]),
        representations: text(matchedSpan?.instructionalRole) === "example"
          ? unique([...(normalizeArray(item?.representations)), "exemplo contextual"])
          : normalizeArray(item?.representations)
      };
    });
    const normalizedWithFallback = normalizeLessonDomainMap({ items: enrichedItems, practiceVariants: lessonPlan?.domainMap?.practiceVariants || [] }, {
      lessonMicrosequences: [],
      sourceGuideStructured: nextSourceGuideStructured
    });
    const currentPracticeVariants = normalizeArray(normalizedWithFallback.practiceVariants).map((variant) => structuredClone(variant));
    const existingVariantKeys = new Set(currentPracticeVariants.map((variant) =>
      `${text(variant?.domainItemRef)}::${text(variant?.variantKind)}::${normalizeForMatch(variant?.purpose)}`
    ));
    exerciseSpans.forEach((span, index) => {
      const matchedDomainItemRefs = selectMatchingDomainItemIds(span, normalizedWithFallback.items);
      const fallbackDomainItemRef = matchedDomainItemRefs[0]
        || text(normalizedWithFallback.items.find((item) => text(item?.priority) === "core")?.id)
        || text(normalizedWithFallback.items[0]?.id);
      if (!fallbackDomainItemRef) {
        return;
      }
      const variantKind = inferPracticeVariantKindFromText(span?.text);
      const purpose = stripInstructionalPrefix(span?.text, "exercise");
      const variantKey = `${fallbackDomainItemRef}::${variantKind}::${normalizeForMatch(purpose)}`;
      if (existingVariantKeys.has(variantKey)) {
        return;
      }
      currentPracticeVariants.push({
        id: `source-exercise-${index + 1}`,
        domainItemRef: fallbackDomainItemRef,
        variantKind,
        purpose,
        expectedStudentAction: variantKind === "discrimination"
          ? "comparar e discriminar casos próximos"
          : variantKind === "common_error"
            ? "diagnosticar e corrigir o erro"
            : variantKind === "explanation"
              ? "explicar o raciocínio em palavras próprias"
              : "aplicar o conteúdo em caso próximo"
      });
      existingVariantKeys.add(variantKey);
    });
    const normalizedDomainMap = normalizeLessonDomainMap({
      ...structuredClone(lessonPlan?.domainMap || {}),
      items: normalizedWithFallback.items,
      practiceVariants: currentPracticeVariants
    }, {
      lessonMicrosequences: [],
      sourceGuideStructured: nextSourceGuideStructured
    });
    const shouldPersistDerivedDomainMap =
      normalizeArray(lessonPlan?.domainMap?.items).length > 0
      || normalizeArray(lessonPlan?.domainMap?.practiceVariants).length > 0
      || definitionSpans.length > 0
      || exampleSpans.length > 0
      || exerciseSpans.length > 0;

    return {
      ...structuredClone(lessonPlan),
      sourceGuideStructured: nextSourceGuideStructured,
      domainMap: shouldPersistDerivedDomainMap ? normalizedDomainMap : structuredClone(lessonPlan?.domainMap || {})
    };
  });
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

function inferAssessmentSignalsFromRole(instructionalRole = "") {
  const normalized = text(instructionalRole);
  if (normalized === "exercise") {
    return ["assessment_reference", "practice_prompt"];
  }
  if (normalized === "objective") {
    return ["goal_reference"];
  }
  if (normalized === "definition") {
    return ["definition_focus"];
  }
  if (normalized === "example") {
    return ["worked_example"];
  }
  if (normalized === "misconception") {
    return ["misconception_warning"];
  }
  return [];
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

function inferTeacherConventions(value = "", { instructionalRole = "" } = {}) {
  const normalized = text(value);
  const conventions = [];
  const role = text(instructionalRole);
  if (role === "objective") {
    conventions.push("explicit_objective_block");
  } else if (role === "exercise") {
    conventions.push("exercise_block");
  } else if (role === "definition") {
    conventions.push("definition_block");
  } else if (role === "example") {
    conventions.push("example_block");
  } else if (role === "note") {
    conventions.push("teacher_note_block");
  } else if (role === "misconception") {
    conventions.push("misconception_block");
  }
  if (!normalized) {
    return conventions;
  }
  if (/(professor|cobranca|cobrança|estilo)/i.test(normalized)) {
    conventions.push("teacher_style_reference");
  }
  return conventions;
}

function ensureTrailingSentence(value = "") {
  const normalized = text(value);
  if (!normalized) {
    return "";
  }
  return /[.!?]$/u.test(normalized) ? normalized : `${normalized}.`;
}

function isExerciseSpan(span = {}) {
  return text(span?.instructionalRole) === "exercise"
    || normalizeArray(span?.assessmentSignals).some((signal) => ["practice_prompt", "assessment_reference"].includes(text(signal)));
}

function hasExerciseEvidenceInSource(source = {}) {
  return normalizeArray(source?.spans).some((span) => isExerciseSpan(span))
    || normalizeArray(source?.teacherConventions).includes("exercise_block")
    || normalizeArray(source?.assessmentSignals).includes("assessment_reference");
}

function summarizeSourceLedgerEvidence(sources = []) {
  const normalizedSources = normalizeArray(sources);
  const spans = listCourseForgeSourceSpans({ sources: normalizedSources });
  const attachmentSources = normalizedSources.filter((source) => text(source?.kind) !== "user_instruction");
  const promptSources = normalizedSources.filter((source) => text(source?.kind) === "user_instruction");
  const exerciseSpans = spans.filter((span) => isExerciseSpan(span));
  const exerciseSourceCount = attachmentSources.filter((source) => hasExerciseEvidenceInSource(source)).length;
  const promptOnly = attachmentSources.length === 0 && promptSources.length > 0;
  const evidenceMode = promptOnly
    ? "prompt_only"
    : exerciseSourceCount > 0
      ? "exercise_anchored"
      : attachmentSources.length > 0
        ? "attachment_anchored"
        : "empty";
  return {
    attachmentSourceCount: attachmentSources.length,
    promptSourceCount: promptSources.length,
    exerciseSpanCount: exerciseSpans.length,
    exerciseSourceCount,
    promptOnly,
    evidenceMode
  };
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

function normalizeSourceBlocks(blocks = []) {
  return normalizeArray(blocks)
    .map((block) => ({
      blockType: text(block?.blockType) || "paragraph",
      instructionalRole: text(block?.instructionalRole),
      text: text(block?.text)
    }))
    .filter((block) => block.text);
}

function buildSourceSpans({
  sourceId = "",
  locator = "",
  rawText = "",
  sourceBlocks = [],
  fallbackText = "",
  baseTopics = [],
  baseAssessmentSignals = [],
  baseNotationSignals = [],
  baseTeacherConventions = [],
  confidence = "medium"
} = {}) {
  const normalizedBlocks = normalizeSourceBlocks(sourceBlocks);
  const spanInputs = normalizedBlocks.length
    ? normalizedBlocks.flatMap((block) =>
        chunkSourceText(block.text).map((chunk) => ({
          text: chunk,
          blockType: block.blockType,
          instructionalRole: block.instructionalRole
        }))
      )
    : chunkSourceText(rawText || fallbackText).map((chunk) => ({
        text: chunk,
        blockType: "paragraph",
        instructionalRole: ""
      }));
  return spanInputs.map((spanInput, index) => ({
    spanId: `${sourceId}:span:${index + 1}`,
    locator: locator || `${sourceId}:chunk:${index + 1}`,
    text: spanInput.text,
    blockType: spanInput.blockType,
    instructionalRole: spanInput.instructionalRole,
    topics: unique([...baseTopics, ...inferTopicsFromText(spanInput.text)]).slice(0, 8),
    assessmentSignals: unique([
      ...baseAssessmentSignals,
      ...inferAssessmentSignals(spanInput.text),
      ...inferAssessmentSignalsFromRole(spanInput.instructionalRole)
    ]),
    notationSignals: unique([...baseNotationSignals, ...inferNotationSignals(spanInput.text)]),
    teacherConventions: unique([
      ...baseTeacherConventions,
      ...inferTeacherConventions(spanInput.text, { instructionalRole: spanInput.instructionalRole })
    ]).slice(0, 6),
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
        sourceBlocks: item?.sourceBlocks,
        fallbackText: title,
        baseTopics: topics,
        baseAssessmentSignals: assessmentSignals,
        baseNotationSignals: notationSignals,
        baseTeacherConventions: teacherConventions,
        confidence: bodyText ? "high" : "low"
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
        confidence: sources.length ? "low" : "medium"
      })
    });
  }

  const evidenceSummary = summarizeSourceLedgerEvidence(sources);

  return {
    ledgerId: "courseforge-source-ledger",
    sources,
    summary: {
      sourceCount: sources.length,
      spanCount: listCourseForgeSourceSpans({ sources }).length,
      topicHints: unique(sources.flatMap((item) => item.extractedTopics)),
      teacherSignalCount: sources.reduce((count, item) => count + normalizeArray(item.teacherConventions).length, 0),
      ...evidenceSummary
    }
  };
}

export function buildAssessmentProfileArtifact({ intent = {}, sourceLedger = null } = {}) {
  const sources = listCourseForgeSources(sourceLedger);
  const attachmentSources = sources.filter((source) => text(source?.kind) !== "user_instruction");
  const relevantSources = attachmentSources.length ? attachmentSources : sources;
  const evidenceSummary = summarizeSourceLedgerEvidence(sources);
  const prompt = text(intent?.rawUserText || intent?.promptText);
  const teacherSignals = unique([
    ...relevantSources.flatMap((item) => item.teacherConventions || []),
    ...(attachmentSources.length ? [] : inferTeacherConventions(prompt))
  ]);
  const spans = listCourseForgeSourceSpans({ sources: relevantSources });
  const hasExerciseEvidence = evidenceSummary.exerciseSpanCount > 0 || spans.some((span) => isExerciseSpan(span));
  const questionTypes = unique([
    ...(teacherSignals.length ? ["teacher_signaled"] : []),
    ...(hasExerciseEvidence ? ["exercise_driven"] : []),
    ...((/lacuna|completar/i.test(prompt) && ["gap_fill"]) || []),
    ...((/multipla escolha|múltipla escolha/i.test(prompt) && ["multiple_choice"]) || [])
  ]);
  const examTypes = unique([
    ...(hasExerciseEvidence ? ["exercise_list"] : []),
    ...((/prova|avaliacao|avaliação/i.test(prompt) && ["exam"]) || []),
    ...((/lista|exercicio|exercício/i.test(prompt) && ["exercise_list"]) || [])
  ]);

  return {
    examTypes,
    questionTypes,
    teacherSignals,
    evidenceMode: evidenceSummary.evidenceMode,
    hasExerciseEvidence,
    correctionCriteria: unique([
      ...(sources.some((item) => normalizeArray(item.notationSignals).length) ? ["terminological_precision"] : []),
      ...(sources.some((item) => normalizeArray(item.assessmentSignals).length) ? ["source_adherence"] : []),
      ...(hasExerciseEvidence ? ["assessment_coverage"] : [])
    ]),
    expectedPrecision:
      sources.some((item) => normalizeArray(item.notationSignals).length) || /rigor|formal|notacao|notação/i.test(prompt)
        ? "high"
        : "medium"
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
  const normalizedLessonPlans = enrichLessonPlansFromSourceLedger({ lessonPlans, sourceLedger });
  const concepts = [];
  const objectives = [];
  const prerequisiteEdges = [];
  const misconceptions = [];
  const assessmentTargets = [];
  const practiceVariants = [];
  const sourceClaims = listCourseForgeSourceClaims(sourceLedger);
  const sourceClaimIdsBySpan = claimIdsBySpanId(sourceLedger);

  const lessonByKey = new Map(normalizeArray(normalizedLessonPlans).map((item) => [text(item?.lessonKey), item]));
  const usedConceptIds = new Set();
  const usedPracticeVariantIds = new Set();
  const allowSingleLessonFallback = normalizedLessonPlans.length === 1;

  normalizeArray(normalizedLessonPlans).forEach((lessonPlan) => {
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
    buildPrerequisiteSignals({
      lessonPlan,
      sourceClaims,
      lessonConcepts
    }).forEach((signal) => {
      ensurePrerequisiteEdge(prerequisiteEdges, {
        from: signal?.from,
        to: signal?.to,
        lessonKey,
        sourceClaimRefs: signal?.sourceClaimRefs,
        inferredFrom: signal?.inferredFrom
      });
    });
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
    findRelevantInstructionalSpans({
      lessonPlan,
      sourceLedger,
      instructionalRole: "exercise",
      allowSingleLessonFallback,
      maxItems: 8
    }).forEach((span, index) => {
      const description = stripInstructionalPrefix(span?.text, "exercise");
      const normalizedDescription = normalizeForMatch(description);
      if (!description || assessmentTargets.some((target) => normalizeForMatch(target?.description) === normalizedDescription)) {
        return;
      }
      assessmentTargets.push({
        targetId: `${lessonKey}:assessment:exercise:${index + 1}`,
        lessonKey,
        targetKind: "exercise_prompt",
        sourceClaimRefs: unique(sourceClaimIdsBySpan.get(text(span?.spanId)) || []),
        description
      });
    });
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
