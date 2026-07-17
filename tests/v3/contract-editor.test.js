import test from "node:test";
import assert from "node:assert/strict";

import { createEmptyProjectDocument } from "../../src/domain/aralearnProject.js";
import {
  createCourse,
  createLesson,
  createMicrosequence,
  createModule,
  replaceMicrosequenceCards,
  updateCourse,
  updateLesson,
  updateModule
} from "../../src/editor/contractEditor.js";

function buildProject() {
  let project = createEmptyProjectDocument();
  project = createCourse(project, {
    id: "course-a",
    title: "Curso A",
    goal: "Objetivo do curso."
  });
  project = createModule(project, {
    courseKey: "course-a",
    id: "module-a",
    title: "Módulo A",
    goal: "Objetivo do módulo."
  });
  project = createLesson(project, {
    courseKey: "course-a",
    moduleKey: "module-a",
    id: "lesson-a",
    title: "Lição A",
    goal: "Objetivo da lição."
  });
  return project;
}

test("o editor estrutural atualiza curso, módulo e lição pelos campos canônicos do contrato", () => {
  let project = buildProject();

  project = updateCourse(project, {
    courseKey: "course-a",
    title: "Curso revisado",
    goal: "Novo objetivo do curso."
  });
  project = updateModule(project, {
    courseKey: "course-a",
    moduleKey: "module-a",
    title: "Módulo revisado",
    goal: "Novo objetivo do módulo."
  });
  project = updateLesson(project, {
    courseKey: "course-a",
    moduleKey: "module-a",
    lessonKey: "lesson-a",
    title: "Lição revisada",
    goal: "Novo objetivo da lição."
  });

  const course = project.courses[0];
  const moduleValue = course.modules[0];
  const lesson = moduleValue.lessons[0];

  assert.equal(course.title, "Curso revisado");
  assert.equal(course.goal, "Novo objetivo do curso.");
  assert.equal(moduleValue.title, "Módulo revisado");
  assert.equal(moduleValue.guide.goal, "Novo objetivo do módulo.");
  assert.equal(lesson.title, "Lição revisada");
  assert.equal(lesson.guide.goal, "Novo objetivo da lição.");
});

test('o editor estrutural rejeita "key" como campo fora do schema', () => {
  assert.throws(
    () => createCourse(createEmptyProjectDocument(), { key: "course-antigo", title: "Curso antigo" }),
    /Campo fora do schema: "key"/
  );

  assert.throws(
    () =>
      createMicrosequence(buildProject(), {
        courseKey: "course-a",
        moduleKey: "module-a",
        lessonKey: "lesson-a",
        key: "micro-antiga",
        title: "Microssequência antiga"
      }),
    /Campo fora do schema: "key"/
  );
});

test("o editor estrutural normaliza ids duplicados de cards na mesma versão", () => {
  const project = replaceMicrosequenceCards(
    createMicrosequence(buildProject(), {
      courseKey: "course-a",
      moduleKey: "module-a",
      lessonKey: "lesson-a",
      id: "micro-a",
      title: "Microssequência A"
    }),
    {
      courseKey: "course-a",
      moduleKey: "module-a",
      lessonKey: "lesson-a",
      microsequenceKey: "micro-a",
      cards: [
        {
          id: "card-repetido",
          position: 1,
          resource: "paragraph",
          kind: "theory",
          exercise: "none",
          title: "Primeiro",
          text: "Explicação.",
          after: ""
        },
        {
          id: "card-repetido",
          position: 2,
          resource: "paragraph",
          kind: "theory",
          exercise: "none",
          title: "Segundo",
          text: "Outra explicação.",
          after: ""
        }
      ]
    }
  );

  const cards = project.courses[0].modules[0].lessons[0].microsequences[0].cards;
  assert.deepEqual(
    cards.map((card) => card.id),
    ["card-repetido", "card-repetido-2"]
  );
});
