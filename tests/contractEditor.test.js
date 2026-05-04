import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { validateContractDocument } from "../src/contract/validateContract.js";
import {
  createCardInMicrosequence,
  createEditorSession,
  createMicrosequence,
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
