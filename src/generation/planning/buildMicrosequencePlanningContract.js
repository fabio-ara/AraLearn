import { listMicrosequenceSizes } from "../types/microsequenceSizes.js";
import { listMicrosequenceTypeSummaries } from "../types/microsequenceTypes.js";
import { listCardResourceSummaries } from "../resources/cardResourceDefinitions.js";
import { getModelCapabilities } from "../providers/modelCapabilities.js";
import { resolveReferencedSources } from "../sources/resolveReferencedSources.js";

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function key(value) {
  return text(value?.key) || text(value?.id) || "";
}

function objective(value) {
  return text(value?.objective) || text(value?.description);
}

export function buildMicrosequencePlanningContract({
  selectedCourse,
  selectedModule,
  selectedLesson,
  targetMicrosequence,
  selectedLessonTags = [],
  userPrompt,
  attachedSources = [],
  userSelectedSourceIds = [],
  userFixedTypeId = null,
  userSelectedExtraResourceTypes = [],
  selectedModel
}) {
  const capabilities = getModelCapabilities(selectedModel);
  const resolvedSources = resolveReferencedSources({ userPrompt, attachedSources, userSelectedSourceIds });
  return {
    version: "aralearn.microsequence-planning-contract.v1",
    operation: "plan_microsequence_generation",
    target: {
      courseKey: key(selectedCourse),
      moduleKey: key(selectedModule),
      lessonKey: key(selectedLesson),
      microsequenceKey: key(targetMicrosequence)
    },
    context: {
      course: { title: text(selectedCourse?.title) || key(selectedCourse), objective: objective(selectedCourse) },
      module: { title: text(selectedModule?.title) || key(selectedModule), objective: objective(selectedModule) },
      lesson: { title: text(selectedLesson?.title) || key(selectedLesson), objective: objective(selectedLesson) },
      microsequence: { title: text(targetMicrosequence?.title) || key(targetMicrosequence), objective: objective(targetMicrosequence) }
    },
    lessonTags: selectedLessonTags.map((item) => ({ id: text(item.id || item.key || item), label: text(item.label || item.title || item) })).filter((item) => item.id || item.label),
    request: {
      userPrompt: text(userPrompt),
      userFixedTypeId: userFixedTypeId || null,
      userSelectedExtraResourceTypes: [...userSelectedExtraResourceTypes]
    },
    availableTypes: listMicrosequenceTypeSummaries(),
    availableSizes: listMicrosequenceSizes().map(({ id, cardCount }) => ({ id, cardCount })),
    availableResources: listCardResourceSummaries(),
    sources: resolvedSources.referencedSources,
    model: { id: capabilities.model, capabilities },
    sourceResolution: resolvedSources
  };
}
