import { getModelCapabilities } from "../providers/modelCapabilities.js";
import { resolveReferencedSources } from "../sources/resolveReferencedSources.js";
import { buildMicrosequenceEditPlanningRepresentation } from "../didactics/microsequenceEditRepresentation.js";
import { buildMicrosequenceEditPlanningEnvelope } from "../didactics/microsequenceEditContext.js";

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

export function buildMicrosequenceEditPlanningContract({
  selectedCourse,
  selectedModule,
  selectedLesson,
  selectedMicrosequence,
  selectedMicrosequenceVersion,
  selectedLessonTopicRefs = null,
  selectedLessonScopeTagRefs = null,
  selectedLessonTags = null,
  lessonTags = null,
  currentCards = [],
  previousVersions = [],
  userEditPrompt = "",
  attachedSources = [],
  userSelectedSourceIds = [],
  selectedCardKeys = [],
  selectedResourceKeys = [],
  userSelectedExtraResourceTypes = [],
  selectedModel
}) {
  const capabilities = getModelCapabilities(selectedModel);
  const resolvedSources = resolveReferencedSources({ userPrompt: userEditPrompt, attachedSources, userSelectedSourceIds });
  const planningEnvelope = buildMicrosequenceEditPlanningEnvelope({
    selectedCourse,
    selectedModule,
    selectedLesson,
    selectedMicrosequence,
    selectedMicrosequenceVersion,
    selectedLessonTopicRefs,
    selectedLessonScopeTagRefs,
    selectedLessonTags,
    lessonTags,
    currentCards,
    previousVersions,
    userPrompt: userEditPrompt
  });
  const representation = buildMicrosequenceEditPlanningRepresentation({
    currentCards,
    lessonAllowedResourceTypes: planningEnvelope.context.lesson.resourceTags || [],
    userSelectedExtraResourceTypes
  });
  return {
    version: "aralearn.microsequence-edit-planning-contract.v2",
    operation: "plan_microsequence_edit",
    target: {
      courseKey: text(selectedCourse?.key),
      moduleKey: text(selectedModule?.key),
      lessonKey: text(selectedLesson?.key),
      microsequenceKey: text(selectedMicrosequence?.key),
      versionId: text(selectedMicrosequenceVersion?.id)
    },
    context: planningEnvelope.context,
    requestGovernance: planningEnvelope.requestGovernance,
    selectedLessonTopicRefs: planningEnvelope.selectedLessonTopicRefs,
    request: {
      ...planningEnvelope.request,
      selectedCardKeys,
      selectedResourceKeys,
      userSelectedExtraResourceTypes
    },
    currentVersion: planningEnvelope.currentVersion,
    versionHistory: planningEnvelope.versionHistory,
    representation,
    sources: resolvedSources.referencedSources,
    model: { id: capabilities.model, capabilities },
    sourceResolution: resolvedSources
  };
}
