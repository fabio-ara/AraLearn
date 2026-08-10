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

export async function prepareIntegratedCourseRemoval({
  repository,
  synchronizeReplica,
  courseId = null
} = {}) {
  if (typeof repository?.flush !== "function") {
    throw new TypeError("Persistência local indisponível para excluir o curso.");
  }
  if (typeof synchronizeReplica !== "function") {
    throw new TypeError("Sincronização indisponível para excluir o curso.");
  }
  await repository.flush();
  if (courseId && typeof repository.listPendingLocalAuthoring === "function") {
    const pending = await repository.listPendingLocalAuthoring();
    if (pending.some((entry) => String(entry.courseId) === String(courseId))) {
      const error = new Error(
        "Sincronize ou resolva primeiro as edições textuais pendentes antes de retirar o curso."
      );
      error.code = "contextual_authoring_pending";
      throw error;
    }
  }
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

async function ensureLinkedWorkspace({ remoteCatalog, courseSummary, title }) {
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
  return { workspace };
}

function materializedWorkspaceReceipt({ workspace, changed, summary, courseKey, operation }) {
  const revision = Number(changed?.revision);
  if (!Number.isSafeInteger(revision) || revision < 1) {
    throw new Error("A mutação remota não devolveu uma revisão de workspace válida.");
  }
  return {
    status: "materialized",
    source: "workspace",
    operation,
    workspaceId: String(workspace.workspaceId),
    revision,
    trailItemId: text(changed?.trailItemId || workspace?.trailItemId) || null,
    courseKey: text(courseKey),
    sourceCourseId: String(summary.courseId)
  };
}

async function refreshTrailProjection(refreshTrails) {
  if (typeof refreshTrails === "function") await refreshTrails();
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
  refreshTrails,
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
  const receipt = materializedWorkspaceReceipt({
    workspace,
    changed,
    summary,
    courseKey: entityPath[0],
    operation: "update_metadata"
  });
  await refreshTrailProjection(refreshTrails);
  return receipt;
}

export async function deleteIntegratedCourse({
  remoteCatalog,
  storage,
  syncEngine,
  synchronizeReplica,
  courseKey
}) {
  const summary = courseSummary(storage, courseKey);
  await prepareIntegratedCourseRemoval({
    repository: storage,
    synchronizeReplica,
    courseId: summary.courseId
  });
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
  refreshTrails,
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
  const receipt = materializedWorkspaceReceipt({
    workspace,
    changed,
    summary,
    courseKey: entityPath[0],
    operation: "delete_entity"
  });
  await refreshTrailProjection(refreshTrails);
  return receipt;
}

export async function moveIntegratedEntity({
  remoteCatalog,
  storage,
  refreshTrails,
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
  const receipt = materializedWorkspaceReceipt({
    workspace,
    changed,
    summary,
    courseKey: entityPath[0],
    operation: "move_entity"
  });
  await refreshTrailProjection(refreshTrails);
  return receipt;
}
