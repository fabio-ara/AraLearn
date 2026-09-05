import test from "node:test";
import assert from "node:assert/strict";
import { CourseApiClient } from "../../src/supabase/CourseApiClient.js";
import { CourseController } from "../../src/supabase/CourseController.js";
import { executeCourseRoute } from "../../supabase/functions/_shared/aralearn-authoring/courseRouter.js";
import { routeCourseRequest } from "../../supabase/functions/_shared/aralearn-authoring/courseProtocol.js";
import { CourseSupabaseAdapter } from "../../supabase/functions/_shared/aralearn-authoring/courseSupabaseAdapter.js";

const COURSE = "10000000-0000-4000-8000-000000000001";
const PERSON = "20000000-0000-4000-8000-000000000002";
const REQUEST = "metadata-request-0001";
const metadata = { title: "Curso corrigido", objective: "Objetivo completo." };
const principal = { actorId: PERSON, authenticationKind: "application", scopes: ["authoring:write"] };
const store = () => ({ getCache: async () => null, putCache: async () => {}, deleteCachePrefix: async () => {} });

test("identidade sem entidades percorre Client, Router e Adapter em uma única composição", async () => {
  const calls = [];
  const adapter = new CourseSupabaseAdapter({ supabaseUrl: "https://project.supabase.co", serverApiKey: "test-server", publishableKey: "sb_publishable_test", publicAppUrl: "https://app.example" });
  adapter.rpc = async (name, body) => {
    calls.push({ name, body });
    return { courseId: COURSE, revision: 5, updatedCount: 0, createdCount: 0, deletedCount: 0 };
  };
  const client = new CourseApiClient({ projectUrl: "https://project.supabase.co", publishableKey: "sb_publishable_test",
    authClient: { getAccessToken: async () => "session" }, fetchImpl: async (url, init) => {
      const path = new URL(url).pathname.split("aralearn-course-api")[1];
      const result = await executeCourseRoute({ request: new Request(url, init),
        route: routeCourseRequest(init.method, path), principal, adapter });
      return new Response(JSON.stringify({ ok: true, ...result }), { headers: { "content-type": "application/json" } });
    } });
  const controller = new CourseController({ ownerOnly: true, store: store(), api: client });
  const result = await controller.commitCourseStructuralComposition({ requestId: REQUEST, courseId: COURSE,
    expectedCourseRevision: 4, upserts: [], deletes: [], courseMetadata: metadata });
  assert.equal(result.courseRevision, 5);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].name, "commit_course_composition_for_actor_v1");
  assert.deepEqual(calls[0].body.p_course_metadata, metadata);
  assert.equal(calls[0].body.p_expected_revision, 4);
  assert.equal(calls[0].body.p_request_id, REQUEST);
  assert.equal(calls[0].body.p_actor_id, PERSON);
  assert.deepEqual(calls[0].body.p_source_attribution_applications, []);
});

test("metadados rejeitam campos extras e não desviam uma edição focal", async () => {
  const path = `/v1/courses/${COURSE}/composition`;
  const base = { requestId: REQUEST, expectedRevision: 4, upserts: [], deletes: [], sourceAttributionApplications: [], courseMetadata: metadata };
  for (const body of [{ ...base, courseMetadata: { ...metadata, ownerId: PERSON } },
    { ...base, courseMetadata: null }, { ...base, courseMetadata: { ...metadata, title: "" } },
    { ...base, applicationOrigin: "manual", expectedStudyUnitVersion: 2 }]) {
    await assert.rejects(executeCourseRoute({ request: new Request(`https://project.supabase.co${path}`, {
      method: "POST", headers: { "content-type": "application/json", "Idempotency-Key": REQUEST }, body: JSON.stringify(body)
    }), route: routeCourseRequest("POST", path), principal,
    adapter: { commitCourseComposition() { assert.fail("Nenhum comando inválido chega ao banco."); } }
    }), { code: "invalid_course_metadata" });
  }
});

test("resposta perdida preserva proveniência, CAS e metadados sem preflight na revisão antiga", async () => {
  let reads = 0;
  const calls = [];
  const api = { listCourses: async () => ({}), getCourse: async () => ({}),
    async loadCourseSources() {
      reads += 1;
      if (reads > 1) throw Object.assign(new Error("revisão antiga"), { status: 409 });
      return { contract: "aralearn.course-sources.v3", bibliographyStyle: "abnt-2025", courseId: COURSE, courseRevision: 4,
        mode: "target", query: { sourceId: null, targetKind: "study_unit", targetId: "unit-a" },
        pdfStorage: { uniqueBytes: 0, maxUniqueBytes: 64 * 1024 * 1024 }, items: [], nextCursor: null };
    },
    async commitCourseStructuralComposition(command) {
      calls.push(structuredClone(command));
      if (calls.length === 1) throw new Error("offline");
      return { requestId: REQUEST, courseId: COURSE, courseRevision: 5 };
    } };
  const controller = new CourseController({ ownerOnly: true, store: store(), api });
  const intent = { requestId: REQUEST, courseId: COURSE, expectedCourseRevision: 4,
    upserts: [{ entityType: "study_unit", entityId: "unit-a" }], deletes: [], courseMetadata: metadata };
  await assert.rejects(controller.commitCourseStructuralComposition(intent), /offline/u);
  await assert.rejects(controller.commitCourseStructuralComposition({ ...intent,
    courseMetadata: { ...metadata, title: "Outro curso" } }), /outro conteúdo/u);
  const result = await controller.commitCourseStructuralComposition(intent);
  assert.equal(result.courseRevision, 5);
  assert.equal(reads, 1);
  assert.deepEqual(calls[0], calls[1]);
});
