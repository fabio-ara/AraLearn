const OPENAI_FILE_HOST_SUFFIX = ".oaiusercontent.com";
const OPENAI_AZURE_FILE_HOSTS = new Set([
  "oaisdmntprbrazilsouth.blob.core.windows.net"
]);
const DESCRIPTOR_FIELDS = new Set([
  "download_url",
  "file_id",
  "mime_type",
  "file_name"
]);
const EXPIRED_STATUS_CODES = new Set([401, 403, 404, 410]);
function hasControlCharacter(value) {
  for (const character of value) {
    const codePoint = character.codePointAt(0);
    if (codePoint <= 31 || (codePoint >= 127 && codePoint <= 159)) return true;
  }
  return false;
}

export function isTrustedOpenAiFileHost(hostname) {
  return hostname.endsWith(OPENAI_FILE_HOST_SUFFIX) ||
    OPENAI_AZURE_FILE_HOSTS.has(hostname);
}

function normalizeDescriptor(descriptor, { field, mediaTypes, errors }) {
  const { invalidDescriptor, unsupportedMediaType } = errors;
  if (!descriptor || typeof descriptor !== "object" || Array.isArray(descriptor)) {
    throw invalidDescriptor(field, "object");
  }

  const fields = Object.keys(descriptor);
  if (!Object.hasOwn(descriptor, "download_url") ||
      !Object.hasOwn(descriptor, "file_id") ||
      fields.some((field) => !DESCRIPTOR_FIELDS.has(field))) {
    throw invalidDescriptor(field, "official_file_descriptor_fields");
  }

  const fileId = descriptor.file_id;
  if (typeof fileId !== "string" || fileId.length < 1 || fileId.length > 240 ||
      fileId.trim() !== fileId || hasControlCharacter(fileId)) {
    throw invalidDescriptor(`${field}.file_id`, "nonempty_file_identifier");
  }

  if (Object.hasOwn(descriptor, "file_name")) {
    const fileName = descriptor.file_name;
    if (typeof fileName !== "string" || fileName.length < 1 || fileName.length > 500 ||
        hasControlCharacter(fileName)) {
      throw invalidDescriptor(`${field}.file_name`, "safe_file_name");
    }
  }

  if (Object.hasOwn(descriptor, "mime_type")) {
    if (typeof descriptor.mime_type !== "string" ||
        !mediaTypes.has(descriptor.mime_type.trim().toLowerCase())) {
      throw unsupportedMediaType();
    }
  }

  if (typeof descriptor.download_url !== "string") {
    throw invalidDescriptor(`${field}.download_url`, "absolute_https_url");
  }

  let downloadUrl;
  try {
    downloadUrl = new URL(descriptor.download_url);
  } catch {
    throw invalidDescriptor(`${field}.download_url`, "absolute_https_url");
  }

  if (downloadUrl.protocol !== "https:") {
    throw invalidDescriptor(`${field}.download_url`, "https");
  }
  if (!isTrustedOpenAiFileHost(downloadUrl.hostname)) {
    throw invalidDescriptor(`${field}.download_url`, "trusted_openai_file_origin");
  }
  if (downloadUrl.username !== "" || downloadUrl.password !== "") {
    throw invalidDescriptor(`${field}.download_url`, "no_url_credentials");
  }
  if (downloadUrl.hash !== "") {
    throw invalidDescriptor(`${field}.download_url`, "no_url_fragment");
  }
  if (downloadUrl.port !== "" && downloadUrl.port !== "443") {
    throw invalidDescriptor(`${field}.download_url`, "standard_https_port");
  }

  return downloadUrl.href;
}

function responseMediaType(response, unavailableFile) {
  let value;
  try {
    value = response.headers?.get?.("content-type");
  } catch {
    throw unavailableFile();
  }
  if (!value) return null;
  return value.split(";", 1)[0].trim().toLowerCase();
}

function responseContentLength(response, unavailableFile) {
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

/** Download único, limitado e sem redirecionamento; a política pertence ao consumidor. */
export async function resolveOpenAiTemporaryFile({
  descriptor,
  fetchImpl = globalThis.fetch,
  deadlineAt
} = {}, policy) {
  const { field, mediaTypes, maxBytes, errors } = policy;
  const { invalidDescriptor, unsupportedMediaType, expiredFile, unavailableFile, timedOutFile, oversizedFile } = errors;
  const downloadUrl = normalizeDescriptor(descriptor, policy);
  if (typeof fetchImpl !== "function" || !Number.isFinite(deadlineAt)) {
    throw invalidDescriptor(field, "resolver_configuration");
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
        headers: { accept: [...mediaTypes, "application/octet-stream;q=0.8"].join(", ") },
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
    mediaType = responseMediaType(response, unavailableFile);
    contentLength = responseContentLength(response, unavailableFile);
  } catch {
    clearTimeout(timeoutId);
    cancelBody(response);
    throw unavailableFile();
  }
  if (mediaType && mediaType !== "application/octet-stream" && !mediaTypes.has(mediaType)) {
    clearTimeout(timeoutId);
    cancelBody(response);
    throw unsupportedMediaType();
  }

  if (contentLength !== null && contentLength > maxBytes) {
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
      if (byteLength > maxBytes) throw oversizedFile();
      chunks.push(result.value);
    }
  } finally {
    clearTimeout(timeoutId);
    if (timedOut || byteLength > maxBytes) {
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
  return { bytes, responseMediaType: mediaType };
}
