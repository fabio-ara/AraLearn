import test from "node:test";
import assert from "node:assert/strict";
import { executeHumanCourseTask } from "../../supabase/functions/_shared/aralearn-authoring/courseHumanTasks.js";
import { createContentReviewReference } from "../../supabase/functions/_shared/aralearn-authoring/courseContentReviewReference.js";
import { AuthoringApiError } from "../../supabase/functions/_shared/aralearn-authoring/errors.js";
import { CourseSupabaseAdapter } from "../../supabase/functions/_shared/aralearn-authoring/courseSupabaseAdapter.js";

const actorId = "10000000-0000-4000-8000-000000000001";
const courseId = "20000000-0000-4000-8000-000000000002";
const annotationId = "30000000-0000-4000-8000-000000000003";
const principal = { actorId, authenticationKind: "action", scopes: ["authoring:read", "authoring:write"] };
const report = { summary: "Base e relações examinadas.", outcome: "consistent", findings: [],
  checks: ["alignment", "evidence", "representation", "feedback", "sufficiency"].map(dimension => ({
    dimension, result: "sufficient", reason: "A explicação desenvolve a relação solicitada.", evidence: ["Relações"] })) };
const initial = () => ({ contract: "aralearn.course-ai-inspection.v1", courseId, courseRevision: 5,
  targetKind: "microsequence_explanation", targetId: "micro", basisHash: "a".repeat(64),
  pedagogicalBasis: { targetKind: "microsequence_explanation", targetId: "micro",
    microsequence: { title: "Relações", goal: "Explicar relações" }, planItems: [], studyUnits: [], dependencies: [] },
  inspection: { state: "pending", basisHash: "a".repeat(64) } });
const execute = (adapter, name, args) => executeHumanCourseTask({ adapter, principal, name, rawArguments: args });

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

test("parecer não escreve base obsoleta e recusa conflito sem repetir a tentativa", async () => {
  const before = initial();
  const reference = await createContentReviewReference({ principal, read: before });
  let writes = 0;
  const adapter = { getCourseContentInspection: async () => ({ ...before, basisHash: "b".repeat(64),
    inspection: { state: "pending", basisHash: "b".repeat(64) } }),
    recordCourseContentInspection: async () => { writes++; } };
  await assert.rejects(execute(adapter, "registrar_inspecao", { referencia: reference, parecer: report }),
    error => error.code === "course_ai_inspection_conflict" && error.status === 409);
  assert.equal(writes, 0);
  adapter.getCourseContentInspection = async () => before;
  adapter.recordCourseContentInspection = async () => { writes++; throw new AuthoringApiError(409, "stale_course_state", "Base mudou"); };
  await assert.rejects(execute(adapter, "registrar_inspecao", { referencia: reference, parecer: report }),
    error => error.code === "stale_course_state");
  assert.equal(writes, 1);
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
