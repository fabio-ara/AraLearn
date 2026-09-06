import { normalizeCourseMediaDownload, normalizeCourseMediaReference, inspectCourseAudioBytes } from "../domain/courseMedia.js";

/** Revalida identidade, tamanho, formato e hash antes de entregar bytes ao player. Não persiste URL nem áudio. */
export async function readCourseMediaBlob(download, declaredMedia, {
  fetchImpl = globalThis.fetch, projectUrl, signal
} = {}) {
  const media = normalizeCourseMediaReference(declaredMedia);
  const result = normalizeCourseMediaDownload(download, { projectUrl });
  if (Object.keys(media).some((field) => result.media[field] !== media[field])) {
    throw new TypeError("O áudio recebido não corresponde ao arquivo solicitado.");
  }
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener("abort", abort, { once: true });
  if (signal?.aborted) controller.abort();
  const timeout = setTimeout(abort, 20_000);
  try {
    const response = await fetchImpl(result.signedUrl, {
      credentials: "omit", cache: "no-store", redirect: "error", signal: controller.signal
    });
    if (!response.ok) throw new Error("O acesso ao áudio expirou ou foi retirado. Tente abrir novamente.");
    const reader = response.body?.getReader();
    if (!reader) throw new TypeError("O navegador não oferece leitura segura do arquivo de áudio.");
    const chunks = [];
    let size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > media.byteSize) throw new TypeError("O áudio excede o tamanho autorizado.");
        chunks.push(value);
      }
    } finally { await reader.cancel().catch(() => {}); }
    if (size !== media.byteSize) throw new TypeError("O áudio chegou incompleto. Tente abrir novamente.");
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    const inspected = inspectCourseAudioBytes(bytes, { declaredMediaType: media.mediaType });
    const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
    const hash = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
    if (hash !== media.contentHash || inspected.mediaType !== media.mediaType) {
      throw new TypeError("A integridade do áudio não foi confirmada. Tente abrir novamente.");
    }
    return { blob: new Blob([bytes], { type: media.mediaType }) };
  } finally { clearTimeout(timeout); signal?.removeEventListener("abort", abort); }
}
