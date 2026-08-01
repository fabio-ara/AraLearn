const CACHE_VERSION = 1;
const CACHE_PREFIX = "central.current.v1";
const FIRST_PAGE_LIMIT = 20;
const USER_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const SECTIONS = new Set(["construction", "trails", "evaluation", "collections"]);
const AUDIENCES = new Set(["mine", "queue"]);

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
  construction: ["workspaceId", "kind", "title", "publicationCount", "updatedAt"],
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
    sections: {}
  };
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
    if (stored?.version !== CACHE_VERSION || typeof stored?.sections !== "object") {
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
      sections: next.sections || {}
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
}
