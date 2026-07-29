import { addPracticeToMicrosequence } from "../bottomUp/addPracticeToMicrosequence.js";
import { createBranchMicrosequence } from "../bottomUp/createBranchMicrosequence.js";
import { generateMicrosequenceCards } from "../bottomUp/generateMicrosequenceCards.js";
import { generateNextMicrosequence } from "../bottomUp/generateNextMicrosequence.js";
import { repairMicrosequenceCards } from "../bottomUp/repairMicrosequenceCards.js";
import { createEmptyProjectDocument } from "../../domain/aralearnProject.js";
import { planCourseFromScope } from "../topDown/planCourseFromScope.js";

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function uniqueList(values = []) {
  return [...new Set((Array.isArray(values) ? values : []).map((item) => text(item)).filter(Boolean))];
}

function normalizePreferredResource(value = "") {
  const normalized = text(value);
  const lowered = normalized.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  return lowered === "automatico" || lowered === "automatic" ? "" : normalized;
}

function selectedSourceIds(attachedSources = []) {
  return uniqueList(
    (Array.isArray(attachedSources) ? attachedSources : []).map((item) => item?.id || item?.sourceId)
  );
}

function selectedExtraResources(preparedIntervention = {}, draft = {}) {
  return uniqueList([
    preparedIntervention?.requestContext?.preferredResource,
    normalizePreferredResource(draft?.preferredContainer)
  ]);
}

const STRUCTURE_PROGRESS_PHASE_IDS = Object.freeze([
  "normalize_intent",
  "index_sources",
  "build_assessment_profile",
  "plan_architecture",
  "compile_patch",
  "validate_patch",
  "apply_patch",
  "final_report"
]);

function emitStructurePhase(onProgress, phaseId, type, patch = {}) {
  onProgress?.({
    type,
    phaseId,
    phaseIds: STRUCTURE_PROGRESS_PHASE_IDS,
    phaseCount: STRUCTURE_PROGRESS_PHASE_IDS.length,
    ...patch
  });
}

function buildScopeContract({ draft = {}, scopeState = {} } = {}) {
  const courseTitle = text(scopeState?.course?.title || draft.courseInput) || "Curso";
  const moduleTitle = text(scopeState?.moduleValue?.title || draft.moduleInput) || "Módulo";
  const lessonTitle = text(scopeState?.lesson?.title || draft.lessonInput) || "Lição";
  const include = uniqueList(draft.includeTopics);
  const exclude = uniqueList(draft.excludeTopics);
  return {
    schemaVersion: "aralearn.scope.v1",
    course: {
      title: courseTitle,
      goal: text(draft.promptText) || `Organizar ${courseTitle}.`,
      evidencePriority: ["exercise_list"]
    },
    modules: [
      {
        title: moduleTitle,
        include: include.length ? include : [lessonTitle],
        exclude,
        notes: text(draft.promptText),
        assessmentStyle: "mixed"
      }
    ]
  };
}

function buildPatchTargetFromProject(projectDocument = {}) {
  const course = projectDocument.courses?.[0] || null;
  const moduleValue = course?.modules?.[0] || null;
  const lesson = moduleValue?.lessons?.[0] || null;
  return {
    courseKey: course?.id || "",
    moduleKey: moduleValue?.id || "",
    lessonKey: lesson?.id || ""
  };
}

function resolveMicrosequenceAction(draft = {}) {
  if (text(draft.actionIntent) === "next_planned") {
    return "next_planned";
  }
  if (text(draft.actionIntent) === "branch_after_current") {
    return "branch";
  }
  if (text(draft.operationMode) === "repair") {
    return "repair";
  }
  return "generate";
}

export async function generateStructureProjectDocument({
  draft = {},
  scopeState = {},
  projectDocument = createEmptyProjectDocument(),
  preparedGeneration = {},
  onProgress
} = {}) {
  const launchConfig = preparedGeneration?.launchConfig;
  if (typeof launchConfig?.provider?.generateStructured !== "function") {
    throw new Error("Geração estrutural não preparada.");
  }
  emitStructurePhase(onProgress, "normalize_intent", "phase_started");
  const scopeContract = buildScopeContract({
    draft: {
      ...draft,
      promptText: preparedGeneration.promptText
    },
    scopeState
  });
  emitStructurePhase(onProgress, "normalize_intent", "phase_completed");
  emitStructurePhase(onProgress, "index_sources", "phase_started");
  emitStructurePhase(onProgress, "index_sources", "phase_completed");
  emitStructurePhase(onProgress, "build_assessment_profile", "phase_started");
  emitStructurePhase(onProgress, "build_assessment_profile", "phase_completed");
  emitStructurePhase(onProgress, "plan_architecture", "phase_started", { modelId: launchConfig.modelId });
  const result = await planCourseFromScope({
    scopeContract,
    provider: launchConfig.provider,
    modelId: launchConfig.modelId,
    project: projectDocument,
    attachments: preparedGeneration.ingestedAttachments?.attachments,
    didacticPolicy: launchConfig.didacticPolicy
  });
  emitStructurePhase(onProgress, "plan_architecture", "phase_completed", { modelId: launchConfig.modelId });
  emitStructurePhase(onProgress, "compile_patch", "phase_started");
  const target = buildPatchTargetFromProject(result.project);
  emitStructurePhase(onProgress, "compile_patch", "phase_completed");
  emitStructurePhase(onProgress, "validate_patch", "phase_started");
  emitStructurePhase(onProgress, "validate_patch", "phase_completed");
  emitStructurePhase(onProgress, "apply_patch", "phase_started");
  emitStructurePhase(onProgress, "apply_patch", "phase_completed");
  emitStructurePhase(onProgress, "final_report", "phase_started");
  emitStructurePhase(onProgress, "final_report", "phase_completed");
  return {
    scopeContract: result.scopeContract,
    plannedCourse: result.plannedCourse,
    patch: {
      ...result.patch,
      target
    },
    projectDocument: result.project,
    summary: {
      message: "Estrutura planejada no contrato v4.",
      openActionLabel: "Abrir curso"
    }
  };
}

export async function generateMicrosequenceProjectDocument({
  selection = {},
  draft = {},
  projectDocument = createEmptyProjectDocument(),
  preparedIntervention = {},
  resumeState = null,
  onProgress
} = {}) {
  const launchConfig = preparedIntervention?.launchConfig;
  if (typeof launchConfig?.provider?.generateStructured !== "function") {
    throw new Error("Intervenção local não preparada.");
  }
  const action = resolveMicrosequenceAction(draft);
  const attachedSources = Array.isArray(preparedIntervention?.ingestedAttachments?.attachments)
    ? preparedIntervention.ingestedAttachments.attachments
    : [];
  const common = {
    project: projectDocument,
    selection,
    provider: launchConfig.provider,
    modelId: launchConfig.modelId,
    userRequest: text(preparedIntervention?.promptText) || text(draft.promptText),
    source: "llm",
    onProgress,
    resumeState
  };
  common.didacticPolicy = launchConfig.didacticPolicy;
  common.attachedSources = attachedSources;
  common.userSelectedSourceIds = selectedSourceIds(attachedSources);
  common.userSelectedExtraResourceTypes = selectedExtraResources(preparedIntervention, draft);
  common.requestContext = preparedIntervention?.requestContext || null;

  onProgress?.({ phase: "bottom-up", message: "Gerando cards." });

  const result =
    action === "next_planned"
      ? await generateNextMicrosequence(common)
      : action === "branch"
        ? await createBranchMicrosequence(common)
        : action === "repair"
          ? await repairMicrosequenceCards({
              ...common,
              reason: text(preparedIntervention?.promptText) || text(draft.promptText) || "Melhorar a microssequência atual."
            })
          : draft.requestedGenerationDepth === "deep"
            ? await addPracticeToMicrosequence(common)
            : await generateMicrosequenceCards(common);

  if (result?.blockedBy) {
    const blockedByLabel = text(result.blockedByTitle) || text(result.blockedBy);
    onProgress?.({
      stage: "prepare",
      status: "failed",
      message: `A próxima microssequência ainda depende de "${blockedByLabel}".`,
      resumeFrom: "prepare"
    });
    throw new Error(`A próxima microssequência ainda depende de "${blockedByLabel}".`);
  }

  const target = {
    courseKey: selection.courseKey,
    moduleKey: selection.moduleKey,
    lessonKey: selection.lessonKey,
    microsequenceKey: result.selection?.microsequenceKey || selection.microsequenceKey
  };

  return {
    ...result,
    patch: {
      kind: "update-microsequence",
      target
    },
    projectDocument: result.project,
    summary: {
      message: "Microssequência gerada no contrato v4.",
      openActionLabel: "Abrir microssequência"
    }
  };
}
