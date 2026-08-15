import { prepareCourseDocument } from "./canonical.js";
import { canonicalJsonStringify } from "./canonicalJson.js";
import { AuthoringApiError } from "./errors.js";
import {
  ArtifactStore,
  COURSE_REVISION_BUCKET,
  MAX_ARTIFACT_BYTES
} from "./artifactStore.js";
import {
  cloneWorkspaceEntityWithFreshIds,
  copyWorkspaceEntity,
  createWorkspaceStructure,
  saveWorkspaceCard,
  saveWorkspaceMicrosequenceCards,
  updateWorkspaceEntityMetadata
} from "./workspaceIncremental.js";
import {
  buildWorkspaceOutlineFromRows,
  composeWorkspaceDocument,
  diffWorkspaceDocument,
  flattenWorkspaceDocument
} from "./workspaceParts.js";
import { sha256Hex } from "./security.js";
import {
  applyContinuityStateOperation,
  buildWorkspaceResumeProjection,
  CONTINUITY_FINDING_OPERATIONS,
  CONTINUITY_STATE_OPERATIONS,
  normalizeContinuityState,
  validateFindingOperation
} from "./workspaceContinuity.js";
import {
  buildMicrotheoryReview,
  buildWorkspaceOutline,
  createEmptyAuthoringWorkspace,
  deleteWorkspaceEntity,
  demoteCourseToModule,
  attachWorkspaceEntity,
  mergeWorkspaceMicrosequences,
  moveWorkspaceEntity,
  promoteModuleToCourse,
  readWorkspaceEntity,
  renameWorkspaceEntity,
  selectCourseDocument,
  splitWorkspaceMicrosequence
} from "./workspaceModel.js";

function first(value) {
  return Array.isArray(value) ? value[0] : value;
}

const STABLE_BRIEF_MAX_CHARACTERS = 16_000;
const STABLE_BRIEF_MAX_BYTES = 16 * 1_024;

function stableBrief(value, { allowEmpty = false } = {}) {
  const result = typeof value === "string" ? value.trim() : "";
  if ((!allowEmpty && !result)
      || result.length > STABLE_BRIEF_MAX_CHARACTERS
      || new TextEncoder().encode(result).byteLength > STABLE_BRIEF_MAX_BYTES) {
    throw new AuthoringApiError(
      422,
      "authoring_brief_too_large",
      "O contexto estável deve ocupar no máximo 16 KiB em UTF-8."
    );
  }
  return result;
}

function principalArgs(principal) {
  return { p_owner_id: principal.actorId };
}

function assertCatalogBatchPrincipal(principal) {
  if (
    principal?.authenticationKind !== "administrative_batch"
    || !Array.isArray(principal?.scopes)
    || !principal.scopes.includes("*")
  ) {
    throw new AuthoringApiError(
      403,
      "catalog_batch_only",
      "A materialização canônica é exclusiva da importação administrativa do catálogo."
    );
  }
}

function projectCounts(document) {
  const course = document.courses[0];
  const modules = course.modules || [];
  const lessons = modules.flatMap((moduleValue) => moduleValue.lessons || []);
  const microsequences = lessons.flatMap((lesson) => lesson.microsequences || []);
  return {
    moduleCount: modules.length,
    lessonCount: lessons.length,
    microsequenceCount: microsequences.length,
    cardCount: microsequences.reduce(
      (total, microsequence) => total + (microsequence.cards || []).length,
      0
    )
  };
}

function workspaceCardSources(document) {
  const locations = new Map();
  for (const [courseIndex, course] of (document.courses || []).entries()) {
    for (const [moduleIndex, moduleValue] of (course.modules || []).entries()) {
      for (const [lessonIndex, lesson] of (moduleValue.lessons || []).entries()) {
        for (const [microsequenceIndex, microsequence] of
          (lesson.microsequences || []).entries()) {
          for (const [cardIndex, card] of (microsequence.cards || []).entries()) {
            for (const [sourceIndex, sourceId] of (card.sources || []).entries()) {
              if (!locations.has(sourceId)) locations.set(sourceId, []);
              locations.get(sourceId).push(
                `courses[${courseIndex}].modules[${moduleIndex}]`
                + `.lessons[${lessonIndex}].microsequences[${microsequenceIndex}]`
                + `.cards[${cardIndex}].sources[${sourceIndex}]`
              );
            }
          }
        }
      }
    }
  }
  return locations;
}

function briefSourceIds(brief) {
  const ids = new Set();
  const declaration = /\[source:([^\]\r\n]{1,240})\]/gu;
  for (const match of String(brief || "").matchAll(declaration)) {
    const sourceId = match[1].trim();
    if (sourceId) ids.add(sourceId);
  }
  return ids;
}

function assertIntroducedSourcesAreAuthorized(currentDocument, nextDocument, brief) {
  const current = workspaceCardSources(currentDocument);
  const authorized = briefSourceIds(brief);
  const introduced = [...workspaceCardSources(nextDocument)]
    .filter(([sourceId]) => !current.has(sourceId) && !authorized.has(sourceId));
  if (!introduced.length) return;
  const errors = introduced.flatMap(([sourceId, paths]) =>
    paths.map((path) => ({
      path,
      message: `A fonte "${sourceId}" não foi declarada no contexto do workspace.`,
      reason: "source_not_declared",
      rule: "authorized_workspace_source"
    }))
  );
  throw new AuthoringApiError(
    422,
    "workspace_source_unauthorized",
    "Todo novo ID usado em card.sources deve estar declarado como [source:id] no contexto do workspace.",
    {
      sourceIds: introduced.map(([sourceId]) => sourceId),
      errors
    }
  );
}

function viewContent(document, {
  view,
  entityType = null,
  entityPath = null,
  includeDescendants = true,
  errorCode = "invalid_workspace_view"
}) {
  if (view === "outline") return buildWorkspaceOutline(document);
  if (view === "microtheories") {
    if (!Array.isArray(entityPath) || ![3, 4].includes(entityPath.length)) {
      throw new AuthoringApiError(
        422,
        "microtheory_scope_required",
        "Informe entityPath de uma lição ou microssequência para revisar microteorias."
      );
    }
    return buildMicrotheoryReview(document, entityPath);
  }
  if (view === "entity") {
    return readWorkspaceEntity(document, entityType, entityPath, { includeDescendants });
  }
  if (view === "document") return document;
  throw new AuthoringApiError(422, errorCode, "Visualização de conteúdo inválida.");
}

function withoutEntities(reference) {
  const control = { ...reference };
  delete control.entities;
  return control;
}

const FINDING_RPC_OPERATIONS = Object.freeze({
  record_finding: "create",
  decide_finding: "decide",
  link_finding_correction: "link_correction",
  verify_finding: "verify",
  delete_finding: "delete"
});

function findingRpcPayload(operation, value) {
  if (operation === "record_finding") {
    const { summary, ...payload } = value;
    return { ...payload, body: summary };
  }
  if (operation === "decide_finding") {
    return {
      findingId: value.observationId,
      decision: value.decision === "approved" ? "approve" : "reject"
    };
  }
  if (operation === "link_finding_correction") {
    return {
      findingId: value.observationId,
      correctionRequestId: value.correctionRequestId
    };
  }
  if (operation === "verify_finding") {
    return {
      findingId: value.observationId,
      outcome: value.outcome,
      verification: value.note
    };
  }
  return { findingId: value.observationId };
}

function findingMutationProjection(value, operation) {
  return {
    workspaceId: value.workspaceId,
    revision: value.revision,
    observationId: value.observationId || value.findingId,
    findingOperation: operation,
    status: value.status,
    updatedAt: value.updatedAt,
    idempotent: Boolean(value.idempotent)
  };
}

const CONTENT_MUTATION_OPERATIONS = new Set([
  "save_microsequence_cards", "save_card"
]);
const SUMMARY_PATH_ITEM_LIMIT = 20;
const SUMMARY_RESOURCE_TARGET_LIMIT = 10;
const SUMMARY_PATH_BYTES = 10 * 1_024;
const SUMMARY_EVIDENCE_BYTES = 6 * 1_024;

function cardResourceTargetSnapshots(card) {
  if (!card || typeof card !== "object" || Array.isArray(card)) return new Map();
  const snapshots = new Map();
  (card.content || []).forEach((instance, position) => snapshots.set(`content:${instance.id}`, { position, instance }));
  if (card.response) snapshots.set(`response:${card.response.id}`, { position: 0, instance: card.response });
  (card.feedback || []).forEach((instance, position) => snapshots.set(`feedback:${instance.id}`, { position, instance }));
  return snapshots;
}

function cardShellSnapshot(card) {
  if (!card || typeof card !== "object" || Array.isArray(card)) return null;
  const resourceFields = new Set(["content", "response", "feedback"]);
  return Object.fromEntries(Object.entries(card).filter(([fieldName]) =>
    !resourceFields.has(fieldName)));
}

function boundedSummaryItems(items, maxItems, maxBytes) {
  const accepted = [];
  for (const item of items) {
    if (accepted.length >= maxItems) break;
    const candidate = [...accepted, item];
    if (new TextEncoder().encode(JSON.stringify(candidate)).byteLength
        > maxBytes) break;
    accepted.push(item);
  }
  return {
    items: accepted,
    truncated: accepted.length < items.length
  };
}

function rowEntityPath(rows, entityType, entityId) {
  const index = new Map((rows || []).map((row) => [
    `${row.entityType}\u0000${row.entityId}`,
    row
  ]));
  let current = index.get(`${entityType}\u0000${entityId}`);
  if (!current) return null;
  const path = [current.entityId];
  while (current.parentType && current.parentType !== "project") {
    current = index.get(`${current.parentType}\u0000${current.parentId}`);
    if (!current) return null;
    path.unshift(current.entityId);
  }
  return path;
}

function changedCardResourceTargets(diff, currentRows) {
  const currentCards = new Map((currentRows || [])
    .filter(({ entityType }) => entityType === "card")
    .map((row) => [row.entityId, row.content]));
  const changes = new Map();
  const compare = (before, after) => {
    const beforeTargets = cardResourceTargetSnapshots(before);
    const afterTargets = cardResourceTargetSnapshots(after);
    for (const targetId of new Set([
      ...beforeTargets.keys(), ...afterTargets.keys()
    ])) {
      if (canonicalJsonStringify(beforeTargets.get(targetId) ?? null)
          !== canonicalJsonStringify(afterTargets.get(targetId) ?? null)) {
        changes.set(targetId, true);
      }
    }
    return [...changes.keys()];
  };
  const pairs = new Map();
  for (const row of diff.upserts.filter(({ entityType }) =>
    entityType === "card")) {
    changes.clear();
    const cardPath = rowEntityPath(diff.nextRows, "card", row.entityId)
      || rowEntityPath(currentRows, "card", row.entityId);
    for (const targetId of compare(
      currentCards.get(row.entityId) ?? null,
      row.content
    )) {
      if (cardPath) {
        pairs.set(`${JSON.stringify(cardPath)}\u0000${targetId}`, {
          cardPath,
          targetId
        });
      }
    }
  }
  for (const row of diff.deletes.filter(({ entityType }) =>
    entityType === "card")) {
    changes.clear();
    const cardPath = rowEntityPath(currentRows, "card", row.entityId);
    for (const targetId of compare(row.content, null)) {
      if (cardPath) {
        pairs.set(`${JSON.stringify(cardPath)}\u0000${targetId}`, {
          cardPath,
          targetId
        });
      }
    }
  }
  const items = [...pairs.values()].sort((left, right) =>
    JSON.stringify(left).localeCompare(JSON.stringify(right)));
  return boundedSummaryItems(
    items,
    SUMMARY_RESOURCE_TARGET_LIMIT,
    SUMMARY_EVIDENCE_BYTES
  );
}

function changedCardPaths(diff, currentRows) {
  const targets = new Map();
  const add = (row, rows) => {
    if (row.entityType !== "card") return;
    const entityPath = rowEntityPath(rows, row.entityType, row.entityId);
    if (!entityPath) return;
    targets.set(JSON.stringify(entityPath), entityPath);
  };
  diff.upserts.forEach((row) => add(row, diff.nextRows));
  diff.deletes.forEach((row) => add(row, currentRows));
  const items = [...targets.values()].sort((left, right) =>
    JSON.stringify(left).localeCompare(JSON.stringify(right)));
  return boundedSummaryItems(
    items,
    SUMMARY_PATH_ITEM_LIMIT,
    SUMMARY_EVIDENCE_BYTES
  );
}

function changedCardShellPaths(diff, currentRows) {
  const currentCards = new Map((currentRows || [])
    .filter(({ entityType }) => entityType === "card")
    .map((row) => [row.entityId, row.content]));
  const targets = new Map();
  const addWhenChanged = (row, rows, before, after) => {
    if (canonicalJsonStringify(cardShellSnapshot(before))
        === canonicalJsonStringify(cardShellSnapshot(after))) return;
    const entityPath = rowEntityPath(rows, "card", row.entityId);
    if (!entityPath) return;
    targets.set(JSON.stringify(entityPath), entityPath);
  };
  for (const row of diff.upserts.filter(({ entityType }) =>
    entityType === "card")) {
    addWhenChanged(
      row,
      diff.nextRows,
      currentCards.get(row.entityId) ?? null,
      row.content
    );
  }
  for (const row of diff.deletes.filter(({ entityType }) =>
    entityType === "card")) {
    addWhenChanged(row, currentRows, row.content, null);
  }
  const items = [...targets.values()].sort((left, right) =>
    JSON.stringify(left).localeCompare(JSON.stringify(right)));
  return boundedSummaryItems(
    items,
    SUMMARY_PATH_ITEM_LIMIT,
    SUMMARY_EVIDENCE_BYTES
  );
}

function mutationSummary(
  operation,
  diff,
  operationArguments,
  continuityRemap = null,
  currentRows = []
) {
  const structurePaths = operation === "create_structure"
    ? (operationArguments.parts || []).flatMap((part) => {
      const parentPath = Array.isArray(part.parentPath) ? part.parentPath : null;
      const fullPath = [
        ...(parentPath || []),
        part.id
      ];
      return parentPath ? [parentPath, fullPath] : [fullPath];
    })
    : [];
  const postMutationPaths = [];
  if (new Set(["copy_entity", "move_entity"]).has(operation)
      && Array.isArray(operationArguments.entityPath)) {
    postMutationPaths.push([
      ...(operationArguments.targetParentPath || []),
      operation === "copy_entity"
        ? operationArguments.newRootId
        : operationArguments.entityPath.at(-1)
    ]);
  } else if (operation === "split_microsequence") {
    postMutationPaths.push([
      ...operationArguments.sourcePath.slice(0, -1),
      operationArguments.newMicrosequence.id
    ]);
  } else if (operation === "promote_module") {
    postMutationPaths.push([operationArguments.courseId]);
  } else if (operation === "demote_course") {
    postMutationPaths.push([
      ...operationArguments.targetCoursePath,
      operationArguments.moduleId
    ]);
  }
  const allTargetPaths = [
    operation === "copy_entity" ? null : operationArguments.entityPath,
    operationArguments.microsequencePath,
    operationArguments.cardPath,
    operationArguments.modulePath,
    operationArguments.coursePath,
    operationArguments.targetPath,
    operationArguments.sourcePath,
    ...(Array.isArray(operationArguments.sourcePaths)
      ? operationArguments.sourcePaths
      : []),
    ...structurePaths,
    ...postMutationPaths
  ].filter((path, index, paths) =>
    Array.isArray(path)
    && paths.findIndex((candidate) =>
      JSON.stringify(candidate) === JSON.stringify(path)) === index);
  const targetPath = allTargetPaths[0] || null;
  const targetPaths = boundedSummaryItems(
    allTargetPaths,
    SUMMARY_PATH_ITEM_LIMIT,
    SUMMARY_PATH_BYTES
  );
  const changedResources = changedCardResourceTargets(diff, currentRows);
  const cardPaths = changedCardPaths(diff, currentRows);
  const cardShellPaths = changedCardShellPaths(diff, currentRows);
  return {
    created: diff.upserts.filter((row) => row.version == null).length,
    updated: diff.upserts.filter((row) => row.version != null).length,
    deleted: diff.deletes.length,
    operationFamily: CONTENT_MUTATION_OPERATIONS.has(operation)
      ? "content"
      : "structure",
    ...(targetPath ? { targetPath } : {}),
    targetPaths: targetPaths.items,
    targetPathsTruncated: targetPaths.truncated,
    ...(continuityRemap ? { continuityRemap } : {}),
    resourceTargets: changedResources.items,
    resourceTargetsTruncated: changedResources.truncated,
    changedCardPaths: cardPaths.items,
    changedCardPathsTruncated: cardPaths.truncated,
    cardShellChangedPaths: cardShellPaths.items,
    cardShellChangedPathsTruncated: cardShellPaths.truncated,
    ...(operationArguments.entityType
      ? { entityType: operationArguments.entityType }
      : {}),
    ...(operation === "save_microsequence_cards"
      ? {
        mode: operationArguments.mode,
        submittedCardCount: operationArguments.cards.length,
        positionsNormalized: true
      }
      : {})
  };
}

function continuityRemapForMutation(operation, operationArguments, rawState) {
  if (!new Set(["split_microsequence", "merge_microsequences"]).has(operation)) {
    return null;
  }
  const state = normalizeContinuityState(rawState);
  if (operation === "split_microsequence") {
    return {
      kind: "split",
      sourceId: operationArguments.sourcePath.at(-1),
      newId: operationArguments.newMicrosequence.id
    };
  }
  const targetId = operationArguments.targetPath.at(-1);
  const sourceIds = [...new Set(operationArguments.sourcePaths
    .map((path) => path.at(-1))
    .filter((id) => id !== targetId))];
  const participantIds = new Set([targetId, ...sourceIds]);
  const partIds = new Set(state.parts
    .filter((part) => part.microsequenceIds.some((id) => participantIds.has(id)))
    .map(({ id }) => id));
  if (partIds.size > 1) {
    throw new AuthoringApiError(
      422,
      "workspace_cross_part_merge",
      "Antes de juntar Partes diferentes, aprove um record_approved_plan pós-junção "
        + "sob mandato restructure, mantendo o destino e retirando temporariamente "
        + "as origens das Partes; depois repita a junção.",
      { partIds: [...partIds] }
    );
  }
  return { kind: "merge", targetId, sourceIds };
}

function mutationCourseIds(operation, operationArguments) {
  if (new Set([
    "create_structure",
    "promote_module",
    "demote_course"
  ]).has(operation)) {
    return null;
  }
  if (
    new Set(["copy_entity", "move_entity", "delete_entity"]).has(operation)
    && operationArguments.entityType === "course"
  ) {
    return null;
  }
  const paths = [
    operationArguments.entityPath,
    operationArguments.microsequencePath,
    operationArguments.cardPath,
    operationArguments.targetParentPath,
    operationArguments.targetPath,
    operationArguments.sourcePath,
    ...(Array.isArray(operationArguments.sourcePaths)
      ? operationArguments.sourcePaths
      : [])
  ];
  const courseIds = [...new Set(paths
    .filter((path) => Array.isArray(path) && path.length > 0)
    .map((path) => path[0])
    .filter(Boolean))];
  return courseIds.length ? courseIds : null;
}

export class AuthoringWorkspaceEngine {
  constructor({
    rpc,
    supabaseUrl,
    serverApiKey,
    fetchImpl = globalThis.fetch
  }) {
    this.rpc = rpc;
    this.artifacts = new ArtifactStore({
      supabaseUrl,
      serverApiKey,
      fetchImpl,
      maxArtifactBytes: MAX_ARTIFACT_BYTES
    });
  }

  async #hash(operation, payload) {
    return sha256Hex(canonicalJsonStringify({ operation, payload }));
  }

  async #replay(principal, requestId, payloadHash, operation, deadlineAt = null) {
    return first(await this.rpc("replay_authoring_workspace_request_v5", {
      ...principalArgs(principal),
      p_request_id: requestId,
      p_payload_hash: payloadHash,
      p_operation: operation
    }, { deadlineAt }));
  }

  async #courseArtifact(principal, courseId, deadlineAt = null) {
    return first(await this.rpc("get_course_document_artifact_v4", {
      ...principalArgs(principal),
      p_course_id: courseId
    }, { deadlineAt }));
  }

  async #reviewArtifact(principal, submissionId, deadlineAt = null) {
    return first(await this.rpc("get_catalog_review_artifact_v5", {
      p_actor_id: principal.actorId,
      p_submission_id: submissionId
    }, { deadlineAt }));
  }

  async #workspaceReference(
    principal,
    workspaceId,
    deadlineAt = null,
    {
      courseIds = null,
      includeCardContent = true
    } = {}
  ) {
    return first(await this.rpc("get_authoring_workspace_v5", {
      ...principalArgs(principal),
      p_workspace_id: workspaceId,
      p_course_ids: courseIds,
      p_include_card_content: includeCardContent
    }, { deadlineAt }));
  }

  async #workspaceDocument(
    principal,
    workspaceId,
    deadlineAt = null,
    { courseIds = null } = {}
  ) {
    const reference = await this.#workspaceReference(
      principal,
      workspaceId,
      deadlineAt,
      { courseIds }
    );
    const rows = Array.isArray(reference?.entities) ? reference.entities : [];
    const document = composeWorkspaceDocument(rows);
    return { control: withoutEntities(reference), rows, document };
  }

  async #workspaceContinuity(principal, workspaceId, deadlineAt = null) {
    return first(await this.rpc("get_authoring_workspace_continuity_v1", {
      p_actor_id: principal.actorId,
      p_workspace_id: workspaceId
    }, { deadlineAt }));
  }

  async #consistentWorkspaceContinuity(
    principal,
    workspaceId,
    deadlineAt = null,
    { courseIds = null, includeCardContent = false } = {}
  ) {
    let last = null;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const [reference, continuity] = await Promise.all([
        this.#workspaceReference(
          principal,
          workspaceId,
          deadlineAt,
          { courseIds, includeCardContent }
        ),
        this.#workspaceContinuity(principal, workspaceId, deadlineAt)
      ]);
      if (reference?.revision === continuity?.revision) {
        return { reference, continuity };
      }
      last = {
        referenceRevision: reference?.revision ?? null,
        continuityRevision: continuity?.revision ?? null
      };
    }
    throw new AuthoringApiError(
      409,
      "workspace_snapshot_changed",
      "O workspace mudou durante a leitura. Leia novamente antes de continuar.",
      last
    );
  }

  async #createFromDocument({
    principal,
    workspaceId,
    requestId,
    title,
    brief,
    document,
    sourceCourseId = null,
    sourceRevisionHash = null,
    sourceSubmissionId = null,
    payloadHash,
    finalizeReservation = false,
    deadlineAt = null
  }) {
    return first(await this.rpc(
      finalizeReservation
        ? "finalize_reserved_authoring_workspace_v1"
        : "create_authoring_workspace_v5",
      {
        ...principalArgs(principal),
        p_workspace_id: workspaceId,
        p_request_id: requestId,
        p_payload_hash: payloadHash,
        p_title: title,
        p_brief: brief,
        p_source_course_id: sourceCourseId,
        p_source_revision_hash: sourceRevisionHash,
        p_source_submission_id: sourceSubmissionId,
        p_rows: flattenWorkspaceDocument(document)
      },
      { deadlineAt }
    ));
  }

  async create({
    principal,
    workspaceId,
    requestId,
    title,
    brief = "",
    sourceCourseId = null,
    sourceSubmissionId = null,
    deadlineAt = null
  }) {
    brief = stableBrief(brief, { allowEmpty: true });
    if (sourceCourseId && sourceSubmissionId) {
      throw new AuthoringApiError(
        422,
        "ambiguous_workspace_source",
        "Escolha um curso ou uma revisão editorial como origem."
      );
    }
    const operation = "create";
    const payloadHash = await this.#hash(operation, {
      title,
      brief,
      sourceCourseId,
      sourceSubmissionId
    });
    const replayed = await this.#replay(
      principal, requestId, payloadHash, operation, deadlineAt
    );
    if (replayed) return replayed;
    let finalizeReservation = false;
    if (sourceCourseId && !sourceSubmissionId) {
      const reservation = first(await this.rpc(
        "resume_or_reserve_authoring_workspace_v1",
        {
          p_actor_id: principal.actorId,
          p_course_id: sourceCourseId,
          p_workspace_id: workspaceId,
          p_request_id: requestId,
          p_payload_hash: payloadHash
        },
        { deadlineAt }
      ));
      if (reservation?.revision) return reservation;
      workspaceId = reservation?.workspaceId || workspaceId;
      finalizeReservation = true;
    }
    let document = createEmptyAuthoringWorkspace();
    let sourceRevisionHash = null;
    if (sourceCourseId) {
      const source = await this.#courseArtifact(principal, sourceCourseId, deadlineAt);
      document = await this.artifacts.getJson(source.artifact, { deadlineAt });
      sourceRevisionHash = source.revisionHash;
    } else if (sourceSubmissionId) {
      const source = await this.#reviewArtifact(principal, sourceSubmissionId, deadlineAt);
      document = await this.artifacts.getJson(source.artifact, { deadlineAt });
      sourceCourseId = source.courseId;
      sourceRevisionHash = source.sourceRevisionHash;
    }
    return this.#createFromDocument({
      principal,
      workspaceId,
      requestId,
      title,
      brief,
      document,
      sourceCourseId,
      sourceRevisionHash,
      sourceSubmissionId,
      payloadHash,
      finalizeReservation,
      deadlineAt
    });
  }

  async createCanonicalCatalogWorkspace({
    principal,
    workspaceId,
    requestId,
    title,
    brief = "",
    document,
    deadlineAt = null
  }) {
    brief = stableBrief(brief, { allowEmpty: true });
    assertCatalogBatchPrincipal(principal);
    const prepared = await prepareCourseDocument(document, {
      requireReady: true
    });
    const operation = "create";
    const payloadHash = await this.#hash(operation, {
      workspaceId,
      title,
      brief,
      canonicalContentHash: prepared.contentHash
    });
    const replayed = await this.#replay(
      principal, requestId, payloadHash, operation, deadlineAt
    );
    if (replayed) return replayed;
    return this.#createFromDocument({
      principal,
      workspaceId,
      requestId,
      title,
      brief,
      document: prepared.document,
      payloadHash,
      deadlineAt
    });
  }

  async replaceCanonicalCatalogWorkspace({
    principal,
    workspaceId,
    requestId,
    expectedRevision,
    title,
    brief = "",
    document,
    deadlineAt = null
  }) {
    brief = stableBrief(brief, { allowEmpty: true });
    assertCatalogBatchPrincipal(principal);
    const prepared = await prepareCourseDocument(document, {
      requireReady: true
    });
    const operation = "replace_catalog_document";
    const payloadHash = await this.#hash(operation, {
      workspaceId,
      expectedRevision,
      title,
      brief,
      canonicalContentHash: prepared.contentHash
    });
    return first(await this.rpc("replace_catalog_authoring_document_v1", {
      p_actor_id: principal.actorId,
      p_workspace_id: workspaceId,
      p_request_id: requestId,
      p_payload_hash: payloadHash,
      p_expected_revision: expectedRevision,
      p_title: title,
      p_brief: brief,
      p_rows: flattenWorkspaceDocument(prepared.document)
    }, { deadlineAt }));
  }

  async discardUnpublishedCatalogMaterialization({
    principal,
    workspaceId,
    deadlineAt = null
  }) {
    assertCatalogBatchPrincipal(principal);
    return first(await this.rpc("discard_unpublished_catalog_materialization_v1", {
      p_actor_id: principal.actorId,
      p_workspace_id: workspaceId
    }, { deadlineAt }));
  }

  async list({
    principal,
    limit = 50,
    beforeUpdatedAt = null,
    beforeId = null,
    deadlineAt = null
  }) {
    return first(await this.rpc("list_authoring_workspaces_v5", {
      ...principalArgs(principal),
      p_limit: limit,
      p_before_updated_at: beforeUpdatedAt,
      p_before_id: beforeId
    }, { deadlineAt }));
  }

  async events({
    principal,
    workspaceId,
    limit = 20,
    beforeRevision = null,
    deadlineAt = null
  }) {
    return first(await this.rpc("list_authoring_workspace_events_v5", {
      ...principalArgs(principal),
      p_workspace_id: workspaceId,
      p_limit: limit,
      p_before_revision: beforeRevision
    }, { deadlineAt }));
  }

  async updateBrief({
    principal,
    workspaceId,
    requestId,
    expectedRevision,
    brief,
    deadlineAt = null
  }) {
    brief = stableBrief(brief);
    const operation = "update_brief";
    const payloadHash = await this.#hash(operation, {
      workspaceId,
      expectedRevision,
      brief
    });
    const replayed = await this.#replay(
      principal, requestId, payloadHash, operation, deadlineAt
    );
    if (replayed) return replayed;
    return first(await this.rpc("update_authoring_workspace_brief_v5", {
      ...principalArgs(principal),
      p_workspace_id: workspaceId,
      p_request_id: requestId,
      p_payload_hash: payloadHash,
      p_expected_revision: expectedRevision,
      p_brief: brief
    }, { deadlineAt }));
  }

  async get({
    principal,
    workspaceId,
    view = "outline",
    entityType = null,
    entityPath = null,
    includeDescendants = true,
    deadlineAt = null
  }) {
    if (view === "resume") {
      const { reference, continuity } = await this.#consistentWorkspaceContinuity(
        principal,
        workspaceId,
        deadlineAt,
        { includeCardContent: false }
      );
      return buildWorkspaceResumeProjection(reference, continuity);
    }
    if (view === "outline") {
      const reference = await this.#workspaceReference(
        principal,
        workspaceId,
        deadlineAt,
        { includeCardContent: false }
      );
      const rows = Array.isArray(reference?.entities) ? reference.entities : [];
      return {
        ...withoutEntities(reference),
        view,
        content: buildWorkspaceOutlineFromRows(rows)
      };
    }
    const courseIds = Array.isArray(entityPath) && entityPath[0]
      ? [entityPath[0]]
      : null;
    const { control, document } = await this.#workspaceDocument(
      principal,
      workspaceId,
      deadlineAt,
      { courseIds }
    );
    return {
      ...control,
      view,
      content: viewContent(document, {
        view,
        entityType,
        entityPath,
        includeDescendants
      })
    };
  }

  async readCourse({
    principal,
    courseId,
    view = "outline",
    entityType = null,
    entityPath = null,
    includeDescendants = true,
    deadlineAt = null
  }) {
    const control = await this.#courseArtifact(principal, courseId, deadlineAt);
    const document = await this.artifacts.getJson(control.artifact, { deadlineAt });
    return {
      courseId,
      title: control.title,
      revisionHash: control.revisionHash,
      completionState: control.completionState,
      view,
      content: viewContent(document, {
        view,
        entityType,
        entityPath,
        includeDescendants,
        errorCode: "invalid_course_view"
      })
    };
  }

  async replayMutation({
    principal,
    workspaceId,
    requestId,
    expectedRevision,
    operation,
    arguments: operationArguments,
    deadlineAt = null
  }) {
    const payloadHash = await this.#hash(operation, {
      workspaceId,
      expectedRevision,
      arguments: operationArguments
    });
    const replayed = await this.#replay(
      principal,
      requestId,
      payloadHash,
      operation,
      deadlineAt
    );
    if (replayed && String(replayed.workspaceId || "") !== String(workspaceId)) {
      throw new AuthoringApiError(
        409,
        "idempotency_key_reused",
        "O requestId já foi usado em outro workspace."
      );
    }
    return replayed || null;
  }

  async mutate({
    principal,
    workspaceId,
    requestId,
    expectedRevision,
    operation,
    arguments: operationArguments,
    deadlineAt = null
  }) {
    const payload = {
      workspaceId,
      expectedRevision,
      arguments: operationArguments
    };
    const payloadHash = await this.#hash(operation, payload);
    const replayed = await this.#replay(
      principal, requestId, payloadHash, operation, deadlineAt
    );
    if (replayed) return replayed;
    const requiresContinuityRemap = new Set([
      "merge_microsequences", "split_microsequence"
    ]).has(operation);
    let current;
    let continuity = null;
    if (requiresContinuityRemap) {
      const snapshot = await this.#consistentWorkspaceContinuity(
        principal,
        workspaceId,
        deadlineAt,
        {
          courseIds: mutationCourseIds(operation, operationArguments),
          includeCardContent: true
        }
      );
      const rows = Array.isArray(snapshot.reference?.entities)
        ? snapshot.reference.entities
        : [];
      current = {
        control: withoutEntities(snapshot.reference),
        rows,
        document: composeWorkspaceDocument(rows)
      };
      continuity = snapshot.continuity;
    } else {
      current = await this.#workspaceDocument(
        principal,
        workspaceId,
        deadlineAt,
        { courseIds: mutationCourseIds(operation, operationArguments) }
      );
    }
    if (current.control.revision !== expectedRevision) {
      throw new AuthoringApiError(
        409,
        "stale_workspace_revision",
        "O workspace mudou desde a leitura usada para preparar a alteração.",
        { expectedRevision, currentRevision: current.control.revision }
      );
    }
    const handlers = {
      create_structure: createWorkspaceStructure,
      save_microsequence_cards: saveWorkspaceMicrosequenceCards,
      update_metadata: updateWorkspaceEntityMetadata,
      save_card: saveWorkspaceCard,
      copy_entity: copyWorkspaceEntity,
      rename_entity: renameWorkspaceEntity,
      move_entity: moveWorkspaceEntity,
      delete_entity: deleteWorkspaceEntity,
      merge_microsequences: mergeWorkspaceMicrosequences,
      split_microsequence: splitWorkspaceMicrosequence,
      promote_module: promoteModuleToCourse,
      demote_course: demoteCourseToModule
    };
    const handler = handlers[operation];
    if (!handler) {
      throw new AuthoringApiError(
        422, "invalid_workspace_operation", "Operação de workspace inválida."
      );
    }
    const nextDocument = handler(current.document, operationArguments);
    assertIntroducedSourcesAreAuthorized(
      current.document,
      nextDocument,
      current.control.brief
    );
    const diff = diffWorkspaceDocument(current.rows, nextDocument);
    if (diff.upserts.length === 0 && diff.deletes.length === 0) {
      throw new AuthoringApiError(
        409,
        "workspace_change_empty",
        "A alteração não modifica o workspace atual."
      );
    }
    if (requiresContinuityRemap
        && (!continuity?.authoringState
          || typeof continuity.authoringState !== "object"
          || Array.isArray(continuity.authoringState))) {
      throw new AuthoringApiError(
        502,
        "invalid_authoring_continuity_response",
        "O backend não devolveu o estado de continuidade autoral."
      );
    }
    const continuityRemap = requiresContinuityRemap
      ? continuityRemapForMutation(
        operation,
        operationArguments,
        continuity.authoringState
      )
      : null;
    return first(await this.rpc("commit_authoring_workspace_changes_v5", {
      ...principalArgs(principal),
      p_workspace_id: workspaceId,
      p_request_id: requestId,
      p_payload_hash: payloadHash,
      p_expected_revision: expectedRevision,
      p_operation: operation,
      p_changes: {
        upserts: diff.upserts,
        deletes: diff.deletes.map(({ entityType, entityId, version }) => ({
          entityType,
          entityId,
          ...(version == null ? {} : { version })
        }))
      },
      p_summary: mutationSummary(
        operation,
        diff,
        operationArguments,
        continuityRemap,
        current.rows
      )
    }, { deadlineAt }));
  }

  async manageContinuity({
    principal,
    workspaceId,
    requestId,
    expectedRevision,
    operation,
    arguments: operationArguments,
    deadlineAt = null
  }) {
    if (operation === "replace_stable_brief") {
      return this.updateBrief({
        principal,
        workspaceId,
        requestId,
        expectedRevision,
        brief: operationArguments.brief,
        deadlineAt
      });
    }
    const payload = {
      workspaceId,
      expectedRevision,
      operation,
      arguments: operationArguments
    };
    const payloadHash = await this.#hash(operation, payload);
    const receiptOperation = CONTINUITY_STATE_OPERATIONS.has(operation)
      ? "update_continuity"
      : operation === "record_finding"
        ? "create_finding"
        : operation;
    const replayed = await this.#replay(
      principal,
      requestId,
      payloadHash,
      receiptOperation,
      deadlineAt
    );
    if (replayed) {
      return CONTINUITY_FINDING_OPERATIONS.has(operation)
        ? findingMutationProjection(replayed, operation)
        : replayed;
    }
    const { reference, continuity } = await this.#consistentWorkspaceContinuity(
      principal,
      workspaceId,
      deadlineAt,
      {
        includeCardContent: operation === "record_finding"
          && operationArguments.entityType === "resource"
      }
    );
    if (reference.revision !== expectedRevision) {
      throw new AuthoringApiError(
        409,
        "stale_workspace_revision",
        "O workspace mudou desde a leitura usada para preparar a alteração.",
        { expectedRevision, currentRevision: reference.revision }
      );
    }
    if (CONTINUITY_STATE_OPERATIONS.has(operation)) {
      if (!continuity?.authoringState
          || typeof continuity.authoringState !== "object"
          || Array.isArray(continuity.authoringState)) {
        throw new AuthoringApiError(
          502,
          "invalid_authoring_continuity_response",
          "O backend não devolveu o estado de continuidade autoral."
        );
      }
      const state = applyContinuityStateOperation({
        state: normalizeContinuityState(continuity?.authoringState),
        operation,
        arguments: operationArguments,
        reference,
        continuity,
        expectedRevision
      });
      return first(await this.rpc("update_authoring_workspace_continuity_v1", {
        p_actor_id: principal.actorId,
        p_workspace_id: workspaceId,
        p_request_id: requestId,
        p_payload_hash: payloadHash,
        p_expected_revision: expectedRevision,
        p_operation: operation,
        p_state: state
      }, { deadlineAt }));
    }
    if (CONTINUITY_FINDING_OPERATIONS.has(operation)) {
      const findingPayload = validateFindingOperation({
        operation,
        arguments: operationArguments,
        reference,
        continuity
      });
      const result = first(await this.rpc("manage_authoring_workspace_finding_v1", {
        p_actor_id: principal.actorId,
        p_workspace_id: workspaceId,
        p_request_id: requestId,
        p_payload_hash: payloadHash,
        p_expected_revision: expectedRevision,
        p_operation: FINDING_RPC_OPERATIONS[operation],
        p_payload: findingRpcPayload(operation, findingPayload)
      }, { deadlineAt }));
      return findingMutationProjection(result, operation);
    }
    throw new AuthoringApiError(
      422,
      "invalid_authoring_continuity_operation",
      "A operação de continuidade é inválida."
    );
  }

  async importCourse({
    principal,
    workspaceId,
    requestId,
    expectedRevision,
    courseId,
    workspaceCourseId,
    position = null,
    deadlineAt = null
  }) {
    const operation = "import_course";
    const payload = {
      workspaceId,
      expectedRevision,
      courseId,
      workspaceCourseId,
      position
    };
    const payloadHash = await this.#hash(operation, payload);
    const replayed = await this.#replay(
      principal, requestId, payloadHash, operation, deadlineAt
    );
    if (replayed) return replayed;
    const current = await this.#workspaceDocument(principal, workspaceId, deadlineAt);
    if (current.control.revision !== expectedRevision) {
      throw new AuthoringApiError(
        409,
        "stale_workspace_revision",
        "O workspace mudou desde a leitura usada para preparar a importação.",
        { expectedRevision, currentRevision: current.control.revision }
      );
    }
    const source = await this.#courseArtifact(principal, courseId, deadlineAt);
    const sourceDocument = await this.artifacts.getJson(source.artifact, { deadlineAt });
    const sourceCourse = sourceDocument.courses?.[0];
    if (!sourceCourse) {
      throw new AuthoringApiError(
        422, "invalid_source_course", "O curso não contém uma raiz válida."
      );
    }
    const course = cloneWorkspaceEntityWithFreshIds(current.document, {
      entityType: "course",
      entity: sourceCourse,
      newRootId: workspaceCourseId
    });
    const nextDocument = attachWorkspaceEntity(current.document, {
      entityType: "course",
      parentPath: null,
      entity: course,
      position
    });
    const diff = diffWorkspaceDocument(current.rows, nextDocument);
    return first(await this.rpc("commit_authoring_workspace_changes_v5", {
      ...principalArgs(principal),
      p_workspace_id: workspaceId,
      p_request_id: requestId,
      p_payload_hash: payloadHash,
      p_expected_revision: expectedRevision,
      p_operation: operation,
      p_changes: { upserts: diff.upserts, deletes: [] },
      p_summary: {
        created: diff.upserts.length,
        updated: 0,
        deleted: 0,
        operationFamily: "structure",
        targetPath: [workspaceCourseId],
        targetPaths: [[workspaceCourseId]],
        targetPathsTruncated: false,
        changedCardPaths: [],
        changedCardPathsTruncated: false,
        cardShellChangedPaths: [],
        cardShellChangedPathsTruncated: false,
        resourceTargets: [],
        resourceTargetsTruncated: false,
        sourceCourseId: courseId,
        importedCourseId: workspaceCourseId
      }
    }, { deadlineAt }));
  }

  async publish({
    principal,
    workspaceId,
    requestId,
    expectedRevision,
    courseId,
    target = "private",
    existingCourseId = null,
    expectedContentHash = null,
    collectionId = null,
    submissionId = null,
    deadlineAt = null
  }) {
    const requestedCompletion = target === "catalog" ? "complete" : "partial";
    const operation = target === "catalog" ? "sync_catalog_course" : "sync_trail_course";
    const payload = {
      workspaceId,
      expectedRevision,
      courseId,
      target,
      existingCourseId,
      expectedContentHash,
      collectionId,
      submissionId
    };
    const payloadHash = await this.#hash(operation, payload);
    const replayed = await this.#replay(
      principal, requestId, payloadHash, operation, deadlineAt
    );
    if (replayed) return replayed;
    const { control, document } = await this.#workspaceDocument(
      principal,
      workspaceId,
      deadlineAt,
      { courseIds: [courseId] }
    );
    if (control.revision !== expectedRevision) {
      throw new AuthoringApiError(
        409,
        "stale_workspace_revision",
        "O workspace mudou desde a revisão informada.",
        { expectedRevision, currentRevision: control.revision }
      );
    }
    const courseDocument = selectCourseDocument(document, courseId);
    const prepared = await prepareCourseDocument(courseDocument, {
      requireReady: false
    });
    const currentPublication = control.publications?.find((publication) =>
      publication.workspaceCourseId === courseId
      && publication.target === target
      && publication.contentHash === prepared.contentHash
      && publication.completionState === requestedCompletion
      && (
        existingCourseId == null
        || publication.courseId === existingCourseId
      )
      && (
        expectedContentHash == null
        || publication.contentHash === expectedContentHash
      )
    );
    if (currentPublication && submissionId == null) {
      const unchanged = first(await this.rpc(
        "reuse_unchanged_authoring_publication_v5",
        {
          ...principalArgs(principal),
          p_workspace_id: workspaceId,
          p_request_id: requestId,
          p_payload_hash: payloadHash,
          p_expected_revision: expectedRevision,
          p_workspace_course_id: courseId,
          p_content_hash: prepared.contentHash,
          p_target: target,
          p_completion_state: requestedCompletion,
          p_existing_course_id: existingCourseId,
          p_expected_content_hash: expectedContentHash,
          p_collection_id: collectionId
        },
        { deadlineAt }
      ));
      if (unchanged) return unchanged;
    }
    const descriptor = await this.artifacts.putJson(prepared.document, {
      artifactType: "aralearn.course-revision",
      bucket: COURSE_REVISION_BUCKET,
      registerReference: async (artifact) => {
        await this.rpc("register_authoring_artifact_v5", {
          p_artifact: artifact
        }, { deadlineAt });
      },
      deadlineAt
    });
    const course = prepared.document.courses[0];
    const metadata = {
      contractKey: course.id,
      title: course.title,
      goal: course.goal,
      contractScope: prepared.document.scope || null,
      ...projectCounts(prepared.document)
    };
    return first(await this.rpc("publish_authoring_workspace_course_v5", {
      ...principalArgs(principal),
      p_workspace_id: workspaceId,
      p_request_id: requestId,
      p_payload_hash: payloadHash,
      p_expected_revision: expectedRevision,
      p_target: target,
      p_completion_state: requestedCompletion,
      p_existing_course_id: existingCourseId,
      p_expected_content_hash: expectedContentHash,
      p_collection_id: collectionId,
      p_submission_id: submissionId,
      p_metadata: metadata,
      p_artifact: descriptor
    }, { deadlineAt }));
  }

  async submitForReview({
    principal,
    submissionId,
    courseId,
    expectedContentHash,
    note = null,
    deadlineAt = null
  }) {
    return first(await this.rpc("submit_private_course_for_catalog_review_v5", {
      p_actor_id: principal.actorId,
      p_submission_id: submissionId,
      p_course_id: courseId,
      p_expected_content_hash: expectedContentHash,
      p_note: note
    }, { deadlineAt }));
  }

  async listReviews({
    principal,
    view = "mine",
    limit = 50,
    beforeSubmittedAt = null,
    beforeId = null,
    deadlineAt = null
  }) {
    return first(await this.rpc("list_catalog_reviews_v5", {
      p_actor_id: principal.actorId,
      p_view: view,
      p_limit: limit,
      p_before_submitted_at: beforeSubmittedAt,
      p_before_id: beforeId
    }, { deadlineAt }));
  }

  async readReview({
    principal,
    submissionId,
    view = "outline",
    entityType = null,
    entityPath = null,
    includeDescendants = true,
    deadlineAt = null
  }) {
    const control = await this.#reviewArtifact(principal, submissionId, deadlineAt);
    const document = await this.artifacts.getJson(control.artifact, { deadlineAt });
    const publicControl = { ...control };
    delete publicControl.artifact;
    return {
      ...publicControl,
      view,
      content: viewContent(document, {
        view,
        entityType,
        entityPath,
        includeDescendants,
        errorCode: "invalid_review_view"
      })
    };
  }

  async claimReview({ principal, submissionId, deadlineAt = null }) {
    return first(await this.rpc("claim_catalog_review_v5", {
      p_actor_id: principal.actorId,
      p_submission_id: submissionId
    }, { deadlineAt }));
  }

  async createReviewWorkspace({
    principal,
    submissionId,
    workspaceId,
    requestId,
    title,
    deadlineAt = null
  }) {
    const claim = await this.claimReview({ principal, submissionId, deadlineAt });
    if (claim.reviewWorkspaceId) {
      await this.rpc("link_catalog_review_workspace_v5", {
        p_actor_id: principal.actorId,
        p_submission_id: submissionId,
        p_workspace_id: claim.reviewWorkspaceId
      }, { deadlineAt });
      const reference = withoutEntities(await this.#workspaceReference(
        principal,
        claim.reviewWorkspaceId,
        deadlineAt
      ));
      delete reference.brief;
      return { ...reference, idempotent: true };
    }
    const result = await this.create({
      principal,
      workspaceId,
      requestId,
      title,
      sourceSubmissionId: submissionId,
      deadlineAt
    });
    await this.rpc("link_catalog_review_workspace_v5", {
      p_actor_id: principal.actorId,
      p_submission_id: submissionId,
      p_workspace_id: workspaceId
    }, { deadlineAt });
    return result;
  }

  async decideReview({
    principal,
    submissionId,
    decision,
    note,
    deadlineAt = null
  }) {
    return first(await this.rpc("decide_catalog_review_v5", {
      p_actor_id: principal.actorId,
      p_submission_id: submissionId,
      p_decision: decision,
      p_note: note
    }, { deadlineAt }));
  }

  async withdrawReview({ principal, submissionId, deadlineAt = null }) {
    return first(await this.rpc("withdraw_catalog_review_v5", {
      p_actor_id: principal.actorId,
      p_submission_id: submissionId
    }, { deadlineAt }));
  }

  async delete({
    principal,
    workspaceId,
    requestId,
    expectedRevision,
    deadlineAt = null
  }) {
    const payload = { workspaceId, expectedRevision };
    return first(await this.rpc("delete_authoring_workspace_v5", {
      ...principalArgs(principal),
      p_workspace_id: workspaceId,
      p_request_id: requestId,
      p_expected_revision: expectedRevision,
      p_payload_hash: await this.#hash("delete_workspace", payload)
    }, { deadlineAt }));
  }
}
