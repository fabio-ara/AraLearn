import { cloneMicrosequenceWithVersion } from "../../domain/microsequence.js";
import { createMicrosequenceVersion } from "../../domain/microsequenceVersion.js";

export function cloneProject(project) {
  return structuredClone(project);
}

export function findSelection(project, selection) {
  const courseIndex = (project.courses || []).findIndex((item) => item.id === selection.courseKey);
  if (courseIndex < 0) return null;
  const course = project.courses[courseIndex];
  const moduleIndex = (course.modules || []).findIndex((item) => item.id === selection.moduleKey);
  if (moduleIndex < 0) return null;
  const moduleValue = course.modules[moduleIndex];
  const lessonIndex = (moduleValue.lessons || []).findIndex((item) => item.id === selection.lessonKey);
  if (lessonIndex < 0) return null;
  const lesson = moduleValue.lessons[lessonIndex];
  const microsequenceIndex = (lesson.microsequences || []).findIndex((item) => item.id === selection.microsequenceKey);
  if (microsequenceIndex < 0) return null;
  return {
    courseIndex,
    moduleIndex,
    lessonIndex,
    microsequenceIndex,
    course,
    moduleValue,
    lesson,
    microsequence: lesson.microsequences[microsequenceIndex]
  };
}

export function replaceMicrosequence(project, selectionInfo, nextMicrosequence) {
  const nextProject = cloneProject(project);
  nextProject.courses[selectionInfo.courseIndex].modules[selectionInfo.moduleIndex].lessons[selectionInfo.lessonIndex].microsequences[
    selectionInfo.microsequenceIndex
  ] = nextMicrosequence;
  return nextProject;
}

export function appendVersion(microsequence, payload, { source = "llm", action = "generate", request = "", status = "generated" } = {}) {
  const version = createMicrosequenceVersion({
    source,
    action,
    request,
    cards: payload.cards,
    summary: payload.summary,
    validation: payload.validation || { ok: true, issues: [] }
  });
  return cloneMicrosequenceWithVersion(microsequence, version, status);
}
