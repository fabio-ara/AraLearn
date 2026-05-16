import { callModelWithRetry } from "../providers/callModelWithRetry.js";
import { resolveModelForCourseForgePhase } from "../modelProfiles/modelRouting.js";

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
      "plan_microsequences",
      "audit_microsequences",
      "repair_microsequences",
      "build_cards",
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
      schema,
      artifacts: artifacts.map(buildRuntimeArtifact)
    },
    callModel: async ({ modelId: activeModelId }) =>
      provider.callJson({
        phaseId,
        modelId: activeModelId,
        prompt,
        schema,
        artifacts: artifacts.map(buildRuntimeArtifact),
        parameters: {}
      }).then((result) => result.value)
  });
}
