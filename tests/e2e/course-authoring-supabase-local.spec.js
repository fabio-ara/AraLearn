import { expect, test } from "@playwright/test";

import { flattenCourseDocument } from "../../src/domain/courseEntities.js";

import {
  authorizeLocalMcpSession,
  cleanupLocalMcpSession,
  courseAction,
  createLocalMcpClient,
  createConfirmedLocalUser,
  localSupabaseConfiguration,
  localSupabaseFailure,
  localSupabaseRequest,
  queryLocalPostgresJson,
  readCourseIndexedDb,
  removeLocalUser,
  restRpc,
  signInLocalUser
} from "../support/localSupabaseE2e.js";

const ENABLED = process.env.ARALEARN_E2E_REAL_SUPABASE === "1";
const PASSWORD = "AraLearn-authoring-local-A9!";
const COURSE_TITLE = "Autoria E2E com persistência real";
const INITIAL_OBJECTIVE = "Comprovar a continuidade entre a interface e o estado canônico.";
const RETURNED_OBJECTIVE =
  "Objetivo revisado no ChatGPT e recuperado ao voltar para a Autoria.";
const PART_TITLE = "Parte acompanhável da prova";
const MODULE_ID = "module-e2e-materialization";
const LESSON_ID = "lesson-e2e-materialization";
const MICROSEQUENCE_ID = "microsequence-e2e-materialization";
const STUDY_UNIT_ID = "study-unit-e2e-contextual-edit";
const STUDY_UNIT_CONTENT_ID = "paragraph-e2e-contextual-edit";
const STUDY_UNIT_TITLE = "Unidade editável da prova";
const ORIGINAL_STUDY_UNIT_TEXT = "Texto original produzido para a prova transversal.";
const MANUAL_STUDY_UNIT_TEXT = "Texto revisado manualmente na interface de Autoria.";
const PROVIDER_STUDY_UNIT_TEXT = "Texto revisado com assistência local e confirmado pela pessoa autora.";
let sourceId = "";
const SOURCE_TITLE = "Fonte PDF da prova de Autoria";
const SOURCE_BUCKET = "course-source-pdfs";
const PDF_BYTES = Buffer.from(
  "%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n",
  "utf8"
);

let config = null;
let owner = null;
let outsider = null;
let ownerToken = "";
let outsiderToken = "";
let courseId = "";
let mcpLifecycle = {};
const providerRequests = [];

function assistedStudyUnit() {
  return {
    id: STUDY_UNIT_ID,
    position: 1,
    title: STUDY_UNIT_TITLE,
    role: "theory",
    content: [{
      id: STUDY_UNIT_CONTENT_ID,
      package: "aralearn.resource.paragraph",
      version: "1.0.0",
      data: { text: PROVIDER_STUDY_UNIT_TEXT }
    }],
    response: null,
    feedback: [],
    topics: ["Edição contextual"]
  };
}

async function installProviderStub(page) {
  providerRequests.length = 0;
  await page.route("https://api.openai.com/v1/responses", async (route) => {
    const request = route.request();
    const body = request.postData() || "";
    providerRequests.push({
      method: request.method(),
      url: new URL(request.url()).pathname,
      authorization: request.headers().authorization ?? null,
      body
    });
    const content = providerRequests.length === 1
      ? {
          message: "A formulação pode ficar mais direta sem mudar seu significado.",
          proposal: {
            summary: "Tornar a explicação mais direta e preservar a representação textual.",
            scope: "study_unit",
            componentNeeds: [{ query: "explicação em prosa", slot: "content" }]
          }
        }
      : {
          message: "A composição foi validada e está pronta para revisão.",
          candidate: assistedStudyUnit()
        };
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ output_text: JSON.stringify(content) })
    });
  });
}

function failure(label, result) {
  return localSupabaseFailure(label, result);
}

async function expectSuccessful(label, promise, status = 200) {
  const result = await promise;
  expect(result.response.status, failure(label, result)).toBe(status);
  return result.payload;
}

async function browserSignIn(page, email) {
  await page.goto("/");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByRole("button", { name: "Conta e aparência" })).toBeVisible();
}

async function confirmChatCopy(page) {
  const dialog = page.getByRole("dialog", { name: "Trabalhar no ChatGPT" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Copiar pedido" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText(
    "Pedido copiado. Cole no ChatGPT para continuar a Autoria.",
    { exact: true }
  )).toBeVisible();
}

async function openAuthoringSection(page, _destination, section) {
  const overviewTask = page.locator(".course-authoring-task-grid")
    .getByRole("link", { name: section, exact: true });
  if (await overviewTask.isVisible()) {
    await overviewTask.click();
    return;
  }
  const menu = page.locator(".course-authoring-task-menu");
  if (!await menu.evaluate((node) => node.open)) {
    await menu.locator(":scope > summary").click();
  }
  await menu.getByRole("link", { name: section, exact: true }).click();
}

function captureBrowserFailures(page) {
  const failures = [];
  page.on("console", (message) => {
    if (message.type() === "error") failures.push(`console: ${message.text()}`);
  });
  page.on("pageerror", (error) => failures.push(`page: ${error.message}`));
  page.on("requestfailed", (request) => {
    failures.push(
      `network: ${request.method()} ${request.url()} ${request.failure()?.errorText || ""}`
    );
  });
  page.on("response", (response) => {
    if (response.status() >= 500) failures.push(`http: ${response.status()} ${response.url()}`);
  });
  return failures;
}

async function canonicalHeader(token = ownerToken) {
  const payload = await expectSuccessful(
    "ler cabeçalho canônico",
    restRpc(config, "get_owned_course_v1", { p_course_id: courseId }, token)
  );
  return payload;
}

async function canonicalPlan() {
  const envelope = await expectSuccessful(
    "ler planejamento canônico",
    courseAction(config, "lerCurso", {
      courseId,
      view: "instructional_plan"
    }, ownerToken)
  );
  return envelope.data;
}

async function listPdfObjects(prefix = `${courseId}/`) {
  const payload = await expectSuccessful(
    "listar PDFs no Storage local",
    localSupabaseRequest(config, `/storage/v1/object/list/${SOURCE_BUCKET}`, {
      method: "POST",
      token: config.adminKey,
      body: {
        prefix,
        limit: 100,
        offset: 0,
        sortBy: { column: "name", order: "asc" }
      }
    })
  );
  return payload;
}

function sourcePersistenceEvidence(storagePath) {
  return queryLocalPostgresJson(`
    select json_build_object(
      'sourceRevisions', (select count(*)::integer
        from private.course_source_revisions
        where course_id='${courseId}'::uuid and source_id='${sourceId}'),
      'attachments', (select count(*)::integer
        from private.course_source_attachments
        where course_id='${courseId}'::uuid and source_id='${sourceId}'),
      'storageObjects', (select count(*)::integer from storage.objects
        where bucket_id='${SOURCE_BUCKET}' and name='${storagePath}')
    )::text;
  `);
}

function minimalMaterializableRows() {
  return flattenCourseDocument({
    contract: "aralearn.course.v1",
    courses: [{
      id: courseId,
      title: COURSE_TITLE,
      goal: RETURNED_OBJECTIVE,
      modules: [{
        id: MODULE_ID,
        title: "Módulo mínimo da materialização",
        guide: {
          goal: "Delimitar uma Microssequência que possa ser materializada por etapas.",
          include: ["estado rastreável"],
          exclude: [],
          notation: [],
          avoid: []
        },
        lessons: [{
          id: LESSON_ID,
          title: "Lição mínima da materialização",
          guide: {
            goal: "Permitir a execução real do protocolo de materialização.",
            include: ["carregamento de contexto"],
            exclude: [],
            notation: [],
            avoid: []
          },
          topics: [],
          microsequences: [{
            id: MICROSEQUENCE_ID,
            title: "Microssequência mínima da materialização",
            goal: "Comprovar o acompanhamento transversal da materialização.",
            role: "explain",
            dependsOn: [],
            covers: [],
            checks: [],
            errors: [],
            studyUnits: [{
              id: STUDY_UNIT_ID,
              position: 1,
              title: STUDY_UNIT_TITLE,
              role: "theory",
              content: [{
                id: STUDY_UNIT_CONTENT_ID,
                package: "aralearn.resource.paragraph",
                version: "1.0.0",
                data: { text: ORIGINAL_STUDY_UNIT_TEXT }
              }],
              response: null,
              feedback: [],
              topics: ["Edição contextual"]
            }]
          }]
        }]
      }]
    }]
  }).rows;
}

function materializationPersistenceEvidence({ authoringPartId, materializationId, stepId }) {
  return queryLocalPostgresJson(`
    select json_build_object(
      'entities', (select count(*)::integer from private.course_entities
        where course_id='${courseId}'::uuid
          and entity_id in ('${MODULE_ID}','${LESSON_ID}','${MICROSEQUENCE_ID}')),
      'partLinks', (select count(*)::integer
        from private.course_authoring_part_didactic_microsequences
        where course_id='${courseId}'::uuid
          and authoring_part_id='${authoringPartId}'::uuid
          and didactic_microsequence_id='${MICROSEQUENCE_ID}'),
      'materializations', (select count(*)::integer
        from private.course_authoring_part_materializations
        where course_id='${courseId}'::uuid and id='${materializationId}'::uuid
          and status='running' and channel='mcp'),
      'completedSteps', (select count(*)::integer
        from private.course_authoring_part_materialization_steps
        where course_id='${courseId}'::uuid and materialization_id='${materializationId}'::uuid
          and id='${stepId}'::uuid and status='completed')
    )::text;
  `);
}

function contextualEditPersistenceEvidence() {
  return queryLocalPostgresJson(`
    select json_build_object(
      'studyUnitVersion', (select version::integer from private.course_entities
        where course_id='${courseId}'::uuid and entity_type='study_unit'
          and entity_id='${STUDY_UNIT_ID}'),
      'text', (select content->'content'->0->'data'->>'text'
        from private.course_entities
        where course_id='${courseId}'::uuid and entity_type='study_unit'
          and entity_id='${STUDY_UNIT_ID}'),
      'manualEvents', (select count(*)::integer from private.course_events
        where course_id='${courseId}'::uuid and operation='replace_course_composition'
          and summary->>'channel'='application'
          and summary->>'applicationOrigin'='manual'),
      'providerEvents', (select count(*)::integer from private.course_events
        where course_id='${courseId}'::uuid and operation='replace_course_composition'
          and summary->>'channel'='application'
          and summary->>'applicationOrigin'='provider_assistance')
    )::text;
  `);
}

function cleanupEvidence() {
  if (!courseId || !owner?.id || !outsider?.id) return null;
  return queryLocalPostgresJson(`
    select json_build_object(
      'courses', (select count(*)::integer from public.courses
        where id='${courseId}'::uuid),
      'plans', (select count(*)::integer from private.course_instructional_plans
        where course_id='${courseId}'::uuid),
      'parts', (select count(*)::integer from private.course_authoring_parts
        where course_id='${courseId}'::uuid),
      'entities', (select count(*)::integer from private.course_entities
        where course_id='${courseId}'::uuid),
      'partLinks', (select count(*)::integer
        from private.course_authoring_part_didactic_microsequences
        where course_id='${courseId}'::uuid),
      'materializations', (select count(*)::integer
        from private.course_authoring_part_materializations
        where course_id='${courseId}'::uuid),
      'materializationSteps', (select count(*)::integer
        from private.course_authoring_part_materialization_steps
        where course_id='${courseId}'::uuid),
      'sources', (select count(*)::integer from private.course_source_revisions
        where course_id='${courseId}'::uuid),
      'attachments', (select count(*)::integer from private.course_source_attachments
        where course_id='${courseId}'::uuid),
      'events', (select count(*)::integer from private.course_events
        where course_id='${courseId}'::uuid),
      'receipts', (select count(*)::integer from private.course_change_receipts
        where course_id='${courseId}'::uuid),
      'storageObjects', (select count(*)::integer from storage.objects
        where bucket_id='${SOURCE_BUCKET}' and name like '${courseId}/%'),
      'users', (select count(*)::integer from auth.users
        where id in ('${owner.id}'::uuid, '${outsider.id}'::uuid))
    )::text;
  `);
}

function oauthCleanupEvidence() {
  if (!mcpLifecycle.clientId) return null;
  return queryLocalPostgresJson(`
    select json_build_object(
      'activeClients', (select count(*)::integer from auth.oauth_clients
        where id='${mcpLifecycle.clientId}'::uuid and deleted_at is null),
      'activeConsents', (select count(*)::integer from auth.oauth_consents
        where client_id='${mcpLifecycle.clientId}'::uuid and revoked_at is null)
    )::text;
  `);
}

test.describe("Autoria real com Supabase local", () => {
  test.skip(!ENABLED, "A prova real roda somente com a stack Supabase local explícita.");
  test.setTimeout(240_000);

  test.beforeAll(async ({ browserName }, testInfo) => {
    void browserName;
    testInfo.setTimeout(90_000);
    config = localSupabaseConfiguration();
    const suffix = `${Date.now()}-${process.pid}`;
    owner = await expectSuccessful(
      "criar pessoa autora temporária",
      createConfirmedLocalUser(config, {
        email: `authoring-owner-${suffix}@aralearn.local`,
        password: PASSWORD,
        marker: "course-authoring-supabase-local-e2e"
      })
    );
    outsider = await expectSuccessful(
      "criar segunda conta temporária",
      createConfirmedLocalUser(config, {
        email: `authoring-outsider-${suffix}@aralearn.local`,
        password: PASSWORD,
        marker: "course-authoring-supabase-local-e2e"
      })
    );
    ownerToken = (await expectSuccessful(
      "autenticar pessoa autora",
      signInLocalUser(config, { email: owner.email, password: PASSWORD })
    )).access_token;
    outsiderToken = (await expectSuccessful(
      "autenticar segunda conta",
      signInLocalUser(config, { email: outsider.email, password: PASSWORD })
    )).access_token;
    expect(ownerToken).toMatch(/^[^.]+\.[^.]+\.[^.]+$/u);
    expect(outsiderToken).toMatch(/^[^.]+\.[^.]+\.[^.]+$/u);
    mcpLifecycle = {};
    await authorizeLocalMcpSession(config, {
      userAccessToken: ownerToken,
      userId: owner.id,
      lifecycle: mcpLifecycle
    });
    expect(mcpLifecycle.accessToken).toMatch(/^[^.]+\.[^.]+\.[^.]+$/u);
    expect(mcpLifecycle.accessToken).not.toBe(ownerToken);
  });

  test.afterAll(async ({ browserName }, testInfo) => {
    void browserName;
    testInfo.setTimeout(90_000);
    const mcpCleanupFailure = await cleanupLocalMcpSession(config, mcpLifecycle)
      .then(() => null, (error) => error);
    const deletion = ownerToken
      ? await courseAction(config, "excluirMinhaConta", {
        confirmation: "EXCLUIR MINHA CONTA"
      }, ownerToken).catch(() => null)
      : null;
    const ownerRemoval = await removeLocalUser(config, owner?.id).catch(() => null);
    const outsiderRemoval = await removeLocalUser(config, outsider?.id).catch(() => null);
    if (courseId) await expect.poll(() => listPdfObjects()).toEqual([]);
    if (courseId && owner?.id && outsider?.id) {
      await expect.poll(cleanupEvidence).toEqual({
        courses: 0,
        plans: 0,
        parts: 0,
        entities: 0,
        partLinks: 0,
        materializations: 0,
        materializationSteps: 0,
        sources: 0,
        attachments: 0,
        events: 0,
        receipts: 0,
        storageObjects: 0,
        users: 0
      });
    }
    if (mcpLifecycle.clientId) {
      await expect.poll(oauthCleanupEvidence).toEqual({
        activeClients: 0,
        activeConsents: 0
      });
    }
    if (deletion) {
      expect(deletion.response.status, failure("excluir conta autora", deletion)).toBe(200);
    }
    if (ownerRemoval) {
      expect([200, 204, 404], failure("remover conta autora residual", ownerRemoval))
        .toContain(ownerRemoval.response.status);
    }
    if (outsiderRemoval) {
      expect([200, 204, 404], failure("remover segunda conta", outsiderRemoval))
        .toContain(outsiderRemoval.response.status);
    }
    if (mcpCleanupFailure) throw mcpCleanupFailure;
  });

  test("cria, copia sem mutar, persiste, protege por RLS e atualiza ao retornar", async ({
    browser
  }, testInfo) => {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      serviceWorkers: "block",
      permissions: ["clipboard-read", "clipboard-write", "local-network-access"]
    });
    context.setDefaultTimeout(15_000);
    const page = await context.newPage();
    await installProviderStub(page);
    const browserFailures = captureBrowserFailures(page);
    const browserDialogs = [];
    page.on("dialog", (dialog) => {
      browserDialogs.push(`${dialog.type()}: ${dialog.message()}`);
      void dialog.dismiss().catch(() => undefined);
    });
    const mutatingRequests = [];
    page.on("request", (request) => {
      if (request.method() !== "GET" && /\/(?:criarCurso|alterarCurso)$/u.test(request.url())) {
        mutatingRequests.push(`${request.method()} ${request.url()}`);
      }
    });

    try {
      await page.emulateMedia({ reducedMotion: "reduce" });
      await browserSignIn(page, owner.email);
      await page.getByRole("button", { name: "Autoria", exact: true }).click();
      await expect(page.getByRole("heading", { name: "Meus cursos" })).toBeVisible();
      await page.getByRole("button", { name: "Criar Curso" }).click();
      await page.getByLabel("Título").fill(COURSE_TITLE);
      await page.getByLabel("Objetivo").fill(INITIAL_OBJECTIVE);
      await page.locator("[data-course-authoring-create]")
        .getByRole("button", { name: "Criar Curso" }).click();
      await expect(page.locator(".course-authoring-course-header h1")).toHaveText("Visão geral");
      await expect(page.locator(".course-authoring-course-heading .course-authoring-eyebrow"))
        .toHaveText(COURSE_TITLE);
      const hashMatch = page.url().match(/#\/authoring\/courses\/([0-9a-f-]{36})/u);
      expect(hashMatch).not.toBeNull();
      courseId = hashMatch[1];
      expect(await canonicalHeader()).toMatchObject({
        courseId,
        title: COURSE_TITLE,
        goal: INITIAL_OBJECTIVE,
        revision: 1,
        ownership: "owned",
        canEdit: true
      });
      await expect(page.locator("#app-root > #aralearn-authoring-root.course-authoring-root"))
        .toBeVisible();
      expect(await page.evaluate(() => [...document.scripts].some((script) =>
        new URL(script.src, location.href).pathname.endsWith("/main.js")))).toBe(true);
      await openAuthoringSection(page, "course", "Planejamento");
      await expect(page.getByRole("region", { name: "Crie a primeira Parte" })).toBeVisible();

      const beforeCourseCopy = await readCourseIndexedDb(page, owner.id);
      const beforeCourseRevision = (await canonicalHeader()).revision;
      const courseCopyRequestIndex = mutatingRequests.length;
      await page.getByRole("button", { name: "Planejar este Curso no ChatGPT" }).click();
      await confirmChatCopy(page);
      const coursePrompt = await page.evaluate(() => navigator.clipboard.readText());
      expect(coursePrompt).toContain(`Curso: “${COURSE_TITLE}”.`);
      expect(coursePrompt).toContain(`Identidade do Curso: ${courseId}.`);
      expect(coursePrompt).toContain("Revisão observada ao copiar: 1.");
      expect(coursePrompt).toContain("Esta cópia não alterou o Curso");
      expect((await canonicalHeader()).revision).toBe(beforeCourseRevision);
      expect(await readCourseIndexedDb(page, owner.id)).toEqual(beforeCourseCopy);
      expect(mutatingRequests.slice(courseCopyRequestIndex)).toEqual([]);

      await page.getByRole("region", { name: "Crie a primeira Parte" })
        .getByRole("button", { name: "Adicionar Parte", exact: true }).click();
      await page.getByLabel("Título da Parte").fill(PART_TITLE);
      await page.getByLabel("Intenção operacional").fill(
        "Organizar uma estrutura didática verificável antes da materialização."
      );
      await page.locator("[data-course-authoring-part]")
        .getByRole("button", { name: "Adicionar Parte" }).click();
      await expect(page.getByText("Parte salva.", { exact: true })).toBeVisible();
      await expect(page.getByRole("heading", { name: PART_TITLE, exact: true })).toBeVisible();
      const afterPartPlan = await canonicalPlan();
      expect(afterPartPlan.courseRevision).toBe(2);
      expect(afterPartPlan.plan.version).toBe(2);
      expect(afterPartPlan.plan.parts).toHaveLength(1);

      const beforePrepareCopy = await readCourseIndexedDb(page, owner.id);
      const prepareCopyRequestIndex = mutatingRequests.length;
      await page.getByRole("button", { name: "Preparar estrutura no ChatGPT" }).click();
      await confirmChatCopy(page);
      const preparePrompt = await page.evaluate(() => navigator.clipboard.readText());
      expect(preparePrompt).toContain("Ação: preparar a estrutura.");
      expect(preparePrompt).toContain("Vincule as Microssequências às Partes");
      expect(preparePrompt).toContain("Revisão observada ao copiar: 2.");
      expect((await canonicalHeader()).revision).toBe(2);
      expect(await readCourseIndexedDb(page, owner.id)).toEqual(beforePrepareCopy);
      expect(mutatingRequests.slice(prepareCopyRequestIndex)).toEqual([]);

      await openAuthoringSection(page, "course", "Fontes");
      await expect(page.getByRole("heading", { name: "Fontes", exact: true }).first()).toBeVisible();
      await expect(page.getByText("Carregando fontes…", { exact: true })).toBeHidden();
      await page.getByRole("button", { name: "Nova fonte" }).click();
      sourceId = await page.locator('[data-source-form="source"] input[name="sourceId"]').inputValue();
      expect(sourceId).toMatch(/^[0-9a-f]{8}-[0-9a-f-]{27}$/u);
      await page.getByLabel("Título", { exact: true }).fill(SOURCE_TITLE);
      await page.getByLabel("Autoria", { exact: true }).fill("Equipe E2E AraLearn");
      await page.getByLabel("Citação legível").fill(
        "Equipe E2E AraLearn. Fonte PDF da prova de Autoria, 2026."
      );
      await page.getByLabel("Link canônico").fill("https://example.test/fonte-e2e-autoria");
      await page.getByRole("button", { name: "Salvar fonte" }).click();
      await expect(page.getByText("Alteração salva.", { exact: true })).toBeVisible();
      await page.locator("[data-source-action='open-source']").filter({ hasText: SOURCE_TITLE }).click();
      await expect(page.getByText(SOURCE_TITLE, { exact: true }).first()).toBeVisible();
      await expect(page.getByText("0 observações carregadas", { exact: true })).toBeVisible();
      const pdfInput = page.locator("[data-source-pdf-input]");
      await expect(pdfInput).toBeEnabled();
      await pdfInput.setInputFiles({
        name: "fonte-e2e.pdf",
        mimeType: "application/pdf",
        buffer: PDF_BYTES
      });
      await expect(page.getByRole("button", { name: /Baixar PDF/u }))
        .toBeVisible({ timeout: 15_000 });
      await expect(page.getByText("1 anexo", { exact: true })).toBeVisible();
      const pdfObjects = await listPdfObjects();
      expect(pdfObjects).toHaveLength(1);
      const pdfPath = String(pdfObjects[0].name).startsWith(`${courseId}/`)
        ? String(pdfObjects[0].name)
        : `${courseId}/${pdfObjects[0].name}`;
      expect(pdfPath).toMatch(new RegExp(`^${courseId}/[a-f0-9]{64}\\.pdf$`, "u"));
      expect(sourcePersistenceEvidence(pdfPath)).toEqual({
        sourceRevisions: 1,
        attachments: 1,
        storageObjects: 1
      });

      const outsiderOwnedRead = await restRpc(
        config,
        "get_owned_course_v1",
        { p_course_id: courseId },
        outsiderToken
      );
      expect([400, 403, 404], failure("segunda conta lê Curso privado", outsiderOwnedRead))
        .toContain(outsiderOwnedRead.response.status);
      const revisionBeforeDeniedWrite = (await canonicalHeader()).revision;
      const planBeforeDeniedWrite = await canonicalPlan();
      const outsiderWrite = await courseAction(config, "alterarCurso", {
        requestId: crypto.randomUUID(),
        courseId,
        expectedRevision: revisionBeforeDeniedWrite,
        expectedPlanVersion: planBeforeDeniedWrite.plan.version,
        operation: "update_instructional_plan",
        planCommand: {
          type: "update_plan",
          objective: "Tentativa indevida da segunda conta."
        }
      }, outsiderToken);
      expect([400, 401, 403, 404], failure("segunda conta altera planejamento", outsiderWrite))
        .toContain(outsiderWrite.response.status);
      expect((await canonicalHeader()).revision).toBe(revisionBeforeDeniedWrite);
      const outsiderPdf = await localSupabaseRequest(
        config,
        `/storage/v1/object/authenticated/${SOURCE_BUCKET}/${pdfPath}`,
        { token: outsiderToken }
      );
      expect([400, 401, 403, 404], failure("segunda conta baixa PDF privado", outsiderPdf))
        .toContain(outsiderPdf.response.status);

      await openAuthoringSection(page, "course", "Planejamento");
      await expect(page.getByRole("heading", { name: "Planejamento", exact: true }).first())
        .toBeVisible();
      await expect(page.getByText(INITIAL_OBJECTIVE, { exact: true })).toBeVisible();
      const chatGptTab = await context.newPage();
      await chatGptTab.setContent("<title>ChatGPT simulado para a troca de aba</title>");
      await chatGptTab.bringToFront();

      const mcpClient = await createLocalMcpClient(config, mcpLifecycle.accessToken);
      expect(mcpClient.protocolVersion).toBe("2025-11-25");
      expect(mcpClient.toolNames).toEqual(expect.arrayContaining(["lerCurso", "alterarCurso"]));
      const planBeforeChatGpt = await mcpClient.callTool("lerCurso", {
        courseId,
        view: "instructional_plan"
      });
      expect(planBeforeChatGpt).toMatchObject({
        courseId,
        plan: { objective: INITIAL_OBJECTIVE }
      });
      const chatGptChange = await mcpClient.callTool("alterarCurso", {
          requestId: crypto.randomUUID(),
          courseId,
          expectedRevision: planBeforeChatGpt.courseRevision,
          expectedPlanVersion: planBeforeChatGpt.plan.version,
          operation: "update_instructional_plan",
          planCommand: {
            type: "update_plan",
            objective: RETURNED_OBJECTIVE
          }
        });
      const returnedRevision = chatGptChange.courseRevision;
      expect(returnedRevision).toBe(planBeforeChatGpt.courseRevision + 1);
      expect(await canonicalHeader()).toMatchObject({
        courseId,
        revision: returnedRevision,
        goal: RETURNED_OBJECTIVE
      });

      const composition = await mcpClient.callTool("alterarCurso", {
        requestId: crypto.randomUUID(),
        courseId,
        expectedRevision: returnedRevision,
        operation: "commit_course_composition",
        upserts: minimalMaterializableRows(),
        deletes: [],
        sourceAttributionApplications: [{
          studyUnitId: STUDY_UNIT_ID,
          sourceLinks: []
        }]
      });
      expect(composition).toMatchObject({
        courseId,
        revision: returnedRevision + 1,
        createdCount: 4,
        deletedCount: 0
      });
      const planWithStructure = await mcpClient.callTool("lerCurso", {
        courseId,
        view: "instructional_plan"
      });
      const authoringPartId = planWithStructure.plan.parts[0].id;
      const assigned = await mcpClient.callTool("alterarCurso", {
        requestId: crypto.randomUUID(),
        courseId,
        expectedRevision: planWithStructure.courseRevision,
        expectedPlanVersion: planWithStructure.plan.version,
        operation: "update_instructional_plan",
        planCommand: {
          type: "assign_microsequence",
          partId: authoringPartId,
          microsequenceId: MICROSEQUENCE_ID,
          position: 0
        }
      });
      expect(assigned.courseRevision).toBe(planWithStructure.courseRevision + 1);
      const materializablePlan = await mcpClient.callTool("lerCurso", {
        courseId,
        view: "instructional_plan"
      });
      const materializablePart = materializablePlan.plan.parts.find(
        ({ id }) => id === authoringPartId
      );
      expect(materializablePart).toMatchObject({
        id: authoringPartId,
        microsequences: [{ id: MICROSEQUENCE_ID, productionPosition: 0 }],
        progress: {
          state: "partially_materialized",
          microsequenceCount: 1,
          lastMaterialization: null
        }
      });

      const actionsMaterializationId = crypto.randomUUID();
      const actionsStepId = crypto.randomUUID();
      const actionsStarted = await expectSuccessful(
        "iniciar materialização pelo contrato de Actions",
        restRpc(config, "advance_course_authoring_part_materialization_for_actor_v2", {
          p_actor_id: owner.id,
          p_course_id: courseId,
          p_authoring_part_id: authoringPartId,
          p_materialization_id: actionsMaterializationId,
          p_expected_course_revision: materializablePlan.courseRevision,
          p_expected_materialization_version: 0,
          p_operation: "start",
          p_payload: {
            authoringPartVersion: materializablePart.version,
            steps: [{
              id: actionsStepId,
              position: 0,
              kind: "didactic_microsequence_materialization",
              targetDidacticMicrosequenceId: MICROSEQUENCE_ID,
              productionPosition: 0
            }]
          },
          p_channel: "actions",
          p_request_id: `actions-${crypto.randomUUID()}`
        }, config.adminKey)
      );
      expect(actionsStarted).toMatchObject({ channel: "actions", operation: "start" });
      const actionsContextHash = actionsStarted.materialization.contextHash;
      const actionsStudyUnit = minimalMaterializableRows().find(
        ({ entityType, entityId }) => entityType === "study_unit" && entityId === STUDY_UNIT_ID
      );
      const actionsDesignApplication = {
        contextHash: actionsContextHash,
        didacticMicrosequenceId: MICROSEQUENCE_ID,
        studyUnits: [{
          studyUnitId: STUDY_UNIT_ID,
          mode: "expository",
          introducedInstructionalAnalysisUnitIds: [],
          explanationApplications: [],
          practiceApplications: [],
          componentRefs: ["aralearn.resource.paragraph@1.0.0"]
        }]
      };
      const actionsStep = await expectSuccessful(
        "registrar etapa pelo contrato de Actions",
        restRpc(config, "advance_course_authoring_part_materialization_for_actor_v2", {
          p_actor_id: owner.id,
          p_course_id: courseId,
          p_authoring_part_id: authoringPartId,
          p_materialization_id: actionsMaterializationId,
          p_expected_course_revision: actionsStarted.courseRevision,
          p_expected_materialization_version: actionsStarted.materialization.version,
          p_operation: "record_step",
          p_payload: {
            stepId: actionsStepId,
            expectedStepVersion: 1,
            status: "completed",
            resultFacts: {
              producedStudyUnitCount: 1,
              source: "actions_contract_e2e",
              changedObjects: [{ entityType: "study_unit", entityId: STUDY_UNIT_ID }]
            },
            entityChanges: { upserts: [actionsStudyUnit], deletes: [] },
            designApplication: actionsDesignApplication,
            sourceAttributionApplication: {
              contract: "aralearn.course-source-attribution-application.v1",
              contextHash: actionsContextHash,
              didacticMicrosequenceId: MICROSEQUENCE_ID,
              studyUnits: [{ studyUnitId: STUDY_UNIT_ID, sourceLinks: [] }]
            }
          },
          p_channel: "actions",
          p_request_id: `actions-${crypto.randomUUID()}`
        }, config.adminKey)
      );
      const actionsFinished = await expectSuccessful(
        "concluir materialização pelo contrato de Actions",
        restRpc(config, "advance_course_authoring_part_materialization_for_actor_v2", {
          p_actor_id: owner.id,
          p_course_id: courseId,
          p_authoring_part_id: authoringPartId,
          p_materialization_id: actionsMaterializationId,
          p_expected_course_revision: actionsStep.courseRevision,
          p_expected_materialization_version: actionsStep.materialization.version,
          p_operation: "finish",
          p_payload: {
            status: "completed",
            resultFacts: { summary: "Contexto conferido pela integração Actions." }
          },
          p_channel: "actions",
          p_request_id: `actions-${crypto.randomUUID()}`
        }, config.adminKey)
      );
      expect(actionsFinished).toMatchObject({
        channel: "actions",
        materialization: { status: "completed" }
      });

      const failedMaterializationId = crypto.randomUUID();
      const failedStepId = crypto.randomUUID();
      const failedStarted = await expectSuccessful(
        "iniciar materialização que terminará com falha",
        restRpc(config, "advance_course_authoring_part_materialization_for_actor_v2", {
          p_actor_id: owner.id,
          p_course_id: courseId,
          p_authoring_part_id: authoringPartId,
          p_materialization_id: failedMaterializationId,
          p_expected_course_revision: actionsFinished.courseRevision,
          p_expected_materialization_version: 0,
          p_operation: "start",
          p_payload: {
            authoringPartVersion: materializablePart.version,
            steps: [{
              id: failedStepId,
              position: 0,
              kind: "context_load",
              targetDidacticMicrosequenceId: null,
              productionPosition: null
            }]
          },
          p_channel: "mcp",
          p_request_id: `mcp-${crypto.randomUUID()}`
        }, config.adminKey)
      );
      const failedFinished = await expectSuccessful(
        "encerrar materialização com falha observável",
        restRpc(config, "advance_course_authoring_part_materialization_for_actor_v2", {
          p_actor_id: owner.id,
          p_course_id: courseId,
          p_authoring_part_id: authoringPartId,
          p_materialization_id: failedMaterializationId,
          p_expected_course_revision: failedStarted.courseRevision,
          p_expected_materialization_version: failedStarted.materialization.version,
          p_operation: "finish",
          p_payload: {
            status: "failed",
            resultFacts: { summary: "Uma Fonte precisa ser revista antes de tentar novamente." }
          },
          p_channel: "mcp",
          p_request_id: `mcp-${crypto.randomUUID()}`
        }, config.adminKey)
      );
      expect(failedFinished.materialization.status).toBe("failed");

      const materializationId = crypto.randomUUID();
      const stepId = crypto.randomUUID();
      const started = await mcpClient.callTool("alterarCurso", {
        requestId: crypto.randomUUID(),
        courseId,
        expectedRevision: failedFinished.courseRevision,
        operation: "advance_part_materialization",
        materializationCommand: {
          operation: "start",
          authoringPartId,
          materializationId,
          expectedMaterializationVersion: 0,
          authoringPartVersion: materializablePart.version,
          steps: [{
            id: stepId,
            position: 0,
            kind: "context_load",
            targetDidacticMicrosequenceId: null,
            productionPosition: null
          }]
        }
      });
      expect(started).toMatchObject({
        courseId,
        courseRevision: failedFinished.courseRevision + 1,
        operation: "start",
        channel: "mcp",
        materialization: {
          id: materializationId,
          status: "running",
          version: 1,
          completedStepCount: 0,
          totalStepCount: 1
        }
      });
      const completedContextStep = await mcpClient.callTool("alterarCurso", {
        requestId: crypto.randomUUID(),
        courseId,
        expectedRevision: started.courseRevision,
        operation: "advance_part_materialization",
        materializationCommand: {
          operation: "record_step",
          authoringPartId,
          materializationId,
          expectedMaterializationVersion: started.materialization.version,
          stepId,
          expectedStepVersion: 1,
          status: "completed",
          resultFacts: {
            contextLoaded: true,
            source: "oauth_mcp_e2e"
          },
          entityChanges: { upserts: [], deletes: [] },
          designApplication: null,
          sourceAttributionApplication: null
        }
      });
      const materializationRevision = completedContextStep.courseRevision;
      expect(completedContextStep).toMatchObject({
        courseId,
        courseRevision: started.courseRevision + 1,
        operation: "record_step",
        channel: "mcp",
        materialization: {
          id: materializationId,
          status: "running",
          version: 2,
          completedStepCount: 1,
          totalStepCount: 1,
          nextPendingStep: null
        },
        step: {
          id: stepId,
          status: "completed",
          version: 2
        }
      });
      const materializationRead = await mcpClient.callTool("lerCurso", {
        courseId,
        view: "part_materialization",
        authoringPartId,
        materializationId
      });
      expect(materializationRead).toMatchObject({
        contract: "aralearn.course-authoring-part-materialization.v1",
        courseId,
        courseRevision: materializationRevision,
        authoringPartId,
        materialization: {
          id: materializationId,
          channel: "mcp",
          status: "running",
          version: 2,
          nextPendingStep: null,
          steps: [{
            id: stepId,
            kind: "context_load",
            status: "completed",
            version: 2,
            resultFacts: {
              contextLoaded: true,
              source: "oauth_mcp_e2e"
            }
          }]
        }
      });
      expect(materializationPersistenceEvidence({
        authoringPartId,
        materializationId,
        stepId
      })).toEqual({
        entities: 3,
        partLinks: 1,
        materializations: 1,
        completedSteps: 1
      });
      await expect(page.getByText(INITIAL_OBJECTIVE, { exact: true })).toBeVisible();

      await page.bringToFront();
      await page.evaluate(() => globalThis.dispatchEvent(new Event("focus")));
      await expect(page.getByText(RETURNED_OBJECTIVE, { exact: true })).toBeVisible();
      await expect(page.getByRole("heading", { name: PART_TITLE, exact: true }).first())
        .toBeVisible();
      await expect(page.getByText("Em materialização", { exact: true })).toBeVisible();
      await expect(page.getByText("1 de 1 etapas", { exact: true })).toBeVisible();
      await expect(page.locator("[role='dialog']:visible, [role='alertdialog']:visible"))
        .toHaveCount(0);
      const writesBeforeMaterializationRead = mutatingRequests.length;
      await page.getByRole("link", { name: "Abrir Parte", exact: true }).first().click();
      await expect(page.getByRole("heading", { name: PART_TITLE, exact: true }).first())
        .toBeVisible();
      await expect(page.getByText("3 execuções", { exact: true })).toBeVisible();
      await expect(page.getByRole("link", {
        name: /Falhou MCP.*Uma Fonte precisa ser revista/u
      })).toBeVisible();
      await expect(page.getByRole("link", { name: /Concluída Actions/u })).toBeVisible();
      await page.getByRole("link", { name: /Concluída Actions/u }).click();
      const actionsExecution = page.getByRole("region", {
        name: "Etapas e resultados da materialização"
      });
      await expect(actionsExecution).toBeVisible();
      await expect(actionsExecution.getByRole("link", { name: /Unidade produzida 1/u }))
        .toBeVisible();
      await actionsExecution.getByRole("link", { name: /Unidade produzida 1/u }).click();
      await expect(page.getByRole("heading", { name: STUDY_UNIT_TITLE, exact: true })).toBeVisible();
      await expect(page.getByRole("link", { name: "Voltar à execução", exact: true })).toBeVisible();
      await page.reload();
      await expect(page.getByRole("heading", { name: STUDY_UNIT_TITLE, exact: true })).toBeVisible();
      await page.getByRole("link", { name: "Voltar à execução", exact: true }).click();
      await expect(actionsExecution).toBeVisible();
      await expect(actionsExecution.getByText("Versão 3 · Actions", { exact: true })).toBeVisible();
      await page.getByRole("link", { name: PART_TITLE, exact: true }).first().click();
      await page.locator(`a[href*="materializationId=${materializationId}"]`).click();
      const materializationRegion = page.getByRole("region", {
        name: "Etapas e resultados da materialização"
      });
      await expect(materializationRegion).toBeVisible();
      await expect(materializationRegion.getByText("Versão 2 · MCP", { exact: true }))
        .toBeVisible();
      await expect(materializationRegion.getByText(
        "Etapa 1 · Carregar contexto",
        { exact: true }
      )).toBeVisible();
      await expect(materializationRegion.getByText("Concluída", { exact: true }).first())
        .toBeVisible();
      await expect(page.locator("[role='dialog']:visible, [role='alertdialog']:visible"))
        .toHaveCount(0);
      expect(mutatingRequests).toHaveLength(writesBeforeMaterializationRead);
      expect(browserDialogs).toEqual([]);
      await expect.poll(async () => {
        const rows = await readCourseIndexedDb(page, owner.id);
        return rows.find(({ key }) =>
          key === `course-authoring.v1.header:${courseId}`)?.value?.data?.revision ?? null;
      }).toBe(materializationRevision);
      const cachedPlan = (await readCourseIndexedDb(page, owner.id)).find(({ key }) =>
        key === `course-authoring.v1.instructional-plan:${courseId}`);
      expect(cachedPlan?.value?.data).toMatchObject({
        courseId,
        courseRevision: materializationRevision,
        plan: {
          objective: RETURNED_OBJECTIVE,
          parts: [{
            id: authoringPartId,
            microsequences: [{ id: MICROSEQUENCE_ID, productionPosition: 0 }],
            progress: {
              state: "materializing",
              microsequenceCount: 1,
              lastMaterialization: {
                id: materializationId,
                status: "running",
                version: 2,
                completedStepCount: 1,
                totalStepCount: 1
              }
            }
          }]
        }
      });
      expect(await canonicalHeader()).toMatchObject({
        courseId,
        revision: materializationRevision,
        goal: RETURNED_OBJECTIVE
      });

      await openAuthoringSection(page, "content", "Conteúdo");
      await expect(page.getByRole("heading", { name: "Conteúdo", exact: true }).first())
        .toBeVisible();
      const lessonHierarchyItem = page.locator(
        `[data-course-authoring-entity-kind="lesson"][data-course-authoring-entity-id="${LESSON_ID}"]`
      );
      await lessonHierarchyItem.getByRole("button", {
        name: "Editar Lição mínima da materialização",
        exact: true
      }).click();
      await expect(page.getByRole("group", { name: "Modo de Lição" })).toBeVisible();
      await page.getByRole("button", { name: "Editar", exact: true }).click();
      const lessonEditor = page.getByRole("region", { name: "Edição de Lição" });
      await expect(lessonEditor.getByLabel("Título", { exact: true })).toHaveText(
        "Lição mínima da materialização"
      );
      await expect(lessonEditor.locator('[data-study-structure-field="goal"]')).toBeEditable();
      await expect(page.getByRole("heading", {
        name: "Microssequências didáticas",
        exact: true
      }))
        .toBeVisible();
      await expect(page.getByRole("button", {
        name: "Selecionar Microssequência mínima da materialização",
        exact: true
      })).toBeVisible();
      await expect(page.getByRole("button", { name: "Mover para cima", exact: true }))
        .toBeDisabled();
      await page.getByRole("button", { name: "Cancelar edição", exact: true }).click();
      await page.getByRole("button", { name: "Voltar", exact: true }).click();
      await expect(page.getByRole("heading", { name: "Conteúdo", exact: true }).first())
        .toBeVisible();
      const inspectionUnit = page.locator(
        `[data-inspection-study-unit="${STUDY_UNIT_ID}"]`
      );
      await expect(inspectionUnit.getByRole("heading", { name: STUDY_UNIT_TITLE }))
        .toBeVisible();
      await inspectionUnit.locator('[data-inspection-unit-mode="edit"]').click();
      await inspectionUnit.locator(
        `[data-resource-target-id="content:${STUDY_UNIT_CONTENT_ID}"]`
      ).click();
      const manualField = inspectionUnit.locator('[data-manual-edit-path="text"]');
      await expect(manualField).toBeEditable();
      await manualField.fill(MANUAL_STUDY_UNIT_TEXT);
      await inspectionUnit.locator('[data-inspection-manual-action="save"]').click();
      await expect(page.getByText("Edição salva.", { exact: true })).toBeVisible();
      const afterManualRevision = materializationRevision + 1;
      await expect.poll(async () => (await canonicalHeader()).revision)
        .toBe(afterManualRevision);
      await expect(inspectionUnit.getByText(MANUAL_STUDY_UNIT_TEXT, { exact: true }))
        .toBeVisible();

      await inspectionUnit.locator('[data-inspection-unit-mode="edit"]').click();
      await inspectionUnit.locator(
        `[data-resource-target-id="content:${STUDY_UNIT_CONTENT_ID}"]`
      ).click();
      await inspectionUnit.locator("[data-inspection-provider-assistance]").click();
      const providerDialog = page.locator("[data-course-assistance] [role='dialog']");
      await expect(providerDialog).toBeVisible();
      await expect(providerDialog.getByRole("heading", {
        name: `Unidade: ${STUDY_UNIT_TITLE}`
      })).toBeVisible();
      await providerDialog.getByText("Serviço e modelo", { exact: true }).click();
      await providerDialog.getByLabel("Serviço").selectOption("openai");
      await providerDialog.getByLabel("Modelo").selectOption("gpt-5.6-luna");
      await providerDialog.getByLabel("Chave da OpenAI").fill("openai-stub");
      await providerDialog.getByLabel("Mensagem").fill(
        "Torne o trecho mais direto sem mudar seu significado."
      );
      await providerDialog.getByRole("button", { name: "Enviar" }).click();
      await expect(providerDialog.getByText(
        "A formulação pode ficar mais direta sem mudar seu significado."
      ))
        .toBeVisible();
      await expect(providerDialog.getByRole("heading", { name: "Proposta de mudança" }))
        .toBeVisible();
      await providerDialog.getByRole("button", { name: "Confirmar e preparar" }).click();
      await expect(providerDialog.getByRole("heading", { name: "Prévia pronta" }))
        .toBeVisible();
      await providerDialog.getByRole("button", { name: "Aplicar ao rascunho" }).click();
      await expect(inspectionUnit.getByText(PROVIDER_STUDY_UNIT_TEXT, { exact: true }))
        .toBeVisible();
      await inspectionUnit.getByRole("button", { name: "Salvar proposta" }).click();
      await expect(page.getByText("Proposta salva.", { exact: true })).toBeVisible();
      const afterProviderRevision = afterManualRevision + 1;
      await expect.poll(async () => (await canonicalHeader()).revision)
        .toBe(afterProviderRevision);
      await expect(inspectionUnit.getByText(PROVIDER_STUDY_UNIT_TEXT, { exact: true }))
        .toBeVisible();

      expect(providerRequests).toHaveLength(2);
      for (const request of providerRequests) {
        expect(request).toMatchObject({
          method: "POST",
          url: "/v1/responses",
          authorization: "Bearer openai-stub"
        });
        expect(request.body).toContain(MANUAL_STUDY_UNIT_TEXT);
        expect(request.body).toContain(STUDY_UNIT_TITLE);
        expect(request.body).not.toContain(SOURCE_TITLE);
        expect(request.body).not.toContain("fonte-e2e.pdf");
      }
      expect(providerRequests[1].body).toContain("exactComponentContracts");
      expect(contextualEditPersistenceEvidence()).toEqual({
        studyUnitVersion: 3,
        text: PROVIDER_STUDY_UNIT_TEXT,
        manualEvents: 1,
        providerEvents: 1
      });
      expect(sourcePersistenceEvidence(pdfPath)).toEqual({
        sourceRevisions: 1,
        attachments: 1,
        storageObjects: 1
      });
      await expect.poll(async () => JSON.stringify(await readCourseIndexedDb(page, owner.id)))
        .toContain(PROVIDER_STUDY_UNIT_TEXT);
      expect(await canonicalHeader()).toMatchObject({
        courseId,
        revision: afterProviderRevision,
        goal: RETURNED_OBJECTIVE
      });

      const screenshotPath = testInfo.outputPath("autoria-supabase-real-390.png");
      await page.screenshot({ path: screenshotPath, fullPage: true, animations: "disabled" });
      await testInfo.attach("autoria-supabase-real-390", {
        path: screenshotPath,
        contentType: "image/png"
      });
      expect(browserFailures).toEqual([]);
    } finally {
      await context.close().catch(() => undefined);
    }
  });
});
