import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createCourseApiHandler } from "../../supabase/functions/_shared/aralearn-authoring/courseApiServer.js";
import { CourseSupabaseAdapter } from "../../supabase/functions/_shared/aralearn-authoring/courseSupabaseAdapter.js";
import { createSyntheticWave } from "../fixtures/package/course-audio.js";
import { createDefaultCourseAudioConfig } from "../../src/domain/courseMedia.js";

const courseId = "30300000-0000-4000-8000-000000000001";
const principal = { actorId: courseId, authenticationKind: "application", scopes: ["authoring:write"] };
const origin = "https://app.example";
const bytes = createSyntheticWave({ seconds: 0.01 });
const media = { contentHash: createHash("sha256").update(bytes).digest("hex"), byteSize: bytes.length, mediaType: "audio/wav" };
const requestId = "audio-transport-303";
const input = { principal, courseId, expectedCourseRevision: 1, requestId, bytes, mediaType: "audio/wav", fileName: "sinal.wav" };
const receipt = { contract: "aralearn.course-media-ingestion.v1", courseId, courseRevision: 2, requestId,
  changed: true, idempotent: false, operation: "ingest_audio", media, fileName: "sinal.wav" };
const json = value => new Response(JSON.stringify(value), { headers: { "Content-Type": "application/json" } });
const adapter = fetchImpl => new CourseSupabaseAdapter({ supabaseUrl: "https://project.example", publicAppUrl: origin,
  serverApiKey: "sb_secret_fixture", publishableKey: "sb_publishable_fixture", attempts: 1, fetchImpl });

test("multipart de áudio exige sessão, campos exatos e bytes reais antes do Adapter", async () => {
  let calls = 0;
  const handler = createCourseApiHandler({ allowedOrigins: new Set([origin]), adapter: {
    resolveApplicationPrincipal: async () => principal,
    ingestCourseAudio: async value => { calls++; assert.equal(value.fileName, "sinal.wav"); assert.deepEqual(value.bytes, bytes); return receipt; }
  } });
  const request = (contents = bytes, token = true, extra = false) => {
    const form = new FormData();
    form.set("courseId", courseId); form.set("requestId", requestId); form.set("expectedRevision", "1");
    form.set("file", new Blob([contents], { type: "audio/wav" }), "sinal.wav");
    if (extra) form.set("storagePath", "injetado");
    return new Request("https://project.example/functions/v1/aralearn-course-api/app/ingerirAudio", {
      method: "POST", headers: { Origin: origin, ...(token ? { Authorization: "Bearer fixture" } : {}) }, body: form });
  };
  assert.equal((await handler(request())).status, 200);
  assert.equal((await handler(request(bytes, false))).status, 401);
  assert.equal((await handler(request(bytes, true, true))).status, 422);
  assert.equal((await handler(request(new TextEncoder().encode("<html>áudio falso</html>")))).status, 422);
  assert.equal(calls, 1);
});

test("visitante lê somente configuração/download; catálogo e escrita exigem sessão", async () => {
  const seen = [];
  const handler = createCourseApiHandler({ allowedOrigins: new Set([origin]), adapter: {
    getCourseMedia: async value => { seen.push(value); return { contract: "aralearn.course-media.v1", courseId,
      courseRevision: 1, mode: "configuration", audioConfig: createDefaultCourseAudioConfig(), storage: null, items: [], nextCursor: null }; }
  } });
  const get = query => new Request(`https://project.example/functions/v1/aralearn-course-api/v1/courses/${courseId}/media?${query}`, { headers: { Origin: origin } });
  assert.equal((await handler(get("expectedRevision=1&mode=configuration"))).status, 200);
  assert.equal(seen[0].principal.actorId, null);
  assert.equal((await handler(get("expectedRevision=1&mode=catalog"))).status, 401);
  assert.equal((await handler(get("expectedRevision=1&mode=configuration&actorId=injetado"))).status, 422);
});

test("ingestão verifica bytes do Storage e confirma trio; replay não faz segundo upload", async () => {
  const calls = [];
  let replay = false;
  const value = adapter(async (url, options) => {
    calls.push({ url, options });
    if (url.includes("claim_course_media_delete")) return json(null);
    if (url.includes("prepare_course_audio")) return json(replay ? { receipt: { ...receipt, idempotent: true } } : {
      receipt: null, courseId, courseRevision: 1, requestId, media: { mediaType: media.mediaType, byteSize: media.byteSize, contentHash: media.contentHash },
      storagePath: `${courseId}/${media.contentHash}.wav`, uploadRequired: true });
    if (url.includes("/object/authenticated/")) return new Response(bytes);
    if (url.includes("/storage/v1/object/course-media/")) return json({ Key: "ignored" });
    if (url.includes("execute_course_media")) return json(receipt);
    assert.fail(url);
  });
  assert.deepEqual(await value.ingestCourseAudio(input), receipt);
  replay = true;
  assert.equal((await value.ingestCourseAudio(input)).idempotent, true);
  assert.equal(calls.filter(call => call.url.includes("/object/course-media/")).length, 1);
  assert.equal(calls.filter(call => call.url.includes("/object/authenticated/")).length, 2);
  assert.equal(calls.find(call => call.url.includes("/object/course-media/")).options.headers["x-upsert"], "false");
  assert.equal(calls.find(call => call.url.includes("/object/course-media/")).options.redirect, "error");
});

test("falha de envio de áudio mantém erro próprio e nunca confunde o arquivo com PDF", async () => {
  const value = adapter(async url => {
    if (url.includes("claim_course_media_delete")) return json(null);
    if (url.includes("prepare_course_audio")) return json({ receipt: null, courseId, courseRevision: 1, requestId, media,
      storagePath: `${courseId}/${media.contentHash}.wav`, uploadRequired: true });
    return new Response("denied", { status: 403 });
  });
  await assert.rejects(value.ingestCourseAudio(input), error => error.code === "course_media_unavailable" && !error.message.includes("PDF"));
});

test("bytes divergentes e recibo incompatível falham sem confirmar gravação", async () => {
  let finalized = 0;
  const value = adapter(async url => {
    if (url.includes("claim_course_media_delete")) return json(null);
    if (url.includes("prepare_course_audio")) return json({ receipt: null, courseId, courseRevision: 1, requestId, media,
      storagePath: `${courseId}/${media.contentHash}.wav`, uploadRequired: false });
    if (url.includes("/object/authenticated/")) { const changed = bytes.slice(); changed[44] ^= 1; return new Response(changed); }
    if (url.includes("execute_course_media")) finalized++;
    assert.fail(url);
  });
  await assert.rejects(value.ingestCourseAudio(input), error => error.code === "course_media_unavailable");
  assert.equal(finalized, 0);
  const wrongReceipt = adapter(async url => url.includes("claim_course_media_delete") ? json(null) : json({ receipt: { ...receipt, requestId: "another-request-303" } }));
  await assert.rejects(wrongReceipt.ingestCourseAudio(input), error => error.code === "course_media_write_uncertain");
});

test("download assina apenas a identidade autorizada e remove path interno do DTO", async () => {
  let signed = 0;
  let wrong = false;
  const path = `${courseId}/${media.contentHash}.wav`;
  const value = adapter(async url => {
    if (url.includes("get_course_media_download")) return json({ contract: "aralearn.course-media-download-internal.v1",
      courseId, courseRevision: 1, studyUnitId: "unit-audio", media, storagePath: wrong ? path.replace(courseId, principal.actorId.replace("303", "304")) : path });
    if (url.includes("/object/sign/")) { signed++; return json({ signedURL: `/object/sign/course-media/${path}?token=fixture` }); }
    assert.fail(url);
  });
  const request = { principal, courseId, expectedRevision: 1, studyUnitId: "unit-audio", contentHash: media.contentHash };
  const result = await value.getCourseMediaDownload(request);
  assert.equal(result.media.contentHash, media.contentHash);
  assert.equal(Object.hasOwn(result, "storagePath"), false);
  wrong = true;
  await assert.rejects(value.getCourseMediaDownload(request), error => error.code === "course_media_unavailable");
  assert.equal(signed, 1);
});
