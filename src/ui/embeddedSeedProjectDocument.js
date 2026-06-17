import { createTeoriaDosGrafosProvaCourse } from "./teoriaDosGrafosProvaSeedCourse.js";
import { createPraticasFerramentasCourse } from "./praticasFerramentasSeedCourse.js";
import { createOrganizacaoArquiteturaComputadoresCourse } from "./organizacaoArquiteturaComputadoresSeedCourse.js";
import { createFrameworkIaGenerativaCourse } from "./frameworkIaGenerativaSeedCourse.js";
import { createOacoBasesCpuParalelismoCourse } from "./oacoBasesCpuParalelismoSeedCourse.js";
import { createLogicaProgramacaoCourse } from "./logicaProgramacaoSeedCourse.js";

const ORGANIZACAO_ARQUITETURA_COMPUTADORES_COURSE_ID = "course-organizacao-arquitetura-computadores";
const OACO_BASES_CPU_PARALELISMO_COURSE_ID = "course-oaco-bases-cpu-paralelismo";

function createMergedOrganizacaoArquiteturaComputadoresCourse() {
  const baseCourse = createOrganizacaoArquiteturaComputadoresCourse();
  const addonCourse = createOacoBasesCpuParalelismoCourse();
  return {
    ...baseCourse,
    goal:
      "Compreender como modelos, arquiteturas e suportes físicos de informação condicionam a computação clássica e quântica, incluindo bases numéricas, CPU, arquiteturas de instruções e paralelismo.",
    modules: [...(Array.isArray(baseCourse.modules) ? baseCourse.modules : []), ...(Array.isArray(addonCourse.modules) ? addonCourse.modules : [])]
  };
}

const EMBEDDED_SEED_COURSE_FACTORIES = [
  createTeoriaDosGrafosProvaCourse,
  createPraticasFerramentasCourse,
  createMergedOrganizacaoArquiteturaComputadoresCourse,
  createFrameworkIaGenerativaCourse,
  createLogicaProgramacaoCourse
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
  const legacyOacoBasesCourse = nextProject.courses.find((course) => course?.id === OACO_BASES_CPU_PARALELISMO_COURSE_ID);
  if (legacyOacoBasesCourse?.modules?.length) {
    const existingOacoCourseIndex = nextProject.courses.findIndex(
      (course) => course?.id === ORGANIZACAO_ARQUITETURA_COMPUTADORES_COURSE_ID
    );
    if (existingOacoCourseIndex !== -1) {
      const existingOacoCourse = nextProject.courses[existingOacoCourseIndex];
      const existingModules = Array.isArray(existingOacoCourse?.modules) ? existingOacoCourse.modules : [];
      const legacyModules = legacyOacoBasesCourse.modules.filter(
        (moduleValue) => !existingModules.some((candidate) => candidate?.id === moduleValue?.id)
      );
      if (legacyModules.length) {
        nextProject.courses[existingOacoCourseIndex] = {
          ...existingOacoCourse,
          modules: [...existingModules, ...legacyModules]
        };
      }
    }
  }
  nextProject.courses = nextProject.courses.filter((course) => course?.id !== OACO_BASES_CPU_PARALELISMO_COURSE_ID);
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
