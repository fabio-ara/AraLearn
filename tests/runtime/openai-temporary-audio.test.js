import test from "node:test";
import assert from "node:assert/strict";
import { resolveOpenAiTemporaryAudio } from "../../supabase/functions/_shared/aralearn-authoring/openAiTemporaryAudio.js";
import { COURSE_MEDIA_MAX_BYTES } from "../../src/domain/courseMedia.js";

function wave() {
  const bytes = new Uint8Array(524);
  const view = new DataView(bytes.buffer);
  for (const [offset, text] of [[0, "RIFF"], [8, "WAVE"], [12, "fmt "], [36, "data"]]) bytes.set(new TextEncoder().encode(text), offset);
  for (const [offset, value] of [[4, 516], [16, 16], [24, 24000], [28, 48000], [40, 480]]) view.setUint32(offset, value, true);
  for (const [offset, value] of [[20, 1], [22, 1], [32, 2], [34, 16]]) view.setUint16(offset, value, true);
  return bytes;
}
function mp3() {
  const bytes = new Uint8Array(417 * 3);
  for (const offset of [0, 417, 834]) bytes.set([255, 251, 144, 0], offset);
  return bytes;
}
const descriptor = (overrides = {}) => ({ file_id: "file-synthetic", file_name: "som.wav", mime_type: "audio/wav",
  download_url: "https://files.oaiusercontent.com/som?sig=private-fixture", ...overrides });
const options = (overrides = {}) => ({ descriptor: descriptor(), deadlineAt: Date.now() + 1000,
  fetchImpl: async () => new Response(wave(), { headers: { "content-type": "audio/wav" } }), ...overrides });

test("áudio temporário verifica WAV/MP3 reais sem confiar na extensão ou no MIME", async () => {
  for (const [bytes, mediaType, fileName] of [[wave(), "audio/wav", "som.wav"], [mp3(), "audio/mpeg", "som.mp3"]]) {
    let called = 0;
    const result = await resolveOpenAiTemporaryAudio(options({ descriptor: descriptor({ mime_type: mediaType, file_name: fileName }),
      fetchImpl: async (url, init) => {
        called++;
        assert.equal(url, descriptor().download_url);
        assert.equal(init.redirect, "error"); assert.equal(init.credentials, "omit");
        assert.equal(Object.keys(init.headers).join(), "accept");
        return new Response(bytes, { headers: { "content-type": "application/octet-stream" } });
      } }));
    assert.equal(called, 1); assert.equal(result.mediaType, mediaType); assert.equal(result.fileName, fileName);
    assert.deepEqual(result.bytes, bytes);
    assert.doesNotMatch(JSON.stringify(result), /private-fixture|oaiusercontent|file-synthetic/u);
  }
});

test("áudio rejeita MIME divergente, PDF/HTML disfarçado e caminho no nome", async () => {
  for (const override of [
    { descriptor: descriptor({ mime_type: "application/pdf" }) },
    { descriptor: descriptor({ mime_type: "audio/mpeg" }) },
    { descriptor: descriptor({ file_name: "../som.wav" }) },
    { fetchImpl: async () => new Response(wave(), { headers: { "content-type": "audio/mpeg" } }) },
    { fetchImpl: async () => new Response("%PDF-1.7 falso", { headers: { "content-type": "audio/wav" } }) },
    { fetchImpl: async () => new Response("<script>bad()</script>", { headers: { "content-type": "audio/wav" } }) }
  ]) {
    await assert.rejects(() => resolveOpenAiTemporaryAudio(options(override)), error => [415, 422].includes(error.status));
  }
});

test("áudio não inventa transporte MCP, não segue redirects nem aceita origem arbitrária", async () => {
  for (const input of ["C:/som.wav", { file_id: "file-only" }, { ...descriptor(), path: "C:/som.wav" },
    descriptor({ download_url: "http://files.oaiusercontent.com/som" }),
    descriptor({ download_url: "https://files.oaiusercontent.com.example.test/som" }),
    descriptor({ download_url: "https://127.0.0.1/som" }),
    descriptor({ download_url: "https://files.oaiusercontent.com:8443/som" }),
    descriptor({ download_url: "https://user:password@files.oaiusercontent.com/som" })]) {
    await assert.rejects(() => resolveOpenAiTemporaryAudio(options({ descriptor: input,
      fetchImpl: () => assert.fail("Não deveria acessar rede") })), error => error.code === "invalid_openai_file");
  }
  await assert.rejects(() => resolveOpenAiTemporaryAudio(options({ fetchImpl: async () => new Response(null,
    { status: 302, headers: { location: "https://127.0.0.1/" } }) })), error => error.code === "openai_file_unavailable");
});

test("áudio limita cabeçalho e stream a20MiB e distingue expiração/deadline", async () => {
  for (const fetchImpl of [
    async () => new Response(null, { headers: { "content-length": String(COURSE_MEDIA_MAX_BYTES + 1) } }),
    async () => new Response(new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(COURSE_MEDIA_MAX_BYTES)); controller.enqueue(new Uint8Array(1)); controller.close(); } }))
  ]) await assert.rejects(() => resolveOpenAiTemporaryAudio(options({ fetchImpl })), error => error.code === "audio_too_large");
  await assert.rejects(() => resolveOpenAiTemporaryAudio(options({ fetchImpl: async () => new Response(null, { status: 403 }) })), error => error.code === "openai_file_expired");
  await assert.rejects(() => resolveOpenAiTemporaryAudio(options({ deadlineAt: Date.now() + 15,
    fetchImpl: () => new Promise(() => {}) })), error => error.code === "openai_file_timeout");
});
