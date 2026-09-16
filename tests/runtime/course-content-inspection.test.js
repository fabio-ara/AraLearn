import assert from "node:assert/strict";
import test from "node:test";
import { normalizeCourseContentInspection, normalizeCourseContentInspectionReport } from "../../src/domain/courseContentInspection.js";
import { CourseApiClient } from "../../src/supabase/CourseApiClient.js";
import { renderCourseContentInspection } from "../../src/ui/renderCourseContentInspection.js";

const report = { summary: "Texto e fontes lidos; a preferência editorial humana foi preservada.",
  outcome: "human_preference_retained", findings: ["A forma alternativa de apresentar a referência foi mantida."] };
const payload = () => ({ contract: "aralearn.course-ai-inspection.v1", courseId: "10000000-0000-4000-8000-000000000001",
  courseRevision: 4, targetKind: "study_unit", targetId: "unit-a", basisHash: "a".repeat(64),
  inspection: { state: "current", basisHash: "a".repeat(64), inspectedAt: "2026-09-16T01:00:00Z", report } });

test("parecer semântico preserva escolha humana e identifica objeto e base efetivamente lidos", () => {
  const value = payload();
  assert.deepEqual(normalizeCourseContentInspection(value), value);
  assert.throws(() => normalizeCourseContentInspection(value, { targetId: "other" }));
  value.inspection.basisHash = "b".repeat(64);
  assert.throws(() => normalizeCourseContentInspection(value));
});

test("pendência e legado não carregam parecer corrente fictício; lacunas não são consistência", () => {
  const value = payload();
  for (const state of ["pending", "unregistered"]) {
    value.inspection = { state, basisHash: value.basisHash };
    assert.deepEqual(normalizeCourseContentInspection(value), value);
    assert.throws(() => normalizeCourseContentInspection({ ...value, inspection: { ...value.inspection, report } }));
  }
  assert.throws(() => normalizeCourseContentInspectionReport({ ...report, outcome: "consistent" }));
  assert.throws(() => normalizeCourseContentInspectionReport({ ...report, outcome: "needs_attention", findings: [] }));
  assert.throws(() => normalizeCourseContentInspectionReport({ ...report, summary: "x".repeat(2001) }));
});

test("cliente lê somente o objeto autorizado e a UI distingue parecer, pendência e falha", async () => {
  const value = payload();
  const calls = [];
  const client = { async rpc(name, args) { calls.push({ name, args }); return value; } };
  assert.deepEqual(await CourseApiClient.prototype.getContentInspection.call(client, value.courseId, value.targetKind, value.targetId), value);
  assert.deepEqual(calls, [{ name: "get_course_ai_inspection_v1", args: { p_course_id: value.courseId,
    p_target_kind: value.targetKind, p_target_id: value.targetId } }]);
  await assert.rejects(CourseApiClient.prototype.getContentInspection.call(client, value.courseId, value.targetKind, "other"));
  assert.match(renderCourseContentInspection(value.inspection), /preferência humana preservada/u);
  assert.match(renderCourseContentInspection({ state: "pending" }), /texto salvo continua vigente/u);
  assert.doesNotMatch(renderCourseContentInspection({ state: "pending" }), /<button|<input/u);
  assert.match(renderCourseContentInspection(null, "falha privada"), /parecer de inspeção por IA não está disponível/u);
  assert.doesNotMatch(renderCourseContentInspection(null, "falha privada"), /falha privada/u);
});
