import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { createKeyValueMemoryStore } from "../src/storage/createKeyValueMemoryStore.js";
import { createProjectStorage } from "../src/storage/createProjectStorage.js";

function readText(path) {
  return fs.readFileSync(path, "utf8");
}

function readJson(path) {
  return JSON.parse(readText(path));
}

test("persiste projeto e progresso em chaves separadas", () => {
  const store = createKeyValueMemoryStore();
  const projectStorage = createProjectStorage(store);
  const project = readJson("./docs/examples/aralearn-intent-v1.valid.json");
  const progress = {
    lessons: {
      "lesson-primeira-licao": {
        cursor: 1,
        completedCardKeys: ["card-conceito-inicial"],
        updatedAt: "2026-05-02T23:59:00.000Z"
      }
    }
  };

  const savedProject = projectStorage.saveProject(project);
  const savedProgress = projectStorage.saveProgress(progress);

  assert.equal(savedProject.contract, "aralearn.intent.v1");
  assert.equal(savedProgress.lessons["lesson-primeira-licao"].cursor, 1);

  const dump = store.dump();
  assert.equal(Object.hasOwn(dump, "aralearn.project.v1"), true);
  assert.equal(Object.hasOwn(dump, "aralearn.progress.v1"), true);
});

test("recupera projeto e progresso persistidos", () => {
  const store = createKeyValueMemoryStore();
  const projectStorage = createProjectStorage(store);

  projectStorage.saveProject(readJson("./docs/examples/aralearn-intent-v1.valid.json"));
  projectStorage.saveProgress({
    lessons: {
      "lesson-primeira-licao": {
        cursor: 0,
        completedCardKeys: ["card-conceito-inicial"]
      }
    }
  });

  const loadedProject = projectStorage.loadProject();
  const loadedProgress = projectStorage.loadProgress();

  assert.equal(loadedProject.courses[0].key, "course-curso-de-exemplo");
  assert.deepEqual(loadedProgress.lessons["lesson-primeira-licao"].completedCardKeys, ["card-conceito-inicial"]);
});

test("exporta pacote JSON com conteúdo e progresso separados", () => {
  const store = createKeyValueMemoryStore();
  const projectStorage = createProjectStorage(store);

  projectStorage.saveProject(readJson("./docs/examples/aralearn-intent-v1.valid.json"));
  projectStorage.saveProgress({
    lessons: {
      "lesson-primeira-licao": {
        cursor: 0,
        completedCardKeys: ["card-conceito-inicial"]
      }
    }
  });

  const exportedJson = projectStorage.exportJson();
  const exported = JSON.parse(exportedJson);

  assert.equal(exported.format, "aralearn.storage.v1");
  assert.equal(exported.project.contract, "aralearn.intent.v1");
  assert.equal(exported.progress.lessons["lesson-primeira-licao"].cursor, 0);
});

test("importa pacote JSON somente depois de validar o projeto", () => {
  const store = createKeyValueMemoryStore();
  const projectStorage = createProjectStorage(store);

  const payload = JSON.stringify({
    format: "aralearn.storage.v1",
    project: readJson("./docs/examples/aralearn-intent-v1.valid.json"),
    progress: {
      lessons: {
        "lesson-primeira-licao": {
          cursor: 0,
          completedCardKeys: ["card-conceito-inicial"]
        }
      }
    }
  });

  const imported = projectStorage.importJson(payload);

  assert.equal(imported.project.courses[0].key, "course-curso-de-exemplo");
  assert.equal(imported.progress.lessons["lesson-primeira-licao"].cursor, 0);
});

test("rejeita importação com projeto inválido antes de persistir", () => {
  const store = createKeyValueMemoryStore();
  const projectStorage = createProjectStorage(store);
  const invalidProject = readJson("./docs/examples/aralearn-intent-v1.invalid.json");

  const payload = JSON.stringify({
    format: "aralearn.storage.v1",
    project: invalidProject,
    progress: {}
  });

  assert.throws(() => projectStorage.importJson(payload), /Pacote importado|Projeto inválido|Card solto/);
  assert.equal(store.getItem("aralearn.project.v1"), null);
  assert.equal(store.getItem("aralearn.progress.v1"), null);
});
