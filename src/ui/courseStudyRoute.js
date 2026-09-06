import { UUID_PATTERN } from "../domain/identifiers.js";

export function buildCourseStudyRoute(entityPath) {
  if (!Array.isArray(entityPath) || entityPath.length < 1 || entityPath.length > 5 ||
      !UUID_PATTERN.test(String(entityPath[0] || "")) || entityPath.some((id) =>
        typeof id !== "string" || !id || id !== id.trim() || [...id].length > 240 ||
        new TextEncoder().encode(id).byteLength > 960 || [...id].some((character) =>
          character.codePointAt(0) < 32 ||
          character.codePointAt(0) >= 127 && character.codePointAt(0) <= 159))) {
    throw new TypeError("Caminho de Estudo inválido.");
  }
  return `#/estudo/${entityPath.map(encodeURIComponent).join("/")}`;
}

export function parseCourseStudyRoute(hash) {
  if (typeof hash !== "string" || !hash.startsWith("#/estudo/")) return null;
  try {
    const path = hash.slice("#/estudo/".length).split("/").map(decodeURIComponent);
    buildCourseStudyRoute(path);
    return path;
  } catch { return null; }
}
