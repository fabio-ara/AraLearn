import { deterministicUuid } from "../persistence/deterministicUuid.js";

function text(value) {
  return typeof value === "string" ? value.trim() : "";
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

export async function deleteIntegratedPrivateCourse({
  remoteCatalog,
  storage,
  synchronizeReplica,
  courseKey
}) {
  const summary = courseSummary(storage, courseKey);
  const permissions = storage.coursePermissions?.(courseKey);
  if (!permissions?.canDelete) throw new Error("Este curso não pode ser excluído nesta conta.");
  if (summary.courseOrigin === "catalog") {
    const rows = await remoteCatalog.listCollections("");
    const current = (Array.isArray(rows) ? rows : []).find((row) =>
      String(row.course_id ?? row.courseId ?? "") === summary.courseId
    );
    const collectionId = current?.collection_id ?? current?.collectionId ?? null;
    if (!collectionId) throw new Error("A Coleção do curso não foi encontrada.");
    const page = await remoteCatalog.executeApplicationAuthoringAction("consultarCatalogo", {
      operation: "list_collection_courses",
      collectionId,
      limit: 100
    });
    const item = (page?.items || []).find((course) => course.courseId === summary.courseId);
    if (!item) throw new Error("A classificação atual do curso não foi encontrada.");
    await remoteCatalog.executeApplicationAuthoringAction("retirarDoCatalogo", {
      operation: "remove_course",
      requestId: globalThis.crypto.randomUUID(),
      courseId: summary.courseId,
      expectedPlacementRevision: item.placementRevision,
      expectedContentHash: item.contentHash
    });
    await synchronizeReplica();
    return;
  }
  const linked = await findLinkedWorkspace(remoteCatalog, summary.courseId);
  if (linked) {
    const courses = linked.workspace.content?.courses || [];
    if (courses.length === 1) {
      await remoteCatalog.executeApplicationAuthoringAction("excluirDoWorkspace", {
        operation: "delete_workspace",
        requestId: globalThis.crypto.randomUUID(),
        workspaceId: linked.workspace.workspaceId,
        expectedRevision: linked.workspace.revision
      });
    } else {
      await remoteCatalog.executeApplicationAuthoringAction("excluirDoWorkspace", {
        operation: "delete_entity",
        requestId: globalThis.crypto.randomUUID(),
        workspaceId: linked.workspace.workspaceId,
        expectedRevision: linked.workspace.revision,
        entityType: "course",
        entityPath: [linked.publication.workspaceCourseId]
      });
    }
  }
  await remoteCatalog.executeApplicationAuthoringAction("retirarCursoDasTrilhas", {
    requestId: globalThis.crypto.randomUUID(),
    selectionId: summary.selectionId,
    courseId: summary.courseId,
    expectedContentHash: summary.contentHash
  });
  await synchronizeReplica();
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
