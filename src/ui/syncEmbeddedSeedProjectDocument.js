import { createEmbeddedSeedProjectDocument } from "./embeddedSeedProjectDocument.js";
import { loadNonPersistedCourseManifest } from "./embeddedSeedCourseLoader.js";

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function buildCourseMap(courses = []) {
  return new Map(
    courses
      .filter((course) => course && typeof course === "object" && !Array.isArray(course))
      .map((course) => [text(course.id), course])
      .filter(([id]) => id)
  );
}

function sameCourseList(left = [], right = []) {
  if (left.length !== right.length) {
    return false;
  }
  for (let index = 0; index < left.length; index += 1) {
    if (JSON.stringify(left[index]) !== JSON.stringify(right[index])) {
      return false;
    }
  }
  return true;
}

export function syncEmbeddedSeedProjectDocument(projectDocument, embeddedSeedProject = createEmbeddedSeedProjectDocument()) {
  const embeddedCourses = Array.isArray(embeddedSeedProject?.courses) ? embeddedSeedProject.courses : [];
  const storedCourses = Array.isArray(projectDocument?.courses) ? projectDocument.courses : [];
  const nonPersistedIds = new Set(loadNonPersistedCourseManifest().courseIds);
  const embeddedIds = new Set(embeddedCourses.map((course) => text(course?.id)).filter(Boolean));
  const extraCourses = storedCourses.filter((course) => {
    const courseId = text(course?.id);
    return courseId && !embeddedIds.has(courseId) && !nonPersistedIds.has(courseId);
  });
  const nextCourses = [...embeddedCourses, ...extraCourses];

  if (!projectDocument || typeof projectDocument !== "object" || Array.isArray(projectDocument)) {
    return {
      changed: true,
      projectDocument: {
        ...embeddedSeedProject,
        courses: nextCourses
      }
    };
  }

  const storedCourseMap = buildCourseMap(storedCourses);
  const nextCourseMap = buildCourseMap(nextCourses);
  const changed =
    !sameCourseList(storedCourses, nextCourses) ||
    storedCourseMap.size !== nextCourseMap.size;

  return {
    changed,
    projectDocument: changed
      ? {
          ...projectDocument,
          courses: nextCourses
        }
      : projectDocument
  };
}
