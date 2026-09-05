export const COURSE_MEDIA_MAX_BYTES = 20 * 1024 * 1024;
export const COURSE_MEDIA_COURSE_MAX_BYTES = 64 * 1024 * 1024;
export const COURSE_AUDIO_MEDIA_TYPES = Object.freeze(["audio/wav", "audio/mpeg"]);
export const COURSE_MEDIA_BUCKET = "course-media";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const HASH = /^[a-f0-9]{64}$/u;
const REQUEST_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/u;

export class CourseMediaError extends TypeError {
  constructor(message, code = "invalid_course_media") {
    super(message);
    this.name = "CourseMediaError";
    this.code = code;
  }
}
const fail = (message) => { throw new CourseMediaError(message); };
function exact(value, keys) {
  if (!value || typeof value !== "object" || Array.isArray(value) ||
      Object.keys(value).length !== keys.length || keys.some(key => !Object.hasOwn(value, key))) {
    fail("O contrato de áudio contém campos ausentes ou desconhecidos.");
  }
}
function text(value, maximum) {
  if (typeof value !== "string" || value !== value.trim() || !value ||
      [...value].length > maximum || [...value].some(character => {
        const code = character.codePointAt(0);
        return code <= 31 || code >= 127 && code <= 159;
      })) fail("Texto de áudio inválido.");
  return value;
}
function revision(value) {
  if (!Number.isSafeInteger(value) || value < 1) fail("Revisão de áudio inválida.");
  return value;
}
function courseId(value) {
  if (typeof value !== "string" || !UUID.test(value)) fail("Curso de áudio inválido.");
  return value;
}
function hash(value) {
  if (typeof value !== "string" || !HASH.test(value)) fail("Identidade do áudio inválida.");
  return value;
}
export function normalizeCourseMediaReference(value) {
  exact(value, ["contentHash", "byteSize", "mediaType"]);
  hash(value.contentHash);
  if (!Number.isSafeInteger(value.byteSize) || value.byteSize < 1 || value.byteSize > COURSE_MEDIA_MAX_BYTES ||
      !COURSE_AUDIO_MEDIA_TYPES.includes(value.mediaType)) fail("Formato ou tamanho do áudio não é aceito.");
  return { ...value };
}
export function normalizeCourseAudioFileName(value) {
  text(value, 180);
  if (/[\\/]/u.test(value) || value === "." || value === "..") fail("Informe apenas o nome do áudio, sem caminho.");
  return value;
}
export function normalizeCourseMediaCatalogItem(value) {
  exact(value, ["contentHash", "byteSize", "mediaType", "fileName"]);
  const { fileName, ...media } = value;
  return { ...normalizeCourseMediaReference(media), fileName: normalizeCourseAudioFileName(fileName) };
}
export function createDefaultCourseAudioConfig() {
  return { nativeVoiceURI: null, rate: 1, locale: "pt-BR", allowRemoteNativeVoice: false, service: null };
}
export function normalizeCourseAudioConfig(value) {
  exact(value, ["nativeVoiceURI", "rate", "locale", "allowRemoteNativeVoice", "service"]);
  if (value.nativeVoiceURI !== null) text(value.nativeVoiceURI, 512);
  if (!Number.isFinite(value.rate) || value.rate < 0.25 || value.rate > 2 ||
      typeof value.allowRemoteNativeVoice !== "boolean") fail("Velocidade ou permissão de voz inválida.");
  text(value.locale, 100);
  try { if (Intl.getCanonicalLocales(value.locale).length !== 1) fail("Idioma do áudio inválido."); }
  catch { fail("Idioma do áudio inválido."); }
  if (value.service !== null) {
    exact(value.service, ["providerId", "model", "voice"]);
    if (value.service.providerId !== "gemini" || value.service.model !== "gemini-2.5-flash-preview-tts" ||
        typeof value.service.voice !== "string" || !/^[A-Za-z][A-Za-z0-9_-]{0,63}$/u.test(value.service.voice)) fail("Serviço de voz não é compatível.");
  }
  return structuredClone(value);
}
export function normalizeCourseMediaCommand(value) {
  if (value?.type === "set_audio_config") {
    exact(value, ["type", "config"]);
    return { type: value.type, config: normalizeCourseAudioConfig(value.config) };
  }
  if (value?.type === "remove_media") {
    exact(value, ["type", "contentHash"]);
    return { type: value.type, contentHash: hash(value.contentHash) };
  }
  fail("Operação de áudio desconhecida.");
}
export function normalizeCourseMediaRead(value) {
  exact(value, ["contract", "courseId", "courseRevision", "mode", "audioConfig", "storage", "items", "nextCursor"]);
  if (value.contract !== "aralearn.course-media.v1" || !["catalog", "configuration"].includes(value.mode) ||
      !Array.isArray(value.items) || value.items.length > 50) fail("Leitura de áudio inválida.");
  const config = normalizeCourseAudioConfig(value.audioConfig);
  if (value.mode === "configuration") {
    if (value.storage !== null || value.items.length || value.nextCursor !== null) fail("Configuração pública contém dados privados.");
  } else {
    exact(value.storage, ["uniqueBytes", "maxUniqueBytes"]);
    if (!Number.isSafeInteger(value.storage.uniqueBytes) || value.storage.uniqueBytes < 0 ||
        value.storage.maxUniqueBytes !== COURSE_MEDIA_COURSE_MAX_BYTES ||
        value.nextCursor !== null && !HASH.test(value.nextCursor)) fail("Cota ou cursor de áudio inválido.");
  }
  const items = value.items.map(normalizeCourseMediaCatalogItem);
  if (new Set(items.map(item => item.contentHash)).size !== items.length) fail("Catálogo de áudio repete um arquivo.");
  return { ...structuredClone(value), courseId: courseId(value.courseId), courseRevision: revision(value.courseRevision), audioConfig: config, items };
}
export function normalizeCourseMediaChange(value) {
  exact(value, ["contract", "courseId", "courseRevision", "requestId", "idempotent", "changed", "operation", "media", "fileName"]);
  if (!["aralearn.course-media-change.v1", "aralearn.course-media-ingestion.v1"].includes(value.contract) ||
      !["ingest_audio", "set_audio_config", "remove_media"].includes(value.operation) ||
      (value.contract === "aralearn.course-media-ingestion.v1") !== (value.operation === "ingest_audio") ||
      typeof value.changed !== "boolean" || typeof value.idempotent !== "boolean" ||
      typeof value.requestId !== "string" || !REQUEST_ID.test(value.requestId)) {
    fail("Confirmação de áudio inválida.");
  }
  const media = value.media === null ? null : normalizeCourseMediaReference(value.media);
  if ((value.operation === "set_audio_config") !== (media === null)) fail("Confirmação de áudio não identifica o arquivo.");
  if (media === null ? value.fileName !== null : normalizeCourseAudioFileName(value.fileName) !== value.fileName) fail("Nome de áudio inválido.");
  return { ...value, courseId: courseId(value.courseId), courseRevision: revision(value.courseRevision), media };
}
export function normalizeCourseMediaDownload(value, { projectUrl } = {}) {
  exact(value, ["contract", "courseId", "courseRevision", "studyUnitId", "media", "signedUrl", "expiresAt"]);
  if (value.contract !== "aralearn.course-media-download.v1") fail("Download de áudio inválido.");
  const media = normalizeCourseMediaReference(value.media);
  const id = courseId(value.courseId);
  if (value.studyUnitId !== null) text(value.studyUnitId, 240);
  let url;
  try {
    if (typeof value.signedUrl !== "string") fail("URL de áudio inválida.");
    url = new URL(value.signedUrl);
  } catch { fail("URL de áudio inválida."); }
  const local = url.protocol === "http:" && ["localhost", "127.0.0.1", "10.0.2.2"].includes(url.hostname);
  const extension = media.mediaType === "audio/wav" ? "wav" : "mp3";
  if (url.protocol !== "https:" && !local || url.username || url.password || url.hash ||
      !url.searchParams.get("token") || url.pathname !== `/storage/v1/object/sign/${COURSE_MEDIA_BUCKET}/${id}/${media.contentHash}.${extension}` ||
      projectUrl && url.origin !== new URL(projectUrl).origin ||
      typeof value.expiresAt !== "string" || !Number.isFinite(Date.parse(value.expiresAt))) fail("URL de áudio não corresponde ao arquivo autorizado.");
  return { ...value, courseId: id, courseRevision: revision(value.courseRevision), media, signedUrl: url.toString() };
}

function ascii(bytes, offset, length) {
  return String.fromCharCode(...bytes.subarray(offset, offset + length));
}
function inspectWave(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length < 44 || ascii(bytes, 0, 4) !== "RIFF" || ascii(bytes, 8, 4) !== "WAVE" ||
      view.getUint32(4, true) + 8 !== bytes.length) fail("WAV truncado ou cabeçalho inválido.");
  let format = null;
  let dataSize = null;
  let offset = 12;
  while (offset < bytes.length) {
    if (offset + 8 > bytes.length) fail("Bloco WAV truncado.");
    const kind = ascii(bytes, offset, 4);
    const size = view.getUint32(offset + 4, true);
    const start = offset + 8;
    if (start + size + size % 2 > bytes.length) fail("Bloco WAV excede o arquivo.");
    if (kind === "fmt ") {
      if (format || ![16, 18].includes(size) || view.getUint16(start, true) !== 1 ||
          size === 18 && view.getUint16(start + 16, true) !== 0) fail("Use WAV com PCM inteiro sem compressão.");
      const channels = view.getUint16(start + 2, true);
      const sampleRate = view.getUint32(start + 4, true);
      const byteRate = view.getUint32(start + 8, true);
      const blockAlign = view.getUint16(start + 12, true);
      const bits = view.getUint16(start + 14, true);
      if (![1, 2].includes(channels) || sampleRate < 8000 || sampleRate > 192000 ||
          ![8, 16, 24, 32].includes(bits) || blockAlign !== channels * bits / 8 ||
          byteRate !== sampleRate * blockAlign) fail("Parâmetros PCM inválidos ou não aceitos.");
      format = { blockAlign };
    } else if (kind === "data") {
      if (dataSize !== null || !size) fail("O WAV precisa de um único bloco de amostras.");
      dataSize = size;
    }
    offset = start + size + size % 2;
  }
  if (!format || dataSize === null || dataSize % format.blockAlign) fail("Amostras PCM incompletas.");
}
function inspectMp3(bytes) {
  let offset = 0;
  if (ascii(bytes, 0, 3) === "ID3") {
    if (bytes.length < 10 || ![2, 3, 4].includes(bytes[3]) || bytes[4] === 255 ||
        bytes.subarray(6, 10).some(value => value > 127)) fail("Metadados ID3 inválidos.");
    const size = bytes.subarray(6, 10).reduce((sum, value) => sum * 128 + value, 0);
    offset = 10 + size + (bytes[3] === 4 && (bytes[5] & 16) ? 10 : 0);
    if (offset >= bytes.length) fail("MP3 sem quadros de áudio.");
  }
  let end = bytes.length;
  if (end >= 128 && ascii(bytes, end - 128, 3) === "TAG") end -= 128;
  let identity = null;
  let frames = 0;
  while (offset < end) {
    if (offset + 4 > end || bytes[offset] !== 255 || (bytes[offset + 1] & 224) !== 224) fail("Quadro MP3 inválido ou truncado.");
    const version = (bytes[offset + 1] >> 3) & 3;
    const layer = (bytes[offset + 1] >> 1) & 3;
    const bitrateIndex = bytes[offset + 2] >> 4;
    const sampleIndex = (bytes[offset + 2] >> 2) & 3;
    if (version === 1 || layer !== 1 || bitrateIndex === 0 || bitrateIndex === 15 || sampleIndex === 3 ||
        (bytes[offset + 3] & 3) === 2) fail("O arquivo precisa conter quadros MPEG Layer III válidos.");
    const bitrate = (version === 3 ? [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320]
      : [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160])[bitrateIndex] * 1000;
    const sampleRate = [44100, 48000, 32000][sampleIndex] / (version === 3 ? 1 : version === 2 ? 2 : 4);
    const channels = bytes[offset + 3] >> 6 === 3 ? 1 : 2;
    const currentIdentity = `${version}:${sampleRate}:${channels}`;
    if (identity !== null && identity !== currentIdentity) fail("O MP3 altera o formato entre quadros.");
    identity = currentIdentity;
    const size = Math.floor((version === 3 ? 144 : 72) * bitrate / sampleRate) + ((bytes[offset + 2] >> 1) & 1);
    if (size < 24 || offset + size > end) fail("Quadro MP3 incompleto.");
    offset += size;
    frames += 1;
  }
  if (!frames || offset !== end) fail("MP3 sem áudio completo.");
}
/** Validates framing and PCM shape, not the semantic content or a decoder implementation. */
export function inspectCourseAudioBytes(value, { declaredMediaType = "" } = {}) {
  const bytes = value instanceof Uint8Array ? value : value instanceof ArrayBuffer ? new Uint8Array(value) : null;
  if (!bytes || !bytes.length || bytes.length > COURSE_MEDIA_MAX_BYTES) fail("O áudio deve ter até 20 MiB.");
  const wave = ascii(bytes, 0, 4) === "RIFF";
  if (wave) inspectWave(bytes); else inspectMp3(bytes);
  const mediaType = wave ? "audio/wav" : "audio/mpeg";
  if (declaredMediaType && declaredMediaType !== mediaType) fail("O tipo declarado não corresponde ao áudio.");
  return { mediaType, extension: wave ? "wav" : "mp3", byteSize: bytes.length };
}
