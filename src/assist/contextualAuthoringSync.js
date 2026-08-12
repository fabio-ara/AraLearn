import { deterministicUuid } from "../persistence/deterministicUuid.js";
import { canonicalStringify } from "../persistence/canonicalCourseHash.js";
import { rebaseCardAssistanceTextChange } from "./cardAssistanceScope.js";

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
    cards: [],
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
  return {
    title: text(microsequence.title),
    goal: text(microsequence.goal),
    role: text(microsequence.role),
    branchOf: text(microsequence.branchOf) || null,
    dependsOn: Array.isArray(microsequence.dependsOn) ? microsequence.dependsOn : [],
    covers: Array.isArray(microsequence.covers) ? microsequence.covers : [],
    checks: Array.isArray(microsequence.checks) ? microsequence.checks : [],
    errors: Array.isArray(microsequence.errors) ? microsequence.errors : []
  };
}

function contextualConflict(message) {
  const error = new Error(message);
  error.code = "contextual_authoring_conflict";
  error.conflict = true;
  return error;
}

function sameCanonical(left, right) {
  return canonicalStringify(left) === canonicalStringify(right);
}

function cardIds(cards = []) {
  return cards.map((card) => text(card?.id));
}

function reconcilePendingCards({
  baseCards,
  localCards,
  remoteCards,
  textOnly = false,
  conflictPolicy = "reject"
}) {
  if (!Array.isArray(baseCards) || !Array.isArray(localCards) || !Array.isArray(remoteCards)) {
    throw contextualConflict(
      "Não foi possível comprovar a base dos cards. A alteração offline foi preservada para revisão."
    );
  }
  const baseIds = cardIds(baseCards);
  const localIds = cardIds(localCards);
  const remoteIds = cardIds(remoteCards);
  if (![baseIds, localIds, remoteIds].every((ids) =>
    ids.every(Boolean) && new Set(ids).size === ids.length
  )) {
    throw contextualConflict("A microssequência possui identidades de card incompatíveis.");
  }
  if (sameCanonical(localCards, baseCards) || sameCanonical(remoteCards, localCards)) {
    return { cards: structuredClone(remoteCards), changed: false };
  }
  if (!sameCanonical(localIds, baseIds)) {
    if (sameCanonical(remoteCards, baseCards)) {
      return { cards: structuredClone(localCards), changed: true };
    }
    throw contextualConflict(
      "A estrutura dos cards mudou em outro dispositivo. A alteração local foi preservada."
    );
  }

  if (textOnly) {
    try {
      const baseById = new Map(baseCards.map((card) => [text(card.id), card]));
      const localById = new Map(localCards.map((card) => [text(card.id), card]));
      const remoteIdsSet = new Set(remoteIds);
      for (const id of baseIds) {
        if (!remoteIdsSet.has(id) && !sameCanonical(baseById.get(id), localById.get(id))) {
          throw new Error(`O card "${id}" editado localmente foi retirado em outro dispositivo.`);
        }
      }
      const cards = remoteCards.map((remoteCard) => {
        const id = text(remoteCard.id);
        const baseCard = baseById.get(id);
        const localCard = localById.get(id);
        if (!baseCard || !localCard) return structuredClone(remoteCard);
        const alignedBase = { ...structuredClone(baseCard), position: remoteCard.position };
        const alignedLocal = { ...structuredClone(localCard), position: remoteCard.position };
        return rebaseCardAssistanceTextChange({
          baseCard: alignedBase,
          localCard: alignedLocal,
          remoteCard,
          conflictPolicy
        }).card;
      });
      return { cards, changed: !sameCanonical(cards, remoteCards) };
    } catch (error) {
      throw contextualConflict(
        error instanceof Error
          ? error.message
          : "O mesmo texto também foi alterado em outro dispositivo."
      );
    }
  }

  const baseById = new Map(baseCards.map((card) => [text(card.id), card]));
  const localById = new Map(localCards.map((card) => [text(card.id), card]));
  const remoteById = new Map(remoteCards.map((card) => [text(card.id), card]));
  const mergedById = new Map(remoteCards.map((card) => [text(card.id), structuredClone(card)]));
  for (const id of baseIds.filter((cardId) =>
    !sameCanonical(baseById.get(cardId), localById.get(cardId))
  )) {
    const baseCard = baseById.get(id);
    const localCard = localById.get(id);
    const remoteCard = remoteById.get(id);
    if (!remoteCard) {
      throw contextualConflict(
        `O card "${id}" foi retirado em outro dispositivo. A edição local foi preservada.`
      );
    }
    if (sameCanonical(remoteCard, localCard)) continue;
    if (!sameCanonical(remoteCard, baseCard)) {
      throw contextualConflict(
        `O card "${id}" também foi alterado em outro dispositivo. Escolha qual redação deve prevalecer.`
      );
    }
    mergedById.set(id, structuredClone(localCard));
  }
  const merged = remoteIds.map((id) => mergedById.get(id));
  return { cards: merged, changed: !sameCanonical(merged, remoteCards) };
}

function reconcilePendingMetadata({ baseMetadata, localMicrosequence, remoteMicrosequence }) {
  const localMetadata = microsequenceMetadata(localMicrosequence);
  const remoteMetadata = microsequenceMetadata(remoteMicrosequence);
  if (!baseMetadata) {
    if (sameCanonical(localMetadata, remoteMetadata)) {
      return { changed: false, metadata: remoteMetadata };
    }
    throw contextualConflict(
      "Os metadados da microssequência não possuem uma base verificável. A alteração foi preservada."
    );
  }
  if (sameCanonical(localMetadata, baseMetadata) || sameCanonical(remoteMetadata, localMetadata)) {
    return { changed: false, metadata: remoteMetadata };
  }
  if (!sameCanonical(remoteMetadata, baseMetadata)) {
    throw contextualConflict(
      "A microssequência também foi alterada em outro dispositivo. A alteração local foi preservada."
    );
  }
  return { changed: true, metadata: localMetadata };
}

function outlineEntity(outline, entityType, entityPath) {
  const course = (outline?.courses || []).find((item) => item.id === entityPath?.[0]);
  if (entityType === "course") return course || null;
  const moduleValue = (course?.modules || []).find((item) => item.id === entityPath?.[1]);
  if (entityType === "module") return moduleValue || null;
  const lesson = (moduleValue?.lessons || []).find((item) => item.id === entityPath?.[2]);
  if (entityType === "lesson") return lesson || null;
  return (lesson?.microsequences || []).find((item) => item.id === entityPath?.[3]) || null;
}

function entityMetadata(entity, template) {
  return Object.fromEntries(Object.keys(template || {}).map((field) => [
    field,
    structuredClone(entity?.[field] ?? (field === "branchOf" ? null : ""))
  ]));
}

function reconcileEntityMetadata(remoteEntity, operation, { conflictPolicy = "reject" } = {}) {
  if (!remoteEntity) {
    throw contextualConflict("O rótulo editado não existe mais no workspace.");
  }
  const remoteMetadata = entityMetadata(remoteEntity, operation.metadata);
  const metadata = {};
  for (const field of Object.keys(operation.metadata)) {
    const baseValue = operation.baseMetadata[field];
    const localValue = operation.metadata[field];
    const remoteValue = remoteMetadata[field];
    if (sameCanonical(localValue, baseValue)) {
      metadata[field] = structuredClone(remoteValue);
    } else if (sameCanonical(remoteValue, baseValue) || sameCanonical(remoteValue, localValue) ||
               conflictPolicy === "local") {
      metadata[field] = structuredClone(localValue);
    } else {
      throw contextualConflict(`O campo "${field}" também foi alterado em outro dispositivo.`);
    }
  }
  return { changed: !sameCanonical(remoteMetadata, metadata), metadata };
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

function assertDependencies({
  remoteCatalog,
  storage,
  projectDocument,
  courseKey,
  pendingPaths,
  pendingMetadata,
  hasDraftSnapshot
}) {
  if (typeof remoteCatalog?.executeApplicationAuthoringAction !== "function") {
    throw new Error("A autoria contextual remota não está disponível.");
  }
  if (!hasDraftSnapshot && typeof storage?.getLocalCourseDraft !== "function") {
    throw new Error("O rascunho local não pode ser consultado.");
  }
  if (typeof storage?.coursePermissions !== "function") {
    throw new Error("A autoridade do curso não pode ser consultada.");
  }
  if (!projectDocument || !findCourse(projectDocument, courseKey)) {
    throw new Error("O curso local da sincronização não existe.");
  }
  if ((!Array.isArray(pendingPaths) || !pendingPaths.length) &&
      (!Array.isArray(pendingMetadata) || !pendingMetadata.length)) {
    throw new Error("Não há reparo contextual pendente.");
  }
}

export async function materializeContextualCourseDraft({
  remoteCatalog,
  storage,
  projectDocument,
  courseKey,
  pendingPaths = [],
  pendingMetadata = [],
  expectedLocalDraftRevision = null,
  draftSnapshot = undefined,
  conflictPolicy = "reject",
  uuidFactory = deterministicUuid
}) {
  assertDependencies({
    remoteCatalog,
    storage,
    projectDocument,
    courseKey,
    pendingPaths,
    pendingMetadata,
    hasDraftSnapshot: draftSnapshot !== undefined
  });
  const authority = courseAuthority(storage, courseKey);
  const draft = draftSnapshot === undefined
    ? await storage.getLocalCourseDraft(courseKey)
    : draftSnapshot;
  if (!draft) {
    const consumedRevision = text(expectedLocalDraftRevision);
    const receipt = consumedRevision &&
      typeof storage.getWorkspaceCourseDraftReceipt === "function"
      ? await storage.getWorkspaceCourseDraftReceipt(courseKey)
      : null;
    if (receipt?.consumedRevision === consumedRevision) {
      return { status: "clean", receipt };
    }
    const error = new Error(
      "A alteração offline continua pendente, mas seu rascunho local não está disponível. A fila foi preservada para recuperação."
    );
    error.code = "contextual_authoring_draft_missing";
    throw error;
  }
  const expectedRevision = text(expectedLocalDraftRevision);
  if (expectedRevision && text(draft.revision) !== expectedRevision) {
    const error = new Error(
      "O rascunho mudou durante a sincronização. A edição mais nova foi preservada para outra tentativa."
    );
    error.code = "local_course_draft_changed";
    throw error;
  }
  if (draft.courseOrigin !== authority.writeTarget) {
    const error = new Error("A origem do curso diverge do destino autorizado para escrita.");
    error.code = "course_authoring_authority_mismatch";
    throw error;
  }
  const course = findCourse(projectDocument, courseKey);
  const createRequestId = await uuidFactory(
    `aralearn:contextual-workspace:${draft.courseId}:${draft.revision}`
  );
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
    { workspaceId: created.workspaceId, view: "document" }
  );
  let revision = workspace.revision;
  const initialRevision = revision;

  for (const operation of pendingMetadata) {
    const remoteEntity = outlineEntity(
      workspace.content,
      operation.entityType,
      operation.entityPath
    );
    const reconciliation = reconcileEntityMetadata(remoteEntity, operation, { conflictPolicy });
    if (!reconciliation.changed) continue;
    const metadataRequestId = await uuidFactory([
      "aralearn:contextual-sync",
      draft.revision,
      "entity-metadata",
      operation.entityType,
      ...operation.entityPath
    ].join(":"));
    const result = await remoteCatalog.executeApplicationAuthoringAction(
      "atualizarMetadadosDaEntidade",
      {
        requestId: metadataRequestId,
        workspaceId: workspace.workspaceId,
        expectedRevision: revision,
        entityType: operation.entityType,
        entityPath: operation.entityPath,
        ...reconciliation.metadata
      }
    );
    revision = result.revision;
    Object.assign(remoteEntity, structuredClone(reconciliation.metadata));
  }

  for (const path of pendingPaths) {
    const localLocation = microsequenceLocation(projectDocument, path);
    let remoteLocation = outlineMicrosequenceLocation(workspace.content, path);
    const localMicrosequence = localLocation.microsequence;
    let remoteMicrosequence = remoteLocation.microsequence;
    let createdFromLocal = false;
    if (!localMicrosequence && !remoteMicrosequence) continue;
    if (!localMicrosequence) {
      if (path.textOnly === true) {
        throw contextualConflict("A microssequência editada localmente não corresponde mais ao conteúdo atual.");
      }
      const remoteMetadata = microsequenceMetadata(remoteMicrosequence);
      const hasProvenBase = Array.isArray(path.baseCards) && path.baseMetadata &&
        Number.isSafeInteger(path.basePosition);
      if (!hasProvenBase && initialRevision !== 1) {
        throw contextualConflict(
          "A exclusão local não possui uma base comprovável e foi preservada para revisão."
        );
      }
      if (hasProvenBase && (
        !sameCanonical(remoteMetadata, path.baseMetadata) ||
        !sameCanonical(remoteMicrosequence.cards || [], path.baseCards) ||
        remoteLocation.index !== path.basePosition
      )) {
        throw contextualConflict(
          "A microssequência também foi alterada em outro dispositivo e não foi excluída."
        );
      }
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
      if (path.textOnly === true) {
        throw contextualConflict("A microssequência editada localmente foi retirada em outro dispositivo.");
      }
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
      createdFromLocal = true;
    } else if (path.textOnly !== true) {
      const metadataReconciliation = reconcilePendingMetadata({
        baseMetadata: path.baseMetadata || (
          initialRevision === 1 ? microsequenceMetadata(remoteMicrosequence) : null
        ),
        localMicrosequence,
        remoteMicrosequence
      });
      if (metadataReconciliation.changed) {
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
            ...metadataReconciliation.metadata
          }
        );
        revision = result.revision;
        Object.assign(
          remoteMicrosequence,
          structuredClone(metadataReconciliation.metadata)
        );
      }
      if (localLocation.index !== remoteLocation.index) {
        const basePosition = Number.isSafeInteger(path.basePosition)
          ? path.basePosition
          : initialRevision === 1
            ? remoteLocation.index
            : null;
        if (basePosition === null || (
          remoteLocation.index !== basePosition &&
          remoteLocation.index !== localLocation.index
        )) {
          throw contextualConflict(
            "A ordem pedagógica mudou em outro dispositivo. A alteração local foi preservada."
          );
        }
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
    const baseCards = path.baseCards || (
      createdFromLocal
        ? []
        : initialRevision === 1 && Array.isArray(remoteMicrosequence?.cards)
        ? structuredClone(remoteMicrosequence.cards)
        : null
    );
    const reconciledCards = reconcilePendingCards({
      baseCards,
      localCards: localMicrosequence.cards || [],
      remoteCards: remoteMicrosequence?.cards,
      textOnly: path.textOnly === true,
      conflictPolicy
    });
    if (!reconciledCards.changed) continue;
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
        cardsJson: JSON.stringify(reconciledCards.cards)
      }
    );
    revision = result.revision;
    remoteMicrosequence.cardCount = reconciledCards.cards.length;
    remoteMicrosequence.cards = structuredClone(reconciledCards.cards);
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
  if (typeof storage?.getWorkspaceCourseDraftReceipt !== "function") {
    throw new Error("A confirmação persistida da autoria contextual não está disponível.");
  }
  const receipt = await storage.getWorkspaceCourseDraftReceipt(courseKey);
  if (receipt?.consumedRevision !== expectedLocalDraftRevision) {
    const error = new Error(
      "A alteração offline ainda não possui confirmação remota e continuará na fila."
    );
    error.code = "contextual_authoring_not_materialized";
    throw error;
  }
  return {
    attempted: true,
    localState: await finalizeContextualCourseDraftSync({
      storage,
      courseKey,
      expectedLocalDraftRevision
    })
  };
}
