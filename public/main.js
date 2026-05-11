import { createBrowserLocalStorageStore } from "../src/storage/createBrowserLocalStorageStore.js";
import { createProjectStorage } from "../src/storage/createProjectStorage.js";
import { createEditorSession } from "../src/editor/contractEditor.js";
import { createLessonEditorApp } from "../src/ui/lessonEditorApp.js";
import { createMatematicaParaInformaticaProjectDocument } from "../src/ui/exampleProjectDocument.js";

const root = document.getElementById("app-root");
if (!root) {
  throw new Error("Elemento raiz não encontrado.");
}

const kvStore = createBrowserLocalStorageStore(globalThis.localStorage);
const storage = createProjectStorage(kvStore);
const editor = createEditorSession(storage);
function shouldSeedTestProject(project) {
  return !project || !Array.isArray(project.courses) || project.courses.length === 0;
}

function isOutdatedSeededTestProject(project) {
  if (!project || !Array.isArray(project.courses) || project.courses.length !== 1) {
    return false;
  }
  const course = project.courses[0];
  if (course?.key === "course-logica-vetores-matrizes") {
    return true;
  }
  if (course?.key !== "course-matematica-para-informatica") {
    return false;
  }
  const serialized = JSON.stringify(course);
  return (
    !serialized.includes("card-logica-erro-enunciado") ||
    !serialized.includes("card-transformacao-vetor-11") ||
    !serialized.includes("card-logica-distributividade-pratica") ||
    !serialized.includes("card-logica-contraexemplo-pratica") ||
    !serialized.includes("card-vetores-revisao-mista") ||
    !serialized.includes("formato de caderno")
  );
}

let project = null;
try {
  project = storage.loadProject();
} catch (error) {
  console.warn("Falha ao carregar projeto persistido. Reiniciando vazio.", error);
}

if (shouldSeedTestProject(project) || isOutdatedSeededTestProject(project)) {
  project = createMatematicaParaInformaticaProjectDocument();
  storage.saveProject(project);
}

createLessonEditorApp({
  root,
  storage,
  editor
});
