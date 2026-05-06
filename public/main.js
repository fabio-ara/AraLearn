import { createBrowserLocalStorageStore } from "../src/storage/createBrowserLocalStorageStore.js";
import { createProjectStorage } from "../src/storage/createProjectStorage.js";
import { createEditorSession } from "../src/editor/contractEditor.js";
import { createLessonEditorApp } from "../src/ui/lessonEditorApp.js";
import { createExampleProjectDocument } from "../src/ui/exampleProjectDocument.js";
import {
  EXAMPLE_SEED_KEY,
  EXAMPLE_SEED_SIGNATURE_KEY,
  EXAMPLE_SEED_VERSION,
  getExampleSeedSignature,
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
try {
  project = storage.loadProject();
} catch (error) {
  console.warn("Falha ao carregar projeto persistido. Recriando exemplo.", error);
}

const exampleProject = createExampleProjectDocument();
const currentSeedSignature = getExampleSeedSignature(exampleProject);
const storedSeedVersion = kvStore.getItem(EXAMPLE_SEED_KEY);
const storedSeedSignature = kvStore.getItem(EXAMPLE_SEED_SIGNATURE_KEY);

if (
  shouldHydrateExampleSeed({
    project,
    storedSeedVersion,
    storedSeedSignature,
    currentSeedSignature
  })
) {
  project = exampleProject;
  storage.saveProject(project);
  kvStore.setItem(EXAMPLE_SEED_KEY, EXAMPLE_SEED_VERSION);
  kvStore.setItem(EXAMPLE_SEED_SIGNATURE_KEY, currentSeedSignature);
} else if (
  shouldStoreExampleSeedMetadata({
    project,
    storedSeedVersion,
    storedSeedSignature,
    currentSeedSignature
  })
) {
  kvStore.setItem(EXAMPLE_SEED_KEY, EXAMPLE_SEED_VERSION);
  kvStore.setItem(EXAMPLE_SEED_SIGNATURE_KEY, currentSeedSignature);
}

createLessonEditorApp({
  root,
  storage,
  editor
});
