import test from "node:test";
import assert from "node:assert/strict";

import {
  buildCourseNavigationState,
  buildLessonNavigationState,
  buildModuleNavigationState,
  buildNavigationViewState,
  resolveFirstSelection,
  resolveSelectionByKeys
} from "../src/ui/lessonEditorNavigation.js";

const projectDocument = {
  courses: [
    {
      key: "course-a",
      modules: [
        {
          key: "module-a",
          lessons: [
            {
              key: "lesson-a",
              microsequences: [
                {
                  key: "micro-a",
                  status: "ready",
                  included: true,
                  cards: [{ key: "card-a1" }, { key: "card-a2" }]
                },
                {
                  key: "micro-b",
                  status: "ready",
                  included: true,
                  cards: [{ key: "card-b1" }]
                }
              ]
            }
          ]
        },
        {
          key: "module-b",
          lessons: [
            {
              key: "lesson-b",
              microsequences: [
                {
                  key: "micro-c",
                  status: "ready",
                  included: true,
                  cards: [{ key: "card-c1" }]
                }
              ]
            }
          ]
        }
      ]
    }
  ]
};

test("resolveSelectionByKeys cai para a primeira seleção válida quando a desejada some", () => {
  assert.deepEqual(
    resolveSelectionByKeys(projectDocument, {
      courseKey: "course-a",
      moduleKey: "module-inexistente",
      lessonKey: "lesson-inexistente",
      microsequenceKey: "micro-inexistente",
      cardKey: "card-inexistente",
      cardIndex: 9
    }),
    {
      courseKey: "course-a",
      moduleKey: "module-a",
      lessonKey: "lesson-a",
      microsequenceKey: "micro-a",
      cardKey: "card-a2",
      cardIndex: 1
    }
  );
});

test("resolveFirstSelection devolve o primeiro caminho navegável do projeto", () => {
  assert.deepEqual(resolveFirstSelection(projectDocument), {
    courseKey: "course-a",
    moduleKey: "module-a",
    lessonKey: "lesson-a",
    microsequenceKey: "micro-a",
    cardKey: "card-a1",
    cardIndex: 0
  });
});

test("buildCourseNavigationState e buildModuleNavigationState resolvem view e seleção básicas", () => {
  assert.deepEqual(buildCourseNavigationState(projectDocument, "course-a"), {
    selection: {
      courseKey: "course-a",
      moduleKey: "module-a",
      lessonKey: "lesson-a",
      microsequenceKey: "micro-a",
      cardKey: "card-a1",
      cardIndex: 0
    },
    view: "course"
  });

  assert.deepEqual(
    buildModuleNavigationState(projectDocument, {
      courseKey: "course-a",
      moduleKey: "module-b"
    }),
    {
      selection: {
        courseKey: "course-a",
        moduleKey: "module-b",
        lessonKey: "lesson-b",
        microsequenceKey: "micro-c",
        cardKey: "card-c1",
        cardIndex: 0
      },
      view: "module"
    }
  );
});

test("buildLessonNavigationState respeita cursor de progresso da lição", () => {
  const progressState = {
    lessons: {
      "course-a::module-a::lesson-a": {
        cursor: 2,
        completedCardKeys: ["card-a1", "card-a2"]
      }
    }
  };

  assert.deepEqual(
    buildLessonNavigationState(projectDocument, progressState, {
      courseKey: "course-a",
      moduleKey: "module-a",
      lessonKey: "lesson-a"
    }),
    {
      selection: {
        courseKey: "course-a",
        moduleKey: "module-a",
        lessonKey: "lesson-a",
        microsequenceKey: "micro-b",
        cardKey: "card-b1",
        cardIndex: 0
      },
      view: "lesson"
    }
  );
});

test("buildNavigationViewState limpa overlays e força modo play", () => {
  assert.deepEqual(
    buildNavigationViewState({
      selection: {
        courseKey: "course-a",
        moduleKey: "module-a",
        lessonKey: "lesson-a",
        microsequenceKey: "micro-a",
        cardKey: "card-a1",
        cardIndex: 0
      },
      view: "lesson"
    }),
    {
      selection: {
        courseKey: "course-a",
        moduleKey: "module-a",
        lessonKey: "lesson-a",
        microsequenceKey: "micro-a",
        cardKey: "card-a1",
        cardIndex: 0
      },
      view: "lesson",
      cardCommentOpen: false,
      entityEditor: null,
      microsequenceMode: "play"
    }
  );
});
