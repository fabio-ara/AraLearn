import test from "node:test";
import assert from "node:assert/strict";
import { CourseAuthoringObservationQueue, authoringObservationQuery, filterAuthoringObservations } from "../../src/ui/courseAuthoringObservationQueue.js";
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
    const item = annotation({ ...old, ...command }, old ? old.annotationVersion + 1 : 1);
    item.targetSetVersion = old?.targetSetVersion || 1;
    item.targets = structuredClone(old?.targets || (command.targets || [{kind: targetKind, id: targetId}]).map(target => ({ ...target, state: 'pending', path: [{...target, label: target.id, version: 1}],
      basis: {hash: 'a'.repeat(64), content: {}, sourceLinks: [], sources: []}, current: {hash: 'b'.repeat(64), content: {}, sourceLinks: [], sources: []} })));
    if (command.type === 'decide_anchored_annotation') {
      for (const target of command.targets) {
        const incidence = item.targets.find(value => value.kind === target.kind && value.id === target.id);
        assert.equal(target.expectedBasisHash, incidence.current?.hash ?? null);
        incidence.state = command.decision === 'approve' ? 'approved' : 'cancelled'; incidence.basis = null; incidence.current = null;
      }
      if (item.targets.every(t => t.state !== 'pending')) { item.state = 'resolved'; item.rawText = null; }
    }
    items.set(item.annotationId, item);
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
  assert.deepEqual(f.calls.find(call => call.type === "read").options.query, authoringObservationQuery());
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

test("central mostra contagem do curso, protege texto e separa seleção, edição e decisão", async () => {
  const f = fixture(); const queue = f.queue(); await queue.save({ rawText: '<img src=x onerror="alert(1)"> & hipótese' }); await queue.load();
  const html = renderAuthoringObservationQueue({ label: "Explicação · Relações", opened: true, items: queue.items, total: queue.total });
  assert.match(html, /aria-label="Observações autorais do curso, 1 pendentes"/u);
  assert.match(html, /data-observation-version="1"/u);
  assert.match(html, /&lt;img/u); assert.doesNotMatch(html, /<img/u);
  assert.match(html, /Enviar observação/u); assert.match(html, /Editar observação/u);
  assert.match(html, /data-observation-select/u); assert.match(html, /Aprovar selecionadas/u);
  assert.match(html, /Encerrar selecionadas/u); assert.doesNotMatch(html, /data-observation-action="withdraw"|Marcar como revisado/u);
  assert.doesNotMatch(html, /study-observation-category-disclosure/u);
});

test("badge omite zero visual e conserva a contagem acessível da fila", () => {
  const empty = renderAuthoringObservationQueue({ label: "explicação", total: 0 });
  assert.match(empty, /aria-label="Observações autorais do curso, 0 pendentes"/u);
  assert.doesNotMatch(empty, /course-authoring-observation-count/u);
  const pending = renderAuthoringObservationQueue({ label: "explicação", total: 12 });
  assert.match(pending, /aria-label="Observações autorais do curso, 12 pendentes"/u);
  assert.match(pending, /class="course-authoring-observation-count" aria-hidden="true">12<\/span>/u);
  const unknown = renderAuthoringObservationQueue({ label: "explicação" });
  assert.match(unknown, /contagem ainda não disponível/u);
});

test("central cancela alvo removido com ausência explícita e não fabrica aprovação ou base", async () => {
  for (const legacy of [false, true]) {
    const f = fixture(); const queue = f.queue();
    await queue.save({ rawText: 'Nota sobre o alvo removido.' });
    const item = [...f.items.values()][0];
    item.targets[0].current = null;
    if (legacy) item.targets[0].basis = null;
    await queue.load(); assert.equal(queue.total, 1);
    await assert.rejects(queue.decide(queue.items, { decision: 'approve' }), /removido/u);
    assert.equal(f.calls.filter(call => call.type === 'write').length, 1);
    await queue.decide(queue.items, { decision: 'cancel', reason: 'O alvo foi removido.' });
    const command = f.calls.filter(call => call.type === 'write').at(-1).request.command;
    assert.equal(command.targets[0].expectedBasisHash, null);
    assert.equal(command.expectedAnnotationVersion, 1); assert.equal(command.expectedTargetSetVersion, 1);
    assert.equal(queue.total, 0);
    await queue.load(); assert.equal(queue.total, 0);
    assert.equal([...f.items.values()][0].targets[0].state, 'cancelled');
  }
});

test("uma observação multialvo conserva identidade, filtros e seleção parcial de cada incidência", async () => {
  const f = fixture(); const queue = f.queue();
  const targets = [{kind: targetKind, id: targetId}, {kind: 'study_unit', id: 'unit-a'}];
  await queue.save({rawText: 'Conferir explicação e exemplo.', targets});
  await queue.save({rawText: 'Pedido independente no mesmo objeto.', targets}); await queue.load();
  assert.equal(queue.total, 2); assert.equal(queue.items[0].targets.length, 2);
  assert.equal(filterAuthoringObservations(queue.items, {target: 'study_unit:unit-a'}).length, 2);
  const first = queue.items[0], second = queue.items[1];
  await queue.decide(queue.items, {decision: 'cancel', reason: 'test', targetKeysByAnnotation: {
    [first.annotationId]: [`${targetKind}:${targetId}`], [second.annotationId]: ['study_unit:unit-a']
  }});
  assert.equal(queue.total, 2);
  assert.deepEqual(queue.items.map(item => item.targets.map(target => target.state)), [['cancelled', 'pending'], ['pending', 'cancelled']]);
  const html = renderAuthoringObservationQueue({label: 'Contexto', opened: true, items: queue.items, total: queue.total, filters: {target: 'study_unit:other'}});
  assert.match(html, /0 apresentadas · 2 pendentes no curso/u);
});

test("lote retoma request e basis exatos depois de falha intermediária sem repetir decisão já confirmada", async () => {
  const f = fixture(); const queue = f.queue();
  await queue.save({rawText: 'Primeira'}); await queue.save({rawText: 'Segunda'}); await queue.load();
  const items = structuredClone(queue.items); let call = 0;
  f.beforeWrite(() => { if (++call === 2) throw Object.assign(new Error('Sem resposta'), {status: 503}); });
  await assert.rejects(queue.decide(items, {decision: 'approve'}));
  const failed = f.calls.filter(call => call.type === 'write').at(-1).request;
  const reopened = f.queue(); await reopened.restorePending(); f.beforeWrite(null); await reopened.resumeDecisions();
  assert.equal(reopened.total, 0); assert.equal(f.stored.size, 0);
  const writes = f.calls.filter(call => call.type === 'write' && call.request.command.type === 'decide_anchored_annotation');
  assert.equal(writes.length, 3); assert.deepEqual(writes[2].request, failed);
  assert.equal(writes[0].request.command.annotationId, items[0].annotationId);
});

test("recupera envio legado sem mudar identidade e não confirma criação com conjunto de alvos diferente", async () => {
  const f = fixture(); const queue = f.queue();
  f.beforeWrite(() => { throw Object.assign(new Error('Sem resposta'), {status: 503}); });
  await assert.rejects(queue.save({rawText: 'Intenção', targets: [{kind: targetKind, id: targetId}, {kind: 'study_unit', id: 'unit-a'}]}));
  const pending = f.stored.get(queue.key); f.stored.delete(queue.key);
  const legacyKey = `course.v1.pending-authoring-observation:${courseId}:${targetKind}:${targetId}`;
  f.stored.set(legacyKey, pending);
  const reopened = f.queue(); await reopened.restorePending(); assert.deepEqual(reopened.pending, pending); assert.equal(f.stored.has(legacyKey), false);
  f.items.set(pending.command.annotationId, annotation(pending.command));
  assert.equal(await reopened.reconcilePending(), false);
  assert.deepEqual(reopened.pending, pending);
});

test("nota autoral estrutural legada permanece visível e não impede a central de carregar", async () => {
  const f = fixture(); const item = annotation({annotationId: '20000000-0000-4000-8000-000000000050', rawText: 'Nota antiga sobre a lição', category: null, briefSummary: null});
  item.target.kind = 'lesson'; item.target.id = 'lesson-old';
  item.target.observedPath[1] = {kind: 'lesson', id: 'lesson-old', label: 'Lição antiga', version: 1};
  item.target.currentPath = structuredClone(item.target.observedPath);
  f.items.set(item.annotationId, item);
  const queue = f.queue(); await queue.load(); assert.equal(queue.total, 1);
  const html = renderAuthoringObservationQueue({label: 'Contexto', opened: true, items: queue.items, total: queue.total});
  assert.match(html, /Nota antiga sobre a lição/u); assert.match(html, /Revisar registro legado/u);
  assert.doesNotMatch(html, /data-observation-select /u);
});

test("cache expirado ou sem data não recria observação removida; nova intenção exige ação explícita", async () => {
  for (const capturedAt of ['2020-01-01T00:00:00.000Z', null]) {
    const f = fixture(); const queue = f.queue();
    f.beforeWrite(() => { throw Object.assign(new Error('Sem resposta'), {status: 503}); });
    await assert.rejects(queue.save({rawText: 'Texto recuperável'}));
    const pending = structuredClone(queue.pending); pending.command.capturedAt = capturedAt;
    await queue.persistPending(pending); f.beforeWrite(null);
    await assert.rejects(queue.save(), error => error.code === 'observation_recovery_expired');
    assert.equal(f.items.size, 0); assert.equal(f.calls.filter(call => call.type === 'write').length, 1);
    await queue.abandonExpiredAttempt(); assert.equal(queue.pending, null);
    await queue.save({rawText: pending.command.rawText}); assert.equal(f.items.size, 1);
    assert.notEqual([...f.items.keys()][0], pending.command.annotationId);
  }
});
