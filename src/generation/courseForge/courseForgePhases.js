import { COURSE_FORGE_PHASE_IDS } from "./courseForgeSchemas.js";

const STRUCTURE_PHASES = Object.freeze([
  "normalize_intent",
  "index_sources",
  "build_assessment_profile",
  "plan_architecture",
  "audit_architecture",
  "repair_architecture",
  "compile_patch",
  "validate_patch",
  "apply_patch",
  "final_report"
]);

const TUTOR_INTERVENTION_PHASES = Object.freeze([
  "normalize_intent",
  "index_sources",
  "build_assessment_profile",
  "answer_locally",
  "audit_intervention",
  "final_report"
]);

const REPAIR_PHASES = Object.freeze([
  "normalize_intent",
  "index_sources",
  "build_assessment_profile",
  "plan_architecture",
  "audit_architecture",
  "repair_architecture",
  "compile_patch",
  "validate_patch",
  "apply_patch",
  "final_report"
]);

const REPAIR_COURSE_PHASES = Object.freeze([
  "normalize_intent",
  "index_sources",
  "build_assessment_profile",
  "build_course_graph",
  "audit_course_graph",
  "repair_course_graph",
  "build_lesson_governance",
  "plan_microsequences",
  "audit_microsequences",
  "repair_microsequences",
  "build_microsequence_contract",
  "compile_card_plans",
  "build_cards",
  "audit_cards",
  "audit_source_adherence",
  "repair_cards",
  "repair_card_adherence",
  "audit_prerequisites",
  "audit_assessment_alignment",
  "compile_patch",
  "validate_patch",
  "apply_patch",
  "final_report"
]);

const REPAIR_MODULE_PHASES = Object.freeze([...REPAIR_COURSE_PHASES]);
const REPAIR_LESSON_PHASES = Object.freeze([...REPAIR_COURSE_PHASES]);
const REPAIR_MICROSEQUENCE_PHASES = Object.freeze([
  "normalize_intent",
  "index_sources",
  "build_assessment_profile",
  "build_microsequence_contract",
  "compile_card_plans",
  "build_cards",
  "audit_cards",
  "audit_source_adherence",
  "repair_cards",
  "repair_card_adherence",
  "audit_prerequisites",
  "audit_assessment_alignment",
  "compile_patch",
  "validate_patch",
  "apply_patch",
  "final_report"
]);

const TARGETED_EXISTING_MICROSEQUENCE_PHASES = Object.freeze([
  "normalize_intent",
  "index_sources",
  "build_assessment_profile",
  "plan_microsequences",
  "audit_microsequences",
  "repair_microsequences",
  "build_microsequence_contract",
  "compile_card_plans",
  "build_cards",
  "audit_cards",
  "audit_source_adherence",
  "repair_cards",
  "repair_card_adherence",
  "audit_prerequisites",
  "audit_assessment_alignment",
  "compile_patch",
  "validate_patch",
  "apply_patch",
  "final_report"
]);

const FULL_PROJECT_PHASES = Object.freeze([
  "normalize_intent",
  "index_sources",
  "build_assessment_profile",
  "plan_architecture",
  "audit_architecture",
  "repair_architecture",
  "plan_lessons",
  "build_course_graph",
  "audit_course_graph",
  "repair_course_graph",
  "build_lesson_governance",
  "plan_microsequences",
  "audit_microsequences",
  "repair_microsequences",
  "build_microsequence_contract",
  "compile_card_plans",
  "build_cards",
  "audit_cards",
  "audit_source_adherence",
  "repair_cards",
  "repair_card_adherence",
  "audit_prerequisites",
  "audit_assessment_alignment",
  "compile_patch",
  "validate_patch",
  "apply_patch",
  "final_report"
]);

const FULL_COURSE_PHASES = Object.freeze([
  "normalize_intent",
  "index_sources",
  "build_assessment_profile",
  "build_course_graph",
  "audit_course_graph",
  "repair_course_graph",
  "build_lesson_governance",
  "plan_microsequences",
  "audit_microsequences",
  "repair_microsequences",
  "build_microsequence_contract",
  "compile_card_plans",
  "build_cards",
  "audit_cards",
  "audit_source_adherence",
  "repair_cards",
  "repair_card_adherence",
  "audit_prerequisites",
  "audit_assessment_alignment",
  "compile_patch",
  "validate_patch",
  "apply_patch",
  "final_report"
]);

const FULL_LESSON_PHASES = Object.freeze([
  "normalize_intent",
  "index_sources",
  "build_assessment_profile",
  "build_course_graph",
  "audit_course_graph",
  "repair_course_graph",
  "build_lesson_governance",
  "plan_microsequences",
  "audit_microsequences",
  "repair_microsequences",
  "build_microsequence_contract",
  "compile_card_plans",
  "build_cards",
  "audit_cards",
  "audit_source_adherence",
  "repair_cards",
  "repair_card_adherence",
  "audit_prerequisites",
  "audit_assessment_alignment",
  "compile_patch",
  "validate_patch",
  "apply_patch",
  "final_report"
]);

const FULL_MODULE_PHASES = Object.freeze([
  "normalize_intent",
  "index_sources",
  "build_assessment_profile",
  "build_course_graph",
  "audit_course_graph",
  "repair_course_graph",
  "build_lesson_governance",
  "plan_microsequences",
  "audit_microsequences",
  "repair_microsequences",
  "build_microsequence_contract",
  "compile_card_plans",
  "build_cards",
  "audit_cards",
  "audit_source_adherence",
  "repair_cards",
  "repair_card_adherence",
  "audit_prerequisites",
  "audit_assessment_alignment",
  "compile_patch",
  "validate_patch",
  "apply_patch",
  "final_report"
]);

const FULL_MICROSEQUENCE_PHASES = Object.freeze([
  "normalize_intent",
  "index_sources",
  "build_assessment_profile",
  "build_microsequence_contract",
  "compile_card_plans",
  "build_cards",
  "audit_cards",
  "audit_source_adherence",
  "repair_cards",
  "repair_card_adherence",
  "audit_prerequisites",
  "audit_assessment_alignment",
  "compile_patch",
  "validate_patch",
  "apply_patch",
  "final_report"
]);

const FULL_COURSE_DEFERRED_PHASES = Object.freeze([]);

export function resolveCourseForgePhases(intent = {}) {
  const level = intent?.scope?.level || "project";
  const depth = intent?.generationDepth || "structure_only";
  const interventionMode = intent?.intervention?.mode || "";
  if (interventionMode === "tutor_response_only" || depth === "tutor_only") {
    return [...TUTOR_INTERVENTION_PHASES];
  }
  if (interventionMode === "targeted_existing_microsequences") {
    return [...TARGETED_EXISTING_MICROSEQUENCE_PHASES];
  }
  if (depth === "repair_only" || depth === "reinforce_only") {
    if (level === "microsequence") {
      return [...REPAIR_MICROSEQUENCE_PHASES];
    }
    if (level === "lesson") {
      return [...REPAIR_LESSON_PHASES];
    }
    if (level === "module") {
      return [...REPAIR_MODULE_PHASES];
    }
    if (level === "course") {
      return [...REPAIR_COURSE_PHASES];
    }
    return [...REPAIR_PHASES];
  }
  if (depth === "full_course") {
    if (level === "microsequence") {
      return [...FULL_MICROSEQUENCE_PHASES];
    }
    if (level === "lesson") {
      return [...FULL_LESSON_PHASES];
    }
    if (level === "module") {
      return [...FULL_MODULE_PHASES];
    }
    if (level === "course") {
      return [...FULL_COURSE_PHASES];
    }
    return [...FULL_PROJECT_PHASES];
  }
  return [...STRUCTURE_PHASES];
}

export function resolveDeferredCourseForgePhases(intent = {}) {
  const deferredDepth = intent?.deferredGenerationDepth || "";
  if (!deferredDepth || deferredDepth === intent?.generationDepth) {
    if (intent?.generationDepth === "full_course") {
      return [...FULL_COURSE_DEFERRED_PHASES];
    }
    return [];
  }
  const active = new Set(resolveCourseForgePhases(intent));
  return resolveCourseForgePhases({
    ...intent,
    generationDepth: deferredDepth,
    deferredGenerationDepth: ""
  }).filter((phaseId) => !active.has(phaseId));
}
