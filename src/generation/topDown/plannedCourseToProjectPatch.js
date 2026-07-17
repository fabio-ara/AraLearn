import { buildScopedKey } from "../../core/ids.js";

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function unique(items = []) {
  return [...new Set((Array.isArray(items) ? items : []).map((item) => text(item)).filter(Boolean))];
}

function buildTopicsFromMicrosequences(microsequences = []) {
  const topics = [];
  const seen = new Set();
  microsequences.forEach((microsequence) => {
    unique(microsequence.covers).forEach((label) => {
      const token = label.toLowerCase();
      if (seen.has(token)) {
        return;
      }
      seen.add(token);
      topics.push({
        id: buildScopedKey("topic", label),
        label,
        kind: "concept",
        checks: unique(microsequence.checks),
        errors: []
      });
    });
  });
  return topics;
}

export function plannedCourseToProjectPatch(plannedCourse) {
  const course = {
    id: buildScopedKey("course", plannedCourse.course.title),
    title: plannedCourse.course.title,
    goal: text(plannedCourse.course.goal),
    modules: (plannedCourse.course.modules || []).map((plannedModule) => ({
      id: buildScopedKey("module", plannedModule.title),
      title: plannedModule.title,
      guide: structuredClone(plannedModule.guide),
      lessons: (plannedModule.lessons || []).map((plannedLesson) => ({
        id: buildScopedKey("lesson", plannedLesson.title),
        title: plannedLesson.title,
        guide: structuredClone(plannedLesson.guide),
        topics: buildTopicsFromMicrosequences(plannedLesson.microsequences),
        microsequences: (plannedLesson.microsequences || []).map((plannedMicrosequence) => ({
          id: text(plannedMicrosequence.id) || buildScopedKey("microsequence", plannedMicrosequence.title),
          title: plannedMicrosequence.title,
          goal: plannedMicrosequence.goal,
          role: plannedMicrosequence.role,
          status: "planned",
          dependsOn: unique(plannedMicrosequence.dependsOn),
          covers: unique(plannedMicrosequence.covers),
          checks: unique(plannedMicrosequence.checks),
          cards: []
        }))
      }))
    }))
  };

  return {
    kind: "upsert-course",
    course
  };
}
