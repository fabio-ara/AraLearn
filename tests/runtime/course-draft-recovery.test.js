import test from "node:test";
import assert from "node:assert/strict";
import { IDBFactory } from "fake-indexeddb";
import { CourseLocalStore } from "../../src/persistence/CourseLocalStore.js";
import { CourseController, STUDY_DRAFT_RECOVERY_CACHE_KEY } from "../../src/supabase/CourseController.js";
import { CourseApiClient } from "../../src/supabase/CourseApiClient.js";

const SOURCE = "10000000-0000-4000-8000-000000000001";
const TARGET = "20000000-0000-4000-8000-000000000002";
const LEGACY_KEY = "aralearn.personal-course-copy-edit-pending.v1";
const unit = { id: "unit-a", position: 1, title: "Rascunho preservado", role: "theory",
  content: [{ id: "paragraph-a", package: "aralearn.resource.paragraph", version: "1.0.0",
    data: { text: "Trabalho ainda não confirmado." } }], response: null, feedback: [], topics: [] };
const command = { requestId: "request-recovery-0001", sourceCourseId: SOURCE,
  expectedSourceCourseRevision: 4, expectedStudyUnitVersion: 3, didacticMicrosequenceId: "micro-a",
  studyUnit: unit, origin: "manual" };
const pending = { contract: LEGACY_KEY, ...command, targetId: "paragraph-a",
  sourceSelection: { courseId: SOURCE, moduleId: "module-a", lessonId: "lesson-a",
    microsequenceId: "micro-a", studyUnitId: "unit-a" }, savedAt: "2026-09-05T10:00:00Z" };
const receipt = { contract: "aralearn.owned-course-copy-recovery.v1", status: "confirmed",
  sourceCourseId: SOURCE, targetCourseId: TARGET, currentCourseRevision: 8,
  studyUnitId: "unit-a", currentStudyUnitVersion: null, initialCourseRevision: 2,
  initialStudyUnitVersion: 2, applicationOrigin: "manual", confirmedAt: "2026-09-05T10:00:00Z" };

function clientWith(response, calls = []) {
  return new CourseApiClient({ projectUrl: "https://project.supabase.co", publishableKey: "sb_publishable_test",
    authClient: { getAccessToken: async () => "session" }, fetchImpl: async (url, init) => {
      calls.push({ url, init, body: JSON.parse(init.body) });
      return new Response(JSON.stringify({ ok: true, data: response }), { headers: { "content-type": "application/json" } });
    } });
}

async function controller(t, recoverOwnedCourseCopy = async () => receipt) {
  const store = await CourseLocalStore.open(new IDBFactory(), { userId: SOURCE });
  t.after(() => store.close());
  const value = new CourseController({ store, api: {
    listCourses: async () => ({}), getCourse: async () => ({}), recoverOwnedCourseCopy
  } });
  return { value, store };
}

test("recuperação consulta a intenção original sem executar o writer removido", async () => {
  const calls = [];
  const client = clientWith(receipt, calls);
  assert.deepEqual(await client.recoverOwnedCourseCopy(command), receipt);
  assert.equal(typeof client.commitPersonalCourseCopyEdit, "undefined");
  assert.match(calls[0].url, /\/copy-recovery$/u);
  assert.equal(calls[0].body.applicationOrigin, "manual");
  assert.equal(Object.hasOwn(calls[0].body, "actorId"), false);
  assert.deepEqual(calls[0].body.studyUnit, unit);
});

test("prova divergente, incompleta ou alvo igual à origem falha fechada", async () => {
  const missing = { ...receipt };
  delete missing.confirmedAt;
  for (const response of [missing, { ...receipt, sourceCourseId: TARGET },
    { ...receipt, targetCourseId: SOURCE }, { ...receipt, studyUnitId: "another" },
    { ...receipt, applicationOrigin: "provider_assistance" }, { ...receipt, currentCourseRevision: 1 },
    { ...receipt, status: "unresolved" }, { ...receipt, extra: true }]) {
    await assert.rejects(clientWith(response).recoverOwnedCourseCopy(command), TypeError);
  }
});

test("ausência de prova e no-op preservam estado inconclusivo sem alvo", async () => {
  for (const status of ["unchanged", "unresolved"]) {
    const response = { ...receipt, status, targetCourseId: null, currentCourseRevision: null,
      currentStudyUnitVersion: null, initialCourseRevision: null, initialStudyUnitVersion: null,
      confirmedAt: null };
    assert.deepEqual(await clientWith(response).recoverOwnedCourseCopy(command), response);
  }
});

test("Controller move snapshot integral uma vez e confirmação não remove rascunho", async (t) => {
  let calls = 0;
  const { value, store } = await controller(t, async (input) => {
    calls += 1;
    assert.deepEqual(input, command);
    return receipt;
  });
  await store.putCache(LEGACY_KEY, pending);
  assert.deepEqual(await value.loadStudyDraftRecovery(), pending);
  assert.equal(await store.getCache(LEGACY_KEY), null);
  assert.deepEqual(await store.getCache(STUDY_DRAFT_RECOVERY_CACHE_KEY), pending);
  const result = await value.recoverStudyDraft();
  assert.equal(result.status, "confirmed");
  assert.deepEqual(result.pending, pending);
  assert.equal(calls, 1);
  assert.deepEqual(await value.loadStudyDraftRecovery(), pending);
  assert.equal(typeof value.commitPersonalCourseCopyEdit, "undefined");
  assert.equal(typeof value.retryPendingPersonalCopyEdit, "undefined");
});

test("snapshot inválido e falha de rede conservam todos os dados locais", async (t) => {
  const { value, store } = await controller(t, async () => { throw new Error("offline"); });
  const invalid = { ...pending, studyUnit: { usefulUnknownShape: "Não eliminar" } };
  await store.putCache(LEGACY_KEY, invalid);
  assert.deepEqual((await value.recoverStudyDraft()).pending, invalid);
  assert.deepEqual(await store.getCache(STUDY_DRAFT_RECOVERY_CACHE_KEY), invalid);
  await store.putCache(STUDY_DRAFT_RECOVERY_CACHE_KEY, pending);
  await assert.rejects(value.recoverStudyDraft(), /offline/u);
  assert.deepEqual(await value.loadStudyDraftRecovery(), pending);
});

test("descarte exige snapshot atual e não elimina uma nova intenção concorrente", async (t) => {
  const { value, store } = await controller(t);
  await store.putCache(LEGACY_KEY, pending);
  assert.equal(await value.clearStudyDraftRecovery(SOURCE, "different-request"), false);
  const newer = { ...pending, requestId: "request-recovery-0002" };
  await store.putCache(STUDY_DRAFT_RECOVERY_CACHE_KEY, newer);
  assert.equal(await value.clearStudyDraftRecovery(SOURCE, pending.requestId), false);
  assert.deepEqual(await value.loadStudyDraftRecovery(), newer);
  assert.equal(await value.clearStudyDraftRecovery(SOURCE, newer.requestId), true);
  assert.equal(await value.loadStudyDraftRecovery(), null);
});
