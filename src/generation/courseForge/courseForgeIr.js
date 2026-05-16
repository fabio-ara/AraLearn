import { listCourseForgeSources } from "./courseForgeSourceLedger.js";

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
      spans: bodyText
        ? [
            {
              spanId: `${sourceId}:span:1`,
              locator: text(item?.fileRef) || `attachment:${index + 1}`,
              text: bodyText,
              topics,
              assessmentSignals,
              notationSignals,
              teacherConventions,
              confidence: "medium"
            }
          ]
        : []
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
      spans: [
        {
          spanId: "user_instruction:span:1",
          locator: "prompt",
          text: promptText,
          topics: inferTopicsFromText(promptText),
          assessmentSignals: inferAssessmentSignals(promptText),
          notationSignals: inferNotationSignals(promptText),
          teacherConventions: inferTeacherConventions(promptText),
          confidence: "high"
        }
      ]
    });
  }

  return {
    ledgerId: "courseforge-source-ledger",
    sources,
    summary: {
      sourceCount: sources.length,
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

export function buildCourseGraphArtifact({ architectureDraft = {}, lessonPlans = [], microsequencePlans = [] } = {}) {
  const concepts = [];
  const objectives = [];
  const prerequisiteEdges = [];
  const misconceptions = [];
  const assessmentTargets = [];
  const practiceVariants = [];

  const lessonByKey = new Map(normalizeArray(lessonPlans).map((item) => [text(item?.lessonKey), item]));

  normalizeArray(lessonPlans).forEach((lessonPlan) => {
    const lessonKey = text(lessonPlan?.lessonKey);
    const domainMap = lessonPlan?.domainMap && typeof lessonPlan.domainMap === "object" ? lessonPlan.domainMap : {};
    normalizeArray(domainMap.items).forEach((item, index) => {
      const conceptId = text(item?.id) || `${lessonKey}:concept:${index + 1}`;
      concepts.push({
        conceptId,
        label: text(item?.label),
        kind: text(item?.kind) || "concept",
        priority: text(item?.priority) || "support",
        lessonKey
      });
    });
    normalizeArray(domainMap.practiceVariants).forEach((item, index) => {
      practiceVariants.push({
        practiceVariantId: text(item?.id) || `${lessonKey}:variant:${index + 1}`,
        domainItemRef: text(item?.domainItemRef),
        variantKind: text(item?.variantKind) || "practice",
        purpose: text(item?.purpose),
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
    normalizeArray(lessonPlan?.microsequences).forEach((microsequence) => {
      normalizeArray(microsequence?.prerequisiteRefs).forEach((ref) => {
        prerequisiteEdges.push({
          from: text(ref),
          to: text(microsequence?.key),
          lessonKey
        });
      });
      if (normalizeArray(microsequence?.domainRefs).length && !concepts.some((item) => item.lessonKey === lessonKey)) {
        const lessonMeta = lessonByKey.get(lessonKey) || {};
        normalizeArray(microsequence?.domainRefs).forEach((ref) => {
          concepts.push({
            conceptId: text(ref),
            label: text(ref),
            kind: "concept",
            priority: text(microsequence?.coverageRole) || "support",
            lessonKey,
            inferredFrom: text(lessonMeta?.lessonTitle)
          });
        });
      }
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
      sourceSpanRefs: unique(normalizeArray(item?.sourceRefs))
    }))
  }));
}
