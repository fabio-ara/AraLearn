import { parseProgressDocument, serializeProgressDocument, validateProgressDocument } from "./progressStore.js";
import { parseProjectDocument, serializeProjectDocument } from "./projectStore.js";
import { STORAGE_KEYS } from "../core/storageKeys.js";

const DEFAULT_KEYS = STORAGE_KEYS;

function parseEnvelopeJson(rawJson) {
  try {
    return JSON.parse(rawJson);
  } catch (error) {
    throw new Error(`JSON inválido para importação: ${error.message}`, { cause: error });
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
  const progress = validateProgressDocument(parsed.progress);

  return {
    format: "aralearn.storage",
    project,
    progress
  };
}

export function createProjectStorage(store, keys = DEFAULT_KEYS, officialProject = null) {
  if (
    !store ||
    typeof store.getItem !== "function" ||
    typeof store.setItem !== "function" ||
    typeof store.setItems !== "function" ||
    typeof store.removeItem !== "function" ||
    typeof store.flush !== "function"
  ) {
    throw new Error("Store inválido para persistência.");
  }
  if (!officialProject || !Array.isArray(officialProject.courses)) {
    throw new Error("Catálogo oficial inválido para persistência.");
  }

  const storageKeys = { ...DEFAULT_KEYS, ...keys };
  const officialCourses = Array.isArray(officialProject?.courses) ? officialProject.courses : [];
  const officialCourseIds = new Set(officialCourses.map((course) => course?.id).filter(Boolean));

  function mergeWithOfficialCourses(projectDocument) {
    const customCourses = Array.isArray(projectDocument?.courses) ? projectDocument.courses : [];
    return {
      ...structuredClone(officialProject || projectDocument),
      courses: [
        ...structuredClone(officialCourses),
        ...structuredClone(customCourses.filter((course) => !officialCourseIds.has(course?.id)))
      ]
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
      const customProject = onlyCustomCourses(projectDocument);
      const normalizedCustomProject = parseProjectDocument(serializeProjectDocument(customProject));
      const serialized = serializeProjectDocument(normalizedCustomProject);
      store.setItem(storageKeys.project, serialized);
      return projectDocument;
    },

    loadProject() {
      const rawProject = store.getItem(storageKeys.project);
      const storedProject = parseProjectDocument(rawProject);
      return mergeWithOfficialCourses(storedProject || { ...officialProject, courses: [] });
    },

    saveProgress(progressDocument) {
      const validated = validateProgressDocument(progressDocument);
      store.setItem(storageKeys.progress, serializeProgressDocument(validated));
      return validated;
    },

    loadProgress() {
      return parseProgressDocument(store.getItem(storageKeys.progress));
    },

    clearProgress() {
      store.removeItem(storageKeys.progress);
    },

    flush() {
      return store.flush();
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
      const normalizedProject = parseProjectDocument(serializeProjectDocument(onlyCustomCourses(envelope.project)));
      const validatedProgress = validateProgressDocument(envelope.progress);
      store.setItems([
        [storageKeys.project, serializeProjectDocument(normalizedProject)],
        [storageKeys.progress, serializeProgressDocument(validatedProgress)]
      ]);
      return {
        project: mergeWithOfficialCourses(normalizedProject),
        progress: validatedProgress
      };
    }
  };
}
