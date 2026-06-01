import { createTeoriaDosGrafosProvaCourse } from "./teoriaDosGrafosProvaSeedCourse.js";

export function createTeoriaDosGrafosProvaProjectDocument() {
  return {
    contract: "aralearn.contract",
    version: 3,
    kind: "project",
    courses: [createTeoriaDosGrafosProvaCourse()]
  };
}

export function createExampleProjectDocument() {
  return createTeoriaDosGrafosProvaProjectDocument();
}

export function createLogicPlaneMatrixTestProjectDocument() {
  return createTeoriaDosGrafosProvaProjectDocument();
}
