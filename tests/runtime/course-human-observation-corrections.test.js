import test from "node:test";
import assert from "node:assert/strict";
import { applyHumanCourseCorrections, resumeHumanCourseObservationCorrection } from
  "../../supabase/functions/_shared/aralearn-authoring/courseHumanCorrections.js";
import { AuthoringApiError } from "../../supabase/functions/_shared/aralearn-authoring/errors.js";
import { normalizeCourseObservationCorrectionReferences, normalizeCourseObservationCorrectionConfirmations,
  normalizeCourseObservationCorrection } from "../../src/domain/courseAnchoredAnnotations.js";

const COURSE = "10000000-0000-4000-8000-000000000001";
const OBSERVATION = "20000000-0000-4000-8000-000000000001";
const OTHER_OBSERVATION = "20000000-0000-4000-8000-000000000002";
const reference = { annotationId: OBSERVATION, annotationVersion: 1, targetKind: "study_unit", targetId: "unit" };
const principal = { actorId: COURSE, authenticationKind: "oauth" };
const content = (text = "Conteúdo corrigido.") => ({ title: "Unidade", role: "theory", topics: [], response: null, feedback: [],
  content: [{ id: "body", package: "aralearn.resource.paragraph", version: "1.0.0", data: { text } }] });
const failure = () => new AuthoringApiError(503, "course_service_unavailable", "Resposta perdida.");

function fixture({ lostCommit = false, lostConfirmation = false, absentReceipt = false, edited = false, noop = false, changedContent = false } = {}) {
  let revision = 1;
  let currentContent = content("Texto original.");
  let receipt = null;
  let queue = [OBSERVATION, OTHER_OBSERVATION].map(annotationId => ({ annotationId, annotationVersion: 1,
    provenance: { origin: "author" }, target: { kind: "study_unit", id: "unit" }, state: "open", rawText: "Corrigir sem perder a observação seguinte." }));
  const calls = [];
  const adapter = {
    calls,
    async listCourses() { return { items: [{ courseId: COURSE, title: "Curso" }], hasMore: false }; },
    async getCourse() { calls.push("course"); return { courseId: COURSE, revision, title: "Curso" }; },
    async listCourseStudyUnits() { calls.push("units"); return { items: [{ ordinal: 1, version: revision,
      curriculumPath: { didacticMicrosequence: { id: "micro" } }, studyUnit: { ...currentContent, id: "unit", position: 1 } }], hasMore: false }; },
    async listCourseEntities() { calls.push("entities"); return { items: [{ entityType: "study_unit", entityId: "unit", content: currentContent }], hasMore: false }; },
    async getCourseSources() { calls.push("sources"); return { items: [{ sourceLinks: [] }] }; },
    async getCourseAnchoredAnnotations() { calls.push("queue"); return { items: structuredClone(queue), annotationSetVersion: revision, hasMore: false }; },
    async commitCourseComposition() { calls.push("generic-commit"); return { revision }; },
    async commitCourseObservationCorrections(request) {
      calls.push("commit");
      adapter.request = structuredClone(request);
      currentContent = request.upserts[0].content;
      revision += 1;
      receipt = { contract: "aralearn.course-observation-correction.v1", status: "persisted", courseId: COURSE,
        requestId: request.requestId, revision, idempotent: false, observations: request.observations.map(entry => ({ ...entry,
          changed: !noop, confirmed: false, effectHash: "a".repeat(64), currentEffectHash: changedContent ? "b".repeat(64) : "a".repeat(64) })) };
      if (edited) queue[0] = { ...queue[0], annotationVersion: 2, rawText: "Nova versão pendente" };
      if (lostCommit) throw failure();
      return structuredClone(receipt);
    },
    async getCourseObservationCorrection({ requestId }) {
      calls.push("receipt");
      if (absentReceipt) return { contract: "aralearn.course-observation-correction.v1", status: "absent", courseId: COURSE, requestId };
      return { ...structuredClone(receipt), idempotent: true };
    },
    async confirmCourseObservationCorrection({ confirmations }) {
      calls.push("confirm");
      adapter.confirmations = structuredClone(confirmations);
      for (const confirmation of confirmations) {
        receipt.observations.find(entry => entry.annotationId === confirmation.annotationId).confirmed = true;
        queue = queue.filter(entry => entry.annotationId !== confirmation.annotationId);
      }
      if (lostConfirmation) throw failure();
      return structuredClone(receipt);
    }
  };
  return adapter;
}
const apply = (adapter, observations = [reference]) => applyHumanCourseCorrections({ adapter, principal, course: "Curso",
  corrections: [{ unidade: 1, conteudo: content() }], observations });

test("correção lê fila antes da escrita, relê conteúdo/fontes/fila e consome somente referência declarada", async () => {
  const adapter = fixture();
  const result = await apply(adapter);
  assert.ok(adapter.calls.indexOf("queue") < adapter.calls.indexOf("commit"));
  assert.deepEqual(adapter.calls.slice(adapter.calls.indexOf("commit") + 1), ["receipt", "course", "entities", "sources", "queue", "receipt", "confirm"]);
  assert.deepEqual(adapter.request.observations, [reference]);
  assert.equal(Object.hasOwn(adapter.request, "deletes"), false);
  assert.equal(result.context.confirmedObservationCount, 1);
  assert.equal(result.context.pendingObservationCount, 1, "A aplicação parcial da fila não consome a outra entrada.");
  assert.equal(adapter.calls.includes("generic-commit"), false);
});

test("respostas perdidas de escrita ou confirmação recuperam pelo recibo sem repetir conteúdo ou consumos", async () => {
  for (const option of ["lostCommit", "lostConfirmation"]) {
    const adapter = fixture({ [option]: true });
    const result = await apply(adapter);
    assert.equal(result.context.confirmedObservationCount, 1);
    assert.equal(adapter.calls.filter(call => call === "commit").length, 1);
    assert.equal(adapter.calls.filter(call => call === "confirm").length, 1);
    const before = adapter.calls.length;
    const resumed = await resumeHumanCourseObservationCorrection({ adapter, principal, courseId: COURSE, requestId: adapter.request.requestId });
    assert.equal(resumed.context.confirmedObservationCount, 1);
    assert.equal(adapter.calls.slice(before).includes("commit"), false);
    assert.equal(adapter.calls.slice(before).includes("confirm"), false);
  }
});

test("no-op, edição posterior e alteração posterior do conteúdo mantêm versão pendente", async () => {
  for (const option of ["noop", "edited", "changedContent"]) {
    const adapter = fixture({ [option]: true });
    const result = await apply(adapter);
    assert.equal(result.context.confirmedObservationCount, 0);
    assert.equal(result.context.pendingObservationCount, 2);
    assert.equal(adapter.calls.filter(call => call === "commit").length, 1);
    assert.equal(adapter.calls.includes("confirm"), false);
  }
});

test("ausência de recibo conserva request original e impede nova escrita na retomada", async () => {
  const adapter = fixture({ lostCommit: true, absentReceipt: true });
  await assert.rejects(apply(adapter), error => error.code === "course_write_uncertain" && error.details.requestId === adapter.request.requestId);
  await assert.rejects(resumeHumanCourseObservationCorrection({ adapter, principal, courseId: COURSE, requestId: adapter.request.requestId }),
    error => error.code === "course_write_uncertain" && error.details.targetCourseId === COURSE);
  assert.equal(adapter.calls.filter(call => call === "commit").length, 1);
  assert.equal(adapter.calls.includes("confirm"), false);
});

test("fila obrigatória, alvo e versão inválidos bloqueiam antes de salvar; refs omitidas não consomem", async () => {
  const unavailable = fixture();
  delete unavailable.getCourseAnchoredAnnotations;
  await assert.rejects(apply(unavailable, []), error => error.code === "course_service_unavailable");
  assert.equal(unavailable.calls.includes("generic-commit"), false);
  const stale = fixture();
  await assert.rejects(apply(stale, [{ ...reference, annotationVersion: 2 }]), error => error.code === "course_observation_version_conflict");
  assert.equal(stale.calls.includes("commit"), false);
  const wrong = fixture();
  await assert.rejects(apply(wrong, [{ ...reference, targetId: "other" }]), error => error.code === "invalid_course_observation_correction");
  const unselected = fixture();
  assert.equal((await apply(unselected, [])).context.pendingObservationCount, 2);
  assert.ok(unselected.calls.indexOf("queue") < unselected.calls.indexOf("generic-commit"));
  assert.equal(unselected.calls.includes("confirm"), false);
});

test("normalização exige identidades/versionamento, confirmação exata e efeito material para consumo", () => {
  assert.deepEqual(normalizeCourseObservationCorrectionReferences([reference]), [reference]);
  for (const references of [[reference, reference], [{ ...reference, annotationVersion: 0 }], [{ ...reference, targetKind: "didactic_microsequence" }], [{ ...reference, unknown: true }]]) {
    assert.throws(() => normalizeCourseObservationCorrectionReferences(references));
  }
  const confirmation = { annotationId: OBSERVATION, annotationVersion: 1, effectHash: "a".repeat(64) };
  assert.deepEqual(normalizeCourseObservationCorrectionConfirmations([confirmation]), [confirmation]);
  assert.throws(() => normalizeCourseObservationCorrectionConfirmations([{ ...confirmation, rawText: "excesso" }]));
  assert.throws(() => normalizeCourseObservationCorrection({ contract: "aralearn.course-observation-correction.v1", status: "persisted", courseId: COURSE,
    requestId: "correction-request-001", revision: 2, idempotent: true, observations: [{ ...reference, effectHash: "a".repeat(64), currentEffectHash: "a".repeat(64), changed: false, confirmed: true }] }));
});
