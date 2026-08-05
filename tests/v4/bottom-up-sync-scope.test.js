import test from "node:test";
import assert from "node:assert/strict";

import {
  courseDocumentChanged,
  resolveBottomUpAffectedMicrosequenceIds
} from "../../src/ui/lessonEditorApp.js";

function lesson(count = 65) {
  return {
    id: "lesson-a",
    microsequences: Array.from({ length: count }, (_, index) => ({
      id: `micro-${index}`,
      title: `Microssequência ${index}`,
      cards: [{ id: `card-${index}`, text: `Conteúdo ${index}` }]
    }))
  };
}

test("remoção no início não enfileira todos os irmãos que apenas mudaram de posição", () => {
  const before = lesson();
  const after = structuredClone(before);
  after.microsequences.shift();

  assert.deepEqual(resolveBottomUpAffectedMicrosequenceIds({
    change: {
      targetIds: ["micro-0"],
      createdIds: [],
      destinationId: "lesson-a"
    }
  }, before, after), ["micro-0"]);
});

test("movimento sincroniza somente o alvo declarado, embora desloque irmãos", () => {
  const before = lesson();
  const after = structuredClone(before);
  const [moved] = after.microsequences.splice(60, 1);
  after.microsequences.splice(2, 0, moved);

  assert.deepEqual(resolveBottomUpAffectedMicrosequenceIds({
    change: {
      targetIds: ["micro-60"],
      createdIds: [],
      destinationId: "lesson-a"
    }
  }, before, after), ["micro-60"]);
});

test("alteração de cards sincroniza a microssequência de destino", () => {
  const before = lesson(2);
  const after = structuredClone(before);
  after.microsequences[1].cards[0].text = "Conteúdo corrigido.";

  assert.deepEqual(resolveBottomUpAffectedMicrosequenceIds({
    change: {
      targetIds: ["card-1"],
      createdIds: [],
      destinationId: "micro-1"
    }
  }, before, after), ["micro-1"]);
});

test("substituição remota distingue o curso alterado dos cursos intactos", () => {
  const previous = {
    courses: [
      { id: "course-a", title: "Curso A", modules: [] },
      { id: "course-b", title: "Curso B", modules: [] }
    ]
  };
  const next = structuredClone(previous);
  next.courses[0].title = "Curso A remoto";

  assert.equal(courseDocumentChanged(previous, next, "course-a"), true);
  assert.equal(courseDocumentChanged(previous, next, "course-b"), false);
  assert.equal(courseDocumentChanged(previous, structuredClone(previous), "course-a"), false);
});
