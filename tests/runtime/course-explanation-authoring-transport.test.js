import test from "node:test";
import assert from "node:assert/strict";
import { CourseApiClient } from "../../src/supabase/CourseApiClient.js";
import { CourseController } from "../../src/supabase/CourseController.js";
import { CourseSupabaseAdapter } from "../../supabase/functions/_shared/aralearn-authoring/courseSupabaseAdapter.js";
import { executeCourseRoute } from "../../supabase/functions/_shared/aralearn-authoring/courseRouter.js";
import { routeCourseRequest } from "../../supabase/functions/_shared/aralearn-authoring/courseProtocol.js";

const courseId = "34500000-0000-4000-8000-000000000001";
const principal = { actorId: courseId, authenticationKind: "application", scopes: ["authoring:write"] };
const explanation = text => ({ title: "Ligações", content: [{ id: "p", package: "aralearn.resource.paragraph", version: "1.0.0", data: { text } }] });
const intent = { courseId, microsequenceId: "ms-a", expectedRevision: 7, expectedEntityVersion: 3,
  explanation: explanation("Uma ligação conecta dois elementos."), requestId: "manual-explanation-0001" };
const entity = { entityType: "microsequence", entityId: "ms-a", parentType: "lesson", parentId: "l-a", position: 0,
  version: 3, content: { title: "Microssequência", goal: "Conectar", role: "explain", covers: [], checks: [], dependsOn: [], explanationPlan: {
    purpose: "Explicar a ligação.", prerequisites: [], relations: [], sourceIds: [] }, explanation: explanation("Texto anterior.") } };
const sources = { contract: "aralearn.course-sources.v3", courseId, courseRevision: 7, bibliographyStyle: "abnt-2025",
  mode: "target", query: { sourceId: null, targetKind: "microsequence_explanation", targetId: "ms-a" },
  pdfStorage: { uniqueBytes: 0, maxUniqueBytes: 67108864 }, items: [], nextCursor: null };
class Store {
  values = new Map();
  async getCache(key) { return this.values.get(key) ?? null; }
  async putCache(key, value) { if (value == null) this.values.delete(key); else this.values.set(key, structuredClone(value)); }
  async deleteCachePrefix(prefix) { for (const key of this.values.keys()) if (key.startsWith(prefix)) this.values.delete(key); }
}
function fixture() {
  const calls = [];
  const rpcCalls = [];
  const adapter = new CourseSupabaseAdapter({ supabaseUrl: "https://project.invalid", publicAppUrl: "https://app.invalid",
    serverApiKey: "fixture-secret", publishableKey: "fixture-public", fetchImpl: async () => { throw new Error("unexpected fetch"); } });
  const state = { uncertain: false, wrongOrigin: false, wrongVersion: false, unchangedEntity: false };
  adapter.getCourseSources = async value => { calls.push({ sourceRead: value }); return sources; };
  adapter.rpc = async (name, args) => {
    rpcCalls.push({ name, args });
    return { courseId, revision: 8, operation: "commit_course_composition", createdCount: 0,
      updatedCount: state.unchangedEntity ? 0 : 1, upsertedCount: state.unchangedEntity ? 0 : 1, deletedCount: 0,
      updatedAt: "2026-09-07T12:00:00Z", expectedStudyUnitVersion: null, idempotent: rpcCalls.length > 1,
      channel: "application", applicationOrigin: "manual", changeOrigin: state.wrongOrigin ? "gpt" : "human",
      expectedMicrosequenceVersion: 3, microsequenceId: "ms-a", microsequenceVersion: state.unchangedEntity ? 3 : 4 };
  };
  const api = new CourseApiClient({ projectUrl: "https://project.invalid", publishableKey: "fixture-public",
    authClient: { getSession: () => ({ user: { id: courseId } }), getAccessToken: async () => "fixture-access" },
    fetchImpl: async (url, init) => {
      calls.push({ url, body: init.body ? JSON.parse(init.body) : null });
      if (url.endsWith("list_owned_course_entities_v1")) return Response.json({ contract: "aralearn.course-entities.v1",
        courseId, revision: 7, items: [{ ...entity, version: state.wrongVersion ? 4 : 3 }], hasMore: false, nextCursor: null });
      const parsed = new URL(url);
      const path = parsed.pathname.replace(/^\/functions\/v1\/aralearn-course-api/u, "");
      const request = new Request(url, init);
      const response = await executeCourseRoute({ request, route: routeCourseRequest(request.method, path), adapter, principal });
      if (state.uncertain && path.endsWith("/composition")) throw new TypeError("Failed to fetch");
      return Response.json({ ok: true, data: response.data });
    } });
  const store = new Store();
  return { api, adapter, store, state, calls, rpcCalls, controller: new CourseController({ api, store, ownerOnly: true }) };
}

test("Autoria encaminha consulta de fontes da Explicação pelo endpoint existente", async () => {
  const f = fixture();
  assert.deepEqual(await f.controller.loadCourseSources(courseId, { expectedRevision: 7, mode: "target",
    targetKind: "microsequence_explanation", targetId: "ms-a" }), sources);
  assert.equal(f.calls.find(call => call.sourceRead).sourceRead.targetKind, "microsequence_explanation");
  await assert.rejects(new CourseController({ api: f.api, store: f.store }).loadCourseSources(courseId,
    { expectedRevision: 7, mode: "target", targetKind: "microsequence_explanation", targetId: "ms-a" }), /Autoria/u);
});

test("edição manual conserva MS/fontes e recupera o mesmo POST depois de resposta perdida e reabertura", async () => {
  const f = fixture();
  f.state.uncertain = true;
  await assert.rejects(f.controller.saveMicrosequenceExplanation(intent), /fetch/u);
  assert.equal(f.rpcCalls.length, 1);
  const args = f.rpcCalls[0].args;
  assert.equal(args.p_expected_microsequence_version, 3);
  assert.equal(args.p_expected_study_unit_version, null);
  assert.equal(args.p_application_origin, "manual");
  assert.equal(args.p_upserts[0].content.title, entity.content.title);
  assert.deepEqual(args.p_upserts[0].content.explanationPlan, entity.content.explanationPlan);
  assert.equal(Object.hasOwn(args.p_upserts[0].content, "errors"), false);
  assert.deepEqual(args.p_upserts[0].content.explanation, intent.explanation);
  assert.deepEqual(args.p_source_attribution_applications, [{ targetKind: "microsequence_explanation", targetId: "ms-a", sourceLinks: [] }]);
  const reopened = new CourseController({ api: f.api, store: f.store, ownerOnly: true });
  assert.deepEqual(await reopened.loadPendingMicrosequenceExplanationEdit(courseId, "ms-a"), intent);
  await assert.rejects(reopened.saveMicrosequenceExplanation({ ...intent, requestId: "manual-explanation-0002" }), /pendente/u);
  f.state.uncertain = false;
  const result = await reopened.saveMicrosequenceExplanation(intent);
  assert.equal(result.idempotent, true);
  assert.deepEqual(f.rpcCalls[1], f.rpcCalls[0]);
  assert.equal(await reopened.loadPendingMicrosequenceExplanationEdit(courseId, "ms-a"), null);
  assert.equal(f.calls.filter(call => call.url?.endsWith("list_owned_course_entities_v1")).length, 1);
});

test("edição recusa versão divergente, recibo de IA e acesso de Estudo", async () => {
  const f = fixture();
  f.state.wrongVersion = true;
  await assert.rejects(f.controller.saveMicrosequenceExplanation(intent), /mudou/u);
  assert.equal(f.rpcCalls.length, 0);
  f.state.wrongVersion = false;
  f.state.wrongOrigin = true;
  await assert.rejects(f.controller.saveMicrosequenceExplanation(intent), /confirmação/u);
  assert.ok(await f.controller.loadPendingMicrosequenceExplanationEdit(courseId, "ms-a"));
  await assert.rejects(new CourseController({ api: f.api, store: f.store }).saveMicrosequenceExplanation(intent), /Autoria/u);
});

test("atribuição vazia nova pode avançar o curso sem fingir outra versão do texto", async () => {
  const f = fixture();
  f.state.unchangedEntity = true;
  const result = await f.controller.saveMicrosequenceExplanation({ ...intent, explanation: entity.content.explanation });
  assert.equal(result.changed, true);
  assert.equal(result.revision, 8);
  assert.equal(result.microsequenceVersion, 3);
});

test("adapter manual da Explicação recusa canal externo e alvos misturados antes do RPC", async () => {
  const f = fixture();
  const request = { principal, courseId, requestId: intent.requestId, expectedRevision: 7,
    expectedMicrosequenceVersion: 3, applicationOrigin: "manual",
    upserts: [{ entityType: "microsequence", entityId: "ms-a", parentType: "lesson", parentId: "l-a", position: 0, content: entity.content }],
    deletes: [], sourceAttributionApplications: [{ targetKind: "microsequence_explanation", targetId: "ms-a", sourceLinks: [] }] };
  for (const patch of [{ expectedStudyUnitVersion: 3 }, { applicationOrigin: "provider_assistance" },
    { upserts: [{ ...request.upserts[0], entityType: "study_unit" }] }, { deletes: [{ entityType: "study_unit", entityId: "u" }] },
    { principal: { ...principal, authenticationKind: "oauth" } }]) {
    await assert.rejects(f.adapter.commitCourseComposition({ ...request, ...patch }));
  }
  assert.equal(f.rpcCalls.length, 0);
});

test("revisão humana usa leitura corrente por objeto e não repete decisão incerta", async () => {
  const f = fixture();
  let attempts = 0;
  const basisHash = "a".repeat(64);
  f.api.getContentReview = async () => ({ contract: "aralearn.course-content-review.v1", courseId, targetKind: "microsequence_explanation",
    targetId: "ms-a", courseRevision: 7, entityVersion: 3, reviewPolicy: "saved", basisHash, contentReview: { state: "draft" } });
  f.api.setContentReview = async () => { attempts++; throw new TypeError("Failed to fetch"); };
  assert.equal((await f.controller.getContentReview(courseId, "microsequence_explanation", "ms-a")).basisHash, basisHash);
  await assert.rejects(f.controller.setContentReview({ courseId, targetKind: "microsequence_explanation", targetId: "ms-a", reviewed: true, expectedBasisHash: basisHash,
    requestId: "review-explanation-0001" }), /fetch/u);
  assert.equal(attempts, 1);
  await assert.rejects(new CourseController({ api: f.api, store: f.store }).getContentReview(courseId, "microsequence_explanation", "ms-a"), /Autoria/u);
});
