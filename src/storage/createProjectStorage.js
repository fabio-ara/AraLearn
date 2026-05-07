import { normalizeProgressDocument, parseProgressDocument, serializeProgressDocument } from "./progressStore.js";
import { parseProjectDocument, serializeProjectDocument } from "./projectStore.js";

const DEFAULT_KEYS = {
  project: "aralearn.project",
  progress: "aralearn.progress",
  storageVersion: "aralearn.storageVersion"
};

const CURRENT_STORAGE_VERSION = 2;

function parseEnvelopeJson(rawJson) {
  try {
    return JSON.parse(rawJson);
  } catch (error) {
    throw new Error(`JSON inválido para importação: ${error.message}`);
  }
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function normalizeImportEnvelope(parsed) {
  if (!isPlainObject(parsed)) {
    throw new Error("Pacote importado inválido: raiz deve ser um objeto.");
  }

  if (parsed.format !== "aralearn.storage") {
    throw new Error('Pacote importado inválido: formato esperado "aralearn.storage".');
  }

  const project = parseProjectDocument(JSON.stringify(parsed.project));
  const progress = normalizeProgressDocument(parsed.progress);

  return {
    format: "aralearn.storage",
    project,
    progress
  };
}

export function createProjectStorage(store, keys = DEFAULT_KEYS) {
  if (!store || typeof store.getItem !== "function" || typeof store.setItem !== "function") {
    throw new Error("Store inválido para persistência.");
  }

  const storageKeys = { ...DEFAULT_KEYS, ...keys };

  function saveStorageVersion() {
    store.setItem(storageKeys.storageVersion, String(CURRENT_STORAGE_VERSION));
  }

  return {
    saveProject(projectDocument) {
      const serialized = serializeProjectDocument(projectDocument);
      store.setItem(storageKeys.project, serialized);
      saveStorageVersion();
      return parseProjectDocument(serialized);
    },

    loadProject() {
      const rawProject = store.getItem(storageKeys.project);
      const project = parseProjectDocument(rawProject);

      if (project && store.getItem(storageKeys.storageVersion) !== String(CURRENT_STORAGE_VERSION)) {
        store.setItem(storageKeys.project, serializeProjectDocument(project));
        saveStorageVersion();
      }

      return project;
    },

    saveProgress(progressDocument) {
      const normalized = normalizeProgressDocument(progressDocument);
      store.setItem(storageKeys.progress, serializeProgressDocument(normalized));
      saveStorageVersion();
      return normalized;
    },

    loadProgress() {
      return parseProgressDocument(store.getItem(storageKeys.progress));
    },

    clearProgress() {
      store.removeItem(storageKeys.progress);
    },

    loadStorageVersion() {
      return store.getItem(storageKeys.storageVersion);
    },

    exportJson() {
      return JSON.stringify(
        {
          format: "aralearn.storage",
          storageVersion: CURRENT_STORAGE_VERSION,
          exportedAt: new Date().toISOString(),
          project: this.loadProject(),
          progress: this.loadProgress()
        },
        null,
        2
      );
    },

    importJson(rawJson) {
      const envelope = normalizeImportEnvelope(parseEnvelopeJson(rawJson));
      this.saveProject(envelope.project);
      this.saveProgress(envelope.progress);
      return {
        project: envelope.project,
        progress: envelope.progress
      };
    }
  };
}
