import test from "node:test";
import assert from "node:assert/strict";

import {
  buildLessonProgressKey,
  getLessonProgressCursor,
  normalizeProgressDocument,
  readLessonProgressEntry,
  removeLessonProgressEntries,
  writeLessonProgressEntry
} from "../src/storage/progressStore.js";

test("gera chave de progresso por caminho completo da lição", () => {
  assert.equal(
    buildLessonProgressKey({
      courseKey: "curso-a",
      moduleKey: "mod-1",
      lessonKey: "licao-2"
    }),
    "curso-a::mod-1::licao-2"
  );
});

test("le progresso por caminho e mantem fallback para chave legada da lição", () => {
  const progress = normalizeProgressDocument({
    version: 1,
    lessons: {
      "curso-a::mod-1::licao-2": { cursor: 2, completedCardKeys: ["card-2"] },
      "licao-legada": { cursor: 1, completedCardKeys: ["card-legacy"] }
    }
  });

  assert.deepEqual(
    readLessonProgressEntry(progress, {
      courseKey: "curso-a",
      moduleKey: "mod-1",
      lessonKey: "licao-2"
    }),
    { cursor: 2, completedCardKeys: ["card-2"] }
  );

  assert.deepEqual(
    readLessonProgressEntry(progress, {
      courseKey: "curso-b",
      moduleKey: "mod-9",
      lessonKey: "licao-legada"
    }),
    { cursor: 1, completedCardKeys: ["card-legacy"] }
  );
});

test("remove apenas o progresso das lições informadas", () => {
  const progress = normalizeProgressDocument({
    version: 1,
    lessons: {
      "course-a::module-a::lesson-a": { cursor: 1, completedCardKeys: ["card-1"] },
      "lesson-a": { cursor: 1, completedCardKeys: ["card-legacy"] },
      "course-a::module-a::lesson-b": { cursor: 2, completedCardKeys: ["card-2"] },
      "lesson-c": { cursor: 3, completedCardKeys: ["card-3"] }
    }
  });

  const nextProgress = removeLessonProgressEntries(progress, [
    {
      courseKey: "course-a",
      moduleKey: "module-a",
      lessonKey: "lesson-a"
    },
    {
      courseKey: "course-a",
      moduleKey: "module-a",
      lessonKey: "lesson-b"
    },
    "lesson-c"
  ]);

  assert.deepEqual(Object.keys(nextProgress.lessons), []);
});

test("grava progresso cumulativo preservando o card mais avançado", () => {
  const cards = [{ key: "card-1" }, { key: "card-2" }, { key: "card-3" }, { key: "card-4" }];
  const reference = {
    courseKey: "course-a",
    moduleKey: "module-a",
    lessonKey: "lesson-a"
  };

  const afterAdvance = writeLessonProgressEntry(null, reference, cards, 2);
  const afterBacktrack = writeLessonProgressEntry(afterAdvance, reference, cards, 1);

  assert.equal(getLessonProgressCursor(afterBacktrack, reference, cards.length), 2);
  assert.deepEqual(readLessonProgressEntry(afterBacktrack, reference)?.completedCardKeys, ["card-1", "card-2", "card-3"]);
});
