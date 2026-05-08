import { listCardResourceSummaries } from "../resources/cardResourceDefinitions.js";
import { getModelCapabilities } from "../providers/modelCapabilities.js";
import { resolveReferencedSources } from "../sources/resolveReferencedSources.js";
import { normalizeSelectedLessonTopicRefs } from "../tags/selectedLessonTopicRefs.js";

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function summarizeCard(card, index) {
  return {
    key: text(card?.key) || `card-${index + 1}`,
    title: text(card?.title) || `Card ${index + 1}`,
    summary: text(card?.say || card?.ask || card?.code || card?.title).slice(0, 160)
  };
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
  const selectedTopics = normalizeSelectedLessonTopicRefs({
    selectedLessonTopicRefs,
    selectedLessonScopeTagRefs,
    selectedLessonTags,
    lessonTags,
    availableLessonTopics: selectedLesson?.lessonTopics || selectedLesson?.scopeTags || selectedLesson?.tags || []
  });
  return {
    version: "aralearn.microsequence-edit-planning-contract.v1",
    operation: "plan_microsequence_edit",
    target: {
      courseKey: text(selectedCourse?.key),
      moduleKey: text(selectedModule?.key),
      lessonKey: text(selectedLesson?.key),
      microsequenceKey: text(selectedMicrosequence?.key),
      versionId: text(selectedMicrosequenceVersion?.id)
    },
    context: {
      course: { title: text(selectedCourse?.title), objective: text(selectedCourse?.description) },
      module: { title: text(selectedModule?.title), objective: text(selectedModule?.description) },
      lesson: { title: text(selectedLesson?.title), objective: text(selectedLesson?.description) },
      microsequence: { title: text(selectedMicrosequence?.title), objective: text(selectedMicrosequence?.description) }
    },
    selectedLessonTopicRefs: selectedTopics,
    request: { userEditPrompt: text(userEditPrompt), selectedCardKeys, selectedResourceKeys, userSelectedExtraResourceTypes },
    currentVersionSummary: {
      versionId: text(selectedMicrosequenceVersion?.id),
      cardCount: currentCards.length,
      cardsSummary: currentCards.map(summarizeCard)
    },
    previousVersionsSummary: previousVersions.map((version) => ({
      versionId: text(version.id),
      label: text(version.label),
      cardCount: Array.isArray(version.cards) ? version.cards.length : 0,
      shortSummary: text(version.description || version.label).slice(0, 160)
    })),
    availableResources: listCardResourceSummaries(),
    sources: resolvedSources.referencedSources,
    model: { id: capabilities.model, capabilities },
    sourceResolution: resolvedSources
  };
}
