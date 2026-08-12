import {
  executeIdempotentCourseRemoval,
  privateCourseRemovalRequestId,
  removeCatalogCourse
} from "../assist/courseRemovalCommand.js";
import { rebaseCardAssistanceTextChange } from "../assist/cardAssistanceScope.js";
import { validateProjectDocument } from "../domain/aralearnProject.js";
import { canonicalStringify } from "../persistence/canonicalCourseHash.js";
import { courseFromWorkspaceParts } from "../ui/homeTrailProjection.js";

const CACHE_VERSION = 5;
const CACHE_PREFIX = "learning.spaces.v1";
const TRAIL_COURSE_CACHE_CONTRACT = "aralearn.trail-course-cache.v1";
const TRAIL_COURSE_CACHE_PREFIX = "learning.trail.course.v1";
const WORKSPACE_AUTHORING_QUEUE_CONTRACT = "aralearn.workspace-authoring-queue.v1";
const WORKSPACE_AUTHORING_QUEUE_PREFIX = "learning.workspace.authoring.v1";
const WORKSPACE_AUTHORING_LOCK_CONTRACT = "aralearn.workspace-authoring-lock.v1";
const WORKSPACE_AUTHORING_LOCK_LEASE_MS = 30_000;
const WORKSPACE_AUTHORING_LOCK_RENEW_MS = 5_000;
const WORKSPACE_AUTHORING_LOCK_RETRY_MS = 20;
const WORKSPACE_AUTHORING_QUEUE_LIMIT = 100;
const WORKSPACE_AUTHORING_QUEUE_MAX_BYTES = 16 * 1024 * 1024;
const TRAIL_MUTATION_CACHE_VERSION = 2;
const TRAIL_MUTATION_CACHE_PREFIX = "learning.trail.mutations.v1";
const TRAIL_PAGE_LIMIT = 100;
const MAX_TRAIL_PAGES = 100;
const CATALOG_PAGE_LIMIT = 100;
const MAX_CATALOG_PAGES = 100;
const CATALOG_READ_CONCURRENCY = 4;
const OBSERVATION_PAGE_LIMIT = 50;
const MAX_OBSERVATION_PAGES = 100;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const CONTENT_HASH_PATTERN = /^[0-9a-f]{64}$/u;
const TRAIL_TITLE_COLLATOR = new Intl.Collator("pt-BR", {
  usage: "sort",
  sensitivity: "base",
  numeric: true
});
const workspaceAuthoringFallbackLocks = new Map();

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

function workspaceAuthoringQueueKey(userId, trailItemId) {
  return `${WORKSPACE_AUTHORING_QUEUE_PREFIX}:${userId}:${trailItemId}`;
}

function sameCanonical(left, right) {
  return canonicalStringify(left) === canonicalStringify(right);
}

function authoringConflict(message) {
  const error = new Error(message);
  error.code = "workspace_authoring_conflict";
  error.conflict = true;
  return error;
}

function validEntityPath(value, min = 1, max = 5) {
  return Array.isArray(value) && value.length >= min && value.length <= max &&
    value.every((entry) => text(entry).trim());
}

function normalizeWorkspaceAuthoringOperation(value = {}) {
  const kind = value.kind === "cards" ? "cards" : value.kind === "metadata" ? "metadata" : "";
  const operationId = text(value.operationId).trim();
  const requestIdValue = text(value.requestId).trim().toLowerCase();
  if (!kind || !operationId || !UUID_PATTERN.test(requestIdValue)) {
    throw new Error("A fila de autoria contém uma operação inválida.");
  }
  if (kind === "metadata") {
    const entityType = text(value.entityType).trim();
    const allowedFields = new Set(["title", "goal"]);
    const hasMetadataRecords = value.baseMetadata && typeof value.baseMetadata === "object" &&
      !Array.isArray(value.baseMetadata) && value.metadata &&
      typeof value.metadata === "object" && !Array.isArray(value.metadata);
    const baseFields = hasMetadataRecords ? Object.keys(value.baseMetadata) : [];
    const nextFields = hasMetadataRecords ? Object.keys(value.metadata) : [];
    if (!new Set(["course", "module", "lesson", "microsequence", "card"]).has(entityType) ||
        entityType === "card" || !validEntityPath(value.entityPath) ||
        !hasMetadataRecords ||
        baseFields.length !== nextFields.length ||
        baseFields.some((field) => !allowedFields.has(field) || !nextFields.includes(field))) {
      throw new Error("A fila de autoria contém metadados inválidos.");
    }
    return {
      kind,
      operationId,
      requestId: requestIdValue,
      entityType,
      entityPath: value.entityPath.map((entry) => text(entry).trim()),
      baseMetadata: structuredClone(value.baseMetadata),
      metadata: structuredClone(value.metadata),
      createdAt: text(value.createdAt),
      attemptedAt: text(value.attemptedAt)
    };
  }
  if (!validEntityPath(value.microsequencePath, 4, 4) ||
      !Array.isArray(value.baseCards) || !Array.isArray(value.cards) ||
      value.baseCards.length > 500 || value.cards.length > 500) {
    throw new Error("A fila de autoria contém cards inválidos.");
  }
  const baseStructure = value.baseCards.map((card) => [text(card?.id), Number(card?.position)]);
  const nextStructure = value.cards.map((card) => [text(card?.id), Number(card?.position)]);
  if (baseStructure.length !== nextStructure.length ||
      baseStructure.some(([id, position], index) =>
        !id || !Number.isSafeInteger(position) || position < 1 ||
        id !== nextStructure[index]?.[0] || position !== nextStructure[index]?.[1]
      )) {
    throw new Error("A edição textual não pode alterar a identidade, a ordem ou a quantidade dos cards.");
  }
  value.baseCards.forEach((baseCard, index) => {
    rebaseCardAssistanceTextChange({
      baseCard,
      localCard: value.cards[index],
      remoteCard: baseCard
    });
  });
  return {
    kind,
    operationId,
    requestId: requestIdValue,
    microsequencePath: value.microsequencePath.map((entry) => text(entry).trim()),
    baseCards: structuredClone(value.baseCards),
    cards: structuredClone(value.cards),
    createdAt: text(value.createdAt),
    attemptedAt: text(value.attemptedAt)
  };
}

function workspaceAuthoringOperationTarget(operation) {
  return operation.kind === "metadata"
    ? `metadata:${operation.entityType}:${operation.entityPath.join("\u0000")}`
    : `cards:${operation.microsequencePath.join("\u0000")}`;
}

function coalesceWorkspaceAuthoringOperations(values, nextOperation) {
  const operations = values.map(normalizeWorkspaceAuthoringOperation);
  const next = normalizeWorkspaceAuthoringOperation(nextOperation);
  const target = workspaceAuthoringOperationTarget(next);
  let index = -1;
  for (let candidate = operations.length - 1; candidate >= 0; candidate -= 1) {
    if (!operations[candidate].attemptedAt &&
        workspaceAuthoringOperationTarget(operations[candidate]) === target) {
      index = candidate;
      break;
    }
  }
  if (index < 0) return [...operations, next];
  const previous = operations[index];
  if (previous.kind === "metadata") {
    const metadata = {};
    for (const field of Object.keys(next.metadata)) {
      const baseValue = next.baseMetadata[field];
      const localValue = next.metadata[field];
      const queuedValue = previous.metadata[field];
      if (sameCanonical(localValue, baseValue)) {
        metadata[field] = structuredClone(queuedValue);
      } else if (sameCanonical(queuedValue, baseValue) || sameCanonical(queuedValue, localValue)) {
        metadata[field] = structuredClone(localValue);
      } else {
        throw authoringConflict(`O campo "${field}" possui duas edições locais concorrentes.`);
      }
    }
    operations[index] = {
      ...next,
      baseMetadata: structuredClone(previous.baseMetadata),
      metadata,
      createdAt: previous.createdAt
    };
  } else {
    const { cards } = rebaseWorkspaceTextCards(previous.cards, next);
    operations[index] = {
      ...next,
      baseCards: structuredClone(previous.baseCards),
      cards,
      createdAt: previous.createdAt
    };
  }
  return operations;
}

function normalizeWorkspaceAuthoringQueue(value, { trailItemId, workspaceId, courseKey } = {}) {
  if (!value) return null;
  const normalizedTrailItemId = text(value.trailItemId).trim().toLowerCase();
  const normalizedWorkspaceId = text(value.workspaceId).trim().toLowerCase();
  const normalizedCourseKey = text(value.courseKey).trim();
  const requestedTrailItemId = text(trailItemId).trim().toLowerCase();
  const requestedWorkspaceId = text(workspaceId).trim().toLowerCase();
  const requestedCourseKey = text(courseKey).trim();
  const operations = Array.isArray(value.operations)
    ? value.operations.map(normalizeWorkspaceAuthoringOperation)
    : [];
  if (value.contract !== WORKSPACE_AUTHORING_QUEUE_CONTRACT ||
      !UUID_PATTERN.test(normalizedTrailItemId) || !UUID_PATTERN.test(normalizedWorkspaceId) ||
      !normalizedCourseKey || !value.draftCourse ||
      !Number.isSafeInteger(Number(value.baseRevision)) || Number(value.baseRevision) < 1 ||
      operations.length > WORKSPACE_AUTHORING_QUEUE_LIMIT) {
    throw new Error("A fila offline de autoria do workspace é inválida.");
  }
  if ((requestedTrailItemId && requestedTrailItemId !== normalizedTrailItemId) ||
      (requestedWorkspaceId && requestedWorkspaceId !== normalizedWorkspaceId) ||
      (requestedCourseKey && requestedCourseKey !== normalizedCourseKey)) {
    throw new Error("A fila offline pertence a outra composição de workspace.");
  }
  const validation = validateProjectDocument({
    contract: "aralearn.library.v1",
    scope: "course",
    courses: [value.draftCourse]
  });
  if (!validation.ok || value.draftCourse.id !== normalizedCourseKey) {
    throw new Error("O rascunho offline do workspace viola o contrato por packages.");
  }
  return {
    contract: WORKSPACE_AUTHORING_QUEUE_CONTRACT,
    trailItemId: normalizedTrailItemId,
    workspaceId: normalizedWorkspaceId,
    courseKey: normalizedCourseKey,
    baseRevision: Number(value.baseRevision),
    status: value.status === "conflict" ? "conflict" : "pending",
    errorMessage: text(value.errorMessage),
    operations,
    draftCourse: structuredClone(value.draftCourse),
    updatedAt: text(value.updatedAt)
  };
}

function findCourseEntity(course, entityType, entityPath) {
  if (!course || entityPath[0] !== course.id) return null;
  if (entityType === "course") return course;
  const moduleValue = (course.modules || []).find((item) => item.id === entityPath[1]);
  if (entityType === "module") return moduleValue || null;
  const lesson = (moduleValue?.lessons || []).find((item) => item.id === entityPath[2]);
  if (entityType === "lesson") return lesson || null;
  const microsequence = (lesson?.microsequences || []).find((item) => item.id === entityPath[3]);
  if (entityType === "microsequence") return microsequence || null;
  return (microsequence?.cards || []).find((item) => item.id === entityPath[4]) || null;
}

function metadataProjection(entity, metadata) {
  return Object.fromEntries(Object.keys(metadata).map((field) => [
    field,
    structuredClone(entity?.[field] ?? (field === "branchOf" ? null : ""))
  ]));
}

function reconcileWorkspaceMetadata(course, operation, { conflictPolicy = "reject" } = {}) {
  const entity = findCourseEntity(course, operation.entityType, operation.entityPath);
  if (!entity) throw authoringConflict("O texto editado não existe mais no workspace.");
  const remoteMetadata = metadataProjection(entity, operation.metadata);
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
      throw authoringConflict(`O campo "${field}" também foi alterado em outro dispositivo.`);
    }
  }
  return { changed: !sameCanonical(remoteMetadata, metadata), metadata };
}

function findMicrosequence(course, path) {
  return findCourseEntity(course, "microsequence", path);
}

function rebaseWorkspaceTextCards(remoteCards, operation, { conflictPolicy = "reject" } = {}) {
  const baseById = new Map(operation.baseCards.map((card) => [text(card?.id), card]));
  const localById = new Map(operation.cards.map((card) => [text(card?.id), card]));
  if (baseById.size !== operation.baseCards.length || localById.size !== operation.cards.length) {
    throw authoringConflict("A microssequência possui identidades de card incompatíveis.");
  }
  const remoteIds = remoteCards.map((card) => text(card?.id));
  if (remoteIds.some((id) => !id) || new Set(remoteIds).size !== remoteIds.length) {
    throw authoringConflict("A microssequência remota possui identidades de card incompatíveis.");
  }
  const remoteIdsSet = new Set(remoteIds);
  for (const [id, baseCard] of baseById) {
    const localCard = localById.get(id);
    if (!remoteIdsSet.has(id) && !sameCanonical(baseCard, localCard)) {
      throw authoringConflict(`O card "${id}" editado localmente foi retirado em outro dispositivo.`);
    }
  }
  try {
    const cards = remoteCards.map((remoteCard) => {
      const id = text(remoteCard?.id);
      const baseCard = baseById.get(id);
      const localCard = localById.get(id);
      if (!baseCard || !localCard || sameCanonical(baseCard, localCard)) {
        return structuredClone(remoteCard);
      }
      const alignedBase = { ...structuredClone(baseCard), position: remoteCard.position };
      const alignedLocal = { ...structuredClone(localCard), position: remoteCard.position };
      return rebaseCardAssistanceTextChange({
        baseCard: alignedBase,
        localCard: alignedLocal,
        remoteCard,
        conflictPolicy
      }).card;
    });
    return { changed: !sameCanonical(cards, remoteCards), cards };
  } catch (error) {
    if (error?.conflict === true) throw error;
    if (error?.code === "CARD_ASSISTANCE_TEXT_CONFLICT") {
      throw authoringConflict(
        "O mesmo texto também foi alterado em outro dispositivo. Escolha qual redação deve prevalecer."
      );
    }
    throw error;
  }
}

function reconcileWorkspaceCards(course, operation, options = {}) {
  const microsequence = findMicrosequence(course, operation.microsequencePath);
  if (!microsequence) throw authoringConflict("A microssequência editada não existe mais.");
  const remoteCards = Array.isArray(microsequence.cards) ? microsequence.cards : [];
  if (sameCanonical(remoteCards, operation.cards)) {
    return { changed: false, cards: structuredClone(remoteCards) };
  }
  return rebaseWorkspaceTextCards(remoteCards, operation, options);
}

function projectWorkspaceDraftCourse(currentDraft, incomingDraft, operation) {
  if (!currentDraft) return structuredClone(incomingDraft);
  const draft = structuredClone(currentDraft);
  if (operation.kind === "metadata") {
    const reconciliation = reconcileWorkspaceMetadata(draft, operation);
    const entity = findCourseEntity(draft, operation.entityType, operation.entityPath);
    Object.assign(entity, structuredClone(reconciliation.metadata));
  } else {
    const reconciliation = reconcileWorkspaceCards(draft, operation);
    const microsequence = findMicrosequence(draft, operation.microsequencePath);
    microsequence.cards = structuredClone(reconciliation.cards);
  }
  return draft;
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
    canEditOffline: value.canEditOffline === true,
    canDelete: value.canDelete === true,
    canRemove: value.canRemove === true,
    authoringStatus: ["pending", "conflict"].includes(value.authoringStatus)
      ? value.authoringStatus
      : "",
    authoringPendingCount: integer(value.authoringPendingCount),
    authoringErrorMessage: text(value.authoringErrorMessage),
    pathId: value.pathId === null ? null : text(value.pathId).toLowerCase(),
    pathTitle: value.pathTitle === null ? null : text(value.pathTitle).trim() || null,
    revision: value.revision === null ? null : integer(value.revision),
    updatedAt: text(value.updatedAt)
  });
}

function trailGroup(value = {}) {
  const id = text(value.id).trim().toLowerCase();
  if (!UUID_PATTERN.test(id)) throw new Error("Trilhas devolveu um grupo sem identidade válida.");
  return Object.freeze({
    id,
    title: text(value.title).trim() || "Grupo"
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
  return cursor.afterId;
}

function trailCursorKey(cursor) {
  return cursor.afterId;
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
  const afterId = text(value?.afterId).trim().toLowerCase();
  if (!UUID_PATTERN.test(afterId)) {
    throw new Error(`A paginação de ${label} devolveu um cursor inválido.`);
  }
  return { afterId };
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
    !UUID_PATTERN.test(text(cursor.afterId).trim())
  ) {
    if (page?.hasMore === true) {
      throw new Error("A paginação de Trilhas devolveu um cursor inválido.");
    }
    return null;
  }
  return cursor;
}

function compareTrailTitles(left, right) {
  return TRAIL_TITLE_COLLATOR.compare(text(left?.title), text(right?.title)) ||
    text(left?.trailItemId || left?.id).localeCompare(text(right?.trailItemId || right?.id));
}

function completeTrailPage(groups, items, capabilities) {
  const sortedGroups = [...groups].sort(compareTrailTitles);
  const groupTitles = new Map(sortedGroups.map((group) => [group.id, group.title]));
  const sortedItems = [...items].sort((left, right) => {
    const leftGroup = left.pathId ? groupTitles.get(left.pathId) || left.pathTitle || "" : "Outros";
    const rightGroup = right.pathId ? groupTitles.get(right.pathId) || right.pathTitle || "" : "Outros";
    return TRAIL_TITLE_COLLATOR.compare(leftGroup, rightGroup) || compareTrailTitles(left, right);
  });
  return Object.freeze({
    space: "trails",
    groups: Object.freeze(sortedGroups),
    items: Object.freeze(sortedItems),
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
      canEditOffline: false,
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

  async #offlineTrailPage(value) {
    const cachedAuthority = trailPage(value);
    const withoutAuthority = trailPageWithoutAuthority(value);
    const cachedById = new Map(cachedAuthority.items.map((item) => [item.trailItemId, item]));
    const items = await Promise.all(withoutAuthority.items.map(async (item) => {
      const cachedItem = cachedById.get(item.trailItemId);
      if (!cachedItem?.workspaceId || cachedItem.canEdit !== true) return item;
      try {
        const [course, queue] = await Promise.all([
          this.readWorkspaceCourseCache(cachedItem),
          this.readWorkspaceAuthoringQueue(cachedItem)
        ]);
        if (!course && !queue) return item;
        return Object.freeze({ ...item, canEditOffline: true });
      } catch {
        return item;
      }
    }));
    return completeTrailPage(
      withoutAuthority.groups,
      items,
      { catalogManage: false, catalogReview: false, organize: false }
    );
  }

  async loadTrails({
    online = globalThis.navigator?.onLine !== false,
    fallbackPage = null
  } = {}) {
    if (!online) {
      const cached = await this.readCache();
      const available = cached?.page || fallbackPage;
      return {
        page: available ? await this.#offlineTrailPage(available) : null,
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
        page: await this.#offlineTrailPage(available),
        stale: true,
        cachedAt: cached?.cachedAt || ""
      };
    }
  }

  async loadTrailSnapshot(options = {}) {
    const result = await this.loadTrails(options);
    if (!result?.page) throw new Error("Trilhas não possui uma projeção disponível.");
    const items = await Promise.all(result.page.items.map(async (item) => {
      if (!item.workspaceId) return item;
      try {
        const queue = await this.readWorkspaceAuthoringQueue(item);
        return Object.freeze({
          ...item,
          authoringStatus: queue?.status || "",
          authoringPendingCount: queue?.operations?.length || 0,
          authoringErrorMessage: queue?.errorMessage || ""
        });
      } catch (error) {
        return Object.freeze({
          ...item,
          authoringStatus: "conflict",
          authoringPendingCount: 1,
          authoringErrorMessage: error instanceof Error
            ? error.message
            : "A fila local de autoria precisa de atenção."
        });
      }
    }));
    const page = completeTrailPage(
      result.page.groups,
      items,
      result.page.capabilities
    );
    return Object.freeze({
      ...page,
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
        if (cached !== null && cached !== undefined) {
          await this.store.putSyncState(trailMutationCacheKey(userId), null);
        }
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

  createGroup({ title } = {}) {
    const normalizedTitle = text(title).trim();
    if (!normalizedTitle) throw new TypeError("Informe o nome do grupo.");
    return this.#mutateTrails("create_group", {
      title: normalizedTitle
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

  deleteGroup({ groupId } = {}) {
    return this.#mutateTrails("delete_group", {
      groupId: text(groupId).trim().toLowerCase()
    });
  }

  placeItem({ trailItemId, groupId } = {}) {
    return this.#mutateTrails("place_item", {
      trailItemId: text(trailItemId).trim().toLowerCase(),
      groupId: text(groupId).trim().toLowerCase()
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
    if (Number.isSafeInteger(expectedRevision) && Number(cached.revision) < expectedRevision) {
      return null;
    }
    return structuredClone(cached.response);
  }

  async cacheWorkspaceCourse(item, response, course) {
    const trailItemId = text(item?.trailItemId || item).trim().toLowerCase();
    const userId = currentUserId(this.authClient);
    const revision = Number(response?.revision);
    const validation = validateProjectDocument({
      contract: "aralearn.library.v1",
      scope: "course",
      courses: [course]
    });
    if (!userId || !UUID_PATTERN.test(trailItemId) ||
        response?.trailItemId !== trailItemId ||
        !Number.isSafeInteger(revision) || revision < 1 ||
        !Array.isArray(response?.parts) || !validation.ok) {
      throw new Error("A composição corrente não pode ser armazenada offline.");
    }
    if (response?.draftCourse && response?.authoringQueue && response.parts.length === 0) {
      return false;
    }
    const cachedResponse = structuredClone(response);
    delete cachedResponse.draftCourse;
    delete cachedResponse.authoringQueue;
    await this.store.putSyncState(trailCourseCacheKey(userId, trailItemId), {
      contract: TRAIL_COURSE_CACHE_CONTRACT,
      trailItemId,
      revision,
      cachedAt: new Date().toISOString(),
      response: cachedResponse
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

  async readWorkspaceAuthoringQueue(courseRef) {
    const userId = currentUserId(this.authClient);
    const trailItemId = text(courseRef?.trailItemId).trim().toLowerCase();
    if (!userId || !UUID_PATTERN.test(trailItemId) ||
        typeof this.store?.getSyncState !== "function") return null;
    const value = await this.store.getSyncState(workspaceAuthoringQueueKey(userId, trailItemId));
    return normalizeWorkspaceAuthoringQueue(value, courseRef);
  }

  async #writeWorkspaceAuthoringQueue(courseRef, value) {
    const userId = currentUserId(this.authClient);
    const trailItemId = text(courseRef?.trailItemId).trim().toLowerCase();
    if (!userId || !UUID_PATTERN.test(trailItemId) ||
        typeof this.store?.putSyncState !== "function") {
      throw new Error("A fila offline de autoria não está disponível.");
    }
    const normalized = value ? normalizeWorkspaceAuthoringQueue(value, courseRef) : null;
    await this.store.putSyncState(workspaceAuthoringQueueKey(userId, trailItemId), normalized);
    return normalized;
  }

  #withWorkspaceAuthoringLock(courseRef, callback) {
    const userId = currentUserId(this.authClient);
    const trailItemId = text(courseRef?.trailItemId).trim().toLowerCase();
    if (!userId || !UUID_PATTERN.test(trailItemId)) {
      throw new Error("A fila offline de autoria não possui identidade válida.");
    }
    const key = workspaceAuthoringQueueKey(userId, trailItemId);
    const browserLocks = globalThis.navigator?.locks;
    if (typeof browserLocks?.request === "function") {
      return browserLocks.request(`aralearn:${key}`, { mode: "exclusive" }, callback);
    }
    if (typeof this.store?.transaction === "function") {
      return this.#withWorkspaceAuthoringTransactionalLock(key, callback);
    }
    const previous = workspaceAuthoringFallbackLocks.get(key) || Promise.resolve();
    const pending = previous.catch(() => undefined).then(callback);
    workspaceAuthoringFallbackLocks.set(key, pending);
    return pending.finally(() => {
      if (workspaceAuthoringFallbackLocks.get(key) === pending) {
        workspaceAuthoringFallbackLocks.delete(key);
      }
    });
  }

  async #withWorkspaceAuthoringTransactionalLock(queueKey, callback) {
    const lockKey = `${WORKSPACE_AUTHORING_LOCK_CONTRACT}:${queueKey}`;
    const ownerId = requestId();
    const writeLease = async ({ acquire = false } = {}) => this.store.transaction(
      ["syncState"],
      "readwrite",
      async (transaction) => {
        const row = await transaction.get("syncState", lockKey);
        const lease = row?.value;
        const now = Date.now();
        const owned = lease?.contract === WORKSPACE_AUTHORING_LOCK_CONTRACT &&
          lease.ownerId === ownerId;
        const available = !lease || lease.contract !== WORKSPACE_AUTHORING_LOCK_CONTRACT ||
          !Number.isFinite(Number(lease.expiresAt)) || Number(lease.expiresAt) <= now;
        if (!owned && (!acquire || !available)) return false;
        await transaction.put("syncState", {
          id: lockKey,
          key: lockKey,
          value: {
            contract: WORKSPACE_AUTHORING_LOCK_CONTRACT,
            ownerId,
            expiresAt: now + WORKSPACE_AUTHORING_LOCK_LEASE_MS
          },
          updatedAt: new Date(now).toISOString()
        });
        return true;
      }
    );
    const releaseLease = () => this.store.transaction(
      ["syncState"],
      "readwrite",
      async (transaction) => {
        const row = await transaction.get("syncState", lockKey);
        if (row?.value?.contract === WORKSPACE_AUTHORING_LOCK_CONTRACT &&
            row.value.ownerId === ownerId) {
          await transaction.delete("syncState", lockKey);
        }
      }
    );

    while (!await writeLease({ acquire: true })) {
      await new Promise((resolve) => globalThis.setTimeout(
        resolve,
        WORKSPACE_AUTHORING_LOCK_RETRY_MS
      ));
    }

    let heartbeat = Promise.resolve();
    let heartbeatError = null;
    const renew = () => {
      heartbeat = heartbeat
        .then(async () => {
          if (!await writeLease()) {
            throw new Error("A trava da fila offline expirou durante a autoria.");
          }
        })
        .catch((error) => {
          heartbeatError ||= error;
        });
    };
    const timer = globalThis.setInterval(renew, WORKSPACE_AUTHORING_LOCK_RENEW_MS);
    let result;
    let callbackError = null;
    try {
      result = await callback();
    } catch (error) {
      callbackError = error;
    } finally {
      globalThis.clearInterval(timer);
      await heartbeat;
      await releaseLease().catch((error) => {
        heartbeatError ||= error;
      });
    }
    if (callbackError) throw callbackError;
    if (heartbeatError) throw heartbeatError;
    return result;
  }

  async #queueWorkspaceAuthoringOperation({ courseRef, draftCourse, operation }) {
    return this.#withWorkspaceAuthoringLock(courseRef, async () => {
      const current = await this.readWorkspaceAuthoringQueue(courseRef);
      const normalizedOperation = normalizeWorkspaceAuthoringOperation(operation);
      const projectedDraftCourse = projectWorkspaceDraftCourse(
        current?.draftCourse || null,
        draftCourse,
        normalizedOperation
      );
      const operations = coalesceWorkspaceAuthoringOperations(
        current?.operations || [],
        normalizedOperation
      );
      if (operations.length > WORKSPACE_AUTHORING_QUEUE_LIMIT) {
        throw new Error("A fila offline de autoria atingiu o limite seguro.");
      }
      const nextQueue = {
        contract: WORKSPACE_AUTHORING_QUEUE_CONTRACT,
        trailItemId: courseRef.trailItemId,
        workspaceId: courseRef.workspaceId,
        courseKey: courseRef.courseKey,
        baseRevision: current?.baseRevision || courseRef.revision,
        status: "pending",
        errorMessage: "",
        operations,
        draftCourse: projectedDraftCourse,
        updatedAt: new Date().toISOString()
      };
      if (new TextEncoder().encode(JSON.stringify(nextQueue)).byteLength >
          WORKSPACE_AUTHORING_QUEUE_MAX_BYTES) {
        throw new Error(
          "O rascunho offline atingiu o limite seguro. Reconecte para sincronizar antes de continuar."
        );
      }
      const queued = await this.#writeWorkspaceAuthoringQueue(courseRef, nextQueue);
      if (globalThis.navigator?.onLine === false) {
        return {
          status: "pending",
          pending: true,
          revision: courseRef.revision,
          queue: queued
        };
      }
      return this.#syncWorkspaceAuthoringQueueUnlocked(courseRef);
    });
  }

  queueWorkspaceMetadata({
    courseRef,
    draftCourse,
    entityType,
    entityPath,
    baseMetadata,
    metadata
  } = {}) {
    const id = requestId();
    return this.#queueWorkspaceAuthoringOperation({
      courseRef,
      draftCourse,
      operation: {
        kind: "metadata",
        operationId: id,
        requestId: id,
        entityType,
        entityPath,
        baseMetadata,
        metadata,
        createdAt: new Date().toISOString(),
        attemptedAt: ""
      }
    });
  }

  queueWorkspaceCards({
    courseRef,
    draftCourse,
    microsequencePath,
    baseCards,
    cards
  } = {}) {
    const id = requestId();
    return this.#queueWorkspaceAuthoringOperation({
      courseRef,
      draftCourse,
      operation: {
        kind: "cards",
        operationId: id,
        requestId: id,
        microsequencePath,
        baseCards,
        cards,
        createdAt: new Date().toISOString(),
        attemptedAt: ""
      }
    });
  }

  async #syncWorkspaceAuthoringQueueUnlocked(courseRef) {
    let queue = await this.readWorkspaceAuthoringQueue(courseRef);
    if (!queue) return { status: "clean", pending: false };
    try {
      queue = { ...queue, status: "pending", errorMessage: "" };
      await this.#writeWorkspaceAuthoringQueue(courseRef, queue);
      while (queue.operations.length) {
        let operation = queue.operations[0];
        const response = await this.#loadWorkspaceCourseRemote({
          trailItemId: queue.trailItemId
        });
        const remoteCourse = courseFromWorkspaceParts(response, {
          courseKey: queue.courseKey
        });
        let changed = false;
        let result = { revision: response.revision };
        if (operation.kind === "metadata") {
          const reconciliation = reconcileWorkspaceMetadata(remoteCourse, operation);
          changed = reconciliation.changed;
          if (changed) {
            if (!operation.attemptedAt) {
              operation = { ...operation, attemptedAt: new Date().toISOString() };
              queue = {
                ...queue,
                operations: [operation, ...queue.operations.slice(1)],
                updatedAt: operation.attemptedAt
              };
              await this.#writeWorkspaceAuthoringQueue(courseRef, queue);
            }
            result = await this.catalog.executeApplicationAuthoringAction(
              "atualizarMetadadosDaEntidade",
              {
                requestId: operation.requestId,
                workspaceId: queue.workspaceId,
                expectedRevision: response.revision,
                entityType: operation.entityType,
                entityPath: operation.entityPath,
                ...reconciliation.metadata
              }
            );
          }
        } else {
          const reconciliation = reconcileWorkspaceCards(remoteCourse, operation);
          changed = reconciliation.changed;
          if (changed) {
            if (!operation.attemptedAt) {
              operation = { ...operation, attemptedAt: new Date().toISOString() };
              queue = {
                ...queue,
                operations: [operation, ...queue.operations.slice(1)],
                updatedAt: operation.attemptedAt
              };
              await this.#writeWorkspaceAuthoringQueue(courseRef, queue);
            }
            result = await this.catalog.executeApplicationAuthoringAction(
              "salvarCardsNaMicrossequencia",
              {
                requestId: operation.requestId,
                workspaceId: queue.workspaceId,
                expectedRevision: response.revision,
                microsequencePath: operation.microsequencePath,
                mode: "replace",
                cardsJson: JSON.stringify(reconciliation.cards)
              }
            );
          }
        }
        const revision = Number(result?.revision);
        if (!Number.isSafeInteger(revision) || revision < 1) {
          throw new Error("A autoria do workspace não devolveu uma revisão válida.");
        }
        queue = {
          ...queue,
          baseRevision: revision,
          operations: queue.operations.slice(1),
          updatedAt: new Date().toISOString()
        };
        await this.#writeWorkspaceAuthoringQueue(courseRef, queue);
      }
      const response = await this.#loadWorkspaceCourseRemote({ trailItemId: queue.trailItemId });
      const course = courseFromWorkspaceParts(response, { courseKey: queue.courseKey });
      await this.cacheWorkspaceCourse({ trailItemId: queue.trailItemId }, response, course);
      await this.#writeWorkspaceAuthoringQueue(courseRef, null);
      return {
        status: "materialized",
        pending: false,
        revision: response.revision,
        response,
        course
      };
    } catch (error) {
      const statusCode = Number(error?.status);
      const conflicted = error?.conflict === true ||
        (Number.isSafeInteger(statusCode) && statusCode >= 400 && statusCode < 500 &&
          ![408, 429].includes(statusCode)) ||
        ["course_authoring_forbidden", "workspace_forbidden"].includes(error?.code);
      queue = await this.#writeWorkspaceAuthoringQueue(courseRef, {
        ...queue,
        status: conflicted ? "conflict" : "pending",
        errorMessage: error instanceof Error ? error.message : "A sincronização foi adiada.",
        updatedAt: new Date().toISOString()
      });
      return {
        status: queue.status,
        pending: true,
        conflict: queue.status === "conflict",
        revision: queue.baseRevision,
        errorMessage: queue.errorMessage,
        queue
      };
    }
  }

  syncWorkspaceAuthoringQueue(courseRef) {
    return this.#withWorkspaceAuthoringLock(
      courseRef,
      () => this.#syncWorkspaceAuthoringQueueUnlocked(courseRef)
    );
  }

  resolveWorkspaceAuthoringConflict(courseRef, resolution) {
    return this.#withWorkspaceAuthoringLock(courseRef, async () => {
      const queue = await this.readWorkspaceAuthoringQueue(courseRef);
      if (!queue) return { status: "clean", pending: false };
      if (resolution === "discard_local") {
        if (globalThis.navigator?.onLine === false) {
          await this.#writeWorkspaceAuthoringQueue(courseRef, null);
          return { status: "discarded", pending: false, course: null, response: null };
        }
        const response = await this.#loadWorkspaceCourseRemote({
          trailItemId: queue.trailItemId
        });
        const course = courseFromWorkspaceParts(response, { courseKey: queue.courseKey });
        await this.cacheWorkspaceCourse({ trailItemId: queue.trailItemId }, response, course);
        await this.#writeWorkspaceAuthoringQueue(courseRef, null);
        return { status: "discarded", pending: false, revision: response.revision, response, course };
      }
      if (resolution !== "keep_local") {
        throw new TypeError("Escolha uma resolução válida para a edição offline.");
      }
      if (globalThis.navigator?.onLine === false) {
        throw new Error("Reconecte para comparar e manter a redação local.");
      }
      if (queue.status !== "conflict" || !queue.operations.length) {
        return this.#syncWorkspaceAuthoringQueueUnlocked(courseRef);
      }
      const response = await this.#loadWorkspaceCourseRemote({
        trailItemId: queue.trailItemId
      });
      const remoteCourse = courseFromWorkspaceParts(response, { courseKey: queue.courseKey });
      const operation = queue.operations[0];
      let rebasedOperation;
      if (operation.kind === "metadata") {
        const remoteEntity = findCourseEntity(
          remoteCourse,
          operation.entityType,
          operation.entityPath
        );
        if (!remoteEntity) throw authoringConflict("O texto editado não existe mais no workspace.");
        const remoteMetadata = metadataProjection(remoteEntity, operation.metadata);
        const metadata = Object.fromEntries(Object.keys(operation.metadata).map((field) => [
          field,
          sameCanonical(operation.metadata[field], operation.baseMetadata[field])
            ? structuredClone(remoteMetadata[field])
            : structuredClone(operation.metadata[field])
        ]));
        const rebasedId = requestId();
        rebasedOperation = {
          ...operation,
          operationId: rebasedId,
          requestId: rebasedId,
          attemptedAt: "",
          baseMetadata: remoteMetadata,
          metadata
        };
      } else {
        const remoteMicrosequence = findMicrosequence(remoteCourse, operation.microsequencePath);
        const remoteCards = remoteMicrosequence?.cards || [];
        if (!remoteMicrosequence) {
          throw authoringConflict("A microssequência editada não existe mais no workspace.");
        }
        const { cards } = rebaseWorkspaceTextCards(remoteCards, operation, {
          conflictPolicy: "local"
        });
        const rebasedId = requestId();
        rebasedOperation = {
          ...operation,
          operationId: rebasedId,
          requestId: rebasedId,
          attemptedAt: "",
          baseCards: structuredClone(remoteCards),
          cards
        };
      }
      await this.#writeWorkspaceAuthoringQueue(courseRef, {
        ...queue,
        baseRevision: Number(response.revision),
        status: "pending",
        errorMessage: "",
        operations: [rebasedOperation, ...queue.operations.slice(1)],
        updatedAt: new Date().toISOString()
      });
      return this.#syncWorkspaceAuthoringQueueUnlocked(courseRef);
    });
  }

  async syncAllWorkspaceAuthoringQueues() {
    const cached = await this.readCache();
    const referencesById = new Map((cached?.page?.items || [])
      .filter((item) => item?.workspaceId && item?.trailItemId)
      .map((item) => ({
        trailItemId: item.trailItemId,
        workspaceId: item.workspaceId,
        courseKey: item.courseKey,
        revision: item.revision
      }))
      .map((reference) => [reference.trailItemId, reference]));
    const userId = currentUserId(this.authClient);
    if (userId && typeof this.store?.getAll === "function") {
      try {
        const prefix = `${WORKSPACE_AUTHORING_QUEUE_PREFIX}:${userId}:`;
        const rows = await this.store.getAll("syncState");
        for (const row of rows) {
          if (!text(row?.key || row?.id).startsWith(prefix)) continue;
          try {
            const queue = normalizeWorkspaceAuthoringQueue(row?.value);
            referencesById.set(queue.trailItemId, {
              trailItemId: queue.trailItemId,
              workspaceId: queue.workspaceId,
              courseKey: queue.courseKey,
              revision: queue.baseRevision
            });
          } catch (error) {
            console.warn("Uma fila local de autoria inválida foi isolada.", error);
          }
        }
      } catch {
        // O cache da Home ainda permite tentar as filas conhecidas nesta sessão.
      }
    }
    return Promise.all([...referencesById.values()].map(async (courseRef) => {
      const queue = await this.readWorkspaceAuthoringQueue(courseRef);
      if (!queue) return null;
      if (queue.status === "conflict") {
        return {
          status: "conflict",
          pending: true,
          conflict: true,
          revision: queue.baseRevision,
          errorMessage: queue.errorMessage,
          queue
        };
      }
      return this.syncWorkspaceAuthoringQueue(courseRef);
    }));
  }

  async #workspaceCourseWithDraft(item, response) {
    const trailItemId = text(item?.trailItemId || item).trim().toLowerCase();
    if (!response || !UUID_PATTERN.test(trailItemId)) return response;
    const queue = await this.readWorkspaceAuthoringQueue({
      trailItemId,
      workspaceId: response.workspaceId || item?.workspaceId,
      courseKey: response.courseKey || item?.courseKey
    });
    return queue
      ? Object.freeze({
          ...response,
          draftCourse: structuredClone(queue.draftCourse),
          authoringQueue: Object.freeze({
            status: queue.status,
            pendingCount: queue.operations.length,
            errorMessage: queue.errorMessage
          })
        })
      : response;
  }

  async #workspaceCourseDraftOnly(item) {
    const queue = await this.readWorkspaceAuthoringQueue(item);
    if (!queue) return null;
    return Object.freeze({
      trailItemId: queue.trailItemId,
      workspaceId: queue.workspaceId,
      courseKey: queue.courseKey,
      revision: queue.baseRevision,
      parts: Object.freeze([]),
      draftCourse: structuredClone(queue.draftCourse),
      authoringQueue: Object.freeze({
        status: queue.status,
        pendingCount: queue.operations.length,
        errorMessage: queue.errorMessage
      })
    });
  }

  async loadWorkspaceCourse(item) {
    if (globalThis.navigator?.onLine === false) {
      const cached = await this.readWorkspaceCourseCache(item);
      if (cached) return this.#workspaceCourseWithDraft(item, cached);
      const draft = await this.#workspaceCourseDraftOnly(item);
      if (draft) return draft;
      throw new Error("A composição deste curso ainda não está disponível offline.");
    }
    try {
      return this.#workspaceCourseWithDraft(item, await this.#loadWorkspaceCourseRemote(item));
    } catch (error) {
      if (!retryableReadFailure(error)) throw error;
      const cached = await this.readWorkspaceCourseCache(item);
      if (cached) return this.#workspaceCourseWithDraft(item, cached);
      const draft = await this.#workspaceCourseDraftOnly(item);
      if (draft) return draft;
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

  async loadWorkspaceResume(workspaceId) {
    const normalizedWorkspaceId = text(workspaceId).trim().toLowerCase();
    if (!UUID_PATTERN.test(normalizedWorkspaceId)) throw new TypeError("Plano inválido.");
    const resume = await this.loadWorkspace(normalizedWorkspaceId, "resume");
    if (
      text(resume?.workspaceId).trim().toLowerCase() !== normalizedWorkspaceId ||
      resume?.view !== "resume" ||
      !resume?.content ||
      !Array.isArray(resume.content.parts) ||
      !resume.content.findings ||
      !Array.isArray(resume.content.findings.items)
    ) {
      throw new Error("O andamento do plano devolveu uma resposta inválida.");
    }
    return resume;
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
      normalizedCollections.sort(compareTrailTitles),
      CATALOG_READ_CONCURRENCY,
      async (collection) => {
        const courses = await loadCatalogActionItems(this.catalog, {
          operation: "list_collection_courses",
          label: "cursos da Coleção",
          collectionId: collection.collectionId
        });
        return Object.freeze({
          ...collection,
          courses: Object.freeze(courses.sort((left, right) => (
            TRAIL_TITLE_COLLATOR.compare(text(left?.title), text(right?.title)) ||
            text(left?.courseId).localeCompare(text(right?.courseId))
          )))
        });
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

  async moveCatalogCourse({ courseId, placementRevision, targetCollectionId } = {}) {
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
      targetCollectionId: normalizedCollectionId
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
    if (!UUID_PATTERN.test(text(workspaceId))) throw new TypeError("Plano inválido.");
    const items = [];
    const observationIds = new Set();
    const cursorKeys = new Set();
    let cursor = null;
    let summary = null;
    for (let pageIndex = 0; pageIndex < MAX_OBSERVATION_PAGES; pageIndex += 1) {
      const page = await this.catalog.executeApplicationAuthoringAction(
        "gerirWorkspaceEducacional",
        {
          operation: "list_observations",
          workspaceId,
          limit: OBSERVATION_PAGE_LIMIT,
          kinds: ["note"],
          ...(cursor || {})
        }
      );
      if (text(page?.workspaceId).toLowerCase() !== workspaceId.toLowerCase()) {
        throw new Error("As observações devolveram um workspace diferente.");
      }
      if (!Array.isArray(page?.items)) {
        throw new Error("As observações devolveram uma página inválida.");
      }
      summary ??= page.summary || null;
      for (const item of page.items) {
        const observationId = text(item?.observationId).trim().toLowerCase();
        if (!UUID_PATTERN.test(observationId) || observationIds.has(observationId)) {
          throw new Error("As observações devolveram itens repetidos ou sem identidade.");
        }
        observationIds.add(observationId);
        if (item?.kind !== "note") {
          throw new Error("As observações devolveram um item fora do filtro solicitado.");
        }
        items.push(item);
      }
      if (page?.hasMore !== true) {
        if (page?.nextCursor != null) {
          throw new Error("As observações devolveram cursor após a última página.");
        }
        return Object.freeze({
          workspaceId,
          items: Object.freeze(items),
          hasMore: false,
          nextCursor: null,
          summary
        });
      }
      const beforeUpdatedAt = text(page?.nextCursor?.beforeUpdatedAt).trim();
      const beforeId = text(page?.nextCursor?.beforeId).trim().toLowerCase();
      const cursorKeyValue = `${beforeUpdatedAt}\u0000${beforeId}`;
      if (!beforeUpdatedAt || !Number.isFinite(Date.parse(beforeUpdatedAt)) ||
          !UUID_PATTERN.test(beforeId) || cursorKeys.has(cursorKeyValue)) {
        throw new Error("A paginação das observações devolveu um cursor inválido.");
      }
      cursorKeys.add(cursorKeyValue);
      cursor = { beforeUpdatedAt, beforeId };
    }
    throw new Error("A paginação das observações excedeu o limite seguro.");
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
