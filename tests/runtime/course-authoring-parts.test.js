import test from "node:test";
import assert from "node:assert/strict";
import { normalizeCourseAuthoringPartRequest, normalizeCourseAuthoringPartChange,
  splitCourseAuthoringPart, mergeCourseAuthoringParts } from "../../src/domain/courseAuthoringParts.js";
import { CourseApiClient } from "../../src/supabase/CourseApiClient.js";
import { CourseController } from "../../src/supabase/CourseController.js";
import { CourseSupabaseAdapter } from "../../supabase/functions/_shared/aralearn-authoring/courseSupabaseAdapter.js";
import { createCoursePartsPanel } from "../../src/ui/CoursePartsPanel.js";

const id = "30400000-0000-4000-8000-000000000001";
const partId = "30400000-0000-4000-8000-000000000002";
const newId = "30400000-0000-4000-8000-000000000003";
const part = { id: partId, position: 0, title: "Início", intent: "Intenção literal.\nOutra linha.", progression: ["Primeiro\npasso", "Segundo"],
  microsequences: [{ id: "micro-a", title: "Primeiro" }, { id: "micro-b", title: "Segundo" }, { id: "micro-c", title: "Terceiro" }] };
const other = { ...structuredClone(part), id: newId, position: 1, title: "Depois", microsequences: [{ id: "micro-d", title: "Quarto" }] };
const request = () => ({ courseId: id, expectedCourseRevision: 5, expectedPlanVersion: 2, requestId: "test-parts-304", part: splitCourseAuthoringPart(part, 1) });
const receipt = (extra = {}) => ({ contract: "aralearn.course-authoring-part-change.v1", courseId: id,
  courseRevision: 6, planVersion: 3, authoringPartId: newId, changed: true, idempotent: false, ...extra });

test("divisão e reunião preservam identidades, intenção literal e progressão sem truncar", () => {
  const before = structuredClone(part);
  const split = splitCourseAuthoringPart(part, 1);
  assert.equal(split.partId, null); assert.equal(split.position, 1);
  assert.deepEqual(split.microsequences, [{ microsequenceId: "micro-b", position: 0 }, { microsequenceId: "micro-c", position: 1 }]);
  assert.equal(split.intent, part.intent); assert.deepEqual(split.progression, part.progression);
  assert.deepEqual(part, before);
  const merged = mergeCourseAuthoringParts([other, part]);
  assert.equal(merged.partId, partId);
  assert.deepEqual(merged.microsequences.map(item => item.microsequenceId), ["micro-a", "micro-b", "micro-c", "micro-d"]);
  assert.equal(merged.intent, `${part.title}\n${part.intent}\n\n${other.title}\n${other.intent}`);
  assert.deepEqual(merged.progression, [...part.progression, ...other.progression]);
  assert.throws(() => splitCourseAuthoringPart(part, 3));
  assert.throws(() => mergeCourseAuthoringParts([part, part]));
});

test("contrato limita 64 microssequências e falha fechado em campos, ordem ou confirmação divergentes", () => {
  const value = request();
  value.part.microsequences = Array.from({ length: 64 }, (_, position) => ({ microsequenceId: `m-${position}`, position }));
  assert.equal(normalizeCourseAuthoringPartRequest(value).part.microsequences.length, 64);
  assert.throws(() => normalizeCourseAuthoringPartRequest({ ...value, unknown: true }));
  assert.throws(() => normalizeCourseAuthoringPartRequest({ ...value, part: { ...value.part, microsequences: [...value.part.microsequences, { microsequenceId: "m-64", position: 64 }] } }));
  assert.throws(() => normalizeCourseAuthoringPartRequest({ ...value, part: { ...value.part, microsequences: [{ microsequenceId: "a", position: 1 }] } }));
  assert.equal(normalizeCourseAuthoringPartChange(receipt({ idempotent: true }), value).authoringPartId, newId);
  for (const changed of [{ courseRevision: 7 }, { planVersion: 4 }, { authoringPartId: null }, { courseId: partId }]) {
    assert.throws(() => normalizeCourseAuthoringPartChange(receipt(changed), value));
  }
  assert.throws(() => normalizeCourseAuthoringPartChange(receipt(), { ...value, part: { ...value.part, partId } }));
});

test("cliente envia CAS e recibo, controller invalida planejamento e rejeita estudante", async () => {
  let call;
  const api = new CourseApiClient({ projectUrl: "https://example.test", publishableKey: "synthetic-key",
    authClient: { getAccessToken: async () => "synthetic-token" }, fetchImpl: async (url, init) => {
      call = { url, body: JSON.parse(init.body) };
      return new Response(JSON.stringify({ data: receipt() }), { headers: { "Content-Type": "application/json" } });
    } });
  await api.saveCourseAuthoringPart(request());
  assert.match(call.url, /\/authoring-parts$/u); assert.equal(call.body.expectedPlanVersion, 2);
  assert.equal(call.body.part.partId, null); assert.equal(call.body.requestId, request().requestId);
  const cleared = [];
  const store = { getCache: async () => null, putCache: async () => {}, deleteCachePrefix: async key => cleared.push(key) };
  const controller = new CourseController({ api, store, ownerOnly: true });
  await controller.saveCourseAuthoringPart(request());
  assert.ok(cleared.some(key => key.includes("instructional-plan")));
  const student = new CourseController({ api, store, ownerOnly: false });
  await assert.rejects(student.saveCourseAuthoringPart(request()), /Somente a Autoria/u);
});

test("Adapter aceita UUID de criação e replay, mas rejeita confirmação alterada", async () => {
  let result = receipt();
  const calls = [];
  const adapter = new CourseSupabaseAdapter({ supabaseUrl: "https://project.example", serverApiKey: "synthetic-key", publishableKey: "synthetic-public-key",
    publicAppUrl: "https://app.example/", fetchImpl: async (_url, init) => {
      calls.push(JSON.parse(init.body));
      return new Response(JSON.stringify(result), { headers: { "Content-Type": "application/json" } });
    } });
  const value = { ...request(), principal: { actorId: id } };
  assert.equal((await adapter.saveCourseAuthoringPart(value)).authoringPartId, newId);
  result = receipt({ idempotent: true });
  assert.equal((await adapter.saveCourseAuthoringPart(value)).idempotent, true);
  assert.equal(calls[0].p_request_hash, calls[1].p_request_hash);
  result = receipt({ courseRevision: 7 });
  await assert.rejects(adapter.saveCourseAuthoringPart(value), { status: 503 });
});

class Root {
  innerHTML = ""; hidden = false; listeners = new Map(); classList = { add() {} };
  addEventListener(event, listener) { this.listeners.set(event, listener); }
  removeEventListener(event) { this.listeners.delete(event); }
  replaceChildren() { this.innerHTML = ""; }
  click(action) { return this.listeners.get("click")({ target: { closest: () => ({ dataset: { partsAction: action } }) } }); }
  submit() { return this.listeners.get("submit")({ preventDefault() {}, target: { matches: () => true } }); }
}
test("painel mantém rascunho e pedido na resposta perdida, retry confirma uma criação", async () => {
  const root = new Root(); const calls = []; const changed = [];
  const panel = createCoursePartsPanel({ root, courseId: id, controller: { async saveCourseAuthoringPart(value) {
    calls.push(structuredClone(value)); if (calls.length === 1) throw new TypeError("fetch failed"); return receipt({ idempotent: true });
  } }, onChanged: result => changed.push(result) });
  panel.open({ planning: { courseId: id, courseRevision: 5, plan: { version: 2, parts: [part, other] } } });
  root.click("split"); assert.equal(panel.hasPendingDraft(), true);
  assert.equal(panel.open({ planning: {} }), false);
  await root.submit(); assert.equal(panel.hasPendingDraft(), true);
  await root.submit(); assert.deepEqual(calls[0], calls[1]);
  assert.equal(changed.length, 1); assert.equal(panel.hasPendingDraft(), false);
  panel.destroy(); assert.equal(root.listeners.size, 0);
});

test("painel preserva progresso multilinha e pede descarte próprio ao fechar", () => {
  const root = new Root(); let closed = 0;
  const panel = createCoursePartsPanel({ root, controller: {}, courseId: id, onClose: () => closed++ });
  panel.open({ planning: { courseId: id, courseRevision: 5, plan: { version: 2, parts: [part, other] } } });
  root.click("split"); root.click("close");
  assert.equal(closed, 0); assert.match(root.innerHTML, /role="alertdialog"/u);
  assert.match(root.innerHTML, /Primeiro\npasso/u);
  root.click("keep"); assert.equal(panel.hasPendingDraft(), true);
  root.click("discard-close"); assert.equal(closed, 1); assert.equal(panel.hasPendingDraft(), false);
});
