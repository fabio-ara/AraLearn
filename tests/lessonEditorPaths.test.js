import test from "node:test";
import assert from "node:assert/strict";

import {
  buildCardPathKey,
  collectAssistDependencies,
  collectLessonCards,
  findCard,
  findCourse,
  findLesson,
  findMicrosequence,
  findModule,
  getDefaultDependencyKeys,
  getFirstPath
} from "../src/ui/lessonEditorPaths.js";

function makeProject() {
  return {
    course: {
      key: "curso-a",
      title: "Curso A",
      modules: [
        {
          key: "mod-1",
          title: "Modulo 1",
          lessons: [
            {
              key: "licao-1",
              title: "Licao 1",
              microsequences: [
                {
                  key: "micro-1",
                  title: "Micro 1",
                  cards: [
                    { key: "card-1", title: "Card 1" },
                    { key: "card-2", title: "Card 2" }
                  ]
                },
                {
                  key: "micro-2",
                  title: "Micro 2",
                  cards: [{ key: "card-3", title: "Card 3" }]
                }
              ]
            },
            {
              key: "licao-2",
              title: "Licao 2",
              microsequences: [
                {
                  key: "micro-3",
                  title: "Micro 3",
                  cards: [{ key: "card-4", title: "Card 4" }]
                }
              ]
            }
          ]
        },
        {
          key: "mod-2",
          title: "Modulo 2",
          lessons: [
            {
              key: "licao-3",
              title: "Licao 3",
              microsequences: [
                {
                  key: "micro-4",
                  title: "Micro 4",
                  cards: [{ key: "card-5", title: "Card 5" }]
                }
              ]
            }
          ]
        }
      ]
    }
  };
}

test("lessonEditorPaths resolve caminho inicial e entidades por chave", () => {
  const project = makeProject();

  assert.deepEqual(getFirstPath(project), {
    courseKey: "curso-a",
    moduleKey: "mod-1",
    lessonKey: "licao-1",
    microsequenceKey: "micro-1",
    cardKey: "card-1",
    cardIndex: 0
  });

  assert.equal(findCourse(project, "curso-a")?.title, "Curso A");
  assert.equal(findModule(project, "curso-a", "mod-1")?.title, "Modulo 1");
  assert.equal(findLesson(project, "curso-a", "mod-1", "licao-1")?.title, "Licao 1");
  assert.equal(findMicrosequence(project, "curso-a", "mod-1", "licao-1", "micro-2")?.title, "Micro 2");
  assert.equal(findCard(findMicrosequence(project, "curso-a", "mod-1", "licao-1", "micro-1"), "card-2")?.title, "Card 2");
});

test("lessonEditorPaths montam chave e colecao plana de cards da licao", () => {
  const project = makeProject();
  const lesson = findLesson(project, "curso-a", "mod-1", "licao-1");

  assert.equal(
    buildCardPathKey({
      courseKey: "curso-a",
      moduleKey: "mod-1",
      lessonKey: "licao-1",
      microsequenceKey: "micro-1",
      cardKey: "card-2"
    }),
    "curso-a::mod-1::licao-1::micro-1::card-2"
  );

  assert.deepEqual(
    collectLessonCards(lesson).map((item) => [item.microsequenceKey, item.cardKey, item.cardIndex]),
    [
      ["micro-1", "card-1", 0],
      ["micro-1", "card-2", 1],
      ["micro-2", "card-3", 0]
    ]
  );
});

test("lessonEditorPaths calculam dependencias didaticas em ordem de prioridade", () => {
  const project = makeProject();
  const course = findCourse(project, "curso-a");
  const moduleValue = findModule(project, "curso-a", "mod-1");
  const lesson = findLesson(project, "curso-a", "mod-1", "licao-2");
  const microsequence = findMicrosequence(project, "curso-a", "mod-1", "licao-2", "micro-3");

  const dependencies = collectAssistDependencies(course, moduleValue, lesson, microsequence);

  assert.deepEqual(
    dependencies.map((item) => [item.key, item.scope]),
    [
      ["micro-1", "Módulo"],
      ["micro-2", "Módulo"],
      ["micro-4", "Curso"]
    ]
  );

  assert.deepEqual(getDefaultDependencyKeys(dependencies, 2), ["micro-1", "micro-2"]);
});
