import test from "node:test";
import assert from "node:assert/strict";

import {
  CourseEntityError,
  composeCourseDocument,
  courseEntityOutline,
  flattenCourseDocument,
  normalizeCourseEntityRows,
  validateCourseEntityContent
} from "../../src/domain/courseEntities.js";

function documentFixture() {
  return {
    contract: "aralearn.course.v1",
    courses: [{
      id: "course-a",
      title: "Curso A",
      goal: "Compreender A.",
      modules: [{
        id: "module-a",
        title: "Módulo A",
        guide: {
          goal: "Delimitar A.",
          include: ["A"],
          exclude: [],
          notation: [],
          avoid: []
        },
        lessons: [{
          id: "lesson-a",
          title: "Lição A",
          guide: {
            goal: "Ensinar A.",
            include: ["A"],
            exclude: [],
            notation: [],
            avoid: []
          },
          topics: [{
            id: "topic-a",
            label: "A",
            kind: "concept",
            checks: ["reconhecer A"],
            errors: ["confundir A"]
          }],
          microsequences: [{
            id: "microsequence-a",
            title: "Microssequência A",
            goal: "Explicar A.",
            role: "explain",
            dependsOn: [],
            covers: ["A"],
            checks: ["reconhecer A"],
            errors: ["confundir A"],
            studyUnits: [{
              id: "card-a",
              position: 1,
              title: "A",
              role: "theory",
              content: [{
                id: "content-a",
                package: "aralearn.resource.paragraph",
                version: "1.0.0",
                data: { text: "A é apresentado aqui." }
              }],
              response: null,
              feedback: [],
              topics: []
            }]
          }]
        }]
      }]
    }]
  };
}

test("achata e recompõe um Curso sem envelopes de Workspace ou publicação", () => {
  const source = documentFixture();
  const flattened = flattenCourseDocument(source);

  assert.deepEqual(flattened.course, {
    id: "course-a",
    title: "Curso A",
    goal: "Compreender A."
  });
  assert.deepEqual(
    flattened.rows.map(({ entityType }) => entityType),
    ["module", "lesson", "topic", "microsequence", "study_unit"]
  );
  assert.equal(flattened.rows[0].parentType, null);
  assert.equal(flattened.rows[0].parentId, null);
  assert.equal(flattened.rows.some(({ entityType }) => entityType === "course"), false);
  assert.equal(flattened.rows.some(({ entityType }) => entityType === "project"), false);
  assert.deepEqual(composeCourseDocument(flattened.course, flattened.rows), source);
});

test("Curso em planejamento pode existir sem entidades didáticas", () => {
  assert.deepEqual(
    composeCourseDocument({ id: "course-empty", title: "Curso vazio", goal: "Planejar." }, []),
    {
      contract: "aralearn.course.v1",
      courses: [{
        id: "course-empty",
        title: "Curso vazio",
        goal: "Planejar.",
        modules: []
      }]
    }
  );
});

test("outline deriva contagens da composição corrente", () => {
  const { course, rows } = flattenCourseDocument(documentFixture());
  const outline = courseEntityOutline(course, rows);

  assert.equal(outline.courseId, "course-a");
  assert.equal(outline.modules[0].lessons[0].microsequences[0].studyUnitCount, 1);
});

test("rejeita pai ausente e posição estrutural não contígua", () => {
  const { rows } = flattenCourseDocument(documentFixture());
  const orphan = structuredClone(rows);
  orphan.find(({ entityType }) => entityType === "lesson").parentId = "module-missing";
  assert.throws(
    () => normalizeCourseEntityRows(orphan),
    (error) => error instanceof CourseEntityError &&
      error.code === "course_entity_parent_not_found"
  );

  const nonContiguous = structuredClone(rows);
  nonContiguous.find(({ entityType }) => entityType === "module").position = 2;
  assert.throws(
    () => normalizeCourseEntityRows(nonContiguous),
    (error) => error instanceof CourseEntityError &&
      error.code === "non_contiguous_course_entity_positions"
  );
});

test("rejeita identidade estrutural duplicada no conteúdo JSON", () => {
  const { rows } = flattenCourseDocument(documentFixture());
  rows[0].content.id = "module-shadow";
  assert.throws(
    () => normalizeCourseEntityRows(rows),
    (error) => error instanceof CourseEntityError &&
      error.code === "duplicated_course_entity_field"
  );
});

test("rejeita o tipo de entidade substituído sem alias", () => {
  const { rows } = flattenCourseDocument(documentFixture());
  const legacyRow = rows.find(({ entityType }) => entityType === "study_unit");
  legacyRow.entityType = "card";
  assert.throws(
    () => normalizeCourseEntityRows(rows),
    (error) => error instanceof CourseEntityError &&
      error.code === "invalid_course_entity_identity"
  );
});

test("valida o conteúdo semântico de cada tipo sem recompor o Curso inteiro", () => {
  const { rows } = flattenCourseDocument(documentFixture());
  for (const row of rows) {
    const result = validateCourseEntityContent(row.entityType, {
      id: row.entityId,
      position: row.position,
      ...row.content
    });
    assert.equal(result.valid, true, JSON.stringify(result.errors));
    assert.equal(result.normalized.id, row.entityId);
    assert.equal(result.normalized.position, row.position);
  }

  const invalidModule = rows.find(({ entityType }) => entityType === "module");
  invalidModule.content.guide.include = "A";
  const moduleResult = validateCourseEntityContent("module", {
    id: invalidModule.entityId,
    position: invalidModule.position,
    ...invalidModule.content
  });
  assert.equal(moduleResult.valid, false);
  assert.match(moduleResult.errors[0].path, /guide\.include/u);

  const invalidMicrosequence = rows.find(({ entityType }) => entityType === "microsequence");
  invalidMicrosequence.content.role = "invalid";
  const microsequenceResult = validateCourseEntityContent("microsequence", {
    id: invalidMicrosequence.entityId,
    position: invalidMicrosequence.position,
    ...invalidMicrosequence.content
  });
  assert.equal(microsequenceResult.valid, false);
  assert.match(microsequenceResult.errors[0].path, /role/u);
});

test("validador segmentado rejeita relações embutidas e tipo substituído", () => {
  const relationResult = validateCourseEntityContent("lesson", {
    id: "lesson-a",
    position: 0,
    title: "Lição A",
    guide: {
      goal: "Ensinar A.",
      include: ["A"],
      exclude: [],
      notation: [],
      avoid: []
    },
    topics: []
  });
  assert.equal(relationResult.valid, false);
  assert.equal(relationResult.errors[0].path, "$.topics");

  const legacyResult = validateCourseEntityContent("card", {
    id: "legacy-a",
    position: 1
  });
  assert.equal(legacyResult.valid, false);
  assert.equal(legacyResult.normalized, null);

  assert.equal(validateCourseEntityContent("__proto__", {}).valid, false);
});
