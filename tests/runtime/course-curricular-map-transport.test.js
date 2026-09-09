import test from "node:test";
import assert from "node:assert/strict";
import { CourseApiClient } from "../../src/supabase/CourseApiClient.js";
import { CourseSupabaseAdapter } from "../../supabase/functions/_shared/aralearn-authoring/courseSupabaseAdapter.js";
import { createCourseApiHandler } from "../../supabase/functions/_shared/aralearn-authoring/courseApiServer.js";

const actorId = "10000000-0000-4000-8000-000000000001";
const courseId = "20000000-0000-4000-8000-000000000001";
const origin = "https://app.example";
const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } });
const baseMap = () => ({ audience: "", prerequisites: [], scopeItems: [], modules: [
  { moduleId: "m1", title: "Primeiro", objective: "Compreender", position: 0, lessons: [] },
  { moduleId: "m2", title: "Segundo", objective: "Aplicar", position: 1, lessons: [] }
] });
function harness({ readonly = false, lostSaveResponse = false, lostApprovalResponse = false, forgedReceipt = false } = {}) {
  const calls = []; let map = baseMap(), courseRevision = 1, planVersion = 1;
  let receipt = null;
  const adapter = new CourseSupabaseAdapter({ supabaseUrl: "https://database.example", publicAppUrl: origin,
    publishableKey: "synthetic-public", serverApiKey: "synthetic-service", attempts: 1,
    fetchImpl: async (url, init) => {
      const input = JSON.parse(init.body); const name = url.split("/").at(-1); calls.push({ name, input });
      assert.equal(input.p_actor_id, actorId);
      if (name === "get_owned_course_curricular_map_for_actor_v1") return json({
        contract: "aralearn.course-curricular-map.v1", courseId, courseRevision, planVersion, map,
        approvalBasis: { courseRevision, planVersion, basisHash: "a".repeat(64) }
      });
      if (name === "get_course_change_receipt_for_actor_v1") return json(receipt
        ? { status: "confirmed", result: { ...receipt, ...(forgedReceipt ? { approval: "approved" } : {}), idempotent: true } }
        : { status: "absent" });
      if (name === "save_course_curricular_map_for_actor_v1") {
        assert.equal(input.p_expected_course_revision, courseRevision);
        assert.equal(input.p_expected_plan_version, planVersion);
        map = input.p_curricular_map; courseRevision++; planVersion++;
        receipt = { contract: "aralearn.course-curricular-map-change.v1", courseId, courseRevision, planVersion,
          approval: "draft", changed: true, idempotent: false };
        return lostSaveResponse ? json({ message: "Resposta perdida", code: "temporarily_unavailable" }, 503) : json(receipt);
      }
      assert.equal(name, "approve_course_curricular_map_for_actor_v1");
      assert.equal(input.p_expected_basis_hash, "a".repeat(64));
      assert.equal(input.p_expected_course_revision, courseRevision);
      assert.equal(input.p_expected_plan_version, planVersion);
      receipt = { contract: "aralearn.course-curricular-map-change.v1", courseId,
        courseRevision: ++courseRevision, planVersion: ++planVersion, approval: "approved", changed: true, idempotent: false };
      return lostApprovalResponse ? json({ message: "Resposta perdida" }, 503) : json(receipt);
    } });
  adapter.resolveApplicationPrincipal = async () => ({ actorId, authenticationKind: "application",
    scopes: readonly ? ["authoring:read"] : ["authoring:read", "authoring:write"] });
  const handler = createCourseApiHandler({ adapter, allowedOrigins: new Set([origin]) });
  const requests = [];
  const client = new CourseApiClient({ projectUrl: "https://database.example", publishableKey: "synthetic-public",
    authClient: { getAccessToken: async () => "synthetic-session" }, fetchImpl: (url, init) => {
      requests.push({ url, body: init.body ? JSON.parse(init.body) : null });
      const headers = new Headers(init.headers); headers.set("Origin", origin);
      return handler(new Request(url, { ...init, headers }));
    } });
  return { client, calls, requests };
}
const change = { courseId, expectedCourseRevision: 1, expectedPlanVersion: 1,
  command: { type: "save_module", moduleId: "m1", title: "Fundamentos" }, requestId: "map-transport-0001" };

test("cliente, rota e adapter preservam rascunho e irmãos ao enviar delta pequeno", async () => {
  const { client, calls, requests } = harness();
  const before = await client.getCurricularMap(courseId);
  assert.equal(before.completeness.complete, false);
  assert.ok(before.mapApprovalReference.length < 600);
  assert.equal((await client.saveCurricularMapSlice(change)).courseRevision, 2);
  const after = await client.getCurricularMap(courseId);
  assert.deepEqual(after.map.modules[1], before.map.modules[1]);
  assert.equal(after.map.modules[0].title, "Fundamentos");
  assert.deepEqual(requests[1].body.command, change.command);
  assert.equal(Object.hasOwn(requests[1].body, "map"), false);
  assert.equal(calls.filter(call => call.name === "save_course_curricular_map_for_actor_v1").length, 1);
});

test("aprovação HTTP usa somente referência da leitura persistida e rejeita identidade cruzada", async () => {
  const { client, calls, requests } = harness();
  const read = await client.getCurricularMap(courseId);
  const approved = await client.approveCurricularMap(courseId, read.mapApprovalReference);
  assert.equal(approved.approval, "approved");
  assert.deepEqual(requests[1].body, { reference: read.mapApprovalReference });
  assert.equal(Object.hasOwn(calls.at(-1).input, "p_curricular_map"), false);
  await assert.rejects(client.approveCurricularMap(actorId, read.mapApprovalReference), { status: 422 });
});

test("resposta perdida é reconciliada pelo recibo da mesma tentativa sem novo save", async () => {
  const { client, calls } = harness({ lostSaveResponse: true });
  assert.equal((await client.saveCurricularMapSlice(change)).idempotent, true);
  assert.equal((await client.saveCurricularMapSlice(change)).idempotent, true);
  assert.equal(calls.filter(call => call.name === "save_course_curricular_map_for_actor_v1").length, 1);
});
test("aprovação perdida relê recibo por identidade e hash sem repetir escrita", async () => {
  const { client, calls } = harness({ lostApprovalResponse: true });
  const read = await client.getCurricularMap(courseId);
  assert.equal((await client.approveCurricularMap(courseId, read.mapApprovalReference)).idempotent, true);
  const write = calls.find(call => call.name === "approve_course_curricular_map_for_actor_v1");
  const recovery = calls.at(-1);
  assert.equal(recovery.name, "get_course_change_receipt_for_actor_v1");
  assert.equal(recovery.input.p_request_hash, write.input.p_request_hash);
  assert.equal(recovery.input.p_request_id, write.input.p_request_id);
  assert.equal(calls.filter(call => call.name === write.name).length, 1);
});

test("recibo incompatível e escopo somente leitura não viram confirmação de escrita", async () => {
  const wrong = harness({ lostSaveResponse: true, forgedReceipt: true });
  await assert.rejects(wrong.client.saveCurricularMapSlice(change), { code: "course_write_uncertain" });
  const read = harness({ readonly: true });
  await assert.rejects(read.client.saveCurricularMapSlice(change), { status: 403 });
  assert.equal(read.calls.length, 0);
});
