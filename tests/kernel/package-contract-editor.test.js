import assert from "node:assert/strict";
import test from "node:test";

import {
  createCardInMicrosequence,
  createCourse,
  createLesson,
  createMicrosequence,
  createModule,
  deleteCardInMicrosequence,
  exportMicrosequenceDocument,
  moveCardWithinMicrosequence,
  updateCardInMicrosequence
} from "../../src/editor/contractEditor.js";
import { createEmptyProjectDocument } from "../../src/domain/aralearnProject.js";

const path = {
  courseKey: "course-redes",
  moduleKey: "module-fundamentos",
  lessonKey: "lesson-protocolos",
  microsequenceKey: "microsequence-primeiro-contato"
};

function plannedDocument() {
  let document = createCourse(createEmptyProjectDocument(), {
    id: path.courseKey,
    title: "Redes",
    goal: "Aprender redes."
  });
  document = createModule(document, {
    ...path,
    id: path.moduleKey,
    title: "Fundamentos",
    goal: "Situar a comunicação."
  });
  document = createLesson(document, {
    ...path,
    id: path.lessonKey,
    title: "Protocolos",
    goal: "Entender protocolos."
  });
  return createMicrosequence(document, {
    ...path,
    id: path.microsequenceKey,
    title: "Primeiro contato",
    goal: "Construir um referente concreto.",
    role: "explain"
  });
}

function paragraphCard(id, text) {
  return {
    id,
    position: 1,
    title: "Explicação",
    role: "theory",
    content: [{
      id: "conteudo",
      package: "aralearn.resource.paragraph",
      version: "1.0.0",
      data: { text }
    }],
    response: null,
    feedback: [],
    topics: [],
    sources: []
  };
}

function cards(document) {
  return document.courses[0].modules[0].lessons[0].microsequences[0].cards;
}

test("editor cria, atualiza, move, exclui e exporta cards somente por packages", () => {
  let document = plannedDocument();
  document = createCardInMicrosequence(document, {
    ...path,
    card: paragraphCard("card-a", "Primeiro texto.")
  });
  document = createCardInMicrosequence(document, {
    ...path,
    card: paragraphCard("card-b", "Segundo texto.")
  });

  document = updateCardInMicrosequence(document, {
    ...path,
    cardKey: "card-a",
    card: paragraphCard("card-a", "Texto atualizado.")
  });
  document = moveCardWithinMicrosequence(document, {
    ...path,
    cardKey: "card-b",
    toIndex: 0
  });

  assert.deepEqual(cards(document).map(({ id, position }) => ({ id, position })), [
    { id: "card-b", position: 1 },
    { id: "card-a", position: 2 }
  ]);
  assert.equal(cards(document)[1].content[0].data.text, "Texto atualizado.");
  assert.equal(Object.hasOwn(cards(document)[0], "resource"), false);
  assert.equal(Object.hasOwn(cards(document)[0], "kind"), false);

  const slice = exportMicrosequenceDocument(document, path);
  assert.equal(slice.contract, "aralearn.library.v1");
  assert.equal(Object.hasOwn(slice, "version"), false);
  assert.equal(Object.hasOwn(slice, "kind"), false);

  document = deleteCardInMicrosequence(document, { ...path, cardKey: "card-b" });
  assert.deepEqual(cards(document).map(({ id }) => id), ["card-a"]);
});

test("editor gera starter a partir do contrato do package solicitado", () => {
  const document = createCardInMicrosequence(plannedDocument(), {
    ...path,
    packageId: "paragraph"
  });
  assert.equal(cards(document)[0].content[0].package, "aralearn.resource.paragraph");
  assert.equal(Object.hasOwn(cards(document)[0], "status"), false);
});
