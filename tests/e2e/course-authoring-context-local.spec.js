import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { CourseApiClient } from "../../src/supabase/CourseApiClient.js";
import { flattenCourseDocument } from "../../src/domain/courseEntities.js";
import { createEmptyCourseSourceBibliographicMetadata } from "../../src/domain/courseSources.js";

const PROJECT_URL = String(process.env.ARALEARN_SUPABASE_URL || "").replace(/\/+$/u, "");
const PUBLIC_KEY = process.env.ARALEARN_SUPABASE_PUBLISHABLE_KEY;
const ADMIN_KEY = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const PASSWORD = "Synthetic-context-304-A9!";
const UNIT_ID = "card-fixture-minimal-regra";
async function auth(path, body, { admin = false, method = "POST" } = {}) {
  const result = await fetch(`${PROJECT_URL}/auth/v1/${path}`, { method,
    headers: { apikey: admin ? ADMIN_KEY : PUBLIC_KEY, "Content-Type": "application/json",
      ...(admin ? { Authorization: `Bearer ${ADMIN_KEY}` } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  expect(result.ok, `Auth local: ${result.status}`).toBe(true);
  return result.status === 204 ? null : result.json();
}

async function verifySheetGeometry(page, dialog, name, info) {
  const colors = [];
  for (const width of [360, 390, 430, 1280]) for (const mode of ["light", "dark"]) {
    await page.setViewportSize({ width, height: 844 });
    await page.evaluate(value => { document.documentElement.dataset.colorMode = value; }, mode);
    const box = await dialog.boundingBox();
    expect(box.x).toBeGreaterThanOrEqual(-1); expect(box.y).toBeGreaterThanOrEqual(-1);
    expect(box.x + box.width).toBeLessThanOrEqual(width + 1);
    expect(box.y + box.height).toBeLessThanOrEqual(845);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    colors.push(await dialog.evaluate(node => getComputedStyle(node).color));
    await page.screenshot({ path: info.outputPath(`${name}-${width}-${mode}.png`), fullPage: true });
  }
  expect(colors[0]).not.toBe(colors[1]);
  for (const key of ["Shift+Tab", ...Array(24).fill("Tab")]) {
    await page.keyboard.press(key);
    expect(await dialog.evaluate(node => node.contains(document.activeElement))).toBe(true);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => { document.documentElement.dataset.colorMode = "light"; });
}

test.describe("folhas contextuais com curso local real", () => {
  test.skip(process.env.ARALEARN_E2E_REAL_SUPABASE !== "1", "Exige stack local explícita.");
  test.setTimeout(120000);
  test("fontes e parâmetros conservam edição e reconciliam a revisão antes de salvar", async ({ browser }, info) => {
    expect(PROJECT_URL).toMatch(/^http:\/\/(?:127\.0\.0\.1|localhost):\d+$/u);
    const email = `context304-${Date.now()}-${process.pid}@aralearn.local`;
    let user, client, courseId, context;
    try {
      user = await auth("admin/users", { email, password: PASSWORD, email_confirm: true,
        user_metadata: { test: "course-authoring-context-local-304" } }, { admin: true });
      const session = await auth("token?grant_type=password", { email, password: PASSWORD });
      client = new CourseApiClient({ projectUrl: PROJECT_URL, publishableKey: PUBLIC_KEY,
        authClient: { getAccessToken: async () => session.access_token } });
      await client.updatePersonProfile({ handle: `context-${user.id.slice(0, 8)}` });
      courseId = (await client.createCourse({ title: "Contexto de autoria — ensaio sintético",
        objective: "Conferir a preservação de edição durante consulta contextual.", requestId: crypto.randomUUID() })).courseId;
      const revision = async () => (await client.getCourse(courseId)).revision;
      const fixture = JSON.parse(await readFile(new URL("../fixtures/package/project-minimal.json", import.meta.url), "utf8"));
      fixture.courses[0].id = courseId;
      const units = fixture.courses[0].modules[0].lessons[0].microsequences[0].studyUnits;
      units[0].content[0].data.text = Array.from({ length: 10 }, (_, index) => `Trecho ${index + 1}: a conjunção exige que as duas proposições sejam verdadeiras. Esta sequência sintética permite verificar o retorno ao trecho em edição.`).join("\n\n");
      await client.requestCourseApi(`/v1/courses/${courseId}/composition`, { method: "POST", body: {
        expectedRevision: await revision(), requestId: crypto.randomUUID(), upserts: flattenCourseDocument(fixture).rows,
        deletes: [], sourceAttributionApplications: units.map(unit => ({ studyUnitId: unit.id, sourceLinks: [] })) } });
      await client.mutateCourseSources({ courseId, expectedRevision: await revision(), requestId: crypto.randomUUID(), sourceCommand: {
        type: "save_source", sourceId: "fonte-contextual-sintetica", expectedSourceRevision: 0, source: {
          kind: "internal_document", title: "Documento de consulta sintético", defaultRoles: [], authors: [], publicationDate: null,
          identifier: null, language: "pt-BR", citationMode: "manual", citationText: null,
          bibliographic: createEmptyCourseSourceBibliographicMetadata(), url: null, editionOrVersion: null,
          origin: "author_provided", availability: "unknown", verificationStatus: "unverified", studyVisibility: "hidden"
        } } });
      context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: "block", permissions: ["local-network-access"] });
      const page = await context.newPage(); page.setDefaultTimeout(15000);
      const errors = []; page.on("pageerror", error => errors.push(error.message));
      const origin = `http://127.0.0.1:${process.env.ARALEARN_E2E_PORT || "4182"}`;
      await page.route(url => url.origin === origin && url.pathname === "/", async route => {
        const response = await route.fetch();
        await route.fulfill({ response, body: (await response.text()).replace("connect-src 'self' ", `connect-src 'self' ${PROJECT_URL} `) });
      });
      await page.route("**/runtime-config.js", route => route.fulfill({ contentType: "text/javascript", body:
        `globalThis.__ARALEARN_ENV__=Object.freeze(${JSON.stringify({ supabaseUrl: PROJECT_URL, supabasePublishableKey: PUBLIC_KEY, developmentRuntime: true })});` }));
      await page.goto("/?acesso=entrar");
      await page.getByLabel("E-mail").fill(email); await page.getByLabel("Senha", { exact: true }).fill(PASSWORD);
      await page.getByRole("button", { name: "Entrar", exact: true }).click();
      await expect(page.getByRole("button", { name: "Conta e aparência" })).toBeVisible();
      const route = `/#/authoring/courses/${courseId}?section=content&studyUnitId=${UNIT_ID}`;
      await page.goto(route);
      await page.getByRole("button", { name: "Editar", exact: true }).click();
      const title = page.getByRole("textbox", { name: "Título da unidade de estudo" });
      await title.fill("Rascunho contextual preservado");
      const sources = page.locator("[data-inspection-edit-sources]");
      await sources.click();
      const sourceDialog = page.getByRole("dialog");
      await expect(sourceDialog).toBeVisible();
      await expect(page.locator(".course-authoring-layout")).toHaveAttribute("inert", "");
      await sourceDialog.getByRole("button", { name: "Vincular fonte: Documento de consulta sintético", exact: true }).click();
      await verifySheetGeometry(page, sourceDialog, "sources-context", info);
      await sourceDialog.locator('[data-source-action="open-source"]').click();
      await expect(sourceDialog.getByRole("heading", { name: "Documento de consulta sintético", exact: true })).toBeVisible();
      await sourceDialog.getByRole("button", { name: "Voltar ao catálogo" }).click();
      await sourceDialog.getByRole("button", { name: "Salvar fontes", exact: true }).click();
      await expect(sourceDialog).toHaveCount(0);
      await expect(title).toHaveText("Rascunho contextual preservado");
      await expect(sources).toBeFocused();
      const afterSource = await revision();
      const parameters = page.locator("[data-inspection-open-parameters]");
      await parameters.click();
      const dialog = page.getByRole("dialog", { name: "Parâmetros", exact: true });
      await expect(dialog).toBeVisible();
      await expect(dialog.locator('[data-parameter-id="study_unit_content_word_target"]')).toBeVisible();
      await verifySheetGeometry(page, dialog, "parameters-context", info);
      const parameter = dialog.locator('[data-parameter-id="study_unit_content_word_target"]');
      await parameter.locator("summary").click();
      await parameter.locator('[name="mode"]').selectOption("fixed");
      await parameter.locator('[name="parameterValue"]').fill("320");
      await parameter.getByLabel("Justificativa").fill("Ajuste sintético para conferir a conciliação do contexto.");
      await parameter.getByRole("button", { name: "Salvar neste escopo" }).click();
      await expect.poll(revision).toBe(afterSource + 1);
      await expect(dialog.getByRole("button", { name: "Fechar parâmetros" })).toBeEnabled();
      await page.screenshot({ path: info.outputPath("parameters-context-390.png"), fullPage: true });
      await dialog.getByRole("button", { name: "Fechar parâmetros" }).click();
      await expect(dialog).toHaveCount(0);
      await expect(title).toHaveText("Rascunho contextual preservado");
      await expect(parameters).toBeFocused();
      expect(new URL(page.url()).hash).toBe(route.slice(1));
      await expect(page.locator(".course-authoring-layout")).not.toHaveAttribute("inert", "");
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
      await page.getByRole("button", { name: "Salvar edição", exact: true }).click();
      await expect(title).toHaveCount(0);
      await expect(page.getByRole("heading", { name: "Rascunho contextual preservado", exact: true })).toBeVisible();
      expect(await revision()).toBe(afterSource + 2);
      await page.reload();
      await expect(page.getByRole("heading", { name: "Rascunho contextual preservado", exact: true })).toBeVisible();
      expect(errors).toEqual([]);
      await page.screenshot({ path: info.outputPath("context-return-390.png"), fullPage: true });
    } finally {
      await context?.close().catch(() => {});
      if (courseId) {
        const removed = await client.maintainCourse({ courseId, operation: "delete_owned_course", confirmed: true, requestId: crypto.randomUUID() });
        expect(removed.fileCleanupPending).toBe(false);
      }
      if (user) await auth(`admin/users/${user.id}`, undefined, { admin: true, method: "DELETE" });
    }
  });
});
