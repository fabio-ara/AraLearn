const EMBEDDED_COURSE_DIRECTORY = new URL("../data/embedded-courses/", import.meta.url);
const EMBEDDED_COURSE_MANIFEST_FILE = "embedded-seed-manifest.json";
const JSON_FILE_NAME_PATTERN = /^[a-z0-9][a-z0-9._-]*\.json$/i;

function clone(value) {
  return structuredClone(value);
}

function resolveDocumentUrl(fileName) {
  const normalizedFileName = String(fileName || "").trim();
  if (!JSON_FILE_NAME_PATTERN.test(normalizedFileName)) {
    throw new Error(`Nome de arquivo embarcado inválido: "${normalizedFileName}".`);
  }
  return new URL(normalizedFileName, EMBEDDED_COURSE_DIRECTORY);
}

async function fetchJsonDocument(url, fetchImpl) {
  if (typeof fetchImpl !== "function") {
    throw new Error("O carregamento do catálogo requer a API Fetch.");
  }

  const response = await fetchImpl(url);
  if (!response?.ok) {
    throw new Error(`Falha ao carregar o catálogo embarcado (${response?.status || "sem resposta"}): ${url.pathname}`);
  }

  const sourceText = await response.text();
  try {
    return JSON.parse(sourceText);
  } catch (error) {
    throw new Error(`JSON inválido no catálogo embarcado: ${url.pathname}`, { cause: error });
  }
}

export function createEmbeddedCourseLoader({ fetchImpl = globalThis.fetch } = {}) {
  const documentPromises = new Map();

  async function loadJsonDocument(fileName) {
    const url = resolveDocumentUrl(fileName);
    const cacheKey = url.href;
    if (!documentPromises.has(cacheKey)) {
      const documentPromise = fetchJsonDocument(url, fetchImpl).catch((error) => {
        documentPromises.delete(cacheKey);
        throw error;
      });
      documentPromises.set(cacheKey, documentPromise);
    }
    return clone(await documentPromises.get(cacheKey));
  }

  async function loadSeedManifest() {
    const manifest = await loadJsonDocument(EMBEDDED_COURSE_MANIFEST_FILE);
    const courseFiles = Array.isArray(manifest?.courseFiles)
      ? manifest.courseFiles.map((value) => String(value || "").trim()).filter(Boolean)
      : [];

    if (!courseFiles.length || courseFiles.some((fileName) => !JSON_FILE_NAME_PATTERN.test(fileName))) {
      throw new Error("Manifesto de cursos embarcados vazio ou inválido.");
    }
    if (new Set(courseFiles).size !== courseFiles.length) {
      throw new Error("Manifesto de cursos embarcados contém arquivos duplicados.");
    }

    return { courseFiles };
  }

  return {
    loadJsonDocument,
    loadCourse: loadJsonDocument,
    loadSeedManifest
  };
}

const defaultLoader = createEmbeddedCourseLoader();
const loadersByFetch = new WeakMap();

function resolveLoader(options = {}) {
  const fetchImpl = options.fetchImpl;
  if (fetchImpl === undefined || fetchImpl === globalThis.fetch) {
    return defaultLoader;
  }
  if (typeof fetchImpl !== "function") {
    throw new TypeError("A implementação de Fetch do catálogo deve ser uma função.");
  }
  if (!loadersByFetch.has(fetchImpl)) {
    loadersByFetch.set(fetchImpl, createEmbeddedCourseLoader({ fetchImpl }));
  }
  return loadersByFetch.get(fetchImpl);
}

export function loadEmbeddedJsonDocument(fileName, options) {
  return resolveLoader(options).loadJsonDocument(fileName);
}

export function loadEmbeddedCourseFromJson(fileName, options) {
  return resolveLoader(options).loadCourse(fileName);
}

export function loadEmbeddedSeedManifest(options) {
  return resolveLoader(options).loadSeedManifest();
}
