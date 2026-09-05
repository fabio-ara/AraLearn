import assert from "node:assert/strict";
import test from "node:test";
import { CourseApiClient } from "../../src/supabase/CourseApiClient.js";
import { CourseController } from "../../src/supabase/CourseController.js";
import { CourseSupabaseAdapter } from "../../supabase/functions/_shared/aralearn-authoring/courseSupabaseAdapter.js";
import { executeCourseRoute } from "../../supabase/functions/_shared/aralearn-authoring/courseRouter.js";
import { routeCourseRequest } from "../../supabase/functions/_shared/aralearn-authoring/courseProtocol.js";

const COURSE_ID = "10000000-0000-4000-8000-000000000001";
const ACTOR_ID = "20000000-0000-4000-8000-000000000002";
const principal = { actorId: ACTOR_ID, scopes: ["authoring:write"] };
const invalidEntries = [
  { entry: "latest_created" }, { entry: " latest_updated" }, { entry: "" }, { entry: {} },
  { entry: "latest_updated", anchorStudyUnitId: "unit-a" },
  { entry: "latest_updated", cursor: { studyUnitId: "unit-a" } },
  { entry: "latest_updated", direction: "backward" }
];
const json = (data) => new Response(JSON.stringify(data), { headers: { "Content-Type": "application/json" } });
function page({ revision = 7, scope = { kind: "course", id: null }, pageBytes = 32 } = {}) {
  return {
    contract: "aralearn.course-study-unit-inspection-page.v2", courseId: COURSE_ID,
    courseRevision: revision, scope, totalCount: 0,
    scopeOptions: { authoringParts: [], unassignedStudyUnitCount: 0 },
    items: [], hasPrevious: false, hasMore: false, previousCursor: null, nextCursor: null, pageBytes
  };
}
function store() {
  const values = new Map();
  return {
    values,
    async getCache(key) { return values.get(key) ?? null; },
    async putCache(key, value) { if (value == null) values.delete(key); else values.set(key, structuredClone(value)); },
    async deleteCachePrefix(prefix) { for (const key of values.keys()) if (key.startsWith(prefix)) values.delete(key); }
  };
}
function offline() { return Object.assign(new Error("offline"), { status: 0, code: "network_error" }); }

test("latest_updated: Client mantém GET/revisão/escopo e recusa paginação incompatível antes da rede", async () => {
  const calls = [];
  const client = new CourseApiClient({
    projectUrl: "https://project.invalid", publishableKey: "sb_publishable_test",
    authClient: { getSession: () => ({ user: { id: ACTOR_ID } }), getAccessToken: async () => "test-session" },
    fetchImpl: async (url, init) => { calls.push({ url: new URL(url), init }); return json({ ok: true, data: page() }); }
  });
  await client.loadAuthoringStudyUnits(COURSE_ID, { expectedRevision: 7, scope: { kind: "module", id: "module-a" },
    entry: "latest_updated", cursor: null, anchorStudyUnitId: null });
  assert.equal(calls[0].init.method, "GET");
  assert.equal(calls[0].url.searchParams.get("entry"), "latest_updated");
  assert.equal(calls[0].url.searchParams.get("expectedRevision"), "7");
  assert.equal(calls[0].url.searchParams.get("scopeId"), "module-a");
  assert.equal(calls[0].url.searchParams.get("direction"), "forward");
  assert.equal(calls[0].url.searchParams.has("anchorStudyUnitId"), false);
  for (const options of invalidEntries) {
    assert.throws(() => client.loadAuthoringStudyUnits(COURSE_ID, { expectedRevision: 7, ...options }), /Paginação/u);
  }
  assert.equal(calls.length, 1);
  await client.loadAuthoringStudyUnits(COURSE_ID, { expectedRevision: 7 });
  assert.equal(calls[1].url.searchParams.has("entry"), false);
});

test("latest_updated: Router valida exclusividade, direção, repetição e principal no reader v2 existente", async () => {
  const calls = [];
  const adapter = { async listCourseStudyUnits(value) { calls.push(value); return page(); } };
  function execute(query, actor = principal) {
    const request = new Request(`https://app.invalid/v2/courses/${COURSE_ID}/study-units?expectedRevision=7&${query}`);
    return executeCourseRoute({ request, route: routeCourseRequest("GET", new URL(request.url).pathname), adapter, principal: actor });
  }
  const result = await execute("entry=latest_updated&scopeKind=lesson&scopeId=lesson-a");
  assert.equal(result.data.contract, "aralearn.course-study-unit-inspection-page.v2");
  assert.equal(calls[0].entry, "latest_updated");
  assert.equal(calls[0].scopeKind, "lesson");
  assert.equal(calls[0].expectedRevision, 7);
  for (const query of [
    "entry=latest_created", "entry=", "entry=latest_updated&anchorStudyUnitId=unit-a",
    "entry=latest_updated&cursorStudyUnitId=unit-a", "entry=latest_updated&direction=backward",
    "entry=latest_updated&entry=latest_updated"
  ]) await assert.rejects(() => execute(query), (error) => error.code === "invalid_pagination");
  await assert.rejects(() => execute("entry=latest_updated", null), (error) => error.status === 401);
  assert.equal(calls.length, 1);
});

test("latest_updated: Adapter usa p_entry opcional, conserva DTO e valida chamada direta antes do RPC", async () => {
  const calls = [];
  const adapter = new CourseSupabaseAdapter({
    supabaseUrl: "https://project.invalid", serverApiKey: "sb_secret_test", publishableKey: "sb_publishable_test",
    publicAppUrl: "https://app.invalid/", attempts: 1,
    fetchImpl: async (url, init) => { calls.push({ url, body: JSON.parse(init.body) }); return json(page()); }
  });
  const base = { principal, courseId: COURSE_ID, expectedRevision: 7, scopeKind: "course" };
  const result = await adapter.listCourseStudyUnits({ ...base, entry: "latest_updated" });
  assert.ok(String(calls[0].url).endsWith("/rpc/list_owned_course_study_units_for_actor_v2"));
  assert.equal(calls[0].body.p_entry, "latest_updated");
  assert.equal(calls[0].body.p_actor_id, ACTOR_ID);
  assert.equal(calls[0].body.p_expected_revision, 7);
  assert.equal(result.contract, "aralearn.course-study-unit-inspection-page.v2");
  assert.deepEqual(result.items, []);
  for (const { cursor, ...options } of invalidEntries) {
    await assert.rejects(() => adapter.listCourseStudyUnits({ ...base, ...options,
      ...(cursor ? { cursorStudyUnitId: cursor.studyUnitId } : {}) }), (error) => error.code === "invalid_pagination");
  }
  assert.equal(calls.length, 1);
  await adapter.listCourseStudyUnits(base);
  assert.equal(Object.hasOwn(calls[1].body, "p_entry"), false);
});

test("latest_updated: Controller mantém cache próprio da consulta e não transforma início curricular em recente offline", async () => {
  const cache = store();
  let online = true;
  let forbidden = false;
  let responseRevision = 7;
  const calls = [];
  const controller = new CourseController({ store: cache, ownerOnly: true, api: {
    async listCourses() { throw new Error("Não usado neste read focal."); },
    async getCourse() { throw new Error("Não usado neste read focal."); },
    async loadAuthoringStudyUnits(courseId, options) {
      calls.push({ courseId, options });
      if (forbidden) throw Object.assign(new Error("Acesso recusado."), { status: 403, code: "course_forbidden" });
      if (!online) throw offline();
      return page({ revision: responseRevision, pageBytes: options.entry ? 64 : 32 });
    }
  } });
  await controller.loadAuthoringStudyUnits(COURSE_ID, { expectedRevision: 7 });
  online = false;
  await assert.rejects(() => controller.loadAuthoringStudyUnits(COURSE_ID, { expectedRevision: 7, entry: "latest_updated" }), /offline/u);
  online = true;
  await controller.loadAuthoringStudyUnits(COURSE_ID, { expectedRevision: 7, entry: "latest_updated" });
  online = false;
  const cached = await controller.loadAuthoringStudyUnits(COURSE_ID, { expectedRevision: 7, entry: "latest_updated" });
  assert.equal(cached.offline, true);
  assert.equal(cached.pageBytes, 64);
  assert.equal((await controller.loadAuthoringStudyUnits(COURSE_ID, { expectedRevision: 7 })).pageBytes, 32);
  const before = calls.length;
  for (const options of invalidEntries) {
    await assert.rejects(() => controller.loadAuthoringStudyUnits(COURSE_ID, { expectedRevision: 7, ...options }), /Paginação/u);
  }
  assert.equal(calls.length, before);
  forbidden = true;
  await assert.rejects(() => controller.loadAuthoringStudyUnits(COURSE_ID, { expectedRevision: 7, entry: "latest_updated" }), (error) => error.status === 403);
  forbidden = false; online = true; responseRevision = 8;
  await assert.rejects(() => controller.loadAuthoringStudyUnits(COURSE_ID, { expectedRevision: 7, entry: "latest_updated" }), /não corresponde ao pedido/u);
});
