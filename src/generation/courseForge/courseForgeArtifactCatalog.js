const COURSE_FORGE_ARTIFACT_DEFINITIONS = Object.freeze({
  intent: { artifactType: "CourseIntent", schemaVersion: "aralearn.course_intent.v2", stage: "engine" },
  "course-intent": { artifactType: "CourseIntent", schemaVersion: "aralearn.course_intent.v2", stage: "engine" },
  "source-ledger": { artifactType: "SourceLedger", schemaVersion: "aralearn.source_ledger.v2", stage: "engine" },
  "assessment-profile": {
    artifactType: "AssessmentProfile",
    schemaVersion: "aralearn.assessment_profile.v1",
    stage: "engine"
  },
  "intervention-response": {
    artifactType: "InterventionResponse",
    schemaVersion: "aralearn.intervention_response.v1",
    stage: "tutor"
  },
  "intervention-audit": {
    artifactType: "InterventionAudit",
    schemaVersion: "aralearn.intervention_audit.v1",
    stage: "auditor"
  },
  "intervention-request": {
    artifactType: "InterventionRequest",
    schemaVersion: "aralearn.intervention_request.v1",
    stage: "engine"
  },
  "intervention-request-audit": {
    artifactType: "InterventionRequestAudit",
    schemaVersion: "aralearn.intervention_request_audit.v1",
    stage: "auditor"
  },
  "course-graph": { artifactType: "CourseGraph", schemaVersion: "aralearn.course_graph.v1", stage: "engine" },
  "course-graph-audit": {
    artifactType: "CourseGraphAudit",
    schemaVersion: "aralearn.course_graph_audit.v1",
    stage: "auditor"
  },
  "architecture-draft": {
    artifactType: "ArchitectureDraft",
    schemaVersion: "aralearn.architecture_draft.v1",
    stage: "builder"
  },
  "architecture-audit": {
    artifactType: "ArchitectureAudit",
    schemaVersion: "aralearn.architecture_audit.v1",
    stage: "auditor"
  },
  "architecture-final": {
    artifactType: "ArchitectureFinal",
    schemaVersion: "aralearn.architecture_final.v1",
    stage: "repair"
  },
  "lesson-plans": {
    artifactType: "LessonPlanSet",
    schemaVersion: "aralearn.lesson_plan_set.v1",
    stage: "planner"
  },
  "lesson-governance": {
    artifactType: "LessonGovernanceSet",
    schemaVersion: "aralearn.lesson_governance_set.v1",
    stage: "planner"
  },
  "microsequence-plans": {
    artifactType: "MicrosequencePlanSet",
    schemaVersion: "aralearn.microsequence_plan_set.v1",
    stage: "planner"
  },
  "microsequence-audit": {
    artifactType: "MicrosequenceAudit",
    schemaVersion: "aralearn.microsequence_audit.v1",
    stage: "auditor"
  },
  "microsequence-adherence-audit": {
    artifactType: "DidacticAdherenceAudit",
    schemaVersion: "aralearn.didactic_adherence_audit.v1",
    stage: "auditor"
  },
  "microsequence-contracts": {
    artifactType: "MicrosequenceContractSet",
    schemaVersion: "aralearn.microsequence_contract_set.v1",
    stage: "builder"
  },
  "card-plans": { artifactType: "CardPlanSet", schemaVersion: "aralearn.card_plan_set.v1", stage: "planner" },
  "card-drafts": { artifactType: "CardDraftSet", schemaVersion: "aralearn.card_draft_set.v1", stage: "builder" },
  "cards-audit": { artifactType: "CardAudit", schemaVersion: "aralearn.card_audit.v1", stage: "auditor" },
  "source-adherence-audit": {
    artifactType: "SourceFaithfulnessAudit",
    schemaVersion: "aralearn.source_faithfulness_audit.v1",
    stage: "auditor"
  },
  "prerequisite-audit": {
    artifactType: "PrerequisiteAudit",
    schemaVersion: "aralearn.prerequisite_audit.v1",
    stage: "auditor"
  },
  "assessment-alignment-audit": {
    artifactType: "AssessmentAlignmentAudit",
    schemaVersion: "aralearn.assessment_alignment_audit.v1",
    stage: "auditor"
  },
  "cards-final": { artifactType: "CardSet", schemaVersion: "aralearn.card_set.v1", stage: "repair" },
  "patch-final": { artifactType: "Patch", schemaVersion: "aralearn.patch.v1", stage: "engine" },
  "project-after-patch": {
    artifactType: "ProjectDocument",
    schemaVersion: "aralearn.project_document.v1",
    stage: "engine"
  },
  "diagnostics-summary": {
    artifactType: "DiagnosticsSummary",
    schemaVersion: "aralearn.diagnostics_summary.v1",
    stage: "engine"
  },
  "final-report": { artifactType: "FinalReport", schemaVersion: "aralearn.final_report.v1", stage: "engine" }
});

export function getCourseForgeArtifactDefinition(artifactName = "") {
  return COURSE_FORGE_ARTIFACT_DEFINITIONS[artifactName] || null;
}

export function listCourseForgeArtifactDefinitions() {
  return Object.entries(COURSE_FORGE_ARTIFACT_DEFINITIONS).map(([name, definition]) => ({
    name,
    ...definition
  }));
}
