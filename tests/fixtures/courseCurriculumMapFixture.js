export const CURRICULUM_COURSE_ID = "123e4567-e89b-42d3-a456-426614174000";

export function curriculumMapFixture({ moduleCount = 12, lessonCount = 4, microsequenceCount = 5 } = {}) {
  let previousMicrosequence = null;
  const curriculum = { modules: Array.from({ length: moduleCount }, (_, moduleIndex) => ({
    id: `module-${moduleIndex + 1}`, position: moduleIndex,
    title: `Módulo ${moduleIndex + 1}: mecanismos, condições e relações`,
    objective: `Objetivo completo do módulo ${moduleIndex + 1}.\n${"Comparar explicações sem confundir associação e mecanismo. ".repeat(20)}Última condição do objetivo.`,
    lessons: Array.from({ length: lessonCount }, (_, lessonIndex) => ({
      id: `lesson-${moduleIndex + 1}-${lessonIndex + 1}`, position: lessonIndex,
      title: `Lição ${moduleIndex + 1}.${lessonIndex + 1}: análise de condições`,
      objective: "Explicar as condições em que o mecanismo se aplica e reconhecer seus limites.",
      microsequences: Array.from({ length: microsequenceCount }, (_, microsequenceIndex) => {
        const id = `micro-${moduleIndex + 1}-${lessonIndex + 1}-${microsequenceIndex + 1}`;
        const dependencies = previousMicrosequence ? [previousMicrosequence] : [];
        previousMicrosequence = id;
        return {
          id, position: microsequenceIndex,
          title: `Microssequência ${moduleIndex + 1}.${lessonIndex + 1}.${microsequenceIndex + 1}: explicação e contraste`,
          objective: "Distinguir as previsões dos mecanismos nos casos apresentados.",
          dependencyMicrosequenceIds: dependencies, role: "explain"
        };
      })
    }))
  })) };
  return {
    courseId: CURRICULUM_COURSE_ID, curriculum, curriculumMapStatus: "approved",
    curriculumScopeItems: [{
      id: "223e4567-e89b-42d3-a456-426614174000", position: 0, state: "developed",
      statement: "Distinguir mecanismos e aplicar suas condições nos casos de transferência.",
      curriculumTargets: [{ moduleId: "module-1", lessonId: "lesson-1-1", didacticMicrosequenceIds: ["micro-1-1-1", "micro-1-1-2"] }],
      developedIn: [{ studyUnitId: "study-unit-1", didacticMicrosequenceId: "micro-1-1-1", title: "Primeira comparação de mecanismos" }]
    }]
  };
}
