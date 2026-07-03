const EMBEDDED_JSON_CACHE = new Map();
const EMBEDDED_COURSE_MANIFEST_FILE = "embedded-seed-manifest.json";
const NON_PERSISTED_COURSE_MANIFEST_FILE = "non-persisted-course-manifest.json";

function resolveJsonUrl(directoryName, fileName) {
  return new URL(`../data/${directoryName}/${fileName}`, import.meta.url);
}

function loadEmbeddedCourseTextInNode(url) {
  const processValue = globalThis.process;
  if (!processValue?.versions?.node || typeof processValue.getBuiltinModule !== "function") {
    return "";
  }
  const fs = processValue.getBuiltinModule("node:fs");
  const { fileURLToPath } = processValue.getBuiltinModule("node:url");
  return fs.readFileSync(fileURLToPath(url), "utf8");
}

function loadCourseTextInBrowser(url) {
  const request = new XMLHttpRequest();
  request.open("GET", url.href, false);
  request.send();
  if (request.status >= 200 && request.status < 300) {
    return request.responseText;
  }
  throw new Error(`Falha ao carregar JSON do catálogo de cursos: ${url.pathname}`);
}

export function loadJsonDocumentFromDirectory(directoryName, fileName) {
  const normalizedDirectoryName = String(directoryName || "").trim();
  const normalizedFileName = String(fileName || "").trim();
  const cacheKey = `${normalizedDirectoryName}/${normalizedFileName}`;
  if (!cacheKey) {
    throw new Error("Arquivo JSON embarcado inválido.");
  }
  if (EMBEDDED_JSON_CACHE.has(cacheKey)) {
    return structuredClone(EMBEDDED_JSON_CACHE.get(cacheKey));
  }
  const url = resolveJsonUrl(normalizedDirectoryName, normalizedFileName);
  const sourceText = loadEmbeddedCourseTextInNode(url) || loadCourseTextInBrowser(url);
  const document = JSON.parse(sourceText);
  EMBEDDED_JSON_CACHE.set(cacheKey, document);
  return structuredClone(document);
}

export function loadEmbeddedJsonDocument(fileName) {
  return loadJsonDocumentFromDirectory("embedded-courses", fileName);
}

export function loadEmbeddedCourseFromJson(fileName) {
  return loadEmbeddedJsonDocument(fileName);
}

export function loadNonPersistedCourseFromJson(fileName) {
  return loadJsonDocumentFromDirectory("non-persisted-courses", fileName);
}

export function loadEmbeddedSeedManifest() {
  const manifest = loadEmbeddedJsonDocument(EMBEDDED_COURSE_MANIFEST_FILE);
  const courseFiles = Array.isArray(manifest?.courseFiles)
    ? manifest.courseFiles.map((value) => String(value || "").trim()).filter(Boolean)
    : [];
  if (!courseFiles.length) {
    throw new Error("Manifesto de cursos embarcados vazio ou inválido.");
  }
  return {
    courseFiles
  };
}

export function loadNonPersistedCourseManifest() {
  const manifest = loadJsonDocumentFromDirectory("non-persisted-courses", NON_PERSISTED_COURSE_MANIFEST_FILE);
  const courseFiles = Array.isArray(manifest?.courseFiles)
    ? manifest.courseFiles.map((value) => String(value || "").trim()).filter(Boolean)
    : [];
  const courseIds = Array.isArray(manifest?.courseIds)
    ? manifest.courseIds.map((value) => String(value || "").trim()).filter(Boolean)
    : [];
  return {
    courseFiles,
    courseIds
  };
}
