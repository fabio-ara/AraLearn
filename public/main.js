import { createBrowserLocalStorageStore } from "../src/storage/createBrowserLocalStorageStore.js";
import { createProjectStorage } from "../src/storage/createProjectStorage.js";
import { createEditorSession } from "../src/editor/contractEditor.js";
import { createLessonEditorApp } from "../src/ui/lessonEditorApp.js";
import { createEmbeddedSeedProjectDocument, reconcileEmbeddedSeedProject } from "../src/ui/embeddedSeedProjectDocument.js";

const root = document.getElementById("app-root");
if (!root) {
  throw new Error("Elemento raiz não encontrado.");
}

const kvStore = createBrowserLocalStorageStore(globalThis.localStorage);
const storage = createProjectStorage(kvStore);
const editor = createEditorSession(storage);
let project = null;
try {
  project = storage.loadProject();
} catch (error) {
  console.warn("Falha ao carregar projeto persistido. Reiniciando vazio.", error);
}

if (!project || !Array.isArray(project.courses) || project.courses.length === 0) {
  project = createEmbeddedSeedProjectDocument();
  storage.saveProject(project);
} else {
  const reconciledProject = reconcileEmbeddedSeedProject(project);
  if (reconciledProject !== project) {
    project = reconciledProject;
    storage.saveProject(project);
  }
}

if (!project) {
  project = createEmbeddedSeedProjectDocument();
  storage.saveProject(project);
}

createLessonEditorApp({
  root,
  storage,
  editor
});
