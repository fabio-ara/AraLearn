import { resolveResourcesForEditPlan } from "../resources/resolveResourcesForEditPlan.js";

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
    selectedCardKeys: editPlanningContract.request.selectedCardKeys,
    selectedResourceKeys: editPlanningContract.request.selectedResourceKeys,
    validatedEditPlan: plan,
    userSelectedExtraResourceTypes: editPlanningContract.request.userSelectedExtraResourceTypes
  });
  return {
    version: "aralearn.microsequence-edit-contract.v1",
    operation: "edit_microsequence_cards",
    target: editPlanningContract.target,
    context: editPlanningContract.context,
    selectedLessonTopicRefs: editPlanningContract.selectedLessonTopicRefs || [],
    request: {
      userEditPrompt: editPlanningContract.request.userEditPrompt,
      selectedCardKeys: editPlanningContract.request.selectedCardKeys,
      selectedResourceKeys: editPlanningContract.request.selectedResourceKeys
    },
    editPlan: plan,
    currentVersion: {
      versionId: editPlanningContract.target.versionId,
      cards: currentCards
    },
    previousVersionsSummary: editPlanningContract.previousVersionsSummary,
    previousVersionsLoaded: previousVersionsLoadedWhenRequired,
    resources,
    sources: editPlanningContract.sources,
    model: {
      ...editPlanningContract.model,
      id: selectedModel || editPlanningContract.model.id
    },
    output: { format: "json" }
  };
}
