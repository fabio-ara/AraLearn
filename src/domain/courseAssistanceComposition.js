import { flattenCourseDocument } from "./courseEntities.js";

const SCOPES = new Set(["study_unit", "didactic_microsequence", "lesson"]);

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
  const microsequenceIds = new Set();
  if (scope === "lesson") {
    rows.filter(({ entityType, parentId }) =>
      entityType === "microsequence" && parentId === selection.lessonId)
      .forEach(({ entityId }) => microsequenceIds.add(entityId));
  } else {
    microsequenceIds.add(selection.microsequenceId);
  }
  return rows.filter((row) => {
    if (scope === "study_unit") {
      return row.entityType === "study_unit" && row.entityId === selection.studyUnitId;
    }
    if (row.entityType === "microsequence") return microsequenceIds.has(row.entityId);
    return row.entityType === "study_unit" && microsequenceIds.has(row.parentId);
  });
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
