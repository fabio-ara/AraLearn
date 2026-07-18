import test from "node:test";
import assert from "node:assert/strict";

import {
  buildLessonProgressKey,
  createEmptyProgressDocument,
  getLessonProgressCursor,
  parseProgressDocument,
  readLessonProgressEntry,
  removeLessonProgressEntries,
  serializeProgressDocument,
  validateProgressDocument,
  writeLessonProgressEntry
} from "../../src/storage/progressStore.js";

const REFERENCE = Object.freeze({
  courseKey: "course-a",
  moduleKey: "module-a",
  lessonKey: "lesson-a"
});

test("o parser cria progresso vazio somente quando o estado está ausente", () => {
  assert.deepEqual(parseProgressDocument(null), createEmptyProgressDocument());
  assert.throws(() => parseProgressDocument(undefined), /JSON não vazio ou null/u);
  assert.throws(() => parseProgressDocument(""), /JSON não vazio ou null/u);
  assert.throws(() => parseProgressDocument("{"), /JSON malformado/u);
});

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
      lessons: {
        "::lesson-a": { cursor: 0, completedCardKeys: [] }
      }
    }),
    /chave de lição inválida/u
  );
  assert.throws(
    () => validateProgressDocument({
      version: 1,
      lessons: {
        "course-a::module-a::lesson-a": { cursor: "0", completedCardKeys: [] }
      }
    }),
    /cursor deve ser um inteiro não negativo/u
  );
});

test("as operações de progresso exigem referência completa e estruturada", () => {
  assert.equal(buildLessonProgressKey(REFERENCE), "course-a::module-a::lesson-a");
  assert.throws(() => buildLessonProgressKey("lesson-a"), /reference deve ser um objeto/u);
  assert.throws(
    () => buildLessonProgressKey({ lessonKey: "lesson-a" }),
    /reference\.courseKey deve ser uma string não vazia/u
  );
});

test("gravação, leitura, serialização e remoção preservam o contrato estrito", () => {
  const cards = [{ id: "card-a" }, { id: "card-b" }, { id: "card-c" }];
  const written = writeLessonProgressEntry(createEmptyProgressDocument(), REFERENCE, cards, 1);
  const entry = readLessonProgressEntry(written, REFERENCE);

  assert.equal(entry.cursor, 1);
  assert.deepEqual(entry.completedCardKeys, ["card-a", "card-b"]);
  assert.ok(Number.isFinite(Date.parse(entry.updatedAt)));
  assert.equal(getLessonProgressCursor(written, REFERENCE, 1), 0);

  const parsed = parseProgressDocument(serializeProgressDocument(written));
  assert.deepEqual(parsed, written);
  assert.deepEqual(removeLessonProgressEntries(parsed, [REFERENCE]), createEmptyProgressDocument());
});
