import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { validateContractDocument } from "../src/contract/validateContract.js";
import {
  createCardInMicrosequence,
  createCourse,
  createEditorSession,
  createMicrosequence,
  exportCourseDocument,
  importCourses,
  replaceMicrosequenceCards,
  updateCardInMicrosequence,
  updateMicrosequence
} from "../src/editor/contractEditor.js";
import { createKeyValueMemoryStore } from "../src/storage/createKeyValueMemoryStore.js";
import { createProjectStorage } from "../src/storage/createProjectStorage.js";

function readJson(path) {
  return JSON.parse(fs.readFileSync(path, "utf8"));
}

function readNormalizedProject(path) {
  const result = validateContractDocument(readJson(path));
  assert.equal(result.ok, true);
  return result.value;
}

test("cria microssequência nova no contrato principal com card inicial raso", () => {
  const document = readNormalizedProject("./docs/examples/aralearn-contract.renderable.json");

  const nextDocument = createMicrosequence(document, {
    courseKey: "course-curso-renderizavel",
    moduleKey: "module-modulo-experimental",
    lessonKey: "lesson-licao-experimental",
    title: "Nova sequência"
  });

  const microsequence = nextDocument.courses[0].modules[0].lessons[0].microsequences[1];
  assert.equal(microsequence.title, "Nova sequência");
  assert.equal(microsequence.cards[0].type, "text");
  assert.equal(microsequence.cards[0].text, "Descreva a ideia central desta microssequência.");
});

test("substitui os cards da microssequência por tipos explícitos do contrato principal", () => {
  const document = readNormalizedProject("./docs/examples/aralearn-contract.renderable.json");

  const nextDocument = replaceMicrosequenceCards(document, {
    courseKey: "course-curso-renderizavel",
    moduleKey: "module-modulo-experimental",
    lessonKey: "lesson-licao-experimental",
    microsequenceKey: "microsequence-modelo-cascata",
    title: "Vetores",
    tags: ["Álgebra linear", "Vetores"],
    cards: [
      {
        type: "text",
        title: "Intuição",
        text: "Vetores podem ser lidos como coleções ordenadas de valores."
      },
      {
        type: "choice",
        title: "Leitura",
        ask: "Qual estrutura agrupa cards?",
        answer: ["Microssequência"],
        wrong: ["Curso", "Módulo"]
      }
    ]
  });

  const microsequence = nextDocument.courses[0].modules[0].lessons[0].microsequences[0];
  assert.equal(microsequence.title, "Vetores");
  assert.deepEqual(microsequence.tags, ["Álgebra linear", "Vetores"]);
  assert.equal(microsequence.cards[1].type, "choice");
});

test("cria e edita card do contrato principal sem intent nem data", () => {
  const document = readNormalizedProject("./docs/examples/aralearn-contract.renderable.json");

  const created = createCardInMicrosequence(document, {
    courseKey: "course-curso-renderizavel",
    moduleKey: "module-modulo-experimental",
    lessonKey: "lesson-licao-experimental",
    microsequenceKey: "microsequence-modelo-cascata",
    type: "editor",
    title: "Código",
    language: "json",
    code: "{ \"ok\": true }"
  });

  const updated = updateCardInMicrosequence(created, {
    courseKey: "course-curso-renderizavel",
    moduleKey: "module-modulo-experimental",
    lessonKey: "lesson-licao-experimental",
    microsequenceKey: "microsequence-modelo-cascata",
    cardKey: created.courses[0].modules[0].lessons[0].microsequences[0].cards.at(-1).key,
    title: "Código revisto",
    code: "{ \"ok\": false }"
  });

  const card = updated.courses[0].modules[0].lessons[0].microsequences[0].cards.at(-1);
  assert.equal(card.type, "editor");
  assert.equal(card.title, "Código revisto");
  assert.equal(card.code, '{ "ok": false }');
  assert.equal("intent" in card, false);
  assert.equal("data" in card, false);
});

test("edita card flow preservando estrutura pública composta", () => {
  const document = readNormalizedProject("./docs/examples/aralearn-contract.renderable.json");

  const updated = updateCardInMicrosequence(document, {
    courseKey: "course-curso-renderizavel",
    moduleKey: "module-modulo-experimental",
    lessonKey: "lesson-licao-experimental",
    microsequenceKey: "microsequence-modelo-cascata",
    cardKey: "card-fluxo-basico",
    title: "Fluxo revisto",
    flow: [
      { start: "Início" },
      {
        if: "x > 0",
        then: [{ process: "Seguir" }],
        else: [{ output: "Parar" }]
      },
      { end: "Fim" }
    ]
  });

  const card = updated.courses[0].modules[0].lessons[0].microsequences[0].cards[5];
  assert.equal(card.type, "flow");
  assert.equal(card.title, "Fluxo revisto");
  assert.equal(card.flow[1].if, "x > 0");
  assert.deepEqual(card.flow[1].then.map((item) => item.process), ["Seguir"]);
});

test("sessão principal persiste alterações no storage dedicado", () => {
  const store = createKeyValueMemoryStore();
  const projectStorage = createProjectStorage(store);
  projectStorage.saveProject(readJson("./docs/examples/aralearn-contract.renderable.json"));

  const session = createEditorSession(projectStorage);
  session.updateMicrosequence({
    courseKey: "course-curso-renderizavel",
    moduleKey: "module-modulo-experimental",
    lessonKey: "lesson-licao-experimental",
    microsequenceKey: "microsequence-modelo-cascata",
    title: "Modelo cascata revisado"
  });

  const loaded = projectStorage.loadProject();
  assert.equal(loaded.courses[0].modules[0].lessons[0].microsequences[0].title, "Modelo cascata revisado");
});

test("cria curso novo já com módulo, lição, microssequência e card iniciais", () => {
  const document = readNormalizedProject("./docs/examples/aralearn-contract.renderable.json");

  const nextDocument = createCourse(document, {
    title: "Curso importado"
  });

  const course = nextDocument.courses.at(-1);
  assert.equal(course.title, "Curso importado");
  assert.equal(course.modules.length, 1);
  assert.equal(course.modules[0].lessons.length, 1);
  assert.equal(course.modules[0].lessons[0].microsequences.length, 1);
  assert.equal(course.modules[0].lessons[0].microsequences[0].cards.length, 1);
});

test("importa cursos sem sobrescrever keys existentes e exporta curso isolado", () => {
  const baseDocument = readNormalizedProject("./docs/examples/aralearn-contract.renderable.json");
  const importedDocument = {
    contract: "aralearn.contract",
    courses: [structuredClone(baseDocument.courses[0])]
  };

  const mergedDocument = importCourses(baseDocument, {
    document: importedDocument
  });

  assert.equal(mergedDocument.courses.length, 2);
  assert.notEqual(mergedDocument.courses[0].key, mergedDocument.courses[1].key);

  const exportedDocument = exportCourseDocument(mergedDocument, {
    courseKey: mergedDocument.courses[1].key
  });

  assert.equal(exportedDocument.contract, "aralearn.contract");
  assert.equal(exportedDocument.courses.length, 1);
  assert.equal(exportedDocument.courses[0].title, mergedDocument.courses[1].title);
});
