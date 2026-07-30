import { canonicalJsonBytes } from "./canonicalJson.js";
import { AuthoringApiError } from "./errors.js";
import { sha256Hex } from "./security.js";
import { supabaseServerHeaders } from "./supabaseEnvironment.js";

export const AUTHORING_ARTIFACT_BUCKET = "aralearn-authoring-artifacts";
export const COURSE_REVISION_BUCKET = "aralearn-course-revisions";
export const MAX_ARTIFACT_BYTES = 32 * 1024 * 1024;
const ARTIFACT_BUCKETS = new Set([
  AUTHORING_ARTIFACT_BUCKET,
  COURSE_REVISION_BUCKET
]);

function encodedPath(value) {
  return String(value).split("/").map(encodeURIComponent).join("/");
}

function artifactObjectKey(hash) {
  return `artifacts/sha256/${hash.slice(0, 2)}/${hash.slice(2, 4)}/${hash}.json`;
}

function assertArtifactBucket(bucket) {
  if (!ARTIFACT_BUCKETS.has(bucket)) {
    throw new AuthoringApiError(
      502,
      "invalid_artifact_reference",
      "O bucket do artefato não pertence ao plano de controle."
    );
  }
}

function artifactTooLarge(sizeBytes, maximumBytes = MAX_ARTIFACT_BYTES) {
  return new AuthoringApiError(
    413,
    "artifact_too_large",
    "O artefato excede o limite do plano de controle.",
    { sizeBytes, maximumBytes }
  );
}

function assertArtifactReference(reference, maximumBytes = MAX_ARTIFACT_BYTES) {
  const hash = String(reference?.hash || "");
  const bucket = String(reference?.bucket || "");
  const objectKey = String(reference?.objectKey || "");
  assertArtifactBucket(bucket);
  if (!/^[a-f0-9]{64}$/u.test(hash)
      || objectKey !== artifactObjectKey(hash)
      || (reference?.sizeBytes != null && (
        !Number.isSafeInteger(Number(reference.sizeBytes))
        || Number(reference.sizeBytes) < 1
      ))) {
    throw new AuthoringApiError(
      502,
      "invalid_artifact_reference",
      "A referência do artefato é inválida."
    );
  }
  if (reference?.sizeBytes != null
      && Number(reference.sizeBytes) > maximumBytes) {
    throw artifactTooLarge(Number(reference.sizeBytes), maximumBytes);
  }
}

function directStorageUrl(supabaseUrl) {
  const url = new URL(supabaseUrl);
  if (url.hostname.endsWith(".supabase.co")) {
    const project = url.hostname.slice(0, -".supabase.co".length);
    url.hostname = `${project}.storage.supabase.co`;
  }
  return url.origin;
}

function headers(apiKey, contentType = null) {
  return {
    ...supabaseServerHeaders(apiKey, { contentType: false }),
    ...(contentType ? { "Content-Type": contentType } : {})
  };
}

function storageError(status, action) {
  if (status === 404) {
    return new AuthoringApiError(404, "artifact_not_found", "O artefato solicitado não existe.");
  }
  if (status === 413) {
    return new AuthoringApiError(
      413,
      "artifact_too_large",
      "O Storage recusou o artefato por tamanho."
    );
  }
  return new AuthoringApiError(
    status === 429 ? 429 : 503,
    status === 429 ? "storage_rate_limited" : "storage_unavailable",
    `O Storage não concluiu a operação de ${action}.`
  );
}

export class ArtifactStore {
  constructor({
    supabaseUrl,
    serverApiKey,
    fetchImpl = globalThis.fetch,
    maxArtifactBytes = MAX_ARTIFACT_BYTES,
    downloadConcurrency = 4,
    requestTimeoutMs = 15_000
  }) {
    this.supabaseUrl = String(supabaseUrl || "").replace(/\/+$/u, "");
    this.serverApiKey = String(serverApiKey || "");
    this.storageUrl = directStorageUrl(this.supabaseUrl);
    this.fetchImpl = fetchImpl;
    this.maxArtifactBytes = Number(maxArtifactBytes);
    this.downloadConcurrency = downloadConcurrency;
    this.requestTimeoutMs = requestTimeoutMs;
    if (!Number.isSafeInteger(this.maxArtifactBytes)
        || this.maxArtifactBytes < 1
        || this.maxArtifactBytes > MAX_ARTIFACT_BYTES) {
      throw new TypeError(`maxArtifactBytes deve ficar entre 1 e ${MAX_ARTIFACT_BYTES}.`);
    }
  }

  async #request(url, init, { deadlineAt = null, consume = null } = {}) {
    const remaining = deadlineAt == null
      ? this.requestTimeoutMs
      : deadlineAt - Date.now();
    if (remaining <= 0) {
      throw new AuthoringApiError(
        503,
        "artifact_timeout",
        "O prazo da operação no Storage terminou."
      );
    }
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      Math.max(1, Math.min(this.requestTimeoutMs, remaining))
    );
    try {
      const response = await this.fetchImpl(url, { ...init, signal: controller.signal });
      return typeof consume === "function" ? await consume(response) : response;
    } catch (error) {
      if (error instanceof AuthoringApiError) throw error;
      throw new AuthoringApiError(
        503,
        controller.signal.aborted ? "artifact_timeout" : "storage_unavailable",
        controller.signal.aborted
          ? "O Storage não respondeu dentro do prazo."
          : "Não foi possível alcançar o Storage."
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  async #objectExists(bucket, objectKey, { deadlineAt = null } = {}) {
    const response = await this.#request(
      `${this.supabaseUrl}/storage/v1/object/${encodeURIComponent(bucket)}/${encodedPath(objectKey)}`,
      { method: "HEAD", headers: headers(this.serverApiKey) },
      { deadlineAt }
    );
    if (response.ok) return true;
    if (response.status === 400 || response.status === 404) return false;
    throw storageError(response.status, "consulta");
  }

  async #standardUpload(bytes, { bucket, objectKey, mediaType, deadlineAt }) {
    const response = await this.#request(
      `${this.supabaseUrl}/storage/v1/object/${encodeURIComponent(bucket)}/${encodedPath(objectKey)}`,
      {
        method: "POST",
        headers: {
          ...headers(this.serverApiKey, mediaType),
          "x-upsert": "false",
          "Cache-Control": "31536000, immutable"
        },
        body: bytes
      },
      { deadlineAt }
    );
    if (response.ok) return false;
    if ((response.status === 400 || response.status === 409)
        && await this.#objectExists(bucket, objectKey, { deadlineAt })) {
      return true;
    }
    throw storageError(response.status, "gravação");
  }

  async #resumableUpload(bytes, { bucket, objectKey, mediaType, deadlineAt }) {
    const metadata = [
      ["bucketName", bucket],
      ["objectName", objectKey],
      ["contentType", mediaType],
      ["cacheControl", "31536000"]
    ].map(([key, value]) => `${key} ${btoa(value)}`).join(",");
    const created = await this.#request(
      `${this.storageUrl}/storage/v1/upload/resumable`,
      {
        method: "POST",
        headers: {
          ...headers(this.serverApiKey),
          "Tus-Resumable": "1.0.0",
          "Upload-Length": String(bytes.byteLength),
          "Upload-Metadata": metadata,
          "x-upsert": "false"
        }
      },
      { deadlineAt }
    );
    if (!created.ok) {
      if ((created.status === 400 || created.status === 409)
          && await this.#objectExists(bucket, objectKey, { deadlineAt })) {
        return true;
      }
      throw storageError(created.status, "início da gravação retomável");
    }
    const location = created.headers.get("location");
    if (!location) throw storageError(503, "início da gravação retomável");
    const parsedUploadUrl = new URL(location, this.storageUrl);
    if (parsedUploadUrl.origin !== new URL(this.storageUrl).origin
        || !parsedUploadUrl.pathname.startsWith("/storage/v1/upload/resumable")) {
      throw new AuthoringApiError(
        502,
        "invalid_resumable_upload_location",
        "O Storage devolveu um destino de gravação inválido."
      );
    }
    const uploadUrl = parsedUploadUrl.toString();
    const chunkSize = 6 * 1024 * 1024;
    let offset = 0;
    while (offset < bytes.byteLength) {
      const chunk = bytes.slice(offset, Math.min(offset + chunkSize, bytes.byteLength));
      const response = await this.#request(uploadUrl, {
        method: "PATCH",
        headers: {
          ...headers(this.serverApiKey, "application/offset+octet-stream"),
          "Tus-Resumable": "1.0.0",
          "Upload-Offset": String(offset)
        },
        body: chunk
      }, { deadlineAt });
      if (!response.ok) throw storageError(response.status, "gravação retomável");
      const nextOffset = Number(response.headers.get("upload-offset"));
      const expectedOffset = offset + chunk.byteLength;
      if (!Number.isSafeInteger(nextOffset) || nextOffset !== expectedOffset) {
        throw new AuthoringApiError(
          502,
          "artifact_upload_offset_mismatch",
          "O Storage não confirmou a gravação completa do bloco."
        );
      }
      offset = nextOffset;
    }
    return false;
  }

  async putJson(value, {
    artifactType,
    bucket = AUTHORING_ARTIFACT_BUCKET,
    mediaType = "application/json",
    deadlineAt = null
  }) {
    assertArtifactBucket(bucket);
    const bytes = canonicalJsonBytes(value);
    if (bytes.byteLength > this.maxArtifactBytes) {
      throw artifactTooLarge(bytes.byteLength, this.maxArtifactBytes);
    }
    const hash = await sha256Hex(bytes);
    const objectKey = artifactObjectKey(hash);
    const alternateBucket = bucket === AUTHORING_ARTIFACT_BUCKET
      ? COURSE_REVISION_BUCKET
      : AUTHORING_ARTIFACT_BUCKET;
    if (await this.#objectExists(alternateBucket, objectKey, { deadlineAt })) {
      return {
        hash,
        bucket: alternateBucket,
        objectKey,
        artifactType,
        mediaType,
        sizeBytes: bytes.byteLength,
        reused: true
      };
    }
    const reused = bytes.byteLength > 6 * 1024 * 1024
      ? await this.#resumableUpload(bytes, { bucket, objectKey, mediaType, deadlineAt })
      : await this.#standardUpload(bytes, { bucket, objectKey, mediaType, deadlineAt });
    return {
      hash,
      bucket,
      objectKey,
      artifactType,
      mediaType,
      sizeBytes: bytes.byteLength,
      reused
    };
  }

  async getJson(reference, { deadlineAt = null } = {}) {
    assertArtifactReference(reference, this.maxArtifactBytes);
    const maximumBytes = this.maxArtifactBytes;
    const { response, buffer } = await this.#request(
      `${this.supabaseUrl}/storage/v1/object/${encodeURIComponent(reference.bucket)}/`
        + encodedPath(reference.objectKey),
      { method: "GET", headers: headers(this.serverApiKey) },
      {
        deadlineAt,
        async consume(value) {
          const contentLength = value.headers.get("content-length");
          if (value.ok && contentLength != null && contentLength !== "") {
            const declaredBytes = Number(contentLength);
            if (!Number.isSafeInteger(declaredBytes) || declaredBytes < 0) {
              throw new AuthoringApiError(
                502,
                "invalid_artifact_length",
                "O Storage devolveu um tamanho de artefato inválido."
              );
            }
            if (declaredBytes > maximumBytes) {
              throw artifactTooLarge(declaredBytes, maximumBytes);
            }
          }
          const valueBuffer = value.ok ? await value.arrayBuffer() : null;
          if (valueBuffer?.byteLength > maximumBytes) {
            throw artifactTooLarge(valueBuffer.byteLength, maximumBytes);
          }
          return {
            response: value,
            buffer: valueBuffer
          };
        }
      }
    );
    if (!response.ok) throw storageError(response.status, "leitura");
    const bytes = new Uint8Array(buffer);
    if (reference.sizeBytes != null && bytes.byteLength !== Number(reference.sizeBytes)) {
      throw new AuthoringApiError(
        502,
        "artifact_size_mismatch",
        "O tamanho do artefato não corresponde ao registro de controle."
      );
    }
    const hash = await sha256Hex(bytes);
    if (hash !== reference.hash) {
      throw new AuthoringApiError(
        502,
        "artifact_hash_mismatch",
        "A integridade do artefato persistido não pôde ser confirmada."
      );
    }
    try {
      return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    } catch {
      throw new AuthoringApiError(
        502,
        "invalid_stored_artifact",
        "O artefato persistido não é um JSON UTF-8 válido."
      );
    }
  }

  async getManyJson(references, { deadlineAt = null } = {}) {
    const result = new Array(references.length);
    let cursor = 0;
    const worker = async () => {
      while (cursor < references.length) {
        const index = cursor;
        cursor += 1;
        result[index] = await this.getJson(references[index], { deadlineAt });
      }
    };
    await Promise.all(
      Array.from(
        { length: Math.min(this.downloadConcurrency, references.length) },
        () => worker()
      )
    );
    return result;
  }
}

export function isArtifactReference(value) {
  try {
    assertArtifactReference(value, MAX_ARTIFACT_BYTES);
    return true;
  } catch {
    return false;
  }
}
