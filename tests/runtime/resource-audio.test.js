import test from "node:test";
import assert from "node:assert/strict";
import { audioPackage } from "../../src/resources/packages/audio/index.js";
import { selectNativeAudioVoice } from "../../src/resources/packages/audio/interaction.js";
import { createPackageRegistry } from "../../src/resources/kernel/packageRegistry.js";
import { createDefaultCourseAudioConfig, inspectCourseAudioBytes } from "../../src/domain/courseMedia.js";
import { generateGeminiSpeech, GEMINI_SPEECH_MODEL, GEMINI_SPEECH_VOICES, wrapGeminiPcmAsWav } from "../../src/generation/providers/geminiSpeechProvider.js";

const registry = createPackageRegistry([audioPackage]);
const track = { id: "listen", label: "Escuta sintética", locale: "pt-BR", kind: "native", text: "Resposta auditiva reservada.",
  alternative: { text: "Alternativa reservada <img src=x onerror=alert(1)>", visibility: "after_response" } };
const instance = data => ({ id: "audio-1", package: audioPackage.manifest.id, version: "1.0.0", data });
const config = createDefaultCourseAudioConfig();
const voice = (voiceURI, lang, localService) => ({ voiceURI, name: voiceURI, lang, localService });
const runtimeConfig = { assistAllowedOrigins: ["https://generativelanguage.googleapis.com"] };
const request = { text: "Olá, mundo.\nSegunda linha.", locale: "pt-BR", voice: "Kore", rate: 1.25, apiKey: "synthetic-not-a-key", runtimeConfig };
const response = (data = "AAABAP//", mimeType = "audio/L16;codec=pcm;rate=24000") => ({ candidates: [{ finishReason: "STOP", content: { parts: [{ inlineData: { mimeType, data } }] } }] });
const fetchResponse = payload => async () => Response.json(payload);

test("áudio usa o catálogo existente, valida faixas e não revela resposta antes da condição", () => {
  assert.equal(registry.validateInstance(instance({ tracks: [track] }), "content").valid, true);
  assert.equal(registry.validateInstance(instance({ tracks: [track] }), "response").valid, false);
  const html = audioPackage.render({ tracks: [track] });
  assert.doesNotMatch(html, /Resposta auditiva reservada|Alternativa reservada|onerror/);
  assert.doesNotMatch(audioPackage.accessibleText({ tracks: [track] }), /reservada/);
  assert.match(audioPackage.render({ tracks: [track] }, { canRevealAnswers: true }), /&lt;img/);
  assert.match(audioPackage.render({ tracks: [track] }, { manualEditing: true }), /Resposta auditiva reservada/);
  assert.equal(audioPackage.editableTargets({ tracks: [track] }).length, 3);
  for (const tracks of [[track, track], [{ ...track, locale: "not_locale!" }], [{ ...track, id: "a\u0000b" }],
    [{ ...track, secret: "forbidden" }], [{ ...track, text: "x".repeat(16001) }],
    [{ ...track, kind: "file", text: undefined, media: { contentHash: "a".repeat(64), byteSize: 2, mediaType: "text/html" } }]]) {
    assert.equal(registry.validateInstance(instance({ tracks }), "content").valid, false);
  }
  assert.equal(registry.validateInstance(instance({ tracks: Array.from({ length: 32 }, (_, index) => ({ ...track, id: `track-${index}` })) }), "content").valid, true);
});

test("seleção nativa conserva voz/idioma e não troca silenciosamente por serviço remoto", () => {
  const local = voice("pt-local", "pt-BR", true), remote = voice("pt-remote", "pt-BR", false), english = voice("en-local", "en-US", true);
  assert.equal(selectNativeAudioVoice([remote, english, local], "pt-BR", config), local);
  assert.throws(() => selectNativeAudioVoice([remote], "pt-BR", config), /idioma/);
  assert.throws(() => selectNativeAudioVoice([local], "en-US", config), /idioma/);
  assert.throws(() => selectNativeAudioVoice([local], "pt-BR", { ...config, nativeVoiceURI: "missing" }), /escolhida/);
  assert.throws(() => selectNativeAudioVoice([local, remote], "pt-BR", { ...config, nativeVoiceURI: remote.voiceURI }), /remoto/);
  assert.equal(selectNativeAudioVoice([remote], "pt-BR", { ...config, allowRemoteNativeVoice: true }), remote);
  assert.throws(() => selectNativeAudioVoice([english], "pt-BR", { ...config, nativeVoiceURI: english.voiceURI }), /escolhida/);
});

test("adaptador Gemini faz um pedido explícito com idioma/ritmo/voz e materializa PCM WAV verificável", async () => {
  let calls = 0;
  const result = await generateGeminiSpeech({ ...request, fetchImpl: async (url, options) => {
    calls += 1;
    assert.equal(url, `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_SPEECH_MODEL}:generateContent`);
    assert.equal(options.headers["x-goog-api-key"], request.apiKey);
    assert.equal(options.redirect, "error"); assert.equal(options.credentials, "omit"); assert.equal(options.cache, "no-store");
    const body = JSON.parse(options.body);
    assert.deepEqual(body.generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig, { voiceName: "Kore" });
    assert.match(body.contents[0].parts[0].text, /pt-BR.*1.25/su);
    assert.ok(body.contents[0].parts[0].text.endsWith(request.text));
    assert.doesNotMatch(options.body, /synthetic-not-a-key/);
    return Response.json(response());
  } });
  assert.equal(calls, 1); assert.equal(GEMINI_SPEECH_VOICES.length, 30);
  const bytes = new Uint8Array(await result.blob.arrayBuffer());
  assert.deepEqual(inspectCourseAudioBytes(bytes), { mediaType: "audio/wav", extension: "wav", byteSize: 50 });
  assert.deepEqual([...bytes.slice(44)], [0, 0, 1, 0, 255, 255]);
  assert.equal(new DataView(bytes.buffer).getUint32(24, true), 24000);
  assert.equal(result.media.byteSize, result.blob.size); assert.match(result.media.contentHash, /^[a-f0-9]{64}$/u);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  assert.equal(result.media.contentHash, Buffer.from(digest).toString("hex"));
  assert.equal(Object.hasOwn(result, "apiKey"), false);
});

test("adaptador rejeita configuração inválida antes da rede e preserva abort explícito", async () => {
  let calls = 0;
  const fetchImpl = async () => { calls++; return Response.json(response()); };
  for (const patch of [{ text: " " }, { text: "x".repeat(16001) }, { text: "a\u0000b" }, { locale: "x_invalid!" },
    { rate: 0.24 }, { rate: 2.01 }, { voice: "invented" }, { model: "other-model" }, { apiKey: "a\nb" }, { runtimeConfig: {} }]) {
    await assert.rejects(generateGeminiSpeech({ ...request, fetchImpl, ...patch }));
  }
  const controller = new AbortController(); controller.abort();
  await assert.rejects(generateGeminiSpeech({ ...request, fetchImpl, signal: controller.signal }), { name: "AbortError" });
  assert.equal(calls, 0);
});

test("adaptador recusa bytes inválidos, formato divergente e respostas parciais sem retentativa", async () => {
  for (const payload of [response(""), response("AA=="), response("@@=="), response("AB=="), response("AAA=", "audio/mp3"),
    response("AAA=", "audio/L16;codec=pcm;rate=16000"), { candidates: [] }, { ...response(), promptFeedback: { blockReason: "SAFETY" } },
    { candidates: [{ ...response().candidates[0], finishReason: "MAX_TOKENS" }] },
    { candidates: [{ finishReason: "STOP", content: { parts: [{ text: "No audio" }] } }] }]) {
    let calls = 0;
    await assert.rejects(generateGeminiSpeech({ ...request, fetchImpl: async () => { calls++; return Response.json(payload); } }), { name: "GeminiSpeechError" });
    assert.equal(calls, 1);
  }
  await assert.rejects(generateGeminiSpeech({ ...request, fetchImpl: async () => new Response("incomplete", { headers: { "content-length": "999999999" } }) }), /limite/);
  await assert.rejects(generateGeminiSpeech({ ...request, fetchImpl: async () => new Response("{broken") }), /inválida/);
  for (const status of [401, 403, 429, 500]) {
    await assert.rejects(generateGeminiSpeech({ ...request, fetchImpl: async () => new Response(request.apiKey, { status }) }), error => !error.message.includes(request.apiKey));
  }
  assert.throws(() => wrapGeminiPcmAsWav(new Uint8Array(20 * 1024 * 1024)), /limite/);
});

test("cancelar pedido em curso não gera arquivo nem reenvia; texto multilíngue permanece literal", async () => {
  const controller = new AbortController(); let calls = 0;
  const pending = generateGeminiSpeech({ ...request, signal: controller.signal, fetchImpl: async (_url, { signal }) => {
    calls++;
    return new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(new DOMException("abort", "AbortError")), { once: true }));
  } });
  controller.abort();
  await assert.rejects(pending, { name: "AbortError" }); assert.equal(calls, 1);
  for (const [locale, text] of [["ja-JP", "おはようございます。"], ["zh-CN", "树木组成树林。"], ["en-GB", "A synthetic spoken sample."]]) {
    const result = await generateGeminiSpeech({ ...request, locale, text, fetchImpl: fetchResponse(response()) });
    assert.equal(result.media.mediaType, "audio/wav");
  }
});
