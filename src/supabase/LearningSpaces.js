import {
  executeIdempotentCourseRemoval,
  privateCourseRemovalRequestId,
  removeCatalogCourse
} from "../assist/courseRemovalCommand.js";
import { validateProjectDocument } from "../domain/aralearnProject.js";

const CACHE_VERSION = 4;
const CACHE_PREFIX = "learning.spaces.v1";
const TRAIL_COURSE_CACHE_CONTRACT = "aralearn.trail-course-cache.v1";
const TRAIL_COURSE_CACHE_PREFIX = "learning.trail.course.v1";
const TRAIL_MUTATION_CACHE_VERSION = 1;
const TRAIL_MUTATION_CACHE_PREFIX = "learning.trail.mutations.v1";
const TRAIL_PAGE_LIMIT = 100;
const MAX_TRAIL_PAGES = 100;
const CATALOG_PAGE_LIMIT = 100;
const MAX_CATALOG_PAGES = 100;
const CATALOG_READ_CONCURRENCY = 4;
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

function trailCourseCacheKey(userId, trailItemId) {
  return `${TRAIL_COURSE_CACHE_PREFIX}:${userId}:${trailItemId}`;
}

function trailPersonalStateCacheKey(userId, trailItemId) {
  return `trail.personalState:${userId}:${trailItemId}`;
}

function trailMutationCacheKey(userId) {
  return `${TRAIL_MUTATION_CACHE_PREFIX}:${userId}`;
}

function retryableReadFailure(error) {
  const status = Number(error?.status || 0);
  const code = String(error?.code || "").toUpperCase();
  return globalThis.navigator?.onLine === false || error?.retryable === true ||
    error?.name === "TypeError" || error?.name === "AbortError" ||
    status === 0 || status === 408 || status === 429 || status >= 500 ||
    ["ETIMEDOUT", "ECONNRESET", "ECONNREFUSED", "ENETUNREACH", "EAI_AGAIN", "FETCH_FAILED"]
      .includes(code);
}

function trailItem(value = {}) {
  const trailItemId = text(value.trailItemId).trim().toLowerCase();
  if (!UUID_PATTERN.test(trailItemId)) {
    throw new Error("Trilhas devolveu um item sem identidade válida.");
  }
  const kind = value.kind === "plan" ? "plan" : "course";
  const source = value.source === "workspace" ? "workspace" : "selection";
  const origin = ["workspace", "private", "catalog"].includes(value.origin)
    ? value.origin
    : "workspace";
  return Object.freeze({
    trailItemId,
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
    completedCardCount: integer(value.completedCardCount),
    canEdit: value.canEdit === true,
    canDelete: value.canDelete === true,
    canRemove: value.canRemove === true,
    pathId: value.pathId === null ? null : text(value.pathId).toLowerCase(),
    pathTitle: text(value.pathTitle),
    pathPosition: value.pathPosition === null ? null : integer(value.pathPosition),
    itemPosition: value.itemPosition === null ? null : integer(value.itemPosition),
    revision: value.revision === null ? null : integer(value.revision),
    updatedAt: text(value.updatedAt)
  });
}

function trailGroup(value = {}) {
  const id = text(value.id).trim().toLowerCase();
  if (!UUID_PATTERN.test(id)) throw new Error("Trilhas devolveu um grupo sem identidade válida.");
  return Object.freeze({
    id,
    title: text(value.title).trim() || "Grupo",
    position: integer(value.position)
  });
}

function trailPage(value) {
  const source = Array.isArray(value) ? value[0] : value;
  if (source?.space !== "trails" || !Array.isArray(source.items) || !Array.isArray(source.groups)) {
    throw new Error("Trilhas devolveu uma projeção incompleta.");
  }
  return Object.freeze({
    space: "trails",
    groups: Object.freeze(source.groups.map(trailGroup)),
    items: Object.freeze(source.items.map(trailItem)),
    hasMore: source?.hasMore === true,
    nextCursor: source?.nextCursor && typeof source.nextCursor === "object"
      ? Object.freeze({
          afterPathPosition: Number(source.nextCursor.afterPathPosition),
          afterItemPosition: Number(source.nextCursor.afterItemPosition),
          afterId: text(source.nextCursor.afterId)
        })
      : null,
    capabilities: Object.freeze({
      catalogManage: source?.capabilities?.catalogManage === true,
      catalogReview: source?.capabilities?.catalogReview === true,
      organize: source?.capabilities?.organize !== false
    })
  });
}

function cursorKey(cursor) {
  return `${cursor.afterPosition}:${cursor.afterId}`;
}

function trailCursorKey(cursor) {
  return `${cursor.afterPathPosition}:${cursor.afterItemPosition}:${cursor.afterId}`;
}

function requestId() {
  return globalThis.crypto.randomUUID();
}

function collectionContractKey(title) {
  const base = text(title)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "") || "colecao";
  const suffix = requestId().replace(/-/gu, "").slice(0, 8);
  return `${base.slice(0, 110)}-${suffix}`;
}

function validActionCursor(value, label) {
  if (value === null || value === undefined) return null;
  const afterPosition = Number(value?.afterPosition);
  const afterId = text(value?.afterId).trim().toLowerCase();
  if (!Number.isSafeInteger(afterPosition) || afterPosition < 0 || !UUID_PATTERN.test(afterId)) {
    throw new Error(`A paginação de ${label} devolveu um cursor inválido.`);
  }
  return { afterPosition, afterId };
}

async function loadCatalogActionItems(catalog, { operation, label, ...parameters }) {
  const items = [];
  const cursors = new Set();
  let cursor = null;
  for (let pageIndex = 0; pageIndex < MAX_CATALOG_PAGES; pageIndex += 1) {
    const page = await catalog.executeApplicationAuthoringAction("consultarCatalogo", {
      operation,
      ...parameters,
      limit: CATALOG_PAGE_LIMIT,
      ...(cursor || {})
    });
    items.push(...(Array.isArray(page?.items) ? page.items : []));
    const next = validActionCursor(page?.nextCursor, label);
    if (!next) return items;
    const key = cursorKey(next);
    if (cursors.has(key)) {
      throw new Error(`A paginação de ${label} repetiu o mesmo cursor.`);
    }
    cursors.add(key);
    cursor = next;
  }
  throw new Error(`A paginação de ${label} excedeu o limite seguro.`);
}

async function mapWithConcurrency(items, concurrency, worker) {
  const results = new Array(items.length);
  let nextIndex = 0;
  const consume = async () => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await worker(items[index], index);
    }
  };
  const workerCount = Math.min(items.length, concurrency);
  await Promise.all(Array.from({ length: workerCount }, () => consume()));
  return results;
}

function nextTrailCursor(page) {
  const cursor = page?.nextCursor;
  if (
    page?.hasMore !== true ||
    !cursor ||
    !Number.isSafeInteger(cursor.afterPathPosition) ||
    cursor.afterPathPosition < 0 ||
    !Number.isSafeInteger(cursor.afterItemPosition) ||
    cursor.afterItemPosition < 0 ||
    !UUID_PATTERN.test(text(cursor.afterId).trim())
  ) {
    if (page?.hasMore === true) {
      throw new Error("A paginação de Trilhas devolveu um cursor inválido.");
    }
    return null;
  }
  return cursor;
}

function completeTrailPage(groups, items, capabilities) {
  return Object.freeze({
    space: "trails",
    groups: Object.freeze(groups),
    items: Object.freeze(items),
    hasMore: false,
    nextCursor: null,
    capabilities: Object.freeze({
      catalogManage: capabilities.catalogManage === true,
      catalogReview: capabilities.catalogReview === true,
      organize: capabilities.organize !== false
    })
  });
}

function trailPageWithoutAuthority(value) {
  const page = trailPage(value);
  return completeTrailPage(
    page.groups,
    page.items.map((item) => Object.freeze({
      ...item,
      canEdit: false,
      canDelete: false,
      canRemove: false
    })),
    { catalogManage: false, catalogReview: false, organize: false }
  );
}

export class LearningSpaces {
  #trailMutationUserId = "";
  #trailMutationRequests = null;
  #trailMutationInFlight = new Map();
  #trailMutationPersistence = Promise.resolve();

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
      const previous = typeof this.store?.getSyncState === "function"
        ? await this.store.getSyncState(cacheKey(userId))
        : null;
      const currentIds = new Set((page?.items || []).map((item) => item.trailItemId));
      const removedIds = (previous?.version === CACHE_VERSION ? previous?.page?.items || [] : [])
        .map((item) => text(item?.trailItemId).trim().toLowerCase())
        .filter((trailItemId) => UUID_PATTERN.test(trailItemId) && !currentIds.has(trailItemId));
      await Promise.all(removedIds.flatMap((trailItemId) => [
        this.store.putSyncState(trailCourseCacheKey(userId, trailItemId), null),
        this.store.putSyncState(trailPersonalStateCacheKey(userId, trailItemId), null)
      ]));
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

  async clearCache({ purgeItems = false } = {}) {
    try {
      const userId = currentUserId(this.authClient);
      if (userId && typeof this.store?.putSyncState === "function") {
        if (purgeItems && typeof this.store?.getSyncState === "function") {
          const cached = await this.store.getSyncState(cacheKey(userId));
          const itemIds = (cached?.version === CACHE_VERSION ? cached?.page?.items || [] : [])
            .map((item) => text(item?.trailItemId).trim().toLowerCase())
            .filter((trailItemId) => UUID_PATTERN.test(trailItemId));
          await Promise.all(itemIds.flatMap((trailItemId) => [
            this.store.putSyncState(trailCourseCacheKey(userId, trailItemId), null),
            this.store.putSyncState(trailPersonalStateCacheKey(userId, trailItemId), null)
          ]));
        }
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

    try {
      const itemsById = new Map();
      const seenCursors = new Set();
      let cursor = null;
      let capabilities = null;
      let groups = null;
      for (let pageIndex = 0; pageIndex < MAX_TRAIL_PAGES; pageIndex += 1) {
        const page = trailPage(await this.catalog.listTrailItems({
          limit: TRAIL_PAGE_LIMIT,
          afterPathPosition: cursor?.afterPathPosition ?? null,
          afterItemPosition: cursor?.afterItemPosition ?? null,
          afterId: cursor?.afterId || null
        }));
        if (groups === null) {
          groups = page.groups;
        } else if (JSON.stringify(groups) !== JSON.stringify(page.groups)) {
          throw new Error("Os grupos de Trilhas mudaram durante a paginação.");
        }
        capabilities = capabilities === null
          ? page.capabilities
          : {
              catalogManage: capabilities.catalogManage && page.capabilities.catalogManage,
              catalogReview: capabilities.catalogReview && page.capabilities.catalogReview,
              organize: capabilities.organize && page.capabilities.organize
        };
        page.items.forEach((item) => {
          itemsById.set(item.trailItemId, item);
        });

        const nextCursor = nextTrailCursor(page);
        if (!nextCursor) {
          const complete = completeTrailPage(
            groups || [],
            [...itemsById.values()],
            capabilities || { catalogManage: false, catalogReview: false, organize: true }
          );
          await this.writeCache(complete);
          return { page: complete, stale: false, cachedAt: new Date().toISOString() };
        }
        const key = trailCursorKey(nextCursor);
        if (seenCursors.has(key)) {
          throw new Error("A paginação de Trilhas repetiu o mesmo cursor.");
        }
        seenCursors.add(key);
        cursor = nextCursor;
      }
      throw new Error("A paginação de Trilhas excedeu o limite seguro.");
    } catch (error) {
      if (!retryableReadFailure(error)) throw error;
      const cached = await this.readCache();
      const available = cached?.page || fallbackPage;
      if (!available) throw error;
      return {
        page: trailPageWithoutAuthority(available),
        stale: true,
        cachedAt: cached?.cachedAt || ""
      };
    }
  }

  async loadTrailSnapshot(options = {}) {
    const result = await this.loadTrails(options);
    if (!result?.page) throw new Error("Trilhas não possui uma projeção disponível.");
    return Object.freeze({
      ...result.page,
      stale: result.stale === true,
      cachedAt: text(result.cachedAt)
    });
  }

  async #mutateTrails(operation, argumentsValue) {
    const fingerprint = JSON.stringify([operation, argumentsValue]);
    const requests = await this.#loadTrailMutationRequests();
    let mutationRequestId = requests.get(fingerprint);
    if (!mutationRequestId) {
      mutationRequestId = requestId();
      requests.set(fingerprint, mutationRequestId);
      await this.#persistTrailMutationRequests();
    }
    const inFlight = this.#trailMutationInFlight.get(fingerprint);
    if (inFlight) return inFlight;
    const pending = (async () => {
      try {
        const result = await this.catalog.mutateTrails({
          requestId: mutationRequestId,
          operation,
          arguments: argumentsValue
        });
        requests.delete(fingerprint);
        await this.#persistTrailMutationRequests();
        await this.clearCache();
        return result;
      } catch (error) {
        if (!retryableReadFailure(error)) {
          requests.delete(fingerprint);
          await this.#persistTrailMutationRequests();
        }
        throw error;
      }
    })();
    this.#trailMutationInFlight.set(fingerprint, pending);
    try {
      return await pending;
    } finally {
      if (this.#trailMutationInFlight.get(fingerprint) === pending) {
        this.#trailMutationInFlight.delete(fingerprint);
      }
    }
  }

  async #loadTrailMutationRequests() {
    const userId = currentUserId(this.authClient);
    if (!userId) return new Map();
    if (this.#trailMutationUserId === userId && this.#trailMutationRequests) {
      return this.#trailMutationRequests;
    }
    this.#trailMutationUserId = userId;
    this.#trailMutationInFlight.clear();
    this.#trailMutationRequests = new Map();
    if (typeof this.store?.getSyncState !== "function") return this.#trailMutationRequests;
    try {
      const cached = await this.store.getSyncState(trailMutationCacheKey(userId));
      if (cached?.version !== TRAIL_MUTATION_CACHE_VERSION || !Array.isArray(cached?.entries)) {
        return this.#trailMutationRequests;
      }
      cached.entries.forEach((entry) => {
        if (typeof entry?.fingerprint === "string" && entry.fingerprint.length <= 4096 &&
            UUID_PATTERN.test(text(entry?.requestId).trim())) {
          this.#trailMutationRequests.set(entry.fingerprint, text(entry.requestId).trim().toLowerCase());
        }
      });
    } catch {
      // A memória da sessão ainda preserva idempotência quando o cache local está indisponível.
    }
    return this.#trailMutationRequests;
  }

  async #persistTrailMutationRequests() {
    const userId = this.#trailMutationUserId;
    const entries = [...(this.#trailMutationRequests || new Map()).entries()]
      .map(([fingerprint, mutationRequestId]) => ({
        fingerprint,
        requestId: mutationRequestId
      }));
    if (!userId || typeof this.store?.putSyncState !== "function") return false;
    const payload = entries.length
      ? { version: TRAIL_MUTATION_CACHE_VERSION, entries }
      : null;
    this.#trailMutationPersistence = this.#trailMutationPersistence
      .catch(() => undefined)
      .then(() => this.store.putSyncState(trailMutationCacheKey(userId), payload));
    try {
      await this.#trailMutationPersistence;
      return true;
    } catch {
      return false;
    }
  }

  createGroup({ title, targetPosition = null } = {}) {
    const normalizedTitle = text(title).trim();
    if (!normalizedTitle) throw new TypeError("Informe o nome do grupo.");
    return this.#mutateTrails("create_group", {
      title: normalizedTitle,
      ...(Number.isSafeInteger(targetPosition) && targetPosition >= 0 ? { targetPosition } : {})
    });
  }

  renameGroup({ groupId, title } = {}) {
    const normalizedTitle = text(title).trim();
    if (!normalizedTitle) throw new TypeError("Informe o nome do grupo.");
    return this.#mutateTrails("rename_group", {
      groupId: text(groupId).trim().toLowerCase(),
      title: normalizedTitle
    });
  }

  moveGroup({ groupId, targetPosition } = {}) {
    return this.#mutateTrails("move_group", {
      groupId: text(groupId).trim().toLowerCase(),
      targetPosition: integer(targetPosition)
    });
  }

  deleteGroup({ groupId } = {}) {
    return this.#mutateTrails("delete_group", {
      groupId: text(groupId).trim().toLowerCase()
    });
  }

  placeItem({ trailItemId, groupId, targetPosition = null } = {}) {
    return this.#mutateTrails("place_item", {
      trailItemId: text(trailItemId).trim().toLowerCase(),
      groupId: text(groupId).trim().toLowerCase(),
      ...(Number.isSafeInteger(targetPosition) && targetPosition >= 0 ? { targetPosition } : {})
    });
  }

  moveItem({ trailItemId, groupId, targetPosition } = {}) {
    return this.#mutateTrails("move_item", {
      trailItemId: text(trailItemId).trim().toLowerCase(),
      groupId: text(groupId).trim().toLowerCase(),
      targetPosition: integer(targetPosition)
    });
  }

  removeItemFromGroup({ trailItemId } = {}) {
    return this.#mutateTrails("remove_item_from_group", {
      trailItemId: text(trailItemId).trim().toLowerCase()
    });
  }

  async readWorkspaceCourseCache(item) {
    const trailItemId = text(item?.trailItemId || item).trim().toLowerCase();
    const userId = currentUserId(this.authClient);
    if (!userId || !UUID_PATTERN.test(trailItemId) ||
        typeof this.store?.getSyncState !== "function") return null;
    const cached = await this.store.getSyncState(trailCourseCacheKey(userId, trailItemId));
    if (cached?.contract !== TRAIL_COURSE_CACHE_CONTRACT ||
        cached?.trailItemId !== trailItemId ||
        !Number.isSafeInteger(Number(cached?.revision)) || Number(cached.revision) < 1 ||
        !Array.isArray(cached?.response?.parts)) return null;
    const expectedRevision = item && typeof item === "object" && item.revision !== null
      ? Number(item.revision)
      : null;
    if (Number.isSafeInteger(expectedRevision) && expectedRevision !== Number(cached.revision)) {
      return null;
    }
    return structuredClone(cached.response);
  }

  async cacheWorkspaceCourse(item, response, course) {
    const trailItemId = text(item?.trailItemId || item).trim().toLowerCase();
    const userId = currentUserId(this.authClient);
    const revision = Number(response?.revision);
    const validation = validateProjectDocument({
      contract: "aralearn.contract",
      version: 4,
      kind: "project",
      courses: [course]
    });
    if (!userId || !UUID_PATTERN.test(trailItemId) ||
        response?.trailItemId !== trailItemId ||
        !Number.isSafeInteger(revision) || revision < 1 ||
        !Array.isArray(response?.parts) || !validation.ok) {
      throw new Error("A composição corrente não pode ser armazenada offline.");
    }
    await this.store.putSyncState(trailCourseCacheKey(userId, trailItemId), {
      contract: TRAIL_COURSE_CACHE_CONTRACT,
      trailItemId,
      revision,
      cachedAt: new Date().toISOString(),
      response: structuredClone(response)
    });
    return true;
  }

  async clearWorkspaceCourseCache(trailItemId) {
    const normalized = text(trailItemId).trim().toLowerCase();
    const userId = currentUserId(this.authClient);
    if (userId && UUID_PATTERN.test(normalized) && typeof this.store?.putSyncState === "function") {
      await this.store.putSyncState(trailCourseCacheKey(userId, normalized), null);
    }
  }

  async loadWorkspaceCourse(item) {
    if (globalThis.navigator?.onLine === false) {
      const cached = await this.readWorkspaceCourseCache(item);
      if (cached) return cached;
      throw new Error("A composição deste curso ainda não está disponível offline.");
    }
    try {
      return await this.#loadWorkspaceCourseRemote(item);
    } catch (error) {
      if (!retryableReadFailure(error)) throw error;
      const cached = await this.readWorkspaceCourseCache(item);
      if (cached) return cached;
      throw error;
    }
  }

  async #loadWorkspaceCourseRemote(item) {
    const trailItemId = text(item?.trailItemId || item).trim().toLowerCase();
    if (!UUID_PATTERN.test(trailItemId)) throw new TypeError("Item de Trilhas inválido.");
    const seenCursors = new Set();
    const seenParts = new Set();
    const parts = [];
    let cursor = null;
    let revision = null;
    let identity = null;
    for (let pageIndex = 0; pageIndex < MAX_TRAIL_PAGES; pageIndex += 1) {
      const page = await this.catalog.getTrailWorkspaceCourse({
        trailItemId,
        limit: TRAIL_PAGE_LIMIT,
        afterCursor: cursor,
        expectedRevision: revision
      });
      const pageRevision = Number(page?.revision);
      if (!Number.isSafeInteger(pageRevision) || pageRevision < 1) {
        throw new Error("A composição corrente devolveu uma revisão inválida.");
      }
      if (revision === null) {
        revision = pageRevision;
        identity = {
          trailItemId: text(page?.trailItemId).toLowerCase(),
          workspaceId: text(page?.workspaceId).toLowerCase(),
          courseKey: text(page?.courseKey)
        };
        if (
          identity.trailItemId !== trailItemId ||
          !UUID_PATTERN.test(identity.workspaceId) ||
          !identity.courseKey
        ) throw new Error("A composição corrente devolveu identidade inválida.");
      } else if (
        pageRevision !== revision ||
        text(page?.trailItemId).toLowerCase() !== identity.trailItemId ||
        text(page?.workspaceId).toLowerCase() !== identity.workspaceId ||
        text(page?.courseKey) !== identity.courseKey
      ) {
        throw new Error("A composição corrente mudou durante a paginação.");
      }
      if (!Array.isArray(page?.parts)) {
        throw new Error("A composição corrente devolveu uma página inválida.");
      }
      for (const part of page.parts) {
        const key = `${text(part?.entityType)}:${text(part?.id)}`;
        if (!text(part?.entityType) || !text(part?.id) || seenParts.has(key)) {
          throw new Error("A composição corrente devolveu partes repetidas ou sem identidade.");
        }
        seenParts.add(key);
        parts.push(part);
      }
      if (page?.hasMore !== true) {
        if (page?.nextCursor !== null && page?.nextCursor !== undefined) {
          throw new Error("A composição corrente devolveu cursor após a última página.");
        }
        return Object.freeze({ ...identity, revision, parts: Object.freeze(parts) });
      }
      const nextCursor = text(page?.nextCursor);
      if (!nextCursor || nextCursor.length > 4096 || seenCursors.has(nextCursor)) {
        throw new Error("A paginação da composição devolveu um cursor inválido.");
      }
      seenCursors.add(nextCursor);
      cursor = nextCursor;
    }
    throw new Error("A paginação da composição excedeu o limite seguro.");
  }

  async loadWorkspace(workspaceId, view = "outline") {
    if (!UUID_PATTERN.test(text(workspaceId))) throw new TypeError("Plano inválido.");
    return this.catalog.executeApplicationAuthoringAction("lerWorkspaceDeAutoria", {
      workspaceId,
      view
    });
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

  async addCourseToTrails(courseId) {
    const normalizedCourseId = text(courseId).trim().toLowerCase();
    if (!UUID_PATTERN.test(normalizedCourseId)) {
      throw new TypeError("Curso inválido para inclusão em Trilhas.");
    }
    const result = await this.catalog.selectCourse(normalizedCourseId);
    await this.clearCache();
    return result;
  }

  async loadManagedCatalog() {
    const collections = await loadCatalogActionItems(this.catalog, {
      operation: "list_collections",
      label: "Coleções"
    });
    const normalizedCollections = collections.map((collection) => {
      const collectionId = text(collection?.collectionId).trim().toLowerCase();
      if (!UUID_PATTERN.test(collectionId)) {
        throw new Error("Coleção administrativa sem identidade válida.");
      }
      return { ...collection, collectionId };
    });
    const groups = await mapWithConcurrency(
      normalizedCollections,
      CATALOG_READ_CONCURRENCY,
      async (collection) => {
        const courses = await loadCatalogActionItems(this.catalog, {
          operation: "list_collection_courses",
          label: "cursos da Coleção",
          collectionId: collection.collectionId
        });
        return Object.freeze({ ...collection, courses: Object.freeze(courses) });
      }
    );
    return Object.freeze(groups);
  }

  async createCatalogCollection({ title, description = "" } = {}) {
    const normalizedTitle = text(title).trim();
    if (!normalizedTitle) throw new TypeError("Informe o nome da Coleção.");
    return this.catalog.executeApplicationAuthoringAction("editarCatalogo", {
      operation: "create_collection",
      requestId: requestId(),
      contractKey: collectionContractKey(normalizedTitle),
      title: normalizedTitle,
      ...(text(description).trim() ? { description: text(description).trim() } : {})
    });
  }

  async updateCatalogCollection({ collectionId, revision, title, description = "" } = {}) {
    const normalizedCollectionId = text(collectionId).trim().toLowerCase();
    const normalizedTitle = text(title).trim();
    if (!UUID_PATTERN.test(normalizedCollectionId) || !normalizedTitle) {
      throw new TypeError("Coleção inválida para edição.");
    }
    return this.catalog.executeApplicationAuthoringAction("editarCatalogo", {
      operation: "update_collection",
      requestId: requestId(),
      collectionId: normalizedCollectionId,
      expectedRevision: Number(revision),
      title: normalizedTitle,
      description: text(description).trim()
    });
  }

  async moveCatalogCollection({ collectionId, revision, position } = {}) {
    const normalizedCollectionId = text(collectionId).trim().toLowerCase();
    if (
      !UUID_PATTERN.test(normalizedCollectionId)
      || !Number.isSafeInteger(revision)
      || revision < 1
      || !Number.isSafeInteger(position)
      || position < 0
    ) {
      throw new TypeError("Coleção inválida para ordenação.");
    }
    return this.catalog.executeApplicationAuthoringAction("editarCatalogo", {
      operation: "move_collection",
      requestId: requestId(),
      collectionId: normalizedCollectionId,
      expectedRevision: revision,
      position
    });
  }

  async retireCatalogCollection({ collectionId, revision, replacementCollectionId = null } = {}) {
    const normalizedCollectionId = text(collectionId).trim().toLowerCase();
    const replacement = replacementCollectionId
      ? text(replacementCollectionId).trim().toLowerCase()
      : null;
    if (!UUID_PATTERN.test(normalizedCollectionId) || (replacement && !UUID_PATTERN.test(replacement))) {
      throw new TypeError("Coleção inválida para retirada.");
    }
    return this.catalog.executeApplicationAuthoringAction("retirarDoCatalogo", {
      operation: "retire_collection",
      requestId: requestId(),
      collectionId: normalizedCollectionId,
      expectedRevision: Number(revision),
      ...(replacement ? { replacementCollectionId: replacement } : {})
    });
  }

  async moveCatalogCourse({ courseId, placementRevision, targetCollectionId, position = null } = {}) {
    const normalizedCourseId = text(courseId).trim().toLowerCase();
    const normalizedCollectionId = text(targetCollectionId).trim().toLowerCase();
    if (!UUID_PATTERN.test(normalizedCourseId) || !UUID_PATTERN.test(normalizedCollectionId)) {
      throw new TypeError("Curso ou Coleção inválidos para movimentação.");
    }
    return this.catalog.executeApplicationAuthoringAction("editarCatalogo", {
      operation: "move_course",
      requestId: requestId(),
      courseId: normalizedCourseId,
      expectedPlacementRevision: Number(placementRevision),
      targetCollectionId: normalizedCollectionId,
      ...(Number.isSafeInteger(position) && position >= 0 ? { position } : {})
    });
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

  removeTrailItem({ selectionId, courseId, contentHash } = {}) {
    return this.removeCourseFromTrails({
      selectionId,
      courseId,
      expectedContentHash: contentHash
    });
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
