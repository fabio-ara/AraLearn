const FULL_REFRESH_PULL_STORES = new Set(["courseSelections"]);

function count(value) {
  const normalized = Number(value || 0);
  return Number.isFinite(normalized) && normalized > 0 ? normalized : 0;
}

export function synchronizationRequiresFullReplicaRefresh(result) {
  if (result?.bootstrap?.status === "applied") return true;
  if (count(result?.updatedCourses) > 0) return true;
  if (Array.isArray(result?.unavailableCourses) && result.unavailableCourses.length > 0) return true;

  const appliedByStore = result?.pulled?.appliedByStore || {};
  return Object.entries(appliedByStore).some(([storeName, applied]) =>
    FULL_REFRESH_PULL_STORES.has(storeName) && count(applied) > 0
  );
}

export function synchronizationHasPersonalReplicaChanges(result) {
  return count(result?.pulled?.applied) > 0;
}
