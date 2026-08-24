import { flattenCourseDocument } from "./courseEntities.js";

const SCOPES = new Set([
  "study_unit",
  "didactic_microsequence",
  "lesson",
  "module",
  "course"
]);

function clone(value) {
  return structuredClone(value);
}

function rowKey(row) {
  return `${row.entityType}\u0000${row.entityId}`;
}

function comparableRow(row) {
  return {
    entityType: row.entityType,
    entityId: row.entityId,
    parentType: row.parentType,
    parentId: row.parentId,
    position: row.position,
    content: row.content
  };
}

function affectedRows(rows, selection, scope) {
  if (scope === "course") return rows;
  const identity = scope === "study_unit"
    ? { entityType: "study_unit", entityId: selection.studyUnitId }
    : scope === "didactic_microsequence"
      ? { entityType: "microsequence", entityId: selection.microsequenceId }
      : scope === "lesson"
        ? { entityType: "lesson", entityId: selection.lessonId }
        : { entityType: "module", entityId: selection.moduleId };
  const included = new Set([rowKey(identity)]);
  let changed = true;
  while (changed) {
    changed = false;
    rows.forEach((row) => {
      if (included.has(rowKey(row)) || row.parentType === null) return;
      if (included.has(`${row.parentType}\u0000${row.parentId}`)) {
        included.add(rowKey(row));
        changed = true;
      }
    });
  }
  return rows.filter((row) => included.has(rowKey(row)));
}

export function buildCourseAssistanceCompositionChange({
  originalProject,
  proposedProject,
  selection,
  scope
} = {}) {
  if (!SCOPES.has(scope) || !selection || typeof selection !== "object") {
    throw new TypeError("Escopo estrutural inválido.");
  }
  const originalCourse = originalProject?.courses?.find(({ id }) => id === selection.courseId);
  const proposedCourse = proposedProject?.courses?.find(({ id }) => id === selection.courseId);
  const original = flattenCourseDocument({
    contract: originalProject?.contract,
    courses: originalCourse ? [clone(originalCourse)] : []
  });
  const proposed = flattenCourseDocument({
    contract: proposedProject?.contract,
    courses: proposedCourse ? [clone(proposedCourse)] : []
  });
  if (original.course.id !== proposed.course.id ||
      original.course.id !== selection.courseId) {
    throw new TypeError("A proposta não corresponde ao Curso selecionado.");
  }
  const before = affectedRows(original.rows, selection, scope);
  const after = affectedRows(proposed.rows, selection, scope);
  const beforeByKey = new Map(before.map((row) => [rowKey(row), row]));
  const afterByKey = new Map(after.map((row) => [rowKey(row), row]));
  const upserts = after.filter((row) => {
    const prior = beforeByKey.get(rowKey(row));
    return !prior || JSON.stringify(comparableRow(prior)) !==
      JSON.stringify(comparableRow(row));
  }).map(comparableRow);
  const deletes = before.filter((row) => !afterByKey.has(rowKey(row)))
    .map(({ entityType, entityId }) => ({ entityType, entityId }));
  const changedStudyUnitIds = upserts.filter(({ entityType }) => entityType === "study_unit")
    .map(({ entityId }) => entityId);
  return Object.freeze({
    courseId: original.course.id,
    scope,
    upserts: clone(upserts),
    deletes: clone(deletes),
    changedStudyUnitIds: Object.freeze([...changedStudyUnitIds]),
    changed: upserts.length > 0 || deletes.length > 0
  });
}
