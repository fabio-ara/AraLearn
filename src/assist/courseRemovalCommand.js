import { deterministicUuid } from "../persistence/deterministicUuid.js";

const MAX_CATALOG_PAGES = 100;

function normalized(value) {
  return String(value || "").trim().toLowerCase();
}

export function privateCourseRemovalRequestId({ selectionId, courseId, contentHash } = {}) {
  return deterministicUuid([
    "aralearn:remove-private-course:v1",
    normalized(selectionId),
    normalized(courseId),
    normalized(contentHash)
  ].join(":"));
}

export function catalogCourseRemovalRequestId({ courseId, contentHash, placementRevision } = {}) {
  return deterministicUuid([
    "aralearn:remove-catalog-course:v1",
    normalized(courseId),
    normalized(contentHash),
    Number(placementRevision)
  ].join(":"));
}

export function courseRemovalResponseMayBeAmbiguous(error) {
  const statusValue = error?.status ?? error?.response?.status;
  if (statusValue !== undefined && statusValue !== null) {
    const status = Number(statusValue);
    return status === 0 || status >= 500;
  }
  return error?.name === "AbortError" || error instanceof TypeError;
}

export async function executeIdempotentCourseRemoval({
  remoteCatalog,
  action,
  argumentsValue
} = {}) {
  if (typeof remoteCatalog?.executeApplicationAuthoringAction !== "function") {
    throw new TypeError("A exclusão remota não está disponível.");
  }
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return await remoteCatalog.executeApplicationAuthoringAction(action, argumentsValue);
    } catch (error) {
      if (attempt > 0 || !courseRemovalResponseMayBeAmbiguous(error)) throw error;
    }
  }
  throw new Error("Não foi possível confirmar a exclusão remota.");
}

export async function findCatalogCoursePlacement(remoteCatalog, courseId) {
  const normalizedCourseId = normalized(courseId);
  const rows = await remoteCatalog.listCollections("");
  const current = (Array.isArray(rows) ? rows : []).find((row) =>
    normalized(row.course_id ?? row.courseId) === normalizedCourseId
  );
  const collectionId = normalized(current?.collection_id ?? current?.collectionId);
  if (!collectionId) throw new Error("A Coleção do curso não foi encontrada.");

  let cursor = null;
  const seenCursors = new Set();
  for (let pageIndex = 0; pageIndex < MAX_CATALOG_PAGES; pageIndex += 1) {
    const page = await remoteCatalog.executeApplicationAuthoringAction("consultarCatalogo", {
      operation: "list_collection_courses",
      collectionId,
      limit: 100,
      ...(cursor || {})
    });
    const item = (Array.isArray(page?.items) ? page.items : []).find((course) =>
      normalized(course?.courseId) === normalizedCourseId
    );
    if (item) return { collectionId, item };
    if (page?.hasMore !== true) break;
    const nextCursor = page?.nextCursor;
    const afterPosition = Number(nextCursor?.afterPosition);
    const afterId = normalized(nextCursor?.afterId);
    if (!Number.isSafeInteger(afterPosition) || afterPosition < 0 || !afterId) {
      throw new Error("A paginação de Coleções devolveu um cursor inválido.");
    }
    const cursorKey = `${afterPosition}:${afterId}`;
    if (seenCursors.has(cursorKey)) {
      throw new Error("A paginação de Coleções repetiu o mesmo cursor.");
    }
    seenCursors.add(cursorKey);
    cursor = { afterPosition, afterId };
  }
  throw new Error("A classificação atual do curso não foi encontrada.");
}

export async function removeCatalogCourse({ remoteCatalog, courseId } = {}) {
  const { item } = await findCatalogCoursePlacement(remoteCatalog, courseId);
  const requestId = await catalogCourseRemovalRequestId({
    courseId,
    contentHash: item.contentHash,
    placementRevision: item.placementRevision
  });
  return executeIdempotentCourseRemoval({
    remoteCatalog,
    action: "retirarDoCatalogo",
    argumentsValue: {
      operation: "remove_course",
      requestId,
      courseId: normalized(courseId),
      expectedPlacementRevision: item.placementRevision,
      expectedContentHash: normalized(item.contentHash)
    }
  });
}
