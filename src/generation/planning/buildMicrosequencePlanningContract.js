import { listMicrosequenceSizes } from "../types/microsequenceSizes.js";
import { getMicrosequenceType, listMicrosequenceTypeSummaries } from "../types/microsequenceTypes.js";
import { listCardResourceSummaries } from "../resources/cardResourceDefinitions.js";
import { getModelCapabilities } from "../providers/modelCapabilities.js";
import { resolveReferencedSources } from "../sources/resolveReferencedSources.js";
import { normalizeSelectedLessonTopicRefs } from "../tags/selectedLessonTopicRefs.js";
import { buildDidacticGuardrails, buildLessonRequestGovernance } from "../didactics/didacticGovernance.js";
import {
  buildSourceGuideTextForModel,
  sanitizeSourceGuideStructuredForModel,
  SOURCE_GUIDE_LEVELS
} from "../../sourceGuides/sourceGuideStructured.js";
import { normalizeLessonGuidance } from "../guidance/lessonGuidance.js";

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function key(value) {
  return text(value?.key) || text(value?.id) || "";
}

function objective(value) {
  return text(value?.objective) || text(value?.description);
}

function sourceGuideStructuredForModel(value, level) {
  const structured = sanitizeSourceGuideStructuredForModel(value?.sourceGuideStructured, { level });
  return Object.keys(structured).length ? structured : undefined;
}

function summarizeMicrosequence(value) {
  return {
    key: key(value),
    title: text(value?.title) || key(value),
    objective: objective(value),
    tags: Array.isArray(value?.tags) ? value.tags.map((item) => text(item)).filter(Boolean) : [],
    status: text(value?.status),
    ...(text(value?.description) ? { description: text(value.description) } : {})
  };
}

function resolveAvailableTypes(userFixedTypeId) {
  const fixedTypeId = text(userFixedTypeId);
  if (fixedTypeId && fixedTypeId !== "assisted") {
    const fixedType = getMicrosequenceType(fixedTypeId);
    return fixedType
      ? [{ id: fixedType.id, label: fixedType.label, shortDescription: fixedType.shortDescription, availableSizes: fixedType.availableSizes }]
      : [];
  }
  return listMicrosequenceTypeSummaries();
}

export function buildMicrosequencePlanningContract({
  selectedCourse,
  selectedModule,
  selectedLesson,
  targetMicrosequence,
  selectedLessonTopicRefs = null,
  selectedLessonScopeTagRefs = null,
  selectedLessonTags = null,
  lessonTags = null,
  userPrompt,
  attachedSources = [],
  userSelectedSourceIds = [],
  userFixedTypeId = null,
  userSelectedExtraResourceTypes = [],
  selectedModel
}) {
  const capabilities = getModelCapabilities(selectedModel);
  const resolvedSources = resolveReferencedSources({ userPrompt, attachedSources, userSelectedSourceIds });
  const lessonGuideStructured = sourceGuideStructuredForModel(selectedLesson, SOURCE_GUIDE_LEVELS.LESSON) || {};
  const lessonGuidance = normalizeLessonGuidance(selectedLesson);
  const selectedTopics = normalizeSelectedLessonTopicRefs({
    selectedLessonTopicRefs,
    selectedLessonScopeTagRefs,
    selectedLessonTags,
    lessonTags,
    availableLessonTopics: selectedLesson?.lessonTopics || selectedLesson?.scopeTags || selectedLesson?.tags || []
  });
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
      path: [
        { level: "course", key: key(selectedCourse), title: text(selectedCourse?.title) || key(selectedCourse) },
        { level: "module", key: key(selectedModule), title: text(selectedModule?.title) || key(selectedModule) },
        { level: "lesson", key: key(selectedLesson), title: text(selectedLesson?.title) || key(selectedLesson) },
        { level: "microsequence", key: key(targetMicrosequence), title: text(targetMicrosequence?.title) || key(targetMicrosequence) }
      ],
      course: {
        title: text(selectedCourse?.title) || key(selectedCourse),
        objective: objective(selectedCourse)
      },
      module: {
        title: text(selectedModule?.title) || key(selectedModule),
        objective: objective(selectedModule)
      },
      lesson: {
        title: text(selectedLesson?.title) || key(selectedLesson),
        objective: objective(selectedLesson),
        ...(sourceGuideStructuredForModel(selectedLesson, SOURCE_GUIDE_LEVELS.LESSON)
          ? { sourceGuide: buildSourceGuideTextForModel(sourceGuideStructuredForModel(selectedLesson, SOURCE_GUIDE_LEVELS.LESSON), { level: SOURCE_GUIDE_LEVELS.LESSON }) }
          : {}),
        ...(sourceGuideStructuredForModel(selectedLesson, SOURCE_GUIDE_LEVELS.LESSON)
          ? { sourceGuideStructured: sourceGuideStructuredForModel(selectedLesson, SOURCE_GUIDE_LEVELS.LESSON) }
          : {}),
        ...lessonGuidance,
        microsequenceLine: Array.isArray(selectedLesson?.microsequences)
          ? selectedLesson.microsequences.map(summarizeMicrosequence)
          : []
      },
      microsequence: {
        title: text(targetMicrosequence?.title) || key(targetMicrosequence),
        objective: objective(targetMicrosequence),
        ...(targetMicrosequence ? summarizeMicrosequence(targetMicrosequence) : {})
      }
    },
    selectedLessonTopicRefs: selectedTopics,
    request: {
      userPrompt: text(userPrompt),
      userFixedTypeId: userFixedTypeId || null,
      userSelectedExtraResourceTypes: [...userSelectedExtraResourceTypes]
    },
    requestGovernance: buildLessonRequestGovernance(lessonGuideStructured),
    availableTypes: resolveAvailableTypes(userFixedTypeId),
    availableSizes: listMicrosequenceSizes().map(({ id, cardCount }) => ({ id, cardCount })),
    availableResources: listCardResourceSummaries().filter((item) => lessonGuidance.resourceTags.includes(item.id)),
    didacticGuardrails: buildDidacticGuardrails(),
    sources: resolvedSources.referencedSources,
    model: { id: capabilities.model, capabilities },
    sourceResolution: resolvedSources
  };
}
