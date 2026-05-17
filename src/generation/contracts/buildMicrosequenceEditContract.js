import { resolveResourcesForEditPlan } from "../didactics/microsequenceEditRepresentation.js";

export function buildMicrosequenceEditContract({
  editPlanningContract,
  validatedEditPlan,
  currentCards = [],
  previousVersionsLoadedWhenRequired = [],
  selectedModel
}) {
  const plan = validatedEditPlan?.plan || validatedEditPlan;
  const resources = resolveResourcesForEditPlan({
    currentCards,
    lessonAllowedResourceTypes: editPlanningContract.context.lesson.resourceTags || [],
    validatedEditPlan: plan,
    userSelectedExtraResourceTypes: editPlanningContract.request.userSelectedExtraResourceTypes
  });
  return {
    version: "aralearn.microsequence-edit-contract.v2",
    operation: "edit_microsequence_cards",
    target: editPlanningContract.target,
    context: editPlanningContract.context,
    selectedLessonTopicRefs: editPlanningContract.selectedLessonTopicRefs || [],
    request: {
      userPrompt: editPlanningContract.request.userPrompt,
      selectedCardKeys: editPlanningContract.request.selectedCardKeys,
      selectedResourceKeys: editPlanningContract.request.selectedResourceKeys,
      userSelectedExtraResourceTypes: editPlanningContract.request.userSelectedExtraResourceTypes || []
    },
    editPlan: plan,
    currentVersion: {
      versionId: editPlanningContract.target.versionId,
      cards: currentCards
    },
    versionHistory: editPlanningContract.versionHistory || [],
    previousVersionsLoaded: previousVersionsLoadedWhenRequired,
    requestGovernance: editPlanningContract.requestGovernance,
    resources,
    sources: editPlanningContract.sources,
    model: {
      ...editPlanningContract.model,
      id: selectedModel || editPlanningContract.model.id
    },
    output: { format: "json" }
  };
}
