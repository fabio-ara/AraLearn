import { resolveCardRuntime } from "../core/cardRuntime.js";

function makeNodeId(parts) {
  return parts.join(":");
}

export function compileContractDocument(document) {
  const sequences = [];
  const cards = [];

  const compiledCourses = document.courses.map((course, courseIndex) => {
    const courseId = makeNodeId(["course", course.id]);
    return {
      id: courseId,
      title: course.title,
      goal: course.goal,
      order: courseIndex,
      modules: course.modules.map((moduleValue, moduleIndex) => {
        const moduleId = makeNodeId(["module", course.id, moduleValue.id]);
        return {
          id: moduleId,
          title: moduleValue.title,
          guide: structuredClone(moduleValue.guide),
          order: moduleIndex,
          lessons: moduleValue.lessons.map((lesson, lessonIndex) => {
            const lessonId = makeNodeId(["lesson", course.id, moduleValue.id, lesson.id]);
            return {
              id: lessonId,
              title: lesson.title,
              guide: structuredClone(lesson.guide),
              topics: structuredClone(lesson.topics),
              order: lessonIndex,
              microsequences: lesson.microsequences.map((microsequence, microsequenceIndex) => {
                const microsequenceId = makeNodeId(["microsequence", course.id, moduleValue.id, lesson.id, microsequence.id]);
                const activeVersion =
                  (microsequence.versions || []).find((version) => version.id === microsequence.activeVersion)
                  || microsequence.versions.at(-1)
                  || null;
                const activeCards = Array.isArray(activeVersion?.cards) ? activeVersion.cards : [];

                const sequenceEntry = {
                  id: microsequenceId,
                  courseId,
                  moduleId,
                  lessonId,
                  microsequenceId,
                  order: microsequenceIndex,
                  title: microsequence.title,
                  cardIds: []
                };

                const compiledMicrosequence = {
                  id: microsequenceId,
                  title: microsequence.title,
                  goal: microsequence.goal,
                  role: microsequence.role,
                  status: microsequence.status,
                  dependsOn: [...(microsequence.dependsOn || [])],
                  covers: [...(microsequence.covers || [])],
                  checks: [...(microsequence.checks || [])],
                  versions: structuredClone(microsequence.versions),
                  activeVersion: microsequence.activeVersion,
                  order: microsequenceIndex,
                  cards: activeCards.map((card, cardIndex) => {
                    const cardId = makeNodeId(["card", course.id, moduleValue.id, lesson.id, microsequence.id, card.id]);
                    const compiledCard = {
                      ...structuredClone(card),
                      id: cardId,
                      runtime: resolveCardRuntime(card),
                      order: cardIndex,
                      scope: {
                        courseId,
                        moduleId,
                        lessonId,
                        microsequenceId
                      }
                    };
                    sequenceEntry.cardIds.push(cardId);
                    cards.push(compiledCard);
                    return compiledCard;
                  })
                };

                sequences.push(sequenceEntry);
                return compiledMicrosequence;
              })
            };
          })
        };
      })
    };
  });

  return {
    contract: document.contract,
    version: document.version,
    kind: document.kind,
    courses: compiledCourses,
    index: {
      sequences,
      cards
    }
  };
}
