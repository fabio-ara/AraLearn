import test from "node:test";
import assert from "node:assert/strict";

import {
  CourseEntityError,
  composeCourseDocument,
  courseEntityOutline,
  flattenCourseDocument,
  normalizeCourseEntityRows
} from "../../src/domain/courseEntities.js";

function documentFixture() {
  return {
    contract: "aralearn.library.v1",
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
            cards: [{
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
              topics: [],
              sources: []
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
    ["module", "lesson", "topic", "microsequence", "card"]
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
      contract: "aralearn.library.v1",
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
