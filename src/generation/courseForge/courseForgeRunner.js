import { createDefaultProviderRegistry } from "../providers/providerRegistry.js";
import { buildCourseForgePrompt } from "./courseForgePrompts.js";
import { applyCourseForgePatch } from "./courseForgeApply.js";
import { createCourseForgeArtifactsStore } from "./courseForgeArtifacts.js";
import { resolveCourseForgeIntent } from "./courseForgeIntent.js";
import {
  compileCourseForgeEditorInterventionPlan,
  compileCourseForgeInterventionRequest,
  constrainCourseForgeMicrosequencePlansToInterventionPlan
} from "./courseForgeIntervention.js";
import { compileCourseStructureToPatch, validateCourseForgePatch } from "./courseForgePatch.js";
import { resolveCourseForgePhases, resolveDeferredCourseForgePhases } from "./courseForgePhases.js";
import { createCourseForgeRunState, markCourseForgePhase, updateCourseForgeRunState } from "./courseForgeRunState.js";
import {
  buildAssessmentProfileArtifact,
  buildCardPlansArtifact,
  buildCourseGraphArtifact,
  buildCourseIntentArtifact,
  buildLessonGovernanceArtifact,
  buildSourceLedgerArtifact
} from "./courseForgeIr.js";
import { executeCourseForgeProviderPhase, resolveCourseForgePhaseModelId } from "./courseForgeRuntime.js";
import { validateCourseForgeSourceLedger } from "./courseForgeSourceLedger.js";
import {
  mergeCourseForgeArchitectureAudits,
  validateCourseForgeArchitectureDraft,
  validateCourseForgeCourseGraph,
  validateCourseForgeInterventionRequest,
  validateCourseForgeInterventionResponse,
  validateCourseForgeLessonPlanSet,
  validateCourseForgeMicrosequencePlans
} from "./courseForgeValidation.js";
import {
  auditCourseForgeCardDrafts,
  auditCourseForgeAssessmentAlignment,
  auditCourseForgeDomainCoverage,
  auditCourseForgeInterventionDidacticCoherence,
  auditCourseForgePrerequisiteCoverage,
  buildCourseForgeMicrosequenceRepairDirectives,
  mergeCourseForgeAdherenceAudits,
  auditCourseForgeSourceAdherence,
  buildCourseForgeMicrosequenceContracts,
  normalizeCourseForgeCardsPayload,
  repairCourseForgeDraftCardsDeterministically,
  repairCourseForgeMicrosequenceMetadataDeterministically
} from "./courseForgeCards.js";

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function buildInlineSourceLedger(intent = {}) {
  return buildSourceLedgerArtifact({
    attachments: intent.attachments || [],
    promptText: text(intent.rawUserText || intent.promptText)
  });
}

function buildArchitecturePromptTask(intent = {}, projectDocument = {}) {
  const summary = Array.isArray(projectDocument?.courses)
    ? `Cursos atuais no projeto: ${projectDocument.courses.length}.`
    : "Projeto atual sem cursos.";
  return `${intent.promptText}\n\nContexto do projeto:\n${summary}`;
}

function readArchitectureValue(payload = {}) {
  if (payload?.architectureFinal?.course) {
    return payload.architectureFinal;
  }
  if (payload?.architectureDraft?.course) {
    return payload.architectureDraft;
  }
  if (payload?.course) {
    return payload;
  }
  return payload;
}

function listArchitectureLessons(architectureDraft = {}) {
  const course = readArchitectureValue(architectureDraft)?.course;
  const lessons = [];
  (Array.isArray(course?.modules) ? course.modules : []).forEach((moduleValue) => {
    (Array.isArray(moduleValue?.lessons) ? moduleValue.lessons : []).forEach((lesson) => {
      lessons.push({
        courseKey: text(course?.key),
        moduleKey: text(moduleValue?.key),
        lessonKey: text(lesson?.key),
        lessonTitle: text(lesson?.title),
        lessonDescription: text(lesson?.description),
        sourceGuideStructured: structuredClone(lesson?.sourceGuideStructured || {}),
        domainMap: structuredClone(lesson?.domainMap || null),
        resourceTags: structuredClone(lesson?.resourceTags || []),
        contentTypeTags: structuredClone(lesson?.contentTypeTags || []),
        learningActionTags: structuredClone(lesson?.learningActionTags || []),
        supportLevel: text(lesson?.supportLevel),
        presetId: text(lesson?.presetId)
      });
    });
  });
  return lessons;
}

function findScopedLesson(projectDocument = {}, scope = {}) {
  const courses = Array.isArray(projectDocument?.courses) ? projectDocument.courses : [];
  const course = courses.find((item) => text(item?.key) === text(scope?.courseKey));
  const moduleValue = (course?.modules || []).find((item) => text(item?.key) === text(scope?.moduleKey));
  const lesson = (moduleValue?.lessons || []).find((item) => text(item?.key) === text(scope?.lessonKey));
  return {
    course,
    moduleValue,
    lesson
  };
}

function buildScopedLessonPlan(projectDocument = {}, scope = {}) {
  const { course, moduleValue, lesson } = findScopedLesson(projectDocument, scope);
  if (!course || !moduleValue || !lesson) {
    return null;
  }
  return {
    courseKey: text(course?.key),
    moduleKey: text(moduleValue?.key),
    lessonKey: text(lesson?.key),
    lessonTitle: text(lesson?.title),
    lessonDescription: text(lesson?.description),
    sourceGuideStructured: structuredClone(lesson?.sourceGuideStructured || {}),
    domainMap: structuredClone(lesson?.domainMap || null),
    resourceTags: structuredClone(lesson?.resourceTags || []),
    contentTypeTags: structuredClone(lesson?.contentTypeTags || []),
    learningActionTags: structuredClone(lesson?.learningActionTags || []),
    supportLevel: text(lesson?.supportLevel),
    presetId: text(lesson?.presetId)
  };
}

function buildScopedLessonPlansFromModule(projectDocument = {}, scope = {}) {
  const { course, moduleValue } = findScopedLesson(projectDocument, {
    courseKey: scope?.courseKey,
    moduleKey: scope?.moduleKey
  });
  if (!course || !moduleValue) {
    return [];
  }
  return (Array.isArray(moduleValue?.lessons) ? moduleValue.lessons : []).map((lesson) => ({
    courseKey: text(course?.key),
    moduleKey: text(moduleValue?.key),
    lessonKey: text(lesson?.key),
    lessonTitle: text(lesson?.title),
    lessonDescription: text(lesson?.description),
    sourceGuideStructured: structuredClone(lesson?.sourceGuideStructured || {}),
    domainMap: structuredClone(lesson?.domainMap || null),
    resourceTags: structuredClone(lesson?.resourceTags || []),
    contentTypeTags: structuredClone(lesson?.contentTypeTags || []),
    learningActionTags: structuredClone(lesson?.learningActionTags || []),
    supportLevel: text(lesson?.supportLevel),
    presetId: text(lesson?.presetId)
  }));
}

function buildScopedLessonPlansFromCourse(projectDocument = {}, scope = {}) {
  const course = (Array.isArray(projectDocument?.courses) ? projectDocument.courses : []).find(
    (item) => text(item?.key) === text(scope?.courseKey)
  );
  if (!course) {
    return [];
  }
  return (Array.isArray(course?.modules) ? course.modules : []).flatMap((moduleValue) =>
    (Array.isArray(moduleValue?.lessons) ? moduleValue.lessons : []).map((lesson) => ({
      courseKey: text(course?.key),
      moduleKey: text(moduleValue?.key),
      lessonKey: text(lesson?.key),
      lessonTitle: text(lesson?.title),
      lessonDescription: text(lesson?.description),
      sourceGuideStructured: structuredClone(lesson?.sourceGuideStructured || {}),
      domainMap: structuredClone(lesson?.domainMap || null),
      resourceTags: structuredClone(lesson?.resourceTags || []),
      contentTypeTags: structuredClone(lesson?.contentTypeTags || []),
      learningActionTags: structuredClone(lesson?.learningActionTags || []),
      supportLevel: text(lesson?.supportLevel),
      presetId: text(lesson?.presetId)
    }))
  );
}

function buildScopedMicrosequencePlans(projectDocument = {}, scope = {}) {
  const { course, moduleValue, lesson } = findScopedLesson(projectDocument, scope);
  const microsequence = (lesson?.microsequences || []).find((item) => text(item?.key) === text(scope?.microsequenceKey));
  if (!course || !moduleValue || !lesson || !microsequence) {
    return [];
  }
  return [
    {
      courseKey: text(course?.key),
      moduleKey: text(moduleValue?.key),
      lessonKey: text(lesson?.key),
      microsequences: [
        {
          key: text(microsequence?.key),
          title: text(microsequence?.title),
          description: text(microsequence?.description),
          objective: text(microsequence?.didacticPurpose || microsequence?.description),
          domainRefs: Array.isArray(microsequence?.domainRefs) ? microsequence.domainRefs.map(text).filter(Boolean) : [],
          practiceVariantRefs: Array.isArray(microsequence?.practiceVariantRefs)
            ? microsequence.practiceVariantRefs.map(text).filter(Boolean)
            : [],
          didacticPurpose: text(microsequence?.didacticPurpose),
          coverageRole: text(microsequence?.coverageRole),
          tags: Array.isArray(microsequence?.tags) ? microsequence.tags.map(text).filter(Boolean) : []
        }
      ]
    }
  ];
}

function normalizeExistingMicrosequencePlan(course = {}, moduleValue = {}, lesson = {}, microsequence = {}) {
  return {
    key: text(microsequence?.key),
    title: text(microsequence?.title),
    description: text(microsequence?.description),
    objective: text(microsequence?.didacticPurpose || microsequence?.description || microsequence?.title),
    domainRefs: Array.isArray(microsequence?.domainRefs) ? microsequence.domainRefs.map(text).filter(Boolean) : [],
    practiceVariantRefs: Array.isArray(microsequence?.practiceVariantRefs)
      ? microsequence.practiceVariantRefs.map(text).filter(Boolean)
      : [],
    didacticPurpose: text(microsequence?.didacticPurpose),
    coverageRole: text(microsequence?.coverageRole),
    tags: Array.isArray(microsequence?.tags) ? microsequence.tags.map(text).filter(Boolean) : [],
    courseKey: text(course?.key),
    moduleKey: text(moduleValue?.key),
    lessonKey: text(lesson?.key)
  };
}

function scoreMicrosequenceForLocalIntervention(microsequence = {}, intent = {}, index = 0) {
  let score = index;
  const role = text(microsequence?.coverageRole);
  const cardsCount = Array.isArray(microsequence?.cards) ? microsequence.cards.length : 0;
  if (text(microsequence?.key) === text(intent?.scope?.microsequenceKey)) {
    score += 100;
  }
  if (intent?.operation === "reinforce") {
    if (["practice", "guided_practice", "independent_practice", "exam_transfer"].includes(role)) {
      score += 40;
    }
  } else if (["introduce", "explain", "demonstrate", "consolidate"].includes(role)) {
    score += 30;
  }
  if (microsequence?.included) {
    score += 10;
  }
  if (text(microsequence?.status) === "ready") {
    score += 5;
  }
  return score + cardsCount;
}

function chooseMicrosequencesForIntervention(lesson = {}, intent = {}) {
  const microsequences = Array.isArray(lesson?.microsequences) ? lesson.microsequences : [];
  if (!microsequences.length) {
    return [];
  }
  if (intent?.intervention?.selectionStrategy !== "one_existing_per_lesson") {
    return microsequences;
  }
  const selected = microsequences
    .map((microsequence, index) => ({
      microsequence,
      score: scoreMicrosequenceForLocalIntervention(microsequence, intent, index)
    }))
    .sort((left, right) => right.score - left.score)[0]?.microsequence;
  return selected ? [selected] : [];
}

function buildExistingMicrosequencePlansForScope(projectDocument = {}, scope = {}, intent = {}) {
  if (scope?.level === "microsequence") {
    return buildScopedMicrosequencePlans(projectDocument, scope);
  }
  if (scope?.level === "lesson") {
    const { course, moduleValue, lesson } = findScopedLesson(projectDocument, scope);
    if (!course || !moduleValue || !lesson) {
      return [];
    }
    const selected = chooseMicrosequencesForIntervention(lesson, intent);
    if (!selected.length) {
      return [];
    }
    return [{
      courseKey: text(course?.key),
      moduleKey: text(moduleValue?.key),
      lessonKey: text(lesson?.key),
      microsequences: selected.map((microsequence) => normalizeExistingMicrosequencePlan(course, moduleValue, lesson, microsequence))
    }];
  }
  if (scope?.level === "module") {
    const { course, moduleValue } = findScopedLesson(projectDocument, {
      courseKey: scope?.courseKey,
      moduleKey: scope?.moduleKey
    });
    if (!course || !moduleValue) {
      return [];
    }
    return (Array.isArray(moduleValue?.lessons) ? moduleValue.lessons : [])
      .map((lesson) => {
        const selected = chooseMicrosequencesForIntervention(lesson, intent);
        if (!selected.length) {
          return null;
        }
        return {
          courseKey: text(course?.key),
          moduleKey: text(moduleValue?.key),
          lessonKey: text(lesson?.key),
          microsequences: selected.map((microsequence) => normalizeExistingMicrosequencePlan(course, moduleValue, lesson, microsequence))
        };
      })
      .filter(Boolean);
  }
  if (scope?.level === "course") {
    const course = (Array.isArray(projectDocument?.courses) ? projectDocument.courses : []).find(
      (item) => text(item?.key) === text(scope?.courseKey)
    );
    if (!course) {
      return [];
    }
    return (Array.isArray(course?.modules) ? course.modules : []).flatMap((moduleValue) =>
      (Array.isArray(moduleValue?.lessons) ? moduleValue.lessons : [])
        .map((lesson) => {
          const selected = chooseMicrosequencesForIntervention(lesson, intent);
          if (!selected.length) {
            return null;
          }
          return {
            courseKey: text(course?.key),
            moduleKey: text(moduleValue?.key),
            lessonKey: text(lesson?.key),
            microsequences: selected.map((microsequence) => normalizeExistingMicrosequencePlan(course, moduleValue, lesson, microsequence))
          };
        })
        .filter(Boolean)
    );
  }
  return [];
}

function normalizeLessonPlans(payload = {}, architectureDraft = {}) {
  const explicit = Array.isArray(payload?.lessonPlans) ? payload.lessonPlans : [];
  if (explicit.length) {
    return explicit.map((lessonPlan) => ({
      courseKey: text(lessonPlan?.courseKey),
      moduleKey: text(lessonPlan?.moduleKey),
      lessonKey: text(lessonPlan?.lessonKey),
      lessonTitle: text(lessonPlan?.lessonTitle),
      lessonDescription: text(lessonPlan?.lessonDescription),
      sourceGuideStructured: structuredClone(lessonPlan?.sourceGuideStructured || {}),
      domainMap: structuredClone(lessonPlan?.domainMap || null),
      resourceTags: structuredClone(lessonPlan?.resourceTags || []),
      contentTypeTags: structuredClone(lessonPlan?.contentTypeTags || []),
      learningActionTags: structuredClone(lessonPlan?.learningActionTags || []),
      supportLevel: text(lessonPlan?.supportLevel),
      presetId: text(lessonPlan?.presetId)
    }));
  }
  return listArchitectureLessons(architectureDraft);
}

function normalizeMicrosequencePlans(payload = {}, lessonPlans = []) {
  const plans = Array.isArray(payload?.microsequencePlans) ? payload.microsequencePlans : Array.isArray(payload) ? payload : [];
  return plans.map((lessonPlan) => {
    const lessonKey = text(lessonPlan?.lessonKey);
    const lessonMeta = lessonPlans.find((item) => text(item?.lessonKey) === lessonKey) || {};
    return {
      lessonKey,
      moduleKey: text(lessonPlan?.moduleKey || lessonMeta.moduleKey),
      courseKey: text(lessonPlan?.courseKey || lessonMeta.courseKey),
      microsequences: (Array.isArray(lessonPlan?.microsequences) ? lessonPlan.microsequences : []).map((microsequence, microIndex) => ({
        key: text(microsequence?.key) || `${lessonKey || "lesson"}-micro-${microIndex + 1}`,
        title: text(microsequence?.title),
        description: text(microsequence?.description),
        objective: text(microsequence?.objective),
        domainRefs: Array.isArray(microsequence?.domainRefs) ? microsequence.domainRefs.map(text).filter(Boolean) : [],
        practiceVariantRefs: Array.isArray(microsequence?.practiceVariantRefs) ? microsequence.practiceVariantRefs.map(text).filter(Boolean) : [],
        didacticPurpose: text(microsequence?.didacticPurpose),
        coverageRole: text(microsequence?.coverageRole),
        tags: Array.isArray(microsequence?.tags) ? microsequence.tags.map(text).filter(Boolean) : []
      }))
    };
  });
}

function hasBlockingIssues(audit = {}) {
  return (Array.isArray(audit?.issues) ? audit.issues : []).some((item) => item?.severity !== "warning");
}

function mergeCardAudits(...audits) {
  const issues = [];
  const warnings = [];
  audits.forEach((audit) => {
    issues.push(...((Array.isArray(audit?.issues) ? audit.issues : []).filter((item) => item?.severity !== "warning")));
    warnings.push(...(Array.isArray(audit?.warnings) ? audit.warnings : []));
  });
  return {
    approved: issues.length === 0,
    issues,
    warnings
  };
}

function cloneCardsFinalFromDrafts(cardDrafts = []) {
  return (Array.isArray(cardDrafts) ? cardDrafts : []).map((entry) => ({
    ...structuredClone(entry),
    publicCards: Array.isArray(entry?.publicCards) ? structuredClone(entry.publicCards) : []
  }));
}

function sumBlockingIssues(audit = {}) {
  return (Array.isArray(audit?.issues) ? audit.issues : []).filter((item) => item?.severity !== "warning").length;
}

function sumWarnings(audit = {}) {
  return Array.isArray(audit?.warnings) ? audit.warnings.length : 0;
}

function updateMetricsCategory(metrics = {}, category = "", patch = {}) {
  if (!category) {
    return structuredClone(metrics || {});
  }
  return {
    ...structuredClone(metrics || {}),
    issueCountsByCategory: {
      ...(structuredClone(metrics?.issueCountsByCategory || {})),
      [category]: Math.max(0, Number(patch.issueCount ?? metrics?.issueCountsByCategory?.[category] ?? 0))
    },
    repairCallsByCategory: {
      ...(structuredClone(metrics?.repairCallsByCategory || {})),
      [category]: Math.max(0, Number(patch.repairCalls ?? metrics?.repairCallsByCategory?.[category] ?? 0))
    },
    ...(patch.lastFailureCategory !== undefined ? { lastFailureCategory: patch.lastFailureCategory } : {})
  };
}

function buildDiagnosticsSummary(context = {}, runState = {}, phases = []) {
  const courseGraphAudit = context.courseGraphAudit || { blockingIssues: [], warnings: [] };
  const planningAudit = mergeCourseForgeAdherenceAudits(
    context.microsequenceAudit || {},
    context.microsequenceAdherenceAudit || {},
    context.interventionDidacticAudit || {}
  );
  const cardsAudit = mergeCardAudits(context.cardsAudit || {});
  const adherenceAudit = mergeCourseForgeAdherenceAudits(context.sourceAdherenceAudit || {});
  const interventionAudit = context.interventionAudit || { errors: [], warnings: [] };
  const interventionRequestAudit = context.interventionRequestAudit || { errors: [], warnings: [] };
  const prerequisiteAudit = context.prerequisiteAudit || { issues: [], warnings: [] };
  const assessmentAlignmentAudit = context.assessmentAlignmentAudit || { issues: [], warnings: [] };
  const blockingByCategory = {
    intervention:
      (Array.isArray(interventionAudit?.errors) ? interventionAudit.errors.length : 0)
      + (Array.isArray(interventionRequestAudit?.errors) ? interventionRequestAudit.errors.length : 0),
    graph: Array.isArray(courseGraphAudit?.blockingIssues) ? courseGraphAudit.blockingIssues.length : 0,
    planning: sumBlockingIssues(planningAudit),
    cards: sumBlockingIssues(cardsAudit),
    adherence: sumBlockingIssues(adherenceAudit),
    prerequisites: sumBlockingIssues(prerequisiteAudit),
    assessment: sumBlockingIssues(assessmentAlignmentAudit)
  };
  const warningsByCategory = {
    intervention:
      (Array.isArray(interventionAudit?.warnings) ? interventionAudit.warnings.length : 0)
      + (Array.isArray(interventionRequestAudit?.warnings) ? interventionRequestAudit.warnings.length : 0),
    graph: Array.isArray(courseGraphAudit?.warnings) ? courseGraphAudit.warnings.length : 0,
    planning: sumWarnings(planningAudit),
    cards: sumWarnings(cardsAudit),
    adherence: sumWarnings(adherenceAudit),
    prerequisites: sumWarnings(prerequisiteAudit),
    assessment: sumWarnings(assessmentAlignmentAudit)
  };
  const phaseStatus = Object.fromEntries((runState?.phases || []).map((phase) => [phase.phaseId, phase.status]));

  return {
    categories: {
      intervention: {
        blockingIssues: blockingByCategory.intervention,
        warnings: warningsByCategory.intervention,
        repaired: phaseStatus.audit_intervention === "completed" && (!phaseStatus.compile_intervention_request || phaseStatus.compile_intervention_request === "completed"),
        latestArtifacts: ["intervention-response", "intervention-audit", "intervention-request", "intervention-request-audit", "intervention-plan"]
      },
      graph: {
        blockingIssues: blockingByCategory.graph,
        warnings: warningsByCategory.graph,
        repaired: phaseStatus.repair_course_graph === "completed",
        latestArtifacts: ["course-graph", "course-graph-audit"]
      },
      planning: {
        blockingIssues: blockingByCategory.planning,
        warnings: warningsByCategory.planning,
        repaired: phaseStatus.repair_microsequences === "completed",
        latestArtifacts: ["microsequence-audit", "microsequence-adherence-audit"].filter((name) =>
          ["microsequence-audit", "microsequence-adherence-audit"].includes(name)
        )
      },
      cards: {
        blockingIssues: blockingByCategory.cards,
        warnings: warningsByCategory.cards,
        repaired: phaseStatus.repair_cards === "completed",
        latestArtifacts: ["cards-audit", "card-drafts"]
      },
      adherence: {
        blockingIssues: blockingByCategory.adherence,
        warnings: warningsByCategory.adherence,
        repaired: phaseStatus.repair_card_adherence === "completed",
        latestArtifacts: ["source-adherence-audit", "cards-final"]
      },
      prerequisites: {
        blockingIssues: blockingByCategory.prerequisites,
        warnings: warningsByCategory.prerequisites,
        repaired: phaseStatus.audit_prerequisites === "completed",
        latestArtifacts: ["prerequisite-audit"]
      },
      assessment: {
        blockingIssues: blockingByCategory.assessment,
        warnings: warningsByCategory.assessment,
        repaired: phaseStatus.audit_assessment_alignment === "completed",
        latestArtifacts: ["assessment-alignment-audit"]
      }
    },
    lastFailureCategory: text(runState?.metrics?.lastFailureCategory),
    phaseStatus,
    phases
  };
}

function inferFailureCategoryFromPhase(phaseId = "") {
  if (["answer_locally", "audit_intervention", "compile_intervention_request"].includes(phaseId)) {
    return "intervention";
  }
  if (["build_course_graph", "audit_course_graph", "repair_course_graph"].includes(phaseId)) {
    return "graph";
  }
  if (phaseId === "audit_prerequisites") {
    return "prerequisites";
  }
  if (phaseId === "audit_assessment_alignment") {
    return "assessment";
  }
  if (["plan_microsequences", "audit_microsequences", "repair_microsequences"].includes(phaseId)) {
    return "planning";
  }
  if (["audit_cards", "repair_cards"].includes(phaseId)) {
    return "cards";
  }
  if (["audit_source_adherence", "repair_card_adherence"].includes(phaseId)) {
    return "adherence";
  }
  return "";
}

function buildScopeTarget(scope = {}) {
  return {
    level: text(scope?.level) || "project",
    courseKey: text(scope?.courseKey),
    moduleKey: text(scope?.moduleKey),
    lessonKey: text(scope?.lessonKey),
    microsequenceKey: text(scope?.microsequenceKey)
  };
}

function buildMicrosequenceTarget(entry = {}) {
  return {
    level: "microsequence",
    courseKey: text(entry?.courseKey),
    moduleKey: text(entry?.moduleKey),
    lessonKey: text(entry?.lessonKey),
    microsequenceKey: text(entry?.microsequenceKey || entry?.key)
  };
}

function buildMicrosequenceRepairTask(directivesArtifact = null) {
  const directives = Array.isArray(directivesArtifact?.directives) ? directivesArtifact.directives : [];
  if (!directives.length) {
    return "Corrija apenas lacunas de cobertura didática, domainRefs, practiceVariantRefs e progressão das microssequências, sem gerar cards.";
  }
  const lines = directives.slice(0, 6).map((directive) => `- ${text(directive?.instruction)} Evidência: ${text(directive?.evidence)}`.trim());
  return [
    "Corrija apenas as falhas didáticas apontadas, sem gerar cards nem ampliar o escopo.",
    "Siga estas diretivas prioritárias:",
    ...lines
  ].join("\n");
}

function derivePhaseTarget({ phaseId = "", intent = {}, context = {} } = {}) {
  if (
    ["answer_locally", "audit_intervention", "compile_intervention_request", "build_microsequence_contract", "build_cards", "audit_cards", "audit_source_adherence", "repair_cards", "repair_card_adherence"].includes(
      phaseId
    )
  ) {
    const microsequencePlans = Array.isArray(context?.microsequencePlans) ? context.microsequencePlans : [];
    if (microsequencePlans.length === 1) {
      const microsequences = Array.isArray(microsequencePlans[0]?.microsequences) ? microsequencePlans[0].microsequences : [];
      if (microsequences.length === 1) {
        return buildMicrosequenceTarget({
          courseKey: microsequencePlans[0]?.courseKey,
          moduleKey: microsequencePlans[0]?.moduleKey,
          lessonKey: microsequencePlans[0]?.lessonKey,
          key: microsequences[0]?.key
        });
      }
    }
  }
  return buildScopeTarget(intent.scope);
}

function trackArtifactId(artifactIds = [], artifact = null) {
  if (!artifact?.id || artifactIds.includes(artifact.id)) {
    return artifactIds;
  }
  artifactIds.push(artifact.id);
  return artifactIds;
}

function savePhaseArtifact(artifactStore, runId, artifactIds, artifactName, content, metadata = {}) {
  const artifact = artifactStore.saveArtifact(runId, artifactName, content, metadata);
  trackArtifactId(artifactIds, artifact);
  return artifact;
}

function summarizeCardsForTutor(microsequence = {}) {
  return (Array.isArray(microsequence?.cards) ? microsequence.cards : []).map((card, index) => ({
    position: index + 1,
    key: text(card?.key),
    title: text(card?.title),
    prompt: text(card?.ask || card?.say || card?.text),
    after: text(card?.after),
    answer: text(card?.answer)
  }));
}

function buildTutorInterventionContext(projectDocument = {}, intent = {}) {
  const scope = intent?.scope || {};
  const microsequencePlans = buildExistingMicrosequencePlansForScope(projectDocument, scope, intent);
  const lessonMap = new Map();
  const microsequenceMap = new Map();

  if (scope.level === "microsequence") {
    const { course, moduleValue, lesson } = findScopedLesson(projectDocument, scope);
    const microsequence = (lesson?.microsequences || []).find((item) => text(item?.key) === text(scope?.microsequenceKey));
    if (lesson) {
      lessonMap.set(text(lesson?.key), buildScopedLessonPlan(projectDocument, scope));
    }
    if (microsequence) {
      microsequenceMap.set(text(microsequence?.key), {
        ...normalizeExistingMicrosequencePlan(course, moduleValue, lesson, microsequence),
        cards: summarizeCardsForTutor(microsequence)
      });
    }
  } else {
    microsequencePlans.forEach((lessonEntry) => {
      const lessonPlan = buildScopedLessonPlan(projectDocument, {
        courseKey: lessonEntry?.courseKey,
        moduleKey: lessonEntry?.moduleKey,
        lessonKey: lessonEntry?.lessonKey
      });
      if (lessonPlan) {
        lessonMap.set(text(lessonEntry?.lessonKey), lessonPlan);
      }
      const { lesson } = findScopedLesson(projectDocument, {
        courseKey: lessonEntry?.courseKey,
        moduleKey: lessonEntry?.moduleKey,
        lessonKey: lessonEntry?.lessonKey
      });
      lessonEntry.microsequences.forEach((entry) => {
        const existing = (lesson?.microsequences || []).find((item) => text(item?.key) === text(entry?.key));
        if (!existing) {
          return;
        }
        microsequenceMap.set(text(entry?.key), {
          ...structuredClone(entry),
          cards: summarizeCardsForTutor(existing)
        });
      });
    });
  }

  return {
    lessonPlans: [...lessonMap.values()].filter(Boolean),
    microsequencePlans,
    microsequenceContexts: [...microsequenceMap.values()]
  };
}

function buildCourseForgeOperationalInterventionPlan(context = {}, intent = {}) {
  if (!intent?.interventionRequest) {
    return null;
  }
  return compileCourseForgeEditorInterventionPlan({
    interventionRequest: intent.interventionRequest,
    projectDocument: context.projectDocument || {}
  });
}

function buildExistingMicrosequencePlansForLessonTargets(projectDocument = {}, lessonTargets = []) {
  return (Array.isArray(lessonTargets) ? lessonTargets : [])
    .map((lessonTarget) => {
      const { course, moduleValue, lesson } = findScopedLesson(projectDocument, lessonTarget);
      if (!course || !moduleValue || !lesson) {
        return null;
      }
      return {
        courseKey: text(course?.key),
        moduleKey: text(moduleValue?.key),
        lessonKey: text(lesson?.key),
        microsequences: (Array.isArray(lesson?.microsequences) ? lesson.microsequences : []).map((microsequence) =>
          normalizeExistingMicrosequencePlan(course, moduleValue, lesson, microsequence)
        )
      };
    })
    .filter((entry) => entry && Array.isArray(entry.microsequences) && entry.microsequences.length);
}

function buildCompositeMicrosequencePlansForInterventionAudit({ projectDocument = {}, interventionPlan = null, microsequencePlans = [] } = {}) {
  if (!interventionPlan || interventionPlan?.planningMode !== "new_only") {
    return structuredClone(Array.isArray(microsequencePlans) ? microsequencePlans : []);
  }

  const existingPlans = buildExistingMicrosequencePlansForLessonTargets(
    projectDocument,
    (Array.isArray(interventionPlan?.actions) ? interventionPlan.actions : []).flatMap((action) => action.lessonTargets || [])
  );
  const incomingByLessonKey = new Map(
    (Array.isArray(microsequencePlans) ? microsequencePlans : [])
      .map((lessonEntry) => [text(lessonEntry?.lessonKey), lessonEntry])
      .filter(([lessonKey]) => lessonKey)
  );

  return existingPlans.map((existingEntry) => {
    const incomingEntry = incomingByLessonKey.get(text(existingEntry?.lessonKey));
    const incomingMicrosequences = Array.isArray(incomingEntry?.microsequences) ? incomingEntry.microsequences : [];
    const incomingKeySet = new Set(incomingMicrosequences.map((microsequence) => text(microsequence?.key)).filter(Boolean));
    return {
      ...structuredClone(existingEntry),
      microsequences: [
        ...structuredClone(existingEntry?.microsequences || []).filter((microsequence) => !incomingKeySet.has(text(microsequence?.key))),
        ...structuredClone(incomingMicrosequences)
      ]
    };
  });
}

export async function runCourseForge({
  intent: rawIntent,
  projectDocument,
  providerRegistry = createDefaultProviderRegistry(),
  providerId = "fake",
  artifactStore = createCourseForgeArtifactsStore(),
  resumeRunId = ""
} = {}) {
  const intent = resolveCourseForgeIntent({ ...rawIntent, projectDocument });
  const phases = resolveCourseForgePhases(intent);
  const deferredPhases = resolveDeferredCourseForgePhases(intent);
  let runState = resumeRunId
    ? artifactStore.loadRun(resumeRunId)?.runState || createCourseForgeRunState({ runId: resumeRunId, intent, phases })
    : createCourseForgeRunState({ intent, phases });
  const runId = runState.runId;
  artifactStore.saveRun(runId, { runState, intent });
  const provider = providerRegistry.get(providerId);
  if (!provider) {
    throw new Error(`Provider não encontrado: ${providerId}.`);
  }

  const context = {
    intent,
    projectDocument: structuredClone(projectDocument),
    courseIntent: artifactStore.loadArtifact(runId, "course-intent")?.content || artifactStore.loadArtifact(runId, "intent")?.content || null,
    sourceLedger: artifactStore.loadArtifact(runId, "source-ledger")?.content || null,
    assessmentProfile: artifactStore.loadArtifact(runId, "assessment-profile")?.content || null,
    courseGraph: artifactStore.loadArtifact(runId, "course-graph")?.content || null,
    courseGraphAudit: artifactStore.loadArtifact(runId, "course-graph-audit")?.content || null,
    architectureDraft: artifactStore.loadArtifact(runId, "architecture-draft")?.content || null,
    architectureAudit: artifactStore.loadArtifact(runId, "architecture-audit")?.content || null,
    architectureFinal: artifactStore.loadArtifact(runId, "architecture-final")?.content || null,
    lessonPlans: artifactStore.loadArtifact(runId, "lesson-plans")?.content || null,
    lessonGovernance: artifactStore.loadArtifact(runId, "lesson-governance")?.content || null,
    microsequencePlans: artifactStore.loadArtifact(runId, "microsequence-plans")?.content || null,
    interventionResponse: artifactStore.loadArtifact(runId, "intervention-response")?.content || null,
    interventionAudit: artifactStore.loadArtifact(runId, "intervention-audit")?.content || null,
    interventionRequest: artifactStore.loadArtifact(runId, "intervention-request")?.content || structuredClone(intent.interventionRequest || null),
    interventionRequestAudit: artifactStore.loadArtifact(runId, "intervention-request-audit")?.content || null,
    interventionPlan: artifactStore.loadArtifact(runId, "intervention-plan")?.content || null,
    microsequenceAudit: artifactStore.loadArtifact(runId, "microsequence-audit")?.content || null,
    microsequenceAdherenceAudit: artifactStore.loadArtifact(runId, "microsequence-adherence-audit")?.content || null,
    interventionDidacticAudit: artifactStore.loadArtifact(runId, "intervention-didactic-audit")?.content || null,
    microsequenceRepairDirectives: artifactStore.loadArtifact(runId, "microsequence-repair-directives")?.content || null,
    microsequenceContracts: artifactStore.loadArtifact(runId, "microsequence-contracts")?.content || null,
    cardPlans: artifactStore.loadArtifact(runId, "card-plans")?.content || null,
    cardDrafts: artifactStore.loadArtifact(runId, "card-drafts")?.content || null,
    cardsAudit: artifactStore.loadArtifact(runId, "cards-audit")?.content || null,
    sourceAdherenceAudit: artifactStore.loadArtifact(runId, "source-adherence-audit")?.content || null,
    cardsFinal: artifactStore.loadArtifact(runId, "cards-final")?.content || null,
    prerequisiteAudit: artifactStore.loadArtifact(runId, "prerequisite-audit")?.content || null,
    assessmentAlignmentAudit: artifactStore.loadArtifact(runId, "assessment-alignment-audit")?.content || null,
    patch: artifactStore.loadArtifact(runId, "patch-final")?.content || null
  };

  for (const phaseId of phases) {
    const phaseState = (runState.phases || []).find((phase) => phase.phaseId === phaseId);
    if (phaseState?.status === "completed") {
      continue;
    }

    const phaseArtifactIds = [];
    const phaseModelId = resolveCourseForgePhaseModelId(intent, phaseId);

    runState = markCourseForgePhase(runState, phaseId, {
      status: "running",
      target: derivePhaseTarget({ phaseId, intent, context }),
      modelId: phaseModelId,
      startedAt: new Date().toISOString(),
      attempts: (phaseState?.attempts || 0) + 1,
      artifactIds: []
    });
    artifactStore.saveRun(runId, { runState, intent });

    try {
      if (phaseId === "normalize_intent") {
        context.courseIntent = buildCourseIntentArtifact(intent);
        savePhaseArtifact(artifactStore, runId, phaseArtifactIds, "intent", intent);
        savePhaseArtifact(artifactStore, runId, phaseArtifactIds, "course-intent", context.courseIntent);
        if (intent.interventionRequest) {
          context.interventionRequest = structuredClone(intent.interventionRequest);
          context.interventionRequestAudit = validateCourseForgeInterventionRequest({
            request: context.interventionRequest || {}
          });
          context.interventionPlan = buildCourseForgeOperationalInterventionPlan(context, intent);
          savePhaseArtifact(artifactStore, runId, phaseArtifactIds, "intervention-request", context.interventionRequest);
          savePhaseArtifact(artifactStore, runId, phaseArtifactIds, "intervention-request-audit", context.interventionRequestAudit);
          savePhaseArtifact(artifactStore, runId, phaseArtifactIds, "intervention-plan", context.interventionPlan);
          if (!context.interventionRequestAudit.ok) {
            throw new Error(context.interventionRequestAudit.errors.join(" "));
          }
        }
      } else if (phaseId === "index_sources") {
        const localLedger = buildInlineSourceLedger(intent);
        const result = validateCourseForgeSourceLedger(localLedger);
        if (!result.ok) {
          throw new Error(result.errors.join(" "));
        }
        context.sourceLedger = result.sourceLedger;
        savePhaseArtifact(artifactStore, runId, phaseArtifactIds, "source-ledger", context.sourceLedger);
      } else if (phaseId === "build_assessment_profile") {
        context.assessmentProfile = buildAssessmentProfileArtifact({
          intent: context.courseIntent || intent,
          sourceLedger: context.sourceLedger
        });
        savePhaseArtifact(artifactStore, runId, phaseArtifactIds, "assessment-profile", context.assessmentProfile);
      } else if (phaseId === "answer_locally") {
        const tutorContext = buildTutorInterventionContext(context.projectDocument, intent);
        if (!context.lessonPlans?.length && tutorContext.lessonPlans.length) {
          context.lessonPlans = tutorContext.lessonPlans;
        }
        if (!context.microsequencePlans?.length && tutorContext.microsequencePlans.length) {
          context.microsequencePlans = tutorContext.microsequencePlans;
        }
        const response = await executeCourseForgeProviderPhase({
          provider,
          phaseId,
          modelId: phaseModelId,
          prompt: buildCourseForgePrompt({
            role: "Você atua como Tutor local do AraLearn. Responda a dúvida do estudante sem editar o material nem expor bastidor.",
            sourcePack: JSON.stringify(context.sourceLedger || []),
            task: "Explique a dúvida de forma direta, ancore a resposta no contexto atual e reconecte explicitamente à trilha de estudo. Se detectar que o material precisa mudar, sinalize isso sem reescrever o curso.",
            output: "Responda somente JSON válido com responseText, studyTrackConnection, recommendedAction e rationale."
          }),
          schema: null,
          artifacts: [
            { id: "intent", name: "intent", content: JSON.stringify(intent) },
            { id: "lesson-plans", name: "lesson-plans", content: JSON.stringify(tutorContext.lessonPlans || []) },
            { id: "microsequence-contexts", name: "microsequence-contexts", content: JSON.stringify(tutorContext.microsequenceContexts || []) },
            { id: "assessment-profile", name: "assessment-profile", content: JSON.stringify(context.assessmentProfile || {}) }
          ]
        });
        context.interventionResponse = {
          ...(structuredClone(response.value || response || {})),
          target: derivePhaseTarget({ phaseId, intent, context })
        };
        savePhaseArtifact(artifactStore, runId, phaseArtifactIds, "intervention-response", context.interventionResponse);
      } else if (phaseId === "audit_intervention") {
        const lessonContext = context.lessonPlans?.[0]
          ? {
              title: text(context.lessonPlans[0]?.lessonTitle),
              description: text(context.lessonPlans[0]?.lessonDescription),
              tags: Array.isArray(context.lessonPlans[0]?.learningActionTags) ? context.lessonPlans[0].learningActionTags : []
            }
          : {};
        context.interventionAudit = validateCourseForgeInterventionResponse({
          response: context.interventionResponse || {},
          lessonContext
        });
        runState = updateCourseForgeRunState(runState, {
          metrics: updateMetricsCategory(runState.metrics, "intervention", {
            issueCount: Array.isArray(context.interventionAudit?.errors) ? context.interventionAudit.errors.length : 0,
            lastFailureCategory:
              Array.isArray(context.interventionAudit?.errors) && context.interventionAudit.errors.length
                ? "intervention"
                : runState?.metrics?.lastFailureCategory || ""
          })
        });
        savePhaseArtifact(artifactStore, runId, phaseArtifactIds, "intervention-audit", context.interventionAudit);
        if (!context.interventionAudit.ok) {
          throw new Error(context.interventionAudit.errors.join(" "));
        }
      } else if (phaseId === "compile_intervention_request") {
        context.interventionRequest = compileCourseForgeInterventionRequest({
          intent,
          response: context.interventionAudit?.response || context.interventionResponse || {},
          lessonPlans: context.lessonPlans || [],
          microsequencePlans: context.microsequencePlans || []
        });
        context.interventionRequestAudit = validateCourseForgeInterventionRequest({
          request: context.interventionRequest || {}
        });
        runState = updateCourseForgeRunState(runState, {
          metrics: updateMetricsCategory(runState.metrics, "intervention", {
            issueCount: Array.isArray(context.interventionRequestAudit?.errors) ? context.interventionRequestAudit.errors.length : 0,
            lastFailureCategory:
              Array.isArray(context.interventionRequestAudit?.errors) && context.interventionRequestAudit.errors.length
                ? "intervention"
                : runState?.metrics?.lastFailureCategory || ""
          })
        });
        savePhaseArtifact(artifactStore, runId, phaseArtifactIds, "intervention-request", context.interventionRequest);
        savePhaseArtifact(artifactStore, runId, phaseArtifactIds, "intervention-request-audit", context.interventionRequestAudit);
        if (!context.interventionRequestAudit.ok) {
          throw new Error(context.interventionRequestAudit.errors.join(" "));
        }
      } else if (phaseId === "plan_architecture") {
        const response = await executeCourseForgeProviderPhase({
          provider,
          phaseId,
          modelId: phaseModelId,
          prompt: buildCourseForgePrompt({
            role: "Você planeja a estrutura didática top-down do AraLearn.",
            sourcePack: JSON.stringify(context.sourceLedger || []),
            task: buildArchitecturePromptTask(intent, context.projectDocument),
            output: "Responda somente JSON válido com architectureDraft ou patch."
          }),
          schema: null,
          artifacts: [{ id: "intent", name: "intent", content: JSON.stringify(intent) }]
        });
        context.architectureDraft = structuredClone(readArchitectureValue(response.value || response));
        savePhaseArtifact(artifactStore, runId, phaseArtifactIds, "architecture-draft", context.architectureDraft);
      } else if (phaseId === "audit_architecture") {
        const localAudit = validateCourseForgeArchitectureDraft({
          architectureDraft: context.architectureDraft || {},
          sourceLedger: context.sourceLedger || [],
          scope: intent.scope
        });
        let providerAudit = { approved: true, blockingIssues: [], warnings: [] };
        if (provider?.id !== "fake" || provider?.capabilities?.provider === "fake") {
          const response = await executeCourseForgeProviderPhase({
            provider,
            phaseId,
            modelId: phaseModelId,
            prompt: buildCourseForgePrompt({
              role: "Você audita a arquitetura didática proposta para o AraLearn.",
              sourcePack: JSON.stringify(context.sourceLedger || []),
              task: "Revise a arquitetura proposta. Aponte problemas de escopo, progressão, aderência às fontes e vocabulário de bastidor.",
              output: "Responda somente JSON válido com approved, blockingIssues e warnings."
            }),
            schema: null,
            artifacts: [
              { id: "intent", name: "intent", content: JSON.stringify(intent) },
              { id: "architecture-draft", name: "architecture-draft", content: JSON.stringify(context.architectureDraft || {}) }
            ]
          });
          providerAudit = structuredClone(response.value || response || providerAudit);
        }
        context.architectureAudit = mergeCourseForgeArchitectureAudits(localAudit, providerAudit);
        savePhaseArtifact(artifactStore, runId, phaseArtifactIds, "architecture-audit", context.architectureAudit);
      } else if (phaseId === "repair_architecture") {
        const audit = context.architectureAudit || { approved: true, blockingIssues: [], warnings: [] };
        if (audit.approved && !(audit.blockingIssues || []).length) {
          context.architectureFinal = structuredClone(context.architectureDraft || {});
          savePhaseArtifact(artifactStore, runId, phaseArtifactIds, "architecture-final", context.architectureFinal);
        } else {
          const response = await executeCourseForgeProviderPhase({
            provider,
            phaseId,
            modelId: phaseModelId,
            prompt: buildCourseForgePrompt({
              role: "Você repara a arquitetura didática top-down do AraLearn.",
              sourcePack: JSON.stringify(context.sourceLedger || []),
              task: "Corrija apenas os problemas apontados pela auditoria, sem ampliar o escopo além do pedido.",
              output: "Responda somente JSON válido com architectureFinal."
            }),
            schema: null,
            artifacts: [
              { id: "intent", name: "intent", content: JSON.stringify(intent) },
              { id: "architecture-draft", name: "architecture-draft", content: JSON.stringify(context.architectureDraft || {}) },
              { id: "architecture-audit", name: "architecture-audit", content: JSON.stringify(audit) }
            ]
          });
          context.architectureFinal = structuredClone(readArchitectureValue(response.value || response));
          const finalAudit = validateCourseForgeArchitectureDraft({
            architectureDraft: context.architectureFinal || {},
            sourceLedger: context.sourceLedger || [],
            scope: intent.scope
          });
          if (!finalAudit.ok) {
            throw new Error(`A arquitetura reparada ainda falhou na auditoria: ${finalAudit.blockingIssues.map((item) => item.evidence).join(" ")}`);
          }
          savePhaseArtifact(artifactStore, runId, phaseArtifactIds, "architecture-final", context.architectureFinal);
        }
      } else if (phaseId === "plan_lessons") {
        const response = await executeCourseForgeProviderPhase({
          provider,
          phaseId,
          modelId: phaseModelId,
          prompt: buildCourseForgePrompt({
            role: "Você normaliza o conjunto de lições planejadas para o AraLearn.",
            sourcePack: JSON.stringify(context.sourceLedger || []),
            task: "Confirme e detalhe o conjunto de lições do curso planejado, sem criar cards.",
            output: "Responda somente JSON válido com lessonPlans."
          }),
          schema: null,
          artifacts: [
            { id: "intent", name: "intent", content: JSON.stringify(intent) },
            { id: "architecture-final", name: "architecture-final", content: JSON.stringify(context.architectureFinal || {}) }
          ]
        });
        context.lessonPlans = normalizeLessonPlans(response.value || response || {}, context.architectureFinal || {});
        const lessonValidation = validateCourseForgeLessonPlanSet({
          architectureDraft: context.architectureFinal || {},
          lessonPlans: context.lessonPlans
        });
        if (!lessonValidation.ok) {
          throw new Error(`Planejamento de lições inválido: ${lessonValidation.errors.join(" ")}`);
        }
        savePhaseArtifact(artifactStore, runId, phaseArtifactIds, "lesson-plans", context.lessonPlans);
      } else if (phaseId === "build_course_graph") {
        if (["lesson", "module", "course"].includes(intent.scope?.level) && !context.lessonPlans?.length) {
          if (intent.scope?.level === "lesson") {
            const scopedLessonPlan = buildScopedLessonPlan(context.projectDocument, intent.scope);
            if (!scopedLessonPlan) {
              throw new Error("Escopo de lição sem lição válida para construir CourseGraph.");
            }
            context.lessonPlans = [scopedLessonPlan];
          } else if (intent.scope?.level === "module") {
            context.lessonPlans = buildScopedLessonPlansFromModule(context.projectDocument, intent.scope);
          } else {
            context.lessonPlans = buildScopedLessonPlansFromCourse(context.projectDocument, intent.scope);
          }
          if (!context.lessonPlans.length) {
            throw new Error("Escopo sem lições válidas para construir CourseGraph.");
          }
          savePhaseArtifact(artifactStore, runId, phaseArtifactIds, "lesson-plans", context.lessonPlans);
        }
        context.courseGraph = buildCourseGraphArtifact({
          architectureDraft: context.architectureFinal || context.architectureDraft || {},
          lessonPlans: context.lessonPlans || [],
          microsequencePlans: context.microsequencePlans || [],
          sourceLedger: context.sourceLedger || []
        });
        savePhaseArtifact(artifactStore, runId, phaseArtifactIds, "course-graph", context.courseGraph);
      } else if (phaseId === "audit_course_graph") {
        const localAudit = validateCourseForgeCourseGraph({
          courseGraph: context.courseGraph || {},
          lessonPlans: context.lessonPlans || [],
          assessmentProfile: context.assessmentProfile || {},
          sourceLedger: context.sourceLedger || []
        });
        let providerAudit = { approved: true, blockingIssues: [], warnings: [] };
        if (provider?.id !== "fake" || provider?.capabilities?.provider === "fake") {
          const response = await executeCourseForgeProviderPhase({
            provider,
            phaseId,
            modelId: phaseModelId,
            prompt: buildCourseForgePrompt({
              role: "Você audita o CourseGraph do AraLearn.",
              sourcePack: JSON.stringify(context.sourceLedger || []),
              task: "Revise conceitos, objetivos, prerequisitos, assessmentTargets e practiceVariants. Aponte lacunas semânticas, referências quebradas e governança insuficiente por lição.",
              output: "Responda somente JSON válido com approved, blockingIssues e warnings."
            }),
            schema: null,
            artifacts: [
              { id: "intent", name: "intent", content: JSON.stringify(intent) },
              { id: "lesson-plans", name: "lesson-plans", content: JSON.stringify(context.lessonPlans || []) },
              { id: "course-graph", name: "course-graph", content: JSON.stringify(context.courseGraph || {}) },
              { id: "assessment-profile", name: "assessment-profile", content: JSON.stringify(context.assessmentProfile || {}) }
            ]
          });
          providerAudit = structuredClone(response.value || response || providerAudit);
        }
        context.courseGraphAudit = mergeCourseForgeArchitectureAudits(localAudit, providerAudit);
        runState = updateCourseForgeRunState(runState, {
          metrics: updateMetricsCategory(runState.metrics, "graph", {
            issueCount: Array.isArray(context.courseGraphAudit?.blockingIssues) ? context.courseGraphAudit.blockingIssues.length : 0,
            lastFailureCategory:
              Array.isArray(context.courseGraphAudit?.blockingIssues) && context.courseGraphAudit.blockingIssues.length
                ? "graph"
                : runState?.metrics?.lastFailureCategory || ""
          })
        });
        savePhaseArtifact(artifactStore, runId, phaseArtifactIds, "course-graph-audit", context.courseGraphAudit);
      } else if (phaseId === "repair_course_graph") {
        const audit = context.courseGraphAudit || { approved: true, blockingIssues: [], warnings: [] };
        if (audit.approved && !(audit.blockingIssues || []).length) {
          savePhaseArtifact(artifactStore, runId, phaseArtifactIds, "course-graph", context.courseGraph || {});
        } else {
          runState = updateCourseForgeRunState(runState, {
            metrics: updateMetricsCategory(runState.metrics, "graph", {
              repairCalls: Number(runState?.metrics?.repairCallsByCategory?.graph || 0) + 1
            })
          });
          context.courseGraph = buildCourseGraphArtifact({
            architectureDraft: context.architectureFinal || context.architectureDraft || {},
            lessonPlans: context.lessonPlans || [],
            microsequencePlans: [],
            sourceLedger: context.sourceLedger || []
          });
          let finalAudit = validateCourseForgeCourseGraph({
            courseGraph: context.courseGraph || {},
            lessonPlans: context.lessonPlans || [],
            assessmentProfile: context.assessmentProfile || {},
            sourceLedger: context.sourceLedger || []
          });
          if (!finalAudit.ok) {
            const response = await executeCourseForgeProviderPhase({
              provider,
              phaseId,
              modelId: phaseModelId,
              prompt: buildCourseForgePrompt({
                role: "Você repara o CourseGraph do AraLearn.",
                sourcePack: JSON.stringify(context.sourceLedger || []),
                task: "Corrija apenas os problemas apontados pela auditoria do CourseGraph, preservando o escopo das lições e a governança didática.",
                output: "Responda somente JSON válido com courseGraph."
              }),
              schema: null,
              artifacts: [
                { id: "intent", name: "intent", content: JSON.stringify(intent) },
                { id: "lesson-plans", name: "lesson-plans", content: JSON.stringify(context.lessonPlans || []) },
                { id: "course-graph", name: "course-graph", content: JSON.stringify(context.courseGraph || {}) },
                { id: "course-graph-audit", name: "course-graph-audit", content: JSON.stringify(audit) }
              ]
            });
            context.courseGraph = structuredClone((response.value || response || {}).courseGraph || response.value || response || {});
            finalAudit = validateCourseForgeCourseGraph({
              courseGraph: context.courseGraph || {},
              lessonPlans: context.lessonPlans || [],
              assessmentProfile: context.assessmentProfile || {},
              sourceLedger: context.sourceLedger || []
            });
          }
          context.courseGraphAudit = finalAudit;
          savePhaseArtifact(artifactStore, runId, phaseArtifactIds, "course-graph", context.courseGraph);
          savePhaseArtifact(artifactStore, runId, phaseArtifactIds, "course-graph-audit", context.courseGraphAudit);
          if (!finalAudit.ok) {
            throw new Error(`O CourseGraph ainda falhou na auditoria: ${finalAudit.blockingIssues.map((item) => item.evidence).join(" ")}`);
          }
        }
        runState = updateCourseForgeRunState(runState, {
          metrics: updateMetricsCategory(runState.metrics, "graph", {
            issueCount: Array.isArray(context.courseGraphAudit?.blockingIssues) ? context.courseGraphAudit.blockingIssues.length : 0,
            lastFailureCategory:
              Array.isArray(context.courseGraphAudit?.blockingIssues) && context.courseGraphAudit.blockingIssues.length
                ? "graph"
                : runState?.metrics?.lastFailureCategory || ""
          })
        });
      } else if (phaseId === "build_lesson_governance") {
        if (!context.lessonPlans?.length) {
          throw new Error("LessonGovernance requer lessonPlans.");
        }
        context.lessonGovernance = buildLessonGovernanceArtifact({
          lessonPlans: context.lessonPlans,
          courseGraph: context.courseGraph || {}
        });
        savePhaseArtifact(artifactStore, runId, phaseArtifactIds, "lesson-governance", context.lessonGovernance);
      } else if (phaseId === "plan_microsequences") {
        if (["lesson", "module", "course"].includes(intent.scope?.level) && !context.lessonPlans?.length) {
          if (intent.scope?.level === "lesson") {
            const scopedLessonPlan = buildScopedLessonPlan(context.projectDocument, intent.scope);
            if (!scopedLessonPlan) {
              throw new Error("Escopo de lição sem lição válida para planejar microssequências.");
            }
            context.lessonPlans = [scopedLessonPlan];
          } else if (intent.scope?.level === "module") {
            context.lessonPlans = buildScopedLessonPlansFromModule(context.projectDocument, intent.scope);
            if (!context.lessonPlans.length) {
              throw new Error("Escopo de módulo sem lições válidas para planejar microssequências.");
            }
          } else {
            context.lessonPlans = buildScopedLessonPlansFromCourse(context.projectDocument, intent.scope);
            if (!context.lessonPlans.length) {
              throw new Error("Escopo de curso sem lições válidas para planejar microssequências.");
            }
          }
          savePhaseArtifact(artifactStore, runId, phaseArtifactIds, "lesson-plans", context.lessonPlans);
        }
        const interventionPlan = context.interventionPlan || null;
        if (intent?.intervention?.mode === "targeted_existing_microsequences" || interventionPlan?.planningMode === "existing_only") {
          context.microsequencePlans = buildExistingMicrosequencePlansForScope(context.projectDocument, intent.scope, intent);
          if (!context.microsequencePlans.length) {
            throw new Error("Intervenção local sem microssequências reutilizáveis no escopo selecionado.");
          }
          context.microsequencePlans = repairCourseForgeMicrosequenceMetadataDeterministically({
            microsequencePlans: context.microsequencePlans,
            lessonPlans: context.lessonPlans || []
          });
          context.microsequencePlans = constrainCourseForgeMicrosequencePlansToInterventionPlan({
            plan: interventionPlan,
            microsequencePlans: context.microsequencePlans,
            projectDocument: context.projectDocument
          });
          savePhaseArtifact(artifactStore, runId, phaseArtifactIds, "microsequence-plans", context.microsequencePlans);
        } else {
          const response = await executeCourseForgeProviderPhase({
            provider,
            phaseId,
            modelId: phaseModelId,
            prompt: buildCourseForgePrompt({
              role: "Você planeja microssequências para as lições do AraLearn.",
              sourcePack: JSON.stringify(context.sourceLedger || []),
              task:
                interventionPlan?.providerTask
                || "Crie microssequências pequenas, progressivas e sem bastidor para cada lição planejada, cobrindo itens centrais do domínio antes de extensões e distribuindo explicação antes de prática do mesmo item.",
              output: "Responda somente JSON válido com microsequencePlans."
            }),
            schema: null,
            artifacts: [
              { id: "intent", name: "intent", content: JSON.stringify(intent) },
              { id: "lesson-plans", name: "lesson-plans", content: JSON.stringify(context.lessonPlans || []) },
              { id: "course-graph", name: "course-graph", content: JSON.stringify(context.courseGraph || {}) },
              { id: "lesson-governance", name: "lesson-governance", content: JSON.stringify(context.lessonGovernance || []) },
              ...(interventionPlan ? [{ id: "intervention-plan", name: "intervention-plan", content: JSON.stringify(interventionPlan) }] : [])
            ]
          });
          context.microsequencePlans = repairCourseForgeMicrosequenceMetadataDeterministically({
            microsequencePlans: normalizeMicrosequencePlans(response.value || response || {}, context.lessonPlans || []),
            lessonPlans: context.lessonPlans || []
          });
          context.microsequencePlans = constrainCourseForgeMicrosequencePlansToInterventionPlan({
            plan: interventionPlan,
            microsequencePlans: context.microsequencePlans,
            projectDocument: context.projectDocument
          });
          if (interventionPlan?.planningMode === "new_only" && !context.microsequencePlans.length) {
            throw new Error("Planejamento de intervenção não gerou novas microssequências válidas para os alvos pedidos.");
          }
          savePhaseArtifact(artifactStore, runId, phaseArtifactIds, "microsequence-plans", context.microsequencePlans);
        }
      } else if (phaseId === "audit_microsequences") {
        const localAudit = validateCourseForgeMicrosequencePlans({
          microsequencePlans: context.microsequencePlans || [],
          lessonPlans: context.lessonPlans || []
        });
        if (!localAudit.ok) {
          throw new Error(`Planejamento de microssequências inválido: ${localAudit.errors.join(" ")}`);
        }
        let providerAudit = { approved: true, issues: [], warnings: [] };
        if (provider?.id !== "fake" || provider?.capabilities?.provider === "fake") {
          const response = await executeCourseForgeProviderPhase({
            provider,
            phaseId,
            modelId: phaseModelId,
            prompt: buildCourseForgePrompt({
              role: "Você audita o planejamento de microssequências do AraLearn.",
              sourcePack: JSON.stringify(context.sourceLedger || []),
              task: "Aponte saltos de progressão, duplicações, escopo excessivo e falta de prática distribuída.",
              output: "Responda somente JSON válido com approved, issues e warnings."
            }),
            schema: null,
            artifacts: [
              { id: "intent", name: "intent", content: JSON.stringify(intent) },
              { id: "microsequence-plans", name: "microsequence-plans", content: JSON.stringify(context.microsequencePlans || []) }
            ]
          });
          providerAudit = structuredClone(response.value || response || providerAudit);
        }
        context.microsequenceAudit = {
          approved: providerAudit.approved !== false,
          issues: Array.isArray(providerAudit.issues) ? providerAudit.issues : [],
          warnings: [
            ...(localAudit.warnings || []).map((message) => ({ severity: "warning", evidence: message })),
            ...(Array.isArray(providerAudit.warnings) ? providerAudit.warnings : [])
          ]
        };
        const blockingIssues = (context.microsequenceAudit.issues || []).filter((item) => item?.severity !== "warning");
        runState = updateCourseForgeRunState(runState, {
          metrics: updateMetricsCategory(runState.metrics, "planning", {
            issueCount: blockingIssues.length,
            lastFailureCategory: blockingIssues.length ? "planning" : runState?.metrics?.lastFailureCategory || ""
          })
        });
        if (providerAudit.approved === false || blockingIssues.length) {
          throw new Error("Auditoria de microssequências reprovou o planejamento atual.");
        }
        savePhaseArtifact(artifactStore, runId, phaseArtifactIds, "microsequence-audit", context.microsequenceAudit);
      } else if (phaseId === "repair_microsequences") {
        const interventionPlan = context.interventionPlan || null;
        runState = updateCourseForgeRunState(runState, {
          metrics: updateMetricsCategory(runState.metrics, "planning", {
            repairCalls: Number(runState?.metrics?.repairCallsByCategory?.planning || 0) + 1
          })
        });
        context.microsequencePlans = repairCourseForgeMicrosequenceMetadataDeterministically({
          microsequencePlans: context.microsequencePlans || [],
          lessonPlans: context.lessonPlans || []
        });
        context.microsequencePlans = constrainCourseForgeMicrosequencePlansToInterventionPlan({
          plan: interventionPlan,
          microsequencePlans: context.microsequencePlans,
          projectDocument: context.projectDocument
        });
        const adherenceAuditInput = buildCompositeMicrosequencePlansForInterventionAudit({
          projectDocument: context.projectDocument,
          interventionPlan,
          microsequencePlans: context.microsequencePlans
        });
        let adherenceAudit = auditCourseForgeDomainCoverage({
          microsequencePlans: adherenceAuditInput,
          lessonPlans: context.lessonPlans || []
        });
        let interventionDidacticAudit = auditCourseForgeInterventionDidacticCoherence({
          microsequencePlans: context.microsequencePlans || [],
          interventionPlan
        });
        context.microsequenceAdherenceAudit = adherenceAudit;
        context.interventionDidacticAudit = interventionDidacticAudit;
        context.microsequenceRepairDirectives = buildCourseForgeMicrosequenceRepairDirectives({
          adherenceAudit,
          interventionDidacticAudit,
          interventionPlan
        });
        let combinedPlanningAudit = mergeCourseForgeAdherenceAudits(adherenceAudit, interventionDidacticAudit);

        if (hasBlockingIssues(combinedPlanningAudit)) {
          const response = await executeCourseForgeProviderPhase({
            provider,
            phaseId,
            modelId: phaseModelId,
            prompt: buildCourseForgePrompt({
              role: "Você repara o planejamento de microssequências do AraLearn.",
              sourcePack: JSON.stringify(context.sourceLedger || []),
              task: buildMicrosequenceRepairTask(context.microsequenceRepairDirectives),
              output: "Responda somente JSON válido com microsequencePlans."
            }),
            schema: null,
            artifacts: [
              { id: "intent", name: "intent", content: JSON.stringify(intent) },
              { id: "lesson-plans", name: "lesson-plans", content: JSON.stringify(context.lessonPlans || []) },
              { id: "microsequence-plans", name: "microsequence-plans", content: JSON.stringify(context.microsequencePlans || []) },
              { id: "microsequence-issues", name: "microsequence-issues", content: JSON.stringify(combinedPlanningAudit.issues || []) },
              { id: "microsequence-repair-directives", name: "microsequence-repair-directives", content: JSON.stringify(context.microsequenceRepairDirectives || { directives: [] }) },
              ...(interventionPlan ? [{ id: "intervention-plan", name: "intervention-plan", content: JSON.stringify(interventionPlan) }] : [])
            ]
          });
          context.microsequencePlans = repairCourseForgeMicrosequenceMetadataDeterministically({
            microsequencePlans: normalizeMicrosequencePlans(response.value || response || {}, context.lessonPlans || []),
            lessonPlans: context.lessonPlans || []
          });
          context.microsequencePlans = constrainCourseForgeMicrosequencePlansToInterventionPlan({
            plan: interventionPlan,
            microsequencePlans: context.microsequencePlans,
            projectDocument: context.projectDocument
          });
          const structuralAudit = validateCourseForgeMicrosequencePlans({
            microsequencePlans: context.microsequencePlans || [],
            lessonPlans: context.lessonPlans || []
          });
          if (!structuralAudit.ok) {
            throw new Error(`Reparo de microssequências inválido: ${structuralAudit.errors.join(" ")}`);
          }
          adherenceAudit = auditCourseForgeDomainCoverage({
            microsequencePlans: buildCompositeMicrosequencePlansForInterventionAudit({
              projectDocument: context.projectDocument,
              interventionPlan,
              microsequencePlans: context.microsequencePlans
            }),
            lessonPlans: context.lessonPlans || []
          });
          interventionDidacticAudit = auditCourseForgeInterventionDidacticCoherence({
            microsequencePlans: context.microsequencePlans || [],
            interventionPlan
          });
          context.microsequenceAdherenceAudit = adherenceAudit;
          context.interventionDidacticAudit = interventionDidacticAudit;
          context.microsequenceRepairDirectives = buildCourseForgeMicrosequenceRepairDirectives({
            adherenceAudit,
            interventionDidacticAudit,
            interventionPlan
          });
          combinedPlanningAudit = mergeCourseForgeAdherenceAudits(adherenceAudit, interventionDidacticAudit);
        }

        savePhaseArtifact(artifactStore, runId, phaseArtifactIds, "microsequence-plans", context.microsequencePlans);
        savePhaseArtifact(artifactStore, runId, phaseArtifactIds, "microsequence-adherence-audit", context.microsequenceAdherenceAudit);
        savePhaseArtifact(artifactStore, runId, phaseArtifactIds, "intervention-didactic-audit", context.interventionDidacticAudit);
        savePhaseArtifact(artifactStore, runId, phaseArtifactIds, "microsequence-repair-directives", context.microsequenceRepairDirectives);
        runState = updateCourseForgeRunState(runState, {
          metrics: updateMetricsCategory(runState.metrics, "planning", {
            issueCount: sumBlockingIssues(mergeCourseForgeAdherenceAudits(context.microsequenceAdherenceAudit, context.interventionDidacticAudit)),
            lastFailureCategory: hasBlockingIssues(mergeCourseForgeAdherenceAudits(context.microsequenceAdherenceAudit, context.interventionDidacticAudit))
              ? "planning"
              : runState?.metrics?.lastFailureCategory || ""
          })
        });
        const finalPlanningAudit = mergeCourseForgeAdherenceAudits(context.microsequenceAdherenceAudit, context.interventionDidacticAudit);
        if (hasBlockingIssues(finalPlanningAudit)) {
          throw new Error(`Planejamento de microssequências ainda falhou na auditoria didática: ${finalPlanningAudit.issues.map((item) => item.evidence).join(" ")}`);
        }
      } else if (phaseId === "build_microsequence_contract") {
        if (intent.scope?.level === "microsequence") {
          if (!context.lessonPlans?.length) {
            const scopedLessonPlan = buildScopedLessonPlan(context.projectDocument, intent.scope);
            if (!scopedLessonPlan) {
              throw new Error("Escopo de microssequência sem lição válida para montar contrato.");
            }
            context.lessonPlans = [scopedLessonPlan];
            savePhaseArtifact(artifactStore, runId, phaseArtifactIds, "lesson-plans", context.lessonPlans);
          }
          if (!context.microsequencePlans?.length) {
            context.microsequencePlans = buildScopedMicrosequencePlans(context.projectDocument, intent.scope);
            if (!context.microsequencePlans.length) {
              throw new Error("Escopo de microssequência sem microssequência válida para gerar cards.");
            }
            savePhaseArtifact(artifactStore, runId, phaseArtifactIds, "microsequence-plans", context.microsequencePlans);
          }
        }
        context.microsequenceContracts = buildCourseForgeMicrosequenceContracts({
          lessonPlans: context.lessonPlans || [],
          microsequencePlans: context.microsequencePlans || [],
          sourceLedger: context.sourceLedger || {}
        });
        savePhaseArtifact(artifactStore, runId, phaseArtifactIds, "microsequence-contracts", context.microsequenceContracts);
      } else if (phaseId === "compile_card_plans") {
        context.cardPlans = buildCardPlansArtifact({ microsequenceContracts: context.microsequenceContracts });
        savePhaseArtifact(artifactStore, runId, phaseArtifactIds, "card-plans", context.cardPlans);
      } else if (phaseId === "build_cards") {
        context.cardDrafts = [];
        for (const microsequenceContract of context.microsequenceContracts || []) {
          const response = await executeCourseForgeProviderPhase({
            provider,
            phaseId,
            modelId: phaseModelId,
            prompt: buildCourseForgePrompt({
              role: "Você constrói cards didáticos para uma microssequência do AraLearn.",
              sourcePack: JSON.stringify(context.sourceLedger || []),
              task: "Gere apenas os cards pedidos, em linguagem didática autossuficiente, sem bastidor e obedecendo o recurso de cada posição.",
              output: "Responda somente JSON válido com cards."
            }),
            schema: null,
            artifacts: [
              { id: "intent", name: "intent", content: JSON.stringify(intent) },
              { id: "microsequence-contract", name: "microsequence-contract", content: JSON.stringify(microsequenceContract) }
            ]
          });
          context.cardDrafts.push(normalizeCourseForgeCardsPayload(response.value || response || {}, microsequenceContract));
        }
        savePhaseArtifact(artifactStore, runId, phaseArtifactIds, "card-drafts", context.cardDrafts);
      } else if (phaseId === "audit_cards") {
        context.cardsAudit = auditCourseForgeCardDrafts({
          cardDrafts: context.cardDrafts || [],
          microsequenceContracts: context.microsequenceContracts || []
        });
        if (
          Array.isArray(context.cardsAudit?.normalizedDrafts) &&
          context.cardsAudit.normalizedDrafts.length === (context.cardDrafts || []).length
        ) {
          context.cardDrafts = context.cardsAudit.normalizedDrafts;
          savePhaseArtifact(artifactStore, runId, phaseArtifactIds, "card-drafts", context.cardDrafts);
        }
        runState = updateCourseForgeRunState(runState, {
          metrics: updateMetricsCategory(runState.metrics, "cards", {
            issueCount: sumBlockingIssues(context.cardsAudit),
            lastFailureCategory: hasBlockingIssues(context.cardsAudit) ? "cards" : runState?.metrics?.lastFailureCategory || ""
          })
        });
        savePhaseArtifact(artifactStore, runId, phaseArtifactIds, "cards-audit", context.cardsAudit);
      } else if (phaseId === "audit_source_adherence") {
        const sourceGroundingAudit = auditCourseForgeSourceAdherence({
          cardDrafts: context.cardDrafts || [],
          sourceLedger: context.sourceLedger || []
        });
        context.sourceAdherenceAudit = sourceGroundingAudit;
        runState = updateCourseForgeRunState(runState, {
          metrics: updateMetricsCategory(runState.metrics, "adherence", {
            issueCount: sumBlockingIssues(context.sourceAdherenceAudit),
            lastFailureCategory: hasBlockingIssues(context.sourceAdherenceAudit) ? "adherence" : runState?.metrics?.lastFailureCategory || ""
          })
        });
        savePhaseArtifact(artifactStore, runId, phaseArtifactIds, "source-adherence-audit", context.sourceAdherenceAudit);
      } else if (phaseId === "repair_cards") {
        const cardIssues = mergeCardAudits(context.cardsAudit || {});
        if (!hasBlockingIssues(cardIssues)) {
          context.cardsFinal = cloneCardsFinalFromDrafts(context.cardDrafts || []);
          savePhaseArtifact(artifactStore, runId, phaseArtifactIds, "cards-final", context.cardsFinal);
        } else {
          runState = updateCourseForgeRunState(runState, {
            metrics: updateMetricsCategory(runState.metrics, "cards", {
              repairCalls: Number(runState?.metrics?.repairCallsByCategory?.cards || 0) + 1
            })
          });
          let repairedDrafts = structuredClone(context.cardDrafts || []);
          let postRepairCardsAudit = auditCourseForgeCardDrafts({
            cardDrafts: repairedDrafts,
            microsequenceContracts: context.microsequenceContracts || []
          });
          if (hasBlockingIssues(mergeCardAudits(postRepairCardsAudit))) {
            const repairedByProvider = [];
            for (const microsequenceContract of context.microsequenceContracts || []) {
              const currentDraft = repairedDrafts.find((entry) => entry.contractId === microsequenceContract.contractId);
              const relatedIssues = cardIssues.issues.filter((item) => item?.contractId === microsequenceContract.contractId);
              if (!relatedIssues.length) {
                repairedByProvider.push(structuredClone(currentDraft));
                continue;
              }
              const response = await executeCourseForgeProviderPhase({
                provider,
                phaseId,
                modelId: phaseModelId,
                prompt: buildCourseForgePrompt({
                  role: "Você repara cards didáticos já planejados para o AraLearn.",
                  sourcePack: JSON.stringify(context.sourceLedger || []),
                  task: "Corrija apenas os problemas apontados pela auditoria, preservando a intenção didática da microssequência.",
                  output: "Responda somente JSON válido com cards."
                }),
                schema: null,
                artifacts: [
                  { id: "intent", name: "intent", content: JSON.stringify(intent) },
                  { id: "microsequence-contract", name: "microsequence-contract", content: JSON.stringify(microsequenceContract) },
                  { id: "card-draft", name: "card-draft", content: JSON.stringify(currentDraft || {}) },
                  { id: "card-issues", name: "card-issues", content: JSON.stringify(relatedIssues) }
                ]
              });
              repairedByProvider.push(normalizeCourseForgeCardsPayload(response.value || response || {}, microsequenceContract));
            }
            repairedDrafts = repairedByProvider;
            postRepairCardsAudit = auditCourseForgeCardDrafts({
              cardDrafts: repairedDrafts,
              microsequenceContracts: context.microsequenceContracts || []
            });
          }

          const finalAudit = mergeCardAudits(postRepairCardsAudit);
          context.cardsAudit = postRepairCardsAudit;
          savePhaseArtifact(artifactStore, runId, phaseArtifactIds, "cards-audit", context.cardsAudit);
          if (hasBlockingIssues(finalAudit)) {
            throw new Error(`Os cards ainda falharam na auditoria: ${finalAudit.issues.map((item) => item.evidence).join(" ")}`);
          }
          context.cardDrafts = Array.isArray(postRepairCardsAudit.normalizedDrafts) && postRepairCardsAudit.normalizedDrafts.length
            ? structuredClone(postRepairCardsAudit.normalizedDrafts)
            : structuredClone(repairedDrafts);
          savePhaseArtifact(artifactStore, runId, phaseArtifactIds, "card-drafts", context.cardDrafts);
          context.cardsFinal = cloneCardsFinalFromDrafts(context.cardDrafts);
          savePhaseArtifact(artifactStore, runId, phaseArtifactIds, "cards-final", context.cardsFinal);
        }
        runState = updateCourseForgeRunState(runState, {
          metrics: updateMetricsCategory(runState.metrics, "cards", {
            issueCount: sumBlockingIssues(context.cardsAudit),
            lastFailureCategory: hasBlockingIssues(context.cardsAudit) ? "cards" : runState?.metrics?.lastFailureCategory || ""
          })
        });
      } else if (phaseId === "repair_card_adherence") {
        const adherenceIssues = mergeCourseForgeAdherenceAudits(context.sourceAdherenceAudit || {});
        if (!hasBlockingIssues(adherenceIssues)) {
          if (!context.cardsFinal) {
            const normalizedCards = auditCourseForgeCardDrafts({
              cardDrafts: context.cardDrafts || [],
              microsequenceContracts: context.microsequenceContracts || []
            });
            context.cardDrafts = Array.isArray(normalizedCards.normalizedDrafts) && normalizedCards.normalizedDrafts.length
              ? structuredClone(normalizedCards.normalizedDrafts)
              : structuredClone(context.cardDrafts || []);
            savePhaseArtifact(artifactStore, runId, phaseArtifactIds, "card-drafts", context.cardDrafts);
            context.cardsFinal = cloneCardsFinalFromDrafts(context.cardDrafts);
            savePhaseArtifact(artifactStore, runId, phaseArtifactIds, "cards-final", context.cardsFinal);
          }
        } else {
          runState = updateCourseForgeRunState(runState, {
            metrics: updateMetricsCategory(runState.metrics, "adherence", {
              repairCalls: Number(runState?.metrics?.repairCallsByCategory?.adherence || 0) + 1
            })
          });
          let repairedDrafts = repairCourseForgeDraftCardsDeterministically({
            cardDrafts: context.cardDrafts || [],
            sourceLedger: context.sourceLedger || []
          });
          let postRepairSourceAudit = auditCourseForgeSourceAdherence({
            cardDrafts: repairedDrafts,
            sourceLedger: context.sourceLedger || []
          });

          if (hasBlockingIssues(postRepairSourceAudit)) {
            const repairedByProvider = [];
            for (const microsequenceContract of context.microsequenceContracts || []) {
              const currentDraft = repairedDrafts.find((entry) => entry.contractId === microsequenceContract.contractId);
              const relatedIssues = adherenceIssues.issues.filter((item) => item?.contractId === microsequenceContract.contractId);
              if (!relatedIssues.length) {
                repairedByProvider.push(structuredClone(currentDraft));
                continue;
              }
              const response = await executeCourseForgeProviderPhase({
                provider,
                phaseId,
                modelId: phaseModelId,
                prompt: buildCourseForgePrompt({
                  role: "Você repara aderência editorial e grounding de cards do AraLearn.",
                  sourcePack: JSON.stringify(context.sourceLedger || []),
                  task: "Corrija apenas problemas de sourceRefs, aderência às fontes e formulação editorial associada ao grounding, sem trocar a função didática do card.",
                  output: "Responda somente JSON válido com cards."
                }),
                schema: null,
                artifacts: [
                  { id: "intent", name: "intent", content: JSON.stringify(intent) },
                  { id: "microsequence-contract", name: "microsequence-contract", content: JSON.stringify(microsequenceContract) },
                  { id: "card-draft", name: "card-draft", content: JSON.stringify(currentDraft || {}) },
                  { id: "adherence-issues", name: "adherence-issues", content: JSON.stringify(relatedIssues) }
                ]
              });
              repairedByProvider.push(normalizeCourseForgeCardsPayload(response.value || response || {}, microsequenceContract));
            }
            repairedDrafts = repairedByProvider;
            postRepairSourceAudit = auditCourseForgeSourceAdherence({
              cardDrafts: repairedDrafts,
              sourceLedger: context.sourceLedger || []
            });
          }

          context.cardDrafts = structuredClone(repairedDrafts);
          const normalizedCards = auditCourseForgeCardDrafts({
            cardDrafts: context.cardDrafts || [],
            microsequenceContracts: context.microsequenceContracts || []
          });
          context.cardDrafts = Array.isArray(normalizedCards.normalizedDrafts) && normalizedCards.normalizedDrafts.length
            ? structuredClone(normalizedCards.normalizedDrafts)
            : structuredClone(context.cardDrafts);
          savePhaseArtifact(artifactStore, runId, phaseArtifactIds, "card-drafts", context.cardDrafts);
          context.sourceAdherenceAudit = postRepairSourceAudit;
          savePhaseArtifact(artifactStore, runId, phaseArtifactIds, "source-adherence-audit", context.sourceAdherenceAudit);
          if (hasBlockingIssues(postRepairSourceAudit)) {
            throw new Error(`Os cards ainda falharam na aderência editorial: ${postRepairSourceAudit.issues.map((item) => item.evidence).join(" ")}`);
          }
          context.cardsFinal = cloneCardsFinalFromDrafts(context.cardDrafts);
          savePhaseArtifact(artifactStore, runId, phaseArtifactIds, "cards-final", context.cardsFinal);
        }
        runState = updateCourseForgeRunState(runState, {
          metrics: updateMetricsCategory(runState.metrics, "adherence", {
            issueCount: sumBlockingIssues(context.sourceAdherenceAudit),
            lastFailureCategory: hasBlockingIssues(context.sourceAdherenceAudit) ? "adherence" : runState?.metrics?.lastFailureCategory || ""
          })
        });
      } else if (phaseId === "audit_prerequisites") {
        context.prerequisiteAudit = auditCourseForgePrerequisiteCoverage({
          microsequencePlans: context.microsequencePlans || [],
          courseGraph: context.courseGraph || {}
        });
        runState = updateCourseForgeRunState(runState, {
          metrics: updateMetricsCategory(runState.metrics, "prerequisites", {
            issueCount: sumBlockingIssues(context.prerequisiteAudit),
            lastFailureCategory: hasBlockingIssues(context.prerequisiteAudit) ? "prerequisites" : runState?.metrics?.lastFailureCategory || ""
          })
        });
        savePhaseArtifact(artifactStore, runId, phaseArtifactIds, "prerequisite-audit", context.prerequisiteAudit);
        if (hasBlockingIssues(context.prerequisiteAudit)) {
          throw new Error(`A auditoria de pré-requisitos bloqueou o fluxo: ${context.prerequisiteAudit.issues.map((item) => item.evidence).join(" ")}`);
        }
      } else if (phaseId === "audit_assessment_alignment") {
        context.assessmentAlignmentAudit = auditCourseForgeAssessmentAlignment({
          cardsFinal: context.cardsFinal || [],
          assessmentProfile: context.assessmentProfile || {},
          courseGraph: context.courseGraph || {},
          lessonPlans: context.lessonPlans || []
        });
        runState = updateCourseForgeRunState(runState, {
          metrics: updateMetricsCategory(runState.metrics, "assessment", {
            issueCount: sumBlockingIssues(context.assessmentAlignmentAudit),
            lastFailureCategory:
              hasBlockingIssues(context.assessmentAlignmentAudit) ? "assessment" : runState?.metrics?.lastFailureCategory || ""
          })
        });
        savePhaseArtifact(artifactStore, runId, phaseArtifactIds, "assessment-alignment-audit", context.assessmentAlignmentAudit);
        if (hasBlockingIssues(context.assessmentAlignmentAudit)) {
          throw new Error(
            `A auditoria de alinhamento avaliativo bloqueou o fluxo: ${context.assessmentAlignmentAudit.issues.map((item) => item.evidence).join(" ")}`
          );
        }
      } else if (phaseId === "compile_patch") {
        const constrainedMicrosequencePlans = constrainCourseForgeMicrosequencePlansToInterventionPlan({
          plan: context.interventionPlan || null,
          microsequencePlans: context.microsequencePlans || [],
          projectDocument: context.projectDocument
        });
        const cardsByMicrosequenceId = new Map(
          (Array.isArray(context.cardsFinal) ? context.cardsFinal : [])
            .map((entry) => [entry.contractId, entry])
            .filter(([contractId]) => contractId)
        );
        const microsequencePlansWithCards = constrainedMicrosequencePlans.map((lessonPlan) => ({
          ...structuredClone(lessonPlan),
          microsequences: (Array.isArray(lessonPlan?.microsequences) ? lessonPlan.microsequences : []).map((microsequence) => {
            const cardsEntry = cardsByMicrosequenceId.get([
              text(lessonPlan?.courseKey),
              text(lessonPlan?.moduleKey),
              text(lessonPlan?.lessonKey),
              text(microsequence?.key)
            ].join("::"));
            return {
              ...structuredClone(microsequence),
              ...(Array.isArray(cardsEntry?.publicCards) ? { publicCards: structuredClone(cardsEntry.publicCards) } : {})
            };
          })
        }));
        context.patch = compileCourseStructureToPatch({
          intent,
          architectureDraft: context.architectureFinal || context.architectureDraft
            ? {
                ...(context.architectureFinal || context.architectureDraft || {}),
                microsequencePlans: microsequencePlansWithCards
              }
            : {
                microsequencePlans: microsequencePlansWithCards
              },
          projectDocument: context.projectDocument,
          interventionPlan: context.interventionPlan || null
        });
        savePhaseArtifact(artifactStore, runId, phaseArtifactIds, "patch-final", context.patch);
      } else if (phaseId === "validate_patch") {
        const validation = validateCourseForgePatch(context.patch, {
          intent,
          interventionPlan: context.interventionPlan || null
        });
        if (!validation.ok) {
          throw new Error(validation.errors.join(" "));
        }
      } else if (phaseId === "apply_patch") {
        context.projectDocument = applyCourseForgePatch(context.projectDocument, context.patch, { intent });
        savePhaseArtifact(artifactStore, runId, phaseArtifactIds, "project-after-patch", context.projectDocument);
      } else if (phaseId === "final_report") {
        const diagnosticsSummary = buildDiagnosticsSummary(context, runState, phases);
        savePhaseArtifact(artifactStore, runId, phaseArtifactIds, "diagnostics-summary", diagnosticsSummary);
        savePhaseArtifact(artifactStore, runId, phaseArtifactIds, "final-report", {
          runId,
          status: "completed",
          phases,
          patchOperations: context.patch?.operations?.length || 0,
          patchEvents: context.patch?.events?.length || 0,
          interventionMode: text(intent?.intervention?.mode),
          interventionRecommendation: text(context.interventionResponse?.recommendedAction),
          interventionRequestStatus: text(context.interventionRequest?.status),
          interventionEditorOperation: text(context.interventionRequest?.editorIntent?.operation),
          interventionPlanningMode: text(context.interventionPlan?.planningMode),
          cameFromInterventionRequest: Boolean(intent?.interventionRequest),
          requestedGenerationDepth: intent.requestedGenerationDepth,
          executedGenerationDepth: intent.generationDepth,
          deferredGenerationDepth: intent.deferredGenerationDepth,
          deferredPhases,
          diagnosticsSummary,
          metrics: structuredClone(runState.metrics || {})
        });
      }

      runState = markCourseForgePhase(runState, phaseId, {
        status: "completed",
        target: derivePhaseTarget({ phaseId, intent, context }),
        finishedAt: new Date().toISOString(),
        artifactIds: phaseArtifactIds
      });
      artifactStore.saveRun(runId, { runState, intent });
    } catch (error) {
      const failureCategory = inferFailureCategoryFromPhase(phaseId) || runState?.metrics?.lastFailureCategory || "";
      runState = markCourseForgePhase(runState, phaseId, {
        status: "failed",
        finishedAt: new Date().toISOString(),
        error: {
          message: text(error?.message) || "Falha do CourseForge."
        }
      });
      runState = updateCourseForgeRunState(runState, {
        status: "partial_failure",
        metrics: updateMetricsCategory(runState.metrics, failureCategory, {
          lastFailureCategory: failureCategory
        }),
        lastError: {
          phaseId,
          message: text(error?.message) || "Falha do CourseForge."
        }
      });
      artifactStore.saveArtifact(runId, "diagnostics-summary", buildDiagnosticsSummary(context, runState, phases));
      artifactStore.saveRun(runId, { runState, intent });
      const wrapped = new Error(text(error?.message) || "Falha do CourseForge.");
      wrapped.runState = runState;
      wrapped.runId = runId;
      throw wrapped;
    }
  }

  runState = updateCourseForgeRunState(runState, { status: "completed" });
  artifactStore.saveRun(runId, { runState, intent });
  return {
    runId,
    runState,
    projectDocument: context.projectDocument,
    patch: context.patch,
    interventionResponse: context.interventionResponse,
    interventionRequest: context.interventionRequest,
    interventionPlan: context.interventionPlan,
    artifacts: artifactStore.listArtifacts(runId)
  };
}
