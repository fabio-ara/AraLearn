import {
  createStructureVersionRecord,
  insertStructureVersionAfterActive,
  normalizeStructureVersionMap,
  normalizeStructureVersionEntry,
  replaceActiveStructureVersion
} from "./structureVersionState.js";
import { findCourse, findLesson, findModule } from "./lessonEditorPaths.js";

export function buildStructureVersionKey(reference) {
  if (!reference || typeof reference !== "object") {
    return "";
  }

  if (reference.level === "project") {
    return "project";
  }

  if (reference.level === "course" && reference.courseKey) {
    return `course::${reference.courseKey}`;
  }

  if (reference.level === "module" && reference.courseKey && reference.moduleKey) {
    return `module::${reference.courseKey}::${reference.moduleKey}`;
  }

  if (reference.level === "lesson" && reference.courseKey && reference.moduleKey && reference.lessonKey) {
    return `lesson::${reference.courseKey}::${reference.moduleKey}::${reference.lessonKey}`;
  }

  return "";
}

export function findStructureVersionEntity(project, reference) {
  if (!project || !reference) {
    return null;
  }

  if (reference.level === "project") {
    return project;
  }

  if (reference.level === "course") {
    return findCourse(project, reference.courseKey);
  }

  if (reference.level === "module") {
    return findModule(project, reference.courseKey, reference.moduleKey);
  }

  if (reference.level === "lesson") {
    return findLesson(project, reference.courseKey, reference.moduleKey, reference.lessonKey);
  }

  return null;
}

export function listStructureVersionReferencesForProject(project) {
  const references = [{ level: "project" }];
  const courses = Array.isArray(project?.courses) ? project.courses : [];
  courses.forEach((course) => {
    if (!course?.key) {
      return;
    }

    references.push({
      level: "course",
      courseKey: course.key
    });

    (course.modules || []).forEach((moduleValue) => {
      if (!moduleValue?.key) {
        return;
      }

      references.push({
        level: "module",
        courseKey: course.key,
        moduleKey: moduleValue.key
      });

      (moduleValue.lessons || []).forEach((lesson) => {
        if (!lesson?.key) {
          return;
        }

        references.push({
          level: "lesson",
          courseKey: course.key,
          moduleKey: moduleValue.key,
          lessonKey: lesson.key
        });
      });
    });
  });

  return references;
}

export function applyStructureVersionSnapshot(project, reference, snapshot) {
  if (!project || !reference?.level || !snapshot || typeof snapshot !== "object") {
    return project;
  }

  if (reference.level === "project") {
    return {
      ...project,
      courses: structuredClone(snapshot.courses || [])
    };
  }

  const nextProject = structuredClone(project);

  if (reference.level === "course") {
    nextProject.courses = (nextProject.courses || []).map((course) =>
      course.key === reference.courseKey
        ? {
            key: course.key,
            title: snapshot.title || "",
            ...(snapshot.description ? { description: snapshot.description } : {}),
            ...(snapshot.sourceGuide ? { sourceGuide: snapshot.sourceGuide } : {}),
            ...(snapshot.sourceGuideStructured ? { sourceGuideStructured: structuredClone(snapshot.sourceGuideStructured) } : {}),
            modules: structuredClone(snapshot.modules || [])
          }
        : course
    );
    return nextProject;
  }

  if (reference.level === "module") {
    nextProject.courses = (nextProject.courses || []).map((course) => {
      if (course.key !== reference.courseKey) {
        return course;
      }

      return {
        ...course,
        modules: (course.modules || []).map((moduleValue) =>
          moduleValue.key === reference.moduleKey
            ? {
                key: moduleValue.key,
                title: snapshot.title || "",
                ...(snapshot.description ? { description: snapshot.description } : {}),
                ...(snapshot.sourceGuide ? { sourceGuide: snapshot.sourceGuide } : {}),
                ...(snapshot.sourceGuideStructured ? { sourceGuideStructured: structuredClone(snapshot.sourceGuideStructured) } : {}),
                lessons: structuredClone(snapshot.lessons || [])
              }
            : moduleValue
        )
      };
    });
    return nextProject;
  }

  if (reference.level === "lesson") {
    nextProject.courses = (nextProject.courses || []).map((course) => {
      if (course.key !== reference.courseKey) {
        return course;
      }

      return {
        ...course,
        modules: (course.modules || []).map((moduleValue) => {
          if (moduleValue.key !== reference.moduleKey) {
            return moduleValue;
          }

          return {
            ...moduleValue,
            lessons: (moduleValue.lessons || []).map((lesson) =>
              lesson.key === reference.lessonKey
                ? {
                    key: lesson.key,
                    title: snapshot.title || "",
                    ...(snapshot.description ? { description: snapshot.description } : {}),
                    ...(snapshot.sourceGuide ? { sourceGuide: snapshot.sourceGuide } : {}),
                    ...(snapshot.sourceGuideStructured ? { sourceGuideStructured: structuredClone(snapshot.sourceGuideStructured) } : {}),
                    microsequences: structuredClone(snapshot.microsequences || [])
                  }
                : lesson
            )
          };
        })
      };
    });
  }

  return nextProject;
}

function ensureStructureVersionEntry(versionMap, reference, entity, { now = new Date() } = {}) {
  const versionKey = buildStructureVersionKey(reference);
  if (!versionKey || !entity) {
    return null;
  }

  const currentEntry = versionMap[versionKey];
  if (currentEntry && Array.isArray(currentEntry.versions) && currentEntry.versions.length) {
    return currentEntry;
  }

  versionMap[versionKey] = normalizeStructureVersionEntry(
    {
      level: reference.level,
      entityKey: entity.key,
      activeVersionId: "v1",
      versions: [
        createStructureVersionRecord(reference.level, entity, {
          entityKey: entity.key,
          versionNumber: 1,
          label: "Versão 1",
          operationType: "seed",
          createdAt: now,
          updatedAt: now,
          now
        })
      ]
    },
    { now }
  );
  normalizeStructureVersionMap(versionMap, { now });

  return versionMap[versionKey];
}

export function seedStructureVersionMapFromProject(versionMap, project, { now = new Date() } = {}) {
  if (!versionMap || typeof versionMap !== "object" || !project || typeof project !== "object") {
    return false;
  }

  let changed = false;
  listStructureVersionReferencesForProject(project).forEach((reference) => {
    const entity = findStructureVersionEntity(project, reference);
    if (!entity) {
      return;
    }

    const versionKey = buildStructureVersionKey(reference);
    const existed = Boolean(versionMap[versionKey]?.versions?.length);
    const entry = ensureStructureVersionEntry(versionMap, reference, entity, { now });
    if (entry && !existed) {
      changed = true;
    }
  });

  if (changed) {
    normalizeStructureVersionMap(versionMap, { now });
  }

  return changed;
}

export function syncStructureVersionSnapshot(versionMap, project, reference, { now = new Date() } = {}) {
  const entity = findStructureVersionEntity(project, reference);
  if (!entity) {
    return null;
  }

  const entry = ensureStructureVersionEntry(versionMap, reference, entity, { now });
  if (!entry) {
    return null;
  }

  replaceActiveStructureVersion(entry, entity, { now });
  normalizeStructureVersionMap(versionMap, { now });
  return entry;
}

export function recordStructureVersionTransition(
  versionMap,
  { beforeProject, afterProject, reference, label = "", operationType = "snapshot", now = new Date() } = {}
) {
  const afterEntity = findStructureVersionEntity(afterProject, reference);
  if (!afterEntity) {
    return null;
  }

  const beforeEntity = findStructureVersionEntity(beforeProject, reference);
  if (!beforeEntity) {
    return ensureStructureVersionEntry(versionMap, reference, afterEntity, { now });
  }

  const entry = ensureStructureVersionEntry(versionMap, reference, beforeEntity, { now });
  if (!entry) {
    return null;
  }

  replaceActiveStructureVersion(entry, beforeEntity, { now });
  const parentVersionId = entry.activeVersionId;
  insertStructureVersionAfterActive(entry, afterEntity, {
    label: label || `Iteração ${entry.versions.length + 1}`,
    operationType,
    parentVersionId,
    now
  });
  normalizeStructureVersionMap(versionMap, { now });
  return entry;
}

export function createStructureSnapshot(versionMap, { project, reference, label = "", now = new Date() } = {}) {
  const entity = findStructureVersionEntity(project, reference);
  if (!entity) {
    return null;
  }

  const entry = ensureStructureVersionEntry(versionMap, reference, entity, { now });
  if (!entry) {
    return null;
  }

  if ((entry.versions || []).length === 1 && entry.versions[0]?.operationType === "seed") {
    entry.versions[0].operationType = "snapshot";
    entry.versions[0].label = label || "Snapshot 1";
    entry.versions[0].updatedAt = now instanceof Date ? now.toISOString() : new Date(now).toISOString();
  } else {
    insertStructureVersionAfterActive(entry, entity, {
      label: label || `Snapshot ${(entry.versions || []).length + 1}`,
      operationType: "snapshot",
      parentVersionId: "",
      now
    });
  }

  normalizeStructureVersionMap(versionMap, { now });
  return entry;
}

export function createManualStructureRestore(versionMap, { project, reference, versionId, now = new Date() } = {}) {
  const currentEntity = findStructureVersionEntity(project, reference);
  if (!currentEntity) {
    return null;
  }

  const entry = ensureStructureVersionEntry(versionMap, reference, currentEntity, { now });
  if (!entry) {
    return null;
  }

  replaceActiveStructureVersion(entry, currentEntity, { now });
  const sourceVersion = (entry.versions || []).find((item) => item.id === versionId);
  if (!sourceVersion?.snapshot) {
    return null;
  }

  const restoredVersion = insertStructureVersionAfterActive(entry, sourceVersion.snapshot, {
    label: `Retomada ${entry.versions.length + 1}`,
    operationType: "manual-restore",
    parentVersionId: sourceVersion.id,
    now
  });
  if (!restoredVersion) {
    return null;
  }

  normalizeStructureVersionMap(versionMap, { now });

  return {
    entry,
    restoredVersion,
    snapshot: structuredClone(sourceVersion.snapshot)
  };
}
