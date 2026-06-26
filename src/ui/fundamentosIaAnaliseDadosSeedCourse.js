import { loadEmbeddedCourseFromJson } from "./embeddedSeedCourseLoader.js";

export function createFundamentosIaAnaliseDadosCourse() {
  return loadEmbeddedCourseFromJson("fundamentos-ia-analise-dados-seed-course.json");
}
