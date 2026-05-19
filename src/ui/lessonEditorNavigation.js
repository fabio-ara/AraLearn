import { getLessonProgressCursor } from "../storage/progressStore.js";
import {
  collectLessonCards,
  findCard,
  findCourse,
  findLesson,
  findMicrosequence,
  findModule,
  getFirstPath
} from "./lessonEditorPaths.js";

function nullSelection() {
  return {
    courseKey: null,
    moduleKey: null,
    lessonKey: null,
    microsequenceKey: null,
    cardKey: null,
    cardIndex: 0
  };
}

export function resolveSelectionByKeys(projectDocument, desiredSelection = {}) {
  const fallbackPath = getFirstPath(projectDocument);
  const course = findCourse(projectDocument, desiredSelection?.courseKey) || findCourse(projectDocument, fallbackPath.courseKey);
  const moduleValue =
    findModule(projectDocument, course?.key, desiredSelection?.moduleKey) ||
    findModule(projectDocument, course?.key, fallbackPath.moduleKey);
  const lesson =
    findLesson(projectDocument, course?.key, moduleValue?.key, desiredSelection?.lessonKey) ||
    findLesson(projectDocument, course?.key, moduleValue?.key, fallbackPath.lessonKey);
  const microsequence =
    findMicrosequence(projectDocument, course?.key, moduleValue?.key, lesson?.key, desiredSelection?.microsequenceKey) ||
    findMicrosequence(projectDocument, course?.key, moduleValue?.key, lesson?.key, fallbackPath.microsequenceKey);
  const cards = microsequence?.cards || [];
  const fallbackCardIndex = Number.isInteger(fallbackPath.cardIndex) ? fallbackPath.cardIndex : 0;
  const preferredIndex = Number.isInteger(desiredSelection?.cardIndex) ? desiredSelection.cardIndex : fallbackCardIndex;
  const cardFromKey = desiredSelection?.cardKey ? findCard(microsequence, desiredSelection.cardKey) : null;
  const safeCardIndex = cards.length ? Math.max(0, Math.min(preferredIndex, cards.length - 1)) : 0;
  const selectedCard = cardFromKey || cards[safeCardIndex] || null;

  return {
    courseKey: course?.key || null,
    moduleKey: moduleValue?.key || null,
    lessonKey: lesson?.key || null,
    microsequenceKey: microsequence?.key || null,
    cardKey: selectedCard?.key || null,
    cardIndex: selectedCard ? cards.findIndex((item) => item.key === selectedCard.key) : 0
  };
}

export function resolveFirstSelection(projectDocument) {
  return getFirstPath(projectDocument);
}

export function buildCourseNavigationState(projectDocument, courseKey) {
  const course = findCourse(projectDocument, courseKey);
  if (!course) {
    return null;
  }

  return {
    selection: resolveSelectionByKeys(projectDocument, {
      courseKey: course.key,
      moduleKey: course.modules?.[0]?.key || null,
      lessonKey: course.modules?.[0]?.lessons?.[0]?.key || null,
      microsequenceKey: course.modules?.[0]?.lessons?.[0]?.microsequences?.[0]?.key || null,
      cardKey: course.modules?.[0]?.lessons?.[0]?.microsequences?.[0]?.cards?.[0]?.key || null,
      cardIndex: 0
    }),
    view: "course"
  };
}

export function buildModuleNavigationState(projectDocument, { courseKey = "", moduleKey = "" } = {}) {
  const moduleValue = findModule(projectDocument, courseKey, moduleKey);
  if (!moduleValue) {
    return null;
  }

  return {
    selection: resolveSelectionByKeys(projectDocument, {
      courseKey,
      moduleKey: moduleValue.key,
      lessonKey: moduleValue.lessons?.[0]?.key || null,
      microsequenceKey: moduleValue.lessons?.[0]?.microsequences?.[0]?.key || null,
      cardKey: moduleValue.lessons?.[0]?.microsequences?.[0]?.cards?.[0]?.key || null,
      cardIndex: 0
    }),
    view: "module"
  };
}

export function buildLessonNavigationState(projectDocument, progressState, { courseKey = "", moduleKey = "", lessonKey = "" } = {}) {
  const lesson = findLesson(projectDocument, courseKey, moduleKey, lessonKey);
  if (!lesson) {
    return null;
  }

  const lessonCards = collectLessonCards(lesson);
  const progressCursor = getLessonProgressCursor(progressState, { courseKey, moduleKey, lessonKey }, lessonCards.length);
  const currentEntry = lessonCards[progressCursor] || lessonCards[0] || null;
  const firstMicrosequence = currentEntry
    ? findMicrosequence(projectDocument, courseKey, moduleKey, lessonKey, currentEntry.microsequenceKey)
    : (lesson.microsequences || [])[0] || null;
  const firstCard = currentEntry
    ? currentEntry.card
    : firstMicrosequence && firstMicrosequence.cards
      ? firstMicrosequence.cards[0] || null
      : null;

  return {
    selection: {
      courseKey,
      moduleKey,
      lessonKey,
      microsequenceKey: currentEntry ? currentEntry.microsequenceKey : firstMicrosequence ? firstMicrosequence.key : null,
      cardKey: firstCard ? firstCard.key : null,
      cardIndex: currentEntry ? currentEntry.cardIndex : 0
    },
    view: "lesson"
  };
}

export function buildNavigationViewState({ selection = nullSelection(), view = "courses" } = {}) {
  return {
    selection,
    view,
    cardCommentOpen: false,
    entityEditor: null,
    microsequenceMode: "play"
  };
}
