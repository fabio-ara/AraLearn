// One-time IndexedDB upgrade. No reader, renderer or authoring fallback imports
// this: it runs only inside the versionchange transaction opened by
// CourseLocalStore. It preserves every stored byte. The current pending outbox
// keeps one exact request under the current key, and each additional superseded
// row becomes an immutable draft-recovery entry that stays exportable and is
// never replayed.
import { STUDY_DRAFT_RECOVERY_CACHE_KEY, STUDY_DRAFT_RECOVERY_CONTRACT } from "./studyDraftRecovery.js";
import { UUID_PATTERN } from "../domain/identifiers.js";

const PENDING_PREFIX = "course.v1.pending-authoring-observation:";
const ENTITIES_CONTRACT = "aralearn.course-entities.v1";

export function centralPendingAuthoringObservationKey(courseId) {
  return `${PENDING_PREFIX}${courseId}:central`;
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value) &&
    [Object.prototype, null].includes(Object.getPrototypeOf(value));
}

// The superseded queue stored one outbox row per target. The course identity
// comes from the key; only a matching plain object can serve as the current
// consumable outbox row. Any other legacy row still becomes recoverable.
function legacyObservationCourseId(key) {
  if (!key.startsWith(PENDING_PREFIX)) return null;
  const segments = key.slice(PENDING_PREFIX.length).split(":");
  if (segments.length < 2 || segments[segments.length - 1] === "central") return null;
  return segments[0] || null;
}
function usablePendingValue(row, courseId) {
  return isPlainObject(row.value) && row.value.courseId === courseId;
}

// A current key holding any non-object value (a null left by a raw write, for
// instance) is empty for the current queue and is therefore replaced.
function occupiedCentralCourseId(key, value) {
  if (!key.startsWith(PENDING_PREFIX) || !isPlainObject(value)) return null;
  const segments = key.slice(PENDING_PREFIX.length).split(":");
  return segments.length === 2 && segments[1] === "central" ? segments[0] : null;
}

// The current queue reads exactly one row per course. A vacant current key
// receives the first superseded row of that course; every remaining row becomes
// a draft-recovery entry, so no pending row is abandoned and every legacy key is
// retired. Recovery entries keep command null and are never replayed.
export function pendingObservationMigration(rows) {
  const occupied = new Set();
  for (const row of rows) {
    const courseId = occupiedCentralCourseId(row.key, row.value);
    if (courseId) occupied.add(courseId);
  }
  const claimed = new Set();
  const writes = [];
  const removals = [];
  const recoveries = [];
  for (const row of rows) {
    const courseId = legacyObservationCourseId(row.key);
    if (!courseId) continue;
    if (usablePendingValue(row, courseId) && !claimed.has(courseId) && !occupied.has(courseId)) {
      claimed.add(courseId);
      writes.push({ key: centralPendingAuthoringObservationKey(courseId), value: row.value });
      removals.push(row.key);
      continue;
    }
    recoveries.push(row);
    removals.push(row.key);
  }
  return { writes, removals, recoveries };
}

// Formerly exported by the domain. The current reader rejects the aggregate
// review shape, so only this one-time upgrade converts it. The historical
// declaration is retained in the protected legacyMicrosequenceReview field.
function migrateLegacyCourseEntityReviews(rows) {
  return rows.map(row => {
    if (row?.entityType !== "microsequence" || !Object.hasOwn(row?.contentReview ?? {}, "approvedAt")) return row;
    return { ...row, legacyMicrosequenceReview: structuredClone(row.contentReview), contentReview: { state: "unregistered" } };
  });
}

export function entityReviewCacheMigration(row) {
  const page = row?.value?.data;
  if (!isPlainObject(page) || page.contract !== ENTITIES_CONTRACT || !Array.isArray(page.items)) return null;
  const items = migrateLegacyCourseEntityReviews(page.items);
  if (JSON.stringify(items) === JSON.stringify(page.items)) return null;
  return { key: row.key, value: { ...row.value, data: { ...page, items } } };
}

function recoveryEntries(rows, existing) {
  const entries = [...existing];
  for (const row of rows) {
    let recoveryId = `observation-upgrade-v10-${entries.length + 1}`;
    while (entries.some(entry => entry.recoveryId === recoveryId)) recoveryId += "x";
    const value = isPlainObject(row.value) ? row.value : null;
    const keyCourseId = row.key.slice(PENDING_PREFIX.length).split(":")[0];
    const knownCourseId = UUID_PATTERN.test(value?.courseId ?? "") ? value.courseId : keyCourseId;
    entries.push({ recoveryId,
      sourceCourseId: UUID_PATTERN.test(knownCourseId ?? "") ? knownCourseId : null,
      requestId: typeof value?.requestId === "string" ? value.requestId : null,
      command: null, studyUnit: null, targetId: null, originalSnapshot: structuredClone(row) });
  }
  return entries;
}

function preservePendingRecoveries(store, rows, recoveries) {
  const row = rows.find(({ key }) => key === STUDY_DRAFT_RECOVERY_CACHE_KEY);
  const collection = row && row.value != null
    ? structuredClone(row.value) : { contract: STUDY_DRAFT_RECOVERY_CONTRACT, entries: [] };
  if (!isPlainObject(collection) || collection.contract !== STUDY_DRAFT_RECOVERY_CONTRACT ||
      !Array.isArray(collection.entries)) throw new TypeError("Recuperação de rascunho desconhecida.");
  store.put({ key: STUDY_DRAFT_RECOVERY_CACHE_KEY,
    value: { ...collection, entries: recoveryEntries(recoveries, collection.entries) } });
}

export function upgradeCachedCourseCacheV10(store, onComplete = () => {}) {
  const rows = [];
  const request = store.openCursor();
  request.onerror = () => store.transaction.abort();
  request.onsuccess = () => {
    const cursor = request.result;
    if (cursor) {
      rows.push({ key: String(cursor.key), value: cursor.value?.value });
      cursor.continue();
      return;
    }
    try {
      const pending = pendingObservationMigration(rows);
      for (const write of pending.writes) store.put(write);
      for (const key of pending.removals) store.delete(key);
      if (pending.recoveries.length) preservePendingRecoveries(store, rows, pending.recoveries);
      for (const row of rows) {
        const migrated = entityReviewCacheMigration(row);
        if (migrated) store.put(migrated);
      }
      onComplete();
    } catch {
      // A failed migration rolls back every row and keeps the original database.
      store.transaction.abort();
    }
  };
}
