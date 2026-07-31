import { prepareCourseDocument } from "./canonical.js";
import { canonicalJsonStringify } from "./canonicalJson.js";
import { AuthoringApiError } from "./errors.js";
import {
  ArtifactStore,
  COURSE_REVISION_BUCKET,
  MAX_ARTIFACT_BYTES
} from "./artifactStore.js";
import {
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

function completionState(document) {
  const incomplete = [];
  const incompleteByPath = new Map();
  const addIncomplete = (entityPath, reason) => {
    const key = JSON.stringify(entityPath);
    const current = incompleteByPath.get(key);
    if (current) {
      current.reasons.push(reason);
      return;
    }
    const item = { entityPath, reasons: [reason] };
    incomplete.push(item);
    incompleteByPath.set(key, item);
  };
  for (const course of document.courses || []) {
    const coursePath = [course.id];
    if (!course.modules?.length) {
      addIncomplete(coursePath, "course_without_modules");
    }
    for (const moduleValue of course.modules || []) {
      const modulePath = [...coursePath, moduleValue.id];
      if (!moduleValue.lessons?.length) {
        addIncomplete(modulePath, "module_without_lessons");
      }
      for (const lesson of moduleValue.lessons || []) {
        const lessonPath = [...modulePath, lesson.id];
        if (!lesson.microsequences?.length) {
          addIncomplete(lessonPath, "lesson_without_microsequences");
        }
        for (const microsequence of lesson.microsequences || []) {
          const entityPath = [...lessonPath, microsequence.id];
          if (!microsequence.cards?.length) {
            addIncomplete(entityPath, "microsequence_without_cards");
          }
          if (microsequence.status !== "ready") {
            addIncomplete(entityPath, "microsequence_not_ready");
          }
        }
      }
    }
  }
  return { state: incomplete.length ? "partial" : "complete", incomplete };
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

function mutationSummary(operation, diff, operationArguments) {
  const targetPath = operationArguments.entityPath
    || operationArguments.microsequencePath
    || operationArguments.targetPath
    || operationArguments.sourcePath
    || null;
  return {
    created: diff.upserts.filter((row) => row.version == null).length,
    updated: diff.upserts.filter((row) => row.version != null).length,
    deleted: diff.deletes.length,
    ...(targetPath ? { targetPath } : {}),
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
    deadlineAt = null
  }) {
    return first(await this.rpc("create_authoring_workspace_v5", {
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
    }, { deadlineAt }));
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
    if (sourceCourseId && sourceSubmissionId) {
      throw new AuthoringApiError(
        422,
        "ambiguous_workspace_source",
        "Escolha um curso ou uma revisão editorial como origem."
      );
    }
    const operation = "create";
    const payloadHash = await this.#hash(operation, {
      workspaceId,
      title,
      brief,
      sourceCourseId,
      sourceSubmissionId
    });
    const replayed = await this.#replay(
      principal, requestId, payloadHash, operation, deadlineAt
    );
    if (replayed) return replayed;
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
    const current = await this.#workspaceDocument(
      principal,
      workspaceId,
      deadlineAt,
      { courseIds: mutationCourseIds(operation, operationArguments) }
    );
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
      p_summary: mutationSummary(operation, diff, operationArguments)
    }, { deadlineAt }));
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
    const clonedSource = copyWorkspaceEntity(sourceDocument, {
      entityType: "course",
      entityPath: [sourceCourse.id],
      targetParentPath: null,
      newRootId: workspaceCourseId,
      position: sourceDocument.courses.length
    });
    const course = clonedSource.courses.find((item) => item.id === workspaceCourseId);
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
    completion = "partial",
    existingCourseId = null,
    expectedContentHash = null,
    collectionId = null,
    submissionId = null,
    deadlineAt = null
  }) {
    const requestedCompletion = completion === "complete" ? "complete" : "partial";
    const operation = target === "catalog"
      ? "publish_catalog_complete"
      : requestedCompletion === "partial"
        ? "publish_private_preview"
        : "publish_private_complete";
    const payload = {
      workspaceId,
      expectedRevision,
      courseId,
      target,
      completion: requestedCompletion,
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
    const readiness = completionState(courseDocument);
    if (requestedCompletion === "complete" && readiness.state !== "complete") {
      throw new AuthoringApiError(
        409,
        "course_incomplete",
        "A publicação completa exige uma estrutura estudável e todas as microssequências prontas.",
        { incomplete: readiness.incomplete.slice(0, 100) }
      );
    }
    if (target === "catalog" && requestedCompletion !== "complete") {
      throw new AuthoringApiError(
        422,
        "catalog_preview_forbidden",
        "Pré-visualizações parciais são privadas; o catálogo recebe somente cursos completos."
      );
    }
    const prepared = await prepareCourseDocument(courseDocument, {
      requireReady: requestedCompletion === "complete"
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
    deadlineAt = null
  }) {
    const payload = { workspaceId };
    return first(await this.rpc("delete_authoring_workspace_v5", {
      ...principalArgs(principal),
      p_workspace_id: workspaceId,
      p_request_id: requestId,
      p_payload_hash: await this.#hash("delete_workspace", payload)
    }, { deadlineAt }));
  }
}
