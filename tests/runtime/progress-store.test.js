import test from "node:test";
import assert from "node:assert/strict";

import {
  buildLessonProgressPath,
  createEmptyProgressDocument,
  readLessonProgressEntry,
  validateProgressDocument
} from "../../src/storage/progressStore.js";

const REFERENCE = Object.freeze({
  courseId: "course-a",
  moduleId: "module-a",
  lessonId: "lesson-a"
});

function progressEntry(overrides = {}) {
  return {
    cursorStudyUnitId: "unit-c",
    completedStudyUnitIds: ["unit-a", "unit-c"],
    updatedAt: "2026-08-17T12:00:00.000Z",
    ...overrides
  };
}

test("o contrato de progresso rejeita documentos parciais ou adulterados", () => {
  assert.throws(
    () => validateProgressDocument({ lessons: {} }),
    /\$\.version deve ser 1/u
  );
  assert.throws(
    () => validateProgressDocument({ version: 1, lessons: [], extra: true }),
    /\$\.extra não pertence ao contrato/u
  );
  assert.throws(
    () => validateProgressDocument({
      version: 1,
      lessons: { "::lesson-a": progressEntry() }
    }),
    /caminho de Lição inválido/u
  );
  assert.throws(
    () => validateProgressDocument({
      version: 1,
      lessons: {
        "course-a::module-a::lesson-a": progressEntry({ cursor: 0 })
      }
    }),
    /cursor não pertence ao contrato/u
  );
});

test("as operações de progresso exigem referência canônica completa", () => {
  assert.equal(buildLessonProgressPath(REFERENCE), "course-a::module-a::lesson-a");
  assert.throws(() => buildLessonProgressPath("lesson-a"), /reference deve ser um objeto/u);
  assert.throws(
    () => buildLessonProgressPath({ lessonId: "lesson-a" }),
    /reference\.courseId deve ser uma string não vazia/u
  );
});

test("leitura preserva conclusões não contíguas por identidade de Unidade de estudo", () => {
  const document = validateProgressDocument({
    version: 1,
    lessons: {
      "course-a::module-a::lesson-a": progressEntry()
    }
  });

  assert.deepEqual(readLessonProgressEntry(document, REFERENCE), progressEntry());
  assert.equal(readLessonProgressEntry(document, {
    ...REFERENCE,
    lessonId: "lesson-b"
  }), null);
});

test("a entrada exige cursor concluído, identidades únicas e ao menos uma conclusão", () => {
  const document = (entry) => ({
    version: 1,
    lessons: { "course-a::module-a::lesson-a": entry }
  });
  assert.throws(
    () => validateProgressDocument(document(progressEntry({
      cursorStudyUnitId: "unit-b"
    }))),
    /deve identificar uma Unidade de estudo concluída/u
  );
  assert.throws(
    () => validateProgressDocument(document(progressEntry({
      completedStudyUnitIds: ["unit-a", "unit-a"]
    }))),
    /não pode conter ids duplicados/u
  );
  assert.throws(
    () => validateProgressDocument(document(progressEntry({
      cursorStudyUnitId: "unit-a",
      completedStudyUnitIds: []
    }))),
    /não pode ficar vazia/u
  );
  assert.deepEqual(createEmptyProgressDocument(), { version: 1, lessons: {} });
});
