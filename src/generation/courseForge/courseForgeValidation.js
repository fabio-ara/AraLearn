import { auditCourseForgeBackstageVocabulary } from "./courseForgeBackstageAudit.js";
import { validateCourseForgePatch } from "./courseForgePatch.js";
import { listCourseForgeSources } from "./courseForgeSourceLedger.js";
import { validateCourseForgeCardSourceRefs } from "./courseForgeSourceRefs.js";
import { validateCourseForgeSourceLedger } from "./courseForgeSourceLedger.js";

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizedText(value) {
  return text(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

const BACKSTAGE_TERMS = ["pipeline", "json", "schema", "prompt", "sourceguide", "domainmap", "llm", "auditoria"];

function hasBackstageVocabulary(value) {
  const normalized = normalizedText(value);
  return BACKSTAGE_TERMS.some((term) => normalized.includes(term));
}

function makeArchitectureIssue(target, type, evidence, requiredFix, severity = "blocking") {
  return {
    target,
    type,
    severity,
    evidence,
    requiredFix
  };
}

function makeCourseGraphIssue(target, type, evidence, requiredFix, severity = "blocking") {
  return {
    target,
    type,
    severity,
    evidence,
    requiredFix
  };
}

function readArchitectureCourse(architectureDraft = {}) {
  if (architectureDraft?.architectureFinal?.course) {
    return architectureDraft.architectureFinal.course;
  }
  if (architectureDraft?.architectureDraft?.course) {
    return architectureDraft.architectureDraft.course;
  }
  if (architectureDraft?.course) {
    return architectureDraft.course;
  }
  return null;
}

export function validateCourseForgeArchitectureDraft({ architectureDraft = {}, sourceLedger = [], scope = {} } = {}) {
  const blockingIssues = [];
  const warnings = [];
  const course = readArchitectureCourse(architectureDraft);
  const hasSources = listCourseForgeSources(sourceLedger).length > 0;

  if (!course) {
    blockingIssues.push(
      makeArchitectureIssue(
        "course",
        "missing_progression",
        "A arquitetura não devolveu curso utilizável.",
        "Gerar curso, módulos e lições válidos para o escopo."
      )
    );
    return {
      ok: false,
      approved: false,
      blockingIssues,
      warnings
    };
  }

  if (!text(course.title)) {
    blockingIssues.push(
      makeArchitectureIssue("course.title", "missing_progression", "Curso sem título.", "Definir um título claro para o curso.")
    );
  }
  if (hasBackstageVocabulary(course.title) || hasBackstageVocabulary(course.description)) {
    blockingIssues.push(
      makeArchitectureIssue(
        "course",
        "backstage_vocabulary",
        "A estrutura do curso expõe vocabulário de bastidor.",
        "Reescrever título e descrição em linguagem didática."
      )
    );
  }

  const modules = Array.isArray(course.modules) ? course.modules : [];
  if (!modules.length && scope?.level !== "lesson" && scope?.level !== "microsequence") {
    blockingIssues.push(
      makeArchitectureIssue("course.modules", "too_broad", "Curso sem módulos.", "Gerar ao menos um módulo no escopo.")
    );
  }

  const moduleTitles = new Set();
  modules.forEach((moduleValue, moduleIndex) => {
    const moduleTarget = `module:${text(moduleValue?.key) || moduleIndex + 1}`;
    const moduleTitle = text(moduleValue?.title);
    if (!moduleTitle) {
      blockingIssues.push(
        makeArchitectureIssue(moduleTarget, "missing_progression", "Módulo sem título.", "Definir um título claro para o módulo.")
      );
    }
    const moduleTitleKey = normalizedText(moduleTitle);
    if (moduleTitleKey && moduleTitles.has(moduleTitleKey)) {
      blockingIssues.push(
        makeArchitectureIssue(moduleTarget, "duplicated", `Título de módulo duplicado: ${moduleTitle}.`, "Remover duplicação entre módulos.")
      );
    }
    moduleTitles.add(moduleTitleKey);
    if (hasBackstageVocabulary(moduleTitle) || hasBackstageVocabulary(moduleValue?.description)) {
      blockingIssues.push(
        makeArchitectureIssue(moduleTarget, "backstage_vocabulary", "Módulo com vocabulário de bastidor.", "Reescrever o módulo.")
      );
    }

    const lessons = Array.isArray(moduleValue?.lessons) ? moduleValue.lessons : [];
    if (!lessons.length && scope?.level !== "course") {
      blockingIssues.push(
        makeArchitectureIssue(moduleTarget, "missing_progression", "Módulo sem lições.", "Gerar lições para o módulo.")
      );
    }

    const lessonTitles = new Set();
    lessons.forEach((lesson, lessonIndex) => {
      const lessonTarget = `${moduleTarget}/lesson:${text(lesson?.key) || lessonIndex + 1}`;
      const lessonTitle = text(lesson?.title);
      if (!lessonTitle) {
        blockingIssues.push(
          makeArchitectureIssue(lessonTarget, "missing_progression", "Lição sem título.", "Definir um título claro para a lição.")
        );
      }
      const lessonTitleKey = normalizedText(lessonTitle);
      if (lessonTitleKey && lessonTitles.has(lessonTitleKey)) {
        blockingIssues.push(
          makeArchitectureIssue(lessonTarget, "duplicated", `Título de lição duplicado: ${lessonTitle}.`, "Remover duplicação entre lições.")
        );
      }
      lessonTitles.add(lessonTitleKey);
      if (hasBackstageVocabulary(lessonTitle) || hasBackstageVocabulary(lesson?.description)) {
        blockingIssues.push(
          makeArchitectureIssue(lessonTarget, "backstage_vocabulary", "Lição com vocabulário de bastidor.", "Reescrever a lição.")
        );
      }
      const guide = lesson?.sourceGuideStructured;
      if (!guide || typeof guide !== "object" || !text(guide.lessonGoal)) {
        blockingIssues.push(
          makeArchitectureIssue(lessonTarget, "source_gap", "Lição sem `lessonGoal` estruturado.", "Gerar governança mínima da lição.")
        );
      }
      if (hasSources && !text(lesson?.description) && !text(guide?.notationRules) && !text(guide?.commonErrors)) {
        warnings.push(
          makeArchitectureIssue(
            lessonTarget,
            "missing_assessment_alignment",
            "Lição com pouca ancoragem explícita nas fontes disponíveis.",
            "Detalhar melhor foco, notação ou erros comuns.",
            "warning"
          )
        );
      }
    });
  });

  return {
    ok: blockingIssues.length === 0,
    approved: blockingIssues.length === 0,
    blockingIssues,
    warnings
  };
}

export function mergeCourseForgeArchitectureAudits(...audits) {
  const merged = {
    approved: true,
    blockingIssues: [],
    warnings: []
  };
  audits.forEach((audit) => {
    if (!audit || typeof audit !== "object") {
      return;
    }
    if (audit.approved === false) {
      merged.approved = false;
    }
    if (Array.isArray(audit.blockingIssues)) {
      merged.blockingIssues.push(...audit.blockingIssues);
    }
    if (Array.isArray(audit.warnings)) {
      merged.warnings.push(...audit.warnings);
    }
    if (Array.isArray(audit.issues)) {
      merged.blockingIssues.push(...audit.issues.filter((item) => item?.severity !== "warning"));
      merged.warnings.push(...audit.issues.filter((item) => item?.severity === "warning"));
    }
  });
  if (merged.blockingIssues.length) {
    merged.approved = false;
  }
  return merged;
}

function normalizeArray(value) {
  return Array.isArray(value) ? value : [];
}

export function validateCourseForgeLessonPlanSet({ architectureDraft = {}, lessonPlans = [] } = {}) {
  const course = readArchitectureCourse(architectureDraft);
  const errors = [];
  const warnings = [];
  const expectedLessonKeys = new Set();

  normalizeArray(course?.modules).forEach((moduleValue) => {
    normalizeArray(moduleValue?.lessons).forEach((lesson) => {
      expectedLessonKeys.add(text(lesson?.key));
    });
  });

  const seen = new Set();
  normalizeArray(lessonPlans).forEach((lessonPlan, index) => {
    const lessonKey = text(lessonPlan?.lessonKey);
    if (!lessonKey) {
      errors.push(`lessonPlans[${index}] sem lessonKey.`);
      return;
    }
    if (seen.has(lessonKey)) {
      errors.push(`lessonPlans com lessonKey duplicado: ${lessonKey}.`);
    }
    seen.add(lessonKey);
    if (!expectedLessonKeys.has(lessonKey)) {
      errors.push(`lessonPlans aponta para lessonKey inexistente na arquitetura: ${lessonKey}.`);
    }
    if (!text(lessonPlan?.lessonTitle)) {
      warnings.push(`lessonPlan ${lessonKey} sem lessonTitle explícito.`);
    }
  });

  expectedLessonKeys.forEach((lessonKey) => {
    if (!seen.has(lessonKey)) {
      errors.push(`Faltou lessonPlan para a lição ${lessonKey}.`);
    }
  });

  return {
    ok: errors.length === 0,
    errors,
    warnings
  };
}

export function validateCourseForgeCourseGraph({
  courseGraph = {},
  lessonPlans = [],
  assessmentProfile = {},
  sourceLedger = []
} = {}) {
  const blockingIssues = [];
  const warnings = [];
  const graph = courseGraph && typeof courseGraph === "object" ? courseGraph : {};
  const concepts = normalizeArray(graph.concepts);
  const objectives = normalizeArray(graph.objectives);
  const prerequisiteEdges = normalizeArray(graph.prerequisiteEdges);
  const assessmentTargets = normalizeArray(graph.assessmentTargets);
  const practiceVariants = normalizeArray(graph.practiceVariants);
  const lessonKeys = new Set(normalizeArray(lessonPlans).map((item) => text(item?.lessonKey)).filter(Boolean));
  const conceptIds = new Set();

  if (!text(graph.graphId)) {
    blockingIssues.push(
      makeCourseGraphIssue("graphId", "missing_graph_id", "CourseGraph sem graphId.", "Definir um graphId estável.")
    );
  }

  if (!concepts.length && !objectives.length) {
    blockingIssues.push(
      makeCourseGraphIssue(
        "course-graph",
        "missing_semantic_core",
        "CourseGraph sem conceitos e sem objetivos.",
        "Gerar conceitos e objetivos a partir do domainMap e da governança das lições."
      )
    );
  }

  concepts.forEach((concept, index) => {
    const conceptId = text(concept?.conceptId);
    const conceptTarget = `courseGraph.concepts[${index}]`;
    if (!conceptId) {
      blockingIssues.push(
        makeCourseGraphIssue(conceptTarget, "missing_concept_id", "Conceito sem conceptId.", "Gerar um conceptId estável.")
      );
      return;
    }
    if (conceptIds.has(conceptId)) {
      blockingIssues.push(
        makeCourseGraphIssue(conceptTarget, "duplicated_concept", `conceptId duplicado: ${conceptId}.`, "Remover duplicação.")
      );
    }
    conceptIds.add(conceptId);
    if (!text(concept?.label)) {
      blockingIssues.push(
        makeCourseGraphIssue(conceptTarget, "missing_label", `Conceito ${conceptId} sem label.`, "Definir label legível.")
      );
    }
    if (lessonKeys.size && !lessonKeys.has(text(concept?.lessonKey))) {
      blockingIssues.push(
        makeCourseGraphIssue(
          conceptTarget,
          "invalid_lesson_ref",
          `Conceito ${conceptId} aponta para lessonKey fora do escopo.`,
          "Vincular o conceito a uma lição válida."
        )
      );
    }
  });

  const objectiveLessonKeys = new Set();
  objectives.forEach((objective, index) => {
    const objectiveTarget = `courseGraph.objectives[${index}]`;
    const lessonKey = text(objective?.lessonKey);
    if (!text(objective?.objectiveId)) {
      blockingIssues.push(
        makeCourseGraphIssue(objectiveTarget, "missing_objective_id", "Objetivo sem objectiveId.", "Gerar objectiveId estável.")
      );
    }
    if (!text(objective?.description)) {
      blockingIssues.push(
        makeCourseGraphIssue(objectiveTarget, "missing_objective_description", "Objetivo sem descrição.", "Definir objetivo explícito.")
      );
    }
    if (lessonKey) {
      objectiveLessonKeys.add(lessonKey);
      if (lessonKeys.size && !lessonKeys.has(lessonKey)) {
        blockingIssues.push(
          makeCourseGraphIssue(
            objectiveTarget,
            "invalid_lesson_ref",
            `Objetivo ${text(objective?.objectiveId)} aponta para lessonKey fora do escopo.`,
            "Vincular o objetivo a uma lição válida."
          )
        );
      }
    }
  });

  prerequisiteEdges.forEach((edge, index) => {
    const edgeTarget = `courseGraph.prerequisiteEdges[${index}]`;
    const from = text(edge?.from);
    const to = text(edge?.to);
    if (!from || !to) {
      blockingIssues.push(
        makeCourseGraphIssue(edgeTarget, "invalid_edge", "Aresta de pré-requisito incompleta.", "Preencher origem e destino.")
      );
      return;
    }
    if (!conceptIds.has(from) || !conceptIds.has(to)) {
      blockingIssues.push(
        makeCourseGraphIssue(
          edgeTarget,
          "dangling_edge",
          `Aresta ${from} -> ${to} referencia conceito inexistente.`,
          "Apontar somente para conceitos presentes no grafo."
        )
      );
    }
  });

  practiceVariants.forEach((variant, index) => {
    const variantTarget = `courseGraph.practiceVariants[${index}]`;
    const ref = text(variant?.domainItemRef);
    if (!text(variant?.practiceVariantId)) {
      blockingIssues.push(
        makeCourseGraphIssue(variantTarget, "missing_variant_id", "PracticeVariant sem id.", "Gerar id estável.")
      );
    }
    if (!ref || !conceptIds.has(ref)) {
      blockingIssues.push(
        makeCourseGraphIssue(
          variantTarget,
          "dangling_variant",
          `PracticeVariant ${text(variant?.practiceVariantId)} referencia domínio inexistente.`,
          "Apontar domainItemRef para um conceito do grafo."
        )
      );
    }
  });

  normalizeArray(lessonPlans).forEach((lessonPlan) => {
    const lessonKey = text(lessonPlan?.lessonKey);
    if (!lessonKey) {
      return;
    }
    const lessonTarget = `lesson:${lessonKey}`;
    if (!concepts.some((concept) => text(concept?.lessonKey) === lessonKey)) {
      blockingIssues.push(
        makeCourseGraphIssue(
          lessonTarget,
          "missing_lesson_concepts",
          `CourseGraph sem conceitos para a lição ${lessonKey}.`,
          "Projetar os itens do domainMap para o grafo."
        )
      );
    }
    if (!objectiveLessonKeys.has(lessonKey)) {
      warnings.push(
        makeCourseGraphIssue(
          lessonTarget,
          "missing_lesson_objective",
          `CourseGraph sem objetivo explícito para a lição ${lessonKey}.`,
          "Derivar objetivo a partir de sourceGuideStructured.lessonGoal.",
          "warning"
        )
      );
    }
  });

  if (normalizeArray(assessmentProfile?.questionTypes).length && !assessmentTargets.length) {
    warnings.push(
      makeCourseGraphIssue(
        "courseGraph.assessmentTargets",
        "missing_assessment_targets",
        "Há sinais de avaliação, mas o CourseGraph não materializou assessmentTargets.",
        "Projetar alvos de avaliação no grafo.",
        "warning"
      )
    );
  }

  if (listCourseForgeSources(sourceLedger).length && !concepts.some((concept) => normalizeArray(concept?.sourceRefs).length)) {
    warnings.push(
      makeCourseGraphIssue(
        "courseGraph.concepts",
        "missing_source_grounding",
        "CourseGraph sem sourceRefs explícitos apesar de haver fontes disponíveis.",
        "Propagar sourceRefs do domainMap para o grafo.",
        "warning"
      )
    );
  }

  return {
    ok: blockingIssues.length === 0,
    approved: blockingIssues.length === 0,
    blockingIssues,
    warnings
  };
}

export function validateCourseForgeMicrosequencePlans({ microsequencePlans = [], lessonPlans = [] } = {}) {
  const errors = [];
  const warnings = [];
  const validLessonKeys = new Set(normalizeArray(lessonPlans).map((item) => text(item?.lessonKey)).filter(Boolean));

  normalizeArray(microsequencePlans).forEach((lessonPlan, lessonIndex) => {
    const lessonKey = text(lessonPlan?.lessonKey);
    if (!lessonKey) {
      errors.push(`microsequencePlans[${lessonIndex}] sem lessonKey.`);
      return;
    }
    if (!validLessonKeys.has(lessonKey)) {
      errors.push(`microsequencePlans aponta para lessonKey sem planejamento: ${lessonKey}.`);
    }
    const microsequences = normalizeArray(lessonPlan?.microsequences);
    if (!microsequences.length) {
      errors.push(`lessonKey ${lessonKey} sem microssequências planejadas.`);
      return;
    }
    const titles = new Set();
    microsequences.forEach((microsequence, microIndex) => {
      const title = text(microsequence?.title);
      if (!title) {
        errors.push(`lessonKey ${lessonKey} microsequence[${microIndex}] sem título.`);
      }
      const normalizedTitle = normalizedText(title);
      if (normalizedTitle && titles.has(normalizedTitle)) {
        errors.push(`lessonKey ${lessonKey} com microssequência duplicada: ${title}.`);
      }
      titles.add(normalizedTitle);
      if (hasBackstageVocabulary(title) || hasBackstageVocabulary(microsequence?.objective) || hasBackstageVocabulary(microsequence?.description)) {
        errors.push(`lessonKey ${lessonKey} contém vocabulário de bastidor em microssequência.`);
      }
      if (!text(microsequence?.objective) && !text(microsequence?.description)) {
        warnings.push(`lessonKey ${lessonKey} microsequence ${title || microIndex + 1} sem objetivo explícito.`);
      }
      if (!text(microsequence?.coverageRole)) {
        warnings.push(`lessonKey ${lessonKey} microsequence ${title || microIndex + 1} sem coverageRole.`);
      }
    });
  });

  return {
    ok: errors.length === 0,
    errors,
    warnings
  };
}

export function validateCourseForgeArtifacts({ sourceLedger = [], cards = [], lessonContext = {}, patch = null, intent = {} } = {}) {
  const sourceLedgerResult = validateCourseForgeSourceLedger(sourceLedger);
  const sourceRefResults = cards.map((card) => validateCourseForgeCardSourceRefs(card?.sourceRefs || [], sourceLedger));
  const backstageResults = cards.map((card) => auditCourseForgeBackstageVocabulary({ card, lessonContext }));
  const patchResult = patch ? validateCourseForgePatch(patch, { intent }) : { ok: true, errors: [] };

  return {
    ok:
      sourceLedgerResult.ok &&
      sourceRefResults.every((item) => item.ok) &&
      backstageResults.every((item) => item.ok) &&
      patchResult.ok,
    sourceLedgerResult,
    sourceRefResults,
    backstageResults,
    patchResult
  };
}

export function validateCourseForgeInterventionResponse({ response = {}, lessonContext = {} } = {}) {
  const errors = [];
  const warnings = [];
  const responseText = text(response?.responseText);
  const studyTrackConnection = text(response?.studyTrackConnection);
  const recommendedAction = text(response?.recommendedAction) || "answer_only";
  const allowedActions = new Set(["answer_only", "suggest_editor_patch", "needs_new_microsequence"]);

  if (!responseText) {
    errors.push("Resposta local sem responseText.");
  }
  if (!studyTrackConnection) {
    errors.push("Resposta local sem studyTrackConnection.");
  }
  if (!allowedActions.has(recommendedAction)) {
    errors.push(`recommendedAction inválido: ${recommendedAction}.`);
  }

  const backstageAudit = auditCourseForgeBackstageVocabulary({
    card: {
      text: `${responseText} ${studyTrackConnection}`
    },
    lessonContext
  });
  if (!backstageAudit.ok) {
    errors.push(`Resposta local expõe vocabulário de bastidor: ${backstageAudit.issues.join(", ")}.`);
  } else if (backstageAudit.requiresReview) {
    warnings.push(`Resposta local usa termos técnicos sensíveis: ${backstageAudit.issues.join(", ")}.`);
  }

  return {
    ok: errors.length === 0,
    approved: errors.length === 0,
    errors,
    warnings,
    response: {
      responseText,
      studyTrackConnection,
      recommendedAction,
      rationale: text(response?.rationale),
      target: structuredClone(response?.target || {})
    }
  };
}

export function validateCourseForgeInterventionRequest({ request = {} } = {}) {
  const errors = [];
  const warnings = [];
  const status = text(request?.status) || "not_needed";
  const recommendedAction = text(request?.recommendedAction) || "answer_only";
  const target = structuredClone(request?.target || {});
  const editorIntent = request?.editorIntent && typeof request.editorIntent === "object" ? request.editorIntent : null;
  const requestedChanges = Array.isArray(request?.requestedChanges) ? request.requestedChanges : [];
  const allowedStatuses = new Set(["not_needed", "ready"]);
  const allowedActions = new Set(["answer_only", "suggest_editor_patch", "needs_new_microsequence"]);
  const allowedLevels = new Set(["project", "course", "module", "lesson", "microsequence"]);
  const allowedOperations = new Set(["repair", "reinforce", "extend"]);
  const allowedGenerationDepthHints = new Set(["repair_only", "reinforce_only"]);
  const allowedDidacticInterventionTypes = new Set([
    "explanatory_bridge",
    "contrast_reinforcement",
    "guided_practice_bridge",
    "prerequisite_tightening",
    "local_semantic_rewrite"
  ]);

  if (!allowedStatuses.has(status)) {
    errors.push(`status inválido: ${status}.`);
  }
  if (!allowedActions.has(recommendedAction)) {
    errors.push(`recommendedAction inválido no pedido: ${recommendedAction}.`);
  }
  if (!allowedLevels.has(text(target?.level) || "project")) {
    errors.push(`target.level inválido no pedido: ${text(target?.level)}.`);
  }
  if (status === "not_needed" && recommendedAction !== "answer_only") {
    errors.push("Pedido sem intervenção não pode carregar ação diferente de answer_only.");
  }
  if (status === "ready") {
    if (!editorIntent) {
      errors.push("Pedido de intervenção sem editorIntent.");
    } else {
      if (!allowedOperations.has(text(editorIntent?.operation))) {
        errors.push(`editorIntent.operation inválido: ${text(editorIntent?.operation)}.`);
      }
      if (!allowedGenerationDepthHints.has(text(editorIntent?.generationDepthHint))) {
        errors.push(`editorIntent.generationDepthHint inválido: ${text(editorIntent?.generationDepthHint)}.`);
      }
      if (!text(editorIntent?.interventionModeHint)) {
        errors.push("Pedido de intervenção sem interventionModeHint.");
      }
    }
    if (!requestedChanges.length) {
      errors.push("Pedido de intervenção pronto sem requestedChanges.");
    }
  }
  if (recommendedAction === "needs_new_microsequence" && text(target?.level) === "microsequence") {
    errors.push("Pedido para nova microssequência não deve manter target de microsequence.");
  }

  requestedChanges.forEach((change, index) => {
    if (!text(change?.type)) {
      errors.push(`requestedChanges[${index}] sem type.`);
    }
    if (!text(change?.patchStrategy)) {
      errors.push(`requestedChanges[${index}] sem patchStrategy.`);
    }
    if (!allowedDidacticInterventionTypes.has(text(change?.didacticInterventionType))) {
      errors.push(`requestedChanges[${index}] com didacticInterventionType inválido: ${text(change?.didacticInterventionType)}.`);
    }
    if (!text(change?.reason)) {
      warnings.push(`requestedChanges[${index}] sem justificativa explícita.`);
    }
  });

  return {
    ok: errors.length === 0,
    approved: errors.length === 0,
    errors,
    warnings,
    request: {
      kind: text(request?.kind) || "intervention_request",
      status,
      source: text(request?.source) || "tutor_escalation",
      recommendedAction,
      studentPrompt: text(request?.studentPrompt),
      responseText: text(request?.responseText),
      studyTrackConnection: text(request?.studyTrackConnection),
      rationale: text(request?.rationale),
      target,
      editorIntent: editorIntent
        ? {
            operation: text(editorIntent?.operation),
            generationDepthHint: text(editorIntent?.generationDepthHint),
            interventionModeHint: text(editorIntent?.interventionModeHint),
            requestedBy: text(editorIntent?.requestedBy)
          }
        : null,
      requestedChanges: requestedChanges.map((change, index) => ({
        changeId: text(change?.changeId) || `requested_change_${index + 1}`,
        type: text(change?.type),
        operation: text(change?.operation),
        patchStrategy: text(change?.patchStrategy),
        didacticInterventionType: text(change?.didacticInterventionType),
        target: structuredClone(change?.target || {}),
        reason: text(change?.reason)
      })),
      contextSnapshot: {
        lessonKeys: Array.isArray(request?.contextSnapshot?.lessonKeys) ? request.contextSnapshot.lessonKeys.map(text).filter(Boolean) : [],
        microsequenceKeys: Array.isArray(request?.contextSnapshot?.microsequenceKeys)
          ? request.contextSnapshot.microsequenceKeys.map(text).filter(Boolean)
          : [],
        reusableMicrosequenceCount: Math.max(0, Number(request?.contextSnapshot?.reusableMicrosequenceCount || 0))
      }
    }
  };
}
