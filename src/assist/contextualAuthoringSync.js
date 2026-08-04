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

function assertDependencies({ remoteCatalog, storage, projectDocument, courseKey, pendingPaths }) {
  if (typeof remoteCatalog?.executeApplicationAuthoringAction !== "function") {
    throw new Error("A autoria contextual remota não está disponível.");
  }
  if (typeof storage?.getLocalCourseDraft !== "function") {
    throw new Error("O rascunho local não pode ser consultado.");
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
  const draft = await storage.getLocalCourseDraft(courseKey);
  if (!draft) return { status: "clean" };
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
  const currentPrivate = (workspace.publications || []).find((item) =>
    item.workspaceCourseId === courseKey && item.target === "private"
  ) || null;
  const existingCourseId = currentPrivate?.courseId || (
    draft.courseOrigin === "private" ? draft.courseId : null
  );
  const expectedContentHash = currentPrivate?.contentHash || (
    draft.courseOrigin === "private" ? draft.baseContentHash : null
  );
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
      target: "private",
      ...(existingCourseId ? { existingCourseId, expectedContentHash } : {})
    }
  );
  return {
    status: "published",
    draft,
    workspaceId: workspace.workspaceId,
    publication
  };
}
