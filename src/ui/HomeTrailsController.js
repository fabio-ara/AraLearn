import {
  courseFromWorkspaceParts,
  isStudyableTrailItem,
  normalizeHomeTrailSnapshot,
  preserveSelectedTrailItem
} from "./homeTrailProjection.js";
import { validateProjectDocument } from "../domain/aralearnProject.js";

function requiredMethod(adapter, name) {
  if (typeof adapter?.[name] !== "function") {
    throw new Error(`A operação ${name} não está disponível em Trilhas.`);
  }
  return adapter[name].bind(adapter);
}

export function isHomeTrailsAuthorityError(error) {
  const status = Number(error?.status || error?.cause?.status || 0);
  const code = String(error?.code || error?.cause?.code || "").toUpperCase();
  return error?.authRequired === true || error?.cause?.authRequired === true ||
    status === 401 || status === 403 || code === "42501" || code === "AUTH_REQUIRED";
}

export class HomeTrailsController {
  constructor({ adapter } = {}) {
    if (!adapter || typeof adapter.loadTrailSnapshot !== "function") {
      throw new TypeError("Adaptador de Trilhas inválido.");
    }
    this.adapter = adapter;
    this.snapshot = null;
    this.selectedItemId = "";
    this.courseRefs = new Map();
    this.loadedCourses = new Map();
    this.refreshVersion = 0;
    this.removedItemIds = [];
  }

  async refresh({ selectedItemId = this.selectedItemId } = {}) {
    const version = ++this.refreshVersion;
    let value;
    try {
      value = await this.adapter.loadTrailSnapshot();
    } catch (error) {
      if (version === this.refreshVersion && isHomeTrailsAuthorityError(error)) {
        await this.clear();
      }
      throw error;
    }
    if (version !== this.refreshVersion) return this.snapshot;
    const snapshot = normalizeHomeTrailSnapshot(value);
    const previousById = new Map((this.snapshot?.items || []).map((item) => [item.itemId, item]));
    this.snapshot = snapshot;
    this.selectedItemId = preserveSelectedTrailItem(snapshot, selectedItemId);
    const currentIds = new Set(snapshot.items.map((item) => item.itemId));
    this.removedItemIds = [...previousById.keys()].filter((itemId) => !currentIds.has(itemId));
    const invalidatedCacheIds = new Set(this.removedItemIds);
    for (const itemId of this.loadedCourses.keys()) {
      const current = snapshot.items.find((item) => item.itemId === itemId);
      const loadedReference = this.courseRefs.get(itemId);
      const loadedRevision = Number(loadedReference?.revision);
      const currentRevision = Number(current?.revision);
      const revisionMatches = loadedReference?.revision === current?.revision || (
        snapshot.stale === true &&
        Number.isSafeInteger(loadedRevision) && Number.isSafeInteger(currentRevision) &&
        loadedRevision >= currentRevision
      );
      const loadedMatchesCurrent = Boolean(
        current &&
        loadedReference?.workspaceId === current.workspaceId &&
        loadedReference?.courseKey === current.courseKey &&
        revisionMatches
      );
      if (
        !currentIds.has(itemId) ||
        !loadedMatchesCurrent
      ) {
        this.loadedCourses.delete(itemId);
        invalidatedCacheIds.add(itemId);
      }
    }
    for (const itemId of this.courseRefs.keys()) {
      if (!currentIds.has(itemId)) this.courseRefs.delete(itemId);
    }
    for (const item of snapshot.items) {
      const current = this.courseRefs.get(item.itemId);
      const loaded = this.loadedCourses.get(item.itemId);
      const courseKey = loaded?.id || current?.courseKey || item.courseKey || item.courseId || null;
      const nextReference = this.#referenceFor(item, courseKey);
      this.courseRefs.set(item.itemId, Object.freeze(
        snapshot.stale === true && current && Number(current.revision) > Number(item.revision)
          ? {
              ...nextReference,
              revision: current.revision,
              canEditOffline: current.canEditOffline === true || nextReference.canEditOffline === true,
              authoringStatus: current.authoringStatus,
              authoringPendingCount: current.authoringPendingCount,
              authoringErrorMessage: current.authoringErrorMessage
            }
          : nextReference
      ));
    }
    if (typeof this.adapter.clearWorkspaceCourseCache === "function") {
      await Promise.all([...invalidatedCacheIds].map((itemId) =>
        Promise.resolve(this.adapter.clearWorkspaceCourseCache(itemId)).catch(() => undefined)
      ));
    }
    return snapshot;
  }

  async clear() {
    this.refreshVersion += 1;
    const itemIds = new Set([
      ...(this.snapshot?.items || []).map((item) => item.itemId),
      ...this.courseRefs.keys(),
      ...this.loadedCourses.keys()
    ]);
    this.removedItemIds = [...itemIds];
    this.snapshot = null;
    this.selectedItemId = "";
    this.courseRefs.clear();
    this.loadedCourses.clear();
    const clearCourse = typeof this.adapter.clearWorkspaceCourseCache === "function"
      ? this.adapter.clearWorkspaceCourseCache.bind(this.adapter)
      : null;
    await Promise.all([
      ...[...itemIds].map((itemId) =>
        Promise.resolve(clearCourse?.(itemId)).catch(() => undefined)
      ),
      Promise.resolve(this.adapter.clearCache?.({ purgeItems: true })).catch(() => undefined)
    ]);
  }

  #referenceFor(item, courseKey) {
    return Object.freeze({
      trailItemId: item.itemId,
      workspaceId: item.workspaceId,
      courseKey,
      courseId: item.courseId,
      selectionId: item.selectionId,
      contentHash: item.contentHash,
      revision: item.revision,
      origin: item.origin,
      source: item.source,
      canEdit: item.canEdit,
      canEditOffline: item.canEditOffline,
      canDelete: item.canDelete,
      canRemove: item.canRemove,
      authoringStatus: item.authoringStatus || "",
      authoringPendingCount: Number(item.authoringPendingCount) || 0,
      authoringErrorMessage: String(item.authoringErrorMessage || "")
    });
  }

  select(itemId) {
    const item = this.snapshot?.items?.find((candidate) => candidate.itemId === itemId);
    if (!isStudyableTrailItem(item)) return false;
    this.selectedItemId = item.itemId;
    return true;
  }

  item(itemId = this.selectedItemId) {
    return this.snapshot?.items?.find((candidate) => candidate.itemId === itemId) || null;
  }

  async loadCourse(itemId = this.selectedItemId) {
    const item = this.item(itemId);
    if (!isStudyableTrailItem(item)) {
      throw new Error("O item selecionado não possui uma composição navegável.");
    }
    if (this.loadedCourses.has(item.itemId)) return this.loadedCourses.get(item.itemId);
    if (!item.workspaceId) return null;
    const response = await requiredMethod(this.adapter, "loadWorkspaceCourse")(item);
    const course = this.acceptCourseResponse(item, response);
    if (typeof this.adapter.cacheWorkspaceCourse === "function") {
      await this.adapter.cacheWorkspaceCourse(item, response, course);
    }
    return course;
  }

  acceptCourseResponse(item, response) {
    if (!Array.isArray(response?.parts)) {
      throw new Error("A composição corrente do curso não contém parts.");
    }
    let course;
    if (response?.draftCourse) {
      const validation = validateProjectDocument({
        contract: "aralearn.library.v1",
        scope: "course",
        courses: [response.draftCourse]
      });
      if (!validation.ok) {
        throw new Error("O rascunho offline deste curso viola o contrato por packages.");
      }
      course = structuredClone(validation.value.courses[0]);
    } else {
      course = courseFromWorkspaceParts(response, item);
    }
    const responseRevision = Number(response?.revision);
    const baseReference = this.#referenceFor({
      ...item,
      revision: Number.isSafeInteger(responseRevision) ? responseRevision : item.revision
    }, course.id);
    const reference = Object.freeze({
      ...baseReference,
      canEditOffline: baseReference.canEditOffline === true || (
        baseReference.canEdit === true && Boolean(baseReference.workspaceId)
      ),
      authoringStatus: response?.authoringQueue?.status || "",
      authoringPendingCount: Number(response?.authoringQueue?.pendingCount) || 0,
      authoringErrorMessage: String(response?.authoringQueue?.errorMessage || "")
    });
    this.courseRefs.set(item.itemId, reference);
    this.loadedCourses.set(item.itemId, course);
    return course;
  }

  async reloadCourse(itemId = this.selectedItemId, loader = null) {
    const item = this.item(itemId);
    if (!item || !item.workspaceId) return null;
    const response = typeof loader === "function"
      ? await loader(item, this.courseRefs.get(item.itemId) || null)
      : await requiredMethod(this.adapter, "loadWorkspaceCourse")(item);
    const course = this.acceptCourseResponse(item, response);
    if (typeof this.adapter.cacheWorkspaceCourse === "function") {
      await this.adapter.cacheWorkspaceCourse(item, response, course);
    }
    return course;
  }

  courseRefForKey(courseKey, { trailItemId = "" } = {}) {
    const normalizedCourseKey = String(courseKey || "").trim();
    const normalizedTrailItemId = String(trailItemId || "").trim();
    if (!normalizedCourseKey) return null;
    if (normalizedTrailItemId) {
      const reference = this.courseRefs.get(normalizedTrailItemId) || null;
      if (!reference) return null;
      return reference.courseKey === normalizedCourseKey ||
        reference.courseId === normalizedCourseKey
        ? reference
        : null;
    }
    const matches = [...this.courseRefs.values()].filter((reference) =>
      reference.courseKey === normalizedCourseKey ||
      reference.courseId === normalizedCourseKey
    );
    if (matches.length > 1) {
      throw new Error("Há mais de um curso com esta identidade em Trilhas; informe trailItemId.");
    }
    return matches[0] || null;
  }

  bindCourseKey(trailItemId, courseKey) {
    const item = this.item(trailItemId);
    const normalized = String(courseKey || "").trim();
    if (!item || !normalized) return null;
    const current = this.courseRefs.get(trailItemId);
    const reference = Object.freeze({
      ...this.#referenceFor(item, normalized),
      ...(current?.authoringStatus
        ? {
            authoringStatus: current.authoringStatus,
            authoringPendingCount: current.authoringPendingCount,
            authoringErrorMessage: current.authoringErrorMessage
          }
        : {})
    });
    this.courseRefs.set(item.itemId, reference);
    return reference;
  }

  updateCourseRef(trailItemId, patch = {}) {
    const current = this.courseRefs.get(trailItemId);
    if (!current) return null;
    const next = Object.freeze({ ...current, ...patch });
    this.courseRefs.set(trailItemId, next);
    return next;
  }

  async mutate(operation, argumentsValue = {}) {
    await requiredMethod(this.adapter, operation)(argumentsValue);
    return this.refresh({ selectedItemId: this.selectedItemId });
  }

  async removeFromTrails(itemId) {
    const item = this.item(itemId);
    if (!item?.canRemove) throw new Error("Este curso não pode ser retirado de Trilhas.");
    await requiredMethod(this.adapter, "removeTrailItem")({
      trailItemId: item.itemId,
      selectionId: item.selectionId,
      courseId: item.courseId,
      contentHash: item.contentHash
    });
    return this.refresh({ selectedItemId: this.selectedItemId });
  }

  async deleteFromCatalog(itemId) {
    const item = this.item(itemId);
    if (item?.origin !== "catalog" || !item?.canDelete || !item?.courseId) {
      throw new Error("Este curso não pode ser excluído de Coleções.");
    }
    await requiredMethod(this.adapter, "removeCourseFromCatalog")(item.courseId);
    return this.refresh({ selectedItemId: this.selectedItemId });
  }
}
