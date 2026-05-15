export const PHASE_PROFILES = Object.freeze({
  source_index: Object.freeze({
    creativity: "none",
    reasoning: "medium",
    outputContract: "json_schema_if_available",
    maxOutput: "medium",
    temperature: 0
  }),
  architecture_plan: Object.freeze({
    creativity: "low",
    reasoning: "high",
    outputContract: "json_schema_if_available",
    maxOutput: "large",
    temperature: 0.2
  }),
  architecture_audit: Object.freeze({
    creativity: "none",
    reasoning: "high",
    outputContract: "json_schema_if_available",
    maxOutput: "medium",
    temperature: 0
  }),
  repair: Object.freeze({
    creativity: "none",
    reasoning: "medium",
    outputContract: "json_schema_if_available",
    maxOutput: "bounded",
    temperature: 0.1
  })
});

export function resolvePhaseProfile(phaseId = "") {
  if (phaseId === "index_sources") return PHASE_PROFILES.source_index;
  if (phaseId === "plan_architecture") return PHASE_PROFILES.architecture_plan;
  if (phaseId === "audit_architecture") return PHASE_PROFILES.architecture_audit;
  if (phaseId === "plan_lessons") return PHASE_PROFILES.architecture_plan;
  if (phaseId === "plan_microsequences") return PHASE_PROFILES.architecture_plan;
  if (phaseId === "audit_microsequences") return PHASE_PROFILES.architecture_audit;
  if (phaseId === "repair_microsequences") return PHASE_PROFILES.repair;
  if (phaseId === "build_microsequence_contract") return PHASE_PROFILES.source_index;
  if (phaseId === "build_cards") return PHASE_PROFILES.architecture_plan;
  if (phaseId === "audit_cards") return PHASE_PROFILES.architecture_audit;
  if (phaseId === "audit_source_adherence") return PHASE_PROFILES.architecture_audit;
  return PHASE_PROFILES.repair;
}
