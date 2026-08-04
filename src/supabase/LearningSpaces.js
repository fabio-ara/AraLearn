const CACHE_VERSION = 1;
const CACHE_PREFIX = "learning.spaces.v1";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

function text(value) {
  return typeof value === "string" ? value : "";
}

function integer(value) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= 0 ? number : 0;
}

function currentUserId(authClient) {
  const value = text(authClient?.getSession?.()?.user?.id).trim().toLowerCase();
  return UUID_PATTERN.test(value) ? value : "";
}

function cacheKey(userId) {
  return `${CACHE_PREFIX}:${userId}`;
}

function trailItem(value = {}) {
  const kind = value.kind === "plan" ? "plan" : "course";
  const source = value.source === "workspace" ? "workspace" : "selection";
  const origin = ["workspace", "private", "catalog"].includes(value.origin)
    ? value.origin
    : "workspace";
  return Object.freeze({
    itemId: text(value.itemId),
    workspaceId: value.workspaceId === null ? null : text(value.workspaceId).toLowerCase(),
    courseKey: value.courseKey === null ? null : text(value.courseKey),
    courseId: value.courseId === null ? null : text(value.courseId).toLowerCase(),
    selectionId: value.selectionId === null ? null : text(value.selectionId).toLowerCase(),
    kind,
    source,
    origin,
    title: text(value.title) || (kind === "plan" ? "Plano" : "Curso"),
    description: text(value.description),
    moduleCount: integer(value.moduleCount),
    lessonCount: integer(value.lessonCount),
    microsequenceCount: integer(value.microsequenceCount),
    cardCount: integer(value.cardCount),
    canEdit: value.canEdit === true,
    canDelete: value.canDelete === true,
    position: integer(value.position),
    updatedAt: text(value.updatedAt)
  });
}

function trailPage(value) {
  const source = Array.isArray(value) ? value[0] : value;
  return Object.freeze({
    items: Object.freeze((Array.isArray(source?.items) ? source.items : []).map(trailItem)),
    hasMore: source?.hasMore === true,
    nextCursor: source?.nextCursor && typeof source.nextCursor === "object"
      ? Object.freeze({
          afterPosition: integer(source.nextCursor.afterPosition),
          afterId: text(source.nextCursor.afterId)
        })
      : null,
    capabilities: Object.freeze({
      catalogManage: source?.capabilities?.catalogManage === true,
      catalogReview: source?.capabilities?.catalogReview === true
    })
  });
}

export class LearningSpaces {
  constructor({ catalog, authClient } = {}) {
    if (!catalog || !authClient) throw new TypeError("Dependências do painel ausentes.");
    this.catalog = catalog;
    this.authClient = authClient;
    this.store = authClient.sessionStore;
  }

  async readCache() {
    const userId = currentUserId(this.authClient);
    if (!userId || typeof this.store?.getSyncState !== "function") return null;
    const cached = await this.store.getSyncState(cacheKey(userId));
    return cached?.version === CACHE_VERSION ? cached : null;
  }

  async writeCache(page) {
    const userId = currentUserId(this.authClient);
    if (!userId || typeof this.store?.putSyncState !== "function") return;
    await this.store.putSyncState(cacheKey(userId), {
      version: CACHE_VERSION,
      cachedAt: new Date().toISOString(),
      page
    });
  }

  async clearCache() {
    const userId = currentUserId(this.authClient);
    if (userId && typeof this.store?.putSyncState === "function") {
      await this.store.putSyncState(cacheKey(userId), null);
    }
  }

  async loadTrails({ cursor = null, online = globalThis.navigator?.onLine !== false } = {}) {
    if (!online && !cursor) {
      const cached = await this.readCache();
      return { page: cached?.page || null, stale: true, cachedAt: cached?.cachedAt || "" };
    }
    if (!online) return { page: null, stale: true, cachedAt: "" };
    const page = trailPage(await this.catalog.listTrailItems({
      limit: 50,
      afterPosition: cursor?.afterPosition ?? null,
      afterId: cursor?.afterId || null
    }));
    if (!cursor) await this.writeCache(page);
    return { page, stale: false, cachedAt: new Date().toISOString() };
  }

  async loadWorkspace(workspaceId, view = "outline") {
    if (!UUID_PATTERN.test(text(workspaceId))) throw new TypeError("Plano inválido.");
    return this.catalog.executeApplicationAuthoringAction("lerWorkspaceDeAutoria", {
      workspaceId,
      view
    });
  }

  async createPlan({ title, description = "" } = {}) {
    const normalizedTitle = text(title).trim();
    if (!normalizedTitle) throw new TypeError("Informe o título do plano.");
    const result = await this.catalog.executeApplicationAuthoringAction(
      "criarWorkspaceDeAutoria",
      {
        requestId: globalThis.crypto.randomUUID(),
        title: normalizedTitle,
        ...(text(description).trim() ? { brief: text(description).trim() } : {})
      }
    );
    await this.clearCache();
    return result;
  }

  async deleteWorkspace(workspaceId) {
    const workspace = await this.loadWorkspace(workspaceId, "outline");
    const result = await this.catalog.executeApplicationAuthoringAction("excluirDoWorkspace", {
      operation: "delete_workspace",
      requestId: globalThis.crypto.randomUUID(),
      workspaceId,
      expectedRevision: workspace.revision
    });
    await this.clearCache();
    return result;
  }

  async updateEntity({ workspaceId, revision, entityType, entityPath, title, goal = "" } = {}) {
    const result = await this.catalog.executeApplicationAuthoringAction(
      "atualizarMetadadosDaEntidade",
      {
        requestId: globalThis.crypto.randomUUID(),
        workspaceId,
        expectedRevision: revision,
        entityType,
        entityPath,
        title: text(title).trim(),
        ...(text(goal).trim() ? { goal: text(goal).trim() } : {})
      }
    );
    await this.clearCache();
    return result;
  }

  async moveEntity({ workspaceId, revision, entityType, entityPath, targetParentPath, position } = {}) {
    const result = await this.catalog.executeApplicationAuthoringAction(
      "reorganizarWorkspace",
      {
        operation: "move_entity",
        requestId: globalThis.crypto.randomUUID(),
        workspaceId,
        expectedRevision: revision,
        entityType,
        entityPath,
        targetParentPath,
        position
      }
    );
    await this.clearCache();
    return result;
  }

  async deleteEntity({ workspaceId, revision, entityType, entityPath } = {}) {
    const result = await this.catalog.executeApplicationAuthoringAction("excluirDoWorkspace", {
      operation: "delete_entity",
      requestId: globalThis.crypto.randomUUID(),
      workspaceId,
      expectedRevision: revision,
      entityType,
      entityPath
    });
    await this.clearCache();
    return result;
  }

  async listObservations(workspaceId) {
    return this.catalog.executeApplicationAuthoringAction("gerirWorkspaceEducacional", {
      operation: "list_observations",
      workspaceId
    });
  }

  async loadWorkspaceAccess(workspaceId) {
    return this.catalog.executeApplicationAuthoringAction("gerirWorkspaceEducacional", {
      operation: "read",
      workspaceId
    });
  }

  async createObservation({ workspaceId, entityType, entityPath, body, resourceTargetId = null } = {}) {
    return this.catalog.executeApplicationAuthoringAction("gerirWorkspaceEducacional", {
      operation: "create_observation",
      requestId: globalThis.crypto.randomUUID(),
      workspaceId,
      entityType,
      entityPath,
      ...(resourceTargetId ? { resourceTargetId } : {}),
      body: text(body).trim()
    });
  }

  async deleteObservation({ workspaceId, observationId } = {}) {
    return this.catalog.executeApplicationAuthoringAction("gerirWorkspaceEducacional", {
      operation: "delete_observation",
      requestId: globalThis.crypto.randomUUID(),
      workspaceId,
      observationId
    });
  }
}
