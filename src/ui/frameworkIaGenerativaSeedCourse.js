import { loadEmbeddedCourseFromJson } from "./embeddedSeedCourseLoader.js";

export function createFrameworkIaGenerativaCourse() {
  return loadEmbeddedCourseFromJson("framework-ia-generativa-seed-course.json");
}
