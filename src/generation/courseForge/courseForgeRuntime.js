import { callModelWithRetry } from "../providers/callModelWithRetry.js";
import { resolveModelForCourseForgePhase } from "../modelProfiles/modelRouting.js";
import { getCourseForgePhaseResponseSchema } from "./courseForgePhaseResponseSchemas.js";

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function buildRuntimeArtifact(item = {}) {
  return {
    id: text(item?.id),
    name: text(item?.name),
    artifactType: text(item?.artifactType),
    schemaVersion: text(item?.schemaVersion),
    content: typeof item?.content === "string" ? item.content : JSON.stringify(item?.content ?? {})
  };
}

export function resolveCourseForgePhaseModelId(intent = {}, phaseId = "") {
  if (
    ![
      "plan_architecture",
      "audit_architecture",
      "repair_architecture",
      "plan_lessons",
      "audit_course_graph",
      "repair_course_graph",
      "plan_microsequences",
      "audit_microsequences",
      "repair_microsequences",
      "answer_locally",
      "build_cards",
      "audit_intervention",
      "audit_prerequisites",
      "audit_assessment_alignment",
      "repair_cards",
      "repair_card_adherence"
    ].includes(phaseId)
  ) {
    return "";
  }
  return resolveModelForCourseForgePhase({ ...intent, phaseId });
}

export async function executeCourseForgeProviderPhase({
  provider,
  phaseId,
  modelId,
  prompt,
  schema,
  artifacts = []
} = {}) {
  return callModelWithRetry({
    phase: phaseId,
    modelId,
    request: {
      prompt,
      schema: schema || getCourseForgePhaseResponseSchema(phaseId),
      artifacts: artifacts.map(buildRuntimeArtifact)
    },
    callModel: async ({ modelId: activeModelId }) =>
      provider.callJson({
        phaseId,
        modelId: activeModelId,
        prompt,
        schema: schema || getCourseForgePhaseResponseSchema(phaseId),
        artifacts: artifacts.map(buildRuntimeArtifact),
        parameters: {}
      }).then((result) => result.value)
  });
}
