import { contractToRelationalRows } from "./contractToRelationalRows.js";
import { relationalRowsToContract } from "./relationalRowsToContract.js";
import { RelationalMappingError } from "./relationalSchema.js";

function projectForCourse(course) {
  return {
    contract: "aralearn.contract",
    version: 4,
    kind: "project",
    courses: [structuredClone(course)]
  };
}

function asSingleCourseProject(value) {
  if (value?.contract === "aralearn.contract" && value?.version === 4 && value?.kind === "project") {
    if (!Array.isArray(value.courses) || value.courses.length !== 1) {
      throw new RelationalMappingError("O hash de curso exige exatamente um curso.");
    }
    return structuredClone(value);
  }
  return projectForCourse(value);
}

function sortJsonValue(value) {
  if (Array.isArray(value)) return value.map(sortJsonValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort((left, right) => left.localeCompare(right))
      .filter((key) => value[key] !== undefined)
      .map((key) => [key, sortJsonValue(value[key])])
  );
}

/**
 * Canonicalizes a public v3 course through the relational round-trip. This makes
 * harmless representational differences (for example an omitted option kind)
 * converge before hashing while preserving every mapped domain field.
 */
export function canonicalizeCourse(courseOrSingleCourseProject) {
  const project = asSingleCourseProject(courseOrSingleCourseProject);
  const rows = contractToRelationalRows(project);
  return relationalRowsToContract(rows).courses[0];
}

export function canonicalStringify(value) {
  return JSON.stringify(sortJsonValue(value));
}

export function canonicalCourseString(courseOrSingleCourseProject) {
  return canonicalStringify(canonicalizeCourse(courseOrSingleCourseProject));
}

export async function canonicalCourseHash(courseOrSingleCourseProject) {
  if (!globalThis.crypto?.subtle) {
    throw new RelationalMappingError("Web Crypto não está disponível para calcular SHA-256.");
  }
  const bytes = new TextEncoder().encode(canonicalCourseString(courseOrSingleCourseProject));
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
