import { getMicrosequenceCardCount } from "../types/microsequenceSizes.js";
import { getMicrosequenceType } from "../types/microsequenceTypes.js";
import { resolveResourcesForGenerationPlan } from "../resources/resolveResourcesForGenerationPlan.js";
import { getWeakModelModePolicy } from "../policies/weakModelPolicy.js";
import { summarizeMeticulousPolicyForPrompt } from "../policies/meticulousDidacticPolicy.js";

export function buildMicrosequenceGenerationContract({ planningContract, validatedPlan, selectedModel }) {
  const plan = validatedPlan?.plan || validatedPlan;
  const type = getMicrosequenceType(plan.typeId);
  const cardCount = getMicrosequenceCardCount(plan.sizeId);
  const resources = resolveResourcesForGenerationPlan({
    resolvedMicrosequenceTypeId: plan.typeId,
    lessonAllowedResourceTypes: planningContract.context.lesson.resourceTags || [],
    lessonGuidance: planningContract.context.lesson,
    lessonSourceGuideStructured: planningContract.context.lesson.sourceGuideStructured || {},
    modelCapabilities: planningContract.model.capabilities,
    userSelectedExtraResourceTypes: planningContract.request.userSelectedExtraResourceTypes,
    planSelectedExtraResourceTypes: plan.selectedExtraResourceTypes
  });

  return {
    version: "aralearn.microsequence-generation-contract.v2",
    operation: "generate_microsequence_cards",
    target: planningContract.target,
    context: planningContract.context,
    request: {
      userPrompt: planningContract.request.userPrompt,
      typeId: plan.typeId,
      sizeId: plan.sizeId,
      cardCount
    },
    requestGovernance: planningContract.requestGovernance,
    studyTrackPolicy: planningContract.studyTrackPolicy || null,
    didacticProductionPolicy: planningContract.didacticProductionPolicy || planningContract.productionPolicy || null,
    selectedLessonTopicRefs: planningContract.selectedLessonTopicRefs || [],
    weakModelMode: getWeakModelModePolicy(planningContract.model.capabilities),
    meticulousPolicy: summarizeMeticulousPolicyForPrompt({ weakModelMode: true }),
    didacticPlan: {
      microsequenceGoal: plan.microsequenceGoal,
      typeId: plan.typeId,
      typeLabel: type?.label || plan.typeId,
      cardPlan: plan.cardPlan
    },
    resources: {
      ...resources,
      effectiveResourceSchemas: resources.resourceSchemas
    },
    sources: planningContract.sources,
    sourceUsePlan: plan.sourceUsePlan || [],
    model: {
      ...planningContract.model,
      id: selectedModel || planningContract.model.id
    },
    output: {
      format: "json",
      expectedCardCount: cardCount
    }
  };
}
