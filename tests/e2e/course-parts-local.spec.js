import { test, expect } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import { CourseApiClient } from "../../src/supabase/CourseApiClient.js";
import { CourseSupabaseAdapter } from "../../supabase/functions/_shared/aralearn-authoring/courseSupabaseAdapter.js";

const ENABLED = process.env.ARALEARN_E2E_REAL_SUPABASE === "1";
const URL = String(process.env.ARALEARN_SUPABASE_URL || "").replace(/\/+$/u, "");
const PUBLIC_KEY = String(process.env.ARALEARN_SUPABASE_PUBLISHABLE_KEY || "");
const ADMIN_KEY = String(process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "");
const ORIGIN = `http://127.0.0.1:${process.env.ARALEARN_E2E_PORT || "4182"}`;
const PASSWORD = "Synthetic-parts-304-A9!";
async function auth(path, body, { admin = false, method = "POST" } = {}) {
  const response = await fetch(`${URL}/auth/v1/${path}`, { method,
    headers: { apikey: admin ? ADMIN_KEY : PUBLIC_KEY, ...(admin ? { Authorization: `Bearer ${ADMIN_KEY}` } : {}), "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  expect(response.ok, `Auth sintético local: ${response.status}`).toBe(true);
  return response.status === 204 ? null : response.json();
}

test("lotes locais dividem, reordenam e reúnem pela interface preservando o mapa e as unidades", async ({ browser }, info) => {
  test.skip(!ENABLED, "Exige Supabase local explícito e migration304 aplicada.");
  test.setTimeout(180000);
  expect(URL).toMatch(/^http:\/\/(?:127\.0\.0\.1|localhost):\d+$/u);
  expect(PUBLIC_KEY).not.toBe(""); expect(ADMIN_KEY).not.toBe("");
  let user, client, courseId, context, page, primaryError, cleanupError;
  try {
    const email = `parts304-${Date.now()}-${process.pid}@aralearn.local`;
    user = await auth("admin/users", { email, password: PASSWORD, email_confirm: true,
      user_metadata: { test: "course-parts-local-304" } }, { admin: true });
    const session = await auth("token?grant_type=password", { email, password: PASSWORD });
    client = new CourseApiClient({ projectUrl: URL, publishableKey: PUBLIC_KEY, authClient: { getAccessToken: async () => session.access_token } });
    await client.updatePersonProfile({ handle: `parts-${user.id.slice(0, 8)}` });
    courseId = (await client.createCourse({ title: "Lotes sintéticos304", objective: "Reorganizar grupos sem mudar o currículo.", requestId: crypto.randomUUID() })).courseId;
    const adapter = new CourseSupabaseAdapter({ supabaseUrl: URL, serverApiKey: ADMIN_KEY, publishableKey: PUBLIC_KEY, publicAppUrl: ORIGIN,
      fetchImpl: async (url, init) => {
        const response = await fetch(url, init);
        if (!response.ok) await info.attach("fixture-database-error.txt", { body: await response.clone().text(), contentType: "text/plain" });
        return response;
      } });
    const scopeId = crypto.randomUUID();
    const micros = ["Primeiro", "Segundo", "Terceiro", "Quarto"];
    const mapRequest = { principal: { actorId: user.id }, courseId, requestId: crypto.randomUUID(),
      expectedCourseRevision: 1, expectedPlanVersion: 1, approved: false, curricularMap: {
        audience: "Pessoas iniciantes.", prerequisites: [], scopeItems: [{ id: scopeId, position: 0, statement: "Relacionar quatro casos." }],
        modules: [{ moduleId: "parts-module", position: 0, title: "Módulo estável", objective: "Relacionar os casos.",
          lessons: [{ lessonId: "parts-lesson", position: 0, title: "Lição estável", objective: "Percorrer os casos.",
            microsequences: micros.map((title, position) => ({ microsequenceId: `parts-micro-${position}`, position,
              title, objective: `Desenvolver ${title.toLowerCase()} caso.`, dependencyMicrosequenceIds: [], scopeItemIds: [scopeId] })) }] }]
      } };
    const preparedMap = await adapter.saveCourseCurricularMap(mapRequest);
    await adapter.saveCourseCurricularMap({ ...mapRequest, approved: true, requestId: crypto.randomUUID(),
      expectedCourseRevision: preparedMap.courseRevision, expectedPlanVersion: preparedMap.planVersion });
    const revision = async () => (await client.getCourse(courseId)).revision;
    await client.requestCourseApi(`/v1/courses/${courseId}/composition`, { method: "POST", body: {
      expectedRevision: await revision(), requestId: crypto.randomUUID(), deletes: [],
      upserts: micros.map((title, index) => ({ entityType: "study_unit", entityId: `parts-unit-${index}`, parentType: "microsequence", parentId: `parts-micro-${index}`, position: 1,
        content: { title: `Unidade ${title.toLowerCase()}`, role: "theory", content: [{ id: `parts-text-${index}`, package: "aralearn.resource.paragraph", version: "1.0.0", data: { text: `Conteúdo literal do ${title.toLowerCase()} caso.` } }], response: null, feedback: [], topics: [] } })),
      sourceAttributionApplications: micros.map((_, index) => ({ studyUnitId: `parts-unit-${index}`, sourceLinks: [] }))
    } });
    const planning = () => client.loadAuthoringPlan(courseId);
    for (const [title, indices] of [["Lote inicial", [0, 1, 2]], ["Lote final", [3]]]) {
      const current = await planning();
      await client.saveCourseAuthoringPart({ courseId, expectedCourseRevision: current.courseRevision, expectedPlanVersion: current.plan.version,
        requestId: crypto.randomUUID(), part: { partId: null, position: current.plan.parts.length, title, intent: `Intenção de ${title}.`,
          progression: [`Progressão de ${title}.`], microsequences: indices.map((index, position) => ({ microsequenceId: `parts-micro-${index}`, position })) } });
    }
    const before = await planning();
    const entities = async () => (await client.getCourseEntities(courseId, { revision: await revision(), ownerOnly: true, limit: 50 })).items;
    const originalEntities = await entities();
    expect(Array.isArray(originalEntities)).toBe(true); expect(originalEntities.length).toBe(10);
    await writeFile(info.outputPath("fixture-identities.json"), JSON.stringify({ courseId, ownerId: user.id }, null, 2));
    context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: "block", permissions: ["local-network-access"] });
    page = await context.newPage(); page.setDefaultTimeout(15000);
    const errors = []; page.on("pageerror", error => errors.push(error.message));
    await page.route(requestUrl => requestUrl.origin === ORIGIN && requestUrl.pathname === "/", async route => {
      const response = await route.fetch();
      await route.fulfill({ response, body: (await response.text()).replace("connect-src 'self' ", `connect-src 'self' ${URL} `) });
    });
    await page.route("**/runtime-config.js", route => route.fulfill({ status: 200, contentType: "text/javascript",
      body: `globalThis.__ARALEARN_ENV__=Object.freeze(${JSON.stringify({ supabaseUrl: URL, supabasePublishableKey: PUBLIC_KEY, developmentRuntime: true })});` }));
    await page.goto("/?acesso=entrar");
    await page.getByLabel("E-mail").fill(email); await page.getByLabel("Senha", { exact: true }).fill(PASSWORD);
    await page.getByRole("button", { name: "Entrar", exact: true }).click();
    await expect(page.getByRole("button", { name: "Conta e aparência" })).toBeVisible();
    const route = `/#/authoring/courses/${courseId}?section=planning`;
    await page.goto(route);
    const module = page.locator('[data-curriculum-expansion="module:parts-module"]');
    const lesson = page.locator('[data-curriculum-expansion="lesson:parts-lesson"]');
    await module.locator(":scope > summary").click();
    await lesson.locator(":scope > summary").click();
    const microLink = page.locator('[data-curriculum-key="microsequence:parts-micro-1"]');
    await microLink.scrollIntoViewIfNeeded(); await microLink.focus();
    const mapTop = await microLink.evaluate(element => element.getBoundingClientRect().top);
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/didacticMicrosequenceId=parts-micro-1/u);
    await expect(page.locator('[data-course-inspection-host]')).toContainText("Conteúdo literal do segundo caso.");
    await page.locator('[data-course-authoring-action="back"]').click();
    await expect(module).toHaveAttribute("open", ""); await expect(lesson).toHaveAttribute("open", "");
    await expect(microLink).toBeFocused();
    expect(Math.abs(await microLink.evaluate(element => element.getBoundingClientRect().top) - mapTop)).toBeLessThanOrEqual(1);
    await page.screenshot({ path: info.outputPath("map-return-390.png") });
    const open = async () => {
      if (!await page.getByRole("button", { name: "Reorganizar lotes", exact: true }).isVisible()) {
        await page.locator(`a[href="#/authoring/courses/${courseId}?section=planning"]`).first().click();
      }
      await page.getByRole("button", { name: "Reorganizar lotes", exact: true }).click();
      await expect(page.getByRole("dialog", { name: "Reorganizar lotes", exact: true })).toBeVisible(); };
    const panel = page.locator(".course-parts-editor");
    const save = async (count) => { await panel.getByRole("button", { name: "Salvar reorganização", exact: true }).click();
      await expect.poll(async () => (await planning()).plan.parts.length).toBe(count);
      await expect(page.getByRole("dialog", { name: "Reorganizar lotes", exact: true })).toBeHidden(); };
    await open();
    await panel.getByRole("button", { name: "Dividir", exact: true }).click();
    await panel.getByLabel("Dividir depois de").selectOption("1");
    await panel.getByLabel("Título", { exact: true }).fill("Lote intermediário");
    for (const width of [360, 390, 430, 1280]) for (const theme of ["light", "dark"]) {
      await page.setViewportSize({ width, height: 844 });
      await page.evaluate(mode => { document.documentElement.dataset.colorMode = mode; }, theme);
      expect(await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme)).toBe(theme);
      const measurement = await panel.evaluate(element => ({ width: element.clientWidth, scroll: element.scrollWidth,
        background: getComputedStyle(element.querySelector("textarea")).backgroundColor,
        targets: [...element.querySelectorAll("button")].map(item => item.getBoundingClientRect().height) }));
      expect(measurement.scroll - measurement.width).toBeLessThanOrEqual(1);
      expect(measurement.targets.every(value => value >= 44)).toBe(true);
      expect(measurement.background).not.toBe("rgba(0, 0, 0, 0)");
      if (width === 390) await page.screenshot({ path: info.outputPath(`parts-preview-${theme}.png`) });
    }
    await save(3);
    let current = await planning();
    expect(current.plan.parts.map(item => item.title)).toEqual(["Lote inicial", "Lote intermediário", "Lote final"]);
    expect(current.plan.parts[0].microsequences.map(item => item.id)).toEqual(["parts-micro-0"]);
    const middle = current.plan.parts[1].id;
    await open(); await panel.getByLabel("Lote", { exact: true }).selectOption(middle);
    await panel.getByRole("button", { name: "Reordenar", exact: true }).click();
    await panel.getByLabel("Posição", { exact: true }).selectOption("0"); await save(3);
    current = await planning(); expect(current.plan.parts[0].id).toBe(middle);
    await open(); await panel.getByRole("button", { name: "Reunir", exact: true }).click();
    for (const checkbox of await panel.locator('[name="mergePart"]').all()) await checkbox.check();
    await panel.getByLabel("Título", { exact: true }).fill("Lote reunido"); await save(1);
    current = await planning();
    expect(current.plan.parts[0].microsequences.map(item => item.id)).toEqual(["parts-micro-1", "parts-micro-2", "parts-micro-0", "parts-micro-3"]);
    expect(current.plan.curriculum).toEqual(before.plan.curriculum);
    expect(await entities()).toEqual(originalEntities);
    await page.reload(); await expect(page.getByText("Lote reunido", { exact: true }).first()).toBeVisible();
    expect(errors).toEqual([]);
  } catch (error) {
    primaryError = error;
    if (page && !page.isClosed()) {
      await info.attach("ui-failure.html", { body: await page.content(), contentType: "text/html" });
      await page.screenshot({ path: info.outputPath("ui-failure.png") });
    }
  }
  finally {
    await context?.close(); let removed = !courseId;
    if (courseId && client) try {
      const result = await client.maintainCourse({ courseId, operation: "delete_owned_course", confirmed: true, requestId: crypto.randomUUID() });
      expect(result.fileCleanupPending).toBe(false); removed = true;
    } catch (error) { cleanupError = error; }
    if (removed && user) await auth(`admin/users/${user.id}`, undefined, { admin: true, method: "DELETE" });
  }
  if (primaryError) throw primaryError;
  if (cleanupError) throw cleanupError;
});
