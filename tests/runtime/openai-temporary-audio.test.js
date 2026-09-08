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

test("erro MIME distingue descritor de resposta sem alterar código ou aceitar o tipo recusado", async () => {
  let downloads = 0;
  const fetchImpl = async () => {
    downloads++;
    return new Response(wave(), { headers: { "content-type": "audio/ogg; token=private-header" } });
  };
  await assert.rejects(() => resolveOpenAiTemporaryAudio(options({
    descriptor: descriptor({ mime_type: "audio/ogg" }), fetchImpl
  })), error => {
    assert.equal(error.status, 415);
    assert.equal(error.code, "unsupported_audio_media_type");
    assert.match(error.message, /no descritor do anexo foi recusado: audio\/ogg/u);
    return true;
  });
  assert.equal(downloads, 0);
  await assert.rejects(() => resolveOpenAiTemporaryAudio(options({ fetchImpl })), error => {
    assert.equal(error.status, 415);
    assert.equal(error.code, "unsupported_audio_media_type");
    assert.match(error.message, /na resposta do download foi recusado: audio\/ogg/u);
    assert.doesNotMatch(error.message, /private-header|token=|oaiusercontent|private-fixture/u);
    return true;
  });
  assert.equal(downloads, 1);
});

test("diagnóstico MIME não reflete URLs, parâmetros, controles, objetos ou valores excessivos", async () => {
  for (const mimeType of [null, 42, { token: "private-value" }, "https://files.example/private-value",
    "audio/x-wav; token=private-value", "audio/x-wav\nprivate-value", "\naudio/x-wav",
    `audio/${"x".repeat(100)}private-value`]) {
    await assert.rejects(() => resolveOpenAiTemporaryAudio(options({
      descriptor: descriptor({ mime_type: mimeType }),
      fetchImpl: () => assert.fail("Descritor inválido não pode iniciar download")
    })), error => {
      assert.equal(error.status, 415);
      assert.equal(error.code, "unsupported_audio_media_type");
      assert.equal(error.message,
        "O tipo de mídia no descritor do anexo foi recusado: valor inválido. Use áudio WAV PCM ou MP3.");
      return true;
    });
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


test("rótulo audio/x-wav representa somente WAV PCM e retorna MIME canônico", async () => {
  for (const [declared, received] of [["audio/wav", "audio/x-wav"], ["audio/wav", "audio/wav"]]) {
    const result = await resolveOpenAiTemporaryAudio(options({ descriptor: descriptor({ mime_type: declared }),
      fetchImpl: async () => new Response(wave(), { headers: { "content-type": `${received}; private=value` } }) }));
    assert.equal(result.mediaType, "audio/wav");
    assert.equal(result.fileName, "som.wav");
    assert.deepEqual(result.bytes, wave());
  }
});

test("rótulo WAV não autoriza MP3, HTML, PDF nem WAV não PCM", async () => {
  const compressedWave = wave();
  new DataView(compressedWave.buffer).setUint16(20, 3, true);
  for (const bytes of [mp3(), new TextEncoder().encode("<html>not audio</html>"),
    new TextEncoder().encode("%PDF-1.7 not audio"), compressedWave]) {
    for (const declared of ["audio/wav", "audio/mpeg"]) {
      await assert.rejects(() => resolveOpenAiTemporaryAudio(options({ descriptor: descriptor({ mime_type: declared }),
        fetchImpl: async () => new Response(bytes, { headers: { "content-type": "audio/x-wav" } }) })),
      error => error.status === 422 && error.code === "invalid_course_media");
    }
  }
});


test("descritor conserva contrato canônico mesmo com alias aceito na resposta", async () => {
  await assert.rejects(() => resolveOpenAiTemporaryAudio(options({
    descriptor: descriptor({ mime_type: "audio/x-wav" }),
    fetchImpl: () => assert.fail("Descritor fora do contrato não inicia download")
  })), error => error.status === 415 && error.code === "unsupported_audio_media_type");
});
