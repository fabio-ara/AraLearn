import test from "node:test";
import assert from "node:assert/strict";
import { COURSE_MEDIA_MAX_BYTES, createDefaultCourseAudioConfig, inspectCourseAudioBytes,
  normalizeCourseAudioConfig, normalizeCourseMediaDownload, normalizeCourseMediaRead,
  normalizeCourseMediaReference } from "../../src/domain/courseMedia.js";

function wave() {
  const bytes = new Uint8Array(44 + 480);
  const view = new DataView(bytes.buffer);
  for (const [offset, value] of [[0, "RIFF"], [8, "WAVE"], [12, "fmt "], [36, "data"]]) {
    bytes.set(new TextEncoder().encode(value), offset);
  }
  view.setUint32(4, bytes.length - 8, true);
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, 24000, true);
  view.setUint32(28, 48000, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  view.setUint32(40, 480, true);
  return bytes;
}
test("PCM valida amostras, comprimentos e tipo real, sem confiar em extensão", () => {
  assert.deepEqual(inspectCourseAudioBytes(wave(), { declaredMediaType: "audio/wav" }),
    { mediaType: "audio/wav", extension: "wav", byteSize: 524 });
  assert.throws(() => inspectCourseAudioBytes(wave().slice(0, -1)), /truncado/u);
  const invalid = wave();
  new DataView(invalid.buffer).setUint16(20, 3, true);
  assert.throws(() => inspectCourseAudioBytes(invalid), /PCM inteiro/u);
  assert.throws(() => inspectCourseAudioBytes(wave(), { declaredMediaType: "audio/mpeg" }), /tipo declarado/u);
  assert.throws(() => inspectCourseAudioBytes(new Uint8Array(COURSE_MEDIA_MAX_BYTES + 1)), /20 MiB/u);
  assert.throws(() => inspectCourseAudioBytes(new TextEncoder().encode("<html>não é áudio</html>")), /MP3/u);
});
test("MP3 verifica cada quadro e limites ID3; a fixture prova framing, não decodificação", () => {
  const bytes = new Uint8Array(417 * 3);
  for (const offset of [0, 417, 834]) bytes.set([255, 251, 144, 0], offset);
  assert.deepEqual(inspectCourseAudioBytes(bytes), { mediaType: "audio/mpeg", extension: "mp3", byteSize: 1251 });
  assert.throws(() => inspectCourseAudioBytes(bytes.slice(0, -1)), /incompleto/u);
  const bad = bytes.slice(); bad[417] = 0;
  assert.throws(() => inspectCourseAudioBytes(bad), /inválido/u);
  const tag = new Uint8Array(10 + bytes.length);
  tag.set([73, 68, 51, 4, 0, 0, 0, 0, 0, 0]); tag.set(bytes, 10);
  assert.equal(inspectCourseAudioBytes(tag).mediaType, "audio/mpeg");
  tag[6] = 128;
  assert.throws(() => inspectCourseAudioBytes(tag), /ID3/u);
});
test("configuração distingue voz remota e serviço explícito sem aceitar credenciais", () => {
  const config = createDefaultCourseAudioConfig();
  assert.equal(config.allowRemoteNativeVoice, false);
  assert.equal(config.service, null);
  assert.deepEqual(normalizeCourseAudioConfig(config), config);
  assert.throws(() => normalizeCourseAudioConfig({ ...config, apiKey: "forbidden" }), /campos/u);
  assert.throws(() => normalizeCourseAudioConfig({ ...config, rate: 0 }), /Velocidade/u);
  assert.throws(() => normalizeCourseAudioConfig({ ...config, locale: "../../" }), /Idioma/u);
  assert.throws(() => normalizeCourseAudioConfig({ ...config, service: { providerId: "unknown", model: "x", voice: "A" } }), /Serviço/u);
});
test("leitura pública fecha projeção e download vincula curso, hash e origem confiável", () => {
  const courseId = "10000000-0000-4000-8000-000000000001";
  const media = { contentHash: "a".repeat(64), byteSize: 524, mediaType: "audio/wav" };
  assert.deepEqual(normalizeCourseMediaReference(media), media);
  assert.throws(() => normalizeCourseMediaReference({ ...media, storagePath: "secret" }), /campos/u);
  const read = { contract: "aralearn.course-media.v1", courseId, courseRevision: 2,
    mode: "configuration", audioConfig: createDefaultCourseAudioConfig(), storage: null, items: [], nextCursor: null };
  assert.deepEqual(normalizeCourseMediaRead(read), read);
  assert.throws(() => normalizeCourseMediaRead({ ...read, items: [media] }), /dados privados/u);
  const download = { contract: "aralearn.course-media-download.v1", courseId, courseRevision: 2,
    studyUnitId: "unit", media, signedUrl: `https://project.test/storage/v1/object/sign/course-media/${courseId}/${media.contentHash}.wav?token=synthetic`,
    expiresAt: "2026-09-05T12:00:00.000Z" };
  assert.deepEqual(normalizeCourseMediaDownload(download, { projectUrl: "https://project.test" }), download);
  assert.throws(() => normalizeCourseMediaDownload(download, { projectUrl: "https://other.test" }), /não corresponde/u);
  assert.throws(() => normalizeCourseMediaDownload({ ...download, signedUrl: download.signedUrl.replace(media.contentHash, "b".repeat(64)) }), /não corresponde/u);
});
