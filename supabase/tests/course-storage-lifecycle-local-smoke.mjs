import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
import { createEmptyCourseSourceBibliographicMetadata, normalizeCourseSourceDocument } from "../../src/domain/courseSources.js";
import { CourseSupabaseAdapter } from "../functions/_shared/aralearn-authoring/courseSupabaseAdapter.js";

import {
  localSupabaseConfiguration,
  localSupabaseRequest,
  removeLocalUser,
  signInLocalUser
} from "../../tests/support/localSupabaseE2e.js";

const PDF_BUCKET = "course-source-pdfs";
const MEDIA_TYPE = "application/pdf";

function first(value) {
  return Array.isArray(value) && value.length === 1 ? value[0] : value;
}

function objectPath(value) {
  return String(value).split("/").map(encodeURIComponent).join("/");
}

function syntheticPdf(label) {
  return new TextEncoder().encode(
    `%PDF-1.7\n% ${label}\n1 0 obj\n<< /Type /Catalog >>\nendobj\n` +
      "startxref\n42\n%%EOF\n"
  );
}

async function rpc(config, name, parameters) {
  const result = await localSupabaseRequest(config, `/rest/v1/rpc/${name}`, {
    method: "POST",
    token: config.adminKey,
    body: parameters
  });
  assert.equal(
    result.response.status,
    200,
    `${name}: HTTP ${result.response.status}: ${JSON.stringify(result.payload)}`
  );
  return first(result.payload);
}

async function storageRequest(config, pathname, {
  method = "GET",
  body = null,
  contentType = "application/json",
  token = config.adminKey
} = {}) {
  return fetch(`${config.projectUrl}/storage/v1${pathname}`, {
    method,
    headers: {
      apikey: token === config.adminKey ? config.adminKey : config.publishableKey,
      Authorization: `Bearer ${token}`,
      ...(body === null ? {} : { "Content-Type": contentType })
    },
    body: body === null
      ? undefined
      : contentType === "application/json" ? JSON.stringify(body) : body
  });
}

async function storageObjectExists(config, storagePath) {
  const response = await storageRequest(
    config,
    `/object/info/${PDF_BUCKET}/${objectPath(storagePath)}`
  );
  assert.ok([200, 400, 404].includes(response.status), `Storage info devolveu HTTP ${response.status}.`);
  return response.status === 200;
}

async function deleteStorageObjects(config, paths) {
  if (!paths.length) return;
  const response = await storageRequest(config, `/object/${PDF_BUCKET}`, {
    method: "DELETE",
    body: { prefixes: [...new Set(paths)] }
  });
  assert.ok(response.ok, `Limpeza Storage devolveu HTTP ${response.status}.`);
}

function sourceDocument() {
  return normalizeCourseSourceDocument({
    kind: "document",
    defaultRoles: ["technical_conceptual"],
    title: "PDF descartável da prova de armazenamento",
    authors: [{ literal: "AraLearn" }],
    publicationDate: "2026-09-02",
    identifier: null,
    language: "pt-BR",
    citationMode: "manual",
    citationText: "AraLearn. PDF descartável da prova de armazenamento, 2026.",
    bibliographic: createEmptyCourseSourceBibliographicMetadata(),
    url: null,
    editionOrVersion: null,
    origin: "author_provided",
    availability: "private",
    verificationStatus: "author_verified",
    studyVisibility: "hidden"
  });
}

async function createAdministrator(config, marker) {
  const email = `storage-${marker}@example.test`;
  const password = `Storage-${marker}-Aa1!`;
  const created = await localSupabaseRequest(config, "/auth/v1/admin/users", {
    method: "POST",
    token: config.adminKey,
    body: {
      email,
      password,
      email_confirm: true,
      app_metadata: { aralearn_role: "administrator" },
      user_metadata: { test: "course-storage-lifecycle-local-smoke" }
    }
  });
  assert.equal(created.response.status, 200, JSON.stringify(created.payload));
  assert.match(created.payload?.id || "", /^[0-9a-f-]{36}$/u);
  const signedIn = await signInLocalUser(config, { email, password });
  assert.equal(signedIn.response.status, 200, JSON.stringify(signedIn.payload));
  assert.ok(signedIn.payload?.access_token);
  return { id: created.payload.id, accessToken: signedIn.payload.access_token };
}

async function ingestPdf(config, {
  actorId,
  courseId,
  courseRevision,
  sourceIntent,
  bytes,
  fileId
}) {
  const contentHash = createHash("sha256").update(bytes).digest("hex");
  const requestId = randomUUID();
  const fileIdentity = {
    fileId,
    fileName: "storage-lifecycle.pdf",
    mediaType: MEDIA_TYPE
  };
  const prepared = await rpc(config, "prepare_course_source_pdf_ingestion_for_actor_v1", {
    p_actor_id: actorId,
    p_course_id: courseId,
    p_expected_revision: courseRevision,
    p_source_intent: sourceIntent,
    p_content_hash: contentHash,
    p_byte_size: bytes.byteLength,
    p_media_type: MEDIA_TYPE,
    p_request_id: requestId
  });
  if (prepared.uploadRequired) {
    const uploaded = await storageRequest(
      config,
      `/object/${PDF_BUCKET}/${objectPath(prepared.attachment.storagePath)}`,
      { method: "POST", body: bytes, contentType: MEDIA_TYPE }
    );
    assert.ok(uploaded.ok, `Upload Storage devolveu HTTP ${uploaded.status}.`);
  }
  const result = await rpc(config, "ingest_course_source_pdf_for_actor_v1", {
    p_actor_id: actorId,
    p_course_id: courseId,
    p_expected_revision: courseRevision,
    p_source_intent: sourceIntent,
    p_attachment: prepared.attachment,
    p_file_identity: fileIdentity,
    p_channel: "application",
    p_request_id: requestId
  });
  assert.equal(result.stored, true);
  return result;
}

async function removePdf(config, {
  actorId,
  courseId,
  courseRevision,
  sourceId,
  sourceRevision,
  contentHash
}) {
  const requestId = randomUUID();
  const removed = await rpc(config, "remove_course_source_pdf_for_actor_v1", {
    p_actor_id: actorId,
    p_course_id: courseId,
    p_expected_revision: courseRevision,
    p_command: {
      type: "remove_pdf",
      sourceId,
      expectedSourceRevision: sourceRevision,
      contentHash
    },
    p_channel: "application",
    p_request_id: requestId
  });
  const claim = await rpc(
    config,
    "claim_pending_course_source_pdf_delete_for_source_for_actor_v1",
    {
      p_actor_id: actorId,
      p_course_id: courseId,
      p_source_id: sourceId
    }
  );
  if (claim !== null) {
    assert.equal(claim.requestId, requestId);
    await deleteStorageObjects(config, [claim.storagePath]);
    assert.equal(await rpc(config, "complete_course_source_pdf_delete_for_actor_v1", {
      p_actor_id: actorId,
      p_course_id: courseId,
      p_request_id: claim.requestId,
      p_storage_path: claim.storagePath
    }), true);
  }
  return removed;
}

async function downloadPdf(config, {
  actorId,
  courseId,
  courseRevision,
  sourceId,
  sourceRevision,
  contentHash
}) {
  const descriptor = await rpc(config, "get_course_source_pdf_download_for_actor_v1", {
    p_actor_id: actorId,
    p_course_id: courseId,
    p_expected_course_revision: courseRevision,
    p_source_id: sourceId,
    p_source_revision: sourceRevision,
    p_content_hash: contentHash
  });
  const signed = await storageRequest(
    config,
    `/object/sign/${PDF_BUCKET}/${objectPath(descriptor.attachment.storagePath)}`,
    { method: "POST", body: { expiresIn: 60 } }
  );
  assert.equal(signed.status, 200);
  const payload = await signed.json();
  const signedUrl = String(payload.signedURL || "").startsWith("http")
    ? payload.signedURL
    : `${config.projectUrl}/storage/v1${payload.signedURL}`;
  assert.match(signedUrl, /[?&]token=/u);
  return fetch(signedUrl);
}

async function assertDownloadRejected(config, parameters) {
  const result = await localSupabaseRequest(
    config,
    "/rest/v1/rpc/get_course_source_pdf_download_for_actor_v1",
    { method: "POST", token: config.adminKey, body: parameters }
  );
  assert.equal(result.response.status, 404, JSON.stringify(result.payload));
}

export async function runLocalCourseStorageLifecycle(environment = process.env) {
  const config = localSupabaseConfiguration(environment);
  const marker = randomUUID();
  const cleanupPaths = new Set();
  let userId = null;
  let courseId = null;
  let sourceId = randomUUID();
  let sourceRevision = 1;
  let revision = null;
  let attachment = null;
  try {
    const user = await createAdministrator(config, marker);
    userId = user.id;
    const course = await rpc(config, "create_course_for_actor_v1", {
      p_actor_id: userId,
      p_title: `Curso descartável de armazenamento ${marker.slice(0, 8)}`,
      p_objective: "Provar vínculo, remoção, reativação e coleta segura de um PDF.",
      p_request_id: randomUUID()
    });
    courseId = course.courseId;
    revision = course.revision;

    const bytes = syntheticPdf(marker);
    const revisionBeforeIngestion = revision;
    const sourceIntent = {
      mode: "save",
      sourceId,
      expectedSourceRevision: 0,
      source: sourceDocument()
    };
    const fileId = `local-storage-${marker}`;
    const ingested = await ingestPdf(config, {
      actorId: userId,
      courseId,
      courseRevision: revision,
      sourceIntent,
      bytes,
      fileId
    });
    assert.equal(ingested.courseRevision, revisionBeforeIngestion + 1);
    revision = ingested.courseRevision;
    sourceRevision = ingested.source.sourceRevision;
    attachment = ingested.attachment;
    cleanupPaths.add(attachment.storagePath);
    assert.equal(await storageObjectExists(config, attachment.storagePath), true);
    const replay = await rpc(config, "get_course_source_pdf_ingestion_receipt_for_actor_v1", {
      p_actor_id: userId,
      p_course_id: courseId,
      p_expected_revision: revisionBeforeIngestion,
      p_source_intent: sourceIntent,
      p_file_identity: {
        fileId,
        fileName: "storage-lifecycle.pdf",
        mediaType: MEDIA_TYPE
      },
      p_channel: "application",
      p_request_id: ingested.requestId
    });
    assert.equal(replay.idempotent, true);
    assert.equal(replay.courseRevision, revision);
    assert.equal(replay.source.sourceId, sourceId);
    const sourcesAfterReplay = await rpc(config, "get_owned_course_sources_for_actor_v1", {
      p_actor_id: userId,
      p_course_id: courseId,
      p_expected_revision: revision,
      p_mode: "catalog",
      p_source_id: null,
      p_target_kind: null,
      p_target_id: null,
      p_cursor: null,
      p_limit: 24
    });
    assert.equal(sourcesAfterReplay.contract, "aralearn.course-sources.v3");
    assert.equal(sourcesAfterReplay.items.filter((item) => item.sourceId === sourceId).length, 1);
    const activeDownload = await downloadPdf(config, {
      actorId: userId,
      courseId,
      courseRevision: revision,
      sourceId,
      sourceRevision,
      contentHash: attachment.contentHash
    });
    assert.equal(activeDownload.status, 200);
    assert.deepEqual(new Uint8Array(await activeDownload.arrayBuffer()), bytes);

    const removed = await removePdf(config, {
      actorId: userId,
      courseId,
      courseRevision: revision,
      sourceId,
      sourceRevision,
      contentHash: attachment.contentHash
    });
    revision = removed.courseRevision;
    assert.equal(removed.changed, true);
    assert.equal(await storageObjectExists(config, attachment.storagePath), false);
    await assertDownloadRejected(config, {
      p_actor_id: userId,
      p_course_id: courseId,
      p_expected_course_revision: revision,
      p_source_id: sourceId,
      p_source_revision: sourceRevision,
      p_content_hash: attachment.contentHash
    });

    const reattached = await ingestPdf(config, {
      actorId: userId,
      courseId,
      courseRevision: revision,
      sourceIntent: { mode: "existing", sourceId, sourceRevision },
      bytes,
      fileId: `local-storage-reattach-${marker}`
    });
    revision = reattached.courseRevision;
    assert.equal(reattached.attachment.storagePath, attachment.storagePath);
    assert.equal(await storageObjectExists(config, attachment.storagePath), true);
    const reactivatedDownload = await downloadPdf(config, {
      actorId: userId,
      courseId,
      courseRevision: revision,
      sourceId,
      sourceRevision,
      contentHash: attachment.contentHash
    });
    assert.equal(reactivatedDownload.status, 200);
    assert.deepEqual(new Uint8Array(await reactivatedDownload.arrayBuffer()), bytes);

    const orphanBytes = syntheticPdf(`orphan-${marker}`);
    const orphanHash = createHash("sha256").update(orphanBytes).digest("hex");
    const orphanPath = `${randomUUID()}/${orphanHash}.pdf`;
    cleanupPaths.add(orphanPath);
    const uploadedOrphan = await storageRequest(
      config,
      `/object/${PDF_BUCKET}/${objectPath(orphanPath)}`,
      { method: "POST", body: orphanBytes, contentType: MEDIA_TYPE }
    );
    assert.ok(uploadedOrphan.ok, `Upload órfão devolveu HTTP ${uploadedOrphan.status}.`);
    const maintenance = await rpc(config, "get_current_maintenance_for_actor_v1", {
      p_actor_id: userId,
      p_limit: 100
    });
    const orphan = maintenance.inventory.items.find((item) =>
      item.classification === "pdf_course_missing" && item.objectPath === orphanPath);
    assert.ok(orphan, "A manutenção não classificou o PDF órfão criado pela Storage API.");
    const authorization = await rpc(config, "authorize_current_orphan_removal_for_actor_v1", {
      p_actor_id: userId,
      p_classification: orphan.classification,
      p_object_path: orphan.objectPath,
      p_confirmed: true
    });
    assert.equal(authorization.authorized, true);
    await deleteStorageObjects(config, [authorization.objectPath]);
    assert.equal(await storageObjectExists(config, orphanPath), false);
    cleanupPaths.delete(orphanPath);

    return Object.freeze({
      contract: "aralearn.course-storage-lifecycle-proof.v1",
      active: true,
      removed: true,
      reactivated: true,
      orphanCollected: true,
      storageMutationPath: "storage-api"
    });
  } finally {
    if (userId && courseId && attachment && revision) {
      const removal = await removePdf(config, {
        actorId: userId,
        courseId,
        courseRevision: revision,
        sourceId,
        sourceRevision,
        contentHash: attachment.contentHash
      });
      if (removal) revision = removal.courseRevision;
    }
    if (userId && courseId) {
      const adapter = new CourseSupabaseAdapter({ supabaseUrl: config.projectUrl,
        serverApiKey: config.adminKey, publishableKey: config.publishableKey,
        publicAppUrl: "http://127.0.0.1:4182" });
      const completion = await adapter.maintainCourse({ principal: { actorId: userId },
        courseId, operation: "delete_owned_course", confirmed: true, requestId: randomUUID() });
      assert.equal(completion.fileCleanupPending, false, "Preserve a conta enquanto há arquivos pendentes.");
    }
    await deleteStorageObjects(config, [...cleanupPaths]);
    if (userId) await removeLocalUser(config, userId);
  }
}

const executedDirectly = process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href;
if (executedDirectly) {
  const result = await runLocalCourseStorageLifecycle();
  process.stdout.write(`${JSON.stringify(result)}\n`);
}
