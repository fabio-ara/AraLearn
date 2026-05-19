import { normalizeProgressDocument, parseProgressDocument, serializeProgressDocument } from "./progressStore.js";
import { parseProjectDocument, serializeProjectDocument } from "./projectStore.js";
import { STORAGE_KEYS } from "../core/storageKeys.js";

const DEFAULT_KEYS = STORAGE_KEYS;

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

  return {
    saveProject(projectDocument) {
      const serialized = serializeProjectDocument(projectDocument);
      store.setItem(storageKeys.project, serialized);
      return parseProjectDocument(serialized);
    },

    loadProject() {
      const rawProject = store.getItem(storageKeys.project);
      return parseProjectDocument(rawProject);
    },

    saveProgress(progressDocument) {
      const normalized = normalizeProgressDocument(progressDocument);
      store.setItem(storageKeys.progress, serializeProgressDocument(normalized));
      return normalized;
    },

    loadProgress() {
      return parseProgressDocument(store.getItem(storageKeys.progress));
    },

    clearProgress() {
      store.removeItem(storageKeys.progress);
    },

    loadStorageVersion() {
      return null;
    },

    exportJson() {
      return JSON.stringify(
        {
          format: "aralearn.storage",
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
