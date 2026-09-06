import { normalizeCourseMediaCommand, normalizeCourseMediaRead, normalizeCourseMediaChange,
  normalizeCourseMediaDownload, normalizeCourseAudioFileName, COURSE_MEDIA_MAX_BYTES } from "../domain/courseMedia.js";
import { UUID_PATTERN } from "../domain/identifiers.js";

function exact(value, allowed) {
  if (!value || typeof value !== "object" || Array.isArray(value) ||
      Object.keys(value).some((field) => !allowed.includes(field))) throw new TypeError("Pedido de áudio inválido.");
}
function id(value) {
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) throw new TypeError("Curso de áudio inválido.");
  return value;
}
function revision(value) {
  if (!Number.isSafeInteger(value) || value < 1) throw new TypeError("Revisão do curso inválida.");
  return value;
}
function hash(value) {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/u.test(value)) throw new TypeError("Identidade do áudio inválida.");
  return value;
}

export function courseMediaReadRequest(courseId, options = {}) {
  exact(options, ["expectedRevision", "mode", "cursor", "limit"]);
  const { mode = "configuration", cursor = null, limit = 20 } = options;
  if (!["configuration", "catalog"].includes(mode) || !Number.isSafeInteger(limit) || limit < 1 || limit > 50 ||
      mode === "configuration" && cursor !== null) throw new TypeError("Consulta de áudio inválida.");
  if (cursor !== null) hash(cursor);
  return { courseId: id(courseId), expectedRevision: revision(options.expectedRevision), mode, cursor, limit };
}

export function courseMediaDownloadRequest(value) {
  exact(value, ["courseId", "expectedRevision", "studyUnitId", "contentHash"]);
  const studyUnitId = value.studyUnitId ?? null;
  if (studyUnitId !== null && (typeof studyUnitId !== "string" || !studyUnitId.trim() || studyUnitId !== studyUnitId.trim() ||
      [...studyUnitId].length > 240 || [...studyUnitId].some((character) => character.codePointAt(0) < 32))) {
    throw new TypeError("Unidade de estudo inválida para áudio.");
  }
  return { courseId: id(value.courseId), expectedRevision: revision(value.expectedRevision), studyUnitId, contentHash: hash(value.contentHash) };
}

export function courseMediaWriteRequest(value, { upload = false } = {}) {
  exact(value, ["courseId", "expectedCourseRevision", "requestId", upload ? "file" : "command"]);
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/u.test(value.requestId)) throw new TypeError("Identidade do pedido de áudio inválida.");
  const result = { courseId: id(value.courseId), expectedCourseRevision: revision(value.expectedCourseRevision), requestId: value.requestId };
  if (!upload) return { ...result, command: normalizeCourseMediaCommand(value.command) };
  const file = value.file;
  if (!file || typeof file.arrayBuffer !== "function" || typeof file.stream !== "function" ||
      !Number.isSafeInteger(file.size) || file.size < 1 || file.size > COURSE_MEDIA_MAX_BYTES) throw new TypeError("Use um áudio de até 20 MiB.");
  normalizeCourseAudioFileName(file.name);
  return { ...result, file };
}

export function boundCourseMediaRead(value, request) {
  const result = normalizeCourseMediaRead(value);
  if (result.courseId !== request.courseId || result.courseRevision !== request.expectedRevision || result.mode !== request.mode ||
      result.items.length > request.limit || request.cursor !== null && result.items.some((item) => item.contentHash <= request.cursor) ||
      result.nextCursor !== null && result.nextCursor !== result.items.at(-1)?.contentHash) {
    throw new TypeError("A leitura de áudio não corresponde à consulta.");
  }
  return result;
}

export function boundCourseMediaDownload(value, request, options = {}) {
  const result = normalizeCourseMediaDownload(value, options);
  if (result.courseId !== request.courseId || result.courseRevision !== request.expectedRevision ||
      result.studyUnitId !== request.studyUnitId || result.media.contentHash !== request.contentHash) {
    throw new TypeError("O download de áudio não corresponde à consulta.");
  }
  return result;
}

export function boundCourseMediaChange(value, request, media = null) {
  const result = normalizeCourseMediaChange(value);
  const operation = request.file ? "ingest_audio" : request.command.type;
  if (result.courseId !== request.courseId || result.requestId !== request.requestId || result.operation !== operation ||
      result.courseRevision !== request.expectedCourseRevision + (result.changed ? 1 : 0) ||
      request.command?.type === "remove_media" && result.media?.contentHash !== request.command.contentHash ||
      request.file && result.media?.byteSize !== request.file.size ||
      media && Object.keys(media).some((field) => result.media?.[field] !== media[field])) {
    throw new TypeError("A confirmação de áudio não corresponde ao pedido.");
  }
  return result;
}
