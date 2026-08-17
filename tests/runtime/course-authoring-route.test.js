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

test("rota canônica preserva courseId, seção real e um único alvo compatível", () => {
  for (const section of [
    "planning", "parameters", "sources", "structure", "inspection", "observations", "people"
  ]) {
    const hash = buildCourseAuthoringRoute(COURSE_ID, { section });
    assert.equal(hash, `#/authoring/courses/${COURSE_ID}?section=${section}`);
    assert.deepEqual(parseCourseAuthoringRoute(hash), { courseId: COURSE_ID, section, target: null });
  }
  const targets = [
    ["authoringPartId", LETTERED_COURSE_ID, "authoring_part"],
    ["moduleId", "modulo-1", "module"],
    ["lessonId", "licao/1", "lesson"],
    ["didacticMicrosequenceId", "micro 1", "didactic_microsequence"],
    ["studyUnitId", "unidade-1", "study_unit"]
  ];
  targets.forEach(([option, id, kind]) => {
    const hash = buildCourseAuthoringRoute(COURSE_ID, {
      section: "inspection",
      [option]: id
    });
    assert.deepEqual(parseCourseAuthoringRoute(hash), {
      courseId: COURSE_ID,
      section: "inspection",
      target: { kind, id }
    });
  });
  assert.deepEqual(parseCourseAuthoringRoute(buildCourseAuthoringRoute(COURSE_ID, {
    section: "inspection",
    unassigned: true
  })), {
    courseId: COURSE_ID,
    section: "inspection",
    target: { kind: "unassigned", id: null }
  });
  assert.deepEqual(parseCourseAuthoringRoute(buildCourseAuthoringRoute(COURSE_ID, {
    section: "observations",
    annotationId: LETTERED_COURSE_ID
  })), {
    courseId: COURSE_ID,
    section: "observations",
    target: { kind: "anchored_annotation", id: LETTERED_COURSE_ID }
  });
  for (const [option, id, kind] of targets.slice(1, 4)) {
    const hash = buildCourseAuthoringRoute(COURSE_ID, {
      section: "parameters",
      [option]: id
    });
    assert.deepEqual(parseCourseAuthoringRoute(hash), {
      courseId: COURSE_ID,
      section: "parameters",
      target: { kind, id }
    });
  }
});

test("parser rejeita UUID não canônico, parâmetros extras e outros caminhos", () => {
  const invalidHashes = [
    `#/authoring/courses/${LETTERED_COURSE_ID.toUpperCase()}?section=structure`,
    "#/authoring/courses/10000000-0000-0000-8000-000000000001?section=structure",
    `#/authoring/courses/${COURSE_ID}`,
    `#/authoring/courses/${COURSE_ID}?section=map`,
    `#/authoring/courses/${COURSE_ID}?section=content`,
    `#/authoring/courses/${COURSE_ID}?section=parameters&studyUnitId=a`,
    `#/authoring/courses/${COURSE_ID}?section=parameters&authoringPartId=${LETTERED_COURSE_ID}`,
    `#/authoring/courses/${COURSE_ID}?section=inspection&annotationId=${LETTERED_COURSE_ID}`,
    `#/authoring/courses/${COURSE_ID}?section=observations&studyUnitId=a`,
    `#/authoring/courses/${COURSE_ID}?section=inspection&moduleId=a&lessonId=b`,
    `#/authoring/courses/${COURSE_ID}?moduleId=a&section=inspection`,
    `#/authoring/courses/${COURSE_ID}/inspection?section=inspection`,
    `#/authoring/course/${COURSE_ID}?section=inspection`
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
    () => buildCourseAuthoringRoute(COURSE_ID, {
      section: "inspection",
      moduleId: "a",
      lessonId: "b"
    }),
    /somente um alvo/u
  );
  assert.throws(
    () => buildCourseAuthoringRoute(COURSE_ID, { section: "structure", moduleId: "a" }),
    /não pertence à seção/u
  );
  assert.throws(
    () => buildCourseAuthoringRoute(COURSE_ID, {
      section: "parameters",
      studyUnitId: "a"
    }),
    /não pertence à seção/u
  );
  assert.throws(
    () => buildCourseAuthoringRoute(COURSE_ID, { section: "inspection", mode: "edit" }),
    /Opções inválidas/u
  );
  assert.throws(
    () => buildCourseAuthoringRoute(COURSE_ID, { section: "notes" }),
    /Seção de Curso inválida/u
  );
});
