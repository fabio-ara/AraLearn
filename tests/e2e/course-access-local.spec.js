import { expect, test } from "@playwright/test";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { CourseApiClient } from "../../src/supabase/CourseApiClient.js";

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
let publicCourseId = "";
let ownerHandle = "";
let learnerHandle = "";

function headers(token, { json = true } = {}) {
  return {
    apikey: token === ADMIN_KEY ? ADMIN_KEY : PUBLISHABLE_KEY,
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
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

async function courseApi(path, { method = "GET", body = undefined } = {}, token) {
  const result = await request(`/functions/v1/aralearn-course-api${path}`, {
    method,
    token,
    ...(body === undefined ? {} : { body }),
    origin: APPLICATION_ORIGIN
  });
  expect(result.response.status, failure(`Course API${path}`, result)).toBe(200);
  return result.payload;
}

async function rpc(name, body, token) {
  return request(`/rest/v1/rpc/${name}`, { method: "POST", token, body });
}

function courseRows(id) {
  const guide = (goal) => ({
    goal,
    include: ["prática"],
    exclude: [],
    notation: [],
    avoid: []
  });
  const studyUnit = (unitId, position, title, text) => ({
    id: unitId,
    position,
    title,
    role: "theory",
    content: [{
      id: `content-${unitId}`,
      package: "aralearn.resource.paragraph",
      version: "1.0.0",
      data: { text }
    }],
    response: null,
    feedback: [],
    topics: []
  });
  const microsequence = (microsequenceId, title, goal, studyUnits) => ({
    id: microsequenceId,
    title,
    goal,
    role: "explain",
    dependsOn: [],
    covers: [],
    checks: [],
    errors: [],
    studyUnits
  });
  const lesson = (lessonId, title, goal, microsequences) => ({
    id: lessonId,
    title,
    guide: guide(goal),
    topics: [],
    microsequences
  });
  const moduleValue = (moduleId, title, goal, lessons) => ({
    id: moduleId,
    title,
    guide: guide(goal),
    lessons
  });
  return flattenCourseDocument({
    contract: "aralearn.course.v1",
    courses: [{
      id,
      title: COURSE_TITLE,
      goal: "Praticar uma Unidade sem ampliar o acesso do Curso.",
      modules: [
        moduleValue("module-access-local", "Módulo da jornada",
          "Percorrer o conteúdo compartilhado.", [
            lesson("lesson-access-local", "Lição da jornada",
              "Confirmar o acesso ao Estudo.", [
                microsequence("microsequence-access-local", "Microssequência compartilhada",
                  "Ler, registrar uma observação e avançar.", [
                    studyUnit("study-unit-access-local-1", 1,
                      "Primeira Unidade compartilhada",
                      "Conteúdo privado liberado somente para a pessoa escolhida."),
                    studyUnit("study-unit-access-local-2", 2,
                      "Segunda Unidade compartilhada",
                      "O avanço confirma a prática e o estado pessoal do estudante.")
                  ]),
                microsequence("microsequence-access-local-alternative",
                  "Microssequência alternativa", "Comprovar a ordem das Microssequências.", [
                    studyUnit("study-unit-access-local-3", 1, "Unidade da Microssequência alternativa",
                      "Conteúdo auxiliar para verificar a composição da Lição.")
                  ])
              ]),
            lesson("lesson-access-local-alternative", "Lição alternativa",
              "Comprovar a ordem das Lições.", [
                microsequence("microsequence-access-local-lesson-alternative",
                  "Microssequência da Lição alternativa", "Manter uma composição válida.", [
                    studyUnit("study-unit-access-local-4", 1, "Unidade da Lição alternativa",
                      "Conteúdo auxiliar para verificar a composição do Módulo.")
                  ])
              ])
          ]),
        moduleValue("module-access-local-alternative", "Módulo alternativo",
          "Comprovar a ordem dos Módulos.", [
            lesson("lesson-access-local-module-alternative", "Lição do Módulo alternativo",
              "Manter uma composição válida.", [
                microsequence("microsequence-access-local-module-alternative",
                  "Microssequência do Módulo alternativo", "Manter uma composição válida.", [
                    studyUnit("study-unit-access-local-5", 1, "Unidade do Módulo alternativo",
                      "Conteúdo auxiliar para verificar a composição do Curso.")
                  ])
              ])
          ])
      ]
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
    const failureText = String(requestValue.failure()?.errorText || "");
    if (failureText.includes("ERR_ABORTED") &&
        requestValue.url().includes("list_courses_v1")) {
      return;
    }
    record(`network: ${requestValue.method()} ${requestValue.url()} ${requestValue.failure()?.errorText}`);
  });
  page.on("response", (response) => {
    if (response.status() >= 500 || response.status() === 403) {
      record(`http: ${response.status()} ${response.url()}`);
    }
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

async function configureBrowser(page) {
  await page.route((url) => url.origin === APPLICATION_ORIGIN && url.pathname === "/", async (route) => {
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
}

async function browserSignIn(page, email) {
  await configureBrowser(page);
  await page.goto("/?acesso=entrar");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.locator("[data-handle-onboarding], [data-action='open-settings']").first().waitFor();
  if (await page.locator("[data-handle-onboarding]").count()) {
    await expect(page.getByRole("heading", { name: "Escolha seu identificador" })).toBeVisible();
    await page.getByLabel("Identificador", { exact: true }).fill(email === owner.email ? ownerHandle : learnerHandle);
    await page.getByRole("button", { name: "Salvar identificador" }).click();
  }
  await expect(page.getByRole("button", { name: "Conta e aparência" })).toBeVisible();
}

async function setProfile(page, handle, { avatar = false } = {}) {
  const settingsTrigger = page.getByRole("button", { name: "Conta e aparência" });
  await settingsTrigger.click();
  const closeSettings = page.getByRole("button", { name: "Fechar" });
  await expect(closeSettings).toBeFocused();
  await expect(page.locator("[data-profile-avatar-fallback]")).toBeVisible();
  const sheetHeight = await page.locator(".account-settings-sheet").evaluate((node) =>
    node.getBoundingClientRect().height);
  await page.getByRole("button", { name: "Abrir Foto do perfil" }).click();
  await expect(page.locator("[data-settings-title]")).toHaveText("Foto do perfil");
  await expect(page.getByRole("button", { name: "Escolher foto" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Remover foto" })).toBeHidden();
  expect(await page.locator(".account-settings-sheet").evaluate((node) =>
    node.getBoundingClientRect().height)).toBeCloseTo(sheetHeight, 0);
  await page.getByRole("button", { name: "Voltar" }).click();
  const dataDisclosure = page.getByRole("button", { name: "Dados e conta" });
  await dataDisclosure.click();
  await expect(page.locator("[data-settings-title]")).toHaveText("Dados e conta");
  expect(await page.locator(".account-settings-sheet").evaluate((node) =>
    node.getBoundingClientRect().height)).toBeCloseTo(sheetHeight, 0);
  for (const name of [
    "Remover dados deste dispositivo",
    "Sair e remover dados deste dispositivo"
  ]) {
    const button = page.getByRole("button", { name, exact: true });
    await expect(button).toBeVisible();
    expect((await button.boundingBox())?.height).toBeGreaterThanOrEqual(44);
  }
  await expect.poll(() => page.locator("[data-settings]").evaluate((overlay) => ({
    overlayFits: overlay.scrollWidth <= overlay.clientWidth + 1,
    documentFits: document.documentElement.scrollWidth <= innerWidth + 1
  }))).toEqual({ overlayFits: true, documentFits: true });
  const status = page.locator("[data-settings-status]");
  await expect(status).toHaveText("");
  await closeSettings.focus();
  await page.keyboard.press("Shift+Tab");
  await expect(page.locator(".account-settings-sheet").getByRole("button", {
    name: "Voltar",
    exact: true
  })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(closeSettings).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.locator("[data-settings-title]")).toHaveText("Conta e aparência");
  await expect(dataDisclosure).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Conta e aparência" })).toBeHidden();
  await expect(settingsTrigger).toBeFocused();
  await settingsTrigger.click();
  await expect(page.getByRole("dialog", { name: "Conta e aparência" })).toBeVisible();
  await expect(status).toHaveText("");
  await page.getByLabel("Identificador público").fill(handle);
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
    await page.getByRole("button", { name: "Abrir Foto do perfil" }).click();
    await page.locator("[data-profile-avatar-file]").setInputFiles({
      name: "avatar-substituta-local.png",
      mimeType: "image/png",
      buffer: PNG_1PX
    });
    await expect(page.getByRole("button", { name: "Remover foto" })).toBeVisible();
    await page.getByRole("button", { name: "Remover foto" }).click();
    await expect(status).toHaveText("Foto não salva retirada.");
    await expect(page.locator("[data-profile-avatar-view-image]")).toBeVisible();
    await page.getByRole("button", { name: "Voltar" }).click();
    await page.getByRole("button", { name: "Salvar perfil" }).click();
    await expect(status).toHaveText("Perfil salvo.");
    await expect(accountAvatar).toBeVisible();
  } else {
    await expect(page.locator("[data-profile-avatar-image]")).toBeHidden();
  }
  let signOutDialogMessage = "";
  await page.getByRole("button", { name: "Dados e conta" }).click();
  page.once("dialog", async (dialog) => {
    signOutDialogMessage = dialog.message();
    await dialog.dismiss();
  });
  await page.getByRole("button", { name: "Sair", exact: true }).click();
  expect(signOutDialogMessage).toBe(
    "Sair desta conta? Cursos e dados já salvos permanecerão neste dispositivo. Alterações ainda abertas e não salvas serão perdidas."
  );
  await expect(page.getByRole("dialog", { name: "Conta e aparência" })).toBeVisible();
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
    ownerHandle = `owner-${owner.id.slice(0, 8)}`;
    learnerHandle = `learner-${learner.id.slice(0, 8)}`;
    ownerToken = await signIn(owner.email);
    learnerToken = await signIn(learner.email);
    outsiderToken = await signIn(outsider.email);

    const created = await courseApi("/v1/courses", {
      method: "POST",
      body: {
        requestId: crypto.randomUUID(),
        title: COURSE_TITLE,
        objective: "Praticar uma Unidade sem ampliar o acesso do Curso."
      }
    }, ownerToken);
    courseId = created.data.courseId;
    const composition = await courseApi(`/v1/courses/${courseId}/composition`, {
      method: "POST",
      body: {
        requestId: crypto.randomUUID(),
        expectedRevision: 1,
        upserts: courseRows(courseId),
        deletes: [],
        sourceAttributionApplications: [
          "study-unit-access-local-1",
          "study-unit-access-local-2",
          "study-unit-access-local-3",
          "study-unit-access-local-4",
          "study-unit-access-local-5"
        ].map((studyUnitId) => ({ studyUnitId, sourceLinks: [] }))
      }
    }, ownerToken);
    expect(composition.data.revision).toBe(2);
  });

  test.afterAll(async ({ browserName }, testInfo) => {
    void browserName;
    testInfo.setTimeout(60_000);
    if (publicCourseId) await courseApi(`/v1/courses/${publicCourseId}`, {
      method: "DELETE", body: { operation: "delete_owned_course", confirmed: true, requestId: crypto.randomUUID() }
    }, ownerToken);
    await removeOwnerAvatar();
    await removeUser(learner?.id);
    await removeUser(outsider?.id);
    await removeUser(owner?.id);
  });

  test("Estudo real percorre a hierarquia, persiste o Curso e mantém a entrada uniforme", async ({
    browser
  }, testInfo) => {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      serviceWorkers: "block",
      permissions: ["local-network-access"]
    });
    context.setDefaultTimeout(15_000);
    const page = await context.newPage();
    const failures = captureBrowserFailures(page);
    const modes = () => page.locator("header .study-mode-actions");
    const revisedTitle = `${COURSE_TITLE} revisado`;
    const firstCardTitle = () => page.locator(".navigation-list article h3").first();
    const moveChild = async (childId, direction) => {
      const moveButton = page.locator(
        "[data-action='move-study-structure-child'][data-child-id='" + childId + "']" +
        "[data-direction='" + direction + "']"
      );
      if (await moveButton.count() === 0) {
        await page.locator(
          "[data-action='select-study-structure-child'][data-child-id='" + childId + "']"
        ).click();
      }
      await moveButton.click();
    };
    const saveStructure = async ({ title, goal, move }) => {
      await modes().getByRole("button", { name: "Editar" }).click();
      await page.locator("[data-study-structure-field='title']").fill(title);
      await page.locator("[data-study-structure-field='goal']").fill(goal);
      if (move) await moveChild(move.childId, move.direction);
      await page.getByRole("button", { name: "Salvar edição" }).click();
      await expect(page.locator("[data-study-destination-heading]")).toHaveText(title);
    };
    const openHierarchy = async (...actions) => {
      await page.locator("[data-action='open-course']").click();
      for (const action of actions) {
        await page.getByRole("button", { name: action }).first().click();
      }
    };
    try {
      await browserSignIn(page, owner.email);
      const homeEntry = page.locator("[data-action='open-course']");
      await expect(homeEntry).toHaveAccessibleName(`Abrir ${COURSE_TITLE}`);
      await homeEntry.click();
      await expect(page.locator("[data-study-destination-heading]")).toHaveText(COURSE_TITLE);
      await expect(modes().getByRole("button", { name: "Visualizar" })).toBeVisible();
      await saveStructure({
        title: revisedTitle,
        goal: "Objetivo persistido pelo Planejamento canônico a partir do Estudo.",
        move: { childId: "module-access-local", direction: "down" }
      });
      await expect(firstCardTitle()).toHaveText("Módulo alternativo");

      await page.reload();
      await expect(page.locator(".home-course-selector-preview")).toContainText(revisedTitle);
      await openHierarchy();
      await expect(firstCardTitle()).toHaveText("Módulo alternativo");
      await saveStructure({
        title: COURSE_TITLE,
        goal: "Praticar uma Unidade sem ampliar o acesso do Curso.",
        move: { childId: "module-access-local", direction: "up" }
      });
      await expect(firstCardTitle()).toHaveText("Módulo da jornada");

      await page.getByRole("button", { name: "Abrir módulo" }).first().click();
      await expect(page.locator("[data-study-destination-heading]")).toHaveText("Módulo da jornada");
      await saveStructure({
        title: "Módulo persistido",
        goal: "Objetivo do Módulo persistido pelo contrato corrente.",
        move: { childId: "lesson-access-local", direction: "down" }
      });
      await expect(firstCardTitle()).toHaveText("Lição alternativa");
      await page.reload();
      await openHierarchy("Abrir módulo");
      await expect(page.locator("[data-study-destination-heading]")).toHaveText("Módulo persistido");
      await expect(firstCardTitle()).toHaveText("Lição alternativa");
      await saveStructure({
        title: "Módulo da jornada",
        goal: "Percorrer o conteúdo compartilhado.",
        move: { childId: "lesson-access-local", direction: "up" }
      });
      await expect(firstCardTitle()).toHaveText("Lição da jornada");

      await page.getByRole("button", { name: "Abrir lição" }).first().click();
      await expect(page.locator("[data-study-destination-heading]")).toHaveText("Lição da jornada");
      await expect(modes().getByRole("button", { name: "Assistência por IA" })).toBeVisible();
      await saveStructure({
        title: "Lição persistida",
        goal: "Objetivo da Lição persistido pelo contrato corrente.",
        move: { childId: "microsequence-access-local", direction: "down" }
      });
      await expect(firstCardTitle()).toHaveText("Microssequência alternativa");
      await page.reload();
      await openHierarchy("Abrir módulo", "Abrir lição");
      await expect(page.locator("[data-study-destination-heading]")).toHaveText("Lição persistida");
      await expect(firstCardTitle()).toHaveText("Microssequência alternativa");
      await saveStructure({
        title: "Lição da jornada",
        goal: "Confirmar o acesso ao Estudo.",
        move: { childId: "microsequence-access-local", direction: "up" }
      });
      await expect(firstCardTitle()).toHaveText("Microssequência compartilhada");

      await page.getByRole("button", { name: "Abrir microssequência didática" }).first().click();
      await expect(page.locator("[data-study-destination-heading]")).toHaveText(
        "Microssequência compartilhada"
      );
      await saveStructure({
        title: "Microssequência persistida",
        goal: "Objetivo da Microssequência persistido pelo contrato corrente.",
        move: { childId: "study-unit-access-local-1", direction: "down" }
      });
      await expect(firstCardTitle()).toHaveText("Segunda Unidade compartilhada");
      await page.reload();
      await openHierarchy("Abrir módulo", "Abrir lição", "Abrir microssequência didática");
      await expect(page.locator("[data-study-destination-heading]")).toHaveText(
        "Microssequência persistida"
      );
      await expect(firstCardTitle()).toHaveText("Segunda Unidade compartilhada");
      await saveStructure({
        title: "Microssequência compartilhada",
        goal: "Ler, registrar uma observação e avançar.",
        move: { childId: "study-unit-access-local-1", direction: "up" }
      });
      await expect(firstCardTitle()).toHaveText("Primeira Unidade compartilhada");

      await page.getByRole("button", { name: "Abrir unidade" }).first().click();
      await expect(page.getByText(
        "Conteúdo privado liberado somente para a pessoa escolhida.",
        { exact: true }
      )).toBeVisible();
      await expect(modes().getByRole("button", { name: "Visualizar" })).toBeVisible();
      await expect(modes().getByRole("button", { name: "Editar" })).toBeVisible();
      await expect(modes().getByRole("button", { name: "Assistência por IA" })).toBeVisible();
      await modes().getByRole("button", { name: "Editar" }).click();
      await expect(page.locator("[data-study-manual-title]")).toHaveText(
        "Primeira Unidade compartilhada"
      );
      await modes().getByRole("button", { name: "Visualizar" }).click();
      await attachScreenshot(page, testInfo, "estudo-real-unidade-390.png");

      await page.getByRole("button", { name: "Voltar" }).click();
      await expect(page.locator("[data-study-destination-heading]")).toHaveText(
        "Microssequência compartilhada"
      );
      await page.getByRole("button", { name: "Abrir unidade" }).first().click();

      await page.reload();
      await expect(page.locator("[data-action='open-course']")).toHaveAccessibleName(`Abrir ${COURSE_TITLE}`);
      await openHierarchy(
        "Abrir módulo",
        "Abrir lição",
        "Abrir microssequência didática",
        "Abrir unidade"
      );
      await expect(page.getByText(
        "Conteúdo privado liberado somente para a pessoa escolhida.",
        { exact: true }
      )).toBeVisible();
      await page.getByRole("button", { name: "Voltar" }).click();
      await expect(page.locator("[data-action='open-study-unit']").first()).toBeFocused();
      expect(failures.failures).toEqual([]);
    } finally {
      await context.close().catch(() => undefined);
    }
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

      await expect(ownerPage.getByRole("heading", { name: COURSE_TITLE, exact: true }))
        .toBeVisible();
      await expect(learnerPage.getByText(COURSE_TITLE, { exact: true })).toHaveCount(0);
      await setProfile(ownerPage, ownerHandle, { avatar: true });
      await setProfile(learnerPage, learnerHandle);
      const occupied = await request("/functions/v1/aralearn-course-api/v2/profile", {
        method: "PATCH", token: learnerToken, origin: APPLICATION_ORIGIN, body: { handle: ownerHandle }
      });
      expect(occupied.response.status).toBe(409);
      expect(occupied.payload.error.code).toBe("person_handle_unavailable");
      const learnerIdentity = (await courseApi("/v2/profile", {}, learnerToken)).data;
      expect(learnerIdentity.userId).toBe(learner.id);
      expect(learnerIdentity.handle).toBe(learnerHandle);
      expect(learnerIdentity).not.toHaveProperty("displayName");

      ownerAvatarObjectKey = (await courseApi("/v2/profile", {}, ownerToken))
        .data.avatarObjectKey;
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
      await expect(ownerPage.locator(
        ".course-authoring-surface[data-view='course'][data-section='content']"
      )).toHaveAttribute("aria-busy", "false");
      await expect(ownerPage.getByRole("region", { name: "Unidades de estudo", exact: true }))
        .toBeVisible();
      await ownerPage.locator(".course-authoring-task-menu > summary").click();
      await ownerPage.getByRole("link", { name: "Pessoas e acesso", exact: true }).click();
      await expect(ownerPage.getByRole("heading", { name: "Pessoas e acesso", exact: true }))
        .toBeVisible();
      await expect(ownerPage.getByText("Somente você tem acesso.", { exact: true })).toBeVisible();
      await ownerPage.getByRole("button", { name: "Conceder acesso" }).click();
      await ownerPage.getByRole("combobox", { name: "Identificador da pessoa" }).fill(`@${learnerHandle}`);
      await ownerPage.getByRole("option", { name: `@${learnerHandle}`, exact: true }).click();
      await ownerPage.locator("[data-course-authoring-grant]")
        .getByRole("button", { name: "Conceder acesso" }).click();
      const grantConfirmation = ownerPage.getByRole("alertdialog", {
        name: "Confirmar ação"
      });
      await expect(grantConfirmation).toContainText(
        `Conceder a @${learnerHandle} acesso`
      );
      await grantConfirmation.getByRole("button", { name: "Conceder acesso" }).click();
      await expect(ownerPage.getByText(
        `Acesso concedido a @${learnerHandle}.`,
        { exact: true }
      )).toBeVisible();
      const ownerTaskMenu = ownerPage.locator(".course-authoring-task-menu");
      await ownerTaskMenu.locator(":scope > summary").click();
      await ownerTaskMenu.getByRole("button", { name: "Atualizar Curso" }).click();
      await expect(ownerPage.locator(
        ".course-authoring-surface[data-view='course'][data-section='people']"
      )).toHaveAttribute("aria-busy", "false");
      await expect(ownerPage.getByText(`@${learnerHandle}`, { exact: true })).toBeVisible();
      await expectNoHorizontalOverflow(ownerPage, ".course-authoring-surface");
      await attachScreenshot(ownerPage, testInfo, "acesso-concedido-390.png");

      await learnerPage.reload();
      const learnerPreview = learnerPage.locator(".home-course-selector-preview");
      await learnerPage.getByRole("combobox", { name: "Selecionar curso" }).selectOption(courseId);
      await expect(learnerPage.getByRole("combobox", { name: "Selecionar curso" })).toHaveValue(courseId);
      await expect(learnerPreview).toContainText(COURSE_TITLE);
      await expect(learnerPreview).toContainText("Curso compartilhado");
      await learnerPreview.getByRole("button", { name: `Abrir ${COURSE_TITLE}` }).click();
      await learnerPage.getByRole("button", { name: "Abrir módulo" }).first().click();
      await learnerPage.getByRole("button", { name: "Abrir lição" }).first().click();
      await learnerPage.getByRole("button", { name: "Abrir microssequência didática" }).first().click();
      await learnerPage.getByRole("button", { name: "Abrir unidade" }).first().click();
      await expect(learnerPage.getByText(
        "Conteúdo privado liberado somente para a pessoa escolhida.",
        { exact: true }
      )).toBeVisible();
      await expectNoHorizontalOverflow(learnerPage, ".study-reader-screen");
      await expect(learnerPage.locator("header .study-mode-actions").getByRole("button", { name: "Editar", exact: true })).toHaveCount(0);
      await expect(learnerPage.locator("header .study-mode-actions").getByRole("button", { name: "Assistência por IA" })).toHaveCount(0);

      const observationsLoaded = learnerPage.waitForResponse((response) =>
        response.url().includes("/rpc/get_my_course_anchored_annotations_v1") &&
        response.request().method() === "POST"
      );
      await learnerPage.getByRole("button", { name: "Observações" }).click();
      await observationsLoaded;
      await expect(learnerPage.locator(".study-observation-loading")).toHaveCount(0);
      await learnerPage.locator(".study-observation-category-disclosure > summary").click();
      await learnerPage.locator(".study-observation-category-chip", { hasText: "Dúvida" })
        .click();
      await expect(learnerPage.getByRole("radio", { name: "Dúvida" })).toBeChecked();
      await learnerPage.getByRole("textbox", { name: "Observação", exact: true }).fill(
        "Esta observação pertence ao estudante e deve sobreviver à revogação."
      );
      await learnerPage.getByRole("button", { name: "Enviar observação" }).click();
      await expect(learnerPage.getByText("Sincronizada", { exact: true })).toBeVisible();
      await learnerPage.getByRole("button", { name: "Fechar" }).click();
      await learnerPage.getByRole("button", { name: "Próxima unidade de estudo" }).click();
      await expect(learnerPage.getByText(
        "O avanço confirma a prática e o estado pessoal do estudante.",
        { exact: true }
      )).toBeVisible();
      await learnerPage.waitForLoadState("networkidle");
      await attachScreenshot(learnerPage, testInfo, "estudo-compartilhado-390.png");

      learnerFailures.setOffline(true);
      await learnerContext.setOffline(true);
      await expect(learnerPage.getByText(COURSE_TITLE, { exact: true })).toBeVisible();
      await learnerPage.getByRole("button", { name: "Sem conexão", exact: true }).click();
      await expect(learnerPage.getByText(
        "Sem conexão. A cópia deste dispositivo continua disponível.",
        { exact: true }
      )).toBeVisible();
      await learnerPage.getByRole("button", { name: "Sem conexão", exact: true }).click();
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
      await ownerPage.getByRole("button", {
        name: `Revogar acesso de @${learnerHandle}`
      }).click();
      const revokeConfirmation = ownerPage.getByRole("alertdialog", {
        name: "Confirmar ação"
      });
      await expect(revokeConfirmation).toContainText(
        "O estado pessoal de Estudo será preservado."
      );
      await revokeConfirmation.getByRole("button", { name: "Revogar acesso" }).click();
      await expect(ownerPage.getByText(
        "Acesso revogado; o estado pessoal foi preservado.",
        { exact: true }
      )).toBeVisible();
      await expect(ownerPage.getByText(`@${learnerHandle}`, { exact: true })).toHaveCount(0);

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
      await expect(learnerPage.getByText(COURSE_TITLE, { exact: true })).toHaveCount(0);
      await learnerPage.waitForLoadState("networkidle");
      learnerFailures.setOffline(true);
      await learnerContext.setOffline(true);
      await expect(learnerPage.getByText(COURSE_TITLE, { exact: true })).toHaveCount(0);
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

  test("visitante abre endereço público, pratica localmente e baixa somente o PDF autorizado", async ({ browser }, testInfo) => {
    const ownerClient = new CourseApiClient({ projectUrl: PROJECT_URL, publishableKey: PUBLISHABLE_KEY,
      authClient: { getAccessToken: async () => ownerToken },
      fetchImpl: (url, init) => {
        const requestHeaders = new Headers(init.headers);
        requestHeaders.set("Origin", APPLICATION_ORIGIN);
        return fetch(url, { ...init, headers: requestHeaders });
      } });
    const guestClient = new CourseApiClient({ projectUrl: PROJECT_URL, publishableKey: PUBLISHABLE_KEY,
      visitor: true, authClient: { getAccessToken() { throw new Error("Visitante não usa sessão."); } },
      fetchImpl: (url, init) => {
        const requestHeaders = new Headers(init.headers);
        requestHeaders.set("Origin", APPLICATION_ORIGIN);
        return fetch(url, { ...init, headers: requestHeaders });
      } });
    publicCourseId = (await courseApi("/v1/courses", { method: "POST", body: {
      requestId: crypto.randomUUID(), title: "Curso público local", objective: "Exercitar a leitura pública projetada."
    } }, ownerToken)).data.courseId;
    await courseApi(`/v1/courses/${publicCourseId}/composition`, { method: "POST", body: {
      requestId: crypto.randomUUID(), expectedRevision: 1, upserts: courseRows(publicCourseId), deletes: [],
      sourceAttributionApplications: courseRows(publicCourseId).filter((row) => row.entityType === "study_unit")
        .map(({ entityId }) => ({ studyUnitId: entityId, sourceLinks: [] }))
    } }, ownerToken);
    const sourceId = "pdf-publico-local";
    await ownerClient.mutateCourseSources({ courseId: publicCourseId, expectedRevision: 2, sourceCommand: {
      type: "save_source", sourceId, expectedSourceRevision: 0, source: {
        kind: "document", sourceRole: "technical_conceptual", title: "Documento público de teste",
        authorship: null, publicationDate: null, identifier: null, language: "pt-BR",
        citationText: "Documento usado na prova local de acesso.", url: null, editionOrVersion: null,
        origin: "author_provided", availability: "private", verificationStatus: "author_verified", studyVisibility: "citation"
      }
    } });
    const pdfBytes = await readFile(new URL("../fixtures/pdf/edital-dataprev-2026-perfil-13-pagina-44.pdf", import.meta.url));
    const hash = Buffer.from(await crypto.subtle.digest("SHA-256", pdfBytes)).toString("hex");
    await ownerClient.uploadCourseSourcePdf({ courseId: publicCourseId, expectedRevision: 3,
      sourceId, sourceRevision: 1, file: new Blob([pdfBytes], { type: "application/pdf" }) });
    await ownerClient.mutateCourseSources({ courseId: publicCourseId, expectedRevision: 4, sourceCommand: {
      type: "save_anchor", anchorId: "pagina-local", sourceId, sourceRevision: 1, expectedAnchorRevision: 0,
      selector: { kind: "page_range", startPage: 1, endPage: 1 }, humanLocator: null, verificationExcerpt: null
    } });
    await ownerClient.mutateCourseSources({ courseId: publicCourseId, expectedRevision: 5, sourceCommand: {
      type: "set_target_sources", targetKind: "study_unit", targetId: "study-unit-access-local-1",
      expectedTargetVersion: 1, sourceLinks: [{ sourceId, relation: "informed_by", anchors: [{ anchorId: "pagina-local" }] }]
    } });
    await ownerClient.setCourseVisibility({ courseId: publicCourseId, expectedRevision: 6,
      visibility: "public", publicFileAccess: "restricted", confirmed: true });
    const publicDescriptor = await guestClient.getCourse(publicCourseId);
    expect(publicDescriptor.ownership).toBe("public");
    expect(publicDescriptor.canEdit).toBe(false);
    expect(publicDescriptor.canObserve).toBe(false);
    expect(publicDescriptor).not.toHaveProperty("copyOrigin");
    expect(publicDescriptor).not.toHaveProperty("isPersonalCopy");
    const publicList = await guestClient.listCourses({ query: "Curso público local" });
    expect(publicList.items.some((course) => course.courseId === publicCourseId)).toBe(true);
    const restricted = await guestClient.getStudyUnitCitations(publicCourseId, "study-unit-access-local-1", { expectedRevision: 7 });
    expect(restricted.citations[0].attachments).toEqual([]);
    await expect(guestClient.getCourseSourceAttachmentDownload({ courseId: publicCourseId,
      expectedRevision: 7, sourceId, sourceRevision: 1, contentHash: hash })).rejects.toMatchObject({ status: 403 });
    const available = await ownerClient.setCourseSourceFileAccess({ courseId: publicCourseId, expectedRevision: 7,
      sourceId, sourceRevision: 1, contentHash: hash, publicFileAccess: "available" });
    expect(available.courseRevision).toBe(8);
    const citations = await guestClient.getStudyUnitCitations(publicCourseId, "study-unit-access-local-1", { expectedRevision: 8 });
    expect(citations.citations[0].attachments).toEqual([{ contentHash: hash, byteSize: pdfBytes.byteLength, mediaType: "application/pdf" }]);
    const download = await guestClient.getCourseSourceAttachmentDownload({ courseId: publicCourseId,
      expectedRevision: 8, sourceId, sourceRevision: available.sourceRevision, contentHash: hash });
    expect(download.contract).toBe("aralearn.course-source-pdf-download.v2");
    expect(download).not.toHaveProperty("storageOriginCourseId");
    expect(download.attachment).not.toHaveProperty("storagePath");
    const file = await fetch(download.signedUrl);
    expect(file.status).toBe(200);
    expect(Buffer.from(await crypto.subtle.digest("SHA-256", await file.arrayBuffer())).toString("hex")).toBe(hash);
    const directWrite = await request(`/functions/v1/aralearn-course-api/v1/courses/${publicCourseId}/composition`, {
      method: "POST", token: null, origin: APPLICATION_ORIGIN, body: { requestId: crypto.randomUUID() }
    });
    expect(directWrite.response.status).toBe(401);
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: "block",
      permissions: ["local-network-access"] });
    const page = await context.newPage();
    const failures = captureBrowserFailures(page);
    const writes = [];
    page.on("request", (value) => {
      if (value.url().includes(PROJECT_URL) && /\/(?:mutate_|commit_|save_)/u.test(value.url())) writes.push(value.url());
    });
    try {
      await configureBrowser(page);
      const path = `#/estudo/${publicCourseId}/module-access-local/lesson-access-local/microsequence-access-local/study-unit-access-local-1`;
      await page.goto(`/${path}`);
      await expect(page.getByText("Conteúdo privado liberado somente para a pessoa escolhida.", { exact: true })).toBeVisible();
      await expect(page.locator("header .study-mode-actions").getByRole("button", { name: "Editar", exact: true })).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Entre para enviar observações" })).toBeVisible();
      await page.getByRole("button", { name: "Marcar para rever", exact: true }).click();
      await expect(page.getByRole("button", { name: "Marcar para rever", exact: true })).toHaveAttribute("aria-pressed", "true");
      await page.reload();
      await expect(page.getByRole("button", { name: "Marcar para rever", exact: true })).toHaveAttribute("aria-pressed", "true");
      await page.getByRole("button", { name: "Fontes", exact: true }).click();
      await expect(page.getByText("Documento usado na prova local de acesso.", { exact: true })).toBeVisible();
      const browserDownload = page.waitForEvent("download");
      await page.getByRole("button", { name: "Baixar PDF 1 de Documento público de teste", exact: true }).click();
      const transfer = await browserDownload;
      expect(await transfer.failure()).toBeNull();
      const transferredBytes = await readFile(await transfer.path());
      expect(Buffer.from(await crypto.subtle.digest("SHA-256", transferredBytes)).toString("hex")).toBe(hash);
      await expectNoHorizontalOverflow(page, ".study-reader-screen");
      await attachScreenshot(page, testInfo, "visitante-publico-390.png");
      expect(writes).toEqual([]);
      expect(failures.failures).toEqual([]);
      const databases = await page.evaluate(() => indexedDB.databases());
      expect(databases.map(({ name }) => name)).toContain("aralearn-course-v1-visitor");
      await page.getByRole("button", { name: "Fechar fontes" }).click();
      await page.getByRole("button", { name: "Entre para enviar observações" }).click();
      await page.getByLabel("E-mail").fill(outsider.email);
      await page.getByLabel("Senha", { exact: true }).fill(PASSWORD);
      await page.getByRole("button", { name: "Entrar", exact: true }).click();
      await expect(page.getByRole("heading", { name: "Escolha seu identificador" })).toBeVisible();
      await page.getByLabel("Identificador", { exact: true }).fill(`outsider-${outsider.id.slice(0, 8)}`);
      await page.getByRole("button", { name: "Salvar identificador" }).click();
      await expect(page).toHaveURL(new RegExp(`#\\/estudo\\/${publicCourseId}\\/module-access-local\\/lesson-access-local\\/microsequence-access-local\\/study-unit-access-local-1$`, "u"));
      await expect(page.getByText("Conteúdo privado liberado somente para a pessoa escolhida.", { exact: true })).toBeVisible();
      await expect(page.getByRole("button", { name: "Observações", exact: true })).toBeVisible();
      await expect(page.getByRole("button", { name: "Marcar para rever", exact: true })).toHaveAttribute("aria-pressed", "false");
    } finally { await context.close(); }
  });


  test("sincronização manual preserva duas abas e incorpora visitante somente por escolha", async ({ browser }, testInfo) => {
    const ownerClient = new CourseApiClient({ projectUrl: PROJECT_URL, publishableKey: PUBLISHABLE_KEY,
      authClient: { getAccessToken: async () => ownerToken },
      fetchImpl: (url, init) => {
        const requestHeaders = new Headers(init.headers);
        requestHeaders.set("Origin", APPLICATION_ORIGIN);
        return fetch(url, { ...init, headers: requestHeaders });
      } });
    const syncCourseId = (await courseApi("/v1/courses", { method: "POST", body: {
      requestId: crypto.randomUUID(), title: "Curso para sincronização local", objective: "Conservar progresso de duas abas."
    } }, ownerToken)).data.courseId;
    const rows = courseRows(syncCourseId);
    await courseApi(`/v1/courses/${syncCourseId}/composition`, { method: "POST", body: {
      requestId: crypto.randomUUID(), expectedRevision: 1, upserts: rows, deletes: [],
      sourceAttributionApplications: rows.filter((row) => row.entityType === "study_unit")
        .map(({ entityId }) => ({ studyUnitId: entityId, sourceLinks: [] }))
    } }, ownerToken);
    await ownerClient.setCourseVisibility({ courseId: syncCourseId, expectedRevision: 2,
      visibility: "public", publicFileAccess: "restricted", confirmed: true });
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: "block",
      permissions: ["local-network-access"] });
    context.setDefaultTimeout(15_000);
    const page = await context.newPage();
    const personalWrites = [];
    context.on("request", (value) => {
      if (value.url().includes("mutate_course_personal_state_v2")) personalWrites.push(value.url());
    });
    const openUnit = async (target, number) => {
      const unit = rows.find(({ entityType, entityId }) => entityType === "study_unit" && entityId === `study-unit-access-local-${number}`);
      await target.goto(`/#/estudo/${syncCourseId}/module-access-local/lesson-access-local/${unit.parentId}/${unit.entityId}`);
      await expect(target.locator(".runtime-card-title")).toHaveText(unit.content.title);
    };
    const review = (target) => target.getByRole("button", { name: "Marcar para rever", exact: true });
    const readPersonal = async () => {
      const result = await rpc("load_course_personal_state_v2", { p_course_id: syncCourseId }, ownerToken);
      expect(result.response.status, failure("ler estado pessoal", result)).toBe(200);
      return result.payload;
    };
    try {
      await configureBrowser(page);
      await openUnit(page, 1);
      await expect(review(page)).toHaveAttribute("aria-pressed", "false");
      await review(page).click();
      await expect(review(page)).toHaveAttribute("aria-pressed", "true");
      expect(personalWrites).toHaveLength(0);
      await browserSignIn(page, owner.email);
      await openUnit(page, 1);
      await expect(review(page)).toHaveAttribute("aria-pressed", "false");
      await page.goto("/");
      await page.getByRole("button", { name: "Conta e aparência", exact: true }).click();
      await page.getByLabel("Estudo neste dispositivo").selectOption("manual");
      await expect(page.getByLabel("Estudo neste dispositivo")).toHaveValue("manual");
      await page.getByText("Progresso sem conta", { exact: true }).click();
      await page.getByRole("button", { name: "Examinar progresso sem conta", exact: true }).click();
      await expect(page.locator("[data-study-adoption-form]")).toContainText(`@${ownerHandle}`);
      await page.getByRole("button", { name: "Acrescentar os cursos selecionados à minha conta" }).click();
      await expect(page.locator("[data-study-adoption-message]")).toHaveText("Selecione os cursos que deseja acrescentar.");
      await page.locator(`[name='visitorCourse'][value='${syncCourseId}']`).check();
      const beforeAdoption = personalWrites.length;
      await page.getByRole("button", { name: "Acrescentar os cursos selecionados à minha conta" }).click();
      await expect(page.locator("[data-study-adoption-message]")).toContainText("Progresso acrescentado");
      expect(personalWrites).toHaveLength(beforeAdoption);
      await expectNoHorizontalOverflow(page, ".account-settings-sheet");
      await attachScreenshot(page, testInfo, "adocao-explicita-manual-390.png");
      await page.getByRole("button", { name: "Fechar", exact: true }).click();
      await openUnit(page, 1);
      await expect(review(page)).toHaveAttribute("aria-pressed", "true");
      const explicitObservations = page.waitForResponse((response) =>
        response.url().includes("/rpc/get_my_course_anchored_annotations_v1") && response.status() === 200);
      await page.getByRole("button", { name: "Observações", exact: true }).click();
      await explicitObservations;
      await page.getByRole("textbox", { name: "Observação", exact: true }).fill("Observação enviada explicitamente no modo manual.");
      await page.getByRole("button", { name: "Enviar observação", exact: true }).click();
      await expect(page.getByText("Sincronizada", { exact: true })).toBeVisible();
      await page.getByRole("button", { name: "Fechar", exact: true }).click();
      expect(personalWrites).toHaveLength(beforeAdoption);
      const other = await context.newPage();
      await configureBrowser(other);
      await openUnit(other, 2);
      await expect(review(other)).toHaveAttribute("aria-pressed", "false");
      await page.bringToFront();
      await openUnit(page, 3);
      await review(page).click();
      await other.bringToFront();
      await review(other).click();
      await expect(review(other)).toHaveAttribute("aria-pressed", "true");
      await openUnit(other, 3);
      await expect(review(other)).toHaveAttribute("aria-pressed", "true");
      await openUnit(page, 2);
      await expect(review(page)).toHaveAttribute("aria-pressed", "true");
      expect(personalWrites).toHaveLength(beforeAdoption);
      await openUnit(page, 1);
      const changed = rows.find(({ entityType, entityId }) => entityType === "study_unit" && entityId === "study-unit-access-local-1");
      changed.content.content[0].data.text = "Texto atualizado externamente durante o modo manual.";
      await courseApi(`/v1/courses/${syncCourseId}/composition`, { method: "POST", body: {
        requestId: crypto.randomUUID(), expectedRevision: 3, upserts: [changed], deletes: [],
        sourceAttributionApplications: [{ studyUnitId: changed.entityId, sourceLinks: [] }]
      } }, ownerToken);
      await other.bringToFront();
      await page.bringToFront();
      await page.waitForLoadState("networkidle");
      await expect(page.getByText("Conteúdo privado liberado somente para a pessoa escolhida.", { exact: true })).toBeVisible();
      await expect(page.getByText(changed.content.content[0].data.text, { exact: true })).toHaveCount(0);
      await context.setOffline(true);
      await expect(page.locator(".study-runtime-status-control")).toHaveAttribute("aria-label", "Sem conexão");
      await context.setOffline(false);
      await page.waitForLoadState("networkidle");
      expect(personalWrites).toHaveLength(beforeAdoption);
      await expect(page.getByText("Conteúdo privado liberado somente para a pessoa escolhida.", { exact: true })).toBeVisible();
      await page.locator(".study-runtime-status-control").click();
      await expect(page.getByText(changed.content.content[0].data.text, { exact: true })).toBeVisible();
      expect(personalWrites.length).toBeGreaterThan(beforeAdoption);
      const persisted = await readPersonal();
      expect(Object.keys(persisted.state.reviewMarks).sort()).toEqual([1, 2, 3].map((number) => `study-unit-access-local-${number}`));
      await attachScreenshot(page, testInfo, "sincronizacao-explicita-390.png");
      await page.goto("/");
      await page.getByRole("button", { name: "Conta e aparência", exact: true }).click();
      await expect(page.getByLabel("Estudo neste dispositivo")).toHaveValue("manual");
      await page.getByRole("button", { name: "Dados e conta", exact: true }).click();
      page.once("dialog", (dialog) => dialog.accept());
      await page.getByRole("button", { name: "Sair", exact: true }).click();
      await openUnit(page, 1);
      await expect(review(page)).toHaveAttribute("aria-pressed", "true");
      await openUnit(page, 2);
      await expect(review(page)).toHaveAttribute("aria-pressed", "false");
    } finally {
      await context.close();
      ownerToken = await signIn(owner.email);
      await courseApi(`/v1/courses/${syncCourseId}`, { method: "DELETE", body: {
        operation: "delete_owned_course", confirmed: true, requestId: crypto.randomUUID()
      } }, ownerToken);
    }
  });

});
