import { getLessonProgressCursor, readLessonProgressEntry } from "../storage/progressStore.js";
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

function cardsOfMicrosequence(microsequence) {
  return Array.isArray(microsequence?.cards) ? microsequence.cards : [];
}

export function resolveSelectionByKeys(projectDocument, desiredSelection = {}) {
  const fallbackPath = getFirstPath(projectDocument);
  const course = findCourse(projectDocument, desiredSelection?.courseKey) || findCourse(projectDocument, fallbackPath.courseKey);
  const moduleValue =
    findModule(projectDocument, course?.id, desiredSelection?.moduleKey) ||
    findModule(projectDocument, course?.id, fallbackPath.moduleKey);
  const lesson =
    findLesson(projectDocument, course?.id, moduleValue?.id, desiredSelection?.lessonKey) ||
    findLesson(projectDocument, course?.id, moduleValue?.id, fallbackPath.lessonKey);
  const microsequence =
    findMicrosequence(projectDocument, course?.id, moduleValue?.id, lesson?.id, desiredSelection?.microsequenceKey) ||
    findMicrosequence(projectDocument, course?.id, moduleValue?.id, lesson?.id, fallbackPath.microsequenceKey);
  const cards = cardsOfMicrosequence(microsequence);
  const fallbackCardIndex = Number.isInteger(fallbackPath.cardIndex) ? fallbackPath.cardIndex : 0;
  const preferredIndex = Number.isInteger(desiredSelection?.cardIndex) ? desiredSelection.cardIndex : fallbackCardIndex;
  const cardFromKey = desiredSelection?.cardKey ? findCard(microsequence, desiredSelection.cardKey) : null;
  const safeCardIndex = cards.length ? Math.max(0, Math.min(preferredIndex, cards.length - 1)) : 0;
  const selectedCard = cardFromKey || cards[safeCardIndex] || null;

  return {
    courseKey: course?.id || null,
    moduleKey: moduleValue?.id || null,
    lessonKey: lesson?.id || null,
    microsequenceKey: microsequence?.id || null,
    cardKey: selectedCard?.id || null,
    cardIndex: selectedCard ? cards.findIndex((item) => item.id === selectedCard.id) : 0
  };
}

export function resolveExactCardSelection(projectDocument, entityPath) {
  if (
    !Array.isArray(entityPath) ||
    entityPath.length !== 5 ||
    entityPath.some((key) => typeof key !== "string" || !key.trim())
  ) {
    return null;
  }

  const desiredSelection = {
    courseKey: entityPath[0],
    moduleKey: entityPath[1],
    lessonKey: entityPath[2],
    microsequenceKey: entityPath[3],
    cardKey: entityPath[4],
    cardIndex: 0
  };
  const resolved = resolveSelectionByKeys(projectDocument, desiredSelection);
  return ["courseKey", "moduleKey", "lessonKey", "microsequenceKey", "cardKey"]
    .every((key) => resolved[key] === desiredSelection[key])
    ? resolved
    : null;
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
      courseKey: course.id,
      moduleKey: course.modules?.[0]?.id || null,
      lessonKey: course.modules?.[0]?.lessons?.[0]?.id || null,
      microsequenceKey: course.modules?.[0]?.lessons?.[0]?.microsequences?.[0]?.id || null,
      cardKey: cardsOfMicrosequence(course.modules?.[0]?.lessons?.[0]?.microsequences?.[0])[0]?.id || null,
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
      moduleKey: moduleValue.id,
      lessonKey: moduleValue.lessons?.[0]?.id || null,
      microsequenceKey: moduleValue.lessons?.[0]?.microsequences?.[0]?.id || null,
      cardKey: cardsOfMicrosequence(moduleValue.lessons?.[0]?.microsequences?.[0])[0]?.id || null,
      cardIndex: 0
    }),
    view: "module"
  };
}

function firstPendingLessonEntry(progressState, reference, lessonCards) {
  const progressEntry = readLessonProgressEntry(progressState, reference);
  const completedCardKeys = new Set(progressEntry?.completedCardKeys || []);
  return lessonCards.find((entry) => !completedCardKeys.has(entry.cardKey)) || lessonCards.at(-1) || null;
}

export function buildStudyModuleNavigationState(
  projectDocument,
  progressState,
  { courseKey = "", moduleKey = "" } = {}
) {
  const moduleValue = findModule(projectDocument, courseKey, moduleKey);
  if (!moduleValue) {
    return null;
  }

  const lessons = Array.isArray(moduleValue.lessons) ? moduleValue.lessons : [];
  if (lessons.length !== 1) {
    return buildModuleNavigationState(projectDocument, { courseKey, moduleKey });
  }

  const lesson = lessons[0];
  const reference = { courseKey, moduleKey, lessonKey: lesson.id };
  const lessonCards = collectLessonCards(lesson);
  const entry = firstPendingLessonEntry(progressState, reference, lessonCards);

  if (!entry) {
    return buildLessonNavigationState(projectDocument, progressState, reference);
  }

  return {
    selection: {
      courseKey,
      moduleKey,
      lessonKey: lesson.id,
      microsequenceKey: entry.microsequenceKey,
      cardKey: entry.cardKey,
      cardIndex: entry.cardIndex
    },
    view: "microsequence"
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
    : firstMicrosequence
      ? cardsOfMicrosequence(firstMicrosequence)[0] || null
      : null;

  return {
    selection: {
      courseKey,
      moduleKey,
      lessonKey,
      microsequenceKey: currentEntry ? currentEntry.microsequenceKey : firstMicrosequence ? firstMicrosequence.id : null,
      cardKey: firstCard ? firstCard.id : null,
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
    microsequenceMode: "play"
  };
}
