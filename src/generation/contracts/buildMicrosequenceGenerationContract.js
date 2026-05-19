import { getWeakModelModePolicy } from "../policies/weakModelPolicy.js";
import { summarizeMeticulousPolicyForPrompt } from "../policies/meticulousDidacticPolicy.js";
import { buildMicrosequenceGenerationRepresentation } from "../didactics/microsequenceGenerationRepresentation.js";

export function buildMicrosequenceGenerationContract({ planningContract, validatedPlan, selectedModel }) {
  const representation = buildMicrosequenceGenerationRepresentation({
    planningContract,
    validatedPlan
  });

  return {
    version: "aralearn.microsequence-generation-contract.v2",
    operation: "generate_microsequence_cards",
    target: planningContract.target,
    context: planningContract.context,
    request: {
      userPrompt: planningContract.request.userPrompt,
      ...representation.request
    },
    requestGovernance: planningContract.requestGovernance,
    studyTrackPolicy: planningContract.studyTrackPolicy || null,
    didacticProductionPolicy: planningContract.didacticProductionPolicy || planningContract.productionPolicy || null,
    selectedLessonTopicRefs: planningContract.selectedLessonTopicRefs || [],
    weakModelMode: getWeakModelModePolicy(planningContract.model.capabilities),
    meticulousPolicy: summarizeMeticulousPolicyForPrompt({ weakModelMode: true }),
    didacticPlan: representation.didacticPlan,
    resources: representation.resources,
    sources: planningContract.sources,
    sourceUsePlan: (validatedPlan?.plan || validatedPlan)?.sourceUsePlan || [],
    model: {
      ...planningContract.model,
      id: selectedModel || planningContract.model.id
    },
    output: {
      format: "json",
      expectedCardCount: representation.request.cardCount
    }
  };
}
