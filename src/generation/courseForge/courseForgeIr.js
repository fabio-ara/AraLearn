import { normalizeLessonDomainMap } from "../domain/lessonDomainModel.js";
import { listCourseForgeSourceSpans, listCourseForgeSources } from "./courseForgeSourceLedger.js";

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeArray(value) {
  return Array.isArray(value) ? value : [];
}

function unique(values = []) {
  return [...new Set(normalizeArray(values).map(text).filter(Boolean))];
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

export function buildCourseGraphArtifact({ architectureDraft = {}, lessonPlans = [], microsequencePlans = [] } = {}) {
  const concepts = [];
  const objectives = [];
  const prerequisiteEdges = [];
  const misconceptions = [];
  const assessmentTargets = [];
  const practiceVariants = [];

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
    normalizeArray(domainMap.items).forEach((item, index) => {
      const baseConceptId = text(item?.id) || `${lessonKey}:concept:${index + 1}`;
      const conceptId = ensureUniqueGraphId(baseConceptId, lessonKey, usedConceptIds);
      conceptIdByBaseRef.set(baseConceptId, conceptId);
      concepts.push({
        conceptId,
        label: text(item?.label) || conceptId,
        kind: text(item?.kind) || "concept",
        priority: text(item?.priority) || "support",
        sourceRefs: unique(item?.sourceRefs),
        expectedEvidence: unique(item?.expectedEvidence),
        representations: unique(item?.representations),
        assessmentFormats: unique(item?.assessmentFormats),
        lessonKey
      });
      normalizeArray(item?.prerequisites).forEach((prerequisiteId) => {
        const prerequisiteRef = text(prerequisiteId);
        prerequisiteEdges.push({
          edgeId: `${conceptIdByBaseRef.get(prerequisiteRef) || prerequisiteRef}=>${conceptId}`,
          from: conceptIdByBaseRef.get(prerequisiteRef) || prerequisiteRef,
          to: conceptId,
          lessonKey
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
      objectives.push({
        objectiveId: buildObjectiveId(lessonKey, objectives.length),
        lessonKey,
        description: text(sourceGuide.lessonGoal)
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
      transformationState: text(item?.transformationState)
    }))
  }));
}
