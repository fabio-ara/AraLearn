import { createMicrosequenceVersion } from "../../domain/microsequenceVersion.js";

export function cloneProject(project) {
  return structuredClone(project);
}

export function findSelection(project, selection) {
  const courseIndex = (project.courses || []).findIndex((item) => item.key === selection.courseKey);
  if (courseIndex < 0) return null;
  const course = project.courses[courseIndex];
  const moduleIndex = (course.modules || []).findIndex((item) => item.key === selection.moduleKey);
  if (moduleIndex < 0) return null;
  const moduleValue = course.modules[moduleIndex];
  const lessonIndex = (moduleValue.lessons || []).findIndex((item) => item.key === selection.lessonKey);
  if (lessonIndex < 0) return null;
  const lesson = moduleValue.lessons[lessonIndex];
  const microsequenceIndex = (lesson.microsequences || []).findIndex((item) => item.key === selection.microsequenceKey);
  if (microsequenceIndex < 0) return null;
  return { courseIndex, moduleIndex, lessonIndex, microsequenceIndex, course, moduleValue, lesson, microsequence: lesson.microsequences[microsequenceIndex] };
}

export function replaceMicrosequence(project, selectionInfo, nextMicrosequence) {
  const nextProject = cloneProject(project);
  nextProject.courses[selectionInfo.courseIndex].modules[selectionInfo.moduleIndex].lessons[selectionInfo.lessonIndex].microsequences[
    selectionInfo.microsequenceIndex
  ] = nextMicrosequence;
  return nextProject;
}

export function appendVersion(microsequence, payload, { source, mode, userRequest, status }) {
  const version = createMicrosequenceVersion({
    source,
    mode,
    userRequest,
    cards: payload.cards,
    summary: payload.summary,
    validationReport: payload.validationReport
  });
  return {
    ...microsequence,
    versions: [...(Array.isArray(microsequence.versions) ? microsequence.versions : []), version],
    activeVersionKey: version.key,
    status
  };
}

