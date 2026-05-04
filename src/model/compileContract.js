function makeNodeId(parts) {
  return parts.join(":");
}

export function compileContractDocument(document) {
  const sequences = [];
  const cards = [];

  const compiledCourses = document.courses.map((course, courseIndex) => {
    const courseId = makeNodeId(["course", course.key]);

    return {
      id: courseId,
      key: course.key,
      title: course.title,
      ...(course.description ? { description: course.description } : {}),
      order: courseIndex,
      modules: course.modules.map((moduleValue, moduleIndex) => {
        const moduleId = makeNodeId(["module", course.key, moduleValue.key]);

        return {
          id: moduleId,
          key: moduleValue.key,
          title: moduleValue.title,
          ...(moduleValue.description ? { description: moduleValue.description } : {}),
          order: moduleIndex,
          lessons: moduleValue.lessons.map((lesson, lessonIndex) => {
            const lessonId = makeNodeId(["lesson", course.key, moduleValue.key, lesson.key]);

            return {
              id: lessonId,
              key: lesson.key,
              title: lesson.title,
              ...(lesson.description ? { description: lesson.description } : {}),
              order: lessonIndex,
              microsequences: lesson.microsequences.map((microsequence, microsequenceIndex) => {
                const microsequenceId = makeNodeId([
                  "microsequence",
                  course.key,
                  moduleValue.key,
                  lesson.key,
                  microsequence.key
                ]);

                const sequenceEntry = {
                  id: microsequenceId,
                  key: microsequence.key,
                  courseId,
                  moduleId,
                  lessonId,
                  order: microsequenceIndex,
                  title: microsequence.title,
                  cardIds: []
                };

                const compiledMicrosequence = {
                  id: microsequenceId,
                  key: microsequence.key,
                  title: microsequence.title,
                  ...(microsequence.tags?.length ? { tags: microsequence.tags } : {}),
                  order: microsequenceIndex,
                  cards: microsequence.cards.map((card, cardIndex) => {
                    const cardId = makeNodeId([
                      "card",
                      course.key,
                      moduleValue.key,
                      lesson.key,
                      microsequence.key,
                      card.key
                    ]);

                    const { key, ...payload } = card;
                    const compiledCard = {
                      id: cardId,
                      key,
                      ...payload,
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
    courses: compiledCourses,
    index: {
      sequences,
      cards
    }
  };
}
