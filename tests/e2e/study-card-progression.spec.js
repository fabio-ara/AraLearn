import { expect, test } from "@playwright/test";

import { contractToRelationalRows } from "../../src/persistence/contractToRelationalRows.js";
import { createExampleProjectDocument } from "../support/exampleProjectDocument.js";

const USER_ID = "77777777-7777-4777-8777-777777777777";
const PROJECT_URL = process.env.ARALEARN_SUPABASE_URL || "https://project.supabase.test";
const PROJECT_KEY = process.env.ARALEARN_SUPABASE_PUBLISHABLE_KEY || "sb_publishable_e2e";

function accessToken() {
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ sub: USER_ID, email: "pessoa@example.com", exp: 4_102_444_800 })}.assinatura`;
}

function remoteChanges() {
  const rows = contractToRelationalRows(createExampleProjectDocument());
  return Object.entries(rows).flatMap(([storeName, entries]) => entries.map((row) => ({
    storeName,
    entityId: row.id,
    courseId: row.courseId || null,
    operation: "upsert",
    revision: row.revision,
    row
  })));
}

async function mockSupabase(page, { catalog = [] } = {}) {
  const changes = remoteChanges();
  await page.addInitScript((config) => {
    globalThis.__ARALEARN_ENV__ = Object.freeze(config);
  }, {
    supabaseUrl: PROJECT_URL,
    supabasePublishableKey: PROJECT_KEY
  });
  await page.route(`${PROJECT_URL}/**`, async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    if (pathname === "/auth/v1/token") {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          access_token: accessToken(),
          refresh_token: "refresh-e2e",
          expires_in: 3600,
          user: { id: USER_ID, email: "pessoa@example.com" }
        })
      });
      return;
    }
    if (pathname.endsWith("/rpc/pull_sync_changes")) {
      const body = request.postDataJSON();
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify(body.p_after_sequence === 0
          ? { changes, nextCursor: 1, hasMore: false }
          : { changes: [], nextCursor: 1, hasMore: false })
      });
      return;
    }
    if (pathname.endsWith("/rpc/bootstrap_replica")) {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ snapshot: contractToRelationalRows(createExampleProjectDocument()), highWaterSequence: 1 })
      });
      return;
    }
    if (pathname.endsWith("/rpc/apply_sync_batch")) {
      const body = request.postDataJSON();
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          results: (body.p_mutations || []).map((mutation) => ({ mutationId: mutation.mutationId, status: "accepted" }))
        })
      });
      return;
    }
    if (pathname.endsWith("/rpc/list_catalog_courses")) {
      await route.fulfill({ contentType: "application/json", body: JSON.stringify(catalog) });
      return;
    }
    if (pathname.endsWith("/rpc/list_user_course_summaries")) {
      await route.fulfill({ contentType: "application/json", body: "[]" });
      return;
    }
    await route.fulfill({ status: 404, contentType: "application/json", body: '{"message":"RPC não simulada"}' });
  });
}

async function signIn(page, options = {}) {
  await mockSupabase(page, options);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Entre no AraLearn" })).toBeVisible();
  await page.locator('input[name="email"]').fill("pessoa@example.com");
  await page.locator('input[name="password"]').fill("senha-segura");
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.locator('[data-action="open-course"]')).toHaveCount(1, { timeout: 20_000 });
}

test("o runtime local serve módulos JavaScript com o tipo correto", async ({ request }) => {
  const response = await request.get("/node_modules/pdfjs-dist/build/pdf.mjs");
  expect(response.ok()).toBe(true);
  expect(response.headers()["content-type"]).toContain("text/javascript");
});

test("sem sessão o artefato mostra somente a porta de autenticação", async ({ page }) => {
  await mockSupabase(page);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Entre no AraLearn" })).toBeVisible();
  await expect(page.locator('[data-action="open-course"]')).toHaveCount(0);
  await expect(page.locator("text=Biblioteca AraLearn")).toHaveCount(0);
});

test("a primeira sincronização monta um curso relacional sem catálogo embarcado", async ({ page }) => {
  await signIn(page);
  const course = page.locator('[data-action="open-course"]');
  await expect(course).toHaveAttribute("data-course-key", "course-matematica-para-informatica");
  await expect(page.getByText("Matemática para Informática", { exact: true }).first()).toBeVisible();
});

test("concluir um card cria somente mutações granulares de progresso", async ({ page }) => {
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await signIn(page);
  await page.locator('[data-action="open-course"]').tap();
  await page.locator('[data-action="open-module"][data-module-key="module-teoria-dos-grafos"]').tap();
  await page.locator('[data-action="open-lesson"][data-lesson-key="lesson-vocabulario-contagem"]').tap();
  await page.locator('[data-action="play-microsequence"][data-microsequence-key="micro-grafo-como-conjuntos"]').tap();

  await expect(page.locator(".runtime-card-title")).toHaveText("Grafo como dois conjuntos");
  await page.locator('[data-action="next-card"]').tap();
  await page.locator('[data-action="continue-popup-next"]').tap();
  await expect(page.locator(".runtime-card-title")).toHaveText("Um grafo pequeno");

  const outbox = await page.evaluate(async (userId) => {
    const request = indexedDB.open(`aralearn-relational-v1:user:${userId}`);
    const database = await new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const transaction = database.transaction("outbox", "readonly");
    const rowsRequest = transaction.objectStore("outbox").getAll();
    const rows = await new Promise((resolve, reject) => {
      rowsRequest.onsuccess = () => resolve(rowsRequest.result);
      rowsRequest.onerror = () => reject(rowsRequest.error);
    });
    database.close();
    return rows;
  }, USER_ID);
  expect(outbox.length).toBeGreaterThan(0);
  expect(new Set(outbox.map((entry) => entry.entityType))).toEqual(new Set(["lessonProgress", "cardProgress"]));
  expect(outbox.every((entry) => !entry.payload?.courses && !entry.payload?.lessons)).toBe(true);
  expect(pageErrors).toEqual([]);
});

test("a biblioteca consulta somente metadados remotos", async ({ page }) => {
  await signIn(page, {
    catalog: [{
      course_id: "99999999-9999-4999-8999-999999999999",
      title: "Curso oficial remoto",
      goal: "Metadados sem árvore didática"
    }]
  });
  await page.getByRole("button", { name: "Abrir biblioteca de cursos" }).click();
  await expect(page.getByRole("heading", { name: "Biblioteca AraLearn" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Curso oficial remoto" })).toBeVisible();
  await expect(page.getByText("Metadados sem árvore didática")).toBeVisible();
});

test("depois da primeira sincronização o curso reabre offline pela réplica", async ({ page, context }) => {
  await signIn(page);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.unroute(`${PROJECT_URL}/**`);
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator('[data-action="open-course"]')).toHaveCount(1, { timeout: 15_000 });
  await expect(page.getByText("Modo offline: alterações pendentes serão sincronizadas quando a conexão voltar.")).toBeVisible();
  await context.setOffline(false);
});

test("sair em uma aba fecha imediatamente o documento nas demais abas", async ({ page, context }) => {
  await signIn(page);
  const secondPage = await context.newPage();
  await mockSupabase(secondPage);
  await secondPage.goto("/");
  await expect(secondPage.locator('[data-action="open-course"]')).toHaveCount(1, { timeout: 15_000 });

  await page.getByRole("button", { name: "Abrir biblioteca de cursos" }).click();
  await page.getByRole("button", { name: "Sair da conta" }).click();

  await expect(secondPage.getByRole("heading", { name: "Sessão encerrada" })).toBeVisible();
  await expect(secondPage.getByRole("heading", { name: "Entre no AraLearn" })).toBeVisible({ timeout: 15_000 });
  await expect(secondPage.locator('[data-action="open-course"]')).toHaveCount(0);
});
