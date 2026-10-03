import assert from "node:assert/strict";
import test from "node:test";
import { IDBFactory } from "fake-indexeddb";
import { CourseLocalStore, COURSE_LOCAL_DATABASE_PREFIX } from "../../src/persistence/CourseLocalStore.js";
import { centralPendingAuthoringObservationKey, entityReviewCacheMigration, pendingObservationMigration } from "../../src/persistence/courseCacheUpgradeV10.js";
import { STUDY_DRAFT_RECOVERY_CACHE_KEY, readStudyDraftRecoveries } from "../../src/persistence/studyDraftRecovery.js";

const COURSE = "10000000-0000-4000-8000-000000000001";
const OTHER = "20000000-0000-4000-8000-000000000002";
const PREFIX = "course.v1.pending-authoring-observation";

function pending(courseId, annotationId, capturedAt = "2026-09-20T00:00:00.000Z") {
  return { requestId: `request-${annotationId}`, courseId, expectedCourseRevision: 7,
    command: { type: "create_anchored_annotation", annotationId, target: { kind: "study_unit", id: "unit-a" },
      rawText: `Texto ${annotationId}`, category: null, briefSummary: null, capturedAt } };
}

function entityPage(courseId, revision) {
  return { savedAt: "2026-09-08T00:00:00.000Z", data: { contract: "aralearn.course-entities.v1", courseId,
    revision, items: [{ entityType: "microsequence", entityId: "micro-a", parentType: "lesson", parentId: "lesson-a",
      position: 0, content: { title: "Microssequência" },
      contentReview: { state: "current", approvedAt: "2026-09-07T12:00:00Z" } }],
    hasMore: false, nextCursor: null } };
}

async function seed(indexedDb, version, rows) {
  await new Promise((resolve, reject) => {
    const request = indexedDb.open(`${COURSE_LOCAL_DATABASE_PREFIX}-visitor`, version);
    request.onupgradeneeded = () => {
      const store = request.result.createObjectStore("course_cache", { keyPath: "key" });
      for (const [key, value] of rows) store.put({ key, value });
    };
    request.onerror = () => reject(request.error);
    request.onsuccess = () => { request.result.close(); resolve(); };
  });
}

async function readRow(indexedDb, version, key) {
  return new Promise((resolve, reject) => {
    const request = indexedDb.open(`${COURSE_LOCAL_DATABASE_PREFIX}-visitor`, version);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const database = request.result;
      const get = database.transaction("course_cache", "readonly").objectStore("course_cache").get(key);
      get.onsuccess = () => { const value = get.result; database.close(); resolve(value); };
      get.onerror = () => { database.close(); reject(get.error); };
    };
  });
}

test("cache v3 converte páginas de entidades e move filas de cursos distintos", async () => {
  const indexedDb = new IDBFactory();
  const legacyKey = `${PREFIX}:${COURSE}:study_unit:unit-a`;
  const otherLegacyKey = `${PREFIX}:${OTHER}:microsequence_explanation:micro-b`;
  const pageKey = `course.v1.entities:${COURSE}:4:500:start`;
  const originalReview = { state: "current", approvedAt: "2026-09-07T12:00:00Z" };
  const entityValue = entityPage(COURSE, 4);
  await seed(indexedDb, 3, [[legacyKey, pending(COURSE, "annotation-a")], [otherLegacyKey, pending(OTHER, "annotation-b")],
    [pageKey, entityValue], ["progress", { completed: ["unit-a"] }]]);
  const store = await CourseLocalStore.open(indexedDb, { visitor: true });
  assert.deepEqual(await store.getCache(centralPendingAuthoringObservationKey(COURSE)), pending(COURSE, "annotation-a"));
  assert.deepEqual(await store.getCache(centralPendingAuthoringObservationKey(OTHER)), pending(OTHER, "annotation-b"));
  assert.equal(await store.getCache(legacyKey), null);
  assert.equal(await store.getCache(otherLegacyKey), null);
  assert.equal(await store.getCache(STUDY_DRAFT_RECOVERY_CACHE_KEY), null, "sem excedente, nenhum rascunho é criado");
  const page = await store.getCache(pageKey);
  assert.deepEqual(page.data.items[0].contentReview, { state: "unregistered" });
  assert.deepEqual(page.data.items[0].legacyMicrosequenceReview, originalReview);
  assert.deepEqual(page.data.items[0].content, entityValue.data.items[0].content);
  assert.deepEqual(await store.getCache("progress"), { completed: ["unit-a"] });
  store.close();
  const reopened = await CourseLocalStore.open(indexedDb, { visitor: true });
  assert.deepEqual(await reopened.getCache(pageKey), page);
  reopened.close();
});

test("a migração pura trata chave corrente não utilizável como vazia", () => {
  const legacyKey = `${PREFIX}:${COURSE}:study_unit:unit-a`;
  const legacy = { key: legacyKey, value: pending(COURSE, "annotation-a") };
  const corruptKey = `${PREFIX}:${OTHER}:study_unit:unit-b`;
  const corrupt = { key: corruptKey, value: "ignorar" };
  const result = pendingObservationMigration([
    { key: centralPendingAuthoringObservationKey(COURSE), value: null }, legacy, corrupt]);
  assert.deepEqual(result.writes, [{ key: centralPendingAuthoringObservationKey(COURSE), value: legacy.value }]);
  assert.deepEqual(result.removals, [legacyKey, corruptKey]);
  assert.deepEqual(result.recoveries.map(row => row.key), [corruptKey]);
});

test("chave corrente nula é tratada como vazia e recebe a fila substituída", async () => {
  const indexedDb = new IDBFactory();
  const centralKey = centralPendingAuthoringObservationKey(COURSE);
  const legacyKey = `${PREFIX}:${COURSE}:study_unit:unit-a`;
  await seed(indexedDb, 3, [[centralKey, null], [legacyKey, pending(COURSE, "annotation-a")]]);
  const store = await CourseLocalStore.open(indexedDb, { visitor: true });
  assert.deepEqual(await store.getCache(centralKey), pending(COURSE, "annotation-a"));
  assert.equal(await store.getCache(legacyKey), null);
  assert.equal(await store.getCache(STUDY_DRAFT_RECOVERY_CACHE_KEY), null);
  store.close();
});

test("chave corrente preenchida preserva a fila substituída como rascunho exportável", async () => {
  const indexedDb = new IDBFactory();
  const centralKey = centralPendingAuthoringObservationKey(COURSE);
  const legacyKey = `${PREFIX}:${COURSE}:study_unit:unit-a`;
  const current = pending(COURSE, "annotation-current", "2026-09-25T00:00:00.000Z");
  const superseded = pending(COURSE, "annotation-legacy", "2026-09-10T00:00:00.000Z");
  await seed(indexedDb, 3, [[centralKey, current], [legacyKey, superseded]]);
  const store = await CourseLocalStore.open(indexedDb, { visitor: true });
  assert.deepEqual(await store.getCache(centralKey), current, "a fila corrente não é sobrescrita");
  assert.equal(await store.getCache(legacyKey), null);
  const entries = readStudyDraftRecoveries(await store.getCache(STUDY_DRAFT_RECOVERY_CACHE_KEY));
  assert.equal(entries.length, 1);
  assert.equal(entries[0].sourceCourseId, COURSE);
  assert.equal(entries[0].requestId, superseded.requestId);
  assert.equal(entries[0].command, null, "o comando substituído não é reexecutado");
  assert.deepEqual(entries[0].originalSnapshot, { key: legacyKey, value: superseded });
  store.close();
});

test("linha de recuperação nula não impede a migração nem perde bytes", async () => {
  const indexedDb = new IDBFactory();
  const centralKey = centralPendingAuthoringObservationKey(COURSE);
  const legacyKey = `${PREFIX}:${COURSE}:study_unit:unit-a`;
  const superseded = pending(COURSE, "annotation-legacy");
  await seed(indexedDb, 3, [[centralKey, pending(COURSE, "annotation-current")], [legacyKey, superseded],
    [STUDY_DRAFT_RECOVERY_CACHE_KEY, null]]);
  const store = await CourseLocalStore.open(indexedDb, { visitor: true });
  const entries = readStudyDraftRecoveries(await store.getCache(STUDY_DRAFT_RECOVERY_CACHE_KEY));
  assert.equal(entries.length, 1);
  assert.deepEqual(entries[0].originalSnapshot, { key: legacyKey, value: superseded });
  assert.equal(await store.getCache(legacyKey), null);
  store.close();
});

test("várias filas substituídas do mesmo curso: uma corrente e o excedente em rascunho", async () => {
  const indexedDb = new IDBFactory();
  const keys = ["microsequence_explanation:micro-a", "study_unit:unit-a", "study_unit:unit-b"]
    .map(suffix => `${PREFIX}:${COURSE}:${suffix}`);
  const values = keys.map((key, index) => pending(COURSE, `annotation-${index + 1}`));
  await seed(indexedDb, 3, keys.map((key, index) => [key, values[index]]));
  const store = await CourseLocalStore.open(indexedDb, { visitor: true });
  const central = await store.getCache(centralPendingAuthoringObservationKey(COURSE));
  assert.ok(values.some(value => JSON.stringify(value) === JSON.stringify(central)), "a corrente recebe uma das filas");
  for (const key of keys) assert.equal(await store.getCache(key), null);
  const entries = readStudyDraftRecoveries(await store.getCache(STUDY_DRAFT_RECOVERY_CACHE_KEY));
  assert.equal(entries.length, 2);
  const preservedIds = [central, ...entries.map(entry => entry.originalSnapshot.value)]
    .map(value => value.command.annotationId).sort();
  assert.deepEqual(preservedIds, values.map(value => value.command.annotationId).sort());
  for (const entry of entries) {
    assert.equal(entry.command, null);
    assert.equal(entry.sourceCourseId, COURSE);
    assert.ok(keys.includes(entry.originalSnapshot.key));
  }
  store.close();
});

test("falha na migração reverte o upgrade e preserva todos os bytes", async () => {
  const indexedDb = new IDBFactory();
  const legacyKey = `${PREFIX}:${COURSE}:study_unit:unit-a`;
  const legacyValue = pending(COURSE, "annotation-a");
  const invalidRecovery = { contract: "aralearn.study-draft-recoveries.desconhecido", entries: [] };
  await seed(indexedDb, 3, [[centralPendingAuthoringObservationKey(COURSE), pending(COURSE, "annotation-current")],
    [legacyKey, legacyValue], [STUDY_DRAFT_RECOVERY_CACHE_KEY, invalidRecovery]]);
  await assert.rejects(CourseLocalStore.open(indexedDb, { visitor: true }), /preservados/u);
  assert.deepEqual(await readRow(indexedDb, 3, legacyKey), { key: legacyKey, value: legacyValue });
  assert.deepEqual(await readRow(indexedDb, 3, STUDY_DRAFT_RECOVERY_CACHE_KEY),
    { key: STUDY_DRAFT_RECOVERY_CACHE_KEY, value: invalidRecovery });
});

for (const version of [1, 2, 3]) test(`upgrade do caminho de versão ${version} alcança a migração`, async () => {
  const indexedDb = new IDBFactory();
  const legacyKey = `${PREFIX}:${COURSE}:study_unit:unit-a`;
  const pageKey = `course.v1.entities:${COURSE}:4:500:start`;
  await seed(indexedDb, version, [[legacyKey, pending(COURSE, "annotation-a")], [pageKey, entityPage(COURSE, 4)]]);
  const store = await CourseLocalStore.open(indexedDb, { visitor: true });
  assert.equal(store.database.version, 4);
  assert.deepEqual(await store.getCache(centralPendingAuthoringObservationKey(COURSE)), pending(COURSE, "annotation-a"));
  assert.equal(await store.getCache(legacyKey), null);
  assert.deepEqual((await store.getCache(pageKey)).data.items[0].contentReview, { state: "unregistered" });
  store.close();
});

test("conversor de revisão agregada preserva conteúdo, retém o histórico e é idempotente", () => {
  const row = { key: "course.v1.entities:c:1:500:start", value: { savedAt: "2026-09-08T00:00:00.000Z",
    data: { contract: "aralearn.course-entities.v1", items: [{ entityType: "microsequence", entityId: "micro-a",
      content: { title: "Microssequência" },
      contentReview: { state: "current", approvedAt: "2026-09-07T12:00:00Z" } }] } } };
  const migrated = entityReviewCacheMigration(row);
  assert.equal(migrated.value.data.contract, "aralearn.course-entities.v1");
  assert.deepEqual(migrated.value.savedAt, row.value.savedAt);
  assert.deepEqual(migrated.value.data.items[0].content, { title: "Microssequência" });
  assert.deepEqual(migrated.value.data.items[0].contentReview, { state: "unregistered" });
  assert.deepEqual(migrated.value.data.items[0].legacyMicrosequenceReview, { state: "current", approvedAt: "2026-09-07T12:00:00Z" });
  assert.equal(entityReviewCacheMigration(migrated), null);
});
