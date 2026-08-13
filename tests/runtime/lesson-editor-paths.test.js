import test from "node:test";
import assert from "node:assert/strict";

import {
  collectLessonCards,
  findLessonCardEntryIndex,
  findSelectedCard
} from "../../src/ui/lessonEditorPaths.js";
import {
  buildStudyModuleNavigationState,
  resolveExactCardSelection
} from "../../src/ui/lessonEditorNavigation.js";
import {
  createEmptyProgressDocument,
  writeLessonProgressEntry
} from "../../src/storage/progressStore.js";

function buildMicrosequence(id, cards, status = "ready") {
  return {
    id,
    title: id,
    status,
    cards
  };
}

test("findSelectedCard prioriza o indice quando ha ids duplicados", () => {
  const microsequence = buildMicrosequence("micro-1", [
    { id: "card-repetido", position: 1, resource: "paragraph", kind: "theory", exercise: "none", title: "A", text: "Primeiro", after: "" },
    { id: "card-repetido", position: 2, resource: "paragraph", kind: "theory", exercise: "none", title: "B", text: "Segundo", after: "" }
  ]);

  const selected = findSelectedCard(microsequence, {
    microsequenceKey: "micro-1",
    cardKey: "card-repetido",
    cardIndex: 1
  });

  assert.equal(selected?.title, "B");
});

test("findLessonCardEntryIndex usa microsequencia e indice antes de cardKey ambiguo", () => {
  const lesson = {
    microsequences: [
      buildMicrosequence("micro-1", [
        { id: "card-repetido", position: 1, resource: "paragraph", kind: "theory", exercise: "none", title: "A1", text: "Primeiro", after: "" },
        { id: "card-repetido", position: 2, resource: "paragraph", kind: "theory", exercise: "none", title: "A2", text: "Segundo", after: "" }
      ])
    ]
  };

  const lessonCards = collectLessonCards(lesson);
  const index = findLessonCardEntryIndex(lessonCards, {
    microsequenceKey: "micro-1",
    cardKey: "card-repetido",
    cardIndex: 1
  });

  assert.equal(index, 1);
  assert.equal(lessonCards[index]?.card?.title, "A2");
});

test("atalho contextual só resolve quando todo o caminho ainda aponta para o mesmo card", () => {
  const project = {
    courses: [{
      id: "course",
      modules: [{
        id: "module",
        lessons: [{
          id: "lesson",
          microsequences: [buildMicrosequence("micro", [{ id: "card", title: "Card" }])]
        }]
      }]
    }]
  };

  assert.deepEqual(
    resolveExactCardSelection(project, ["course", "module", "lesson", "micro", "card"]),
    {
      courseKey: "course",
      moduleKey: "module",
      lessonKey: "lesson",
      microsequenceKey: "micro",
      cardKey: "card",
      cardIndex: 0
    }
  );
  assert.equal(
    resolveExactCardSelection(project, ["course", "module", "lesson", "micro", "removido"]),
    null
  );
  assert.equal(resolveExactCardSelection(project, ["course", "card"]), null);
});

function buildNavigationProject(lessons) {
  return {
    courses: [{
      id: "course",
      modules: [{ id: "module", lessons }]
    }]
  };
}

test("módulo com uma única lição entra diretamente no primeiro card pendente", () => {
  const cards = [{ id: "card-a" }, { id: "card-b" }, { id: "card-c" }];
  const lesson = {
    id: "lesson",
    microsequences: [buildMicrosequence("micro", cards)]
  };
  const project = buildNavigationProject([lesson]);
  const progress = writeLessonProgressEntry(
    createEmptyProgressDocument(),
    { courseKey: "course", moduleKey: "module", lessonKey: "lesson" },
    cards,
    0
  );

  assert.deepEqual(
    buildStudyModuleNavigationState(project, progress, {
      courseKey: "course",
      moduleKey: "module"
    }),
    {
      selection: {
        courseKey: "course",
        moduleKey: "module",
        lessonKey: "lesson",
        microsequenceKey: "micro",
        cardKey: "card-b",
        cardIndex: 1
      },
      view: "microsequence"
    }
  );
});

test("módulo com várias lições preserva a tela de lições", () => {
  const project = buildNavigationProject([
    { id: "lesson-a", microsequences: [buildMicrosequence("micro-a", [{ id: "card-a" }])] },
    { id: "lesson-b", microsequences: [buildMicrosequence("micro-b", [{ id: "card-b" }])] }
  ]);

  const navigation = buildStudyModuleNavigationState(
    project,
    createEmptyProgressDocument(),
    { courseKey: "course", moduleKey: "module" }
  );

  assert.equal(navigation.view, "module");
  assert.equal(navigation.selection.lessonKey, "lesson-a");
});

test("módulo de lição ainda planejada pula somente a camada redundante", () => {
  const project = buildNavigationProject([{
    id: "lesson",
    microsequences: [buildMicrosequence("micro-planned", [], "planned")]
  }]);

  const navigation = buildStudyModuleNavigationState(
    project,
    createEmptyProgressDocument(),
    { courseKey: "course", moduleKey: "module" }
  );

  assert.equal(navigation.view, "lesson");
  assert.equal(navigation.selection.lessonKey, "lesson");
  assert.equal(navigation.selection.cardKey, null);
});
