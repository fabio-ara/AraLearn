import { createBrowserLocalStorageStore } from "../src/storage/createBrowserLocalStorageStore.js";
import { createProjectStorage } from "../src/storage/createProjectStorage.js";
import { createEditorSession } from "../src/editor/contractEditor.js";
import { createLessonEditorApp } from "../src/ui/lessonEditorApp.js";
import { createExampleProjectDocument } from "../src/ui/exampleProjectDocument.js";
import {
  EXAMPLE_SEED_KEY,
  EXAMPLE_SEED_VERSION,
  shouldHydrateExampleSeed,
  shouldStoreExampleSeedMetadata
} from "../src/ui/exampleSeed.js";

const root = document.getElementById("app-root");
if (!root) {
  throw new Error("Elemento raiz não encontrado.");
}

const kvStore = createBrowserLocalStorageStore(globalThis.localStorage);
const storage = createProjectStorage(kvStore);
const editor = createEditorSession(storage);

let project = null;
let shouldResetProject = false;
try {
  project = storage.loadProject();
} catch (error) {
  console.warn("Falha ao carregar projeto persistido. Recriando exemplo.", error);
  shouldResetProject = true;
}

const exampleProject = createExampleProjectDocument();
const storedSeedVersion = kvStore.getItem(EXAMPLE_SEED_KEY);

if (
  shouldResetProject ||
  shouldHydrateExampleSeed({
    project,
    storedSeedVersion
  })
) {
  project = exampleProject;
  storage.saveProject(project);
  kvStore.setItem(EXAMPLE_SEED_KEY, EXAMPLE_SEED_VERSION);
} else if (
  shouldStoreExampleSeedMetadata({
    project,
    storedSeedVersion
  })
) {
  kvStore.setItem(EXAMPLE_SEED_KEY, EXAMPLE_SEED_VERSION);
}

createLessonEditorApp({
  root,
  storage,
  editor
});
