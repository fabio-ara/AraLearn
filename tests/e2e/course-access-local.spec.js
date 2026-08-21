import { expect, test } from "@playwright/test";
import { spawnSync } from "node:child_process";

import { flattenCourseDocument } from "../../src/domain/courseEntities.js";

const ENABLED = process.env.ARALEARN_E2E_REAL_SUPABASE === "1";
const PROJECT_URL = String(process.env.ARALEARN_SUPABASE_URL || "").replace(/\/+$/u, "");
const PUBLISHABLE_KEY = String(process.env.ARALEARN_SUPABASE_PUBLISHABLE_KEY || "").trim();
const ADMIN_KEY = String(
  process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || ""
).trim();
const APPLICATION_ORIGIN = "http://127.0.0.1:4182";
const COURSE_TITLE = "Curso privado da jornada de acesso";
const PASSWORD = "AraLearn-access-local-A9!";
const PNG_1PX = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64"
);

let owner = null;
let learner = null;
let outsider = null;
let ownerToken = "";
let learnerToken = "";
let outsiderToken = "";
let courseId = "";
let ownerAvatarObjectKey = "";

function headers(token, { json = true } = {}) {
  return {
    apikey: token === ADMIN_KEY ? ADMIN_KEY : PUBLISHABLE_KEY,
    Authorization: `Bearer ${token}`,
    ...(json ? { "Content-Type": "application/json" } : {})
  };
}

async function responsePayload(response) {
  const source = await response.text();
  if (!source) return null;
  try {
    return JSON.parse(source);
  } catch {
    return source;
  }
}

async function request(path, {
  method = "GET",
  token = PUBLISHABLE_KEY,
  body,
  origin = null
} = {}) {
  const requestHeaders = headers(token, { json: body !== undefined });
  if (origin) requestHeaders.Origin = origin;
  const response = await fetch(`${PROJECT_URL}${path}`, {
    method,
    headers: requestHeaders,
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  return { response, payload: await responsePayload(response) };
}

function failure(label, result) {
  return `${label}: HTTP ${result.response.status}: ${JSON.stringify(result.payload)}`;
}

async function createUser(email) {
  const result = await request("/auth/v1/admin/users", {
    method: "POST",
    token: ADMIN_KEY,
    body: {
      email,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { test: "course-access-local-e2e" }
    }
  });
  expect(result.response.status, failure("criar usuário local", result)).toBe(200);
  return result.payload;
}

async function removeUser(userId) {
  if (!userId) return;
  const result = await request(`/auth/v1/admin/users/${encodeURIComponent(userId)}`, {
    method: "DELETE",
    token: ADMIN_KEY
  });
  expect([200, 204, 404], failure("remover usuário local", result))
    .toContain(result.response.status);
}

async function signIn(email) {
  const result = await request("/auth/v1/token?grant_type=password", {
    method: "POST",
    body: { email, password: PASSWORD }
  });
  expect(result.response.status, failure("autenticar usuário local", result)).toBe(200);
  expect(String(result.payload?.access_token || "")).toMatch(/^[^.]+\.[^.]+\.[^.]+$/u);
  return result.payload.access_token;
}

async function courseAction(name, body, token) {
  const result = await request(
    `/functions/v1/aralearn-course-api/app/${encodeURIComponent(name)}`,
    { method: "POST", token, body, origin: APPLICATION_ORIGIN }
  );
  expect(result.response.status, failure(`Course API/${name}`, result)).toBe(200);
  return result.payload;
}

async function rpc(name, body, token) {
  return request(`/rest/v1/rpc/${name}`, { method: "POST", token, body });
}

function courseRows(id) {
  return flattenCourseDocument({
    contract: "aralearn.course.v1",
    courses: [{
      id,
      title: COURSE_TITLE,
      goal: "Praticar uma Unidade sem ampliar o acesso do Curso.",
      modules: [{
        id: "module-access-local",
        title: "Módulo da jornada",
        guide: {
          goal: "Percorrer o conteúdo compartilhado.",
          include: ["acesso direto"],
          exclude: [],
          notation: [],
          avoid: []
        },
        lessons: [{
          id: "lesson-access-local",
          title: "Lição da jornada",
          guide: {
            goal: "Confirmar o acesso ao Estudo.",
            include: ["prática"],
            exclude: [],
            notation: [],
            avoid: []
          },
          topics: [],
          microsequences: [{
            id: "microsequence-access-local",
            title: "Microssequência compartilhada",
            goal: "Ler, registrar uma observação e avançar.",
            role: "explain",
            dependsOn: [],
            covers: [],
            checks: [],
            errors: [],
            studyUnits: [{
              id: "study-unit-access-local-1",
              position: 1,
              title: "Primeira Unidade compartilhada",
              role: "theory",
              content: [{
                id: "content-access-local-1",
                package: "aralearn.resource.paragraph",
                version: "1.0.0",
                data: { text: "Conteúdo privado liberado somente para a pessoa escolhida." }
              }],
              response: null,
              feedback: [],
              topics: []
            }, {
              id: "study-unit-access-local-2",
              position: 2,
              title: "Segunda Unidade compartilhada",
              role: "theory",
              content: [{
                id: "content-access-local-2",
                package: "aralearn.resource.paragraph",
                version: "1.0.0",
                data: { text: "O avanço confirma a prática e o estado pessoal do estudante." }
              }],
              response: null,
              feedback: [],
              topics: []
            }]
          }]
        }]
      }]
    }]
  }).rows;
}

function databaseEvidence() {
  expect(courseId).toMatch(/^[0-9a-f-]{36}$/u);
  expect(learner?.id).toMatch(/^[0-9a-f-]{36}$/u);
  const sql = `
    select json_build_object(
      'accessCount', (select count(*)::integer from public.course_access
        where course_id='${courseId}'::uuid and user_id='${learner.id}'::uuid),
      'personalCount', (select count(*)::integer from public.course_personal_states
        where course_id='${courseId}'::uuid and user_id='${learner.id}'::uuid),
      'progressPreserved', coalesce((select state::text like '%study-unit-access-local-1%'
        from public.course_personal_states
        where course_id='${courseId}'::uuid and user_id='${learner.id}'::uuid), false),
      'annotationCount', (select count(*)::integer from private.course_anchored_annotations
        where course_id='${courseId}'::uuid and actor_id='${learner.id}'::uuid)
    )::text;
  `;
  const result = spawnSync("docker", [
    "exec", "-i", "supabase_db_aralearn", "psql", "-U", "postgres", "-d", "postgres",
    "--no-psqlrc", "--quiet", "--tuples-only", "--no-align", "--set", "ON_ERROR_STOP=1",
    "--command", sql
  ], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  expect(result.status, result.stderr || "A inspeção do Postgres local falhou.").toBe(0);
  return JSON.parse(result.stdout.trim());
}

function captureBrowserFailures(page) {
  const failures = [];
  const offlineFailures = [];
  let offline = false;
  const record = (message) => (offline ? offlineFailures : failures).push(message);
  page.on("console", (message) => {
    if (message.type() === "error") record(`console: ${message.text()}`);
  });
  page.on("pageerror", (error) => record(`page: ${error.message}`));
  page.on("requestfailed", (requestValue) => {
    record(`network: ${requestValue.method()} ${requestValue.url()} ${requestValue.failure()?.errorText}`);
  });
  page.on("response", (response) => {
    if (response.status() >= 500) record(`http: ${response.status()} ${response.url()}`);
  });
  return {
    failures,
    offlineFailures,
    setOffline(value) {
      offline = value;
    }
  };
}

async function expectNoHorizontalOverflow(page, selector = "body") {
  await expect.poll(() => page.locator(selector).evaluate((element) => ({
    document: document.documentElement.scrollWidth <= window.innerWidth + 1,
    element: element.scrollWidth <= element.clientWidth + 1,
    left: element.getBoundingClientRect().left >= -1,
    right: element.getBoundingClientRect().right <= window.innerWidth + 1
  }))).toEqual({ document: true, element: true, left: true, right: true });
}

async function attachScreenshot(page, testInfo, name) {
  const screenshotPath = testInfo.outputPath(name);
  await page.screenshot({
    path: screenshotPath,
    fullPage: true,
    animations: "disabled"
  });
  await testInfo.attach(name, { path: screenshotPath, contentType: "image/png" });
}

async function browserSignIn(page, email) {
  await page.route(`${APPLICATION_ORIGIN}/`, async (route) => {
    const response = await route.fetch();
    const source = await response.text();
    await route.fulfill({
      response,
      body: source.replace("connect-src 'self' ", `connect-src 'self' ${PROJECT_URL} `)
    });
  });
  await page.route("**/runtime-config.js", (route) => route.fulfill({
    status: 200,
    contentType: "text/javascript",
    body: `globalThis.__ARALEARN_ENV__ = Object.freeze(${JSON.stringify({
      supabaseUrl: PROJECT_URL,
      supabasePublishableKey: PUBLISHABLE_KEY,
      developmentRuntime: true
    })});\n`
  }));
  await page.goto("/");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByRole("button", { name: "Conta e aparência" })).toBeVisible();
}

async function setProfile(page, displayName, { avatar = false } = {}) {
  await page.getByRole("button", { name: "Conta e aparência" }).click();
  await expect(page.locator("[data-profile-avatar-fallback]")).toBeVisible();
  await expect(page.getByRole("button", { name: "Escolher foto" })).toBeVisible();
  const status = page.locator("[data-settings-status]");
  await expect(status).toHaveText("");
  await page.getByLabel("Nome").fill(displayName);
  if (avatar) {
    await page.locator("[data-profile-avatar-file]").setInputFiles({
      name: "avatar-local.png",
      mimeType: "image/png",
      buffer: PNG_1PX
    });
  }
  await page.getByRole("button", { name: "Salvar perfil" }).click();
  await expect(status).toHaveText("Perfil salvo.");
  if (avatar) {
    const accountAvatar = page.locator("[data-action='open-settings'] .account-control-avatar");
    await expect(accountAvatar).toBeVisible();
    await expect.poll(() => accountAvatar.evaluate((image) =>
      image.complete && image.naturalWidth > 0)).toBe(true);
  } else {
    await expect(page.locator("[data-profile-avatar-image]")).toBeHidden();
  }
  await page.getByRole("button", { name: "Fechar" }).click();
}

async function removeOwnerAvatar() {
  if (!owner?.id) return;
  const listed = await request("/storage/v1/object/list/person-avatars", {
    method: "POST",
    token: ADMIN_KEY,
    body: { prefix: `${owner.id}/`, limit: 100, offset: 0 }
  });
  expect([200, 404], failure("listar avatares locais", listed)).toContain(listed.response.status);
  const prefixes = listed.response.status === 200
    ? listed.payload.map(({ name }) => String(name).startsWith(`${owner.id}/`)
      ? String(name)
      : `${owner.id}/${name}`)
    : [];
  if (ownerAvatarObjectKey && !prefixes.includes(ownerAvatarObjectKey)) {
    prefixes.push(ownerAvatarObjectKey);
  }
  if (!prefixes.length) return;
  const result = await request("/storage/v1/object/person-avatars", {
    method: "DELETE",
    token: ADMIN_KEY,
    body: { prefixes }
  });
  expect([200, 404], failure("remover avatar local", result)).toContain(result.response.status);
}

test.describe("acesso direto de Curso no Supabase local", () => {
  test.skip(!ENABLED, "A jornada real roda somente com a stack Supabase local explícita.");
  test.setTimeout(180_000);

  test.beforeAll(async ({ browserName }, testInfo) => {
    void browserName;
    testInfo.setTimeout(120_000);
    expect(PROJECT_URL).toMatch(/^http:\/\/(?:127\.0\.0\.1|localhost):\d+$/u);
    expect(PUBLISHABLE_KEY).not.toBe("");
    expect(ADMIN_KEY).not.toBe("");
    const suffix = `${Date.now()}-${process.pid}`;
    owner = await createUser(`owner-${suffix}@aralearn.local`);
    learner = await createUser(`learner-${suffix}@aralearn.local`);
    outsider = await createUser(`outsider-${suffix}@aralearn.local`);
    ownerToken = await signIn(owner.email);
    learnerToken = await signIn(learner.email);
    outsiderToken = await signIn(outsider.email);

    const created = await courseAction("criarCurso", {
      requestId: crypto.randomUUID(),
      title: COURSE_TITLE,
      objective: "Praticar uma Unidade sem ampliar o acesso do Curso."
    }, ownerToken);
    courseId = created.data.courseId;
    const composition = await courseAction("alterarCurso", {
      requestId: crypto.randomUUID(),
      courseId,
      expectedRevision: 1,
      operation: "commit_course_composition",
      upserts: courseRows(courseId),
      deletes: [],
      sourceAttributionApplications: [
        "study-unit-access-local-1",
        "study-unit-access-local-2"
      ].map((studyUnitId) => ({ studyUnitId, sourceLinks: [] }))
    }, ownerToken);
    expect(composition.data.revision).toBe(2);
  });

  test.afterAll(async ({ browserName }, testInfo) => {
    void browserName;
    testInfo.setTimeout(60_000);
    await removeOwnerAvatar();
    await removeUser(learner?.id);
    await removeUser(outsider?.id);
    await removeUser(owner?.id);
  });

  test("proprietário concede no celular, estudante pratica e revogação preserva seu estado", async ({
    browser
  }, testInfo) => {
    const ownerContext = await browser.newContext({
      viewport: { width: 390, height: 844 },
      serviceWorkers: "block",
      permissions: ["local-network-access"]
    });
    const learnerContext = await browser.newContext({
      viewport: { width: 390, height: 844 },
      serviceWorkers: "block",
      permissions: ["local-network-access"]
    });
    ownerContext.setDefaultTimeout(10_000);
    learnerContext.setDefaultTimeout(10_000);
    const ownerPage = await ownerContext.newPage();
    const learnerPage = await learnerContext.newPage();
    const ownerFailures = captureBrowserFailures(ownerPage);
    const learnerFailures = captureBrowserFailures(learnerPage);
    await Promise.all([
      ownerPage.emulateMedia({ reducedMotion: "reduce" }),
      learnerPage.emulateMedia({ reducedMotion: "reduce" })
    ]);

    try {
      await Promise.all([
        browserSignIn(ownerPage, owner.email),
        browserSignIn(learnerPage, learner.email)
      ]);

      await expect(ownerPage.getByText(COURSE_TITLE, { exact: true })).toBeVisible();
      await expect(learnerPage.getByText(
        "Nenhum Curso está disponível para estudo nesta conta.",
        { exact: true }
      )).toBeVisible();
      await setProfile(ownerPage, "Pessoa proprietária local", { avatar: true });
      await setProfile(learnerPage, "Pessoa estudante local");
      ownerAvatarObjectKey = (await courseAction("gerirPessoas", {
        operation: "read_profile"
      }, ownerToken)).data.avatarObjectKey;
      expect(ownerAvatarObjectKey).toMatch(new RegExp(`^${owner.id}/[0-9a-f-]{36}\\.png$`, "u"));

      const learnerBeforeGrant = await rpc("list_courses_v1", {
        p_query: null,
        p_limit: 24,
        p_before_updated_at: null,
        p_before_id: null
      }, learnerToken);
      expect(learnerBeforeGrant.response.status, failure("lista privada", learnerBeforeGrant)).toBe(200);
      expect(learnerBeforeGrant.payload.items.some((item) => item.courseId === courseId)).toBe(false);

      const outsiderRead = await rpc("get_course_v1", { p_course_id: courseId }, outsiderToken);
      expect([400, 403, 404], failure("terceiro lê Curso privado", outsiderRead))
        .toContain(outsiderRead.response.status);
      const outsiderMutation = await rpc("mutate_course_personal_state_v2", {
        p_course_id: courseId,
        p_expected_revision: 0,
        p_operations: [{
          kind: "set",
          collection: "reviewMarks",
          path: "study-unit-access-local-1",
          value: "2026-08-20T12:00:00Z"
        }],
        p_request_id: crypto.randomUUID()
      }, outsiderToken);
      expect([400, 403, 404], failure("terceiro altera Curso privado", outsiderMutation))
        .toContain(outsiderMutation.response.status);

      await ownerPage.getByRole("button", { name: "Autoria", exact: true }).click();
      await expect(ownerPage.getByRole("heading", { name: "Meus cursos" })).toBeVisible();
      await ownerPage.getByRole("link", { name: `Abrir ${COURSE_TITLE}` }).click();
      await ownerPage.getByRole("link", { name: "Pessoas" }).click();
      await expect(ownerPage.getByRole("heading", { name: "Pessoas" })).toBeVisible();
      await expect(ownerPage.getByText("Somente você tem acesso.", { exact: true })).toBeVisible();
      await ownerPage.getByRole("button", { name: "Conceder acesso" }).click();
      await ownerPage.getByLabel("E-mail exato").fill(learner.email);
      ownerPage.once("dialog", async (dialog) => {
        expect(dialog.message()).toContain(`Conceder a ${learner.email} acesso`);
        await dialog.accept();
      });
      await ownerPage.locator("[data-course-authoring-grant]")
        .getByRole("button", { name: "Conceder acesso" }).click();
      await expect(ownerPage.getByText("Acesso concedido.", { exact: true })).toBeVisible();
      await expect(ownerPage.getByText("Pessoa estudante local", { exact: true })).toBeVisible();
      await expectNoHorizontalOverflow(ownerPage, ".course-authoring-surface");
      await attachScreenshot(ownerPage, testInfo, "acesso-concedido-390.png");

      await learnerPage.reload();
      const learnerPreview = learnerPage.locator(".home-course-selector-preview");
      await expect(learnerPage.getByRole("combobox", { name: "Selecionar Curso" }))
        .toHaveValue(courseId);
      await expect(learnerPreview).toContainText(COURSE_TITLE);
      await expect(learnerPreview).toContainText("Compartilhado com você");
      await learnerPreview.getByRole("button", { name: `Começar ${COURSE_TITLE}` }).click();
      await expect(learnerPage.getByText(
        "Conteúdo privado liberado somente para a pessoa escolhida.",
        { exact: true }
      )).toBeVisible();
      await expectNoHorizontalOverflow(learnerPage, ".study-reader-screen");

      await learnerPage.getByRole("button", { name: "Observações" }).click();
      await learnerPage.getByText("Dúvida", { exact: true }).click();
      await expect(learnerPage.getByRole("radio", { name: "Dúvida" })).toBeChecked();
      await learnerPage.getByRole("textbox", { name: "Observação", exact: true }).fill(
        "Esta observação pertence ao estudante e deve sobreviver à revogação."
      );
      await learnerPage.getByRole("button", { name: "Adicionar" }).click();
      await expect(learnerPage.getByText("Sincronizada", { exact: true })).toBeVisible();
      await learnerPage.getByRole("button", { name: "Fechar" }).click();
      await learnerPage.getByRole("button", { name: "Continuar" }).click();
      await expect(learnerPage.getByText(
        "O avanço confirma a prática e o estado pessoal do estudante.",
        { exact: true }
      )).toBeVisible();
      await learnerPage.waitForLoadState("networkidle");
      await attachScreenshot(learnerPage, testInfo, "estudo-compartilhado-390.png");

      learnerFailures.setOffline(true);
      await learnerContext.setOffline(true);
      await expect(learnerPage.getByText(COURSE_TITLE, { exact: true })).toBeVisible();
      await expect(learnerPage.getByText(
        "Sem conexão · alterações pessoais ficam salvas neste dispositivo.",
        { exact: true }
      )).toBeVisible();
      await learnerContext.setOffline(false);
      learnerFailures.setOffline(false);
      await learnerPage.reload();

      await expect.poll(databaseEvidence).toEqual({
        accessCount: 1,
        personalCount: 1,
        progressPreserved: true,
        annotationCount: 1
      });

      await ownerPage.setViewportSize({ width: 1280, height: 900 });
      await expectNoHorizontalOverflow(ownerPage, ".course-authoring-surface");
      await attachScreenshot(ownerPage, testInfo, "pessoas-1280.png");
      ownerPage.once("dialog", async (dialog) => {
        expect(dialog.message()).toContain("O estado pessoal de Estudo será preservado.");
        await dialog.accept();
      });
      await ownerPage.getByRole("button", {
        name: "Revogar acesso de Pessoa estudante local"
      }).click();
      await expect(ownerPage.getByText(
        "Acesso revogado; o estado pessoal foi preservado.",
        { exact: true }
      )).toBeVisible();
      await expect(ownerPage.getByText("Pessoa estudante local", { exact: true })).toHaveCount(0);

      const learnerAfterRevoke = await rpc("get_course_v1", { p_course_id: courseId }, learnerToken);
      expect([400, 403, 404], failure("leitura após revogação", learnerAfterRevoke))
        .toContain(learnerAfterRevoke.response.status);
      await expect.poll(databaseEvidence).toEqual({
        accessCount: 0,
        personalCount: 1,
        progressPreserved: true,
        annotationCount: 1
      });

      await learnerPage.reload();
      await expect(learnerPage.getByText(
        "Nenhum Curso está disponível para estudo nesta conta.",
        { exact: true }
      )).toBeVisible();
      await learnerPage.waitForLoadState("networkidle");
      learnerFailures.setOffline(true);
      await learnerContext.setOffline(true);
      await expect(learnerPage.getByText(COURSE_TITLE, { exact: true })).toHaveCount(0);
      await expect(learnerPage.getByText(
        "Nenhum Curso está disponível para estudo nesta conta.",
        { exact: true }
      )).toBeVisible();
      await learnerContext.setOffline(false);
      learnerFailures.setOffline(false);

      expect(ownerFailures.failures).toEqual([]);
      expect(ownerFailures.offlineFailures).toEqual([]);
      expect(learnerFailures.failures).toEqual([]);
      expect(learnerFailures.offlineFailures.every((failureValue) =>
        failureValue.includes("ERR_INTERNET_DISCONNECTED") ||
        failureValue === "console: Failed to load resource: net::ERR_INTERNET_DISCONNECTED"
      )).toBe(true);
    } finally {
      await learnerContext.setOffline(false).catch(() => undefined);
      await Promise.all([
        ownerContext.close().catch(() => undefined),
        learnerContext.close().catch(() => undefined)
      ]);
    }
  });
});
