import { COURSE_FORGE_PHASE_IDS } from "./courseForgeSchemas.js";

const PHASES_BY_LEVEL = Object.freeze({
  project: COURSE_FORGE_PHASE_IDS,
  course: COURSE_FORGE_PHASE_IDS,
  module: COURSE_FORGE_PHASE_IDS,
  lesson: COURSE_FORGE_PHASE_IDS,
  microsequence: ["normalize_intent", "index_sources", "plan_architecture", "compile_patch", "validate_patch", "apply_patch", "final_report"]
});

export function resolveCourseForgePhases(intent = {}) {
  const level = intent?.scope?.level || "project";
  return [...(PHASES_BY_LEVEL[level] || COURSE_FORGE_PHASE_IDS)];
}
