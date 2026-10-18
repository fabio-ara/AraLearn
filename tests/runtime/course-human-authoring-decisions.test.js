import test from "node:test";
import assert from "node:assert/strict";
import { executeHumanCourseTask } from "../../supabase/functions/_shared/aralearn-authoring/courseHumanTasks.js";
import { createContentReviewReference, openContentReviewReference } from "../../supabase/functions/_shared/aralearn-authoring/courseContentReviewReference.js";
import { AuthoringApiError } from "../../supabase/functions/_shared/aralearn-authoring/errors.js";
import { CourseSupabaseAdapter } from "../../supabase/functions/_shared/aralearn-authoring/courseSupabaseAdapter.js";
import { toolErrorData } from "../../supabase/functions/_shared/aralearn-authoring/toolErrorEnvelope.js";

const actorId = "10000000-0000-4000-8000-000000000001";
const courseId = "20000000-0000-4000-8000-000000000002";
const annotationId = "30000000-0000-4000-8000-000000000003";
const principal = { actorId, authenticationKind: "action", scopes: ["authoring:read", "authoring:write"] };
const report = { summary: "Base e relações examinadas.", outcome: "consistent", findings: [],
  checks: ["alignment", "evidence", "representation", "feedback", "sufficiency", "configuration"].map(dimension => ({
    dimension, result: "sufficient", reason: "A explicação desenvolve a relação solicitada.", evidence: ["Relações"] })) };
const initial = () => ({ contract: "aralearn.course-ai-inspection.v1", courseId, courseRevision: 5,
  targetKind: "microsequence_explanation", targetId: "micro", basisHash: "a".repeat(64),
  pedagogicalBasis: { targetKind: "microsequence_explanation", targetId: "micro",
    microsequence: { title: "Relações", goal: "Explicar relações" }, planItems: [], studyUnits: [], dependencies: [] },
  inspection: { state: "pending", basisHash: "a".repeat(64) } });
const reviewRead = () => ({ contract: "aralearn.course-content-review.v1", courseId, courseRevision: 5,
  targetKind: "microsequence_explanation", targetId: "micro", entityVersion: 1, basisHash: "a".repeat(64),
  contentReview: { state: "draft" }, reviewPolicy: "saved" });
const legacyReference = reference => {
  const legacy = JSON.parse(Buffer.from(reference, "base64url").toString("utf8"));
  delete legacy.purpose;
  return Buffer.from(JSON.stringify(legacy), "utf8").toString("base64url");
};
const execute = (adapter, name, args) => executeHumanCourseTask({ adapter, principal, name, rawArguments: args });

test("referências carimbam finalidade, mantêm requestId e validam estritamente valores e campos", async () => {
  const requestId = "40000000-0000-4000-8000-000000000004";
  const inspection = await createContentReviewReference({ principal, read: initial(), requestId });
  const review = await createContentReviewReference({ principal, read: reviewRead(), requestId });
  assert.notEqual(inspection, review, "a mesma tentativa não colapsa referências de finalidades distintas");
  assert.equal(openContentReviewReference(inspection, principal).purpose, "ai_inspection");
  assert.equal(openContentReviewReference(review, principal).purpose, "human_review");
  assert.equal(openContentReviewReference(inspection, principal).requestId, requestId);
  assert.equal(openContentReviewReference(review, principal).requestId, requestId);
  assert.equal(openContentReviewReference(legacyReference(inspection), principal).purpose, undefined,
    "referências prévias sem finalidade continuam legíveis");
  assert.equal(openContentReviewReference(legacyReference(inspection), principal, "ai_inspection").requestId, requestId);
  assert.equal(openContentReviewReference(legacyReference(review), principal, "human_review").requestId, requestId);
  const pageReview = await createContentReviewReference({ principal, read: reviewRead() });
  assert.equal(pageReview, await createContentReviewReference({ principal, read: reviewRead() }),
    "a paginação continua produzindo a mesma referência para a mesma base");

  const unsupported = JSON.parse(Buffer.from(inspection, "base64url").toString("utf8"));
  unsupported.purpose = "other";
  assert.throws(() => openContentReviewReference(Buffer.from(JSON.stringify(unsupported)).toString("base64url"), principal),
  { code: "invalid_content_review_reference" });
  const extra = JSON.parse(Buffer.from(inspection, "base64url").toString("utf8"));
  extra.unexpected = true;
  assert.throws(() => openContentReviewReference(Buffer.from(JSON.stringify(extra)).toString("base64url"), principal),
  { code: "invalid_content_review_reference" });
});

test("finalidade trocada recusa 422 antes de recibos, leituras e escritas e aponta o campo correto", async () => {
  const inspection = await createContentReviewReference({ principal, read: initial() });
  const review = await createContentReviewReference({ principal, read: reviewRead() });
  const calls = [];
  const adapter = {
    getCourseContentInspectionReceipt: async () => { calls.push("inspection-receipt"); return null; },
    getCourseContentInspection: async () => { calls.push("inspection-read"); return initial(); },
    recordCourseContentInspection: async () => { calls.push("inspection-write"); },
    getCourseContentReview: async () => { calls.push("review-read"); return reviewRead(); },
    setCourseContentReview: async () => { calls.push("review-write"); return reviewRead(); }
  };
  for (const [name, reference, field] of [
    ["registrar_inspecao", review, "referenciaInspecao"],
    ["declarar_revisao", inspection, "referenciaRevisao"]
  ]) {
    const args = name === "registrar_inspecao"
      ? { referencia: reference, parecer: report }
      : { referencia: reference, declaracao: "revisado" };
    const error = await execute(adapter, name, args).then(() => null, value => value);
    assert.equal(error.status, 422);
    assert.equal(error.code, "content_review_reference_purpose_mismatch");
    assert.equal(error.details.field, field);
    assert.match(error.message, new RegExp(field, "u"));
    const envelope = toolErrorData(error);
    assert.equal(envelope.details.field, field);
    assert.equal(envelope.recovery.strategy, "correct_and_retry");
    assert.doesNotMatch(JSON.stringify(envelope.recovery), /releia|releitura|reler/iu);
  }
  assert.deepEqual(calls, [], "a finalidade é conferida antes do recibo e das leituras/escritas caras");
});

test("parecer de cinco dimensões só pode recuperar recibo exato, nunca gravar como nova inspeção", async () => {
  const before = initial();
  const reference = await createContentReviewReference({ principal, read: before });
  const legacy = { ...report, checks: report.checks.filter(check => check.dimension !== "configuration") };
  let writes = 0;
  const adapter = { publicAppUrl: "https://example.org", getCourseContentInspection: async () => before,
    getCourseContentInspectionReceipt: async () => null,
    recordCourseContentInspection: async input => { writes++; return { ...before, inspection: { state: "current",
      basisHash: before.basisHash, inspectedAt: "2026-09-28T00:00:00Z", report: input.report } }; } };
  await assert.rejects(execute(adapter, "registrar_inspecao", { referencia: reference, parecer: legacy }),
    { code: "pedagogical_audit_configuration_required" });
  assert.equal(writes, 0);
  adapter.getCourseContentInspection = async () => { throw new Error("Replay não relê base posterior"); };
  adapter.getCourseContentInspectionReceipt = async input => {
    assert.deepEqual(input.report, legacy);
    assert.equal(input.expectedBasisHash, before.basisHash);
    return { ...before, idempotent: true, changed: true, contract: "aralearn.course-ai-inspection-change.v1",
      inspection: { state: "current", basisHash: before.basisHash, inspectedAt: "2026-09-28T00:00:00Z", report: legacy } };
  };
  const replay = await execute(adapter, "registrar_inspecao", { referencia: reference, parecer: legacy });
  assert.deepEqual(replay.context.inspecaoIA.report, legacy);
  assert.equal(writes, 0);
});

test("comparação focal preserva bases literais e continuações sem carregar o curso inteiro", async () => {
  const reference = { annotationId, annotationVersion: 3, targetSetVersion: 2, targetKind: "study_unit", targetId: "unit-a" };
  const snapshot = text => ({ hash: "a".repeat(64), content: { id: "literal-id", text }, sourceLinks: [], sources: [] });
  const comparison = { contract: "aralearn.course-observation-comparison.v1", courseId, courseRevision: 5,
    annotationId, annotationVersion: 3, targetSetVersion: 2, target: { kind: "study_unit", id: "unit-a" },
    basis: snapshot("Texto anterior ".repeat(2200)), current: snapshot("Texto vigente ".repeat(2200)) };
  const calls = [];
  const adapter = { publicAppUrl: "https://example.org", listCourses: async () => ({ items: [{ courseId, title: "Curso" }], hasMore: false }),
    getCourse: async () => ({ courseId, title: "Curso", revision: 5 }),
    async getCourseObservationComparison(request) { calls.push(request); return structuredClone(comparison); } };
  let continuation; let json = ""; let pages = 0;
  do {
    const output = await execute(adapter, "preparar_revisao", { curso: "Curso", comparacao: reference,
      ...(continuation ? { continuacao: continuation } : {}) });
    json += output.context.fragmento.texto;
    continuation = output.context.continuacao;
    pages++;
    assert.equal(output.links[0].target.id, "unit-a");
    assert.ok(pages < 30);
  } while (continuation);
  assert.ok(pages > 1);
  assert.deepEqual(JSON.parse(json).comparacaoDeObservacao, comparison);
  assert.equal(calls[0].expectedTargetSetVersion, 2);
  comparison.courseRevision = 6;
  await assert.rejects(execute(adapter, "preparar_revisao", { curso: "Curso", comparacao: reference }),
    error => error.code === "course_revision_conflict");
});

test("parecer vincula a base lida e reconcilia resposta perdida sem editar ou revisar conteúdo", async () => {
  let read = initial(); const calls = [];
  const reference = await createContentReviewReference({ principal, read });
  const adapter = { publicAppUrl: "https://example.org",
    getCourseContentInspectionReceipt: async () => null,
    getCourseContentInspection: async () => structuredClone(read),
    async recordCourseContentInspection(request) {
      calls.push(request);
      read = { ...read, courseRevision: 6, inspection: { state: "current", basisHash: read.basisHash,
        inspectedAt: "2026-09-16T00:00:00Z", report: request.report } };
      throw new AuthoringApiError(503, "service_timeout", "Resposta perdida");
    }
  };
  const output = await execute(adapter, "registrar_inspecao", { referencia: reference, parecer: report });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].expectedBasisHash, "a".repeat(64));
  assert.equal(output.context.inspecaoIA.state, "current");
  assert.deepEqual(output.links[0].target, { kind: "microsequence_explanation", id: "micro" });
  assert.match(output.deepLink, /explanationId=micro/u);
  assert.equal(Object.hasOwn(calls[0], "reviewed"), false);
  assert.equal(Object.hasOwn(calls[0], "content"), false);
});

test("recibo ausente com base alterada recusa o conflito sem gravar", async () => {
  const before = initial();
  const reference = await createContentReviewReference({ principal, read: before });
  let writes = 0; let receipts = 0;
  const adapter = { getCourseContentInspectionReceipt: async () => { receipts += 1; return null; }, getCourseContentInspection: async () => ({ ...before, basisHash: "b".repeat(64),
    inspection: { state: "pending", basisHash: "b".repeat(64) } }),
    recordCourseContentInspection: async () => { writes++; } };
  await assert.rejects(execute(adapter, "registrar_inspecao", { referencia: reference, parecer: report }),
    error => error.code === "course_ai_inspection_conflict" && error.status === 409);
  assert.equal(receipts, 1, "a tentativa repetida não tinha recibo");
  assert.equal(writes, 0);
  adapter.getCourseContentInspection = async () => before;
  adapter.recordCourseContentInspection = async () => { writes++; throw new AuthoringApiError(409, "stale_course_state", "Base mudou"); };
  await assert.rejects(execute(adapter, "registrar_inspecao", { referencia: reference, parecer: report }),
    error => error.code === "stale_course_state");
  assert.equal(writes, 1);
});

test("escrita incerta de inspeção recupera pela mesma referência e parecer, sem reler nem duplicar", async () => {
  const before = initial();
  const reference = legacyReference(await createContentReviewReference({ principal, read: before }));
  const requestId = openContentReviewReference(reference, principal).requestId;
  const attempts = []; let reads = 0; let receipt = null; let receiptCalls = 0;
  const saved = () => ({ contract: "aralearn.course-ai-inspection-change.v1", changed: true, idempotent: true,
    courseId, courseRevision: 6, targetKind: "microsequence_explanation", targetId: "micro",
    basisHash: before.basisHash, inspection: { state: "current", basisHash: before.basisHash,
      inspectedAt: "2026-10-15T00:00:00Z", report } });
  const adapter = { publicAppUrl: "https://example.org",
    async getCourseContentInspectionReceipt(input) { receiptCalls += 1;
      assert.equal(input.requestId, requestId);
      assert.deepEqual(input.report, report);
      return receipt === null ? null : saved(); },
    async getCourseContentInspection() { reads += 1; return structuredClone(before); },
    async recordCourseContentInspection(input) { attempts.push(input);
      throw new AuthoringApiError(503, "network_error", "Resposta perdida."); } };

  const failure = await execute(adapter, "registrar_inspecao", { referencia: reference, parecer: report })
    .then(() => null, error => error);
  assert.equal(failure.status, 409);
  assert.equal(failure.code, "course_write_uncertain");
  assert.deepEqual(failure.details, { requestId, targetCourseId: courseId, operation: "course_ai_inspection" });
  assert.match(failure.message, /mesma referência e o mesmo parecer/u);
  assert.match(failure.message, /com recibo, ele devolve o parecer salvo sem reavaliar a base/u);
  assert.match(failure.message, /sem recibo, a base é validada antes de registrar/u);
  assert.equal(attempts.length, 1);
  // A leitura inicial e a releitura de reconciliação da escrita incerta; nenhuma
  // delas substitui o recibo.
  assert.equal(reads, 2);

  // A tentativa gravou apesar da resposta perdida: o recibo da MESMA identidade
  // devolve o parecer salvo. O replay não relê a base nem grava de novo.
  receipt = saved();
  const recovered = await execute(adapter, "registrar_inspecao", { referencia: reference, parecer: report });
  assert.deepEqual(recovered.context.inspecaoIA.report, report);
  assert.match(recovered.result, /Recuperei o parecer da mesma tentativa/u);
  assert.equal(reads, 2, "o recibo é conferido antes de qualquer leitura nova");
  assert.equal(attempts.length, 1, "o replay não duplica a inspeção");
  assert.equal(receiptCalls, 3);
});

test("parecer divergente na mesma referência não contorna o recibo da inspeção", async () => {
  const before = initial();
  const reference = await createContentReviewReference({ principal, read: before });
  const divergent = { ...report, summary: "Parecer reescrito depois da resposta perdida." };
  let reads = 0; let writes = 0;
  const adapter = { publicAppUrl: "https://example.org",
    async getCourseContentInspectionReceipt(input) {
      if (input.report.summary === report.summary) return { contract: "aralearn.course-ai-inspection-change.v1",
        changed: true, idempotent: true, courseId, courseRevision: 6, targetKind: "microsequence_explanation",
        targetId: "micro", basisHash: before.basisHash, inspection: { state: "current", basisHash: before.basisHash,
          inspectedAt: "2026-10-15T00:00:00Z", report } };
      throw new AuthoringApiError(409, "course_ai_inspection_identity_conflict",
        "Esta tentativa de inspeção pertence ao parecer original. Repita com a mesma referência e o mesmo parecer.");
    },
    async getCourseContentInspection() { reads += 1; return structuredClone(before); },
    async recordCourseContentInspection() { writes += 1; return { contract: "aralearn.course-ai-inspection-change.v1",
      changed: true, idempotent: false, courseId, courseRevision: 6, targetKind: "microsequence_explanation",
      targetId: "micro", basisHash: before.basisHash, inspection: { state: "current", basisHash: before.basisHash,
        inspectedAt: "2026-10-15T00:00:00Z", report: divergent } }; } };

  await assert.rejects(execute(adapter, "registrar_inspecao", { referencia: reference, parecer: divergent }),
    { code: "course_ai_inspection_identity_conflict" });
  assert.equal(reads, 0, "o parecer divergente não cai na validação de base");
  assert.equal(writes, 0, "o parecer divergente não sobrescreve a tentativa salva");

  const recovered = await execute(adapter, "registrar_inspecao", { referencia: reference, parecer: report });
  assert.deepEqual(recovered.context.inspecaoIA.report, report);
  assert.equal(writes, 0);
});

test("recibo ausente com base vigente grava uma única inspeção e o replay seguinte usa o recibo", async () => {
  const before = initial();
  const reference = await createContentReviewReference({ principal, read: before });
  let writes = 0; let receipts = 0; let receipt = null;
  const adapter = { publicAppUrl: "https://example.org",
    async getCourseContentInspectionReceipt() { receipts += 1; return receipt; },
    async getCourseContentInspection() { return structuredClone(before); },
    async recordCourseContentInspection(input) { writes += 1;
      receipt = { contract: "aralearn.course-ai-inspection-change.v1", changed: true, idempotent: false,
        courseId, courseRevision: 6, targetKind: "microsequence_explanation", targetId: "micro",
        basisHash: before.basisHash, inspection: { state: "current", basisHash: before.basisHash,
          inspectedAt: "2026-10-15T00:00:00Z", report: input.report } };
      return structuredClone(receipt); } };

  // Sem recibo, a repetição idêntica valida a base vigente e registra a inspeção.
  const first = await execute(adapter, "registrar_inspecao", { referencia: reference, parecer: report });
  assert.match(first.result, /Registrei o parecer de IA sobre a base lida/u);
  assert.equal(receipts, 1);
  assert.equal(writes, 1);

  // O recibo criado pela própria gravação passa a devolver a mesma tentativa sem
  // gravar de novo.
  const second = await execute(adapter, "registrar_inspecao", { referencia: reference, parecer: report });
  assert.match(second.result, /Recuperei o parecer da mesma tentativa/u);
  assert.equal(receipts, 2);
  assert.equal(writes, 1);
});

test("registrar_inspecao recusa consistência quando a base aplicada está nula", async () => {
  const read = { ...initial(), targetKind: "study_unit", targetId: "unit-a",
    pedagogicalBasis: { targetKind: "study_unit", targetId: "unit-a",
      microsequence: { title: "Relações", goal: "Explicar relações" }, planItems: [],
      studyUnits: [{ id: "unit-a", content: { id: "unit-a", position: 1, title: "Relações", role: "theory",
        topics: [], content: [{ id: "p", package: "aralearn.resource.paragraph", version: "1.0.0",
          data: { text: "A explicação apresenta a relação entre nomes e endereços." } }], response: null, feedback: [] }, application: null }],
      dependencies: [] } };
  const reference = await createContentReviewReference({ principal, read });
  // A evidência de um juízo suficiente cita o texto apresentado no alvo, não o
  // título da Unidade (identidade); assim a recusa testada é a da base nula.
  const materialReport = { ...report, checks: report.checks.map(check => ({ ...check,
    evidence: ["A explicação apresenta a relação entre nomes e endereços."] })) };
  let writes = 0;
  const adapter = { getCourseContentInspectionReceipt: async () => null, getCourseContentInspection: async () => structuredClone(read),
    recordCourseContentInspection: async () => { writes++; } };
  await assert.rejects(execute(adapter, "registrar_inspecao", { referencia: reference, parecer: materialReport }),
    error => error.code === "pedagogical_audit_unapplied_design");
  assert.equal(writes, 0);
});

test("registrar_inspecao ancora no texto apresentado, inclusive o retorno por alternativa", async () => {
  const optionFeedback = "O TCP confirma o recebimento e retransmite o segmento perdido.";
  const content = { id: "unit-a", position: 1, title: "Relações", role: "practice", topics: [],
    content: [{ id: "p", package: "aralearn.resource.paragraph", version: "1.0.0",
      data: { text: "Os protocolos diferem na recuperação de perdas." } }],
    response: { id: "r", package: "aralearn.response.choice", version: "1.0.0", data: {
      question: "Qual protocolo recupera as perdas?", selectionMode: "single", selectionCriterion: "correct",
      options: [{ id: "alt-tcp", kind: "text", text: "TCP", feedback: optionFeedback },
        { id: "alt-udp", kind: "text", text: "UDP", feedback: "O UDP não recupera as perdas." }], answerIds: ["alt-tcp"] } },
    feedback: [] };
  const read = { ...initial(), targetKind: "study_unit", targetId: "unit-a",
    pedagogicalBasis: { targetKind: "study_unit", targetId: "unit-a",
      microsequence: { title: "Relações", goal: "Recuperar perdas" }, planItems: [],
      studyUnits: [{ id: "unit-a", content, application: { mode: "practice", practiceApplications: [] } }], dependencies: [] } };
  const reference = await createContentReviewReference({ principal, read });
  const reportWith = quote => ({ ...report, checks: report.checks.map(check => ({ ...check, evidence: [quote] })) });
  let recorded = null;
  const adapter = { publicAppUrl: "https://example.org",
    getCourseContentInspectionReceipt: async () => null,
    getCourseContentInspection: async () => structuredClone(read),
    async recordCourseContentInspection(request) {
      recorded = request.report;
      return { ...read, courseRevision: 6, inspection: { state: "current", basisHash: read.basisHash,
        inspectedAt: "2026-10-13T00:00:00Z", report: request.report } };
    } };
  // Ids internos e enums de controle não são texto apresentado; o retorno é.
  for (const hidden of ["alt-tcp", "alt-udp", "single", "correct", "text", "selectionMode", "selectionCriterion"]) {
    await assert.rejects(execute(adapter, "registrar_inspecao", { referencia: reference, parecer: reportWith(hidden) }),
      error => error.code === "invalid_pedagogical_audit");
    assert.equal(recorded, null);
  }
  await execute(adapter, "registrar_inspecao", { referencia: reference, parecer: reportWith(optionFeedback) });
  assert.deepEqual(recorded, reportWith(optionFeedback));
});

test("decisão explícita encaminha somente alvos inspecionados e respectivas bases", async () => {
  const calls = [];
  const adapter = { publicAppUrl: "https://example.org", listCourses: async () => ({ items: [{ courseId, title: "Curso" }], hasMore: false }),
    getCourse: async () => ({ courseId, title: "Curso", revision: 5 }),
    executeCourseAnchoredAnnotationCommand: async request => {
      calls.push(request);
      return CourseSupabaseAdapter.prototype.executeCourseAnchoredAnnotationCommand.call({ rpc: async (_name, parameters) => {
        assert.equal(parameters.p_expected_course_revision, null);
        return { contract: "aralearn.course-anchored-annotation-change.v1", courseId, courseRevision: 5,
          annotationSetVersion: 2, requestId: parameters.p_request_id, idempotent: false, changed: true, annotation: null };
      } }, request);
    } };
  const reference = { annotationId, annotationVersion: 3, targetSetVersion: 2,
    targets: [{ kind: "study_unit", id: "unit-a", expectedBasisHash: "a".repeat(64) }] };
  const output = await execute(adapter, "decidir_observacao", { curso: "Curso", referencia: reference,
    decisao: "aceitar_vigente", confirmado: true });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].expectedCourseRevision, null);
  assert.deepEqual(calls[0].command, { type: "decide_anchored_annotation", annotationId,
    expectedAnnotationVersion: 3, expectedTargetSetVersion: 2, targets: reference.targets, decision: "approve", reason: null });
  assert.equal(output.context.alvosDecididos, 1);
  assert.equal(output.links[0].relation, "observations");
  await assert.rejects(execute(adapter, "decidir_observacao", { curso: "Curso", referencia: reference,
    decisao: "encerrar_sem_alteracao", confirmado: true }), error => error.status === 422);
  assert.equal(calls.length, 1);
  await execute(adapter, "decidir_observacao", { curso: "Curso", referencia: reference,
    decisao: "encerrar_sem_alteracao", motivo: "A escolha editorial será mantida.", confirmado: true });
  assert.equal(calls[1].command.decision, "cancel");
  assert.equal(calls[1].command.reason, "A escolha editorial será mantida.");
});

test("fila oferece ausência explícita para cancelar alvo removido, sem referência de aprovação fabricada", async () => {
  const calls = []; let pending = true;
  const observation = { annotationId, annotationVersion: 3, targetSetVersion: 2,
    provenance: { origin: "author" }, state: "open", target: { kind: "study_unit", id: "removed" },
    targets: [{ kind: "study_unit", id: "removed", state: "pending", basis: null, current: null }] };
  const adapter = { publicAppUrl: "https://example.org",
    listCourses: async () => ({ items: [{ courseId, title: "Curso" }], hasMore: false }),
    getCourse: async () => ({ courseId, title: "Curso", revision: 5 }),
    getCourseInstructionalPlan: async () => ({ courseRevision: 5, plan: { title: "Curso", parts: [] } }),
    getCourseAnchoredAnnotations: async () => ({ items: pending ? [observation] : [], annotationSetVersion: 1,
      nextCursor: null, hasMore: false }),
    executeCourseAnchoredAnnotationCommand: async request => CourseSupabaseAdapter.prototype.executeCourseAnchoredAnnotationCommand.call({
      rpc: async (_name, parameters) => { calls.push(parameters); pending = false;
        return { contract: "aralearn.course-anchored-annotation-change.v1", courseId, courseRevision: 5,
          annotationSetVersion: 2, requestId: parameters.p_request_id, idempotent: false, changed: true, annotation: null };
      }
    }, request) };
  const listed = await execute(adapter, "consultar_observacoes", { curso: "Curso" });
  assert.equal(listed.context.observations.items.length, 1);
  const reference = listed.context.observations.items[0].referenciaDecisao;
  assert.deepEqual(reference.targets, [{ kind: "study_unit", id: "removed", expectedBasisHash: null }]);
  await assert.rejects(execute(adapter, "decidir_observacao", { curso: "Curso", referencia: reference,
    decisao: "aceitar_vigente", confirmado: true }), /removido/u);
  assert.equal(calls.length, 0);
  await execute(adapter, "decidir_observacao", { curso: "Curso", referencia: reference,
    decisao: "encerrar_sem_alteracao", motivo: "O alvo foi removido.", confirmado: true });
  assert.deepEqual(calls[0].p_command.targets, reference.targets);
  assert.equal(calls[0].p_command.expectedTargetSetVersion, 2);
  assert.equal((await execute(adapter, "consultar_observacoes", { curso: "Curso" })).context.observations.items.length, 0);
});

test("observação única admite explicação e unidades de outra microssequência", async () => {
  const calls = [];
  const adapter = { publicAppUrl: "https://example.org", listCourses: async () => ({ items: [{ courseId, title: "Curso" }], hasMore: false }),
    getCourse: async () => ({ courseId, title: "Curso", revision: 5 }),
    getCourseInstructionalPlan: async () => ({ courseRevision: 5, plan: { title: "Curso", curriculum: { modules: [{ lessons: [
      { microsequences: [{ id: "micro", position: 0, title: "Explicação principal" }] }] }] } } }),
    listCourseStudyUnits: async request => { assert.equal(request.scopeKind, "course"); return { items: [
      { studyUnit: { id: "unit-a", title: "Prática posterior", position: 1 }, ordinal: 1,
        curriculumPath: { didacticMicrosequence: { id: "other-micro" } } }], hasMore: false }; },
    createCourseAnchoredAnnotations: async request => { calls.push(request); return { changed: true }; }
  };
  const output = await execute(adapter, "registrar_observacao", { curso: "Curso", microssequencia: "Explicação principal",
    unidades: ["Prática posterior"], texto: "A mesma relação aparece nos dois objetos." });
  assert.equal(calls[0].commands.length, 1);
  assert.deepEqual(calls[0].commands[0].targets, [{ kind: "microsequence_explanation", id: "micro" }, { kind: "study_unit", id: "unit-a" }]);
  assert.equal(output.context.observationCount, 1);
  assert.equal(output.context.targetCount, 2);
});
