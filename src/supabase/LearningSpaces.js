import {
  executeIdempotentCourseRemoval,
  privateCourseRemovalRequestId,
  removeCatalogCourse
} from "../assist/courseRemovalCommand.js";

const CACHE_VERSION = 3;
const CACHE_PREFIX = "learning.spaces.v1";
const TRAIL_PAGE_LIMIT = 100;
const MAX_TRAIL_PAGES = 100;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const CONTENT_HASH_PATTERN = /^[0-9a-f]{64}$/u;

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
    contentHash: value.contentHash === null ? null : text(value.contentHash).trim().toLowerCase(),
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
    canRemove: value.canRemove === true,
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
          afterPosition: Number(source.nextCursor.afterPosition),
          afterId: text(source.nextCursor.afterId)
        })
      : null,
    capabilities: Object.freeze({
      catalogManage: source?.capabilities?.catalogManage === true,
      catalogReview: source?.capabilities?.catalogReview === true
    })
  });
}

function cursorKey(cursor) {
  return `${cursor.afterPosition}:${cursor.afterId}`;
}

function nextTrailCursor(page) {
  const cursor = page?.nextCursor;
  if (
    page?.hasMore !== true ||
    !cursor ||
    !Number.isSafeInteger(cursor.afterPosition) ||
    cursor.afterPosition < 0 ||
    !text(cursor.afterId).trim()
  ) {
    if (page?.hasMore === true) {
      throw new Error("A paginação de Trilhas devolveu um cursor inválido.");
    }
    return null;
  }
  return cursor;
}

function completeTrailPage(items, capabilities) {
  return Object.freeze({
    items: Object.freeze(items),
    hasMore: false,
    nextCursor: null,
    capabilities: Object.freeze({
      catalogManage: capabilities.catalogManage === true,
      catalogReview: capabilities.catalogReview === true
    })
  });
}

function trailPageWithoutAuthority(value) {
  const page = trailPage(value);
  return completeTrailPage(
    page.items.map((item) => Object.freeze({
      ...item,
      canEdit: false,
      canDelete: false,
      canRemove: false
    })),
    { catalogManage: false, catalogReview: false }
  );
}

export class LearningSpaces {
  constructor({ catalog, authClient } = {}) {
    if (!catalog || !authClient) throw new TypeError("Dependências do painel ausentes.");
    this.catalog = catalog;
    this.authClient = authClient;
    this.store = authClient.sessionStore;
  }

  async readCache() {
    try {
      const userId = currentUserId(this.authClient);
      if (!userId || typeof this.store?.getSyncState !== "function") return null;
      const cached = await this.store.getSyncState(cacheKey(userId));
      return cached?.version === CACHE_VERSION ? cached : null;
    } catch {
      return null;
    }
  }

  async writeCache(page) {
    try {
      const userId = currentUserId(this.authClient);
      if (!userId || typeof this.store?.putSyncState !== "function") return false;
      await this.store.putSyncState(cacheKey(userId), {
        version: CACHE_VERSION,
        cachedAt: new Date().toISOString(),
        page
      });
      return true;
    } catch {
      return false;
    }
  }

  async clearCache() {
    try {
      const userId = currentUserId(this.authClient);
      if (userId && typeof this.store?.putSyncState === "function") {
        await this.store.putSyncState(cacheKey(userId), null);
      }
      return true;
    } catch {
      return false;
    }
  }

  async loadTrails({
    online = globalThis.navigator?.onLine !== false,
    fallbackPage = null
  } = {}) {
    if (!online) {
      const cached = await this.readCache();
      const available = cached?.page || fallbackPage;
      return {
        page: available ? trailPageWithoutAuthority(available) : null,
        stale: true,
        cachedAt: cached?.cachedAt || ""
      };
    }

    const itemsById = new Map();
    const seenCursors = new Set();
    let cursor = null;
    let capabilities = null;
    for (let pageIndex = 0; pageIndex < MAX_TRAIL_PAGES; pageIndex += 1) {
      const page = trailPage(await this.catalog.listTrailItems({
        limit: TRAIL_PAGE_LIMIT,
        afterPosition: cursor?.afterPosition ?? null,
        afterId: cursor?.afterId || null
      }));
      capabilities = capabilities === null
        ? page.capabilities
        : {
            catalogManage: capabilities.catalogManage && page.capabilities.catalogManage,
            catalogReview: capabilities.catalogReview && page.capabilities.catalogReview
      };
      page.items.forEach((item) => {
        if (!item.itemId) {
          throw new Error("A paginação de Trilhas devolveu um item sem identidade.");
        }
        itemsById.set(item.itemId, item);
      });

      const nextCursor = nextTrailCursor(page);
      if (!nextCursor) {
        const complete = completeTrailPage(
          [...itemsById.values()],
          capabilities || { catalogManage: false, catalogReview: false }
        );
        await this.writeCache(complete);
        return { page: complete, stale: false, cachedAt: new Date().toISOString() };
      }
      const key = cursorKey(nextCursor);
      if (seenCursors.has(key)) {
        throw new Error("A paginação de Trilhas repetiu o mesmo cursor.");
      }
      seenCursors.add(key);
      cursor = nextCursor;
    }
    throw new Error("A paginação de Trilhas excedeu o limite seguro.");
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

  async createCourseWorkspace({ courseId, title } = {}) {
    const normalizedCourseId = text(courseId).trim().toLowerCase();
    const normalizedTitle = text(title).trim();
    if (!UUID_PATTERN.test(normalizedCourseId) || !normalizedTitle) {
      throw new TypeError("Curso inválido para organização.");
    }
    const result = await this.catalog.executeApplicationAuthoringAction(
      "criarWorkspaceDeAutoria",
      {
        requestId: globalThis.crypto.randomUUID(),
        title: normalizedTitle,
        sourceCourseId: normalizedCourseId
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

  async removeCourseFromTrails({ selectionId, courseId, expectedContentHash } = {}) {
    const normalizedSelectionId = text(selectionId).trim().toLowerCase();
    const normalizedCourseId = text(courseId).trim().toLowerCase();
    const normalizedContentHash = text(expectedContentHash).trim().toLowerCase();
    if (
      !UUID_PATTERN.test(normalizedSelectionId)
      || !UUID_PATTERN.test(normalizedCourseId)
      || !CONTENT_HASH_PATTERN.test(normalizedContentHash)
    ) {
      throw new TypeError("Curso inválido para retirada de Trilhas.");
    }
    const requestId = await privateCourseRemovalRequestId({
      selectionId: normalizedSelectionId,
      courseId: normalizedCourseId,
      contentHash: normalizedContentHash
    });
    const result = await executeIdempotentCourseRemoval({
      remoteCatalog: this.catalog,
      action: "retirarCursoDasTrilhas",
      argumentsValue: {
        requestId,
        selectionId: normalizedSelectionId,
        courseId: normalizedCourseId,
        expectedContentHash: normalizedContentHash
      }
    });
    await this.clearCache();
    return result;
  }

  async removeCourseFromCatalog(courseId) {
    const normalizedCourseId = text(courseId).trim().toLowerCase();
    if (!UUID_PATTERN.test(normalizedCourseId)) {
      throw new TypeError("Curso inválido para retirada de Coleções.");
    }
    const result = await removeCatalogCourse({
      remoteCatalog: this.catalog,
      courseId: normalizedCourseId
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
