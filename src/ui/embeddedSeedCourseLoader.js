const EMBEDDED_COURSE_CACHE = new Map();

function resolveEmbeddedCourseUrl(fileName) {
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

export function loadEmbeddedCourseFromJson(fileName) {
  const cacheKey = String(fileName || "").trim();
  if (!cacheKey) {
    throw new Error("Arquivo de curso embarcado inválido.");
  }
  if (EMBEDDED_COURSE_CACHE.has(cacheKey)) {
    return structuredClone(EMBEDDED_COURSE_CACHE.get(cacheKey));
  }
  const url = resolveEmbeddedCourseUrl(cacheKey);
  const sourceText = loadEmbeddedCourseTextInNode(url) || loadEmbeddedCourseTextInBrowser(url);
  const course = JSON.parse(sourceText);
  EMBEDDED_COURSE_CACHE.set(cacheKey, course);
  return structuredClone(course);
}
