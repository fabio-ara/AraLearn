import { createTeoriaDosGrafosProvaCourse } from "./teoriaDosGrafosProvaSeedCourse.js";
import { createPraticasFerramentasCourse } from "./praticasFerramentasSeedCourse.js";
import { createOrganizacaoArquiteturaComputadoresCourse } from "./organizacaoArquiteturaComputadoresSeedCourse.js";
import { createFrameworkIaGenerativaCourse } from "./frameworkIaGenerativaSeedCourse.js";

const EMBEDDED_SEED_COURSE_FACTORIES = [
  createTeoriaDosGrafosProvaCourse,
  createPraticasFerramentasCourse,
  createOrganizacaoArquiteturaComputadoresCourse,
  createFrameworkIaGenerativaCourse
];

function createEmbeddedSeedCourses() {
  return EMBEDDED_SEED_COURSE_FACTORIES.map((factory) => factory());
}

export function createEmbeddedSeedProjectDocument() {
  return {
    contract: "aralearn.contract",
    version: 3,
    kind: "project",
    courses: createEmbeddedSeedCourses()
  };
}

export function reconcileEmbeddedSeedProject(project) {
  const nextProject = structuredClone(project);
  if (!Array.isArray(nextProject.courses)) {
    nextProject.courses = [];
  }
  createEmbeddedSeedCourses().forEach((course) => {
    const existingIndex = nextProject.courses.findIndex((candidate) => candidate?.id === course.id);
    if (existingIndex === -1) {
      nextProject.courses.push(course);
      return;
    }
    nextProject.courses[existingIndex] = course;
  });
  return nextProject;
}
