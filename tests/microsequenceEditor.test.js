import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { validateIntentV1Document } from "../src/contract/validateIntentV1.js";
import {
  createCardInMicrosequence,
  createEditorSession,
  createMicrosequence,
  moveCardWithinMicrosequence,
  updateCourse,
  updateCardInMicrosequence,
  updateLesson,
  updateModule,
  updateMicrosequence
} from "../src/editor/microsequenceEditor.js";
import { createKeyValueMemoryStore } from "../src/storage/createKeyValueMemoryStore.js";
import { createProjectStorage } from "../src/storage/createProjectStorage.js";

function readJson(path) {
  return JSON.parse(fs.readFileSync(path, "utf8"));
}

function readNormalizedProject(path) {
  const result = validateIntentV1Document(readJson(path));
  assert.equal(result.ok, true);
  return result.value;
}

test("cria microssequência nova dentro da lição sem gerar card solto", () => {
  const document = readNormalizedProject("./docs/examples/aralearn-intent-v1.valid.json");

  const nextDocument = createMicrosequence(document, {
    moduleKey: "module-fundamentos",
    lessonKey: "lesson-primeira-licao",
    title: "Nova microssequência",
    objective: "Organizar um novo bloco didático"
  });

  const lesson = nextDocument.course.modules[0].lessons[0];
  assert.equal(lesson.microsequences.length, 2);
  assert.equal(lesson.microsequences[1].title, "Nova microssequência");
  assert.equal(lesson.microsequences[1].cards.length, 1);
  assert.equal(lesson.microsequences[1].cards[0].intent, "text");
  assert.equal(lesson.microsequences[1].cards[0].title, "Novo card");
  assert.equal(lesson.microsequences[1].cards[0].data.blocks[0].kind, "heading");
  assert.equal(lesson.microsequences[1].cards[0].data.blocks[1].kind, "popup");
});

test("edita título e objetivo da microssequência", () => {
  const document = readNormalizedProject("./docs/examples/aralearn-intent-v1.valid.json");

  const nextDocument = updateMicrosequence(document, {
    moduleKey: "module-fundamentos",
    lessonKey: "lesson-primeira-licao",
    microsequenceKey: "microsequence-apresentar-o-primeiro-conceito",
    title: "Microssequência revisada",
    objective: "Apresentar o conceito com outro foco"
  });

  const microsequence = nextDocument.course.modules[0].lessons[0].microsequences[0];
  assert.equal(microsequence.title, "Microssequência revisada");
  assert.equal(microsequence.objective, "Apresentar o conceito com outro foco");
});

test("edita curso, módulo e lição sem quebrar o contrato", () => {
  const document = readNormalizedProject("./docs/examples/aralearn-intent-v1.valid.json");

  const nextCourse = updateCourse(document, {
    courseKey: "course-curso-de-exemplo",
    title: "Curso revisado",
    description: "Descrição revisada"
  });
  assert.equal(nextCourse.course.title, "Curso revisado");
  assert.equal(nextCourse.course.description, "Descrição revisada");

  const nextModule = updateModule(nextCourse, {
    courseKey: "course-curso-de-exemplo",
    moduleKey: "module-fundamentos",
    title: "Módulo revisado",
    description: "Descrição do módulo"
  });
  assert.equal(nextModule.course.modules[0].title, "Módulo revisado");
  assert.equal(nextModule.course.modules[0].description, "Descrição do módulo");

  const nextLesson = updateLesson(nextModule, {
    moduleKey: "module-fundamentos",
    lessonKey: "lesson-primeira-licao",
    title: "Lição revisada"
  });
  assert.equal(nextLesson.course.modules[0].lessons[0].title, "Lição revisada");
});

test("cria card apenas dentro de microssequência existente", () => {
  const document = readNormalizedProject("./docs/examples/aralearn-intent-v1.valid.json");

  const nextDocument = createCardInMicrosequence(document, {
    moduleKey: "module-fundamentos",
    lessonKey: "lesson-primeira-licao",
    microsequenceKey: "microsequence-apresentar-o-primeiro-conceito",
    title: "Novo card",
    intent: "ask",
    data: {
      prompt: "Pergunta de teste"
    }
  });

  const cards = nextDocument.course.modules[0].lessons[0].microsequences[0].cards;
  assert.equal(cards.length, 2);
  assert.equal(cards[1].intent, "ask");
  assert.equal(cards[1].data.prompt, "Pergunta de teste");
  assert.equal(cards[1].data.blocks[0].kind, "heading");
  assert.equal(cards[1].data.blocks[1].kind, "popup");
});

test("move card dentro da mesma microssequência", () => {
  const document = createCardInMicrosequence(readNormalizedProject("./docs/examples/aralearn-intent-v1.valid.json"), {
    moduleKey: "module-fundamentos",
    lessonKey: "lesson-primeira-licao",
    microsequenceKey: "microsequence-apresentar-o-primeiro-conceito",
    title: "Segundo card",
    intent: "text",
    data: {
      text: "Outro texto"
    }
  });

  const movedDocument = moveCardWithinMicrosequence(document, {
    moduleKey: "module-fundamentos",
    lessonKey: "lesson-primeira-licao",
    microsequenceKey: "microsequence-apresentar-o-primeiro-conceito",
    cardKey: "card-segundo-card",
    toIndex: 0
  });

  const cards = movedDocument.course.modules[0].lessons[0].microsequences[0].cards;
  assert.equal(cards[0].key, "card-segundo-card");
});

test("atualiza card existente sem quebrar o contrato", () => {
  const document = readNormalizedProject("./docs/examples/aralearn-intent-v1.valid.json");

  const nextDocument = updateCardInMicrosequence(document, {
    moduleKey: "module-fundamentos",
    lessonKey: "lesson-primeira-licao",
    microsequenceKey: "microsequence-apresentar-o-primeiro-conceito",
    cardKey: "card-conceito-inicial",
    title: "Card revisado",
    data: {
      text: "Texto revisto"
    }
  });

  const card = nextDocument.course.modules[0].lessons[0].microsequences[0].cards[0];
  assert.equal(card.title, "Card revisado");
  assert.equal(card.data.text, "Texto revisto");
});

test("sessão de edição persiste alterações simples no storage do projeto", () => {
  const store = createKeyValueMemoryStore();
  const projectStorage = createProjectStorage(store);
  projectStorage.saveProject(readJson("./docs/examples/aralearn-intent-v1.valid.json"));

  const session = createEditorSession(projectStorage);
  session.createCard({
    moduleKey: "module-fundamentos",
    lessonKey: "lesson-primeira-licao",
    microsequenceKey: "microsequence-apresentar-o-primeiro-conceito",
    title: "Card persistido",
    intent: "text",
    data: {
      text: "Persistido"
    }
  });

  const loadedProject = projectStorage.loadProject();
  const cards = loadedProject.course.modules[0].lessons[0].microsequences[0].cards;
  assert.equal(cards.length, 2);
  assert.equal(cards[1].title, "Card persistido");
});
