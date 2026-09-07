import { expect, test } from "@playwright/test";

const databaseName = "aralearn-course-v1-visitor";
const preserved = [
  { key: "kept:offline-work", value: { useful: "Trabalho local sintético", revision: 7 } },
  { key: "course.v1.study-draft-recoveries", value: {
    contract: "aralearn.study-draft-recoveries.v1",
    entries: [{ recoveryId: "draft-1", sourceCourseId: null, requestId: null,
      command: null, originalSnapshot: { useful: "Rascunho integral sintético" } }]
  } }
];
const emptyPage = { contract: "aralearn.course-list.v2", items: [], hasMore: false, nextCursor: null };
const listRoute = "**/rest/v1/rpc/list_courses_v1";

test.beforeEach(async ({ page }) => {
  await page.route("**/__startup_seed", route => route.fulfill({
    contentType: "text/html", body: "<!doctype html><title>Dados sintéticos de abertura</title>"
  }));
  await page.goto("/__startup_seed");
  await page.evaluate(async ({ name, rows }) => {
    await new Promise((resolve, reject) => {
      const request = indexedDB.open(name, 2);
      request.onupgradeneeded = () => request.result.createObjectStore("course_cache", { keyPath: "key" });
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const transaction = request.result.transaction("course_cache", "readwrite");
        for (const row of rows) transaction.objectStore("course_cache").put(row);
        transaction.oncomplete = () => { request.result.close(); resolve(); };
        transaction.onabort = () => reject(transaction.error);
      };
    });
  }, { name: databaseName, rows: preserved });
  await page.addInitScript(() => {
    globalThis.startupRecoveryProbe = { onlineEvents: 0, deletedDatabases: [], clearedStores: [] };
    addEventListener("online", () => { globalThis.startupRecoveryProbe.onlineEvents += 1; });
    const remove = IDBFactory.prototype.deleteDatabase;
    IDBFactory.prototype.deleteDatabase = function (name) {
      globalThis.startupRecoveryProbe.deletedDatabases.push(name);
      return remove.call(this, name);
    };
    const clear = IDBObjectStore.prototype.clear;
    IDBObjectStore.prototype.clear = function () {
      globalThis.startupRecoveryProbe.clearedStores.push(this.name);
      return clear.call(this);
    };
  });
});

async function expectPreserved(page) {
  expect(await page.evaluate(async ({ name, keys }) => {
    const rows = await new Promise((resolve, reject) => {
      const request = indexedDB.open(name);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const read = request.result.transaction("course_cache").objectStore("course_cache").getAll();
        read.onsuccess = () => { request.result.close(); resolve(read.result); };
        read.onerror = () => reject(read.error);
      };
    });
    return rows.filter(row => keys.includes(row.key)).sort((a, b) => a.key.localeCompare(b.key));
  }, { name: databaseName, keys: preserved.map(row => row.key) }))
    .toEqual([...preserved].sort((a, b) => a.key.localeCompare(b.key)));
  expect(await page.evaluate(() => globalThis.startupRecoveryProbe))
    .toEqual({ onlineEvents: 0, deletedDatabases: [], clearedStores: [] });
}

test("#335 abertura integral: 503 oferece retomada sem limpeza e recupera pelo botão sem evento online", async ({ page }) => {
  let calls = 0;
  let available = false;
  await page.route(listRoute, route => {
    calls += 1;
    return route.fulfill({ status: available ? 200 : 503, contentType: "application/json",
      body: JSON.stringify(available ? emptyPage : { code: "SERVICE_UNAVAILABLE", message: "Não foi possível abrir a sessão local. private backend context" }) });
  });
  await page.goto("/");
  await expect(page.locator(".startup-recovery-message")).toContainText("serviço de cursos");
  await expect(page.locator("[data-action='reset-local-state']")).toHaveCount(0);
  await expect(page.locator("body")).not.toContainText("private backend context");
  expect(calls).toBe(2);
  expect(await page.evaluate(() => navigator.onLine)).toBe(true);
  await expectPreserved(page);
  available = true;
  await page.getByRole("button", { name: "Tentar novamente", exact: true }).click();
  await expect(page.locator("#aralearn-editor-root")).toBeVisible();
  await expect(page.locator(".startup-recovery-shell")).toHaveCount(0);
  expect(calls).toBe(3);
  await expectPreserved(page);
});

test("#335 abertura integral: timeout usa os dois prazos reais do transporte e mantém dados locais", async ({ page }) => {
  test.setTimeout(45_000);
  const requests = [];
  await page.route(listRoute, () => { requests.push(Date.now()); });
  await page.goto("/");
  await expect(page.locator(".startup-recovery-message")).toContainText("demorou", { timeout: 38_000 });
  expect(requests).toHaveLength(2);
  expect(requests[1] - requests[0]).toBeGreaterThanOrEqual(15_000);
  expect(Date.now() - requests[0]).toBeGreaterThanOrEqual(30_000);
  expect(Date.now() - requests[0]).toBeLessThan(38_000);
  await expect(page.locator("[data-action='reset-local-state']")).toHaveCount(0);
  expect(await page.evaluate(() => navigator.onLine)).toBe(true);
  await expectPreserved(page);
});

test("#335 abertura integral: sinal offline e falha de fetch têm saída própria sem limpeza", async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(navigator, "onLine", { get: () => false }));
  let calls = 0;
  await page.route(listRoute, route => { calls += 1; return route.abort("internetdisconnected"); });
  await page.goto("/");
  await expect(page.locator(".startup-recovery-message")).toContainText("offline");
  await expect(page.locator("[data-action='reset-local-state']")).toHaveCount(0);
  expect(calls).toBe(1);
  await expectPreserved(page);
});

test("#335 abertura integral: resposta remota inválida oferece retry seguro sem limpeza", async ({ page }) => {
  await page.route(listRoute, route => route.fulfill({ contentType: "application/json",
    body: JSON.stringify({ contract: "invalid.remote.fixture", privateDetail: "Não expor" }) }));
  await page.goto("/");
  await expect(page.locator(".startup-recovery-message")).toContainText("abrir o aplicativo agora");
  await expect(page.locator("[data-action='reset-local-state']")).toHaveCount(0);
  await expect(page.locator("body")).not.toContainText("invalid.remote.fixture");
  await expectPreserved(page);
});

test("#335 abertura integral: causa local mantém recuperação mesmo offline e não expõe detalhes", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "onLine", { get: () => false });
    const open = IDBFactory.prototype.open;
    IDBFactory.prototype.open = function (name, ...args) {
      if (name === "aralearn-auth-v1") throw new Error("private outer context", {
        cause: new DOMException("private local context", "UnknownError")
      });
      return open.call(this, name, ...args);
    };
  });
  await page.goto("/");
  await expect(page.locator(".startup-recovery-message")).toContainText("neste dispositivo");
  await expect(page.locator(".startup-recovery-message")).not.toContainText("offline");
  await expect(page.locator("[data-action='reset-local-state']")).toBeVisible();
  await expect(page.locator("body")).not.toContainText("private local context");
  await expectPreserved(page);
});
