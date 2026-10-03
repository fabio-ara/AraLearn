import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";

const USER = "e3340000-0000-4000-8000-000000000001";
const DATABASE = `aralearn-course-v1-${USER}`;
const original = (text) => ({ contract: "unknown.useful-shape", sourceCourseId: USER,
  requestId: "same-request", unknown: { text }, sourceSelection: { courseId: USER, anchor: "keep" } });

test.beforeEach(async ({ page }) => {
  await page.route("**/tests/fixtures/draftUpgrade334.html", route => route.fulfill({
    contentType: "text/html; charset=utf-8",
    body: '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/styles-tokens.css"><link rel="stylesheet" href="/styles-shell-baseline.css"><link rel="stylesheet" href="/styles.css"></head><body><div id="recovery-root"></div></body></html>'
  }));
  await page.goto("/tests/fixtures/draftUpgrade334.html");
});

test.afterEach(async ({ page }) => {
  await page.evaluate(async (name) => {
    globalThis.draftUpgrade334?.app?.destroy();
    globalThis.draftUpgrade334?.store?.close();
    await new Promise((resolve, reject) => {
      const request = indexedDB.deleteDatabase(name);
      request.onsuccess = resolve; request.onerror = () => reject(request.error);
    });
  }, DATABASE);
});

async function seed(page, snapshots) {
  await page.evaluate(async ({ name, snapshots }) => {
    await new Promise((resolve, reject) => {
      const request = indexedDB.open(name, 1);
      request.onupgradeneeded = () => {
        const store = request.result.createObjectStore("course_cache", { keyPath: "key" });
        ["course.v1.study-draft-recovery", "aralearn.personal-course-copy-edit-pending.v1"].forEach((key, index) => {
          store.put({ key, value: snapshots[index] });
        });
        store.put({ key: "course.v1.header:preserved", value: { revision: 8, useful: "Cache corrente" } });
      };
      request.onsuccess = () => { request.result.close(); resolve(); };
      request.onerror = () => reject(request.error);
    });
  }, { name: DATABASE, snapshots });
}

test("#334 IndexedDB real: upgrade de duas intenções, exportação integral e descarte individual pelo teclado", async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const snapshots = [original("Primeira intenção íntegra"), original("Segunda intenção íntegra")];
  await seed(page, snapshots);
  await page.evaluate(async ({ user }) => {
    const { CourseLocalStore } = await import("/src/persistence/CourseLocalStore.js");
    const { CourseController } = await import("/src/supabase/CourseController.js");
    const { createCourseStudyApplication } = await import("/src/study/CourseStudyApplication.js");
    const store = await CourseLocalStore.open(indexedDB, { userId: user });
    const controller = new CourseController({ store, api: { listCourses: async () => ({}), getCourse: async () => ({}),
      recoverOwnedCourseCopy: async () => { throw new Error("Unknown snapshot must not call network"); } } });
    const project = { contract: "aralearn.course.v1", courses: [] };
    const repository = {
      loadProgress: () => ({ version: 1, lessons: {} }), loadStudyNavigation: () => null,
      loadCourseSummaries: () => [], loadRuntimeStatus: () => ({ pending: false }), loadReviewItems: () => [],
      hasMoreReviewItems: () => false, loadAnnotationsForPath: () => [], isStudyUnitMarkedForReview: () => false,
      loadProject: () => project, loadStudyDraftRecovery: (...args) => controller.loadStudyDraftRecovery(...args),
      recoverStudyDraft: (...args) => controller.recoverStudyDraft(...args),
      clearStudyDraftRecovery: (...args) => controller.clearStudyDraftRecovery(...args)
    };
    const app = createCourseStudyApplication({ root: document.getElementById("recovery-root"), repository, initialProject: project });
    globalThis.draftUpgrade334 = { app, store };
    await app.resumePendingManualEdit();
  }, { user: USER });
  for (const snapshot of snapshots) {
    await page.getByText("Rascunho guardado", { exact: true }).click();
    await expect(page.locator(".study-draft-recovery-content")).toContainText(snapshot.unknown.text);
    if (snapshot === snapshots[0]) {
      const path = info.outputPath("recovery-390.png");
      await page.locator(".study-draft-recovery").screenshot({ path });
      await info.attach("recovery-390", { path, contentType: "image/png" });
    }
    const downloaded = page.waitForEvent("download");
    await page.getByRole("button", { name: "Exportar rascunho integral", exact: true }).click();
    const download = await downloaded;
    expect(JSON.parse(await readFile(await download.path(), "utf8"))).toEqual(snapshot);
    await page.getByRole("button", { name: "Descartar rascunho guardado", exact: true }).focus();
    await page.keyboard.press("Enter");
    await expect(page.locator(".study-draft-recovery-content").filter({ hasText: snapshot.unknown.text })).toHaveCount(0);
  }
  await expect(page.locator(".study-draft-recovery")).toHaveCount(0);
  expect(await page.evaluate(async () => ({ version: globalThis.draftUpgrade334.store.database.version,
    rows: await globalThis.draftUpgrade334.store.readCachePrefix("course.v1") }))).toEqual({ version: 4,
    rows: [{ key: "course.v1.header:preserved", value: { revision: 8, useful: "Cache corrente" } }] });
});

test("#334 IndexedDB real: interrupção no upgrade reverte versão e ambas as intenções antes de nova tentativa", async ({ page }) => {
  const snapshots = [original("A"), original("B")];
  await seed(page, snapshots);
  const result = await page.evaluate(async ({ user, name }) => {
    const { CourseLocalStore } = await import("/src/persistence/CourseLocalStore.js");
    const { STUDY_DRAFT_RECOVERY_CACHE_KEY } = await import("/src/persistence/studyDraftRecovery.js");
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (row, ...args) {
      const request = put.call(this, row, ...args);
      if (row.key === STUDY_DRAFT_RECOVERY_CACHE_KEY) request.addEventListener("success", () => this.transaction.abort());
      return request;
    };
    let errorMessage;
    try { await CourseLocalStore.open(indexedDB, { userId: user }); }
    catch (error) { errorMessage = error.message; }
    finally { IDBObjectStore.prototype.put = put; }
    const readEvents = [];
    const before = await new Promise((resolve, reject) => {
      const request = indexedDB.open(name, 1);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const database = request.result;
        const transaction = database.transaction("course_cache");
        const rows = transaction.objectStore("course_cache").getAll();
        rows.onsuccess = () => readEvents.push("rows-success");
        // O resultado da requisição não encerra a transação. Esta conexão de
        // inspeção deve terminar antes de o teste solicitar outro upgrade.
        transaction.oncomplete = () => {
          readEvents.push("transaction-complete");
          database.close();
          readEvents.push("close-request");
          resolve(rows.result);
        };
        transaction.onabort = () => {
          database.close();
          reject(transaction.error || new Error("A leitura da versão anterior foi abortada."));
        };
      };
    });
    readEvents.push("next-open");
    const store = await CourseLocalStore.open(indexedDB, { userId: user });
    globalThis.draftUpgrade334 = { store };
    return { errorMessage, before, after: await store.getCache(STUDY_DRAFT_RECOVERY_CACHE_KEY), version: store.database.version, readEvents };
  }, { user: USER, name: DATABASE });
  expect(result.readEvents).toEqual(["rows-success", "transaction-complete", "close-request", "next-open"]);
  expect(result.errorMessage).toContain("preservados");
  expect(result.before).toHaveLength(3);
  expect(result.after.entries.map(entry => entry.originalSnapshot)).toEqual(snapshots);
  expect(result.version).toBe(4);
});

const OBSERVATION_COURSE = "e3340000-0000-4000-8000-0000000000c1";
const OBSERVATION_PREFIX = "course.v1.pending-authoring-observation";

function observationPending(courseId, annotationId) {
  return { requestId: `request-${annotationId}`, courseId, expectedCourseRevision: 7,
    command: { type: "create_anchored_annotation", annotationId, target: { kind: "study_unit", id: "unit-a" },
      rawText: `Texto ${annotationId}`, category: null, briefSummary: null, capturedAt: "2026-09-20T00:00:00.000Z" } };
}

test("#334 IndexedDB real: corrente nula com várias filas antigas gera corrente consumível e rascunho exportável", async ({ page }) => {
  const courseId = OBSERVATION_COURSE;
  const suffixes = ["microsequence_explanation:micro-a", "study_unit:unit-a", "study_unit:unit-b"];
  const legacyKeys = suffixes.map(suffix => `${OBSERVATION_PREFIX}:${courseId}:${suffix}`);
  const pendings = legacyKeys.map((key, index) => observationPending(courseId,
    `e3340000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`));
  const centralKey = `${OBSERVATION_PREFIX}:${courseId}:central`;
  await page.evaluate(async ({ name, rows }) => {
    await new Promise((resolve, reject) => {
      const request = indexedDB.open(name, 3);
      request.onupgradeneeded = () => {
        const store = request.result.createObjectStore("course_cache", { keyPath: "key" });
        for (const [key, value] of rows) store.put({ key, value });
      };
      request.onsuccess = () => { request.result.close(); resolve(); };
      request.onerror = () => reject(request.error);
    });
  }, { name: DATABASE, rows: [[centralKey, null], ...legacyKeys.map((key, index) => [key, pendings[index]])] });
  const result = await page.evaluate(async ({ user, courseId, centralKey, legacyKeys }) => {
    const { CourseLocalStore } = await import("/src/persistence/CourseLocalStore.js");
    const { CourseAuthoringObservationQueue } = await import("/src/ui/courseAuthoringObservationQueue.js");
    const { STUDY_DRAFT_RECOVERY_CACHE_KEY, readStudyDraftRecoveries, serializeStudyDraftSnapshot } =
      await import("/src/persistence/studyDraftRecovery.js");
    const store = await CourseLocalStore.open(indexedDB, { userId: user });
    globalThis.draftUpgrade334 = { store };
    const central = await store.getCache(centralKey);
    const legacy = {};
    for (const key of legacyKeys) legacy[key] = await store.getCache(key);
    const entries = readStudyDraftRecoveries(await store.getCache(STUDY_DRAFT_RECOVERY_CACHE_KEY))
      .map(entry => ({ command: entry.command, sourceCourseId: entry.sourceCourseId,
        snapshot: entry.originalSnapshot, exported: serializeStudyDraftSnapshot(entry.originalSnapshot) }));
    const queue = new CourseAuthoringObservationQueue({ controller: { store }, courseId,
      targetKind: "study_unit", targetId: "unit-a", expectedRevision: 7 });
    const consumed = await queue.restorePending();
    return { version: store.database.version, central, legacy, entries, consumed };
  }, { user: USER, courseId, centralKey, legacyKeys });
  expect(result.version).toBe(4);
  expect(pendings.some(pending => JSON.stringify(pending) === JSON.stringify(result.central))).toBe(true);
  expect(Object.values(result.legacy)).toEqual([null, null, null]);
  expect(result.entries).toHaveLength(2);
  for (const entry of result.entries) {
    expect(entry.command).toBeNull();
    expect(entry.sourceCourseId).toBe(courseId);
    expect(legacyKeys).toContain(entry.snapshot.key);
    expect(JSON.parse(entry.exported)).toEqual(entry.snapshot);
  }
  const preserved = [result.central, ...result.entries.map(entry => entry.snapshot.value)];
  expect(preserved.map(value => value.command.annotationId).sort())
    .toEqual(pendings.map(value => value.command.annotationId).sort());
  expect(result.consumed).toEqual(result.central);
});
