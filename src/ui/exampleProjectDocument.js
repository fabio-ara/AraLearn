import { loadNonPersistedCourseFromJson } from "./embeddedSeedCourseLoader.js";

export function createTeoriaDosGrafosProvaProjectDocument() {
  return {
    contract: "aralearn.contract",
    version: 3,
    kind: "project",
    courses: [loadNonPersistedCourseFromJson("teoria-dos-grafos-prova.json")]
  };
}

export function createExampleProjectDocument() {
  return createTeoriaDosGrafosProvaProjectDocument();
}

export function createLogicPlaneMatrixTestProjectDocument() {
  return createTeoriaDosGrafosProvaProjectDocument();
}
