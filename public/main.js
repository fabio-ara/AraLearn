import { createBrowserLocalStorageStore } from "../src/storage/createBrowserLocalStorageStore.js";
import { createProjectStorage } from "../src/storage/createProjectStorage.js";
import { createEditorSession } from "../src/editor/contractEditor.js";
import { createLessonEditorApp } from "../src/ui/lessonEditorApp.js";
import { createExampleProjectDocument } from "../src/ui/exampleProjectDocument.js";

const root = document.getElementById("app-root");
if (!root) {
  throw new Error("Elemento raiz não encontrado.");
}

const kvStore = createBrowserLocalStorageStore(globalThis.localStorage);
const storage = createProjectStorage(kvStore);
const editor = createEditorSession(storage);
const EXAMPLE_SEED_VERSION = "contract-flowchart-v2";
const EXAMPLE_SEED_KEY = "aralearn.example-seed.version";

let project = null;
try {
  project = storage.loadProject();
} catch (error) {
  console.warn("Falha ao carregar projeto persistido. Recriando exemplo.", error);
}

const storedSeedVersion = kvStore.getItem(EXAMPLE_SEED_KEY);
const courseKeys = Array.isArray(project?.courses) ? project.courses.map((course) => course.key) : [];
const isExampleProject =
  !project ||
  courseKeys.includes("course-engenharia-software") ||
  courseKeys.includes("course-logica");

const shouldResetSeed =
  !project ||
  (isExampleProject && storedSeedVersion !== EXAMPLE_SEED_VERSION);

if (shouldResetSeed) {
  project = createExampleProjectDocument();
  storage.saveProject(project);
  kvStore.setItem(EXAMPLE_SEED_KEY, EXAMPLE_SEED_VERSION);
}

createLessonEditorApp({
  root,
  storage,
  editor
});
