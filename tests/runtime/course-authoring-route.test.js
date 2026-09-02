import assert from "node:assert/strict";
import test from "node:test";

import {
  buildCourseAuthoringRoute,
  isCanonicalCourseId,
  isCourseAuthoringRouteCandidate,
  parseCourseAuthoringRoute
} from "../../src/ui/courseAuthoringRoute.js";

const COURSE_ID = "10000000-0000-4000-8000-000000000001";
const UUID = "abcdefab-cdef-4abc-8def-abcdefabcdef";

test("rota canônica abre o Conteúdo e preserva somente as sete tarefas humanas", () => {
  assert.equal(
    buildCourseAuthoringRoute(COURSE_ID),
    `#/authoring/courses/${COURSE_ID}?section=content`
  );
  for (const section of [
    "content", "planning", "parameters", "sources", "review", "research", "people"
  ]) {
    const hash = buildCourseAuthoringRoute(COURSE_ID, { section });
    assert.equal(hash, `#/authoring/courses/${COURSE_ID}?section=${section}`);
    assert.deepEqual(parseCourseAuthoringRoute(hash), { courseId: COURSE_ID, section, target: null });
  }
});

test("rota canônica abre tarefa, objeto e detalhe humano", () => {
  const examples = [
    [{ section: "planning", authoringPartId: UUID }, { kind: "authoring_part", id: UUID }],
    [{ section: "content", moduleId: "modulo-1" }, { kind: "module", id: "modulo-1" }],
    [{ section: "content", lessonId: "licao/1" }, { kind: "lesson", id: "licao/1" }],
    [{ section: "content", topicId: "topico-1" }, { kind: "topic", id: "topico-1" }],
    [{ section: "content", didacticMicrosequenceId: "micro 1" }, {
      kind: "didactic_microsequence", id: "micro 1"
    }],
    [{ section: "content", studyUnitId: "unidade-1" }, { kind: "study_unit", id: "unidade-1" }],
    [{ section: "parameters", studyUnitId: "unidade-1" }, { kind: "study_unit", id: "unidade-1" }],
    [{ section: "content", unassigned: true }, { kind: "unassigned", id: null }],
    [{ section: "review", annotationId: UUID }, { kind: "anchored_annotation", id: UUID }],
    [{ section: "review", studyUnitId: "unidade-1" }, { kind: "study_unit", id: "unidade-1" }]
  ];
  for (const [options, target] of examples) {
    assert.deepEqual(parseCourseAuthoringRoute(buildCourseAuthoringRoute(COURSE_ID, options)), {
      courseId: COURSE_ID, section: options.section, target
    });
  }
  assert.deepEqual(parseCourseAuthoringRoute(buildCourseAuthoringRoute(COURSE_ID, {
    section: "sources", sourceId: "  fonte/literal-á  ", anchorId: "ancora:1"
  })), {
    courseId: COURSE_ID,
    section: "sources",
    target: { kind: "course_source", id: "  fonte/literal-á  ", anchorId: "ancora:1" }
  });
});

test("parser rejeita overview e aliases do shell substituído", () => {
  for (const removed of ["overview", "structure", "inspection", "observations", "variants"]) {
    assert.equal(
      parseCourseAuthoringRoute(`#/authoring/courses/${COURSE_ID}?section=${removed}`),
      null
    );
  }
});

test("parser rejeita identidades, detalhes e combinações alheias à tarefa", () => {
  const invalidHashes = [
    `#/authoring/courses/${UUID.toUpperCase()}?section=content`,
    "#/authoring/courses/10000000-0000-0000-8000-000000000001?section=content",
    `#/authoring/courses/${COURSE_ID}`,
    `#/authoring/courses/${COURSE_ID}?section=map`,
    `#/authoring/courses/${COURSE_ID}?section=parameters&topicId=a`,
    `#/authoring/courses/${COURSE_ID}?section=content&annotationId=${UUID}`,
    `#/authoring/courses/${COURSE_ID}?section=review&moduleId=a`,
    `#/authoring/courses/${COURSE_ID}?section=research&authoringPartId=${UUID}`,
    `#/authoring/courses/${COURSE_ID}?section=review&correctionId=${UUID}`,
    `#/authoring/courses/${COURSE_ID}?section=sources&anchorId=ancora-1`,
    `#/authoring/courses/${COURSE_ID}?section=planning&authoringPartId=${UUID}&materializationId=${COURSE_ID}`,
    `#/authoring/courses/${COURSE_ID}?section=content&moduleId=a&lessonId=b`,
    `#/authoring/courses/${COURSE_ID}?section=content&studyUnitId=a&returnAuthoringPartId=${UUID}`,
    `#/authoring/courses/${COURSE_ID}?section=content&studyUnitId=a&returnMaterializationId=${UUID}`,
    `#/authoring/courses/${COURSE_ID}?moduleId=a&section=content`,
    `#/authoring/courses/${COURSE_ID}/content?section=content`,
    `#/authoring/course/${COURSE_ID}?section=content`
  ];
  invalidHashes.forEach((hash) => assert.equal(parseCourseAuthoringRoute(hash), null));
  assert.equal(isCanonicalCourseId(COURSE_ID), true);
  assert.equal(isCanonicalCourseId(UUID.toUpperCase()), false);
  assert.equal(isCourseAuthoringRouteCandidate(invalidHashes[3]), true);
  assert.equal(isCourseAuthoringRouteCandidate(invalidHashes.at(-1)), false);
});

test("construtor falha cedo sem reduzir silenciosamente o destino", () => {
  assert.throws(() => buildCourseAuthoringRoute("curso-a"), /Identidade de Curso inválida/u);
  assert.throws(() => buildCourseAuthoringRoute(COURSE_ID, {
    section: "content", moduleId: "a", lessonId: "b"
  }), /somente um alvo/u);
  assert.throws(() => buildCourseAuthoringRoute(COURSE_ID, {
    section: "planning", authoringPartId: UUID, materializationId: COURSE_ID
  }), /Opções inválidas/u);
  assert.throws(() => buildCourseAuthoringRoute(COURSE_ID, {
    section: "review", correctionId: UUID
  }), /Opções inválidas/u);
  assert.throws(() => buildCourseAuthoringRoute(COURSE_ID, {
    section: "sources", anchorId: "ancora-1"
  }), /âncora exige uma Fonte literal/u);
  assert.throws(() => buildCourseAuthoringRoute(COURSE_ID, {
    section: "content", studyUnitId: "a", returnAuthoringPartId: UUID
  }), /Opções inválidas/u);
  assert.throws(() => buildCourseAuthoringRoute(COURSE_ID, {
    section: "content", mode: "edit"
  }), /Opções inválidas/u);
  assert.throws(() => buildCourseAuthoringRoute(COURSE_ID, {
    section: "notes"
  }), /Seção de Curso inválida/u);
});
