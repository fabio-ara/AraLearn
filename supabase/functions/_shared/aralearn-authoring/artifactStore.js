import { canonicalJsonBytes } from "./canonicalJson.js";
import { AuthoringApiError } from "./errors.js";
import { sha256Hex } from "./security.js";
import { supabaseServerHeaders } from "./supabaseEnvironment.js";

export const AUTHORING_ARTIFACT_BUCKET = "aralearn-authoring-artifacts";
export const COURSE_REVISION_BUCKET = "aralearn-course-revisions";

function encodedPath(value) {
  return String(value).split("/").map(encodeURIComponent).join("/");
}

function artifactObjectKey(hash) {
  return `artifacts/sha256/${hash.slice(0, 2)}/${hash.slice(2, 4)}/${hash}.json`;
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
    maxArtifactBytes = Number.POSITIVE_INFINITY,
    downloadConcurrency = 4
  }) {
    this.supabaseUrl = String(supabaseUrl || "").replace(/\/+$/u, "");
    this.serverApiKey = String(serverApiKey || "");
    this.storageUrl = directStorageUrl(this.supabaseUrl);
    this.fetchImpl = fetchImpl;
    this.maxArtifactBytes = maxArtifactBytes;
    this.downloadConcurrency = downloadConcurrency;
  }

  async #objectExists(bucket, objectKey) {
    const response = await this.fetchImpl(
      `${this.supabaseUrl}/storage/v1/object/${encodeURIComponent(bucket)}/${encodedPath(objectKey)}`,
      { method: "HEAD", headers: headers(this.serverApiKey) }
    );
    return response.ok;
  }

  async #standardUpload(bytes, { bucket, objectKey, mediaType }) {
    const response = await this.fetchImpl(
      `${this.supabaseUrl}/storage/v1/object/${encodeURIComponent(bucket)}/${encodedPath(objectKey)}`,
      {
        method: "POST",
        headers: {
          ...headers(this.serverApiKey, mediaType),
          "x-upsert": "false",
          "Cache-Control": "31536000, immutable"
        },
        body: bytes
      }
    );
    if (response.ok) return false;
    if ((response.status === 400 || response.status === 409)
        && await this.#objectExists(bucket, objectKey)) {
      return true;
    }
    throw storageError(response.status, "gravação");
  }

  async #resumableUpload(bytes, { bucket, objectKey, mediaType }) {
    const metadata = [
      ["bucketName", bucket],
      ["objectName", objectKey],
      ["contentType", mediaType],
      ["cacheControl", "31536000"]
    ].map(([key, value]) => `${key} ${btoa(value)}`).join(",");
    const created = await this.fetchImpl(
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
      }
    );
    if (!created.ok) {
      if ((created.status === 400 || created.status === 409)
          && await this.#objectExists(bucket, objectKey)) {
        return true;
      }
      throw storageError(created.status, "início da gravação retomável");
    }
    const location = created.headers.get("location");
    if (!location) throw storageError(503, "início da gravação retomável");
    const uploadUrl = new URL(location, this.storageUrl).toString();
    const chunkSize = 6 * 1024 * 1024;
    let offset = 0;
    while (offset < bytes.byteLength) {
      const chunk = bytes.slice(offset, Math.min(offset + chunkSize, bytes.byteLength));
      const response = await this.fetchImpl(uploadUrl, {
        method: "PATCH",
        headers: {
          ...headers(this.serverApiKey, "application/offset+octet-stream"),
          "Tus-Resumable": "1.0.0",
          "Upload-Offset": String(offset)
        },
        body: chunk
      });
      if (!response.ok) throw storageError(response.status, "gravação retomável");
      offset = Number(response.headers.get("upload-offset") || offset + chunk.byteLength);
    }
    return false;
  }

  async putJson(value, {
    artifactType,
    bucket = AUTHORING_ARTIFACT_BUCKET,
    mediaType = "application/json"
  }) {
    const bytes = canonicalJsonBytes(value);
    if (Number.isFinite(this.maxArtifactBytes)
        && bytes.byteLength > this.maxArtifactBytes) {
      throw new AuthoringApiError(
        413,
        "artifact_too_large",
        "O artefato excede o limite de transporte configurado para uma única chamada.",
        { sizeBytes: bytes.byteLength, maximumBytes: this.maxArtifactBytes }
      );
    }
    const hash = await sha256Hex(bytes);
    const objectKey = artifactObjectKey(hash);
    const reused = bytes.byteLength > 6 * 1024 * 1024
      ? await this.#resumableUpload(bytes, { bucket, objectKey, mediaType })
      : await this.#standardUpload(bytes, { bucket, objectKey, mediaType });
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

  async getJson(reference) {
    const response = await this.fetchImpl(
      `${this.supabaseUrl}/storage/v1/object/${encodeURIComponent(reference.bucket)}/`
        + encodedPath(reference.objectKey),
      { method: "GET", headers: headers(this.serverApiKey) }
    );
    if (!response.ok) throw storageError(response.status, "leitura");
    const bytes = new Uint8Array(await response.arrayBuffer());
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

  async getManyJson(references) {
    const result = new Array(references.length);
    let cursor = 0;
    const worker = async () => {
      while (cursor < references.length) {
        const index = cursor;
        cursor += 1;
        result[index] = await this.getJson(references[index]);
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
  return Boolean(
    value
    && /^[a-f0-9]{64}$/u.test(String(value.hash || ""))
    && typeof value.bucket === "string"
    && typeof value.objectKey === "string"
  );
}
