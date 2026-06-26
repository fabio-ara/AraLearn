import { loadEmbeddedCourseFromJson } from "./embeddedSeedCourseLoader.js";

export function createPraticasFerramentasCourse() {
  return loadEmbeddedCourseFromJson("praticas-ferramentas-seed-course.json");
}
