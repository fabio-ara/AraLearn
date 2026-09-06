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
    rows: await globalThis.draftUpgrade334.store.readCachePrefix("course.v1") }))).toEqual({ version: 2,
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
    const before = await new Promise((resolve, reject) => {
      const request = indexedDB.open(name, 1);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const rows = request.result.transaction("course_cache").objectStore("course_cache").getAll();
        rows.onsuccess = () => { request.result.close(); resolve(rows.result); };
      };
    });
    const store = await CourseLocalStore.open(indexedDB, { userId: user });
    globalThis.draftUpgrade334 = { store };
    return { errorMessage, before, after: await store.getCache(STUDY_DRAFT_RECOVERY_CACHE_KEY), version: store.database.version };
  }, { user: USER, name: DATABASE });
  expect(result.errorMessage).toContain("preservados");
  expect(result.before).toHaveLength(3);
  expect(result.after.entries.map(entry => entry.originalSnapshot)).toEqual(snapshots);
  expect(result.version).toBe(2);
});
