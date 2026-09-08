import test from "node:test";
import assert from "node:assert/strict";
import { CourseMicrosequenceReviewSession, loadMicrosequenceReviewSnapshot, applyExplanationTextFields } from "../../src/ui/CourseMicrosequenceReview.js";
import { microsequenceReviewExport, REVIEW_COURSE_ID as courseId, REVIEW_MS_ID as microsequenceId } from "../helpers/courseMicrosequenceReviewFixture.js";

const BASIS = "a".repeat(64); const NEXT = "b".repeat(64);
function setup() {
  const stored = new Map(); const calls = []; let basisHash = BASIS; let state = "draft";
  let failure = null; let revision = 7; let exportHook = null; let afterApprove = null;
  const controller = {
    store: { async getCache(key) { return structuredClone(stored.get(key) || null); }, async putCache(key, value) {
      if (value === null) stored.delete(key); else stored.set(key, structuredClone(value));
    } },
    async getMicrosequenceReview(course, ms) { calls.push(["read", course, ms]); return { courseId: course, microsequenceId: ms, basisHash, contentReview: { state } }; },
    async exportCourseAuthoring(selection) { calls.push(["export", selection]); if (exportHook) exportHook(); return microsequenceReviewExport({ revision }); },
    async approveMicrosequenceContent(request) {
      calls.push(["approve", structuredClone(request)]); if (failure) throw failure;
      state = "current";
      const receipt = { courseId, microsequenceId, basisHash: request.expectedBasisHash,
        contentReview: { state }, courseRevision: 8, idempotent: false };
      afterApprove?.(); return receipt;
    },
    async saveMicrosequenceExplanation(request) { calls.push(["save", structuredClone(request)]); if (failure) throw failure;
      revision = 8; state = "draft"; basisHash = NEXT; return { courseId, revision, changed: true, idempotent: false }; }
  };
  const session = () => new CourseMicrosequenceReviewSession({ controller, courseId, microsequenceId, expectedRevision: 7, uuid: () => "request-review-unique-0001" });
  return { controller, calls, stored, session, setBasis(value) { basisHash = value; }, setFailure(value) { failure = value; },
    setExportHook(value) { exportHook = value; }, setAfterApprove(value) { afterApprove = value; }, setRevision(value) { revision = value; } };
}

test("snapshot cerca o recorte completo remoto com a mesma base e recusa mistura de revisão", async () => {
  const fixture = setup(); const snapshot = await fixture.session().load();
  assert.deepEqual(fixture.calls.map(call => call[0]), ["read", "export", "read"]);
  assert.equal(snapshot.microsequence.studyUnits.length, 2); assert.equal(snapshot.entityVersion, 2);
  assert.equal(snapshot.basisHash, BASIS); assert.equal(snapshot.courseRevision, 7);
  fixture.setExportHook(() => fixture.setBasis(NEXT));
  await assert.rejects(loadMicrosequenceReviewSnapshot(fixture.controller, { courseId, microsequenceId, expectedRevision: 7 }), error => error.status === 409);
  fixture.setExportHook(null); fixture.setRevision(8);
  await assert.rejects(fixture.session().load(), /edição|revisão/u);
});

test("aprovação exige decisão explícita e base do conjunto visto, sem escrever após concorrência", async () => {
  const fixture = setup(); const session = fixture.session(); await session.load();
  await assert.rejects(session.approve(), /explicitamente/u);
  fixture.setBasis(NEXT);
  await assert.rejects(session.approve({ confirmed: true }), error => error.status === 409);
  assert.equal(fixture.calls.some(call => call[0] === "approve"), false);
  fixture.setBasis(BASIS);
  const result = await session.approve({ confirmed: true });
  assert.equal(result.stillCurrent, true);
  assert.equal(fixture.calls.find(call => call[0] === "approve")[1].expectedBasisHash, BASIS);
  assert.equal(fixture.stored.size, 0);
});

test("aprovação incerta sobrevive reabertura e confirma a mesma identidade antes de nova decisão", async () => {
  const fixture = setup(); const first = fixture.session(); await first.load();
  fixture.setFailure(Object.assign(new Error("Tempo esgotado"), { status: 504 }));
  await assert.rejects(first.approve({ confirmed: true }));
  assert.equal(fixture.stored.size, 1);
  const reopened = fixture.session(); await reopened.load();
  fixture.setFailure(null);
  await reopened.approve();
  assert.deepEqual(fixture.calls.filter(call => call[0] === "approve").map(call => call[1]), [
    { courseId, microsequenceId, expectedBasisHash: BASIS, requestId: "request-review-unique-0001" },
    { courseId, microsequenceId, expectedBasisHash: BASIS, requestId: "request-review-unique-0001" }
  ]);
});

test("replay confirmado não apresenta aprovação antiga como atual depois de uma mudança", async () => {
  const fixture = setup(); const session = fixture.session(); await session.load();
  fixture.setAfterApprove(() => fixture.setBasis(NEXT));
  const result = await session.approve({ confirmed: true });
  assert.equal(result.stillCurrent, false); assert.equal(session.needsReinspection, true);
  await assert.rejects(session.approve({ confirmed: true }), error => error.status === 409);
  assert.equal(fixture.calls.filter(call => call[0] === "approve").length, 1);
});

test("resultado incerto pode ser reconciliado mesmo quando nova revisão impede reinspeção antiga", async () => {
  const fixture = setup(); const first = fixture.session(); await first.load();
  fixture.setFailure(Object.assign(new Error("Sem resposta"), { status: 503 }));
  await assert.rejects(first.approve({ confirmed: true }));
  fixture.setRevision(8); fixture.setFailure(null);
  const reopened = fixture.session(); await assert.rejects(reopened.load());
  const result = await reopened.approve(); assert.equal(result.receipt.courseRevision, 8);
  assert.equal(fixture.stored.size, 0);
});

test("edição de texto usa contrato existente, preserva outros campos e retorna rascunho sem aprovar", async () => {
  const fixture = setup(); const session = fixture.session(); const snapshot = await session.load();
  const original = snapshot.microsequence.explanation;
  const changed = applyExplanationTextFields(original, [{ targetId: "content:support-text", path: "text", value: "A interface local não é a conexão inteira." }]);
  assert.equal(changed.title, original.title); assert.equal(original.content[0].data.text, "Um socket é a interface local usada pelo processo.");
  const result = await session.saveExplanation(changed);
  assert.equal(result.courseRevision, 8);
  assert.equal(fixture.calls.filter(call => call[0] === "approve").length, 0);
  assert.deepEqual(fixture.calls.find(call => call[0] === "save")[1].explanation, changed);
});
