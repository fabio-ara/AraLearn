import { prepareCourseDocument } from "./canonical.js";
import { canonicalJsonStringify } from "./canonicalJson.js";
import { AuthoringApiError } from "./errors.js";
import {
  AUTHORING_ARTIFACT_BUCKET,
  ArtifactStore,
  COURSE_REVISION_BUCKET,
  MAX_ARTIFACT_BYTES
} from "./artifactStore.js";
import { sha256Hex } from "./security.js";
import {
  buildMicrotheoryReview,
  buildWorkspaceOutline,
  createEmptyAuthoringWorkspace,
  deleteWorkspaceEntity,
  demoteCourseToModule,
  insertWorkspaceEntity,
  mergeWorkspaceMicrosequences,
  moveWorkspaceEntity,
  promoteModuleToCourse,
  readWorkspaceEntity,
  renameWorkspaceEntity,
  replaceWorkspaceEntity,
  selectCourseDocument,
  splitWorkspaceMicrosequence
} from "./workspaceModel.js";

function first(value) {
  return Array.isArray(value) ? value[0] : value;
}

function principalArgs(principal) {
  return {
    p_owner_id: principal.actorId
  };
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

function completionState(document) {
  const incomplete = [];
  for (const course of document.courses || []) {
    const coursePath = [course.id];
    if (!course.modules?.length) {
      incomplete.push({ entityPath: coursePath, reason: "course_without_modules" });
    }
    for (const moduleValue of course.modules || []) {
      const modulePath = [...coursePath, moduleValue.id];
      if (!moduleValue.lessons?.length) {
        incomplete.push({ entityPath: modulePath, reason: "module_without_lessons" });
      }
      for (const lesson of moduleValue.lessons || []) {
        const lessonPath = [...modulePath, lesson.id];
        if (!lesson.microsequences?.length) {
          incomplete.push({ entityPath: lessonPath, reason: "lesson_without_microsequences" });
        }
        for (const microsequence of lesson.microsequences || []) {
          const entityPath = [...lessonPath, microsequence.id];
          if (!microsequence.cards?.length) {
            incomplete.push({ entityPath, reason: "microsequence_without_cards" });
          }
          if (microsequence.status !== "ready") {
            incomplete.push({ entityPath, reason: "microsequence_not_ready" });
          }
        }
      }
    }
  }
  return { state: incomplete.length ? "partial" : "complete", incomplete };
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
    return first(await this.rpc("replay_authoring_workspace_request_v4", {
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

  async #workspaceReference(principal, workspaceId, revision = null, deadlineAt = null) {
    return first(await this.rpc("get_authoring_workspace_v4", {
      ...principalArgs(principal),
      p_workspace_id: workspaceId,
      p_revision: revision
    }, { deadlineAt }));
  }

  async #workspaceDocument(principal, workspaceId, revision = null, deadlineAt = null) {
    const control = await this.#workspaceReference(
      principal, workspaceId, revision, deadlineAt
    );
    const document = await this.artifacts.getJson(control.artifact, { deadlineAt });
    return { control, document };
  }

  async create({
    principal,
    workspaceId,
    requestId,
    title,
    sourceCourseId = null,
    deadlineAt = null
  }) {
    const operation = sourceCourseId ? "import_course" : "create";
    const payload = { workspaceId, title, sourceCourseId };
    const payloadHash = await this.#hash(operation, payload);
    const replayed = await this.#replay(
      principal, requestId, payloadHash, operation, deadlineAt
    );
    if (replayed) return replayed;
    let source = null;
    let descriptor;
    if (sourceCourseId) {
      source = await this.#courseArtifact(principal, sourceCourseId, deadlineAt);
      descriptor = source.artifact;
    } else {
      descriptor = await this.artifacts.putJson(createEmptyAuthoringWorkspace(), {
        artifactType: "aralearn.authoring-workspace",
        bucket: AUTHORING_ARTIFACT_BUCKET,
        deadlineAt
      });
    }
    return first(await this.rpc("create_authoring_workspace_v4", {
      ...principalArgs(principal),
      p_workspace_id: workspaceId,
      p_request_id: requestId,
      p_payload_hash: payloadHash,
      p_title: title,
      p_operation: operation,
      p_artifact: descriptor,
      p_source_course_id: sourceCourseId,
      p_source_revision_hash: source?.revisionHash || null
    }, { deadlineAt }));
  }

  async list({
    principal,
    limit = 50,
    beforeUpdatedAt = null,
    beforeId = null,
    deadlineAt = null
  }) {
    return first(await this.rpc("list_authoring_workspaces_v4", {
      ...principalArgs(principal),
      p_limit: limit,
      p_before_updated_at: beforeUpdatedAt,
      p_before_id: beforeId
    }, { deadlineAt }));
  }

  async history({
    principal,
    workspaceId,
    limit = 50,
    beforeRevision = null,
    deadlineAt = null
  }) {
    return first(await this.rpc("list_authoring_workspace_history_v4", {
      ...principalArgs(principal),
      p_workspace_id: workspaceId,
      p_limit: limit,
      p_before_revision: beforeRevision
    }, { deadlineAt }));
  }

  async get({
    principal,
    workspaceId,
    revision = null,
    view = "outline",
    entityType = null,
    entityPath = null,
    includeDescendants = true,
    deadlineAt = null
  }) {
    const { control, document } = await this.#workspaceDocument(
      principal, workspaceId, revision, deadlineAt
    );
    let content;
    if (view === "outline") content = buildWorkspaceOutline(document);
    else if (view === "microtheories") content = buildMicrotheoryReview(document, entityPath);
    else if (view === "entity") {
      content = readWorkspaceEntity(document, entityType, entityPath, { includeDescendants });
    } else if (view === "document") content = document;
    else {
      throw new AuthoringApiError(422, "invalid_workspace_view", "Visualização de workspace inválida.");
    }
    return { ...control, view, content };
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
    let content;
    if (view === "outline") content = buildWorkspaceOutline(document);
    else if (view === "microtheories") content = buildMicrotheoryReview(document, entityPath);
    else if (view === "entity") {
      content = readWorkspaceEntity(document, entityType, entityPath, { includeDescendants });
    } else if (view === "document") content = document;
    else throw new AuthoringApiError(422, "invalid_course_view", "Visualização de curso inválida.");
    return {
      courseId,
      title: control.title,
      revisionHash: control.revisionHash,
      completionState: control.completionState,
      view,
      content
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
      principal, workspaceId, null, deadlineAt
    );
    if (current.control.revision !== expectedRevision) {
      throw new AuthoringApiError(
        409,
        "stale_workspace_revision",
        "O workspace mudou desde a leitura usada para preparar a alteração.",
        {
          expectedRevision,
          currentRevision: current.control.revision
        }
      );
    }
    const handlers = {
      insert_entity: insertWorkspaceEntity,
      replace_entity: replaceWorkspaceEntity,
      rename_entity: renameWorkspaceEntity,
      move_entity: moveWorkspaceEntity,
      delete_entity: deleteWorkspaceEntity,
      merge_microsequences: mergeWorkspaceMicrosequences,
      split_microsequence: splitWorkspaceMicrosequence,
      promote_module: promoteModuleToCourse,
      demote_course: demoteCourseToModule
    };
    let nextDocument;
    if (operation === "restore_revision") {
      const restored = await this.#workspaceDocument(
        principal, workspaceId, operationArguments.revision, deadlineAt
      );
      nextDocument = restored.document;
    } else {
      const handler = handlers[operation];
      if (!handler) {
        throw new AuthoringApiError(
          422, "invalid_workspace_operation", "Operação de workspace inválida."
        );
      }
      nextDocument = handler(current.document, operationArguments);
    }
    const descriptor = await this.artifacts.putJson(nextDocument, {
      artifactType: "aralearn.authoring-workspace",
      bucket: AUTHORING_ARTIFACT_BUCKET,
      deadlineAt
    });
    return first(await this.rpc("commit_authoring_workspace_revision_v4", {
      ...principalArgs(principal),
      p_workspace_id: workspaceId,
      p_request_id: requestId,
      p_payload_hash: payloadHash,
      p_expected_revision: expectedRevision,
      p_operation: operation,
      p_artifact: descriptor
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
    const current = await this.#workspaceDocument(
      principal, workspaceId, null, deadlineAt
    );
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
    const course = structuredClone(sourceDocument.courses?.[0]);
    if (!course) {
      throw new AuthoringApiError(422, "invalid_source_course", "O curso não contém uma raiz válida.");
    }
    course.id = workspaceCourseId;
    const nextDocument = insertWorkspaceEntity(current.document, {
      entityType: "course",
      parentPath: null,
      entity: course,
      position
    });
    const descriptor = await this.artifacts.putJson(nextDocument, {
      artifactType: "aralearn.authoring-workspace",
      bucket: AUTHORING_ARTIFACT_BUCKET,
      deadlineAt
    });
    return first(await this.rpc("commit_authoring_workspace_revision_v4", {
      ...principalArgs(principal),
      p_workspace_id: workspaceId,
      p_request_id: requestId,
      p_payload_hash: payloadHash,
      p_expected_revision: expectedRevision,
      p_operation: operation,
      p_artifact: descriptor
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
    publicationMode = "create",
    existingCourseId = null,
    expectedContentHash = null,
    collectionId = null,
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
      publicationMode,
      existingCourseId,
      expectedContentHash,
      collectionId
    };
    const payloadHash = await this.#hash(operation, payload);
    const replayed = await this.#replay(
      principal, requestId, payloadHash, operation, deadlineAt
    );
    if (replayed) return replayed;
    const { control, document } = await this.#workspaceDocument(
      principal, workspaceId, null, deadlineAt
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
    const descriptor = prepared.contentHash === control.artifact?.hash
      ? control.artifact
      : await this.artifacts.putJson(prepared.document, {
          artifactType: "aralearn.course-revision",
          bucket: COURSE_REVISION_BUCKET,
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
    return first(await this.rpc("publish_authoring_workspace_course_v4", {
      ...principalArgs(principal),
      p_workspace_id: workspaceId,
      p_request_id: requestId,
      p_payload_hash: payloadHash,
      p_expected_revision: expectedRevision,
      p_target: target,
      p_completion_state: requestedCompletion,
      p_publication_mode: publicationMode,
      p_existing_course_id: existingCourseId,
      p_expected_content_hash: expectedContentHash,
      p_collection_id: collectionId,
      p_metadata: metadata,
      p_artifact: descriptor
    }, { deadlineAt }));
  }

  async delete({
    principal,
    workspaceId,
    requestId,
    deadlineAt = null
  }) {
    const payload = { workspaceId };
    return first(await this.rpc("delete_authoring_workspace_v4", {
      ...principalArgs(principal),
      p_workspace_id: workspaceId,
      p_request_id: requestId,
      p_payload_hash: await this.#hash("delete_workspace", payload)
    }, { deadlineAt }));
  }
}
