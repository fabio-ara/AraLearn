import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { createKeyValueMemoryStore } from "../src/storage/createKeyValueMemoryStore.js";
import { createProjectStorage } from "../src/storage/createProjectStorage.js";

function readJson(path) {
  return JSON.parse(fs.readFileSync(path, "utf8"));
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
