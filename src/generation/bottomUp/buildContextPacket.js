import { getActiveMicrosequenceVersion } from "../../domain/microsequence.js";
import { listSupportedResourceTypes } from "../../domain/resources.js";

function findContext(project, selection) {
  const course = (project.courses || []).find((item) => item.key === selection.courseKey);
  const moduleValue = (course?.modules || []).find((item) => item.key === selection.moduleKey);
  const lesson = (moduleValue?.lessons || []).find((item) => item.key === selection.lessonKey);
  const microsequenceIndex = (lesson?.microsequences || []).findIndex((item) => item.key === selection.microsequenceKey);
  const microsequence = microsequenceIndex >= 0 ? lesson.microsequences[microsequenceIndex] : null;
  return {
    course,
    moduleValue,
    lesson,
    microsequence,
    microsequenceIndex
  };
}

function summarizeMicrosequence(microsequence) {
  const version = getActiveMicrosequenceVersion(microsequence);
  return {
    key: microsequence.key,
    title: microsequence.title,
    summary: version?.summary || microsequence.goal
  };
}

export function buildContextPacket(project, selection, { density = "standard", userRequest = "" } = {}) {
  const { course, moduleValue, lesson, microsequence, microsequenceIndex } = findContext(project, selection);
  if (!course || !moduleValue || !lesson || !microsequence) {
    throw new Error("Microssequência não encontrada.");
  }

  const previous = microsequenceIndex > 0 ? lesson.microsequences[microsequenceIndex - 1] : null;
  const next = microsequenceIndex >= 0 && microsequenceIndex < lesson.microsequences.length - 1 ? lesson.microsequences[microsequenceIndex + 1] : null;
  const dependsOn = (Array.isArray(microsequence.dependsOn) ? microsequence.dependsOn : [])
    .map((key) => (lesson.microsequences || []).find((item) => item.key === key))
    .filter(Boolean)
    .map((item) => summarizeMicrosequence(item));

  return {
    courseTitle: course.title,
    ...(course.goal ? { courseGoal: course.goal } : {}),
    module: {
      title: moduleValue.title,
      include: (moduleValue.include || []).map((item) => item.label),
      exclude: (moduleValue.exclude || []).map((item) => item.label),
      ...(moduleValue.notes ? { notes: moduleValue.notes } : {}),
      assessmentStyle: moduleValue.assessmentStyle
    },
    lesson: {
      title: lesson.title,
      goal: lesson.goal
    },
    currentMicrosequence: {
      key: microsequence.key,
      title: microsequence.title,
      goal: microsequence.goal,
      type: microsequence.type,
      dependsOn
    },
    neighborMicrosequences: {
      ...(previous
        ? {
            previous: {
              key: previous.key,
              title: previous.title,
              goal: previous.goal,
              summary: getActiveMicrosequenceVersion(previous)?.summary || ""
            }
          }
        : {}),
      ...(next
        ? {
            next: {
              key: next.key,
              title: next.title,
              goal: next.goal
            }
          }
        : {})
    },
    allowedResources: listSupportedResourceTypes(),
    density,
    ...(userRequest ? { userRequest } : {})
  };
}

