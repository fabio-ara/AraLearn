import test from "node:test";
import assert from "node:assert/strict";
import { normalizeCourseContentReview, normalizeCourseContentReviewChange, normalizeCourseContentReviewPolicyChange,
  normalizeCourseContentReviewState } from "../../src/domain/courseContentReview.js";

const courseId = "20000000-0000-4000-8000-000000000001";
const basisHash = "a".repeat(64);
const read = (state = "draft") => ({ contract: "aralearn.course-content-review.v1", courseId, courseRevision: 4,
  targetKind: "study_unit", targetId: "unit-a", entityVersion: 2, basisHash,
  contentReview: ["current", "stale"].includes(state) ? { state, reviewedAt: "2026-09-09T03:00:00+00:00" } : { state }, reviewPolicy: "saved" });

test("revisão normaliza estados independentes por objeto sem reclassificar acesso", () => {
  for (const state of ["unregistered", "draft", "current", "stale"]) {
    const value = read(state); assert.deepEqual(normalizeCourseContentReview(value), value);
    assert.notEqual(normalizeCourseContentReview(value).contentReview, value.contentReview);
  }
  const value = { ...read(), targetKind: "microsequence_explanation", reviewPolicy: "reviewed_only" };
  assert.deepEqual(normalizeCourseContentReview(value, { courseId, targetKind: "microsequence_explanation" }), value);
});

test("revisão recusa campos importáveis, estados fabricados, identidade e confirmação incompatível", () => {
  for (const invalid of [{ ...read(), content: {} }, { ...read(), basisHash: "fake" }, { ...read(), courseRevision: 0 },
    { ...read(), entityVersion: 1.5 }, { ...read(), targetKind: "course" }, { ...read(), reviewPolicy: "public" },
    { ...read(), contentReview: { state: "approved" } }, { ...read(), contentReview: { state: "current" } },
    { ...read(), contentReview: { state: "draft", reviewedAt: "2026-09-09T03:00:00Z" } },
    { ...read(), contentReview: { state: "current", reviewedAt: "invalid" } },
    { ...read(), contentReview: { state: "draft", reviewedBy: courseId } }]) assert.throws(() => normalizeCourseContentReview(invalid));
  assert.throws(() => normalizeCourseContentReview(read(), { targetId: "unit-b" }), /objeto/u);
  assert.throws(() => normalizeCourseContentReviewState({ state: "draft", read: true }));
});

test("recibo valida decisão original inclusive replay e retirada de declaração", () => {
  const value = { ...read("current"), contract: "aralearn.course-content-review-change.v1", changed: true, idempotent: true };
  assert.deepEqual(normalizeCourseContentReviewChange(value, { expectedBasisHash: basisHash, reviewed: true }), value);
  assert.throws(() => normalizeCourseContentReviewChange(value, { expectedBasisHash: "b".repeat(64) }));
  assert.throws(() => normalizeCourseContentReviewChange(value, { reviewed: false }));
  const withdrawn = { ...value, contentReview: { state: "draft" }, idempotent: false };
  assert.deepEqual(normalizeCourseContentReviewChange(withdrawn, { reviewed: false }), withdrawn);
  assert.throws(() => normalizeCourseContentReviewChange({ ...value, changed: "yes" }));
});

test("política de revisão exige recibo próprio e não confunde visibilidade", () => {
  const value = { contract: "aralearn.course-content-review-policy.v1", courseId, courseRevision: 4,
    reviewPolicy: "reviewed_only", changed: true, idempotent: false };
  assert.deepEqual(normalizeCourseContentReviewPolicyChange(value, { courseId, policy: "reviewed_only" }), value);
  assert.throws(() => normalizeCourseContentReviewPolicyChange(value, { policy: "saved" }));
  assert.throws(() => normalizeCourseContentReviewPolicyChange({ ...value, visibility: "public" }));
});
