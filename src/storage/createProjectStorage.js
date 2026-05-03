import { parseProjectDocument, serializeProjectDocument } from "./projectStore.js";
import { normalizeProgressDocument, parseProgressDocument, serializeProgressDocument } from "./progressStore.js";

const DEFAULT_KEYS = {
  project: "aralearn.project.v1",
  progress: "aralearn.progress.v1"
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

  if (parsed.format !== "aralearn.storage.v1") {
    throw new Error('Pacote importado inválido: formato esperado "aralearn.storage.v1".');
  }

  const project = parseProjectDocument(JSON.stringify(parsed.project));
  const progress = normalizeProgressDocument(parsed.progress);

  return {
    format: "aralearn.storage.v1",
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
      const rawValue = store.getItem(keys.project);
      return parseProjectDocument(rawValue);
    },

    saveProgress(progressDocument) {
      const normalized = normalizeProgressDocument(progressDocument);
      store.setItem(keys.progress, serializeProgressDocument(normalized));
      return normalized;
    },

    loadProgress() {
      const rawValue = store.getItem(keys.progress);
      return parseProgressDocument(rawValue);
    },

    clearProgress() {
      store.removeItem(keys.progress);
    },

    exportJson() {
      const project = this.loadProject();
      const progress = this.loadProgress();

      return JSON.stringify(
        {
          format: "aralearn.storage.v1",
          exportedAt: new Date().toISOString(),
          project,
          progress
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
