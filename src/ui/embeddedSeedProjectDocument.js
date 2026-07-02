import { loadEmbeddedCourseFromJson, loadEmbeddedSeedManifest } from "./embeddedSeedCourseLoader.js";

function createEmbeddedSeedCourses() {
  return loadEmbeddedSeedManifest().courseFiles.map((fileName) => loadEmbeddedCourseFromJson(fileName));
}

export function createEmbeddedSeedProjectDocument() {
  return {
    contract: "aralearn.contract",
    version: 3,
    kind: "project",
    courses: createEmbeddedSeedCourses()
  };
}
