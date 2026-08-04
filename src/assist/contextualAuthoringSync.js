import { deterministicUuid } from "../persistence/deterministicUuid.js";

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function findCourse(projectDocument, courseKey) {
  return (projectDocument?.courses || []).find((course) => course.id === courseKey) || null;
}

function findMicrosequence(projectDocument, path) {
  const course = findCourse(projectDocument, path.courseKey);
  const moduleValue = (course?.modules || []).find((item) => item.id === path.moduleKey);
  const lesson = (moduleValue?.lessons || []).find((item) => item.id === path.lessonKey);
  return (lesson?.microsequences || []).find((item) => item.id === path.microsequenceKey) || null;
}

function outlineMicrosequence(outline, path) {
  const course = (outline?.courses || []).find((item) => item.id === path.courseKey);
  const moduleValue = (course?.modules || []).find((item) => item.id === path.moduleKey);
  const lesson = (moduleValue?.lessons || []).find((item) => item.id === path.lessonKey);
  return (lesson?.microsequences || []).find((item) => item.id === path.microsequenceKey) || null;
}

function requestKey(draftRevision, revision, phase, path = null) {
  return [
    "aralearn:contextual-sync",
    draftRevision,
    revision,
    phase,
    ...(path ? [path.courseKey, path.moduleKey, path.lessonKey, path.microsequenceKey] : [])
  ].join(":");
}

function compactMicrosequencePart(microsequence, path) {
  return Object.fromEntries(Object.entries({
    entityType: "microsequence",
    parentPath: [path.courseKey, path.moduleKey, path.lessonKey],
    id: microsequence.id,
    title: text(microsequence.title),
    goal: text(microsequence.goal),
    position: Number(microsequence.position || 0),
    role: microsequence.role,
    branchOf: text(microsequence.branchOf) || undefined,
    dependsOn: microsequence.dependsOn,
    covers: microsequence.covers,
    checks: microsequence.checks,
    errors: microsequence.errors
  }).filter(([, value]) => value !== undefined));
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

async function catalogCollectionId(remoteCatalog, courseId) {
  if (typeof remoteCatalog?.listCollections !== "function") {
    throw new Error("A Coleção do curso oficial não pode ser consultada.");
  }
  const rows = await remoteCatalog.listCollections("");
  const current = (Array.isArray(rows) ? rows : []).find((row) =>
    String(row?.course_id ?? row?.courseId ?? "") === String(courseId)
  );
  const collectionId = current?.collection_id ?? current?.collectionId ?? null;
  if (!collectionId) throw new Error("A Coleção do curso oficial não foi encontrada.");
  return collectionId;
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
    const localMicrosequence = findMicrosequence(projectDocument, path);
    const remoteMicrosequence = outlineMicrosequence(workspace.content, path);
    if (!localMicrosequence && !remoteMicrosequence) continue;
    if (!localMicrosequence) {
      const requestId = await uuidFactory(requestKey(
        draft.revision, revision, "delete", path
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
      continue;
    }
    if (!remoteMicrosequence) {
      const requestId = await uuidFactory(requestKey(
        draft.revision, revision, "structure", path
      ));
      const result = await remoteCatalog.executeApplicationAuthoringAction(
        "criarEstruturaNoWorkspace",
        {
          requestId,
          workspaceId: workspace.workspaceId,
          expectedRevision: revision,
          parts: [compactMicrosequencePart(localMicrosequence, path)]
        }
      );
      revision = result.revision;
    }
    const requestId = await uuidFactory(requestKey(
      draft.revision, revision, "cards", path
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
  }

  workspace = await remoteCatalog.executeApplicationAuthoringAction(
    "lerWorkspaceDeAutoria",
    { workspaceId: workspace.workspaceId, view: "outline" }
  );
  revision = workspace.revision;
  const currentPublication = (workspace.publications || []).find((item) =>
    item.workspaceCourseId === courseKey && item.target === authority.writeTarget
  ) || null;
  const existingCourseId = currentPublication?.courseId || draft.courseId;
  const expectedContentHash = currentPublication?.contentHash || draft.baseContentHash;
  if (!existingCourseId || !expectedContentHash) {
    throw new Error("A publicação corrente do curso não possui base para atualização.");
  }
  const collectionId = authority.writeTarget === "catalog"
    ? await catalogCollectionId(remoteCatalog, existingCourseId)
    : null;
  const publishRequestId = await uuidFactory(requestKey(
    draft.revision, revision, "publish"
  ));
  const publication = await remoteCatalog.executeApplicationAuthoringAction(
    "publicarCursoDoWorkspace",
    {
      requestId: publishRequestId,
      workspaceId: workspace.workspaceId,
      expectedRevision: revision,
      courseId: courseKey,
      target: authority.writeTarget,
      existingCourseId,
      expectedContentHash,
      ...(collectionId ? { collectionId } : {})
    }
  );
  return {
    status: "published",
    draft,
    workspaceId: workspace.workspaceId,
    publication
  };
}
