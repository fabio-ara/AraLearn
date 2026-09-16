import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
import { createEmptyCourseSourceBibliographicMetadata, normalizeCourseSourceDocument } from "../../src/domain/courseSources.js";

import {
  localSupabaseConfiguration,
  localSupabaseRequest,
  createConfirmedLocalUser, createLocalFixtureClient, recordLocalFixtureFiles, verifyLocalFixtureFilesAbsent,
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
  if (response.status === 400) {
    const error = await response.json();
    assert.ok(String(error.statusCode) === "404" || error.message === "Object not found",
      "Storage devolveu erro sem comprovar ausência do objeto registrado.");
  }
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

async function createAdministrator(config, marker, onCreated) {
  const email = `storage-${marker}@example.test`;
  const password = `Storage-${marker}-Aa1!`;
  const created = await createConfirmedLocalUser(config, {
      email,
      password,
      appMetadata: { aralearn_role: "administrator" },
      marker: "course-storage-lifecycle-local-smoke"
  });
  assert.equal(created.response.status, 200, JSON.stringify(created.payload));
  assert.match(created.payload?.id || "", /^[0-9a-f-]{36}$/u);
  onCreated(created.payload.id);
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
  recordLocalFixtureFiles(config, { ownerId: actorId, courseId,
    files: [{ kind: "pdf", contentHash, storagePath: prepared.attachment.storagePath }] });
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

async function proveObservationRetention(config, { actorId, courseId, revision, sourceId, sourceRevision, attachment, bytes, onRevision }) {
  const paragraph = (id, text) => ({ id, package: "aralearn.resource.paragraph", version: "1.0.0", data: { text } });
  const text = "A referência sustenta esta explicação sintética.";
  const composition = await rpc(config, "commit_course_composition_for_actor_v1", {
    p_actor_id: actorId, p_course_id: courseId, p_expected_revision: revision,
    p_upserts: [
      { entityType: "module", entityId: "retention-module", parentType: null, parentId: null, position: 0, content: { title: "Retenção" } },
      { entityType: "lesson", entityId: "retention-lesson", parentType: "module", parentId: "retention-module", position: 0, content: { title: "Base compartilhada" } },
      { entityType: "microsequence", entityId: "retention-micro", parentType: "lesson", parentId: "retention-lesson", position: 0,
        content: { title: "Explicação", dependsOn: [], explanation: { title: "Base observada", content: [paragraph("base", text)] } } },
      { entityType: "study_unit", entityId: "retention-unit", parentType: "microsequence", parentId: "retention-micro", position: 1,
        content: { title: "Unidade observada", role: "theory", content: [paragraph("body", text)], response: null, feedback: [], topics: [] } }
    ], p_deletes: [], p_source_attribution_applications: [
      { targetKind: "microsequence_explanation", targetId: "retention-micro", sourceLinks: [] },
      { studyUnitId: "retention-unit", sourceLinks: [] }
    ], p_request_id: randomUUID()
  });
  revision = composition.revision; onRevision(revision);
  const sourceCommand = async command => {
    const result = await rpc(config, "execute_course_source_command_for_actor_v1", { p_actor_id: actorId, p_course_id: courseId,
      p_expected_revision: revision, p_command: command, p_channel: "application", p_request_id: randomUUID() });
    revision = result.courseRevision; onRevision(revision); return result;
  };
  await sourceCommand({ type: "save_anchor", anchorId: "retention-anchor", sourceId, sourceRevision, expectedAnchorRevision: 0,
    selector: { kind: "page_range", startPage: 1, endPage: 1 }, contentHash: attachment.contentHash,
    humanLocator: "Página 1", verificationExcerpt: text });
  const targets = [{ kind: "study_unit", id: "retention-unit" }, { kind: "microsequence_explanation", id: "retention-micro" }];
  for (const target of targets) await sourceCommand({ type: "set_target_sources", targetKind: target.kind, targetId: target.id,
    expectedTargetVersion: 1, sourceLinks: [{ linkId: `link-${target.id}`, sourceId, relation: "supported_by", roles: ["technical_conceptual"],
      anchors: [{ anchorId: "retention-anchor" }], occurrences: [{ occurrenceId: `occurrence-${target.id}`, slot: "content",
        resourceId: target.kind === "study_unit" ? "body" : "base", path: "text", quote: text, prefix: null, suffix: null }] }] });
  const annotationCommand = (command, requestId, courseRevision = null) => rpc(config, "execute_course_anchored_annotation_command_for_actor_v1", {
    p_actor_id: actorId, p_course_id: courseId, p_expected_course_revision: courseRevision, p_command: command,
    p_channel: "authoring_interface", p_request_id: requestId
  });
  const comparison = (note, target) => rpc(config, "get_course_observation_comparison_for_actor_v1", {
    p_actor_id: actorId, p_course_id: courseId, p_annotation_id: note.annotationId, p_target_kind: target.kind, p_target_id: target.id,
    p_expected_annotation_version: note.annotationVersion, p_expected_target_set_version: note.targetSetVersion
  });
  // A new attachment changes the observed basis even when prose is unchanged.
  const detached = await removePdf(config, { actorId, courseId, courseRevision: revision, sourceId, sourceRevision, contentHash: attachment.contentHash });
  revision = detached.courseRevision; onRevision(revision);
  const earlyNote = (await annotationCommand({ type: "create_anchored_annotation", annotationId: randomUUID(), target: targets[0],
    targets: [targets[0]], rawText: "Observação anterior ao arquivo.", category: null, capturedAt: null, briefSummary: null }, randomUUID(), revision)).annotation;
  const beforeAttachment = await comparison(earlyNote, targets[0]);
  const linkedAgain = await ingestPdf(config, { actorId, courseId, courseRevision: revision,
    sourceIntent: { mode: "existing", sourceId, sourceRevision }, bytes, fileId: `basis-attachment-${randomUUID()}` });
  revision = linkedAgain.courseRevision; onRevision(revision);
  const afterAttachment = await comparison(earlyNote, targets[0]);
  assert.deepEqual(afterAttachment.basis, beforeAttachment.basis, "Anexar PDF não pode fabricar o arquivo na base anterior.");
  assert.notEqual(afterAttachment.current.hash, afterAttachment.basis.hash, "Uma nova observação precisa capturar o PDF recém-anexado.");
  const notes = [];
  for (let index = 0; index < 2; index++) notes.push((await annotationCommand({ type: "create_anchored_annotation", annotationId: randomUUID(),
    target: targets[0], targets, rawText: `Conferir os dois objetos: intenção ${index + 1}.`, category: null, capturedAt: null, briefSummary: null },
  randomUUID(), revision)).annotation);
  assert.equal((await comparison(notes[0], targets[0])).basis.hash, afterAttachment.current.hash);
  await annotationCommand({ type: "decide_anchored_annotation", annotationId: earlyNote.annotationId,
    expectedAnnotationVersion: earlyNote.annotationVersion, expectedTargetSetVersion: earlyNote.targetSetVersion,
    decision: "cancel", reason: "Intenção anterior encerrada neste cenário sintético.",
    targets: [{ ...targets[0], expectedBasisHash: afterAttachment.current.hash }] }, randomUUID());
  const removed = await removePdf(config, { actorId, courseId, courseRevision: revision, sourceId, sourceRevision, contentHash: attachment.contentHash });
  revision = removed.courseRevision; onRevision(revision);
  assert.equal(await storageObjectExists(config, attachment.storagePath), true, "Bases pendentes devem reter o PDF retirado da fonte.");
  const retainedDownload = await storageRequest(config, `/object/${PDF_BUCKET}/${objectPath(attachment.storagePath)}`);
  assert.equal(retainedDownload.status, 200);
  assert.deepEqual(new Uint8Array(await retainedDownload.arrayBuffer()), bytes);
  const inspected = new Map();
  for (const target of targets) {
    const state = await rpc(config, "get_course_ai_inspection_for_actor_v1", {
      p_actor_id: actorId, p_course_id: courseId, p_target_kind: target.kind, p_target_id: target.id });
    const result = await rpc(config, "record_course_ai_inspection_for_actor_v1", {
      p_actor_id: actorId, p_course_id: courseId, p_target_kind: target.kind, p_target_id: target.id,
      p_expected_basis_hash: state.basisHash, p_report: { outcome: "consistent", summary: "Base sintética conferida.", findings: [] }, p_request_id: randomUUID() });
    revision = result.courseRevision; onRevision(revision);
    inspected.set(target.id, (await comparison(notes[0], target)).current.hash);
  }
  const approval = (note, selected) => ({ type: "decide_anchored_annotation", annotationId: note.annotationId,
    expectedAnnotationVersion: note.annotationVersion, expectedTargetSetVersion: note.targetSetVersion, decision: "approve", reason: null,
    targets: selected.map(target => ({ ...target, expectedBasisHash: inspected.get(target.id) })) });
  const first = await annotationCommand(approval(notes[0], [targets[0]]), randomUUID());
  assert.equal(await storageObjectExists(config, attachment.storagePath), true, "Aprovação parcial deve preservar outras incidências.");
  await annotationCommand(approval(notes[1], targets), randomUUID());
  assert.equal(await storageObjectExists(config, attachment.storagePath), true, "A outra observação ainda conserva sua base.");
  const finalCommand = approval(first.annotation, [targets[1]]), finalRequest = randomUUID();
  const finalReceipt = await annotationCommand(finalCommand, finalRequest);
  const claimInput = { p_actor_id: actorId, p_course_id: courseId, p_source_id: "observation-base" };
  const claim = await rpc(config, "claim_pending_course_source_pdf_delete_for_source_for_actor_v1", claimInput);
  assert.equal(claim.storagePath, attachment.storagePath);
  // The first worker stops after claiming, before deleting any bytes. A new
  // worker resumes the same intent; no artificial timeout or database edit.
  const resumed = await rpc(config, "claim_pending_course_source_pdf_delete_for_source_for_actor_v1", claimInput);
  assert.deepEqual(resumed, claim);
  await deleteStorageObjects(config, [resumed.storagePath]);
  assert.equal(await rpc(config, "complete_course_source_pdf_delete_for_actor_v1", { p_actor_id: actorId, p_course_id: courseId,
    p_request_id: resumed.requestId, p_storage_path: resumed.storagePath }), true);
  const repeated = await annotationCommand(finalCommand, finalRequest);
  assert.equal(repeated.annotationVersion, finalReceipt.annotationVersion);
  assert.equal(repeated.idempotent, true);
  const stale = await localSupabaseRequest(config, "/rest/v1/rpc/execute_course_anchored_annotation_command_for_actor_v1", {
    method: "POST", token: config.adminKey, body: { p_actor_id: actorId, p_course_id: courseId, p_expected_course_revision: null,
      p_command: finalCommand, p_channel: "authoring_interface", p_request_id: randomUUID() } });
  assert.equal(stale.response.status, 409, "Uma cópia antiga não pode recriar incidências ou bases removidas.");
  assert.equal(await rpc(config, "claim_pending_course_source_pdf_delete_for_source_for_actor_v1", claimInput), null);
  assert.equal(await storageObjectExists(config, attachment.storagePath), false);
  return { revision, proof: { attachmentCreatesDistinctBasis: true, sharedBasesRetained: true, partialApprovalPreserved: true, lastApprovalReleased: true,
    interruptedCleanupResumed: true, retryAndStaleRequestCannotResurrect: true } };
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
  let ownerClient;
  let userId = null;
  let courseId = null;
  let sourceId = randomUUID();
  let sourceRevision = 1;
  let revision = null;
  let attachment = null;
  try {
    const user = await createAdministrator(config, marker, id => { userId = id; });
    userId = user.id;
    ownerClient = await createLocalFixtureClient(config, { ownerId: userId, accessToken: user.accessToken,
      origin: environment.ARALEARN_LOCAL_APPLICATION_ORIGIN });
    const course = await ownerClient.createCourse({
      title: `Curso descartável de armazenamento ${marker.slice(0, 8)}`,
      objective: "Provar vínculo, remoção, reativação e coleta segura de um PDF.",
      requestId: randomUUID()
    });
    courseId = course.courseId;
    revision = course.revision;

    const bytes = syntheticPdf(marker);
    recordLocalFixtureFiles(config, { ownerId: userId, courseId,
      files: [{ kind: "pdf", contentHash: createHash("sha256").update(bytes).digest("hex") }] });
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
    recordLocalFixtureFiles(config, { ownerId: userId, courseId,
      files: [{ kind: "pdf", contentHash: attachment.contentHash, storagePath: attachment.storagePath }] });
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

    const observationRetention = await proveObservationRetention(config, {
      actorId: userId, courseId, revision, sourceId, sourceRevision, attachment, bytes, onRevision: value => { revision = value; } });
    revision = observationRetention.revision;

    const orphanBytes = syntheticPdf(`orphan-${marker}`);
    const orphanHash = createHash("sha256").update(orphanBytes).digest("hex");
    const orphanPath = `${randomUUID()}/${orphanHash}.pdf`;
    const orphanFile = { kind: "orphan_pdf", contentHash: orphanHash, storagePath: orphanPath };
    recordLocalFixtureFiles(config, { ownerId: userId, files: [orphanFile] });
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
    await verifyLocalFixtureFilesAbsent(config, { ownerId: userId, files: [orphanFile],
      verifyAbsent: async file => !await storageObjectExists(config, file.storagePath) });

    return Object.freeze({
      contract: "aralearn.course-storage-lifecycle-proof.v1",
      active: true,
      removed: true,
      reactivated: true,
      orphanCollected: true,
      observationRetention: observationRetention.proof,
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
      const completion = await ownerClient.maintainCourse({
        courseId, operation: "delete_owned_course", confirmed: true, requestId: randomUUID() });
      assert.equal(completion.fileCleanupPending, false, "Preserve a conta enquanto há arquivos pendentes.");
    }
    if (userId) await removeLocalUser(config, userId);
  }
}

const executedDirectly = process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href;
if (executedDirectly) {
  const result = await runLocalCourseStorageLifecycle();
  process.stdout.write(`${JSON.stringify(result)}\n`);
}
