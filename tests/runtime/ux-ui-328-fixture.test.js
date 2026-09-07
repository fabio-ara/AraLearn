import assert from "node:assert/strict";
import test from "node:test";
import { createUxUi328Fixture } from "../fixtures/uxUi328Fixture.js";
import { normalizeCourseInspectionPage } from "../../src/ui/CourseInspectionSequence.js";
import { normalizeCourseAuthoringPlan, normalizeCourseDesign } from "../../src/ui/courseAuthoringViewModel.js";
import { normalizeCourseAnchoredAnnotationPage } from "../../src/domain/courseAnchoredAnnotations.js";

test("fixture #328 usa projeções válidas e mantém dois lotes sem dependência hospedada", async () => {
  const fixture = createUxUi328Fixture();
  const { controller, course } = fixture;
  assert.equal(fixture.events.length, 2);
  assert.notEqual(fixture.events[0].timestamp, fixture.events[1].timestamp);
  assert.equal(fixture.events[1].revision, fixture.events[0].revision + 1);
  const plan = normalizeCourseAuthoringPlan(await controller.loadAuthoringPlan(), { expectedCourseId: course.courseId, expectedCourseRevision: course.revision });
  assert.equal(plan.plan.curriculumScopeItems.length, 45);
  assert.equal(plan.plan.parts.length, 2);
  assert.equal(plan.plan.curriculum.modules.flatMap(module => module.lessons.flatMap(lesson => lesson.microsequences)).length, 8);
  const scope = { kind: "course", id: null };
  const page = normalizeCourseInspectionPage(await controller.loadAuthoringStudyUnits(course.courseId, {
    expectedRevision: course.revision, scope, limit: 12, anchorStudyUnitId: "ux328-unit-01"
  }), { expectedCourseId: course.courseId, expectedRevision: course.revision, expectedScope: scope });
  assert.equal(page.items.length, 12); assert.equal(page.totalCount, 36); assert.equal(page.hasMore, true);
  for (const [kind, id, count, firstUnit] of [["module", "module-1", 18, "ux328-unit-01"], ["lesson", "lesson-1-1", 10, "ux328-unit-01"],
    ["didactic_microsequence", "micro-1-1-2", 5, "ux328-unit-06"], ["authoring_part", fixture.plan.parts[1].id, 18, "ux328-unit-19"], ["unassigned", null, 0, null]]) {
    const narrowedScope = { kind, id };
    const narrowed = normalizeCourseInspectionPage(await controller.loadAuthoringStudyUnits(course.courseId, {
      expectedRevision: course.revision, scope: narrowedScope, limit: 12
    }), { expectedCourseId: course.courseId, expectedRevision: course.revision, expectedScope: narrowedScope });
    assert.equal(narrowed.totalCount, count);
    assert.equal(narrowed.items[0]?.studyUnit.id ?? null, firstUnit);
    assert.deepEqual(narrowed.items.map(item => item.ordinal), Array.from({ length: Math.min(count, 12) }, (_, index) => index + 1));
  }
  for (const [kind, ref] of [["course", course.courseId], ["module", "module-1"], ["lesson", "lesson-1-1"],
    ["didactic_microsequence", "micro-1-1-1"], ["study_unit", "ux328-unit-01"]]) {
    const design = normalizeCourseDesign(await controller.loadCourseDesign(course.courseId, { scope: { kind, ref } }), {
      expectedCourseId: course.courseId, expectedCourseRevision: course.revision, expectedScope: { kind, ref }
    });
    assert.ok(design.parameters.some(parameter => parameter.effectiveAssignment.mode === "automatic"));
    const fixed = design.parameters.find(parameter => parameter.parameterId === "study_unit_content_word_target");
    assert.equal(fixed.effectiveAssignment.mode, "fixed");
    assert.equal(fixed.effectiveAssignment.inherited, kind !== "course");
  }
  for (const [unitId, count] of [["ux328-unit-01", 1], ["ux328-unit-02", 1], ["ux328-unit-03", 0]]) {
    const query = { mode: "target", origins: [], channels: [], states: [], categories: [], includeUncategorized: true,
      subjectIds: [], hierarchy: { target: { kind: "study_unit", id: unitId }, includeDescendants: false }, annotationId: null };
    const observations = normalizeCourseAnchoredAnnotationPage(await controller.loadCourseAnchoredAnnotations(course.courseId, { query }));
    assert.equal(observations.items.length, count);
    assert.equal(observations.summary.matchingTotal, count);
    assert.ok(observations.items.every(item => item.target.id === unitId));
  }
});
