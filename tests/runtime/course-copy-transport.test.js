import test from "node:test";
import assert from "node:assert/strict";
import { createCourseCopyRequestIdentity, normalizeCourseCopyRequest, normalizeCourseCopyResult } from "../../src/domain/courseCopy.js";
import { createCourseApiHandler } from "../../supabase/functions/_shared/aralearn-authoring/courseApiServer.js";
import { CourseSupabaseAdapter } from "../../supabase/functions/_shared/aralearn-authoring/courseSupabaseAdapter.js";

const source = "30600000-0000-4000-8000-000000000101";
const target = "30600000-0000-4000-8000-000000000102";
const actor = "30600000-0000-4000-8000-000000000001";
const principal = { actorId: actor, authenticationKind: "application", scopes: ["authoring:write"] };
const origin = "https://app.example";
const command = { sourceCourseId: source, expectedSourceRevision: 7, title: "Cópia · 林", confirmed: true,
  ...createCourseCopyRequestIdentity({ now: 1788610000000, randomUUID: () => actor }) };
const receipt = { contract: "aralearn.course-copy.v1", sourceCourseId: source, sourceCourseRevision: 7,
  targetCourseId: target, initialCourseRevision: 1, copiedAt: command.requestedAt, requestId: command.requestId, idempotent: false };
const adapter = fetchImpl => new CourseSupabaseAdapter({ supabaseUrl: "https://project.example", publicAppUrl: origin,
  serverApiKey: "sb_secret_fixture", publishableKey: "sb_publishable_fixture", attempts: 1, fetchImpl });

test("identidade de cópia preserva instante e intenção; omissão e alteração falham fechadas", () => {
  assert.deepEqual(normalizeCourseCopyRequest(command), command);
  for (const bad of [{ ...command, requestedAt: "2026-09-05T00:00:00.000Z" },
    { ...command, confirmed: false }, { ...command, requestId: "copy-request-unbound" },
    { ...command, title: "título\nindevido" }, { ...command, actorId: actor },
    { ...command, expectedSourceRevision: Number.MAX_SAFE_INTEGER + 1 }]) {
    assert.throws(() => normalizeCourseCopyRequest(bad));
  }
  for (const key of Object.keys(command)) {
    const bad = { ...command }; delete bad[key]; assert.throws(() => normalizeCourseCopyRequest(bad));
  }
  assert.deepEqual(normalizeCourseCopyResult(receipt, command), receipt);
  for (const bad of [{ ...receipt, targetCourseId: source }, { ...receipt, sourceCourseRevision: 8 },
    { ...receipt, requestId: command.requestId.replace(actor, target) }, { ...receipt, creationHash: "private" }]) {
    assert.throws(() => normalizeCourseCopyResult(bad, command));
  }
});

test("rota de cópia exige sessão e confirma corpo/caminho antes de qualquer efeito", async () => {
  const calls = [];
  const handler = createCourseApiHandler({ allowedOrigins: new Set([origin]), adapter: {
    resolveApplicationPrincipal: async () => principal,
    copyCourse: async input => { calls.push(input); return receipt; }
  } });
  const request = (body, courseId = source, token = true) => new Request(
    `https://project.example/functions/v1/aralearn-course-api/v1/courses/${courseId}/copies`, {
      method: "POST", headers: { Origin: origin, "Content-Type": "application/json", ...(token ? { Authorization: "Bearer fixture" } : {}) },
      body: JSON.stringify(body)
    });
  assert.equal((await handler(request(command))).status, 200);
  assert.equal((await handler(request(command, source, false))).status, 401);
  assert.equal((await handler(request(command, target))).status, 422);
  assert.equal((await handler(request({ ...command, confirmed: false }))).status, 422);
  assert.equal((await handler(request({ ...command, access: "public" }))).status, 422);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].principal.actorId, actor);
  assert.equal(calls[0].requestId, command.requestId);
});

test("Adapter encaminha um writer e rejeita recibo divergente sem vazar estado interno", async () => {
  const calls = [];
  let wrong = false;
  const value = adapter(async (url, init) => {
    calls.push({ url, body: JSON.parse(init.body) });
    return Response.json(wrong ? { ...receipt, targetCourseId: source, secret: "internal" } : receipt);
  });
  assert.deepEqual(await value.copyCourse({ principal, ...command }), receipt);
  assert.ok(calls[0].url.endsWith("/copy_course_for_actor_v1"));
  assert.deepEqual(calls[0].body, { p_actor_id: actor, p_source_course_id: source, p_expected_source_revision: 7,
    p_title: command.title, p_confirmed: true, p_request_id: command.requestId, p_requested_at: command.requestedAt });
  wrong = true;
  await assert.rejects(value.copyCourse({ principal, ...command }), error =>
    error.status === 503 && error.code === "invalid_course_copy_result" && !/secret|internal/u.test(error.message));
  assert.equal(calls.length, 2);
});

test("exclusão final espera claims exatos de PDF e áudio; nenhum prefixo é listado", async () => {
  const calls = [];
  const pdf = `${source}/${"f".repeat(64)}.pdf`;
  const audio = `${source}/${"a".repeat(64)}.wav`;
  let lifecycle = 0, pdfClaim = 0, audioClaim = 0;
  const value = adapter(async (url, init) => {
    const body = JSON.parse(init.body); calls.push({ url, body });
    if (url.endsWith("/maintain_course_for_actor_v1")) return Response.json(++lifecycle === 1 ? {
      contract: "aralearn.course-lifecycle-preparation.v1", courseId: target, operation: "delete_owned_course",
      requestId: "copy-delete-target", status: "files_pending"
    } : { contract: "aralearn.course-lifecycle.v1", courseId: target, operation: "delete_owned_course",
      requestId: "copy-delete-target", status: "completed", changed: true });
    if (url.endsWith("/claim_pending_course_pdf_delete_for_actor_v1")) return Response.json(++pdfClaim === 1 ? { requestId: "original-pdf-claim", storagePath: pdf } : null);
    if (url.endsWith("/claim_course_media_delete_for_actor_v1")) return Response.json(++audioClaim === 1 ? { contentHash: "a".repeat(64), storagePath: audio } : null);
    if (url.endsWith("/complete_course_media_delete_for_actor_v1")) return new Response(null, { status: 204 });
    if (url.includes("/complete_course_source_pdf")) return Response.json(true);
    if (url.endsWith("/object/course-source-pdfs")) { assert.deepEqual(body, { prefixes: [pdf] }); return Response.json({}); }
    if (url.endsWith("/object/course-media")) { assert.deepEqual(body, { prefixes: [audio] }); return Response.json({}); }
    assert.fail(url);
  });
  const result = await value.maintainCourse({ principal, courseId: target, operation: "delete_owned_course", confirmed: true, requestId: "copy-delete-target" });
  assert.equal(result.fileCleanupPending, false);
  assert.equal(lifecycle, 2);
  assert.ok(!calls.some(call => call.url.includes("/object/list/")));
  const pdfComplete = calls.find(call => call.url.includes("/complete_course_source_pdf"));
  assert.equal(pdfComplete.body.p_request_id, "original-pdf-claim");
  assert.equal(pdfComplete.body.p_storage_path, pdf);
});
