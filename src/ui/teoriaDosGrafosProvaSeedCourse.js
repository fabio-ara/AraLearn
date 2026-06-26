import { loadEmbeddedCourseFromJson } from "./embeddedSeedCourseLoader.js";

export function createTeoriaDosGrafosProvaCourse() {
  return loadEmbeddedCourseFromJson("teoria-dos-grafos-prova.json");
}
