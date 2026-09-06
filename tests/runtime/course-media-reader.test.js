import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { readCourseMediaBlob } from "../../src/supabase/readCourseMediaBlob.js";
import { wrapGeminiPcmAsWav } from "../../src/generation/providers/geminiSpeechProvider.js";
import { calculatorPackage } from "../../src/resources/packages/calculator/index.js";
import { createPackageRegistry } from "../../src/resources/kernel/packageRegistry.js";
import { renderStudyToolActions } from "../../src/study/studyTools.js";

const bytes = wrapGeminiPcmAsWav(new Uint8Array(96));
const media = { contentHash: createHash("sha256").update(bytes).digest("hex"), byteSize: bytes.byteLength, mediaType: "audio/wav" };
const id = "30300000-0000-4000-8000-000000000001";
function download() {
  return { contract: "aralearn.course-media-download.v1", courseId: id, courseRevision: 1,
    studyUnitId: "unit-1", media: { ...media }, signedUrl: `https://example.test/storage/v1/object/sign/course-media/${id}/${media.contentHash}.wav?token=synthetic`,
    expiresAt: new Date(Date.now() + 300000).toISOString() };
}

test("player recebe somente bytes autorizados íntegros, sem cookies, cache ou redirecionamento", async () => {
  let received;
  const result = await readCourseMediaBlob(download(), media, { projectUrl: "https://example.test",
    fetchImpl: async (url, options) => { received = { url, options }; return new Response(bytes); } });
  assert.equal(result.blob.type, "audio/wav");
  assert.deepEqual(new Uint8Array(await result.blob.arrayBuffer()), bytes);
  assert.equal(received.options.credentials, "omit");
  assert.equal(received.options.redirect, "error");
  assert.equal(received.options.cache, "no-store");
  assert.ok(received.options.signal instanceof AbortSignal);
});

test("origem, identidade, truncamento, tamanho e integridade impedem reprodução indevida", async () => {
  let calls = 0;
  const options = { projectUrl: "https://example.test", fetchImpl: async () => { calls++; return new Response(bytes); } };
  await assert.rejects(readCourseMediaBlob(download(), { ...media, contentHash: "a".repeat(64) }, options), /não corresponde/u);
  await assert.rejects(readCourseMediaBlob({ ...download(), signedUrl: download().signedUrl.replace("example.test", "foreign.test") }, media, options), /URL/u);
  assert.equal(calls, 0);
  await assert.rejects(readCourseMediaBlob(download(), media, { fetchImpl: async () => new Response(bytes.slice(0, -1)) }), /incompleto/u);
  await assert.rejects(readCourseMediaBlob(download(), media, { fetchImpl: async () => new Response(new Uint8Array(bytes.length + 1)) }), /excede/u);
  const changed = bytes.slice(); changed[changed.length - 1] = 1;
  await assert.rejects(readCourseMediaBlob(download(), media, { fetchImpl: async () => new Response(changed) }), /integridade/u);
  await assert.rejects(readCourseMediaBlob(download(), media, { fetchImpl: async () => new Response("", { status: 403 }) }), /expirou ou foi retirado/u);
});

test("cancelamento chega à leitura e CSP permite somente mídia própria ou Blob", async () => {
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(readCourseMediaBlob(download(), media, { signal: controller.signal,
    fetchImpl: async (_url, { signal }) => { signal.throwIfAborted(); } }), { name: "AbortError" });
  const source = readFileSync(new URL("../../public/index.html", import.meta.url), "utf8");
  assert.match(source, /media-src 'self' blob:;/u);
  assert.doesNotMatch(source, /media-src[^;]*(?:https:|\*)/u);
});

test("outra ferramenta compatível entra só por definição registrada, com texto escapado", () => {
  const definition = { ...calculatorPackage, manifest: { ...calculatorPackage.manifest,
    id: "aralearn.resource.local_extension", tool: { label: "Consulta <segura>", icon: "calculator" } } };
  const registry = createPackageRegistry([definition]);
  const instance = { id: "extension-1", package: definition.manifest.id, version: "1.0.0", data: calculatorPackage.authoringContract.example };
  const unit = { content: [instance] };
  assert.equal(registry.validateInstance(instance, "content").valid, true);
  assert.equal(registry.listStudyTools(unit).length, 1);
  const html = renderStudyToolActions(unit, registry);
  assert.match(html, /data-study-tool-id="extension-1"/u);
  assert.match(html, /Consulta &lt;segura&gt;/u);
  assert.doesNotMatch(html, /<segura>/u);
});
