const EMBEDDED_JSON_CACHE = new Map();
const EMBEDDED_COURSE_MANIFEST_FILE = "embedded-seed-manifest.json";

function resolveEmbeddedJsonUrl(fileName) {
  return new URL(`../data/embedded-courses/${fileName}`, import.meta.url);
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

function loadEmbeddedCourseTextInBrowser(url) {
  const request = new XMLHttpRequest();
  request.open("GET", url.href, false);
  request.send();
  if (request.status >= 200 && request.status < 300) {
    return request.responseText;
  }
  throw new Error(`Falha ao carregar curso embarcado: ${url.pathname}`);
}

export function loadEmbeddedJsonDocument(fileName) {
  const cacheKey = String(fileName || "").trim();
  if (!cacheKey) {
    throw new Error("Arquivo JSON embarcado inválido.");
  }
  if (EMBEDDED_JSON_CACHE.has(cacheKey)) {
    return structuredClone(EMBEDDED_JSON_CACHE.get(cacheKey));
  }
  const url = resolveEmbeddedJsonUrl(cacheKey);
  const sourceText = loadEmbeddedCourseTextInNode(url) || loadEmbeddedCourseTextInBrowser(url);
  const document = JSON.parse(sourceText);
  EMBEDDED_JSON_CACHE.set(cacheKey, document);
  return structuredClone(document);
}

export function loadEmbeddedCourseFromJson(fileName) {
  return loadEmbeddedJsonDocument(fileName);
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
