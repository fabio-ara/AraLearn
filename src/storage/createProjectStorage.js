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

export function createProjectStorage(store, keys = DEFAULT_KEYS, officialProject = null) {
  if (!store || typeof store.getItem !== "function" || typeof store.setItem !== "function") {
    throw new Error("Store inválido para persistência.");
  }

  const storageKeys = { ...DEFAULT_KEYS, ...keys };
  const officialCourses = Array.isArray(officialProject?.courses) ? officialProject.courses : [];
  const officialCourseIds = new Set(officialCourses.map((course) => course?.id).filter(Boolean));

  function mergeWithOfficialCourses(projectDocument) {
    const customCourses = Array.isArray(projectDocument?.courses) ? projectDocument.courses : [];
    return {
      ...(officialProject || projectDocument),
      courses: [...officialCourses, ...customCourses.filter((course) => !officialCourseIds.has(course?.id))]
    };
  }

  function onlyCustomCourses(projectDocument) {
    return {
      ...projectDocument,
      courses: (projectDocument?.courses || []).filter((course) => !officialCourseIds.has(course?.id))
    };
  }

  return {
    saveProject(projectDocument) {
      const normalized = parseProjectDocument(serializeProjectDocument(projectDocument));
      const serialized = serializeProjectDocument(onlyCustomCourses(normalized));
      store.setItem(storageKeys.project, serialized);
      return normalized;
    },

    loadProject() {
      const rawProject = store.getItem(storageKeys.project);
      const storedProject = parseProjectDocument(rawProject);
      return storedProject ? mergeWithOfficialCourses(storedProject) : null;
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
