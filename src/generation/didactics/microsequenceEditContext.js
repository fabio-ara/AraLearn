import { normalizeSelectedLessonTopicRefs } from "../tags/selectedLessonTopicRefs.js";
import { buildLessonRequestGovernance } from "./didacticGovernance.js";
import {
  buildSourceGuideTextForModel,
  sanitizeSourceGuideStructuredForModel,
  SOURCE_GUIDE_LEVELS
} from "../../sourceGuides/sourceGuideStructured.js";
import { normalizeLessonGuidance } from "../guidance/lessonGuidance.js";

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function keyOf(value) {
  return text(value?.key) || text(value?.id) || "";
}

function sourceGuideStructuredForModel(value, level) {
  const structured = sanitizeSourceGuideStructuredForModel(value?.sourceGuideStructured, { level });
  return Object.keys(structured).length ? structured : undefined;
}

function summarizeCard(card, index) {
  return {
    key: text(card?.key) || `card-${index + 1}`,
    title: text(card?.title) || `Card ${index + 1}`,
    summary: text(card?.say || card?.ask || card?.code || card?.title).slice(0, 160)
  };
}

function summarizeMicrosequence(value) {
  return {
    key: keyOf(value),
    title: text(value?.title) || keyOf(value),
    objective: text(value?.description),
    tags: Array.isArray(value?.tags) ? value.tags.map((item) => text(item)).filter(Boolean) : [],
    status: text(value?.status)
  };
}

export function buildMicrosequenceEditPlanningEnvelope({
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
  userPrompt = ""
}) {
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
    context: {
      path: [
        { level: "course", key: keyOf(selectedCourse), title: text(selectedCourse?.title) || keyOf(selectedCourse) },
        { level: "module", key: keyOf(selectedModule), title: text(selectedModule?.title) || keyOf(selectedModule) },
        { level: "lesson", key: keyOf(selectedLesson), title: text(selectedLesson?.title) || keyOf(selectedLesson) },
        { level: "microsequence", key: keyOf(selectedMicrosequence), title: text(selectedMicrosequence?.title) || keyOf(selectedMicrosequence) }
      ],
      course: {
        title: text(selectedCourse?.title),
        objective: text(selectedCourse?.description)
      },
      module: {
        title: text(selectedModule?.title),
        objective: text(selectedModule?.description)
      },
      lesson: {
        title: text(selectedLesson?.title),
        objective: text(selectedLesson?.description),
        ...(lessonGuideStructured
          ? { sourceGuide: buildSourceGuideTextForModel(lessonGuideStructured, { level: SOURCE_GUIDE_LEVELS.LESSON }) }
          : {}),
        ...(lessonGuideStructured ? { sourceGuideStructured: lessonGuideStructured } : {}),
        ...lessonGuidance,
        microsequenceLine: Array.isArray(selectedLesson?.microsequences)
          ? selectedLesson.microsequences.map(summarizeMicrosequence)
          : []
      },
      microsequence: {
        title: text(selectedMicrosequence?.title),
        objective: text(selectedMicrosequence?.description),
        ...(selectedMicrosequence ? summarizeMicrosequence(selectedMicrosequence) : {})
      }
    },
    requestGovernance: buildLessonRequestGovernance(lessonGuideStructured),
    selectedLessonTopicRefs: selectedTopics,
    request: {
      userPrompt: text(userPrompt)
    },
    currentVersion: {
      versionId: text(selectedMicrosequenceVersion?.id),
      cardCount: currentCards.length,
      cardsSummary: currentCards.map(summarizeCard)
    },
    versionHistory: previousVersions.map((version) => ({
      versionId: text(version.id),
      label: text(version.label),
      cardCount: Array.isArray(version.cards) ? version.cards.length : 0,
      shortSummary: text(version.description || version.label).slice(0, 160)
    }))
  };
}
