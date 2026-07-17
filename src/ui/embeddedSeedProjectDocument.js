import {
  loadEmbeddedCourseFromJson,
  loadEmbeddedSeedManifest,
  loadNonPersistedCourseFromJson,
  loadNonPersistedCourseManifest
} from "./embeddedSeedCourseLoader.js";

function createEmbeddedSeedCourses() {
  const primaryCourses = loadEmbeddedSeedManifest().courseFiles.map((fileName) => loadEmbeddedCourseFromJson(fileName));
  const additionalCourses = loadNonPersistedCourseManifest().courseFiles.map((fileName) => loadNonPersistedCourseFromJson(fileName));
  return [...primaryCourses, ...additionalCourses];
}

export function createEmbeddedSeedProjectDocument() {
  return {
    contract: "aralearn.contract",
    version: 3,
    kind: "project",
    courses: createEmbeddedSeedCourses()
  };
}
