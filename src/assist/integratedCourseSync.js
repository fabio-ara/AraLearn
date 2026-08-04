import {
  executeIdempotentCourseRemoval,
  privateCourseRemovalRequestId,
  removeCatalogCourse
} from "./courseRemovalCommand.js";
import { deterministicUuid } from "../persistence/deterministicUuid.js";

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

export class CourseRemovalCommittedError extends Error {
  constructor(courseId, cause = null) {
    super(
      "O curso já foi retirado no servidor, mas este dispositivo ainda não atualizou a lista. Use Sincronizar; não repita a exclusão.",
      cause ? { cause } : undefined
    );
    this.name = "CourseRemovalCommittedError";
    this.code = "COURSE_REMOVAL_COMMITTED_LOCAL_RECONCILIATION_PENDING";
    this.courseId = String(courseId || "");
    this.remoteCommitted = true;
  }
}

export function courseRemovalWasCommitted(error) {
  return error?.remoteCommitted === true ||
    error?.code === "COURSE_REMOVAL_COMMITTED_LOCAL_RECONCILIATION_PENDING";
}

function selectedCourseStillExists(repository, courseId) {
  if (typeof repository?.loadCourseSummaries !== "function") return null;
  return (repository.loadCourseSummaries() || []).some((summary) =>
    String(summary?.courseId || "") === String(courseId || "")
  );
}

function reconciliationCause(failures) {
  if (failures.length === 1) return failures[0];
  return failures.length ? new AggregateError(failures, "Falha ao reconciliar a exclusão local.") : null;
}

export async function prepareIntegratedCourseRemoval({ repository, synchronizeReplica } = {}) {
  if (typeof repository?.flush !== "function") {
    throw new TypeError("Persistência local indisponível para excluir o curso.");
  }
  if (typeof synchronizeReplica !== "function") {
    throw new TypeError("Sincronização indisponível para excluir o curso.");
  }
  await repository.flush();
  await synchronizeReplica({ guaranteeFresh: true });
}

export async function reconcileCommittedCourseRemoval({
  syncEngine,
  repository,
  synchronizeReplica,
  courseId
} = {}) {
  if (typeof syncEngine?.confirmSelectedCourseRemoval !== "function") {
    throw new CourseRemovalCommittedError(
      courseId,
      new TypeError("Sincronização local indisponível para retirar o curso.")
    );
  }
  if (typeof repository?.refreshFromReplica !== "function") {
    throw new CourseRemovalCommittedError(
      courseId,
      new TypeError("Repositório local indisponível para retirar o curso.")
    );
  }
  if (typeof synchronizeReplica !== "function") {
    throw new CourseRemovalCommittedError(
      courseId,
      new TypeError("Sincronização indisponível para retirar o curso.")
    );
  }

  const failures = [];
  let directConfirmationSucceeded = false;
  let freshSynchronizationSucceeded = false;
  let refreshSucceeded = false;
  try {
    await syncEngine.confirmSelectedCourseRemoval(courseId);
    directConfirmationSucceeded = true;
  } catch (error) {
    failures.push(error);
  }
  try {
    await synchronizeReplica({ guaranteeFresh: true });
    freshSynchronizationSucceeded = true;
  } catch (error) {
    failures.push(error);
  }
  try {
    await repository.refreshFromReplica();
    refreshSucceeded = true;
  } catch (error) {
    failures.push(error);
  }

  let stillSelected = null;
  let selectionCheckSucceeded = false;
  try {
    stillSelected = selectedCourseStillExists(repository, courseId);
    selectionCheckSucceeded = true;
  } catch (error) {
    failures.push(error);
  }
  const reconciled = selectionCheckSucceeded && (stillSelected === false || (
    stillSelected === null &&
    directConfirmationSucceeded &&
    freshSynchronizationSucceeded &&
    refreshSucceeded
  ));
  if (!reconciled) {
    throw new CourseRemovalCommittedError(courseId, reconciliationCause(failures));
  }
  return {
    status: "reconciled",
    courseId: String(courseId || ""),
    recoveredByFreshSynchronization: !directConfirmationSucceeded,
    warnings: failures
  };
}

async function listWorkspaces(remoteCatalog) {
  const items = [];
  let cursor = null;
  do {
    const result = await remoteCatalog.executeApplicationAuthoringAction(
      "listarWorkspacesDeAutoria",
      {
        limit: 100,
        ...(cursor?.beforeUpdatedAt ? { beforeUpdatedAt: cursor.beforeUpdatedAt } : {}),
        ...(cursor?.beforeId ? { beforeId: cursor.beforeId } : {})
      }
    );
    items.push(...(Array.isArray(result?.items) ? result.items : []));
    cursor = result?.hasMore === true ? result.nextCursor : null;
  } while (cursor?.beforeUpdatedAt && cursor?.beforeId);
  return items;
}

async function findLinkedWorkspace(remoteCatalog, courseId) {
  const workspaces = await listWorkspaces(remoteCatalog);
  for (const summary of workspaces) {
    const workspace = await remoteCatalog.executeApplicationAuthoringAction(
      "lerWorkspaceDeAutoria",
      { workspaceId: summary.workspaceId, view: "outline" }
    );
    const publication = (workspace.publications || []).find((item) => item.courseId === courseId);
    if (publication) return { workspace, publication };
  }
  return null;
}

async function ensureLinkedWorkspace({ remoteCatalog, courseSummary, title }) {
  const linked = await findLinkedWorkspace(remoteCatalog, courseSummary.courseId);
  if (linked) return linked;
  const requestId = await deterministicUuid(`aralearn:integrated-course:${courseSummary.courseId}`);
  const created = await remoteCatalog.executeApplicationAuthoringAction(
    "criarWorkspaceDeAutoria",
    {
      requestId,
      title: `${title || courseSummary.title || "Curso"} · edição`,
      brief: "Edição contextual confirmada no AraLearn.",
      sourceCourseId: courseSummary.courseId
    }
  );
  const workspace = await remoteCatalog.executeApplicationAuthoringAction(
    "lerWorkspaceDeAutoria",
    { workspaceId: created.workspaceId, view: "outline" }
  );
  const publication = (workspace.publications || []).find((item) =>
    item.courseId === courseSummary.courseId
  ) || null;
  return { workspace, publication };
}

function courseSummary(storage, courseKey) {
  const resolved = storage.resolveCourseContractKey?.(courseKey) || text(courseKey);
  const item = (storage.loadCourseSummaries?.() || []).find((summary) =>
    storage.resolveCourseContractKey?.(summary.courseId) === resolved
  );
  if (!item) throw new Error("Curso remoto não encontrado.");
  return item;
}

export async function saveIntegratedEntityMetadata({
  remoteCatalog,
  storage,
  syncEngine,
  synchronizeReplica,
  courseKey,
  entityType,
  entityPath,
  metadata,
  title
}) {
  const summary = courseSummary(storage, courseKey);
  const permissions = storage.coursePermissions?.(courseKey);
  if (!permissions?.canEdit) throw new Error("Este curso não pode ser alterado nesta conta.");
  const { workspace } = await ensureLinkedWorkspace({ remoteCatalog, courseSummary: summary, title });
  const requestId = globalThis.crypto.randomUUID();
  const changed = await remoteCatalog.executeApplicationAuthoringAction(
    "atualizarMetadadosDaEntidade",
    {
      requestId,
      workspaceId: workspace.workspaceId,
      expectedRevision: workspace.revision,
      entityType,
      entityPath,
      ...metadata
    }
  );
  const target = summary.courseOrigin === "catalog" ? "catalog" : "private";
  let collectionId = null;
  if (target === "catalog") {
    const rows = await remoteCatalog.listCollections("");
    const current = (Array.isArray(rows) ? rows : []).find((row) =>
      String(row.course_id ?? row.courseId ?? "") === summary.courseId
    );
    collectionId = current?.collection_id ?? current?.collectionId ?? null;
    if (!collectionId) throw new Error("A Coleção do curso não foi encontrada.");
  }
  const published = await remoteCatalog.executeApplicationAuthoringAction(
    "publicarCursoDoWorkspace",
    {
      requestId: globalThis.crypto.randomUUID(),
      workspaceId: workspace.workspaceId,
      expectedRevision: changed.revision,
      courseId: entityPath[0],
      target,
      ...(collectionId ? { collectionId } : {})
    }
  );
  const localDraft = await storage.getLocalCourseDraft?.(courseKey);
  if (localDraft) {
    await syncEngine.restoreDeferredCourseRevision({
      courseId: summary.courseId,
      expectedLocalDraftRevision: localDraft.revision
    });
  }
  await synchronizeReplica({ expectedCourseIds: [published.courseId] });
  return published;
}

export async function deleteIntegratedCourse({
  remoteCatalog,
  storage,
  syncEngine,
  synchronizeReplica,
  courseKey
}) {
  await prepareIntegratedCourseRemoval({
    repository: storage,
    synchronizeReplica
  });
  const summary = courseSummary(storage, courseKey);
  const permissions = storage.coursePermissions?.(courseKey);
  if (!permissions?.canDelete) throw new Error("Este curso não pode ser excluído nesta conta.");
  if (summary.courseOrigin === "catalog") {
    const removed = await removeCatalogCourse({
      remoteCatalog,
      courseId: summary.courseId
    });
    await reconcileCommittedCourseRemoval({
      syncEngine,
      repository: storage,
      synchronizeReplica,
      courseId: summary.courseId
    });
    return removed;
  }
  const requestId = await privateCourseRemovalRequestId({
    selectionId: summary.selectionId,
    courseId: summary.courseId,
    contentHash: summary.contentHash
  });
  const removed = await executeIdempotentCourseRemoval({
    remoteCatalog,
    action: "retirarCursoDasTrilhas",
    argumentsValue: {
      requestId,
      selectionId: summary.selectionId,
      courseId: summary.courseId,
      expectedContentHash: summary.contentHash
    }
  });
  await reconcileCommittedCourseRemoval({
    syncEngine,
    repository: storage,
    synchronizeReplica,
    courseId: summary.courseId
  });
  return removed;
}

export async function deleteIntegratedEntity({
  remoteCatalog,
  storage,
  syncEngine,
  synchronizeReplica,
  courseKey,
  entityType,
  entityPath,
  title
}) {
  const summary = courseSummary(storage, courseKey);
  const permissions = storage.coursePermissions?.(courseKey);
  if (!permissions?.canEdit) throw new Error("Este conteúdo não pode ser excluído nesta conta.");
  const { workspace } = await ensureLinkedWorkspace({ remoteCatalog, courseSummary: summary, title });
  const changed = await remoteCatalog.executeApplicationAuthoringAction("excluirDoWorkspace", {
    operation: "delete_entity",
    requestId: globalThis.crypto.randomUUID(),
    workspaceId: workspace.workspaceId,
    expectedRevision: workspace.revision,
    entityType,
    entityPath
  });
  const target = summary.courseOrigin === "catalog" ? "catalog" : "private";
  let collectionId = null;
  if (target === "catalog") {
    const rows = await remoteCatalog.listCollections("");
    const current = (Array.isArray(rows) ? rows : []).find((row) =>
      String(row.course_id ?? row.courseId ?? "") === summary.courseId
    );
    collectionId = current?.collection_id ?? current?.collectionId ?? null;
    if (!collectionId) throw new Error("A Coleção do curso não foi encontrada.");
  }
  const published = await remoteCatalog.executeApplicationAuthoringAction("publicarCursoDoWorkspace", {
    requestId: globalThis.crypto.randomUUID(),
    workspaceId: workspace.workspaceId,
    expectedRevision: changed.revision,
    courseId: entityPath[0],
    target,
    ...(collectionId ? { collectionId } : {})
  });
  const localDraft = await storage.getLocalCourseDraft?.(courseKey);
  if (localDraft) {
    await syncEngine.restoreDeferredCourseRevision({
      courseId: summary.courseId,
      expectedLocalDraftRevision: localDraft.revision
    });
  }
  await synchronizeReplica({ expectedCourseIds: [published.courseId] });
  return published;
}

export async function moveIntegratedEntity({
  remoteCatalog,
  storage,
  syncEngine,
  synchronizeReplica,
  courseKey,
  entityType,
  entityPath,
  targetParentPath,
  position,
  title
}) {
  const summary = courseSummary(storage, courseKey);
  const permissions = storage.coursePermissions?.(courseKey);
  if (!permissions?.canEdit) throw new Error("Este conteúdo não pode ser movido nesta conta.");
  const { workspace } = await ensureLinkedWorkspace({ remoteCatalog, courseSummary: summary, title });
  const changed = await remoteCatalog.executeApplicationAuthoringAction("reorganizarWorkspace", {
    operation: "move_entity",
    requestId: globalThis.crypto.randomUUID(),
    workspaceId: workspace.workspaceId,
    expectedRevision: workspace.revision,
    entityType,
    entityPath,
    targetParentPath,
    position
  });
  const target = summary.courseOrigin === "catalog" ? "catalog" : "private";
  let collectionId = null;
  if (target === "catalog") {
    const rows = await remoteCatalog.listCollections("");
    const current = (Array.isArray(rows) ? rows : []).find((row) =>
      String(row.course_id ?? row.courseId ?? "") === summary.courseId
    );
    collectionId = current?.collection_id ?? current?.collectionId ?? null;
    if (!collectionId) throw new Error("A Coleção do curso não foi encontrada.");
  }
  const published = await remoteCatalog.executeApplicationAuthoringAction("publicarCursoDoWorkspace", {
    requestId: globalThis.crypto.randomUUID(),
    workspaceId: workspace.workspaceId,
    expectedRevision: changed.revision,
    courseId: entityPath[0],
    target,
    ...(collectionId ? { collectionId } : {})
  });
  const localDraft = await storage.getLocalCourseDraft?.(courseKey);
  if (localDraft) {
    await syncEngine.restoreDeferredCourseRevision({
      courseId: summary.courseId,
      expectedLocalDraftRevision: localDraft.revision
    });
  }
  await synchronizeReplica({ expectedCourseIds: [published.courseId] });
  return published;
}
