import { loadEmbeddedCourseFromJson } from "./embeddedSeedCourseLoader.js";

export function createOrganizacaoArquiteturaComputadoresCourse() {
  return loadEmbeddedCourseFromJson("organizacao-arquitetura-computadores-seed-course.json");
}
