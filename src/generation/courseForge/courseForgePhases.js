import { COURSE_FORGE_PHASE_IDS } from "./courseForgeSchemas.js";

const STRUCTURE_PHASES = Object.freeze([
  "normalize_intent",
  "index_sources",
  "plan_architecture",
  "audit_architecture",
  "repair_architecture",
  "compile_patch",
  "validate_patch",
  "apply_patch",
  "final_report"
]);

const REPAIR_PHASES = Object.freeze([
  "normalize_intent",
  "index_sources",
  "plan_architecture",
  "audit_architecture",
  "repair_architecture",
  "compile_patch",
  "validate_patch",
  "apply_patch",
  "final_report"
]);

const FULL_PROJECT_PHASES = Object.freeze([
  "normalize_intent",
  "index_sources",
  "plan_architecture",
  "audit_architecture",
  "repair_architecture",
  "plan_lessons",
  "plan_microsequences",
  "audit_microsequences",
  "repair_microsequences",
  "build_microsequence_contract",
  "build_cards",
  "audit_cards",
  "audit_source_adherence",
  "repair_cards",
  "repair_card_adherence",
  "compile_patch",
  "validate_patch",
  "apply_patch",
  "final_report"
]);

const FULL_MICROSEQUENCE_PHASES = Object.freeze([
  "normalize_intent",
  "index_sources",
  "build_microsequence_contract",
  "build_cards",
  "audit_cards",
  "audit_source_adherence",
  "repair_cards",
  "repair_card_adherence",
  "validate_patch",
  "apply_patch",
  "final_report"
]);

const FULL_COURSE_DEFERRED_PHASES = Object.freeze([]);

export function resolveCourseForgePhases(intent = {}) {
  const level = intent?.scope?.level || "project";
  const depth = intent?.generationDepth || "structure_only";
  if (depth === "repair_only" || depth === "reinforce_only") {
    return [...REPAIR_PHASES];
  }
  if (depth === "full_course") {
    return [...(level === "microsequence" ? FULL_MICROSEQUENCE_PHASES : FULL_PROJECT_PHASES)];
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
