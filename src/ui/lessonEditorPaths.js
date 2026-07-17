import { isRunnableMicrosequence } from "../model/microsequenceStatus.js";

export const DEFAULT_ASSIST_REFS = 3;

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function cardToken(card, index = 0) {
  return text(card?.id) || `card-${Number(card?.position) || index + 1}`;
}

function activeCards(microsequence) {
  return Array.isArray(microsequence?.cards) ? microsequence.cards : [];
}

export function buildCardPathKey(selection) {
  return [
    selection.courseKey,
    selection.moduleKey,
    selection.lessonKey,
    selection.microsequenceKey,
    selection.cardKey
  ].join("::");
}

export function collectAssistRefs(course, moduleValue, lesson, microsequence) {
  if (!course || !moduleValue || !lesson || !microsequence) {
    return [];
  }

  const refs = [];
  const seenIds = new Set();

  function pushRef(item, scope) {
    if (!item || !item.id || item.id === microsequence.id || seenIds.has(item.id) || !isRunnableMicrosequence(item)) {
      return;
    }
    seenIds.add(item.id);
    refs.push({
      id: item.id,
      title: item.title || item.id,
      scope
    });
  }

  const lessonMicrosequences = lesson.microsequences || [];
  const currentIndex = lessonMicrosequences.findIndex((item) => item.id === microsequence.id);
  lessonMicrosequences.slice(0, Math.max(0, currentIndex)).forEach((item) => pushRef(item, "Lição"));

  (moduleValue.lessons || []).forEach((moduleLesson) => {
    if (moduleLesson.id === lesson.id) {
      return;
    }
    (moduleLesson.microsequences || []).forEach((item) => pushRef(item, "Módulo"));
  });

  (course.modules || []).forEach((courseModule) => {
    if (courseModule.id === moduleValue.id) {
      return;
    }
    (courseModule.lessons || []).forEach((courseLesson) => {
      (courseLesson.microsequences || []).forEach((item) => pushRef(item, "Curso"));
    });
  });

  return refs;
}

export function getDefaultAssistRefIds(refs, limit = DEFAULT_ASSIST_REFS) {
  return refs.slice(0, limit).map((item) => item.id);
}

export function getFirstPath(project) {
  const course = (project.courses || [])[0];
  if (!course) {
    return {
      courseKey: null,
      moduleKey: null,
      lessonKey: null,
      microsequenceKey: null,
      cardKey: null,
      cardIndex: 0
    };
  }

  const moduleValue = (course.modules || [])[0] || null;
  const lesson = (moduleValue?.lessons || [])[0] || null;
  const microsequence = (lesson?.microsequences || [])[0] || null;
  const cards = activeCards(microsequence);
  const card = cards[0] || null;

  return {
    courseKey: course.id,
    moduleKey: moduleValue?.id || null,
    lessonKey: lesson?.id || null,
    microsequenceKey: microsequence?.id || null,
    cardKey: card ? cardToken(card, 0) : null,
    cardIndex: 0
  };
}

export function findCourse(project, courseKey) {
  return (project.courses || []).find((item) => item.id === courseKey) || null;
}

export function findModule(project, courseKey, moduleKey) {
  const course = findCourse(project, courseKey);
  if (!course) return null;
  return (course.modules || []).find((item) => item.id === moduleKey) || null;
}

export function findLesson(project, courseKey, moduleKey, lessonKey) {
  const moduleValue = findModule(project, courseKey, moduleKey);
  if (!moduleValue) return null;
  return (moduleValue.lessons || []).find((item) => item.id === lessonKey) || null;
}

export function findMicrosequence(project, courseKey, moduleKey, lessonKey, microsequenceKey) {
  const lesson = findLesson(project, courseKey, moduleKey, lessonKey);
  if (!lesson) return null;
  return (lesson.microsequences || []).find((item) => item.id === microsequenceKey) || null;
}

export function findCard(microsequence, cardKey) {
  return activeCards(microsequence).find((item, index) => cardToken(item, index) === cardKey) || null;
}

export function findSelectedCard(microsequence, selection = {}) {
  const cards = activeCards(microsequence);
  const preferredIndex = Number.isInteger(selection?.cardIndex) ? selection.cardIndex : -1;
  if (preferredIndex >= 0 && preferredIndex < cards.length) {
    return cards[preferredIndex] || null;
  }

  const cardKey = text(selection?.cardKey);
  return cardKey ? findCard(microsequence, cardKey) : null;
}

export function collectLessonCards(lesson) {
  const entries = [];
  (lesson?.microsequences || []).forEach((microsequence) => {
    if (!isRunnableMicrosequence(microsequence)) {
      return;
    }
    activeCards(microsequence).forEach((card, cardIndex) => {
      entries.push({
        microsequenceKey: microsequence.id,
        microsequenceTitle: microsequence.title || microsequence.id,
        cardKey: cardToken(card, cardIndex),
        card,
        cardIndex
      });
    });
  });
  return entries;
}

export function findLessonCardEntryIndex(lessonCards = [], selection = {}) {
  const microsequenceKey = text(selection?.microsequenceKey);
  const preferredIndex = Number.isInteger(selection?.cardIndex) ? selection.cardIndex : -1;
  const cardKey = text(selection?.cardKey);

  if (microsequenceKey && preferredIndex >= 0) {
    const exactIndex = lessonCards.findIndex((entry) => (
      entry?.microsequenceKey === microsequenceKey &&
      entry?.cardIndex === preferredIndex
    ));
    if (exactIndex >= 0) {
      return exactIndex;
    }
  }

  if (microsequenceKey && cardKey) {
    const keyedIndex = lessonCards.findIndex((entry) => (
      entry?.microsequenceKey === microsequenceKey &&
      entry?.cardKey === cardKey
    ));
    if (keyedIndex >= 0) {
      return keyedIndex;
    }
  }

  if (cardKey) {
    return lessonCards.findIndex((entry) => entry?.cardKey === cardKey);
  }

  return -1;
}
