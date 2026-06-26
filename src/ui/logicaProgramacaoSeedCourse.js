import { loadEmbeddedCourseFromJson } from "./embeddedSeedCourseLoader.js";

export function createLogicaProgramacaoCourse() {
  return loadEmbeddedCourseFromJson("logica-programacao-seed-course.json");
}
