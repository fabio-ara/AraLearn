import { getActiveMicrosequenceVersion } from "../../domain/microsequence.js";
import { listSupportedResourceTypes } from "../../domain/resources.js";

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function uniqueList(values = []) {
  return [...new Set((Array.isArray(values) ? values : []).map((item) => text(item)).filter(Boolean))];
}

function summarizeRef(microsequence, { dependency = false, selected = false } = {}) {
  return {
    title: text(microsequence?.title),
    goal: text(microsequence?.goal),
    role: text(microsequence?.role),
    covers: uniqueList(microsequence?.covers),
    checks: uniqueList(microsequence?.checks),
    dependency: dependency === true,
    selected: selected === true
  };
}

function summarizeExistingCard(card = {}) {
  return {
    position: Number(card?.position) || 0,
    resource: text(card?.resource),
    kind: text(card?.kind),
    exercise: text(card?.exercise),
    title: text(card?.title)
  };
}

function summarizeNextTrailMicrosequence(microsequence) {
  if (!microsequence || typeof microsequence !== "object") {
    return null;
  }
  return {
    title: text(microsequence?.title),
    goal: text(microsequence?.goal),
    role: text(microsequence?.role),
    covers: uniqueList(microsequence?.covers),
    checks: uniqueList(microsequence?.checks)
  };
}

function findContext(project, selection) {
  const course = (project.courses || []).find((item) => item.id === selection.courseKey);
  const moduleValue = (course?.modules || []).find((item) => item.id === selection.moduleKey);
  const lesson = (moduleValue?.lessons || []).find((item) => item.id === selection.lessonKey);
  const microsequenceIndex = (lesson?.microsequences || []).findIndex((item) => item.id === selection.microsequenceKey);
  const microsequence = microsequenceIndex >= 0 ? lesson.microsequences[microsequenceIndex] : null;
  return {
    course,
    moduleValue,
    lesson,
    microsequence,
    microsequenceIndex
  };
}

function flattenCourseMicrosequences(course = {}) {
  return (course.modules || []).flatMap((moduleValue) =>
    (moduleValue.lessons || []).flatMap((lesson) => lesson.microsequences || [])
  );
}

function findMicrosequenceById(course, id) {
  const normalizedId = text(id);
  if (!normalizedId) {
    return null;
  }
  return flattenCourseMicrosequences(course).find((item) => item?.id === normalizedId) || null;
}

function findNextTrailMicrosequence(lesson, currentIndex) {
  const lessonMicrosequences = Array.isArray(lesson?.microsequences) ? lesson.microsequences : [];
  for (let index = currentIndex + 1; index < lessonMicrosequences.length; index += 1) {
    const candidate = lessonMicrosequences[index];
    if (!candidate?.branchOf) {
      return candidate;
    }
  }
  return null;
}

export function buildContextPacket(project, selection, { density = "standard", userRequest = "", selectedRefIds = [] } = {}) {
  const { course, moduleValue, lesson, microsequence, microsequenceIndex } = findContext(project, selection);
  if (!course || !moduleValue || !lesson || !microsequence) {
    throw new Error("Microssequência não encontrada.");
  }

  const dependencyIds = uniqueList(microsequence.dependsOn);
  const selectedIds = uniqueList(selectedRefIds);
  const refIds = uniqueList([...dependencyIds, ...selectedIds]);
  const refs = refIds
    .map((refId) => {
      const item = findMicrosequenceById(course, refId);
      if (!item) {
        return null;
      }
      return summarizeRef(item, {
        dependency: dependencyIds.includes(refId),
        selected: selectedIds.includes(refId)
      });
    })
    .filter(Boolean);
  const selectedRefTitles = refs.filter((item) => item.selected).map((item) => item.title).filter(Boolean);
  const nextTrail = findNextTrailMicrosequence(lesson, microsequenceIndex);

  return {
    path: {
      course: text(course.title),
      module: text(moduleValue.title),
      lesson: text(lesson.title),
      microsequence: text(microsequence.title)
    },
    guide: structuredClone(lesson.guide || moduleValue.guide || { goal: "", include: [], exclude: [], notation: [], avoid: [] }),
    microsequence: {
      title: text(microsequence.title),
      goal: text(microsequence.goal),
      role: text(microsequence.role),
      branchOf: text(microsequence.branchOf),
      status: text(microsequence.status),
      covers: uniqueList(microsequence.covers),
      checks: uniqueList(microsequence.checks),
      existingCards: (getActiveMicrosequenceVersion(microsequence)?.cards || []).map(summarizeExistingCard),
      currentCards: structuredClone(getActiveMicrosequenceVersion(microsequence)?.cards || [])
    },
    refs: {
      selected: selectedRefTitles,
      items: refs
    },
    next: summarizeNextTrailMicrosequence(nextTrail),
    allowedResources: listSupportedResourceTypes(),
    density,
    userRequest: text(userRequest)
  };
}
