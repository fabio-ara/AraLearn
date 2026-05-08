import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import {
  createCardInMicrosequence,
  createLesson,
  createMicrosequence,
  createModule,
  moveCardWithinMicrosequence,
  moveCourse,
  moveLesson,
  moveMicrosequence,
  moveModule
} from "../src/editor/contractEditor.js";
import { validateContractDocument } from "../src/contract/validateContract.js";
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

test("persiste projeto em chaves dedicadas", () => {
  const store = createKeyValueMemoryStore();
  const projectStorage = createProjectStorage(store);
  const project = readJson("./docs/examples/aralearn-contract.renderable.json");

  const savedProject = projectStorage.saveProject(project);

  assert.equal(savedProject.contract, "aralearn.contract");
  assert.equal(store.getItem("aralearn.project") !== null, true);
  assert.equal(projectStorage.loadStorageVersion(), "2");
});

test("exporta e importa envelope principal sem fallback para v1", () => {
  const store = createKeyValueMemoryStore();
  const projectStorage = createProjectStorage(store);
  projectStorage.saveProject(readJson("./docs/examples/aralearn-contract.renderable.json"));

  const exported = JSON.parse(projectStorage.exportJson());
  assert.equal(exported.format, "aralearn.storage");
  assert.equal(exported.storageVersion, 2);
  assert.equal(exported.project.contract, "aralearn.contract");

  const importedStore = createKeyValueMemoryStore();
  const importedStorage = createProjectStorage(importedStore);
  importedStorage.importJson(JSON.stringify(exported));

  assert.equal(importedStorage.loadProject().contract, "aralearn.contract");
  assert.equal(importedStorage.loadStorageVersion(), "2");
});

test("backup principal preserva também o progresso do projeto", () => {
  const store = createKeyValueMemoryStore();
  const projectStorage = createProjectStorage(store);
  projectStorage.saveProject(readJson("./docs/examples/aralearn-contract.renderable.json"));
  projectStorage.saveProgress({
    version: 1,
    lessons: {
      "course-curso-renderizavel::module-modulo-experimental::lesson-licao-experimental": {
        cursor: 3,
        completedCardKeys: ["card-ideia-central", "card-leitura-rapida"]
      }
    }
  });

  const exported = projectStorage.exportJson();
  const restoredStorage = createProjectStorage(createKeyValueMemoryStore());
  restoredStorage.importJson(exported);

  assert.deepEqual(restoredStorage.loadProgress(), {
    version: 1,
    lessons: {
      "course-curso-renderizavel::module-modulo-experimental::lesson-licao-experimental": {
        cursor: 3,
        completedCardKeys: ["card-ideia-central", "card-leitura-rapida"]
      }
    }
  });
});

test("migra projeto sem versão para storage versionado com status de microssequência", () => {
  const store = createKeyValueMemoryStore();
  const project = readJson("./docs/examples/aralearn-contract.renderable.json");
  delete project.courses[0].modules[0].lessons[0].microsequences[0].status;
  store.setItem("aralearn.project", JSON.stringify(project));

  const projectStorage = createProjectStorage(store);
  const loaded = projectStorage.loadProject();
  const persisted = JSON.parse(store.getItem("aralearn.project"));

  assert.equal(projectStorage.loadStorageVersion(), "2");
  assert.equal(loaded.courses[0].modules[0].lessons[0].microsequences[0].status, "ready");
  assert.equal(persisted.courses[0].modules[0].lessons[0].microsequences[0].status, "ready");
});

test("salvar e recarregar preserva a ordem reordenada da árvore completa", () => {
  const store = createKeyValueMemoryStore();
  const projectStorage = createProjectStorage(store);
  let project = readNormalizedProject("./docs/examples/aralearn-contract.renderable.json");

  project = {
    ...project,
    courses: [
      ...project.courses,
      {
        key: "course-extra",
        title: "Curso extra",
        modules: [
          {
            key: "module-extra",
            title: "Módulo extra",
            lessons: [
              {
                key: "lesson-extra",
                title: "Lição extra",
                microsequences: [
                  {
                    key: "microsequence-extra",
                    title: "Microssequência extra",
                    cards: [{ key: "card-extra", title: "Card extra", say: "Conteúdo" }]
                  }
                ]
              }
            ]
          }
        ]
      }
    ]
  };

  project = createModule(project, {
    courseKey: "course-curso-renderizavel",
    title: "Módulo secundário"
  });
  project = createLesson(project, {
    courseKey: "course-curso-renderizavel",
    moduleKey: "module-modulo-experimental",
    title: "Lição secundária"
  });
  project = createMicrosequence(project, {
    courseKey: "course-curso-renderizavel",
    moduleKey: "module-modulo-experimental",
    lessonKey: "lesson-licao-experimental",
    title: "Microssequência secundária"
  });
  project = createCardInMicrosequence(project, {
    courseKey: "course-curso-renderizavel",
    moduleKey: "module-modulo-experimental",
    lessonKey: "lesson-licao-experimental",
    microsequenceKey: "microsequence-modelo-cascata",
    title: "Card secundário",
    say: "Outro conteúdo"
  });

  project = moveCourse(project, { courseKey: "course-extra", toIndex: 0 });
  project = moveModule(project, {
    courseKey: "course-curso-renderizavel",
    moduleKey: "module-modulo-secundario",
    toIndex: 0
  });
  project = moveLesson(project, {
    courseKey: "course-curso-renderizavel",
    moduleKey: "module-modulo-experimental",
    lessonKey: "lesson-licao-secundaria",
    toIndex: 0
  });
  project = moveMicrosequence(project, {
    courseKey: "course-curso-renderizavel",
    moduleKey: "module-modulo-experimental",
    lessonKey: "lesson-licao-experimental",
    microsequenceKey: "microsequence-microssequencia-secundaria",
    targetCourseKey: "course-curso-renderizavel",
    targetModuleKey: "module-modulo-experimental",
    targetLessonKey: "lesson-licao-experimental",
    targetPosition: 0
  });
  project = moveCardWithinMicrosequence(project, {
    courseKey: "course-curso-renderizavel",
    moduleKey: "module-modulo-experimental",
    lessonKey: "lesson-licao-experimental",
    microsequenceKey: "microsequence-modelo-cascata",
    cardKey: "card-leitura-rapida",
    toIndex: 0
  });

  projectStorage.saveProject(project);
  const loaded = projectStorage.loadProject();

  assert.equal(loaded.courses[0].key, "course-extra");
  assert.equal(loaded.courses[1].modules[0].key, "module-modulo-secundario");
  assert.equal(loaded.courses[1].modules[1].lessons[0].key, "lesson-licao-secundaria");
  assert.equal(loaded.courses[1].modules[1].lessons[1].microsequences[0].key, "microsequence-microssequencia-secundaria");
  assert.equal(
    loaded.courses[1].modules[1].lessons[1].microsequences[1].cards[0].key,
    "card-leitura-rapida"
  );
});
