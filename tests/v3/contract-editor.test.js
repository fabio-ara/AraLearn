import test from "node:test";
import assert from "node:assert/strict";

import { createEmptyProjectDocument } from "../../src/domain/aralearnProject.js";
import {
  createCourse,
  createLesson,
  createMicrosequence,
  createModule,
  replaceMicrosequenceCards,
  updateCardInMicrosequence,
  updateCourse,
  updateLesson,
  updateMicrosequence,
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

test("o editor estrutural exige as chaves canônicas de cada nível", () => {
  const project = buildProject();

  assert.throws(
    () => updateCourse(project, { title: "Sem chave" }),
    /Curso não encontrado: ""/u
  );
  assert.throws(
    () => updateModule(project, { courseKey: "course-a", title: "Sem chave" }),
    /Módulo não encontrado: ""/u
  );
  assert.throws(
    () => updateLesson(project, {
      courseKey: "course-a",
      moduleKey: "module-a",
      title: "Sem chave"
    }),
    /Lição não encontrada: ""/u
  );

  const projectWithCards = replaceMicrosequenceCards(
    createMicrosequence(project, {
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
      cards: [{
        id: "card-a",
        position: 1,
        resource: "paragraph",
        kind: "theory",
        exercise: "none",
        title: "Card A",
        text: "Explicação.",
        after: ""
      }]
    }
  );

  assert.throws(
    () => updateMicrosequence(projectWithCards, {
      courseKey: "course-a",
      moduleKey: "module-a",
      lessonKey: "lesson-a",
      title: "Sem chave"
    }),
    /Microssequência não encontrada: ""/u
  );
  assert.throws(
    () => updateCardInMicrosequence(projectWithCards, {
      courseKey: "course-a",
      moduleKey: "module-a",
      lessonKey: "lesson-a",
      microsequenceKey: "micro-a",
      card: { title: "Sem chave" }
    }),
    /Card não encontrado: ""/u
  );
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

test("o editor estrutural normaliza ids duplicados na mesma microssequência", () => {
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
