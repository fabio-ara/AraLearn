import { isRunnableMicrosequence } from "../model/microsequenceStatus.js";

function first(list) {
  return Array.isArray(list) ? list[0] || null : null;
}

export function findCourse(project, courseId) {
  return (project?.courses || []).find((course) => course.id === courseId) || null;
}

export function findModule(project, courseId, moduleId) {
  return (findCourse(project, courseId)?.modules || [])
    .find((moduleValue) => moduleValue.id === moduleId) || null;
}

export function findLesson(project, courseId, moduleId, lessonId) {
  return (findModule(project, courseId, moduleId)?.lessons || [])
    .find((lesson) => lesson.id === lessonId) || null;
}

export function findMicrosequence(project, courseId, moduleId, lessonId, microsequenceId) {
  return (findLesson(project, courseId, moduleId, lessonId)?.microsequences || [])
    .find((microsequence) => microsequence.id === microsequenceId) || null;
}

export function collectLessonStudyUnits(lesson) {
  return (lesson?.microsequences || []).flatMap((microsequence) =>
    isRunnableMicrosequence(microsequence)
      ? (microsequence.studyUnits || []).map((studyUnit, index) => ({
          microsequenceId: microsequence.id,
          microsequence,
          studyUnitId: studyUnit.id,
          studyUnit,
          index
        }))
      : []);
}

export function firstSelection(project) {
  const course = first(project?.courses);
  const moduleValue = first(course?.modules);
  const lesson = first(moduleValue?.lessons);
  const microsequence = first(lesson?.microsequences);
  const studyUnit = first(microsequence?.studyUnits);
  return {
    courseId: course?.id || null,
    moduleId: moduleValue?.id || null,
    lessonId: lesson?.id || null,
    microsequenceId: microsequence?.id || null,
    studyUnitId: studyUnit?.id || null,
    studyUnitIndex: 0
  };
}

export function selectionForCourse(project, courseId) {
  const course = findCourse(project, courseId);
  if (!course) return null;
  const moduleValue = first(course.modules);
  const lesson = first(moduleValue?.lessons);
  const microsequence = first(lesson?.microsequences);
  const studyUnit = first(microsequence?.studyUnits);
  return {
    courseId: course.id,
    moduleId: moduleValue?.id || null,
    lessonId: lesson?.id || null,
    microsequenceId: microsequence?.id || null,
    studyUnitId: studyUnit?.id || null,
    studyUnitIndex: 0
  };
}

export function selectionForModule(project, selection, moduleId) {
  const moduleValue = findModule(project, selection.courseId, moduleId);
  if (!moduleValue) return null;
  const lesson = first(moduleValue.lessons);
  const microsequence = first(lesson?.microsequences);
  const studyUnit = first(microsequence?.studyUnits);
  return {
    ...selection,
    moduleId: moduleValue.id,
    lessonId: lesson?.id || null,
    microsequenceId: microsequence?.id || null,
    studyUnitId: studyUnit?.id || null,
    studyUnitIndex: 0
  };
}

export function selectionForLesson(project, selection, lessonId) {
  const lesson = findLesson(project, selection.courseId, selection.moduleId, lessonId);
  if (!lesson) return null;
  const microsequence = first(lesson.microsequences);
  const studyUnit = first(microsequence?.studyUnits);
  return {
    ...selection,
    lessonId: lesson.id,
    microsequenceId: microsequence?.id || null,
    studyUnitId: studyUnit?.id || null,
    studyUnitIndex: 0
  };
}

export function selectionForMicrosequence(project, selection, microsequenceId, studyUnitIndex = 0) {
  const microsequence = findMicrosequence(
    project,
    selection.courseId,
    selection.moduleId,
    selection.lessonId,
    microsequenceId
  );
  if (!microsequence) return null;
  const units = microsequence.studyUnits || [];
  const index = Math.max(0, Math.min(studyUnitIndex, Math.max(0, units.length - 1)));
  return {
    ...selection,
    microsequenceId: microsequence.id,
    studyUnitId: units[index]?.id || null,
    studyUnitIndex: index
  };
}

export function exactStudyUnitSelection(project, entityPath) {
  if (!Array.isArray(entityPath) || entityPath.length !== 5) return null;
  const [courseId, moduleId, lessonId, microsequenceId, studyUnitId] = entityPath;
  const microsequence = findMicrosequence(project, courseId, moduleId, lessonId, microsequenceId);
  const studyUnitIndex = (microsequence?.studyUnits || []).findIndex((unit) => unit.id === studyUnitId);
  if (studyUnitIndex < 0) return null;
  return { courseId, moduleId, lessonId, microsequenceId, studyUnitId, studyUnitIndex };
}

export function studyUnitPathKey(selection) {
  return [
    selection.courseId,
    selection.moduleId,
    selection.lessonId,
    selection.microsequenceId,
    selection.studyUnitId
  ].join("::");
}
