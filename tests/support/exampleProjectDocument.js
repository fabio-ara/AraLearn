import { loadCourseFixture } from "./loadCourseFixture.js";

export function createTeoriaDosGrafosProvaProjectDocument() {
  return loadCourseFixture("teoria-dos-grafos-prova.json");
}

export function createExampleProjectDocument() {
  return createTeoriaDosGrafosProvaProjectDocument();
}

export function createLogicPlaneMatrixTestProjectDocument() {
  return createTeoriaDosGrafosProvaProjectDocument();
}
