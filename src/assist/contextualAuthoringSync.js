import { deterministicUuid } from "../persistence/deterministicUuid.js";
import { canonicalStringify } from "../persistence/canonicalCourseHash.js";

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function findCourse(projectDocument, courseKey) {
  return (projectDocument?.courses || []).find((course) => course.id === courseKey) || null;
}

function findLesson(projectDocument, path) {
  const course = findCourse(projectDocument, path.courseKey);
  const moduleValue = (course?.modules || []).find((item) => item.id === path.moduleKey);
  return (moduleValue?.lessons || []).find((item) => item.id === path.lessonKey) || null;
}

function microsequenceLocation(projectDocument, path) {
  const lesson = findLesson(projectDocument, path);
  const collection = lesson?.microsequences || [];
  const index = collection.findIndex((item) => item.id === path.microsequenceKey);
  return {
    collection,
    index,
    microsequence: index >= 0 ? collection[index] : null
  };
}

function outlineLesson(outline, path) {
  const course = (outline?.courses || []).find((item) => item.id === path.courseKey);
  const moduleValue = (course?.modules || []).find((item) => item.id === path.moduleKey);
  return (moduleValue?.lessons || []).find((item) => item.id === path.lessonKey) || null;
}

function outlineMicrosequenceLocation(outline, path) {
  const lesson = outlineLesson(outline, path);
  const collection = lesson?.microsequences || [];
  const index = collection.findIndex((item) => item.id === path.microsequenceKey);
  return {
    collection,
    index,
    microsequence: index >= 0 ? collection[index] : null
  };
}

function requestKey(draftRevision, phase, path = null) {
  return [
    "aralearn:contextual-sync",
    draftRevision,
    phase,
    ...(path ? [path.courseKey, path.moduleKey, path.lessonKey, path.microsequenceKey] : [])
  ].join(":");
}

function compactMicrosequencePart(microsequence, path, position) {
  return Object.fromEntries(Object.entries({
    entityType: "microsequence",
    parentPath: [path.courseKey, path.moduleKey, path.lessonKey],
    id: microsequence.id,
    title: text(microsequence.title),
    goal: text(microsequence.goal),
    position,
    role: microsequence.role,
    branchOf: text(microsequence.branchOf) || undefined,
    dependsOn: microsequence.dependsOn,
    covers: microsequence.covers,
    checks: microsequence.checks,
    errors: microsequence.errors
  }).filter(([, value]) => value !== undefined));
}

function outlineMicrosequenceFromLocal(microsequence, path) {
  return {
    id: microsequence.id,
    entityPath: [
      path.courseKey,
      path.moduleKey,
      path.lessonKey,
      microsequence.id
    ],
    ...structuredClone(microsequenceMetadata(microsequence)),
    status: microsequence.status,
    cardCount: Array.isArray(microsequence.cards) ? microsequence.cards.length : 0
  };
}

function insertAt(collection, value, position) {
  collection.splice(Math.min(Math.max(0, position), collection.length), 0, value);
}

function moveOutlineMicrosequence(location, position) {
  const [microsequence] = location.collection.splice(location.index, 1);
  insertAt(location.collection, microsequence, position);
}

function microsequenceMetadata(microsequence = {}) {
  return Object.fromEntries(Object.entries({
    title: text(microsequence.title) || undefined,
    goal: text(microsequence.goal) || undefined,
    role: microsequence.role,
    branchOf: text(microsequence.branchOf) || null,
    dependsOn: Array.isArray(microsequence.dependsOn) ? microsequence.dependsOn : [],
    covers: Array.isArray(microsequence.covers) ? microsequence.covers : [],
    checks: Array.isArray(microsequence.checks) ? microsequence.checks : [],
    errors: Array.isArray(microsequence.errors) ? microsequence.errors : []
  }).filter(([, value]) => value !== undefined));
}

function metadataChanged(localMicrosequence, remoteMicrosequence) {
  return canonicalStringify(microsequenceMetadata(localMicrosequence)) !==
    canonicalStringify(microsequenceMetadata(remoteMicrosequence));
}

function courseAuthority(storage, courseKey) {
  if (typeof storage?.coursePermissions !== "function") {
    throw new Error("A autoridade do curso não pode ser consultada.");
  }
  const permissions = storage.coursePermissions(courseKey) || {};
  const writeTarget = permissions.writeTarget;
  if (
    permissions.canAuthorContent !== true ||
    (writeTarget !== "private" && writeTarget !== "catalog")
  ) {
    const error = new Error("Este curso não pode ser alterado nesta conta.");
    error.code = "course_authoring_forbidden";
    throw error;
  }
  return { ...permissions, writeTarget };
}

function assertDependencies({ remoteCatalog, storage, projectDocument, courseKey, pendingPaths }) {
  if (typeof remoteCatalog?.executeApplicationAuthoringAction !== "function") {
    throw new Error("A autoria contextual remota não está disponível.");
  }
  if (typeof storage?.getLocalCourseDraft !== "function") {
    throw new Error("O rascunho local não pode ser consultado.");
  }
  if (typeof storage?.coursePermissions !== "function") {
    throw new Error("A autoridade do curso não pode ser consultada.");
  }
  if (!projectDocument || !findCourse(projectDocument, courseKey)) {
    throw new Error("O curso local da sincronização não existe.");
  }
  if (!Array.isArray(pendingPaths) || !pendingPaths.length) {
    throw new Error("Não há reparo contextual pendente.");
  }
}

export async function materializeContextualCourseDraft({
  remoteCatalog,
  storage,
  projectDocument,
  courseKey,
  pendingPaths,
  uuidFactory = deterministicUuid
}) {
  assertDependencies({ remoteCatalog, storage, projectDocument, courseKey, pendingPaths });
  const authority = courseAuthority(storage, courseKey);
  const draft = await storage.getLocalCourseDraft(courseKey);
  if (!draft) return { status: "clean" };
  if (draft.courseOrigin !== authority.writeTarget) {
    const error = new Error("A origem do curso diverge do destino autorizado para escrita.");
    error.code = "course_authoring_authority_mismatch";
    throw error;
  }
  const course = findCourse(projectDocument, courseKey);
  const createRequestId = await uuidFactory(`aralearn:contextual-workspace:${draft.courseId}`);
  const created = await remoteCatalog.executeApplicationAuthoringAction(
    "criarWorkspaceDeAutoria",
    {
      requestId: createRequestId,
      title: `${course.title} · edição contextual`,
      brief: "Correções pontuais confirmadas no modo Editar do aplicativo.",
      sourceCourseId: draft.courseId
    }
  );
  let workspace = await remoteCatalog.executeApplicationAuthoringAction(
    "lerWorkspaceDeAutoria",
    { workspaceId: created.workspaceId, view: "outline" }
  );
  let revision = workspace.revision;

  for (const path of pendingPaths) {
    const localLocation = microsequenceLocation(projectDocument, path);
    let remoteLocation = outlineMicrosequenceLocation(workspace.content, path);
    const localMicrosequence = localLocation.microsequence;
    let remoteMicrosequence = remoteLocation.microsequence;
    if (!localMicrosequence && !remoteMicrosequence) continue;
    if (!localMicrosequence) {
      const requestId = await uuidFactory(requestKey(
        draft.revision, "delete", path
      ));
      const result = await remoteCatalog.executeApplicationAuthoringAction(
        "excluirDoWorkspace",
        {
          operation: "delete_entity",
          requestId,
          workspaceId: workspace.workspaceId,
          expectedRevision: revision,
          entityType: "microsequence",
          entityPath: [path.courseKey, path.moduleKey, path.lessonKey, path.microsequenceKey]
        }
      );
      revision = result.revision;
      remoteLocation.collection.splice(remoteLocation.index, 1);
      continue;
    }
    if (!remoteMicrosequence) {
      const requestId = await uuidFactory(requestKey(
        draft.revision, "structure", path
      ));
      const result = await remoteCatalog.executeApplicationAuthoringAction(
        "criarEstruturaNoWorkspace",
        {
          requestId,
          workspaceId: workspace.workspaceId,
          expectedRevision: revision,
          parts: [compactMicrosequencePart(
            localMicrosequence,
            path,
            localLocation.index
          )]
        }
      );
      revision = result.revision;
      insertAt(
        remoteLocation.collection,
        outlineMicrosequenceFromLocal(localMicrosequence, path),
        localLocation.index
      );
      remoteLocation = outlineMicrosequenceLocation(workspace.content, path);
      remoteMicrosequence = remoteLocation.microsequence;
    } else {
      if (metadataChanged(localMicrosequence, remoteMicrosequence)) {
        const requestId = await uuidFactory(requestKey(
          draft.revision, "metadata", path
        ));
        const result = await remoteCatalog.executeApplicationAuthoringAction(
          "atualizarMetadadosDaEntidade",
          {
            requestId,
            workspaceId: workspace.workspaceId,
            expectedRevision: revision,
            entityType: "microsequence",
            entityPath: [path.courseKey, path.moduleKey, path.lessonKey, path.microsequenceKey],
            ...microsequenceMetadata(localMicrosequence)
          }
        );
        revision = result.revision;
        Object.assign(
          remoteMicrosequence,
          structuredClone(microsequenceMetadata(localMicrosequence))
        );
      }
      if (localLocation.index !== remoteLocation.index) {
        const requestId = await uuidFactory(requestKey(
          draft.revision, "position", path
        ));
        const result = await remoteCatalog.executeApplicationAuthoringAction(
          "reorganizarWorkspace",
          {
            operation: "move_entity",
            requestId,
            workspaceId: workspace.workspaceId,
            expectedRevision: revision,
            entityType: "microsequence",
            entityPath: [path.courseKey, path.moduleKey, path.lessonKey, path.microsequenceKey],
            targetParentPath: [path.courseKey, path.moduleKey, path.lessonKey],
            position: localLocation.index
          }
        );
        revision = result.revision;
        moveOutlineMicrosequence(remoteLocation, localLocation.index);
        remoteLocation = outlineMicrosequenceLocation(workspace.content, path);
        remoteMicrosequence = remoteLocation.microsequence;
      }
    }
    const requestId = await uuidFactory(requestKey(
      draft.revision, "cards", path
    ));
    const result = await remoteCatalog.executeApplicationAuthoringAction(
      "salvarCardsNaMicrossequencia",
      {
        requestId,
        workspaceId: workspace.workspaceId,
        expectedRevision: revision,
        microsequencePath: [path.courseKey, path.moduleKey, path.lessonKey, path.microsequenceKey],
        mode: "replace",
        cardsJson: JSON.stringify(localMicrosequence.cards || [])
      }
    );
    revision = result.revision;
    remoteMicrosequence.status = Array.isArray(localMicrosequence.cards)
      && localMicrosequence.cards.length
      ? "ready"
      : "planned";
    remoteMicrosequence.cardCount = Array.isArray(localMicrosequence.cards)
      ? localMicrosequence.cards.length
      : 0;
  }

  workspace = await remoteCatalog.executeApplicationAuthoringAction(
    "lerWorkspaceDeAutoria",
    { workspaceId: workspace.workspaceId, view: "outline" }
  );
  revision = workspace.revision;
  const trailItemId = text(
    workspace.trailItemId || created.trailItemId || workspace.trail?.itemId
  ) || null;
  return {
    status: "materialized",
    draft,
    workspaceId: workspace.workspaceId,
    courseKey,
    revision,
    trailItemId,
    source: "workspace",
    localFinalization: {
      courseKey,
      expectedLocalDraftRevision: draft.revision,
      workspaceId: workspace.workspaceId,
      workspaceRevision: revision
    }
  };
}

export async function finalizeContextualCourseDraftSync({
  storage,
  courseKey,
  expectedLocalDraftRevision,
  workspaceId = null,
  workspaceRevision = null
}) {
  if (typeof storage?.finalizeCardAssistanceSync !== "function") {
    throw new Error("A finalização local da autoria contextual não está disponível.");
  }
  const normalizedCourseKey = text(courseKey);
  const normalizedRevision = text(expectedLocalDraftRevision);
  if (!normalizedCourseKey || !normalizedRevision) {
    throw new Error("A finalização local da autoria contextual é inválida.");
  }
  const normalizedWorkspaceId = text(workspaceId);
  if (normalizedWorkspaceId) {
    if (typeof storage?.acknowledgeWorkspaceCourseDraft !== "function") {
      throw new Error("A confirmação local da composição remota não está disponível.");
    }
    await storage.acknowledgeWorkspaceCourseDraft(normalizedCourseKey, {
      expectedLocalDraftRevision: normalizedRevision,
      workspaceId: normalizedWorkspaceId,
      workspaceRevision
    });
  }
  return storage.finalizeCardAssistanceSync(normalizedCourseKey, {
    expectedLocalDraftRevision: normalizedRevision
  });
}

export async function finalizeCleanContextualCourseDraftSync({
  storage,
  courseKey,
  localState
}) {
  const expectedLocalDraftRevision = text(localState?.sync?.expectedRevision);
  if (!expectedLocalDraftRevision) return { attempted: false, localState: null };
  return {
    attempted: true,
    localState: await finalizeContextualCourseDraftSync({
      storage,
      courseKey,
      expectedLocalDraftRevision
    })
  };
}
