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

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function key(value) {
  return text(value?.key) || text(value?.id) || "";
}

function objective(value) {
  return text(value?.objective) || text(value?.description);
}

function sourceGuide(value) {
  return text(value?.sourceGuide);
}

function sourceGuideForModel(value, level) {
  const structured = sanitizeSourceGuideStructuredForModel(value?.sourceGuideStructured, { level });
  if (Object.keys(structured).length) {
    return buildSourceGuideTextForModel(structured, "", { level });
  }
  const fallback = sourceGuide(value);
  return fallback || "";
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
      sourceGuideLineage: [
        {
          level: "course",
          title: text(selectedCourse?.title) || key(selectedCourse),
          ...(sourceGuideForModel(selectedCourse, SOURCE_GUIDE_LEVELS.COURSE)
            ? { sourceGuide: sourceGuideForModel(selectedCourse, SOURCE_GUIDE_LEVELS.COURSE) }
            : {}),
          ...(sourceGuideStructuredForModel(selectedCourse, SOURCE_GUIDE_LEVELS.COURSE)
            ? { sourceGuideStructured: sourceGuideStructuredForModel(selectedCourse, SOURCE_GUIDE_LEVELS.COURSE) }
            : {})
        },
        {
          level: "module",
          title: text(selectedModule?.title) || key(selectedModule),
          ...(sourceGuideForModel(selectedModule, SOURCE_GUIDE_LEVELS.MODULE)
            ? { sourceGuide: sourceGuideForModel(selectedModule, SOURCE_GUIDE_LEVELS.MODULE) }
            : {}),
          ...(sourceGuideStructuredForModel(selectedModule, SOURCE_GUIDE_LEVELS.MODULE)
            ? { sourceGuideStructured: sourceGuideStructuredForModel(selectedModule, SOURCE_GUIDE_LEVELS.MODULE) }
            : {})
        },
        {
          level: "lesson",
          title: text(selectedLesson?.title) || key(selectedLesson),
          ...(sourceGuideForModel(selectedLesson, SOURCE_GUIDE_LEVELS.LESSON)
            ? { sourceGuide: sourceGuideForModel(selectedLesson, SOURCE_GUIDE_LEVELS.LESSON) }
            : {}),
          ...(sourceGuideStructuredForModel(selectedLesson, SOURCE_GUIDE_LEVELS.LESSON)
            ? { sourceGuideStructured: sourceGuideStructuredForModel(selectedLesson, SOURCE_GUIDE_LEVELS.LESSON) }
            : {})
        }
      ],
      course: {
        title: text(selectedCourse?.title) || key(selectedCourse),
        objective: objective(selectedCourse),
        ...(sourceGuideForModel(selectedCourse, SOURCE_GUIDE_LEVELS.COURSE)
          ? { sourceGuide: sourceGuideForModel(selectedCourse, SOURCE_GUIDE_LEVELS.COURSE) }
          : {}),
        ...(sourceGuideStructuredForModel(selectedCourse, SOURCE_GUIDE_LEVELS.COURSE)
          ? { sourceGuideStructured: sourceGuideStructuredForModel(selectedCourse, SOURCE_GUIDE_LEVELS.COURSE) }
          : {})
      },
      module: {
        title: text(selectedModule?.title) || key(selectedModule),
        objective: objective(selectedModule),
        ...(sourceGuideForModel(selectedModule, SOURCE_GUIDE_LEVELS.MODULE)
          ? { sourceGuide: sourceGuideForModel(selectedModule, SOURCE_GUIDE_LEVELS.MODULE) }
          : {}),
        ...(sourceGuideStructuredForModel(selectedModule, SOURCE_GUIDE_LEVELS.MODULE)
          ? { sourceGuideStructured: sourceGuideStructuredForModel(selectedModule, SOURCE_GUIDE_LEVELS.MODULE) }
          : {})
      },
      lesson: {
        title: text(selectedLesson?.title) || key(selectedLesson),
        objective: objective(selectedLesson),
        ...(sourceGuideForModel(selectedLesson, SOURCE_GUIDE_LEVELS.LESSON)
          ? { sourceGuide: sourceGuideForModel(selectedLesson, SOURCE_GUIDE_LEVELS.LESSON) }
          : {}),
        ...(sourceGuideStructuredForModel(selectedLesson, SOURCE_GUIDE_LEVELS.LESSON)
          ? { sourceGuideStructured: sourceGuideStructuredForModel(selectedLesson, SOURCE_GUIDE_LEVELS.LESSON) }
          : {}),
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
    availableResources: listCardResourceSummaries(),
    didacticGuardrails: buildDidacticGuardrails(),
    sources: resolvedSources.referencedSources,
    model: { id: capabilities.model, capabilities },
    sourceResolution: resolvedSources
  };
}
