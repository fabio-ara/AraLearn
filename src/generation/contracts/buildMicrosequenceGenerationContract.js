import { getMicrosequenceCardCount } from "../types/microsequenceSizes.js";
import { getMicrosequenceType } from "../types/microsequenceTypes.js";
import { resolveResourcesForGenerationPlan } from "../resources/resolveResourcesForGenerationPlan.js";

export function buildMicrosequenceGenerationContract({ planningContract, validatedPlan, selectedModel }) {
  const plan = validatedPlan?.plan || validatedPlan;
  const type = getMicrosequenceType(plan.typeId);
  const resources = resolveResourcesForGenerationPlan({
    resolvedMicrosequenceTypeId: plan.typeId,
    resolvedSizeId: plan.sizeId,
    selectedModel,
    userSelectedExtraResourceTypes: planningContract.request.userSelectedExtraResourceTypes,
    planSelectedExtraResourceTypes: [
      ...(plan.selectedExtraResourceTypes || []),
      ...(plan.cardPlan || []).map((item) => item.resourceType)
    ]
  });
  const cardCount = getMicrosequenceCardCount(plan.sizeId);
  return {
    version: "aralearn.microsequence-generation-contract.v1",
    operation: "generate_microsequence_cards",
    target: planningContract.target,
    context: planningContract.context,
    lessonTags: planningContract.lessonTags,
    request: {
      userPrompt: planningContract.request.userPrompt,
      typeId: plan.typeId,
      sizeId: plan.sizeId,
      cardCount
    },
    didacticPlan: {
      microsequenceGoal: plan.microsequenceGoal,
      typeId: plan.typeId,
      typeLabel: type?.label || plan.typeId,
      cardPlan: plan.cardPlan
    },
    resources,
    sources: planningContract.sources,
    model: planningContract.model,
    output: {
      format: "json",
      expectedCardCount: cardCount
    }
  };
}
