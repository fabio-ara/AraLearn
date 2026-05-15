import { listMicrosequenceSizes } from "../types/microsequenceSizes.js";
import { listMicrosequenceTypeSummaries } from "../types/microsequenceTypes.js";
import { listCardResourceSummaries } from "../resources/cardResourceDefinitions.js";
import { getModelCapabilities } from "../providers/modelCapabilities.js";
import { resolveReferencedSources } from "../sources/resolveReferencedSources.js";
import { normalizeSelectedLessonTopicRefs } from "../tags/selectedLessonTopicRefs.js";
import {
  buildSourceGuideTextForModel,
  sanitizeSourceGuideStructuredForModel,
  SOURCE_GUIDE_LEVELS
} from "../../sourceGuides/sourceGuideStructured.js";
import { normalizeLessonGuidance } from "../guidance/lessonGuidance.js";
import { resolveWeakModelModePolicy } from "../policies/weakModelPolicy.js";
import { buildLessonDomainMap } from "../domain/lessonDomainModel.js";
import { summarizeMeticulousPolicyForPrompt } from "../policies/meticulousDidacticPolicy.js";
import { buildStudyTrackPolicy } from "../policies/studyTrackPolicy.js";

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function key(value) {
  return text(value?.key) || text(value?.id) || "";
}

function objective(value) {
  return text(value?.objective) || text(value?.description);
}

function summarizeMicrosequence(value) {
  return {
    key: key(value),
    title: text(value?.title) || key(value),
    objective: objective(value),
    description: text(value?.description),
    tags: Array.isArray(value?.tags) ? value.tags.map((item) => text(item)).filter(Boolean) : [],
    domainRefs: Array.isArray(value?.domainRefs) ? value.domainRefs.map((item) => text(item)).filter(Boolean) : [],
    practiceVariantRefs: Array.isArray(value?.practiceVariantRefs) ? value.practiceVariantRefs.map((item) => text(item)).filter(Boolean) : [],
    didacticPurpose: text(value?.didacticPurpose),
    coverageRole: text(value?.coverageRole),
    status: text(value?.status),
    included: value?.included === true
  };
}

function buildRequestGovernance() {
  return {
    precedence: [
      "context.lesson.sourceGuideStructured",
      "selectedLessonTopicRefs",
      "request.userPrompt"
    ],
    lessonGuidePriority: "sourceGuideStructured governa meta, notação e confusões prováveis",
    lessonTopicRefsPriority: "selectedLessonTopicRefs especializa escopo local",
    userPromptRole: "request.userPrompt apenas especializa o recorte atual"
  };
}

function resolveAvailableTypes(policy, userFixedTypeId) {
  const fixedTypeId = text(userFixedTypeId);
  if (fixedTypeId && fixedTypeId !== "assisted") {
    return listMicrosequenceTypeSummaries().filter((item) => item.id === fixedTypeId);
  }
  return listMicrosequenceTypeSummaries().filter((item) => policy.allowedTypeIds.includes(item.id));
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
  const lessonSourceGuideStructured = sanitizeSourceGuideStructuredForModel(
    selectedLesson?.sourceGuideStructured,
    { level: SOURCE_GUIDE_LEVELS.LESSON }
  );
  const lessonGuidance = normalizeLessonGuidance(selectedLesson);
  const lessonDomainMap = buildLessonDomainMap(selectedLesson || {});
  const policy = resolveWeakModelModePolicy({
    lessonGuidance,
    lessonSourceGuideStructured,
    modelCapabilities: capabilities,
    resolvedTypeId: text(userFixedTypeId) && text(userFixedTypeId) !== "assisted" ? text(userFixedTypeId) : "simple",
    userSelectedExtraResourceTypes
  });
  const resolvedSources = resolveReferencedSources({ userPrompt, attachedSources, userSelectedSourceIds });
  const selectedTopics = normalizeSelectedLessonTopicRefs({
    selectedLessonTopicRefs,
    selectedLessonScopeTagRefs,
    selectedLessonTags,
    lessonTags,
    availableLessonTopics: selectedLesson?.lessonTopics || selectedLesson?.scopeTags || selectedLesson?.tags || []
  });
  const lessonMicrosequenceLine = Array.isArray(selectedLesson?.microsequences)
    ? selectedLesson.microsequences.map(summarizeMicrosequence)
    : [];
  const studyTrackPolicy = buildStudyTrackPolicy({
    userPrompt,
    lesson: {
      ...(selectedLesson || {}),
      sourceGuideStructured: lessonSourceGuideStructured,
      domainMap: lessonDomainMap,
      microsequenceLine: lessonMicrosequenceLine
    },
    microsequence: summarizeMicrosequence(targetMicrosequence),
    selectedLessonTopicRefs: selectedTopics
  });

  return {
    version: "aralearn.microsequence-planning-contract.v2",
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
        ...(Object.keys(lessonSourceGuideStructured).length
          ? {
              sourceGuideStructured: lessonSourceGuideStructured,
              sourceGuide: buildSourceGuideTextForModel(lessonSourceGuideStructured, { level: SOURCE_GUIDE_LEVELS.LESSON })
            }
          : {}),
        ...lessonGuidance,
        ...(lessonDomainMap.items.length || lessonDomainMap.practiceVariants.length ? { domainMap: lessonDomainMap } : {}),
        microsequenceLine: lessonMicrosequenceLine
      },
      microsequence: summarizeMicrosequence(targetMicrosequence)
    },
    request: {
      userPrompt: text(userPrompt),
      userFixedTypeId: userFixedTypeId || null,
      userSelectedExtraResourceTypes: [...userSelectedExtraResourceTypes]
    },
    requestGovernance: buildRequestGovernance(),
    studyTrackPolicy,
    selectedLessonTopicRefs: selectedTopics,
    sources: resolvedSources.referencedSources,
    availableTypes: resolveAvailableTypes(policy, userFixedTypeId),
    availableSizes: listMicrosequenceSizes()
      .filter((item) => policy.allowedSizeIds.includes(item.id))
      .map(({ id, cardCount }) => ({ id, cardCount })),
    availableResources: listCardResourceSummaries().filter((item) => policy.safeAllowedResourceTypes.includes(item.id)),
    model: { id: capabilities.model, capabilities },
    sourceResolution: resolvedSources,
    weakModelMode: policy,
    meticulousPolicy: summarizeMeticulousPolicyForPrompt({ weakModelMode: true })
  };
}
