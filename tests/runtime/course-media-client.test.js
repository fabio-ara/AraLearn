import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { CourseApiClient } from "../../src/supabase/CourseApiClient.js";
import { CourseController } from "../../src/supabase/CourseController.js";
import { CourseStudyRepository } from "../../src/study/CourseStudyRepository.js";
import { createDefaultCourseAudioConfig } from "../../src/domain/courseMedia.js";
import { createSyntheticWave } from "../fixtures/package/course-audio.js";

const id = "30300000-0000-4000-8000-000000000001";
const bytes = createSyntheticWave();
const file = new File([bytes], "saudação.wav", { type: "audio/wav" });
const media = { contentHash: createHash("sha256").update(bytes).digest("hex"), byteSize: bytes.length, mediaType: "audio/wav" };
const request = { courseId: id, expectedCourseRevision: 1, requestId: "audio-request-303" };
const read = (mode = "configuration") => ({ contract: "aralearn.course-media.v1", courseId: id, courseRevision: 1,
  mode, audioConfig: createDefaultCourseAudioConfig(), storage: mode === "catalog" ? { uniqueBytes: bytes.length, maxUniqueBytes: 67108864 } : null,
  items: mode === "catalog" ? [{ ...media, fileName: file.name }] : [], nextCursor: null });
const receipt = (operation = "ingest_audio") => ({ contract: operation === "ingest_audio" ? "aralearn.course-media-ingestion.v1" : "aralearn.course-media-change.v1",
  courseId: id, courseRevision: 2, requestId: request.requestId, changed: true, idempotent: false, operation,
  media: operation === "set_audio_config" ? null : media, fileName: operation === "set_audio_config" ? null : file.name });
function client(fetchImpl, visitor = false) {
  return new CourseApiClient({ projectUrl: "https://example.test", publishableKey: "synthetic-public-key", visitor, fetchImpl,
    authClient: { getAccessToken: async () => "synthetic-user-token", clearSession: async () => {} } });
}
const response = data => new Response(JSON.stringify({ data }), { headers: { "Content-Type": "application/json" } });

test("visitante lê só configuração e arquivo focal, sem catálogo privado ou escrita", async () => {
  const calls = [];
  const api = client(async (url, init) => { calls.push({ url, init }); return response(read()); }, true);
  assert.deepEqual((await api.loadCourseMedia(id, { expectedRevision: 1, mode: "configuration" })).audioConfig, createDefaultCourseAudioConfig());
  assert.equal(calls[0].init.headers.has("authorization"), false);
  await assert.rejects(api.loadCourseMedia(id, { expectedRevision: 1, mode: "catalog" }), { status: 401 });
  await assert.rejects(api.uploadCourseAudio({ ...request, file }), { status: 401 });
  await assert.rejects(api.mutateCourseMedia({ ...request, command: { type: "set_audio_config", config: createDefaultCourseAudioConfig() } }), { status: 401 });
  assert.equal(calls.length, 1);
});

test("upload conserva multipart, nome humano e trio binário; recibo alheio é recusado", async () => {
  let calls = 0; let corrupt = false;
  const api = client(async (url, init) => {
    ++calls;
    assert.equal(new URL(url).pathname, "/functions/v1/aralearn-course-api/app/ingerirAudio");
    assert.ok(init.body instanceof FormData);
    assert.deepEqual([...init.body.keys()], ["requestId", "courseId", "expectedRevision", "file"]);
    assert.equal(init.body.get("file").name, file.name);
    assert.equal(init.body.get("expectedRevision"), "1");
    return response(corrupt ? { ...receipt(), media: { ...media, contentHash: "f".repeat(64) } } : receipt());
  });
  assert.deepEqual((await api.uploadCourseAudio({ ...request, file })).media, media);
  corrupt = true;
  await assert.rejects(api.uploadCourseAudio({ ...request, file }), /não corresponde/u);
  const before = calls;
  await assert.rejects(api.uploadCourseAudio({ ...request, file: new File(["fake"], "fake.wav", { type: "audio/wav" }) }));
  assert.equal(calls, before);
});

test("configuração usa CAS e recibo ligados à operação, sem aceitar segredo no curso", async () => {
  let seen;
  const api = client(async (url, init) => { seen = { url, body: JSON.parse(init.body) }; return response(receipt("set_audio_config")); });
  const command = { type: "set_audio_config", config: createDefaultCourseAudioConfig() };
  await api.mutateCourseMedia({ ...request, command });
  assert.deepEqual(seen.body, { requestId: request.requestId, expectedRevision: 1, command });
  assert.equal(new URL(seen.url).pathname, `/functions/v1/aralearn-course-api/v1/courses/${id}/media/changes`);
  await assert.rejects(api.mutateCourseMedia({ ...request, command: { ...command, config: { ...command.config, apiKey: "never-store" } } }));
});

test("controller exige autoria e invalida derivados após confirmação sem apagar fila pessoal", async () => {
  const deleted = [];
  const store = { getCache: async () => null, putCache: async () => {}, deleteCachePrefix: async key => deleted.push(key) };
  const api = { listCourses: async () => [], getCourse: async () => ({}), uploadCourseAudio: async () => receipt() };
  const reader = new CourseController({ api, store });
  await assert.rejects(reader.uploadCourseAudio({ ...request, file }), /Autoria/u);
  assert.equal(deleted.length, 0);
  const owner = new CourseController({ api, store, ownerOnly: true });
  await owner.uploadCourseAudio({ ...request, file });
  assert.ok(deleted.includes(`course.v1.audio-configuration:${id}`));
  assert.ok(deleted.every(key => !/personal|outbox/u.test(key)));
});

test("configuração offline exige a mesma revisão e é purgada ao perder acesso", async () => {
  const values = new Map(); let failure = null;
  const cache = { getCache: async key => values.get(key), putCache: async (key, value) => values.set(key, value),
    updateCache: async (key, mutate) => { const value = mutate(values.get(key)); values.set(key, value); return value; } };
  const bridge = { listAccessibleCourses: async () => [], loadCourse: async () => ({}), clearCourse: async () => {},
    loadCourseMedia: async () => { if (failure) throw failure; return read(); } };
  const repository = new CourseStudyRepository({ bridge, api: {}, cache, visitor: true, windowValue: null });
  repository.loadedCourseById.set(id, { revision: 1 });
  const reference = { courseId: id, studyUnitId: "unit-1" };
  await repository.loadStudyAudioConfiguration(reference);
  failure = Object.assign(new Error("Sem rede"), { status: 0 });
  assert.deepEqual(await repository.loadStudyAudioConfiguration(reference), createDefaultCourseAudioConfig());
  repository.loadedCourseById.set(id, { revision: 2 });
  await assert.rejects(repository.loadStudyAudioConfiguration(reference), /Sem rede/u);
  repository.loadedCourseById.set(id, { revision: 1 });
  failure = Object.assign(new Error("Revogado"), { status: 403 });
  await assert.rejects(repository.loadStudyAudioConfiguration(reference), /Revogado/u);
  assert.equal(values.get(`course.v1.audio-configuration:${id}`), null);
  assert.equal(repository.loadedCourseById.has(id), false);
});

test("resposta tardia não repõe configuração depois que o curso saiu da réplica", async () => {
  const values = new Map(); let complete;
  const bridge = { listAccessibleCourses: async () => [], loadCourse: async () => ({}),
    loadCourseMedia: () => new Promise(resolve => { complete = resolve; }) };
  const cache = { getCache: async key => values.get(key), putCache: async (key, value) => values.set(key, value) };
  const repository = new CourseStudyRepository({ bridge, api: {}, cache, visitor: true, windowValue: null });
  repository.loadedCourseById.set(id, { revision: 1 });
  const pending = repository.loadStudyAudioConfiguration({ courseId: id, studyUnitId: "unit-1" });
  repository.loadedCourseById.delete(id);
  complete(read());
  await assert.rejects(pending);
  assert.equal(values.size, 0);
});
