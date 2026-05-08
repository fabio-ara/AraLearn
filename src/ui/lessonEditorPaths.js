import { isRunnableMicrosequence } from "../model/microsequenceStatus.js";

export const DEFAULT_ASSIST_DEPENDENCIES = 3;

export function buildCardPathKey(selection) {
  return [
    selection.courseKey,
    selection.moduleKey,
    selection.lessonKey,
    selection.microsequenceKey,
    selection.cardKey
  ].join("::");
}

export function collectAssistDependencies(course, moduleValue, lesson, microsequence) {
  if (!course || !moduleValue || !lesson || !microsequence) {
    return [];
  }

  const dependencies = [];
  const seenKeys = new Set();

  function pushDependency(item, scope) {
    if (!item || !item.key || item.key === microsequence.key || seenKeys.has(item.key)) {
      return;
    }

    seenKeys.add(item.key);
    dependencies.push({
      key: item.key,
      title: item.title || item.key,
      scope
    });
  }

  const lessonMicrosequences = lesson.microsequences || [];
  const currentIndex = lessonMicrosequences.findIndex((item) => item.key === microsequence.key);
  lessonMicrosequences.slice(0, Math.max(0, currentIndex)).forEach((item) => pushDependency(item, "Lição"));

  (moduleValue.lessons || []).forEach((moduleLesson) => {
    if (moduleLesson.key === lesson.key) {
      return;
    }

    (moduleLesson.microsequences || []).forEach((item) => pushDependency(item, "Módulo"));
  });

  (course.modules || []).forEach((courseModule) => {
    if (courseModule.key === moduleValue.key) {
      return;
    }

    (courseModule.lessons || []).forEach((courseLesson) => {
      (courseLesson.microsequences || []).forEach((item) => pushDependency(item, "Curso"));
    });
  });

  return dependencies;
}

export function collectLessonTopicRefs(lesson, microsequence) {
  if (!lesson || !microsequence) {
    return [];
  }

  const refs = [];
  const seen = new Set();

  function pushRef(refKey, label) {
    const safeRefKey = String(refKey || "").trim();
    const safeLabel = String(label || refKey || "").trim();
    const key = `${safeRefKey}::${safeLabel.toLowerCase()}`;
    if (!safeRefKey || !safeLabel || seen.has(key)) {
      return;
    }
    seen.add(key);
    refs.push({
      refKey: safeRefKey,
      label: safeLabel,
      source: "microsequence"
    });
  }

  (lesson.microsequences || []).forEach((item) => {
    if (!item || item.key === microsequence.key) {
      return;
    }
    pushRef(item.key, item.title || item.key);
    (item.tags || []).forEach((tag) => pushRef(item.key, tag));
  });

  return refs;
}

export function getDefaultDependencyKeys(dependencies, limit = DEFAULT_ASSIST_DEPENDENCIES) {
  return dependencies.slice(0, limit).map((item) => item.key);
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
  const card = (microsequence?.cards || [])[0] || null;

  return {
    courseKey: course.key,
    moduleKey: moduleValue?.key || null,
    lessonKey: lesson?.key || null,
    microsequenceKey: microsequence?.key || null,
    cardKey: card ? card.key : null,
    cardIndex: 0
  };
}

export function findCourse(project, courseKey) {
  return (project.courses || []).find((item) => item.key === courseKey) || null;
}

export function findModule(project, courseKey, moduleKey) {
  const course = findCourse(project, courseKey);
  if (!course) return null;
  return (course.modules || []).find((item) => item.key === moduleKey) || null;
}

export function findLesson(project, courseKey, moduleKey, lessonKey) {
  const moduleValue = findModule(project, courseKey, moduleKey);
  if (!moduleValue) return null;
  return (moduleValue.lessons || []).find((item) => item.key === lessonKey) || null;
}

export function findMicrosequence(project, courseKey, moduleKey, lessonKey, microsequenceKey) {
  const lesson = findLesson(project, courseKey, moduleKey, lessonKey);
  if (!lesson) return null;
  return (lesson.microsequences || []).find((item) => item.key === microsequenceKey) || null;
}

export function findCard(microsequence, cardKey) {
  return (microsequence.cards || []).find((item) => item.key === cardKey) || null;
}

export function collectLessonCards(lesson) {
  const entries = [];
  (lesson?.microsequences || []).forEach((microsequence) => {
    if (!isRunnableMicrosequence(microsequence)) {
      return;
    }
    (microsequence.cards || []).forEach((card, cardIndex) => {
      entries.push({
        microsequenceKey: microsequence.key,
        microsequenceTitle: microsequence.title || microsequence.key,
        cardKey: card.key,
        card,
        cardIndex
      });
    });
  });
  return entries;
}
