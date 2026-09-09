import test from "node:test";
import assert from "node:assert/strict";
import { CourseAuthoringObservationQueue, authoringObservationQuery } from "../../src/ui/courseAuthoringObservationQueue.js";
import { renderAuthoringObservationQueue } from "../../src/ui/renderCourseAuthoringObservationQueue.js";

const courseId = "10000000-0000-4000-8000-000000000001";
const targetKind = "microsequence_explanation"; const targetId = "microsequence-a";
const timestamp = "2026-09-09T04:00:00.000Z";
function annotation(command, version = 1) {
  const path = [{ kind: "course", id: courseId, label: "Curso", version: 7 },
    { kind: targetKind, id: targetId, label: "Explicação", version: 1 }];
  const classification = { method: "target_scope_unclassified", methodVersion: 1, taxonomyRevision: 7, subjects: [] };
  return { contract: "aralearn.course-anchored-annotation.v1", courseId,
    annotationId: command.annotationId, annotationVersion: version,
    provenance: { origin: "author", channel: "authoring_interface" },
    contributor: { kind: "self", role: "author", ref: "self", label: "Você" },
    target: { kind: targetKind, id: targetId, observedPath: path, currentAvailable: true, currentPath: path,
      deepLink: `#/authoring/courses/${courseId}?section=content&didacticMicrosequenceId=${targetId}` },
    observedRevision: { certainty: "known", courseRevision: 7, targetVersion: 1 },
    rawText: command.rawText, category: command.category, briefSummary: command.briefSummary,
    subjectClassification: { status: "unclassified", automatic: classification, effective: classification, correctedAt: null },
    state: "open", ownerResponse: null,
    timestamps: { capturedAt: timestamp, createdAt: timestamp, updatedAt: timestamp, firstConsideredAt: null,
      respondedAt: null, resolvedAt: null, withdrawnAt: null },
    capabilities: { canRevise: true, canWithdraw: false, canConsider: true, canRespond: true,
      canResolve: false, canReopen: false, canCorrectSubjects: true },
    deepLink: `#/authoring/courses/${courseId}?section=review&annotationId=${command.annotationId}` };
}
function fixture() {
  const stored = new Map(); const items = new Map(); const calls = []; let sequence = 0;
  let afterWrite = null; let beforeWrite = null; const receipts = new Map();
  const controller = { store: {
    async getCache(key) { return structuredClone(stored.get(key)); },
    async putCache(key, value) { if (value == null) stored.delete(key); else stored.set(key, structuredClone(value)); }
  },
  async loadCourseAnchoredAnnotations(id, options) {
    calls.push({ type: "read", id, options });
    const matching = [...items.values()].filter(item => options.query.mode === "detail"
      ? item.annotationId === options.query.annotationId : ["open", "considered"].includes(item.state));
    return { contract: "aralearn.course-anchored-annotation-page.v1", courseId, courseRevision: 7,
      annotationSetVersion: items.size, query: options.query,
      summary: { matchingTotal: matching.length, byOrigin: { author: matching.length },
        byChannel: { authoring_interface: matching.length }, byState: { open: matching.length }, unclassifiedTotal: matching.length },
      items: structuredClone(matching), hasMore: false, nextCursor: null };
  },
  async mutateCourseAnchoredAnnotations(request) {
    calls.push({ type: "write", request: structuredClone(request) });
    await beforeWrite?.();
    if (receipts.has(request.requestId)) return structuredClone(receipts.get(request.requestId));
    const command = request.command; const old = items.get(command.annotationId);
    if (command.type === "revise_anchored_annotation" && old.annotationVersion !== command.expectedAnnotationVersion) {
      throw Object.assign(new Error("Observação alterada em outra sessão."), { code: "annotation_version_conflict", status: 409 });
    }
    const item = annotation(command, old ? old.annotationVersion + 1 : 1); items.set(item.annotationId, item);
    const receipt = { contract: "aralearn.course-anchored-annotation-change.v1", courseId, courseRevision: 7,
      annotationSetVersion: items.size, requestId: request.requestId, idempotent: false, changed: true, annotation: item };
    receipts.set(request.requestId, receipt); await afterWrite?.(); return structuredClone(receipt);
  } };
  const queue = () => new CourseAuthoringObservationQueue({ controller, courseId, targetKind, targetId,
    expectedRevision: 7, uuid: () => `20000000-0000-4000-8000-${String(++sequence).padStart(12, "0")}` });
  return { controller, queue, items, calls, stored,
    afterWrite(value) { afterWrite = value; }, beforeWrite(value) { beforeWrite = value; } };
}

test("fila acumula observações independentes e as relê após reabertura em ordem estável", async () => {
  const f = fixture(); const queue = f.queue();
  await queue.save({ rawText: "Esclarecer o pressuposto." });
  await queue.save({ rawText: "Vincular a fonte dessa relação." });
  const reopened = f.queue(); await reopened.restorePending(); await reopened.load();
  assert.equal(reopened.total, 2);
  assert.deepEqual(reopened.items.map(item => item.rawText), ["Esclarecer o pressuposto.", "Vincular a fonte dessa relação."]);
  assert.notEqual(reopened.items[0].annotationId, reopened.items[1].annotationId);
  assert.equal(f.stored.size, 0);
  assert.deepEqual(f.calls.find(call => call.type === "read").options.query, authoringObservationQuery(targetKind, targetId));
});

test("edição usa a versão inspecionada, preserva entrada concorrente e nunca consome", async () => {
  const f = fixture(); const queue = f.queue(); await queue.save({ rawText: "Observação inicial." }); await queue.load();
  const editing = structuredClone(queue.items[0]);
  await queue.save({ rawText: "Outra sessão detalhou o pedido.", editing }); await queue.load();
  await assert.rejects(queue.save({ rawText: "Meu rascunho antigo.", editing }), error => error.status === 409);
  assert.equal(f.items.get(editing.annotationId).annotationVersion, 2);
  assert.equal(f.items.get(editing.annotationId).rawText, "Outra sessão detalhou o pedido.");
  assert.equal(f.items.get(editing.annotationId).state, "open"); assert.equal(f.stored.size, 0);
  assert.deepEqual(f.calls.filter(call => call.type === "write").map(call => call.request.command.type),
    ["create_anchored_annotation", "revise_anchored_annotation", "revise_anchored_annotation"]);
});

test("resposta perdida relê observação e confirma a mesma escrita sem duplicar entrada", async () => {
  const f = fixture(); const first = f.queue();
  f.afterWrite(() => { throw Object.assign(new Error("Resposta perdida"), { status: 504 }); });
  await assert.rejects(first.save({ rawText: "Explicar a relação causal." }));
  assert.equal(f.stored.size, 1); assert.equal(f.items.size, 1);
  const reopened = f.queue(); await reopened.restorePending(); f.afterWrite(null);
  const result = await reopened.save();
  assert.equal(result.reconciled, true); assert.equal(f.stored.size, 0);
  assert.equal(f.calls.filter(call => call.type === "write").length, 1);
  await reopened.load(); assert.equal(reopened.total, 1);
});

test("ausência momentânea depois de timeout conserva request e payload no replay idempotente", async () => {
  const f = fixture(); const first = f.queue();
  f.beforeWrite(() => { throw Object.assign(new Error("Sem resposta da rede"), { status: 503 }); });
  await assert.rejects(first.save({ rawText: "Detalhar o exemplo." }));
  assert.equal(f.items.size, 0);
  const reopened = f.queue(); await reopened.restorePending(); f.beforeWrite(null);
  await reopened.save();
  const writes = f.calls.filter(call => call.type === "write");
  assert.deepEqual(writes[1].request, writes[0].request);
  assert.equal(f.items.size, 1); assert.equal(f.stored.size, 0);
});

test("releitura de fila consumida remove a pendência sem criar revisão ou nova mutação", async () => {
  const f = fixture(); const queue = f.queue(); await queue.save({ rawText: "Corrigir a notação." }); await queue.load();
  f.items.get(queue.items[0].annotationId).state = "resolved";
  await queue.load(); assert.equal(queue.total, 0); assert.deepEqual(queue.items, []);
  assert.equal(f.calls.filter(call => call.type === "write").length, 1);
});

test("renderer mostra objeto, contagem e versões, protege texto e oferece somente adicionar/editar", async () => {
  const f = fixture(); const queue = f.queue(); await queue.save({ rawText: '<img src=x onerror="alert(1)"> & hipótese' }); await queue.load();
  const html = renderAuthoringObservationQueue({ label: "Explicação · Relações", opened: true, items: queue.items, total: queue.total });
  assert.match(html, /aria-label="Observações autorais de Explicação · Relações, 1 pendentes"/u);
  assert.match(html, /data-author-queue-version="1"/u);
  assert.match(html, /&lt;img/u); assert.doesNotMatch(html, /<img/u);
  assert.match(html, /Adicionar observação/u); assert.match(html, /Editar observação 1, versão 1/u);
  assert.doesNotMatch(html, /resolve|withdraw|Marcar como revisado/u);
});
