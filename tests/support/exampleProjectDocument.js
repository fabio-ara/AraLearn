import { loadCourseFixture } from "./loadCourseFixture.js";

export function createTeoriaDosGrafosProvaProjectDocument() {
  return {
    contract: "aralearn.contract",
    version: 4,
    kind: "project",
    courses: [loadCourseFixture("teoria-dos-grafos-prova.json")]
  };
}

export function createExampleProjectDocument() {
  return createTeoriaDosGrafosProvaProjectDocument();
}

export function createLogicPlaneMatrixTestProjectDocument() {
  return createTeoriaDosGrafosProvaProjectDocument();
}
