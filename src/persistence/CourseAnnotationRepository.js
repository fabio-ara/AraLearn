import { createUuid, UUID_PATTERN } from "../domain/identifiers.js";
import {
  normalizeCourseAnchoredAnnotationChange,
  normalizeCourseAnchoredAnnotationCommand,
  normalizeCourseAnchoredAnnotationPage,
  normalizeCourseAnchoredAnnotationQuery,
  normalizeCourseAnchoredAnnotationReadOptions
} from "../domain/courseAnchoredAnnotations.js";

export const COURSE_ANNOTATION_CACHE_CONTRACT =
  "aralearn.course-anchored-annotation-cache.v1";
export const COURSE_ANNOTATION_OUTBOX_CONTRACT =
  "aralearn.course-anchored-annotation-outbox.v1";

const MAX_OUTBOX_COMMANDS = 128;
const MAX_OUTBOX_BYTES = 256 * 1024;
const MAX_CACHE_BYTES = 2 * 1024 * 1024;
const MAX_CACHED_TARGETS = 48;
const MAX_ANNOTATIONS_PER_TARGET = 128;
const TARGET_PAGE_SIZE = 24;
const MAX_PAGES_PER_TARGET = 128;
const CHANNEL_NAME = "aralearn.course-anchored-annotations.v1";
const encoder = new TextEncoder();

function clone(value) {
  return value == null ? value : structuredClone(value);
}

function plainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function nowIso(clock) {
  const value = clock();
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new TypeError("Relógio local inválido.");
  return date.toISOString();
}

function courseId(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!UUID_PATTERN.test(normalized)) throw new TypeError("Curso inválido para observações.");
  return normalized;
}

function revision(value, label, { minimum = 0 } = {}) {
  const normalized = Number(value);
  if (!Number.isSafeInteger(normalized) || normalized < minimum) {
    throw new TypeError(`${label} inválida.`);
  }
  return normalized;
}

function targetId(reference) {
  const value = Array.isArray(reference)
    ? reference[4]
    : Array.isArray(reference?.entityPath)
      ? reference.entityPath[4]
      : reference?.studyUnitId;
  if (typeof value !== "string" || !value || value !== value.trim() ||
      [...value].length > 240 || encoder.encode(value).byteLength > 960) {
    throw new TypeError("Unidade de estudo inválida para observações.");
  }
  return value;
}

function networkFailure(error) {
  const statusValue = error?.status ?? error?.response?.status;
  const status = statusValue == null ? null : Number(statusValue);
  const code = String(error?.code || "").toUpperCase();
  return status === 0 || status === 408 || status === 429 || status >= 500 ||
    new Set(["REQUEST_TIMEOUT", "NETWORK_ERROR", "FETCH_FAILED", "ETIMEDOUT",
      "ECONNRESET", "ECONNREFUSED", "ENETUNREACH", "EAI_AGAIN"]).has(code) ||
    error?.name === "AbortError" ||
    (error?.name === "TypeError" && /fetch|network|load failed/iu.test(String(error.message || "")));
}

function authorityFailure(error) {
  const status = Number(error?.status || error?.response?.status || 0);
  const code = String(error?.code || "").toUpperCase();
  return error?.authRequired === true || status === 401 || status === 403 ||
    code === "42501" || code === "PT404" || code === "AUTH_REQUIRED" ||
    code === "COURSE_ACCESS_REVOKED";
}

function conflictFailure(error) {
  const status = Number(error?.status || error?.response?.status || 0);
  const code = String(error?.code || error?.response?.code || "").toUpperCase();
  return status === 409 || code === "40001" ||
    code === "COURSE_REVISION_CHANGED" || code === "ANNOTATION_VERSION_CHANGED";
}

function cacheKey(value) {
  return `${COURSE_ANNOTATION_CACHE_CONTRACT}:${courseId(value)}`;
}

function outboxKey(value) {
  return `${COURSE_ANNOTATION_OUTBOX_CONTRACT}:${courseId(value)}`;
}

function emptyCache(id, currentRevision, updatedAt) {
  return {
    contract: COURSE_ANNOTATION_CACHE_CONTRACT,
    courseId: id,
    courseRevision: currentRevision,
    annotationSetVersion: 0,
    targetPages: {},
    changes: [],
    updatedAt
  };
}

function emptyOutbox(id, updatedAt) {
  return {
    contract: COURSE_ANNOTATION_OUTBOX_CONTRACT,
    courseId: id,
    commands: [],
    updatedAt
  };
}

function normalizeCache(value, id, currentRevision, updatedAt) {
  if (value == null) return emptyCache(id, currentRevision, updatedAt);
  if (!plainObject(value) || value.contract !== COURSE_ANNOTATION_CACHE_CONTRACT ||
      value.courseId !== id || !plainObject(value.targetPages) || !Array.isArray(value.changes)) {
    throw new TypeError("Cache de observações inválido.");
  }
  const cacheRevision = revision(value.courseRevision, "Revisão do cache", { minimum: 1 });
  if (cacheRevision !== currentRevision) {
    throw new TypeError("O cache de observações pertence a outra revisão do Curso.");
  }
  const cacheSetVersion = revision(value.annotationSetVersion, "Versão das observações");
  const targetEntries = Object.entries(value.targetPages);
  if (targetEntries.length > MAX_CACHED_TARGETS) {
    throw new TypeError("Cache de alvos de observações inválido.");
  }
  const targetPages = {};
  for (const [target, pages] of targetEntries) {
    targetId({ studyUnitId: target });
    if (!Array.isArray(pages) || pages.length > MAX_PAGES_PER_TARGET) {
      throw new TypeError("Cache de páginas de observações inválido.");
    }
    const normalizedPages = pages.map(normalizeCourseAnchoredAnnotationPage);
    const expectedQuery = targetQuery(target);
    const annotationIds = new Set();
    let itemCount = 0;
    let targetSetVersion = null;
    for (const page of normalizedPages) {
      if (page.courseId !== id || page.courseRevision !== cacheRevision ||
          page.annotationSetVersion > cacheSetVersion ||
          targetSetVersion !== null && page.annotationSetVersion !== targetSetVersion ||
          JSON.stringify(page.query) !== JSON.stringify(expectedQuery)) {
        throw new TypeError("Uma página em cache não corresponde ao Curso, revisão ou alvo.");
      }
      targetSetVersion = page.annotationSetVersion;
      itemCount += page.items.length;
      for (const item of page.items) {
        if (item.courseId !== id || item.target.kind !== "study_unit" ||
            item.target.id !== target || annotationIds.has(item.annotationId)) {
          throw new TypeError("Uma observação em cache não corresponde ao alvo armazenado.");
        }
        annotationIds.add(item.annotationId);
      }
    }
    if (itemCount > MAX_ANNOTATIONS_PER_TARGET) {
      throw new TypeError("O cache excede o limite de observações por alvo.");
    }
    targetPages[target] = normalizedPages;
  }
  if (value.changes.length > MAX_OUTBOX_COMMANDS) {
    throw new TypeError("Cache de mudanças de observações inválido.");
  }
  const changes = value.changes.map(normalizeCourseAnchoredAnnotationChange);
  for (const change of changes) {
    if (change.courseId !== id || change.courseRevision !== cacheRevision ||
        change.annotationSetVersion > cacheSetVersion || change.annotation && (
          change.annotation.courseId !== id || change.annotation.target.kind !== "study_unit" ||
          !targetId({ studyUnitId: change.annotation.target.id })
        )) {
      throw new TypeError("Uma mudança em cache não corresponde ao Curso ou revisão.");
    }
  }
  const normalized = {
    contract: COURSE_ANNOTATION_CACHE_CONTRACT,
    courseId: id,
    courseRevision: cacheRevision,
    annotationSetVersion: cacheSetVersion,
    targetPages,
    changes,
    updatedAt: String(value.updatedAt || updatedAt)
  };
  if (encoder.encode(JSON.stringify(normalized)).byteLength > MAX_CACHE_BYTES) {
    throw new TypeError("O cache de observações excede o limite seguro.");
  }
  return normalized;
}

function normalizeOutbox(value, id, updatedAt) {
  if (value == null) return emptyOutbox(id, updatedAt);
  if (!plainObject(value) || value.contract !== COURSE_ANNOTATION_OUTBOX_CONTRACT ||
      value.courseId !== id || !Array.isArray(value.commands)) {
    throw new TypeError("Outbox de observações inválida.");
  }
  const commands = value.commands.map((entry) => {
    if (!plainObject(entry) || !UUID_PATTERN.test(String(entry.requestId || "")) ||
        !UUID_PATTERN.test(String(entry.annotationId || "")) ||
        !["pending", "failed"].includes(entry.status) || typeof entry.attempted !== "boolean") {
      throw new TypeError("Comando pendente de observação inválido.");
    }
    const targetStudyUnitId = targetId({ studyUnitId: entry.targetStudyUnitId });
    const expectedCourseRevision = entry.expectedCourseRevision == null
      ? null
      : revision(entry.expectedCourseRevision, "Revisão esperada do comando", { minimum: 1 });
    const command = normalizeCourseAnchoredAnnotationCommand(entry.command);
    const create = command.type === "create_anchored_annotation";
    if (!new Set([
      "create_anchored_annotation", "revise_anchored_annotation", "withdraw_anchored_annotation"
    ]).has(command.type) || entry.annotationId !== command.annotationId ||
        create && (command.target.kind !== "study_unit" || command.target.id !== targetStudyUnitId ||
          expectedCourseRevision === null) ||
        !create && expectedCourseRevision !== null) {
      throw new TypeError("Comando pendente não corresponde ao envelope da observação.");
    }
    return {
      requestId: entry.requestId,
      annotationId: entry.annotationId,
      targetStudyUnitId,
      expectedCourseRevision,
      command,
      status: entry.status,
      attempted: entry.attempted,
      createdAt: String(entry.createdAt || ""),
      lastError: entry.lastError == null ? null : {
        code: String(entry.lastError.code || "annotation_write_failed"),
        message: String(entry.lastError.message || "Não foi possível sincronizar a observação.")
      }
    };
  });
  if (new Set(commands.map(({ requestId }) => requestId)).size !== commands.length) {
    throw new TypeError("A outbox repete uma identidade de requisição.");
  }
  const outbox = {
    contract: COURSE_ANNOTATION_OUTBOX_CONTRACT,
    courseId: id,
    commands,
    updatedAt: String(value.updatedAt || updatedAt)
  };
  assertOutboxBudget(outbox);
  return outbox;
}

function assertOutboxBudget(value) {
  if (value.commands.length > MAX_OUTBOX_COMMANDS ||
      encoder.encode(JSON.stringify(value)).byteLength > MAX_OUTBOX_BYTES) {
    const error = new Error("A fila offline de observações atingiu o limite seguro.");
    error.code = "course_annotation_outbox_full";
    throw error;
  }
}

function targetQuery(id) {
  return normalizeCourseAnchoredAnnotationQuery({
    mode: "target",
    origins: [],
    channels: [],
    states: [],
    categories: [],
    includeUncategorized: true,
    subjectIds: [],
    hierarchy: {
      target: { kind: "study_unit", id: targetId({ studyUnitId: id }) },
      includeDescendants: false
    },
    annotationId: null
  });
}

function itemTargetId(item) {
  return item?.target?.kind === "study_unit" ? item.target.id : "";
}

function pageItems(cache, targetStudyUnitId) {
  const items = new Map();
  for (const page of cache.targetPages[targetStudyUnitId] || []) {
    for (const item of page.items) items.set(item.annotationId, clone(item));
  }
  for (const change of cache.changes) {
    const item = change.annotation;
    if (!item) continue;
    if (itemTargetId(item) === targetStudyUnitId) items.set(item.annotationId, clone(item));
  }
  return items;
}

function optimisticCreate(entry) {
  const command = entry.command;
  return {
    contract: "aralearn.course-anchored-annotation.v1",
    annotationId: entry.annotationId,
    annotationVersion: 0,
    courseId: null,
    provenance: { origin: "learner", channel: "study_interface" },
    contributor: { kind: "self", role: "learner", ref: "self", label: "Você" },
    target: {
      kind: "study_unit",
      id: entry.targetStudyUnitId,
      observedPath: [],
      currentAvailable: true,
      currentPath: [],
      deepLink: null
    },
    observedRevision: {
      certainty: "known",
      courseRevision: entry.expectedCourseRevision,
      targetVersion: null
    },
    rawText: command.rawText,
    category: command.category,
    briefSummary: command.briefSummary,
    subjectClassification: null,
    state: "open",
    ownerResponse: null,
    timestamps: {
      capturedAt: command.capturedAt,
      createdAt: entry.createdAt,
      updatedAt: entry.createdAt,
      firstConsideredAt: null,
      respondedAt: null,
      resolvedAt: null,
      withdrawnAt: null
    },
    capabilities: { canRevise: true, canWithdraw: true },
    deepLink: null,
    localOnly: true
  };
}

function optimisticWithdraw(item, entry) {
  return {
    ...item,
    annotationVersion: entry.command.expectedAnnotationVersion + 1,
    rawText: null,
    briefSummary: null,
    state: "withdrawn",
    ownerResponse: null,
    timestamps: {
      ...item.timestamps,
      updatedAt: entry.createdAt,
      withdrawnAt: entry.createdAt
    },
    capabilities: {
      ...item.capabilities,
      canRevise: false,
      canWithdraw: false
    }
  };
}

function redactCachedAnnotation(cache, entry) {
  const redact = (item) => item?.annotationId === entry.annotationId
    ? optimisticWithdraw(item, entry)
    : item;
  for (const [target, pages] of Object.entries(cache.targetPages)) {
    cache.targetPages[target] = pages.map((page) => ({
      ...page,
      items: page.items.map(redact)
    }));
  }
  cache.changes = cache.changes.map((change) => change.annotation?.annotationId === entry.annotationId
    ? { ...change, annotation: redact(change.annotation) }
    : change);
  return cache;
}

function invalidateCachedAnnotations(cache, annotationIds) {
  const ids = new Set(annotationIds);
  const targetPages = {};
  for (const [target, pages] of Object.entries(cache.targetPages)) {
    targetPages[target] = pages.map((page) => ({
      ...page,
      items: page.items.filter(({ annotationId }) => !ids.has(annotationId))
    }));
  }
  return {
    ...cache,
    targetPages,
    changes: cache.changes.filter(({ annotation }) => !ids.has(annotation?.annotationId))
  };
}

function applyOptimisticCommand(items, entry) {
  const command = entry.command;
  let item = items.get(entry.annotationId);
  if (command.type === "create_anchored_annotation") {
    item = optimisticCreate(entry);
  } else if (!item) {
    return;
  } else if (command.type === "revise_anchored_annotation") {
    item = {
      ...item,
      annotationVersion: command.expectedAnnotationVersion + 1,
      rawText: command.rawText,
      category: command.category,
      briefSummary: command.briefSummary,
      state: "open",
      ownerResponse: null,
      timestamps: {
        ...item.timestamps,
        updatedAt: entry.createdAt,
        respondedAt: null,
        resolvedAt: null
      }
    };
  } else if (command.type === "withdraw_anchored_annotation") {
    item = optimisticWithdraw(item, entry);
  }
  if (!item) return;
  items.set(entry.annotationId, {
    ...item,
    syncStatus: entry.status === "failed" ? "failed" : "pending",
    syncError: entry.lastError?.message || ""
  });
}

function presentationItems(cache, outbox, targetStudyUnitId) {
  const items = pageItems(cache, targetStudyUnitId);
  for (const [id, item] of items) items.set(id, { ...item, syncStatus: "synced", syncError: "" });
  for (const entry of outbox.commands) {
    if (entry.targetStudyUnitId !== targetStudyUnitId) continue;
    if (entry.status === "pending") {
      applyOptimisticCommand(items, entry);
      continue;
    }
    const authoritative = items.get(entry.annotationId);
    if (authoritative) {
      items.set(entry.annotationId, {
        ...authoritative,
        syncStatus: "failed",
        syncError: entry.lastError?.message || "Não foi possível sincronizar a observação."
      });
    } else if (entry.command.type === "create_anchored_annotation") {
      items.set(entry.annotationId, {
        ...optimisticCreate(entry),
        syncStatus: "failed",
        syncError: entry.lastError?.message || "Não foi possível criar a observação.",
        failedDraft: true,
        capabilities: { canRevise: false, canWithdraw: false }
      });
    }
  }
  return [...items.values()].sort((left, right) =>
    String(right.timestamps?.updatedAt || "").localeCompare(String(left.timestamps?.updatedAt || "")));
}

export class CourseAnnotationRepository {
  #queue = Promise.resolve();
  #listeners = new Set();
  #channel = null;
  #initialized = false;
  #signalReload = Promise.resolve();

  constructor({
    courseId: id,
    courseRevision,
    api,
    cache,
    clock = () => new Date(),
    uuidFactory = createUuid,
    windowValue = globalThis.window || globalThis,
    navigatorValue = globalThis.navigator || null
  } = {}) {
    this.courseId = courseId(id);
    this.courseRevision = revision(courseRevision, "Revisão do Curso", { minimum: 1 });
    if (!api || typeof api.getMyCourseAnchoredAnnotations !== "function" ||
        typeof api.executeMyCourseAnchoredAnnotationCommand !== "function") {
      throw new TypeError("API de observações do Estudo obrigatória.");
    }
    if (!cache || typeof cache.getCache !== "function" || typeof cache.putCache !== "function" ||
        typeof cache.updateCache !== "function" || typeof cache.updateCaches !== "function" ||
        typeof cache.deleteCachePrefix !== "function") {
      throw new TypeError("Cache de observações obrigatório.");
    }
    this.api = api;
    this.cache = cache;
    this.clock = clock;
    this.uuidFactory = uuidFactory;
    this.navigatorValue = navigatorValue;
    this.BroadcastChannelValue = windowValue?.BroadcastChannel;
    this.scope = String(cache.name || "course-cache");
    this.ephemeralTargetPages = new Map();
  }

  setCourseRevision(value) {
    const normalized = revision(value, "Revisão do Curso", { minimum: 1 });
    if (normalized <= this.courseRevision) return;
    this.courseRevision = normalized;
    this.ephemeralTargetPages.clear();
    if (this.#initialized) {
      this.localCache = emptyCache(this.courseId, normalized, nowIso(this.clock));
      void this.cache.deleteCachePrefix(cacheKey(this.courseId)).catch(() => undefined);
    }
  }

  async initialize() {
    if (this.#initialized) return this.snapshot();
    await this.#readLocal();
    if (typeof this.BroadcastChannelValue === "function") {
      try {
        this.#channel = new this.BroadcastChannelValue(CHANNEL_NAME);
        this.#channel.addEventListener?.("message", (event) => this.#onSignal(event));
      } catch {
        this.#channel = null;
      }
    }
    this.#initialized = true;
    await this.flush();
    return this.snapshot();
  }

  async #readLocal() {
    const timestamp = nowIso(this.clock);
    try {
      this.localCache = normalizeCache(
        await this.cache.getCache(cacheKey(this.courseId)),
        this.courseId,
        this.courseRevision,
        timestamp
      );
    } catch {
      await this.cache.putCache(cacheKey(this.courseId), null);
      this.localCache = emptyCache(this.courseId, this.courseRevision, timestamp);
      this.ephemeralTargetPages.clear();
    }
    try {
      this.outbox = normalizeOutbox(
        await this.cache.getCache(outboxKey(this.courseId)),
        this.courseId,
        timestamp
      );
    } catch {
      await this.cache.putCache(outboxKey(this.courseId), null);
      this.outbox = emptyOutbox(this.courseId, timestamp);
    }
    return true;
  }

  #assertInitialized() {
    if (!this.#initialized) throw new Error("Inicialize as observações antes de usá-las.");
  }

  snapshot() {
    this.#assertInitialized();
    return clone({
      courseId: this.courseId,
      courseRevision: this.courseRevision,
      annotationSetVersion: this.localCache.annotationSetVersion,
      pendingCount: this.outbox.commands.filter(({ status }) => status === "pending").length,
      failedCount: this.outbox.commands.filter(({ status }) => status === "failed").length
    });
  }

  loadForTarget(reference) {
    this.#assertInitialized();
    const id = targetId(reference);
    const ephemeralPages = this.ephemeralTargetPages.get(id);
    const cache = ephemeralPages && !Object.hasOwn(this.localCache.targetPages, id)
      ? {
          ...this.localCache,
          targetPages: { ...this.localCache.targetPages, [id]: ephemeralPages }
        }
      : this.localCache;
    return clone(presentationItems(cache, this.outbox, id));
  }

  countForTarget(reference) {
    return this.loadForTarget(reference).filter(({ state }) => state !== "withdrawn").length;
  }

  subscribe(listener) {
    if (typeof listener !== "function") throw new TypeError("Listener de observações inválido.");
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  #notify(value) {
    for (const listener of this.#listeners) listener(clone(value));
  }

  #onSignal(event) {
    const value = event?.data;
    if (!plainObject(value) || Object.keys(value).length !== 3 ||
        value.courseId !== this.courseId || !Number.isSafeInteger(value.annotationSetVersion) ||
        value.annotationSetVersion < 0 || !Array.isArray(value.annotationIds) ||
        value.annotationIds.length > MAX_OUTBOX_COMMANDS ||
        value.annotationIds.some((id) => !UUID_PATTERN.test(String(id)))) {
      return;
    }
    this.ephemeralTargetPages.clear();
    this.localCache = invalidateCachedAnnotations(this.localCache, value.annotationIds);
    const invalidatedIds = new Set(value.annotationIds);
    this.outbox = {
      ...this.outbox,
      commands: this.outbox.commands.filter(({ annotationId }) => !invalidatedIds.has(annotationId))
    };
    const reload = async () => {
      try {
        await this.#readLocal();
      } catch {
        this.ephemeralTargetPages.clear();
      } finally {
        this.#notify({ ...value, stale: true });
      }
    };
    this.#signalReload = this.#signalReload.then(reload, reload);
  }

  async #broadcast(annotationIds) {
    const ids = [...new Set(annotationIds)].slice(0, MAX_OUTBOX_COMMANDS);
    const message = {
      courseId: this.courseId,
      annotationSetVersion: this.localCache.annotationSetVersion,
      annotationIds: ids
    };
    this.#channel?.postMessage?.(message);
    this.#notify({ ...message, stale: false });
  }

  async #updateCache(updater) {
    const key = cacheKey(this.courseId);
    const timestamp = nowIso(this.clock);
    const apply = (current) => {
      let normalized;
      try {
        normalized = normalizeCache(current, this.courseId, this.courseRevision, timestamp);
      } catch {
        normalized = emptyCache(this.courseId, this.courseRevision, timestamp);
      }
      const next = updater(normalized) || normalized;
      const bytes = encoder.encode(JSON.stringify(next)).byteLength;
      if (bytes > MAX_CACHE_BYTES) {
        const targets = Object.keys(next.targetPages);
        while (targets.length && encoder.encode(JSON.stringify(next)).byteLength > MAX_CACHE_BYTES) {
          delete next.targetPages[targets.shift()];
        }
        while (next.changes.length &&
            encoder.encode(JSON.stringify(next)).byteLength > MAX_CACHE_BYTES) {
          next.changes.shift();
        }
        if (encoder.encode(JSON.stringify(next)).byteLength > MAX_CACHE_BYTES) {
          throw new TypeError("O cache de observações excede o limite seguro.");
        }
      }
      return next;
    };
    const next = await this.cache.updateCache(key, apply);
    this.localCache = normalizeCache(next, this.courseId, this.courseRevision, timestamp);
    return this.localCache;
  }

  async #updateOutbox(updater) {
    const key = outboxKey(this.courseId);
    const timestamp = nowIso(this.clock);
    const apply = (current) => {
      const normalized = normalizeOutbox(current, this.courseId, timestamp);
      const next = updater(normalized) || normalized;
      next.updatedAt = timestamp;
      assertOutboxBudget(next);
      return next;
    };
    const next = await this.cache.updateCache(key, apply);
    this.outbox = normalizeOutbox(next, this.courseId, timestamp);
    return this.outbox;
  }

  async #readPages(query) {
    const pages = [];
    let cursor = null;
    let annotationSetVersion = null;
    let itemCount = 0;
    const seenCursors = new Set();
    const seenAnnotationIds = new Set();
    for (let index = 0; index < MAX_PAGES_PER_TARGET; index += 1) {
      const options = normalizeCourseAnchoredAnnotationReadOptions({
        expectedCourseRevision: this.courseRevision,
        annotationSetVersion,
        query,
        cursor,
        limit: TARGET_PAGE_SIZE
      });
      const page = normalizeCourseAnchoredAnnotationPage(
        await this.api.getMyCourseAnchoredAnnotations(this.courseId, options)
      );
      if (page.courseId !== this.courseId || page.courseRevision !== this.courseRevision ||
          annotationSetVersion !== null && page.annotationSetVersion !== annotationSetVersion) {
        const error = new Error("As observações mudaram durante a leitura.");
        error.status = 409;
        error.code = "annotation_set_changed";
        throw error;
      }
      pages.push(page);
      itemCount += page.items.length;
      if (page.items.some(({ annotationId }) => {
        if (seenAnnotationIds.has(annotationId)) return true;
        seenAnnotationIds.add(annotationId);
        return false;
      }) || page.hasMore && page.items.length === 0 ||
          page.hasMore && seenCursors.has(page.nextCursor)) {
        throw new Error("A paginação de observações não avançou de forma válida.");
      }
      if (itemCount > MAX_ANNOTATIONS_PER_TARGET ||
          page.hasMore && itemCount >= MAX_ANNOTATIONS_PER_TARGET) {
        throw new Error("O alvo excedeu o limite de 128 observações suportado no dispositivo.");
      }
      annotationSetVersion = page.annotationSetVersion;
      if (!page.hasMore) return pages;
      seenCursors.add(page.nextCursor);
      cursor = page.nextCursor;
    }
    throw new Error("A leitura do alvo excedeu o limite seguro de observações.");
  }

  async refreshTarget(reference, { fallbackToCache = true } = {}) {
    this.#assertInitialized();
    const id = targetId(reference);
    await this.#readLocal();
    try {
      const pages = await this.#readPages(targetQuery(id));
      await this.#updateCache((cache) => {
        cache.courseRevision = this.courseRevision;
        cache.annotationSetVersion = pages[0]?.annotationSetVersion ?? cache.annotationSetVersion;
        cache.targetPages[id] = pages;
        cache.changes = cache.changes.filter(({ annotation }) => itemTargetId(annotation) !== id);
        const targetKeys = Object.keys(cache.targetPages);
        while (targetKeys.length > MAX_CACHED_TARGETS) delete cache.targetPages[targetKeys.shift()];
        cache.updatedAt = nowIso(this.clock);
        return cache;
      });
      this.ephemeralTargetPages.clear();
      if (!Object.hasOwn(this.localCache.targetPages, id)) {
        this.ephemeralTargetPages.set(id, pages);
      }
      return this.loadForTarget({ studyUnitId: id });
    } catch (error) {
      if (authorityFailure(error)) await this.clearLocal();
      if (authorityFailure(error) || !networkFailure(error) || !fallbackToCache) throw error;
      if (!Object.hasOwn(this.localCache.targetPages, id) &&
          !this.ephemeralTargetPages.has(id)) {
        const miss = new Error("As observações deste contexto não estão disponíveis offline.");
        miss.code = "course_annotation_cache_miss";
        miss.cause = error;
        throw miss;
      }
      return this.loadForTarget({ studyUnitId: id });
    }
  }

  async #enqueueCommand(targetStudyUnitId, command, { requestId = this.uuidFactory() } = {}) {
    const normalized = normalizeCourseAnchoredAnnotationCommand(command);
    const entry = {
      requestId,
      annotationId: normalized.annotationId,
      targetStudyUnitId,
      expectedCourseRevision: new Set([
        "create_anchored_annotation", "correct_anchored_annotation_subjects"
      ]).has(normalized.type) ? this.courseRevision : null,
      command: normalized,
      status: "pending",
      attempted: false,
      createdAt: nowIso(this.clock),
      lastError: null
    };
    if (normalized.type === "withdraw_anchored_annotation") {
      const contentKey = cacheKey(this.courseId);
      const pendingKey = outboxKey(this.courseId);
      const timestamp = nowIso(this.clock);
      const next = await this.cache.updateCaches([contentKey, pendingKey], (records) => {
        const cache = redactCachedAnnotation(normalizeCache(
          records[contentKey], this.courseId, this.courseRevision, timestamp
        ), entry);
        const outbox = normalizeOutbox(records[pendingKey], this.courseId, timestamp);
        outbox.commands = outbox.commands.filter((candidate) =>
          candidate.annotationId !== entry.annotationId || candidate.status !== "failed");
        if (!outbox.commands.some((candidate) => candidate.requestId === entry.requestId)) {
          outbox.commands.push(clone(entry));
        }
        cache.updatedAt = timestamp;
        outbox.updatedAt = timestamp;
        assertOutboxBudget(outbox);
        return { [contentKey]: cache, [pendingKey]: outbox };
      });
      this.localCache = normalizeCache(
        next[contentKey], this.courseId, this.courseRevision, timestamp
      );
      this.outbox = normalizeOutbox(next[pendingKey], this.courseId, timestamp);
      const ephemeralPages = this.ephemeralTargetPages.get(entry.targetStudyUnitId);
      if (ephemeralPages) {
        const ephemeral = redactCachedAnnotation({
          targetPages: { [entry.targetStudyUnitId]: ephemeralPages },
          changes: []
        }, entry);
        this.ephemeralTargetPages.set(
          entry.targetStudyUnitId,
          ephemeral.targetPages[entry.targetStudyUnitId]
        );
      }
    } else {
      await this.#updateOutbox((outbox) => {
        outbox.commands = outbox.commands.filter((candidate) =>
          candidate.annotationId !== entry.annotationId || candidate.status !== "failed");
        if (!outbox.commands.some((candidate) => candidate.requestId === entry.requestId)) {
          outbox.commands.push(clone(entry));
        }
        return outbox;
      });
    }
    await this.#broadcast([entry.annotationId]);
    await this.flush();
    return entry;
  }

  async createForTarget(reference, { rawText, category = null, briefSummary = null, capturedAt = null } = {}) {
    this.#assertInitialized();
    const id = targetId(reference);
    const annotationId = this.uuidFactory();
    await this.#enqueueCommand(id, {
      type: "create_anchored_annotation",
      annotationId,
      target: { kind: "study_unit", id },
      rawText,
      category,
      capturedAt: capturedAt || nowIso(this.clock),
      briefSummary
    });
    return this.loadForTarget(reference).find((item) => item.annotationId === annotationId);
  }

  async revise(annotationId, { rawText, category = null, briefSummary = null } = {}) {
    this.#assertInitialized();
    const item = this.#findItem(annotationId);
    if (!item || item.capabilities?.canRevise === false) {
      throw new Error("Esta observação não pode ser editada.");
    }
    const expectedAnnotationVersion = Math.max(1, Number(item.annotationVersion || 0));
    await this.#enqueueCommand(item.target.id, {
      type: "revise_anchored_annotation",
      annotationId,
      expectedAnnotationVersion,
      rawText,
      category,
      briefSummary
    });
    return this.#findItem(annotationId);
  }

  async withdraw(annotationId) {
    this.#assertInitialized();
    const item = this.#findItem(annotationId);
    if (!item || item.capabilities?.canWithdraw === false) {
      throw new Error("Esta observação não pode ser retirada.");
    }
    await this.#enqueueCommand(item.target.id, {
      type: "withdraw_anchored_annotation",
      annotationId,
      expectedAnnotationVersion: Math.max(1, Number(item.annotationVersion || 0))
    });
    return this.#findItem(annotationId);
  }

  async discardFailed(annotationId) {
    this.#assertInitialized();
    const failed = this.outbox.commands.filter((entry) =>
      entry.annotationId === annotationId && entry.status === "failed");
    if (!failed.length) return false;
    const targetStudyUnitId = failed.at(-1).targetStudyUnitId;
    await this.#updateOutbox((outbox) => {
      outbox.commands = outbox.commands.filter((entry) =>
        entry.annotationId !== annotationId || entry.status !== "failed");
      return outbox;
    });
    await this.#broadcast([annotationId]);
    try {
      await this.refreshTarget(
        { studyUnitId: targetStudyUnitId },
        { fallbackToCache: false }
      );
    } catch (error) {
      if (!networkFailure(error)) throw error;
      const offlineError = new Error(
        "A alteração com falha foi descartada, mas não foi possível atualizar a observação agora."
      );
      offlineError.code = "annotation_rebase_offline";
      offlineError.cause = error;
      throw offlineError;
    }
    return true;
  }

  #findItem(annotationId) {
    for (const target of new Set([
      ...Object.keys(this.localCache.targetPages),
      ...this.ephemeralTargetPages.keys(),
      ...this.localCache.changes.map(({ annotation }) => itemTargetId(annotation)).filter(Boolean),
      ...this.outbox.commands.map((entry) => entry.targetStudyUnitId)
    ])) {
      const item = this.loadForTarget({ studyUnitId: target })
        .find((candidate) => candidate.annotationId === annotationId);
      if (item) return item;
    }
    return null;
  }

  #withFlushLock(operation) {
    const locks = this.navigatorValue?.locks;
    if (locks && typeof locks.request === "function") {
      const name = `aralearn:course-annotations:${this.scope}:${this.courseId}`;
      return locks.request(name, { mode: "exclusive" }, operation);
    }
    const next = this.#queue.then(operation, operation);
    this.#queue = next.catch(() => undefined);
    return next;
  }

  flush() {
    this.#assertInitialized();
    return this.#withFlushLock(() => this.#flushUnlocked());
  }

  async #flushUnlocked() {
    const refreshTargets = new Set();
    while (true) {
      await this.#readLocal();
      const entry = this.outbox.commands.find(({ status }) => status === "pending");
      if (!entry) {
        for (const target of refreshTargets) {
          await this.refreshTarget({ studyUnitId: target });
        }
        return this.snapshot();
      }
      await this.#updateOutbox((outbox) => {
        const stored = outbox.commands.find(({ requestId }) => requestId === entry.requestId);
        if (stored) stored.attempted = true;
        return outbox;
      });
      let change;
      try {
        change = normalizeCourseAnchoredAnnotationChange(
          await this.api.executeMyCourseAnchoredAnnotationCommand({
            courseId: this.courseId,
            expectedCourseRevision: entry.expectedCourseRevision,
            requestId: entry.requestId,
            command: entry.command
          })
        );
        if (change.courseId !== this.courseId || change.requestId !== entry.requestId ||
            entry.expectedCourseRevision !== null && !change.idempotent &&
            change.courseRevision !== entry.expectedCourseRevision ||
            change.annotation !== null && (
              change.annotation.annotationId !== entry.annotationId ||
              change.annotation.target.kind !== "study_unit" ||
              change.annotation.target.id !== entry.targetStudyUnitId
            )) {
          throw new TypeError("A confirmação não corresponde à observação enviada.");
        }
      } catch (error) {
        if (authorityFailure(error)) {
          await this.clearLocal();
          throw error;
        }
        if (networkFailure(error)) return this.snapshot();
        await this.#updateOutbox((outbox) => {
          const stored = outbox.commands.find(({ requestId }) => requestId === entry.requestId);
          if (stored) {
            stored.status = "failed";
            stored.lastError = {
              code: String(error?.code || (conflictFailure(error)
                ? "annotation_conflict"
                : "annotation_write_failed")),
              message: conflictFailure(error)
                ? "A observação mudou em outra sessão. Reabra antes de tentar novamente."
                : String(error?.message || "Não foi possível sincronizar a observação.")
            };
          }
          return outbox;
        });
        try {
          await this.refreshTarget({ studyUnitId: entry.targetStudyUnitId });
        } catch (refreshError) {
          if (authorityFailure(refreshError)) throw refreshError;
        }
        await this.#broadcast([entry.annotationId]);
        continue;
      }
      await this.#updateOutbox((outbox) => {
        outbox.commands = outbox.commands.filter(({ requestId }) => requestId !== entry.requestId);
        return outbox;
      });
      if (change.courseRevision > this.courseRevision) {
        this.courseRevision = change.courseRevision;
        await this.cache.deleteCachePrefix(cacheKey(this.courseId));
        this.localCache = emptyCache(this.courseId, this.courseRevision, nowIso(this.clock));
        this.ephemeralTargetPages.clear();
      }
      await this.#updateCache((cache) => {
        cache.annotationSetVersion = change.annotationSetVersion;
        if (change.annotation) {
          cache.changes = [...cache.changes.filter(({ annotation }) =>
            annotation?.annotationId !== change.annotation.annotationId), change]
            .slice(-MAX_OUTBOX_COMMANDS);
        } else {
          refreshTargets.add(entry.targetStudyUnitId);
        }
        cache.updatedAt = nowIso(this.clock);
        return cache;
      });
      await this.#broadcast([change.annotation?.annotationId || entry.annotationId]);
    }
  }

  async clearLocal() {
    await Promise.all([
      this.cache.deleteCachePrefix(cacheKey(this.courseId)),
      this.cache.deleteCachePrefix(outboxKey(this.courseId))
    ]);
    this.localCache = emptyCache(this.courseId, this.courseRevision, nowIso(this.clock));
    this.outbox = emptyOutbox(this.courseId, nowIso(this.clock));
    this.ephemeralTargetPages.clear();
    return true;
  }

  close() {
    this.#channel?.close?.();
    this.#channel = null;
    this.#listeners.clear();
    this.ephemeralTargetPages.clear();
  }
}

export { targetQuery as createCourseAnnotationTargetQuery };
