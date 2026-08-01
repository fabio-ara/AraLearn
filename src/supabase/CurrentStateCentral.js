const CACHE_VERSION = 2;
const CACHE_PREFIX = "central.current.v2";
const FIRST_PAGE_LIMIT = 20;
const USER_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const SECTIONS = new Set(["construction", "trails", "evaluation", "collections"]);
const AUDIENCES = new Set(["mine", "queue"]);
const WORKSPACE_ROLES = new Set(["owner", "admin", "author", "reviewer", "learner", "reader"]);
const COMMENT_CATEGORIES = new Set([
  "question", "possible_error", "confusing", "suggestion", "observation"
]);
const COMMENT_STATUSES = new Set(["open", "considered", "resolved", "incorporated"]);

function currentUserId(authClient) {
  const value = String(authClient?.getSession?.()?.user?.id || "").trim().toLowerCase();
  return USER_ID_PATTERN.test(value) ? value : "";
}

function integer(value) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= 0 ? number : 0;
}

function boolean(value) {
  return value === true;
}

function string(value) {
  return typeof value === "string" ? value : "";
}

function workspaceAccessEnded(error) {
  const status = Number(error?.status || error?.response?.status || 0);
  const code = string(error?.code || error?.response?.code).toUpperCase();
  return status === 403 || status === 404 || code === "42501" || code === "P0002";
}

function summary(value) {
  const source = Array.isArray(value) ? value[0] : value;
  const counts = source?.counts || {};
  const capabilities = source?.capabilities || {};
  return Object.freeze({
    counts: Object.freeze({
      construction: integer(counts.construction),
      trails: integer(counts.trails),
      evaluationMine: integer(counts.evaluationMine),
      evaluationQueue: integer(counts.evaluationQueue),
      collections: integer(counts.collections)
    }),
    capabilities: Object.freeze({
      authoringPrivate: boolean(capabilities.authoringPrivate),
      catalogSubmit: boolean(capabilities.catalogSubmit),
      catalogReview: boolean(capabilities.catalogReview),
      catalogPublish: boolean(capabilities.catalogPublish),
      catalogManage: boolean(capabilities.catalogManage)
    })
  });
}

const ITEM_FIELDS = Object.freeze({
  construction: [
    "workspaceId", "kind", "workspaceKind", "role", "title", "purpose",
    "publicationCount", "updatedAt"
  ],
  trails: [
    "selectionId", "courseId", "kind", "title", "goal", "moduleCount",
    "lessonCount", "lastActivityAt", "position"
  ],
  evaluation: [
    "submissionId", "courseId", "kind", "title", "status", "completionState",
    "claimedByMe", "claimAvailable", "submittedAt", "updatedAt"
  ],
  collections: [
    "courseId", "kind", "title", "goal", "completionState", "workspaceTitle",
    "updatedAt"
  ]
});

function item(section, value) {
  const result = {};
  for (const key of ITEM_FIELDS[section]) {
    const current = value?.[key];
    if (typeof current === "boolean") result[key] = current;
    else if (typeof current === "number" && Number.isFinite(current)) result[key] = current;
    else if (typeof current === "string") result[key] = current;
    else if (current === null) result[key] = null;
  }
  return Object.freeze(result);
}

function page(value, expectedSection, expectedAudience) {
  const source = Array.isArray(value) ? value[0] : value;
  const section = SECTIONS.has(source?.section) ? source.section : expectedSection;
  const audience = AUDIENCES.has(source?.audience) ? source.audience : expectedAudience;
  return Object.freeze({
    section,
    audience,
    items: Object.freeze((Array.isArray(source?.items) ? source.items : [])
      .slice(0, FIRST_PAGE_LIMIT)
      .map((current) => item(section, current))),
    hasMore: source?.hasMore === true,
    nextCursor: source?.nextCursor && typeof source.nextCursor === "object"
      ? Object.freeze({
        ...(string(source.nextCursor.beforeAt) ? { beforeAt: source.nextCursor.beforeAt } : {}),
        ...(string(source.nextCursor.beforeId) ? { beforeId: source.nextCursor.beforeId } : {}),
        ...(Number.isSafeInteger(source.nextCursor.afterPosition)
          ? { afterPosition: source.nextCursor.afterPosition }
          : {}),
        ...(string(source.nextCursor.afterId) ? { afterId: source.nextCursor.afterId } : {})
      })
      : null
  });
}

function cacheKey(userId) {
  return `${CACHE_PREFIX}:${userId}`;
}

function pageKey(section, audience) {
  return `${section}:${audience}`;
}

function emptyCache() {
  return {
    version: CACHE_VERSION,
    cachedAt: "",
    summary: null,
    sections: {},
    workspaces: {}
  };
}

function workspaceDetail(value) {
  const source = Array.isArray(value) ? value[0] : value;
  const workspaceId = string(source?.workspaceId).toLowerCase();
  if (!USER_ID_PATTERN.test(workspaceId)) throw new TypeError("Workspace remoto inválido.");
  const role = WORKSPACE_ROLES.has(source?.role) ? source.role : "reader";
  const capabilities = source?.capabilities || {};
  return Object.freeze({
    workspaceId,
    title: string(source?.title),
    purpose: string(source?.purpose),
    kind: ["personal", "class", "team"].includes(source?.kind) ? source.kind : "personal",
    visibility: ["private", "members"].includes(source?.visibility)
      ? source.visibility
      : "members",
    role,
    capabilities: Object.freeze({
      read: boolean(capabilities.read),
      author: boolean(capabilities.author),
      review: boolean(capabilities.review),
      comment: boolean(capabilities.comment),
      publish: boolean(capabilities.publish),
      manage: boolean(capabilities.manage),
      transfer: boolean(capabilities.transfer)
    }),
    members: Object.freeze((Array.isArray(source?.members) ? source.members : []).slice(0, 100)
      .map((member) => Object.freeze({
        userId: string(member?.userId).toLowerCase(),
        email: member?.email === null ? null : string(member?.email),
        role: WORKSPACE_ROLES.has(member?.role) ? member.role : "reader",
        primaryOwner: boolean(member?.primaryOwner),
        joinedAt: string(member?.joinedAt)
      }))),
    invitations: Object.freeze((Array.isArray(source?.invitations) ? source.invitations : [])
      .slice(0, 50)
      .map((invitation) => Object.freeze({
        invitationId: string(invitation?.invitationId).toLowerCase(),
        email: string(invitation?.email),
        role: WORKSPACE_ROLES.has(invitation?.role) ? invitation.role : "reader",
        expiresAt: string(invitation?.expiresAt)
      }))),
    courseCount: integer(source?.courseCount),
    publicationCount: integer(source?.publicationCount),
    updatedAt: string(source?.updatedAt)
  });
}

function workspaceCommentPage(value, workspaceId) {
  const source = Array.isArray(value) ? value[0] : value;
  return Object.freeze({
    workspaceId,
    role: WORKSPACE_ROLES.has(source?.role) ? source.role : "reader",
    items: Object.freeze((Array.isArray(source?.items) ? source.items : []).slice(0, 50)
      .map((comment) => Object.freeze({
        commentId: string(comment?.commentId).toLowerCase(),
        courseId: string(comment?.courseId).toLowerCase(),
        cardId: string(comment?.cardId).toLowerCase(),
        entityPath: Array.isArray(comment?.entityPath)
          ? Object.freeze(comment.entityPath.slice(0, 5).map(string))
          : null,
        courseTitle: string(comment?.courseTitle),
        cardTitle: string(comment?.cardTitle),
        author: Object.freeze({
          userId: string(comment?.author?.userId).toLowerCase(),
          email: string(comment?.author?.email)
        }),
        category: COMMENT_CATEGORIES.has(comment?.category) ? comment.category : "observation",
        body: string(comment?.body),
        status: COMMENT_STATUSES.has(comment?.status) ? comment.status : "open",
        response: comment?.response === null ? null : string(comment?.response),
        resolutionNote: comment?.resolutionNote === null
          ? null
          : string(comment?.resolutionNote),
        courseRevisionHash: comment?.courseRevisionHash === null
          ? null
          : string(comment?.courseRevisionHash),
        targetAvailable: boolean(comment?.targetAvailable),
        correction: comment?.correction && typeof comment.correction === "object"
          ? Object.freeze({
            requestId: string(comment.correction.requestId),
            entityPath: Object.freeze((Array.isArray(comment.correction.entityPath)
              ? comment.correction.entityPath
              : []).slice(0, 5).map(string)),
            linkedAt: string(comment.correction.linkedAt)
          })
          : null,
        createdAt: string(comment?.createdAt),
        updatedAt: string(comment?.updatedAt),
        respondedAt: comment?.respondedAt === null ? null : string(comment?.respondedAt),
        resolvedAt: comment?.resolvedAt === null ? null : string(comment?.resolvedAt)
      }))),
    hasMore: boolean(source?.hasMore),
    nextCursor: source?.nextCursor && typeof source.nextCursor === "object"
      ? Object.freeze({
        beforeUpdatedAt: string(source.nextCursor.beforeUpdatedAt),
        beforeId: string(source.nextCursor.beforeId).toLowerCase()
      })
      : null
  });
}

export class CurrentStateCentral {
  constructor({ catalog, authClient } = {}) {
    if (!catalog || !authClient) throw new TypeError("Dependências da Central ausentes.");
    this.catalog = catalog;
    this.authClient = authClient;
    this.store = authClient.sessionStore;
  }

  async readCache() {
    const userId = currentUserId(this.authClient);
    if (!userId || typeof this.store?.getSyncState !== "function") return emptyCache();
    const stored = await this.store.getSyncState(cacheKey(userId));
    if (stored?.version !== CACHE_VERSION || typeof stored?.sections !== "object"
        || typeof stored?.workspaces !== "object") {
      return emptyCache();
    }
    return stored;
  }

  async writeCache(next) {
    const userId = currentUserId(this.authClient);
    if (!userId || typeof this.store?.putSyncState !== "function") return;
    await this.store.putSyncState(cacheKey(userId), {
      version: CACHE_VERSION,
      cachedAt: new Date().toISOString(),
      summary: next.summary || null,
      sections: next.sections || {},
      workspaces: next.workspaces || {}
    });
  }

  async clearCache() {
    const userId = currentUserId(this.authClient);
    await this.clearCacheFor(userId);
  }

  async clearCacheFor(userId) {
    if (!USER_ID_PATTERN.test(userId) || typeof this.store?.putSyncState !== "function") return;
    await this.store.putSyncState(cacheKey(userId), null);
  }

  async loadOverview({ online = globalThis.navigator?.onLine !== false } = {}) {
    const userId = currentUserId(this.authClient);
    const cached = await this.readCache();
    if (!online) {
      return { summary: cached.summary, cachedAt: string(cached.cachedAt), stale: true };
    }
    try {
      const nextSummary = summary(await this.catalog.getCurrentStateCentral());
      await this.writeCache({ ...cached, summary: nextSummary });
      return { summary: nextSummary, cachedAt: new Date().toISOString(), stale: false };
    } catch (error) {
      if (error?.authRequired === true) await this.clearCacheFor(userId);
      throw error;
    }
  }

  async loadSection({
    section,
    audience = "mine",
    cursor = null,
    online = globalThis.navigator?.onLine !== false
  } = {}) {
    if (!SECTIONS.has(section) || !AUDIENCES.has(audience)) {
      throw new TypeError("Seção da Central inválida.");
    }
    const userId = currentUserId(this.authClient);
    const cached = await this.readCache();
    const key = pageKey(section, audience);
    if (!online) {
      return {
        page: cursor ? null : cached.sections[key] || null,
        cachedAt: string(cached.cachedAt),
        stale: true
      };
    }
    try {
      const result = page(await this.catalog.listCurrentStateCentral({
        section,
        audience,
        beforeAt: cursor?.beforeAt || null,
        beforeId: cursor?.beforeId || null,
        afterPosition: cursor?.afterPosition ?? null,
        afterId: cursor?.afterId || null
      }), section, audience);
      if (!cursor) {
        await this.writeCache({
          ...cached,
          sections: { ...cached.sections, [key]: result }
        });
      }
      return { page: result, cachedAt: new Date().toISOString(), stale: false };
    } catch (error) {
      if (error?.authRequired === true) await this.clearCacheFor(userId);
      throw error;
    }
  }

  async loadWorkspace({ workspaceId, online = globalThis.navigator?.onLine !== false } = {}) {
    const normalizedId = string(workspaceId).trim().toLowerCase();
    if (!USER_ID_PATTERN.test(normalizedId)) throw new TypeError("Workspace inválido.");
    const userId = currentUserId(this.authClient);
    const cached = await this.readCache();
    if (!online) {
      return {
        workspace: cached.workspaces[normalizedId] || null,
        cachedAt: string(cached.cachedAt),
        stale: true
      };
    }
    try {
      const workspace = workspaceDetail(await this.catalog.getEducationalWorkspace(normalizedId));
      const entries = Object.entries({ ...cached.workspaces, [normalizedId]: workspace })
        .sort((left, right) => string(right[1]?.updatedAt).localeCompare(string(left[1]?.updatedAt)))
        .slice(0, 10);
      await this.writeCache({ ...cached, workspaces: Object.fromEntries(entries) });
      return { workspace, cachedAt: new Date().toISOString(), stale: false };
    } catch (error) {
      if (error?.authRequired === true) await this.clearCacheFor(userId);
      else if (workspaceAccessEnded(error) && cached.workspaces[normalizedId]) {
        const workspaces = { ...cached.workspaces };
        delete workspaces[normalizedId];
        await this.writeCache({ ...cached, workspaces });
      }
      throw error;
    }
  }

  async manageWorkspace({ requestId, operation, payload } = {}) {
    if (globalThis.navigator?.onLine === false) {
      const error = new Error("Esta ação precisa de conexão.");
      error.code = "WORKSPACE_ONLINE_REQUIRED";
      throw error;
    }
    const result = await this.catalog.manageEducationalWorkspace({
      requestId,
      operation,
      payload
    });
    const workspaceId = string(result?.workspaceId || payload?.workspaceId).toLowerCase();
    const cached = await this.readCache();
    const workspaces = { ...cached.workspaces };
    if (USER_ID_PATTERN.test(workspaceId)) delete workspaces[workspaceId];
    await this.writeCache({ ...cached, summary: null, sections: {}, workspaces });
    return result;
  }

  async loadWorkspaceComments({
    workspaceId,
    cursor = null,
    categories = null,
    statuses = null
  } = {}) {
    if (globalThis.navigator?.onLine === false) {
      const error = new Error("As observações compartilhadas precisam de conexão.");
      error.code = "WORKSPACE_ONLINE_REQUIRED";
      throw error;
    }
    const normalizedId = string(workspaceId).trim().toLowerCase();
    if (!USER_ID_PATTERN.test(normalizedId)) throw new TypeError("Workspace inválido.");
    return workspaceCommentPage(await this.catalog.listEducationalWorkspaceComments({
      workspaceId: normalizedId,
      limit: FIRST_PAGE_LIMIT,
      beforeUpdatedAt: cursor?.beforeUpdatedAt || null,
      beforeId: cursor?.beforeId || null,
      categories,
      statuses
    }), normalizedId);
  }

  async manageWorkspaceComment({ requestId, workspaceId, commentId, operation, payload } = {}) {
    if (globalThis.navigator?.onLine === false) {
      const error = new Error("Esta ação precisa de conexão.");
      error.code = "WORKSPACE_ONLINE_REQUIRED";
      throw error;
    }
    return this.catalog.manageEducationalWorkspaceComment({
      requestId, workspaceId, commentId, operation, payload
    });
  }
}
