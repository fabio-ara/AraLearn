import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { validateContractDocument } from "../src/contract/validateContract.js";
import {
  createCardInMicrosequence,
  createCourse,
  createEditorSession,
  createLesson,
  createMicrosequence,
  createModule,
  deleteCardInMicrosequence,
  deleteLesson,
  exportCourseDocument,
  exportLessonDocument,
  exportMicrosequenceDocument,
  exportModuleDocument,
  importCourses,
  importLessons,
  importMicrosequences,
  importModules,
  moveCardWithinMicrosequence,
  moveCourse,
  moveLesson,
  moveMicrosequence,
  moveModule,
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

test("cria microssequência nova no contrato principal como rascunho vazio", () => {
  const document = readNormalizedProject("./docs/examples/aralearn-contract.renderable.json");

  const nextDocument = createMicrosequence(document, {
    courseKey: "course-curso-renderizavel",
    moduleKey: "module-modulo-experimental",
    lessonKey: "lesson-licao-experimental",
    title: "Nova sequência"
  });

  const microsequence = nextDocument.courses[0].modules[0].lessons[0].microsequences[1];
  assert.equal(microsequence.title, "Nova sequência");
  assert.equal(microsequence.status, "draft");
  assert.deepEqual(microsequence.cards, []);
});

test("preserva sourceGuide derivado de sourceGuideStructured em curso, módulo e lição", () => {
  let document = readNormalizedProject("./docs/examples/aralearn-contract.renderable.json");

  document = createCourse(document, {
    title: "Curso com guia",
    description: "Descrição curta do curso",
    sourceGuideStructured: {
      audience: "Aluno iniciante.",
      globalScope: "Objetivo do curso.",
      sharedNotation: "Usar `p` e `q` com destaque."
    }
  });

  const course = document.courses.at(-1);
  document = createModule(document, {
    courseKey: course.key,
    title: "Módulo com guia",
    description: "Descrição curta do módulo",
    sourceGuideStructured: {
      moduleScope: "Fonte-guia do módulo.",
      lessonProgression: "Ir do caso simples ao composto."
    }
  });

  const moduleValue = document.courses.at(-1).modules.at(-1);
  document = createLesson(document, {
    courseKey: course.key,
    moduleKey: moduleValue.key,
    title: "Lição com guia",
    description: "Descrição curta da lição",
    sourceGuideStructured: {
      lessonGoal: "Fonte-guia da lição.",
      commonErrors: "Trocar a ordem dos conectivos."
    }
  });

  const lesson = document.courses.at(-1).modules.at(-1).lessons.at(-1);
  const validation = validateContractDocument(document);
  assert.equal(validation.ok, true);
  assert.match(validation.value.courses.at(-1).sourceGuide, /Objetivo do curso\./);
  assert.match(validation.value.courses.at(-1).modules.at(-1).sourceGuide, /Fonte-guia do módulo\./);
  assert.match(validation.value.courses.at(-1).modules.at(-1).lessons.at(-1).sourceGuide, /Fonte-guia da lição\./);
  assert.deepEqual(validation.value.courses.at(-1).modules.at(-1).lessons.at(-1).resourceTags, [
    "paragraph",
    "block_gap_fill",
    "multiple_choice"
  ]);

  const exported = exportLessonDocument(document, {
    courseKey: course.key,
    moduleKey: moduleValue.key,
    lessonKey: lesson.key
  });
  assert.equal(exported.scope, "lesson");
  assert.equal(exported.courses[0].sourceGuide, undefined);
  assert.equal(exported.courses[0].modules[0].sourceGuide, undefined);
  assert.match(exported.courses[0].modules[0].lessons[0].sourceGuide, /Fonte-guia da lição\./);
});

test("rejeita sourceGuide textual puro na edição estrutural", () => {
  const document = readNormalizedProject("./docs/examples/aralearn-contract.renderable.json");

  assert.throws(
    () =>
      createCourse(document, {
        title: "Curso textual",
        sourceGuide: "Texto corrido legado."
      }),
    /sourceGuideStructured/
  );
});

test("preserva sourceGuideStructured e recompila o texto derivado", () => {
  let document = readNormalizedProject("./docs/examples/aralearn-contract.renderable.json");

  document = createCourse(document, {
    title: "Curso com guia estruturada",
    sourceGuideStructured: {
      audience: "Iniciantes completos.",
      globalScope: "Entender o fluxo principal.",
      sharedNotation: "Usar comandos inline."
    }
  });

  const course = document.courses.at(-1);
  assert.deepEqual(course.sourceGuideStructured, {
    audience: "Iniciantes completos.",
    globalScope: "Entender o fluxo principal.",
    sharedNotation: "Usar comandos inline."
  });
  assert.match(course.sourceGuide, /Público e ponto de entrada: Iniciantes completos\./);
  assert.match(course.sourceGuide, /Escopo do curso: Entender o fluxo principal\./);
  assert.match(course.sourceGuide, /Convenções gerais: Usar comandos inline\./);

  const exported = exportCourseDocument(document, {
    courseKey: course.key
  });
  assert.deepEqual(exported.courses[0].sourceGuideStructured, course.sourceGuideStructured);
  assert.equal(exported.courses[0].sourceGuide, course.sourceGuide);
});

test("cria microssequência rascunho sem cards", () => {
  const document = readNormalizedProject("./docs/examples/aralearn-contract.renderable.json");

  const nextDocument = createMicrosequence(document, {
    courseKey: "course-curso-renderizavel",
    moduleKey: "module-modulo-experimental",
    lessonKey: "lesson-licao-experimental",
    title: "Soma de matrizes",
    status: "draft",
    cards: []
  });

  const microsequence = nextDocument.courses[0].modules[0].lessons[0].microsequences[1];
  assert.equal(microsequence.title, "Soma de matrizes");
  assert.equal(microsequence.status, "draft");
  assert.deepEqual(microsequence.cards, []);
});

test("substitui os cards da microssequência por intenções semânticas do contrato principal", () => {
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
        title: "Intuição",
        say: "Vetores podem ser lidos como coleções ordenadas de valores."
      },
      {
        title: "Leitura",
        ask: "Qual estrutura agrupa cards?",
        answer: "Microssequência",
        wrong: ["Curso", "Módulo"]
      }
    ]
  });

  const microsequence = nextDocument.courses[0].modules[0].lessons[0].microsequences[0];
  assert.equal(microsequence.title, "Vetores");
  assert.equal(microsequence.status, "ready");
  assert.deepEqual(microsequence.tags, ["Álgebra linear", "Vetores"]);
  assert.equal(microsequence.cards[1].ask, "Qual estrutura agrupa cards?");
});

test("cria e edita card do contrato principal sem intent nem data", () => {
  const document = readNormalizedProject("./docs/examples/aralearn-contract.renderable.json");

  const created = createCardInMicrosequence(document, {
    courseKey: "course-curso-renderizavel",
    moduleKey: "module-modulo-experimental",
    lessonKey: "lesson-licao-experimental",
    microsequenceKey: "microsequence-modelo-cascata",
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

test("reordena cursos sem perder a árvore interna", () => {
  const document = createCourse(readNormalizedProject("./docs/examples/aralearn-contract.renderable.json"), {
    title: "Curso extra"
  });

  const moved = moveCourse(document, {
    courseKey: document.courses[1].key,
    toIndex: 0
  });

  assert.equal(moved.courses[0].title, "Curso extra");
  assert.deepEqual(moved.courses[0].modules, []);
  assert.equal(moved.courses[1].modules[0].lessons[0].microsequences[0].cards.length, 7);
});

test("cria curso novo vazio, sem conteúdo inicial copiado", () => {
  const document = readNormalizedProject("./docs/examples/aralearn-contract.renderable.json");

  const nextDocument = createCourse(document, {
    title: "Curso importado"
  });

  const course = nextDocument.courses.at(-1);
  assert.equal(course.title, "Curso importado");
  assert.deepEqual(course.modules, []);
});

test("permite excluir o último card e manter a microssequência vazia", () => {
  const document = readNormalizedProject("./docs/examples/aralearn-contract.renderable.json");

  let nextDocument = createMicrosequence(document, {
    courseKey: "course-curso-renderizavel",
    moduleKey: "module-modulo-experimental",
    lessonKey: "lesson-licao-experimental",
    title: "Vazia para testar",
    status: "ready",
    cards: [{ title: "Único", say: "Conteúdo" }]
  });

  const microsequence = nextDocument.courses[0].modules[0].lessons[0].microsequences.at(-1);
  const cardKey = microsequence.cards[0].key;
  nextDocument = deleteCardInMicrosequence(nextDocument, {
    courseKey: "course-curso-renderizavel",
    moduleKey: "module-modulo-experimental",
    lessonKey: "lesson-licao-experimental",
    microsequenceKey: microsequence.key,
    cardKey
  });

  const updated = nextDocument.courses[0].modules[0].lessons[0].microsequences.at(-1);
  assert.deepEqual(updated.cards, []);
  assert.equal(updated.status, "draft");
});

test("reordena módulos, lições, microssequências e cards entre irmãos", () => {
  const baseDocument = readNormalizedProject("./docs/examples/aralearn-contract.renderable.json");
  const courseKey = "course-curso-renderizavel";
  const moduleKey = "module-modulo-experimental";
  const lessonKey = "lesson-licao-experimental";
  const microsequenceKey = "microsequence-modelo-cascata";

  let document = importModules(baseDocument, {
    courseKey,
    document: exportModuleDocument(baseDocument, { courseKey, moduleKey })
  });
  const extraModuleKey = document.courses[0].modules[1].key;
  document = moveModule(document, { courseKey, moduleKey: extraModuleKey, toIndex: 0 });
  assert.equal(document.courses[0].modules[0].key, extraModuleKey);

  document = importLessons(document, {
    courseKey,
    moduleKey,
    document: exportLessonDocument(baseDocument, { courseKey, moduleKey, lessonKey })
  });
  const extraLessonKey = document.courses[0].modules[1].lessons[1].key;
  document = moveLesson(document, { courseKey, moduleKey, lessonKey: extraLessonKey, toIndex: 0 });
  assert.equal(document.courses[0].modules[1].lessons[0].key, extraLessonKey);

  document = importMicrosequences(document, {
    courseKey,
    moduleKey,
    lessonKey,
    document: exportMicrosequenceDocument(baseDocument, { courseKey, moduleKey, lessonKey, microsequenceKey })
  });
  const movedMicrosequenceKey = document.courses[0].modules[1].lessons[1].microsequences[1].key;
  document = moveMicrosequence(document, {
    courseKey,
    moduleKey,
    lessonKey,
    microsequenceKey: movedMicrosequenceKey,
    targetCourseKey: courseKey,
    targetModuleKey: moduleKey,
    targetLessonKey: lessonKey,
    targetPosition: 0
  });
  assert.equal(document.courses[0].modules[1].lessons[1].microsequences[0].key, movedMicrosequenceKey);

  document = moveCardWithinMicrosequence(document, {
    courseKey,
    moduleKey,
    lessonKey,
    microsequenceKey,
    cardKey: "card-leitura-rapida",
    toIndex: 0
  });
  assert.equal(document.courses[0].modules[1].lessons[1].microsequences[1].cards[0].key, "card-leitura-rapida");
});

test("importa cursos sem sobrescrever keys existentes e exporta curso isolado", () => {
  const baseDocument = readNormalizedProject("./docs/examples/aralearn-contract.renderable.json");
  const importedDocument = {
    contract: "aralearn.contract",
    version: 1,
    kind: "project",
    scope: "course",
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
  assert.equal(exportedDocument.scope, "course");
  assert.equal(exportedDocument.courses.length, 1);
  assert.equal(exportedDocument.courses[0].title, mergedDocument.courses[1].title);
});

test("importação rejeita recorte AraLearn em nível incompatível", () => {
  const baseDocument = readNormalizedProject("./docs/examples/aralearn-contract.renderable.json");
  const courseKey = baseDocument.courses[0].key;
  const moduleKey = baseDocument.courses[0].modules[0].key;
  const lessonKey = baseDocument.courses[0].modules[0].lessons[0].key;

  const lessonDocument = exportLessonDocument(baseDocument, { courseKey, moduleKey, lessonKey });

  assert.throws(
    () => importModules(baseDocument, { courseKey, document: lessonDocument }),
    /Este arquivo contém lição/
  );
});

test("excluir lição intermediária preserva a estrutura restante válida", () => {
  const baseDocument = readNormalizedProject("./docs/examples/aralearn-contract.renderable.json");
  const courseKey = baseDocument.courses[0].key;
  const moduleKey = baseDocument.courses[0].modules[0].key;
  const lessonKey = baseDocument.courses[0].modules[0].lessons[0].key;
  const baseLessonCount = baseDocument.courses[0].modules[0].lessons.length;
  const withExtraLesson = importLessons(baseDocument, {
    courseKey,
    moduleKey,
    document: exportLessonDocument(baseDocument, { courseKey, moduleKey, lessonKey })
  });

  const targetLessonKey = withExtraLesson.courses[0].modules[0].lessons[0].key;
  const nextDocument = deleteLesson(withExtraLesson, {
    courseKey,
    moduleKey,
    lessonKey: targetLessonKey
  });

  assert.equal(nextDocument.courses[0].modules[0].lessons.length, baseLessonCount);
  assert.notEqual(nextDocument.courses[0].modules[0].lessons[0].key, targetLessonKey);
});

test("importa módulo, lição e microssequência em níveis distintos e exporta recortes equivalentes", () => {
  const baseDocument = readNormalizedProject("./docs/examples/aralearn-contract.renderable.json");
  const importedCourse = structuredClone(baseDocument.courses[0]);
  const baseLessonCount = baseDocument.courses[0].modules[0].lessons.length;
  const importedMicrosequenceCount = 1;

  const withImportedModule = importModules(baseDocument, {
    courseKey: baseDocument.courses[0].key,
    document: exportModuleDocument(baseDocument, {
      courseKey: importedCourse.key,
      moduleKey: importedCourse.modules[0].key
    })
  });
  assert.equal(withImportedModule.courses[0].modules.length, 2);

  const withImportedLesson = importLessons(baseDocument, {
    courseKey: baseDocument.courses[0].key,
    moduleKey: baseDocument.courses[0].modules[0].key,
    document: exportLessonDocument(baseDocument, {
      courseKey: importedCourse.key,
      moduleKey: importedCourse.modules[0].key,
      lessonKey: importedCourse.modules[0].lessons[0].key
    })
  });
  assert.equal(withImportedLesson.courses[0].modules[0].lessons.length, baseLessonCount + 1);

  const withImportedMicrosequence = importMicrosequences(baseDocument, {
    courseKey: baseDocument.courses[0].key,
    moduleKey: baseDocument.courses[0].modules[0].key,
    lessonKey: baseDocument.courses[0].modules[0].lessons[0].key,
    document: exportMicrosequenceDocument(baseDocument, {
      courseKey: importedCourse.key,
      moduleKey: importedCourse.modules[0].key,
      lessonKey: importedCourse.modules[0].lessons[0].key,
      microsequenceKey: importedCourse.modules[0].lessons[0].microsequences[0].key
    })
  });
  assert.equal(
    withImportedMicrosequence.courses[0].modules[0].lessons[0].microsequences.length,
    (baseDocument.courses[0].modules[0].lessons[0].microsequences || []).length + importedMicrosequenceCount
  );

  const exportedModule = exportModuleDocument(baseDocument, {
    courseKey: baseDocument.courses[0].key,
    moduleKey: baseDocument.courses[0].modules[0].key
  });
  assert.equal(exportedModule.scope, "module");
  assert.equal(exportedModule.courses[0].modules.length, 1);

  const exportedLesson = exportLessonDocument(baseDocument, {
    courseKey: baseDocument.courses[0].key,
    moduleKey: baseDocument.courses[0].modules[0].key,
    lessonKey: baseDocument.courses[0].modules[0].lessons[0].key
  });
  assert.equal(exportedLesson.scope, "lesson");
  assert.equal(exportedLesson.courses[0].modules[0].lessons.length, 1);

  const exportedMicrosequence = exportMicrosequenceDocument(baseDocument, {
    courseKey: baseDocument.courses[0].key,
    moduleKey: baseDocument.courses[0].modules[0].key,
    lessonKey: baseDocument.courses[0].modules[0].lessons[0].key,
    microsequenceKey: baseDocument.courses[0].modules[0].lessons[0].microsequences[0].key
  });
  assert.equal(exportedMicrosequence.scope, "microsequence");
  assert.equal(exportedMicrosequence.courses[0].modules[0].lessons[0].microsequences.length, 1);
});
