import { normalizeProgressDocument, parseProgressDocument, serializeProgressDocument } from "./progressStore.js";
import { parseProjectDocument, serializeProjectDocument } from "./projectStore.js";

const DEFAULT_KEYS = {
  project: "aralearn.project",
  progress: "aralearn.progress"
};

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

  return {
    saveProject(projectDocument) {
      const serialized = serializeProjectDocument(projectDocument);
      store.setItem(keys.project, serialized);
      return parseProjectDocument(serialized);
    },

    loadProject() {
      return parseProjectDocument(store.getItem(keys.project));
    },

    saveProgress(progressDocument) {
      const normalized = normalizeProgressDocument(progressDocument);
      store.setItem(keys.progress, serializeProgressDocument(normalized));
      return normalized;
    },

    loadProgress() {
      return parseProgressDocument(store.getItem(keys.progress));
    },

    clearProgress() {
      store.removeItem(keys.progress);
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
