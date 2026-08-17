import assert from "node:assert/strict";
import test from "node:test";

import {
  buildCourseAuthoringRoute,
  isCanonicalCourseId,
  isCourseAuthoringRouteCandidate,
  parseCourseAuthoringRoute
} from "../../src/ui/courseAuthoringRoute.js";

const COURSE_ID = "10000000-0000-4000-8000-000000000001";
const LETTERED_COURSE_ID = "abcdefab-cdef-4abc-8def-abcdefabcdef";

test("rota canônica preserva somente courseId e a seção real", () => {
  for (const section of ["planning", "structure", "content"]) {
    const hash = buildCourseAuthoringRoute(COURSE_ID, { section });
    assert.equal(hash, `#/authoring/courses/${COURSE_ID}?section=${section}`);
    assert.deepEqual(parseCourseAuthoringRoute(hash), { courseId: COURSE_ID, section });
  }
});

test("parser rejeita UUID não canônico, parâmetros extras e outros caminhos", () => {
  const invalidHashes = [
    `#/authoring/courses/${LETTERED_COURSE_ID.toUpperCase()}?section=structure`,
    "#/authoring/courses/10000000-0000-0000-8000-000000000001?section=structure",
    `#/authoring/courses/${COURSE_ID}`,
    `#/authoring/courses/${COURSE_ID}?section=map`,
    `#/authoring/courses/${COURSE_ID}?section=content&mode=edit`,
    `#/authoring/courses/${COURSE_ID}/content?section=content`,
    `#/authoring/course/${COURSE_ID}?section=content`
  ];

  invalidHashes.forEach((hash) => assert.equal(parseCourseAuthoringRoute(hash), null));
  assert.equal(isCanonicalCourseId(COURSE_ID), true);
  assert.equal(isCanonicalCourseId(LETTERED_COURSE_ID.toUpperCase()), false);
  assert.equal(isCourseAuthoringRouteCandidate(invalidHashes[3]), true);
  assert.equal(isCourseAuthoringRouteCandidate(invalidHashes.at(-1)), false);
});

test("construtor de rota falha cedo para identidade ou seção inválida", () => {
  assert.throws(
    () => buildCourseAuthoringRoute("curso-a", { section: "structure" }),
    /Identidade de Curso inválida/u
  );
  assert.throws(
    () => buildCourseAuthoringRoute(COURSE_ID, { section: "notes" }),
    /Seção de Curso inválida/u
  );
});
