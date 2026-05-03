function makeNodeId(parts) {
  return parts.join(":");
}

export function compileIntentV1Document(document) {
  const course = document.course;
  const courseId = makeNodeId(["course", course.key]);

  const sequences = [];
  const cards = [];

  const compiledCourse = {
    id: courseId,
    key: course.key,
    title: course.title,
    ...(course.description ? { description: course.description } : {}),
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
                title: microsequence.title ?? null,
                objective: microsequence.objective,
                cardIds: []
              };

              const compiledMicrosequence = {
                id: microsequenceId,
                key: microsequence.key,
                ...(microsequence.title ? { title: microsequence.title } : {}),
                objective: microsequence.objective,
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

                  sequenceEntry.cardIds.push(cardId);

                  const compiledCard = {
                    id: cardId,
                    key: card.key,
                    intent: card.intent,
                    ...(card.title ? { title: card.title } : {}),
                    ...(card.data ? { data: card.data } : {}),
                    order: cardIndex,
                    scope: {
                      courseId,
                      moduleId,
                      lessonId,
                      microsequenceId
                    }
                  };

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

  return {
    contract: document.contract,
    course: compiledCourse,
    index: {
      sequences,
      cards
    }
  };
}
