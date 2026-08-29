import { COURSE_SOURCE_PDF_MAX_BYTES } from
  "../aralearn/runtime/domain/courseSources.js";
import { AuthoringApiError } from "./errors.js";

const OPENAI_FILE_HOST = "files.oaiusercontent.com";
const DESCRIPTOR_FIELDS = new Set([
  "download_url",
  "file_id",
  "mime_type",
  "file_name"
]);
const EXPIRED_STATUS_CODES = new Set([401, 403, 404, 410]);
const ALLOWED_RESPONSE_MEDIA_TYPES = new Set([
  "application/pdf",
  "application/octet-stream"
]);

function invalidDescriptor() {
  return new AuthoringApiError(
    422,
    "invalid_openai_file",
    "O anexo enviado pelo ChatGPT é inválido. Anexe o PDF novamente."
  );
}

function unsupportedMediaType() {
  return new AuthoringApiError(
    415,
    "unsupported_pdf_media_type",
    "O anexo recebido não é um PDF. Envie um arquivo PDF."
  );
}

function expiredFile() {
  return new AuthoringApiError(
    410,
    "openai_file_expired",
    "O acesso temporário ao PDF expirou. Anexe o arquivo novamente."
  );
}

function unavailableFile() {
  return new AuthoringApiError(
    502,
    "openai_file_unavailable",
    "Não foi possível receber o PDF. Anexe o arquivo novamente."
  );
}

function timedOutFile() {
  return new AuthoringApiError(
    408,
    "openai_file_timeout",
    "O prazo para receber o PDF terminou. Anexe o arquivo novamente."
  );
}

function oversizedFile() {
  return new AuthoringApiError(
    413,
    "pdf_too_large",
    "Use um PDF de até 20 MiB."
  );
}

function hasControlCharacter(value) {
  for (const character of value) {
    const codePoint = character.codePointAt(0);
    if (codePoint <= 31 || (codePoint >= 127 && codePoint <= 159)) return true;
  }
  return false;
}

function normalizeDescriptor(descriptor) {
  if (!descriptor || typeof descriptor !== "object" || Array.isArray(descriptor)) {
    throw invalidDescriptor();
  }

  const fields = Object.keys(descriptor);
  if (!Object.hasOwn(descriptor, "download_url") ||
      !Object.hasOwn(descriptor, "file_id") ||
      fields.some((field) => !DESCRIPTOR_FIELDS.has(field))) {
    throw invalidDescriptor();
  }

  const fileId = descriptor.file_id;
  if (typeof fileId !== "string" || fileId.length < 1 || fileId.length > 240 ||
      fileId.trim() !== fileId || hasControlCharacter(fileId)) {
    throw invalidDescriptor();
  }

  if (Object.hasOwn(descriptor, "file_name")) {
    const fileName = descriptor.file_name;
    if (typeof fileName !== "string" || fileName.length < 1 || fileName.length > 500 ||
        hasControlCharacter(fileName)) {
      throw invalidDescriptor();
    }
  }

  if (Object.hasOwn(descriptor, "mime_type")) {
    if (typeof descriptor.mime_type !== "string" ||
        descriptor.mime_type.trim().toLowerCase() !== "application/pdf") {
      throw unsupportedMediaType();
    }
  }

  if (typeof descriptor.download_url !== "string") throw invalidDescriptor();

  let downloadUrl;
  try {
    downloadUrl = new URL(descriptor.download_url);
  } catch {
    throw invalidDescriptor();
  }

  if (downloadUrl.protocol !== "https:" || downloadUrl.hostname !== OPENAI_FILE_HOST ||
      downloadUrl.username !== "" || downloadUrl.password !== "" ||
      downloadUrl.hash !== "" || (downloadUrl.port !== "" && downloadUrl.port !== "443")) {
    throw invalidDescriptor();
  }

  return downloadUrl.href;
}

function responseMediaType(response) {
  let value;
  try {
    value = response.headers?.get?.("content-type");
  } catch {
    throw unavailableFile();
  }
  if (!value) return null;
  return value.split(";", 1)[0].trim().toLowerCase();
}

function responseContentLength(response) {
  let value;
  try {
    value = response.headers?.get?.("content-length");
  } catch {
    throw unavailableFile();
  }
  if (!value) return null;
  const normalized = value.trim();
  if (!/^\d+$/u.test(normalized)) throw unavailableFile();
  const length = Number(normalized);
  if (!Number.isSafeInteger(length)) throw unavailableFile();
  return length;
}

function ignoreRejected(operation) {
  Promise.resolve(operation).catch(() => {});
}

function cancelBody(response) {
  try {
    ignoreRejected(response?.body?.cancel?.());
  } catch {
    // A conexão já pode ter sido encerrada pelo transporte.
  }
}

function cancelReader(reader) {
  try {
    ignoreRejected(reader.cancel());
  } catch {
    // A conexão já pode ter sido encerrada pelo transporte.
  }
}

/**
 * Resolve um único descritor temporário oficial da OpenAI em bytes limitados.
 *
 * @param {{
 *   descriptor: {
 *     download_url: string,
 *     file_id: string,
 *     mime_type?: string,
 *     file_name?: string
 *   },
 *   fetchImpl?: typeof fetch,
 *   deadlineAt: number
 * }} options
 * @returns {Promise<Uint8Array>}
 */
export async function resolveOpenAiTemporaryPdf({
  descriptor,
  fetchImpl = globalThis.fetch,
  deadlineAt
} = {}) {
  const downloadUrl = normalizeDescriptor(descriptor);
  if (typeof fetchImpl !== "function" || !Number.isFinite(deadlineAt)) {
    throw invalidDescriptor();
  }

  const remainingMilliseconds = deadlineAt - Date.now();
  if (remainingMilliseconds <= 0) throw timedOutFile();

  const controller = new AbortController();
  let timedOut = false;
  let timeoutId;
  const deadline = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      timedOut = true;
      controller.abort();
      reject(timedOutFile());
    }, Math.min(remainingMilliseconds, 2_147_483_647));
  });

  let response;
  try {
    response = await Promise.race([
      Promise.resolve().then(() => fetchImpl(downloadUrl, {
        method: "GET",
        redirect: "error",
        credentials: "omit",
        headers: { accept: "application/pdf, application/octet-stream;q=0.8" },
        signal: controller.signal
      })),
      deadline
    ]);
  } catch {
    clearTimeout(timeoutId);
    if (timedOut) throw timedOutFile();
    throw unavailableFile();
  }

  if (!response || typeof response.status !== "number") {
    clearTimeout(timeoutId);
    throw unavailableFile();
  }
  if (response.redirected === true || (response.status >= 300 && response.status < 400)) {
    clearTimeout(timeoutId);
    cancelBody(response);
    throw unavailableFile();
  }
  if (!response.ok) {
    clearTimeout(timeoutId);
    cancelBody(response);
    if (EXPIRED_STATUS_CODES.has(response.status)) throw expiredFile();
    throw unavailableFile();
  }

  let mediaType;
  let contentLength;
  try {
    mediaType = responseMediaType(response);
    contentLength = responseContentLength(response);
  } catch {
    clearTimeout(timeoutId);
    cancelBody(response);
    throw unavailableFile();
  }
  if (mediaType && !ALLOWED_RESPONSE_MEDIA_TYPES.has(mediaType)) {
    clearTimeout(timeoutId);
    cancelBody(response);
    throw unsupportedMediaType();
  }

  if (contentLength !== null && contentLength > COURSE_SOURCE_PDF_MAX_BYTES) {
    clearTimeout(timeoutId);
    cancelBody(response);
    throw oversizedFile();
  }

  let reader;
  try {
    reader = response.body?.getReader?.();
  } catch {
    clearTimeout(timeoutId);
    throw unavailableFile();
  }
  if (!reader) {
    clearTimeout(timeoutId);
    throw unavailableFile();
  }

  const chunks = [];
  let byteLength = 0;
  try {
    while (true) {
      let result;
      try {
        result = await Promise.race([reader.read(), deadline]);
      } catch {
        if (timedOut) throw timedOutFile();
        throw unavailableFile();
      }
      if (!result || typeof result !== "object" || typeof result.done !== "boolean") {
        throw unavailableFile();
      }
      if (result.done) break;
      if (!(result.value instanceof Uint8Array)) throw unavailableFile();
      byteLength += result.value.byteLength;
      if (byteLength > COURSE_SOURCE_PDF_MAX_BYTES) throw oversizedFile();
      chunks.push(result.value);
    }
  } finally {
    clearTimeout(timeoutId);
    if (timedOut || byteLength > COURSE_SOURCE_PDF_MAX_BYTES) {
      cancelReader(reader);
    }
    try {
      reader.releaseLock();
    } catch {
      // O leitor pode já ter sido liberado pelo transporte.
    }
  }

  const bytes = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}
