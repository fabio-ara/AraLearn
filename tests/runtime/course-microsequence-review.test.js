import test from "node:test";
import assert from "node:assert/strict";
import { CourseMicrosequenceReviewSession, createCourseMicrosequenceReview, loadMicrosequenceReviewSnapshot, applyExplanationTextFields } from "../../src/ui/CourseMicrosequenceReview.js";
import { microsequenceReviewExport, REVIEW_COURSE_ID as courseId, REVIEW_MS_ID as microsequenceId } from "../helpers/courseMicrosequenceReviewFixture.js";

const BASIS = "a".repeat(64); const NEXT = "b".repeat(64);
function setup() {
  const stored = new Map(); const calls = []; let basisHash = BASIS; let state = "draft";
  let failure = null; let revision = 7; let exportHook = null; let afterReview = null; let requestSequence = 0;
  const read = (course, targetKind, targetId) => ({ contract: "aralearn.course-content-review.v1",
    courseId: course, targetKind, targetId, entityVersion: 2, courseRevision: revision, reviewPolicy: "saved", basisHash,
    contentReview: { state, ...(["current", "stale"].includes(state) ? { reviewedAt: "2026-09-09T12:00:00Z" } : {}) } });
  const controller = {
    store: { async getCache(key) { return structuredClone(stored.get(key) || null); }, async putCache(key, value) {
      if (value === null) stored.delete(key); else stored.set(key, structuredClone(value));
    } },
    async getContentReview(course, kind, id) { calls.push(["read", course, kind, id]); return read(course, kind, id); },
    async exportCourseAuthoring(selection) { calls.push(["export", selection]); if (exportHook) exportHook(); return microsequenceReviewExport({ revision }); },
    async setContentReview(request) {
      calls.push(["review", structuredClone(request)]); if (failure) throw failure;
      state = request.reviewed ? "current" : "draft"; revision++;
      const receipt = { ...read(courseId, request.targetKind, request.targetId), basisHash: request.expectedBasisHash,
        contract: "aralearn.course-content-review-change.v1", changed: true, idempotent: false };
      afterReview?.(); return receipt;
    },
    async saveMicrosequenceExplanation(request) { calls.push(["save", structuredClone(request)]); if (failure) throw failure;
      revision = 8; state = "draft"; basisHash = NEXT; return { courseId, revision, changed: true, idempotent: false }; }
  };
  const session = (options = {}) => new CourseMicrosequenceReviewSession({ controller, courseId, microsequenceId, expectedRevision: 7,
    uuid: () => `request-review-unique-${String(++requestSequence).padStart(4, "0")}`, ...options });
  return { controller, calls, stored, session, setBasis(value) { basisHash = value; }, setFailure(value) { failure = value; },
    setExportHook(value) { exportHook = value; }, setAfterReview(value) { afterReview = value; }, setRevision(value) { revision = value; } };
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

test("revisão exige decisão explícita e base do objeto visto, sem escrever após concorrência", async () => {
  const fixture = setup(); const session = fixture.session(); await session.load();
  await assert.rejects(session.setReviewed(), /explicitamente/u);
  fixture.setBasis(NEXT);
  await assert.rejects(session.setReviewed({ confirmed: true }), error => error.status === 409);
  assert.equal(fixture.calls.some(call => call[0] === "review"), false);
  fixture.setBasis(BASIS);
  const result = await session.setReviewed({ confirmed: true });
  assert.equal(result.stillCurrent, true);
  assert.equal(fixture.calls.find(call => call[0] === "review")[1].expectedBasisHash, BASIS);
  assert.equal(fixture.stored.size, 0);
});

test("revisão incerta sobrevive reabertura e confirma a mesma identidade antes de nova decisão", async () => {
  const fixture = setup(); const first = fixture.session(); await first.load();
  fixture.setFailure(Object.assign(new Error("Tempo esgotado"), { status: 504 }));
  await assert.rejects(first.setReviewed({ confirmed: true }));
  assert.equal(fixture.stored.size, 1);
  const reopened = fixture.session(); await reopened.load();
  fixture.setFailure(null);
  await reopened.setReviewed();
  assert.deepEqual(fixture.calls.filter(call => call[0] === "review").map(call => call[1]), [
    { courseId, targetKind: "microsequence_explanation", targetId: microsequenceId, reviewed: true, expectedBasisHash: BASIS, requestId: "request-review-unique-0001" },
    { courseId, targetKind: "microsequence_explanation", targetId: microsequenceId, reviewed: true, expectedBasisHash: BASIS, requestId: "request-review-unique-0001" }
  ]);
});

test("replay confirmado não apresenta revisão antiga como atual depois de uma mudança", async () => {
  const fixture = setup(); const session = fixture.session(); await session.load();
  fixture.setAfterReview(() => fixture.setBasis(NEXT));
  const result = await session.setReviewed({ confirmed: true });
  assert.equal(result.stillCurrent, false); assert.equal(session.needsReinspection, true);
  await assert.rejects(session.setReviewed({ confirmed: true }), error => error.status === 409);
  assert.equal(fixture.calls.filter(call => call[0] === "review").length, 1);
});

test("resultado incerto pode ser reconciliado mesmo quando nova revisão impede reinspeção antiga", async () => {
  const fixture = setup(); const first = fixture.session(); await first.load();
  fixture.setFailure(Object.assign(new Error("Sem resposta"), { status: 503 }));
  await assert.rejects(first.setReviewed({ confirmed: true }));
  fixture.setRevision(8); fixture.setFailure(null);
  const reopened = fixture.session(); await assert.rejects(reopened.load());
  const result = await reopened.setReviewed(); assert.equal(result.receipt.courseRevision, 9);
  assert.equal(fixture.stored.size, 0);
});

test("edição de texto usa contrato existente, preserva outros campos e retorna rascunho sem declarar revisão", async () => {
  const fixture = setup(); const session = fixture.session(); const snapshot = await session.load();
  const original = snapshot.microsequence.explanation;
  const changed = applyExplanationTextFields(original, [{ targetId: "content:support-text", path: "text", value: "A interface local não é a conexão inteira." }]);
  assert.equal(changed.title, original.title); assert.equal(original.content[0].data.text, "Um socket é a interface local usada pelo processo.");
  const result = await session.saveExplanation(changed);
  assert.equal(result.courseRevision, 8);
  assert.equal(fixture.calls.filter(call => call[0] === "review").length, 0);
  assert.deepEqual(fixture.calls.find(call => call[0] === "save")[1].explanation, changed);
});

test("revisão de unidade e retirada usam somente seu objeto e preservam o conteúdo", async () => {
  const fixture = setup();
  const session = fixture.session({ targetKind: "study_unit", targetId: "unit-theory" });
  const snapshot = await session.load();
  assert.equal(snapshot.targetUnit.id, "unit-theory");
  assert.equal(snapshot.microsequenceVersion, 2);
  await assert.rejects(session.setReviewed({ confirmed: true, hasPendingEdits: true }), /Salve ou descarte/u);
  assert.equal(fixture.calls.filter(call => call[0] === "review").length, 0);
  await session.setReviewed({ confirmed: true });
  assert.equal(session.snapshot.contentReview.state, "current");
  const withdrawn = await session.setReviewed({ reviewed: false });
  assert.equal(withdrawn.stillCurrent, true);
  assert.equal(session.snapshot.contentReview.state, "draft");
  assert.deepEqual(session.snapshot.targetUnit, snapshot.targetUnit);
  assert.deepEqual(fixture.calls.filter(call => call[0] === "review").map(call => [call[1].targetKind, call[1].targetId, call[1].reviewed]),
    [["study_unit", "unit-theory", true], ["study_unit", "unit-theory", false]]);
  await assert.rejects(session.saveExplanation(snapshot.microsequence.explanation), /não está disponível/u);
});

test("pedido incerto fica isolado por objeto e retirada conserva a intenção original", async () => {
  const fixture = setup(); const base = fixture.session(); await base.load();
  await base.setReviewed({ confirmed: true });
  fixture.setFailure(Object.assign(new Error("Sem resposta"), { status: 504 }));
  await assert.rejects(base.setReviewed({ reviewed: false }));
  const unit = fixture.session({ targetKind: "study_unit", targetId: "unit-theory", expectedRevision: 8 });
  await unit.load(); assert.equal(unit.pending, null);
  const reopened = fixture.session({ expectedRevision: 8 }); await reopened.load();
  fixture.setFailure(null);
  const result = await reopened.setReviewed();
  assert.equal(result.receipt.contentReview.state, "draft");
  assert.equal(fixture.calls.at(-2)[1].reviewed, false);
});

test("unidade fora do recorte não pode receber a revisão da base", async () => {
  const fixture = setup();
  await assert.rejects(fixture.session({ targetKind: "study_unit", targetId: "outside" }).load(), /não pertence/u);
  await assert.rejects(fixture.session({ targetId: "other-base" }).load(), /Base fora/u);
});

test("base explicativa pode ser inspecionada e revisada sem unidades materializadas", async () => {
  const fixture = setup();
  fixture.controller.exportCourseAuthoring = async () => microsequenceReviewExport({ withUnits: false });
  const session = fixture.session(); const snapshot = await session.load();
  assert.equal(snapshot.microsequence.studyUnits.length, 0);
  assert.equal((await session.setReviewed({ confirmed: true })).receipt.contentReview.state, "current");
});

test("recibo inválido preserva identidade para reconciliação e não vira nova decisão", async () => {
  const fixture = setup(); const session = fixture.session(); await session.load();
  fixture.controller.setContentReview = async () => ({ wrong: true });
  await assert.rejects(session.setReviewed({ confirmed: true }), { code: "invalid_course_content_review" });
  assert.ok(session.pending); assert.equal(fixture.stored.size, 1);
  session.pendingEdit = { explanation: snapshotExplanation() };
  await assert.rejects(session.setReviewed(), /Salve ou descarte/u);
});

function snapshotExplanation() { return microsequenceReviewExport().artifact.document.courses[0].modules[0].lessons[0].microsequences[0].explanation; }

test("resposta tardia de um painel encerrado preserva o objeto do painel ativo", async () => {
  // Lifecycle simulation only: no pixels, layout, keyboard or browser evidence.
  const dialogs = [];
  const document = { activeElement: null, body: { append(value) { dialogs.push(value); } },
    createElement() {
      const body = { scrollTop: 0 };
      return { ownerDocument: document, innerHTML: "", addEventListener() {}, removeEventListener() {}, setAttribute() {},
        querySelectorAll() { return []; }, querySelector(selector) { return selector === ".editor-body" ? body : null; },
        contains() { return false; }, showModal() {}, close() {}, remove() {} };
    } };
  const fixture = setup(); let rejectFirst; let started;
  const ready = new Promise(resolve => { started = resolve; });
  let exports = 0;
  fixture.controller.exportCourseAuthoring = async () => {
    if (exports++ === 0) { started(); return new Promise((_resolve, reject) => { rejectFirst = reject; }); }
    return microsequenceReviewExport();
  };
  const ui = createCourseMicrosequenceReview({ root: { ownerDocument: document }, controller: fixture.controller });
  const first = ui.open({ courseId, microsequenceId, expectedRevision: 7 });
  await ready; assert.equal(ui.close(), true);
  await ui.open({ courseId, microsequenceId, expectedRevision: 7, targetKind: "study_unit", targetId: "unit-theory" });
  const html = dialogs.at(-1).innerHTML;
  assert.match(html, /<h2>Unidade de estudo<\/h2>/u);
  assert.match(html, /data-review-unit-context="unit-theory"><h4>1\. Interface local/u);
  assert.match(html, /aria-label="Fechar inspeção da unidade"/u);
  assert.doesNotMatch(html, /2\. Distinguir interface e relação/u);
  rejectFirst(new Error("Resposta atrasada do primeiro painel")); await first;
  assert.equal(dialogs.at(-1).innerHTML, html);
  ui.destroy();
});
