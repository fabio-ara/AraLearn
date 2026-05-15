import { createBrowserLocalStorageStore } from "../src/storage/createBrowserLocalStorageStore.js";
import { createProjectStorage } from "../src/storage/createProjectStorage.js";
import { createEditorSession } from "../src/editor/contractEditor.js";
import { createLessonEditorApp } from "../src/ui/lessonEditorApp.js";
import { createEmbeddedSeedProjectDocument } from "../src/ui/embeddedSeedProjectDocument.js";

const root = document.getElementById("app-root");
if (!root) {
  throw new Error("Elemento raiz não encontrado.");
}

const kvStore = createBrowserLocalStorageStore(globalThis.localStorage);
const storage = createProjectStorage(kvStore);
const editor = createEditorSession(storage);
function shouldSeedEmbeddedProject(project) {
  return !project || !Array.isArray(project.courses) || project.courses.length === 0;
}

function isOutdatedEmbeddedSeedProject(project) {
  if (!project || !Array.isArray(project.courses) || project.courses.length !== 1) {
    return false;
  }
  const course = project.courses[0];
  if (course?.key === "course-logica-vetores-matrizes") {
    return true;
  }
  return course?.key === "course-matematica-para-informatica";
}

let project = null;
try {
  project = storage.loadProject();
} catch (error) {
  console.warn("Falha ao carregar projeto persistido. Reiniciando vazio.", error);
}

if (shouldSeedEmbeddedProject(project) || isOutdatedEmbeddedSeedProject(project)) {
  project = createEmbeddedSeedProjectDocument();
  storage.saveProject(project);
}

createLessonEditorApp({
  root,
  storage,
  editor
});
