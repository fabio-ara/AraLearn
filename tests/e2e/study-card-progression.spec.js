import { expect, test } from "@playwright/test";

import { contractToRelationalRows } from "../../src/persistence/contractToRelationalRows.js";
import { renderUiIcon } from "../../src/ui/renderUiIcons.js";
import { createExampleProjectDocument } from "../support/exampleProjectDocument.js";

const USER_ID = "77777777-7777-4777-8777-777777777777";
const PROJECT_URL = process.env.ARALEARN_SUPABASE_URL || "https://project.supabase.test";
const PROJECT_KEY = process.env.ARALEARN_SUPABASE_PUBLISHABLE_KEY || "sb_publishable_e2e";
const EXAMPLE_ROWS = contractToRelationalRows(createExampleProjectDocument());

async function expectSvgControlsCentered(page, selector = "button[title][aria-label]") {
  const measurements = await page.locator(selector).evaluateAll((buttons) => buttons.flatMap((button) => {
    const graphic = button.querySelector("svg, .comment-glyph");
    const controlRect = button.getBoundingClientRect();
    const graphicRect = graphic?.getBoundingClientRect();
    if (!graphicRect || controlRect.width === 0 || controlRect.height === 0) return [];
    return [{
      label: button.getAttribute("aria-label"),
      horizontal: Math.abs(
        (controlRect.left + controlRect.width / 2) - (graphicRect.left + graphicRect.width / 2)
      ),
      vertical: Math.abs(
        (controlRect.top + controlRect.height / 2) - (graphicRect.top + graphicRect.height / 2)
      )
    }];
  }));
  expect(measurements.length).toBeGreaterThan(0);
  measurements.forEach(({ label, horizontal, vertical }) => {
    expect(horizontal, `${label}: desalinhamento horizontal`).toBeLessThanOrEqual(1);
    expect(vertical, `${label}: desalinhamento vertical`).toBeLessThanOrEqual(1);
  });
}

function accessToken() {
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ sub: USER_ID, email: "pessoa@example.com", exp: 4_102_444_800 })}.assinatura`;
}

function remoteChanges(rows = contractToRelationalRows(createExampleProjectDocument())) {
  return Object.entries(rows).flatMap(([storeName, entries]) => entries.map((row) => ({
    storeName,
    entityId: row.id,
    courseId: row.courseId || null,
    operation: "upsert",
    revision: row.revision,
    row
  })));
}

async function mockSupabase(page, {
  catalog = [],
  library = [],
  includeMaterializedCourse = false,
  bootstrapManifestOnly = false
} = {}) {
  const snapshotRows = structuredClone(EXAMPLE_ROWS);
  const changes = remoteChanges(snapshotRows);
  const materializedCourse = changes.find((change) => change.storeName === "courses")?.row;
  const manifestMembership = materializedCourse ? {
    id: "99999999-9999-4999-8999-999999999999",
    courseId: materializedCourse.id,
    userId: USER_ID,
    role: "owner",
    position: 0,
    revision: 1,
    deletedAt: null
  } : null;
  const personalSnapshotRows = manifestMembership
    ? { ...snapshotRows, memberships: [manifestMembership] }
    : snapshotRows;
  const libraryCourses = includeMaterializedCourse && materializedCourse
    ? [{
        course_id: materializedCourse.id,
        title: materializedCourse.title,
        membership_role: "owner"
      }]
    : library;
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
        body: JSON.stringify({
          snapshotMode: bootstrapManifestOnly ? "manifest" : "complete",
          snapshot: bootstrapManifestOnly
            ? { courses: [materializedCourse], memberships: [manifestMembership] }
            : snapshotRows,
          highWaterSequence: 1
        })
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
    if (pathname.endsWith("/rpc/apply_study_path_mutation")) {
      const body = request.postDataJSON();
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          status: "applied",
          mutationId: body.p_mutation.mutationId,
          entityType: body.p_mutation.entityType,
          entityId: body.p_mutation.entityId,
          revision: Number(body.p_mutation.baseRevision || 0) + 1
        })
      });
      return;
    }
    if (pathname.endsWith("/rpc/list_catalog_collections")) {
      const query = String(request.postDataJSON()?.p_query || "").trim().toLocaleLowerCase("pt-BR");
      const matchingCourses = catalog.filter((course) => [
        course.collection_title || "Geral",
        course.collection_description || "",
        course.title,
        course.goal
      ].some((value) => String(value || "").toLocaleLowerCase("pt-BR").includes(query)));
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify(matchingCourses.map((course, position) => ({
          collection_id: course.collection_id || "88888888-8888-4888-8888-888888888888",
          collection_key: course.collection_key || "geral",
          collection_title: course.collection_title || "Geral",
          collection_description: course.collection_description || "",
          collection_position: course.collection_position || 0,
          course_id: course.course_id,
          contract_key: course.contract_key || `course-e2e-${position}`,
          title: course.title,
          goal: course.goal,
          publication_seq: 1,
          content_hash: `hash-${position}`,
          module_count: 1,
          lesson_count: 1,
          is_installed: libraryCourses.some((personal) => personal.source_course_id === course.course_id),
          installed_course_id: libraryCourses.find((personal) => personal.source_course_id === course.course_id)?.course_id || null,
          update_available: false
        })))
      });
      return;
    }
    if (pathname.endsWith("/rpc/list_user_course_summaries")) {
      await route.fulfill({ contentType: "application/json", body: JSON.stringify(libraryCourses) });
      return;
    }
    if (pathname.endsWith("/rpc/get_personal_course_graph")) {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify(personalSnapshotRows)
      });
      return;
    }
    if (pathname.endsWith("/rpc/delete_personal_course")) {
      await route.fulfill({ contentType: "application/json", body: '{"status":"applied"}' });
      return;
    }
    if (pathname.endsWith("/rpc/delete_own_account")) {
      await route.fulfill({ contentType: "application/json", body: '{"status":"deleted"}' });
      return;
    }
    if (pathname.endsWith("/rpc/refresh_personal_course_from_source")) {
      await route.fulfill({ contentType: "application/json", body: '"11111111-1111-4111-8111-111111111111"' });
      return;
    }
    if (pathname.endsWith("/rpc/clone_catalog_course")) {
      await route.fulfill({ contentType: "application/json", body: '"22222222-2222-4222-8222-222222222222"' });
      return;
    }
    await route.fulfill({ status: 404, contentType: "application/json", body: '{"message":"RPC não simulada"}' });
  });
}

async function signIn(page, options = {}) {
  await mockSupabase(page, options);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Acesso" })).toBeVisible();
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
  await expect(page.getByRole("heading", { name: "Acesso" })).toBeVisible();
  await expect(page.locator('[data-action="open-course"]')).toHaveCount(0);
  await expect(page.locator("text=Biblioteca AraLearn")).toHaveCount(0);
});

test("botões iconográficos mantêm o ícone no centro geométrico", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Acesso" })).toBeVisible();
  await page.setContent(`
      <link rel="stylesheet" href="styles-shell-baseline.css">
      <link rel="stylesheet" href="styles.css">
      <main class="startup-recovery-shell">
        <section class="startup-recovery-card">
          <div class="startup-recovery-actions">
            <button class="icon-pill" type="button" title="Tentar novamente" aria-label="Tentar novamente">${renderUiIcon("progress", "startup-recovery-icon")}</button>
            <button class="icon-pill" type="button" title="Recriar cópia" aria-label="Recriar cópia">${renderUiIcon("trash", "startup-recovery-icon")}</button>
          </div>
          <div class="remote-library-footer">
            <button class="icon-ghost" type="button" title="Sincronizar" aria-label="Sincronizar">${renderUiIcon("progress", "remote-library-action-icon")}</button>
          </div>
        </section>
      </main>`);
  await expect(page.locator(".startup-recovery-card")).toBeVisible();
  await expectSvgControlsCentered(page);
});

test("a primeira sincronização monta um curso relacional sem catálogo embarcado", async ({ page }) => {
  await signIn(page);
  const course = page.locator('[data-action="open-course"]');
  await expect(course).toHaveAttribute("data-course-key", "course-matematica-para-informatica");
  await expect(page.getByText("Matemática para Informática", { exact: true }).first()).toBeVisible();
});

test("porta de autenticação é compacta, iconográfica e alinhada", async ({ page }) => {
  await mockSupabase(page);
  await page.goto("/");
  const card = page.locator(".auth-card");
  const heading = page.getByRole("heading", { name: "Acesso" });
  await expect(card).toBeVisible();
  await expect.poll(() => card.evaluate((node) => node.getBoundingClientRect().width)).toBeLessThanOrEqual(330);
  await expect.poll(() => heading.evaluate((node) => Number.parseFloat(getComputedStyle(node).fontSize))).toBeLessThanOrEqual(14);
  const actionButtons = page.locator(".auth-actions button");
  await expect(actionButtons).toHaveCount(3);
  await expect.poll(() => actionButtons.evaluateAll((buttons) => buttons.every(
    (button) => button.textContent.trim() === "" && Boolean(button.querySelector("svg"))
  ))).toBe(true);
  await expectSvgControlsCentered(page, ".auth-actions button");
});

test("exclusão da conta exige confirmação e retorna à porta de acesso", async ({ page }) => {
  await signIn(page);
  await page.getByRole("button", { name: "Abrir biblioteca e sincronização" }).click();
  const signOutButton = page.getByRole("button", { name: "Sair da conta" });
  const deleteAccountButton = page.getByRole("button", { name: "Excluir conta" });
  await expect(deleteAccountButton).toHaveClass(/\bis-danger\b/u);
  const [signOutBox, deleteAccountBox] = await Promise.all([
    signOutButton.boundingBox(),
    deleteAccountButton.boundingBox()
  ]);
  expect(signOutBox).not.toBeNull();
  expect(deleteAccountBox).not.toBeNull();
  expect(deleteAccountBox.x).toBeGreaterThan(signOutBox.x);
  await expectSvgControlsCentered(page, ".remote-library-account-actions button");

  await deleteAccountButton.click();
  await expect(page.getByRole("alertdialog", { name: "Excluir conta" })).toBeVisible();
  await page.getByRole("button", { name: "Cancelar exclusão" }).click();
  await expect(page.getByRole("alertdialog", { name: "Excluir conta" })).toBeHidden();

  await page.getByRole("button", { name: "Excluir conta" }).click();
  const deletion = page.waitForRequest((request) => request.url().endsWith("/rpc/delete_own_account"));
  await page.getByRole("button", { name: "Excluir conta definitivamente" }).click();
  const request = await deletion;
  expect(request.postDataJSON()).toEqual({ p_confirmation: "EXCLUIR" });
  await expect(page.getByRole("heading", { name: "Acesso" })).toBeVisible({ timeout: 15_000 });
});

test("uma réplica limpa baixa a árvore indicada pelo manifesto antes de abrir a home", async ({ page }) => {
  const graphRequests = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.endsWith("/rpc/get_personal_course_graph")) {
      graphRequests.push(request.postDataJSON()?.p_course_id);
    }
  });

  await signIn(page, { bootstrapManifestOnly: true });

  await expect(page.getByText("Matemática para Informática", { exact: true }).first()).toBeVisible();
  expect(graphRequests).toEqual([EXAMPLE_ROWS.courses[0].id]);
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
    }, {
      collection_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      collection_key: "segunda",
      collection_title: "Segunda coleção",
      collection_position: 1,
      course_id: "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa",
      title: "Outro curso oficial",
      goal: "Outro metadado remoto"
    }]
  });
  await page.getByRole("button", { name: "Abrir biblioteca e sincronização" }).click();
  await expect(page.getByRole("tab", { name: "Coleções" })).toHaveAttribute("aria-selected", "true");
  await expect(page.locator(".remote-catalog-collection")).toHaveCount(2);
  await expect.poll(() => page.locator(".remote-catalog-collection").evaluateAll(
    (collections) => collections.every((collection) => collection.open)
  )).toBe(true);
  await expect(page.getByText("Geral (1)", { exact: true })).toBeVisible();
  await expect(page.getByText("Segunda coleção (1)", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Curso oficial remoto" })).toBeVisible();
  await expect(page.locator(".remote-collection-courses .card-subtitle")).toHaveCount(0);

  const search = page.getByRole("searchbox", { name: "Pesquisar cursos no catálogo" });
  await search.fill("Outro curso");
  await expect(page.getByRole("heading", { name: "Outro curso oficial" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Curso oficial remoto" })).toHaveCount(0);
  await search.fill("");
  await expect(page.getByRole("heading", { name: "Curso oficial remoto" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Outro curso oficial" })).toBeVisible();

  const closeLibrary = page.getByRole("button", { name: "Fechar biblioteca" });
  const [tabRowBox, closeBox] = await Promise.all([
    page.locator(".remote-library-tab-row").boundingBox(),
    closeLibrary.boundingBox()
  ]);
  expect(closeBox).toMatchObject({ width: 34, height: 34 });
  expect(Math.abs(
    (closeBox.y + closeBox.height / 2) - (tabRowBox.y + tabRowBox.height / 2)
  )).toBeLessThanOrEqual(1);
  await expectSvgControlsCentered(page, ".remote-library-close");
  await closeLibrary.click();
  await expect(page.locator("[data-library-overlay]")).toBeHidden();
});

test("a biblioteca permite sincronizar, atualizar e remover somente a cópia pessoal", async ({ page }) => {
  const personalCourse = EXAMPLE_ROWS.courses[0];
  const personalCourseId = personalCourse.id;
  const sourceCourseId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const nextOfficialCourseId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
  await signIn(page, {
    library: [{
      course_id: personalCourseId,
      source_course_id: sourceCourseId,
      title: "Minha cópia pessoal",
      goal: "Descrição curta para o cartão da biblioteca.",
      membership_role: "owner",
      update_available: true,
      is_personalized: false
    }],
    catalog: [{
      course_id: sourceCourseId,
      title: "Curso já adicionado",
      goal: "Não deve aparecer novamente."
    }, {
      course_id: nextOfficialCourseId,
      title: "Novo curso oficial",
      goal: "Disponível para adicionar."
    }]
  });
  await page.getByRole("button", { name: "Abrir biblioteca e sincronização" }).click();
  await expect(page.getByRole("tab", { name: "Coleções" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("searchbox", { name: "Pesquisar cursos no catálogo" })).toBeVisible();
  await page.getByRole("tab", { name: "Trilhas" }).click();
  await expect(page.getByRole("searchbox", { name: "Pesquisar cursos no catálogo" })).toBeHidden();
  const personalCard = page.locator("[data-course-row]").filter({ hasText: "Minha cópia pessoal" });
  await expect(personalCard).toHaveClass(/remote-study-path-course-row/u);
  await expect(page.getByRole("button", { name: "Sincronizar este dispositivo com a sua conta" })).toBeVisible();
  await expect(personalCard.getByRole("button", { name: "Atualizar cópia com a publicação oficial" })).toBeVisible();
  await expect(personalCard.getByRole("button", { name: "Remover minha cópia deste curso" })).toBeVisible();
  const pathHeadingTypography = await page.locator(".remote-study-path-header .card-title").first().evaluate((node) => {
    const style = getComputedStyle(node);
    return { family: style.fontFamily, size: style.fontSize, weight: style.fontWeight };
  });
  const pathCourseTypography = await personalCard.locator(":scope > span").evaluate((node) => {
    const style = getComputedStyle(node);
    return { family: style.fontFamily, size: style.fontSize, weight: style.fontWeight };
  });
  await expectSvgControlsCentered(page, ".remote-library-panel button[title][aria-label]");
  await page.getByRole("tab", { name: "Coleções" }).click();
  const installedCourse = page.locator(".remote-collection-courses .remote-course-card").filter({ hasText: "Curso já adicionado" });
  const availableCourse = page.locator(".remote-collection-courses .remote-course-card").filter({ hasText: "Novo curso oficial" });
  await expect(installedCourse).toHaveClass(/\bis-installed\b/u);
  const removeInstalledCourse = installedCourse.getByRole("button", { name: "Remover minha cópia deste curso" });
  await expect(removeInstalledCourse).toHaveAttribute(
    "data-course-id",
    personalCourseId
  );
  await expect(availableCourse).not.toHaveClass(/\bis-installed\b/u);
  await expect(page.getByRole("button", { name: "Adicionar aos meus cursos" })).toHaveCount(1);
  const collectionHeadingTypography = await page.locator(".remote-catalog-collection > summary > span").first().evaluate((node) => {
    const style = getComputedStyle(node);
    return { family: style.fontFamily, size: style.fontSize, weight: style.fontWeight };
  });
  const collectionCourseTypography = await installedCourse.locator(".card-title").evaluate((node) => {
    const style = getComputedStyle(node);
    return { family: style.fontFamily, size: style.fontSize, weight: style.fontWeight };
  });
  expect(pathHeadingTypography).toEqual(collectionHeadingTypography);
  expect(pathCourseTypography).toEqual(collectionCourseTypography);
  expect(pathCourseTypography.weight).toBe("400");

  page.once("dialog", (dialog) => dialog.accept());
  const deletion = page.waitForRequest((request) => request.url().endsWith("/rpc/delete_personal_course"));
  await removeInstalledCourse.click();
  const request = await deletion;
  expect(request.postDataJSON()).toMatchObject({
    p_course_id: personalCourseId,
    p_base_revision: personalCourse.revision
  });
  expect(request.postDataJSON().p_course_id).not.toBe(sourceCourseId);
});

test("a biblioteca cria uma trilha pessoal compacta", async ({ page }) => {
  await signIn(page, { includeMaterializedCourse: true });
  await page.getByRole("button", { name: "Abrir biblioteca e sincronização" }).click();
  await page.getByRole("tab", { name: "Trilhas" }).click();
  await page.getByRole("textbox", { name: "Nome da nova trilha" }).fill("Mestrado");
  await page.getByRole("button", { name: "Criar trilha" }).click();
  const defaultPath = page.locator(".remote-study-path-default");
  await expect(page.locator(".remote-study-path-card").first()).toHaveClass(/remote-study-path-default/u);
  await expect(defaultPath.getByRole("heading", { name: "Sem trilha (1)" })).toBeVisible();
  await expect(defaultPath.getByRole("button", { name: "A trilha padrão não pode ser renomeada" })).toBeDisabled();
  await expect(defaultPath.getByRole("button", { name: "A trilha padrão não pode ser excluída" })).toBeDisabled();
  await expect(page.getByRole("heading", { name: "Mestrado (0)" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Adicionar curso à trilha" })).toHaveCount(0);
  const looseCourse = defaultPath.locator(".remote-loose-course").first();
  const looseCourseTitle = await looseCourse.locator("[data-course-row]").getAttribute("data-course-title");
  await looseCourse.getByRole("button", { name: "Adicionar a uma trilha" }).click();
  const destination = looseCourse.locator(".remote-study-path-choice").filter({ hasText: "Mestrado" });
  await expect(destination).toHaveJSProperty("tagName", "DIV");
  await destination.locator("span").click();
  await expect(defaultPath.getByRole("heading", { name: "Sem trilha (1)" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Mestrado (0)" })).toBeVisible();
  const addToPath = destination.getByRole("button", { name: "Adicionar a Mestrado" });
  const removeCourse = looseCourse.getByRole("button", { name: "Remover minha cópia deste curso" });
  const [destinationBox, addBox, removeBox] = await Promise.all([
    destination.boundingBox(),
    addToPath.boundingBox(),
    removeCourse.boundingBox()
  ]);
  expect(addBox).toMatchObject({ width: 30, height: 30 });
  expect(removeBox).toMatchObject({ width: 30, height: 30 });
  expect(Math.abs((addBox.x + addBox.width) - (removeBox.x + removeBox.width))).toBeLessThanOrEqual(1);
  expect(Math.abs((addBox.y + addBox.height / 2) - (destinationBox.y + destinationBox.height / 2))).toBeLessThanOrEqual(1);
  await addToPath.click();
  const path = page.locator(".remote-study-path-card:not(.remote-study-path-default)").filter({
    has: page.getByRole("heading", { name: "Mestrado (1)" })
  });
  await expect(path).toHaveAttribute("open", "");
  await expect(path.getByRole("heading", { name: "Mestrado (1)" })).toBeVisible();
  await expect(path.locator(".remote-study-path-course-row")).toContainText(looseCourseTitle);
  await expect(defaultPath.locator(".remote-loose-course")).toHaveCount(0);
  await expect(defaultPath.getByRole("heading", { name: "Sem trilha (0)" })).toBeVisible();
  const emptyTypography = await defaultPath.locator(".empty-state-copy").evaluate((element) => {
    const style = getComputedStyle(element);
    return { family: style.fontFamily, size: style.fontSize, weight: style.fontWeight };
  });
  const courseTypography = await path.locator("[data-course-row] > span").evaluate((element) => {
    const style = getComputedStyle(element);
    return { family: style.fontFamily, size: style.fontSize, weight: style.fontWeight };
  });
  expect(emptyTypography).toEqual(courseTypography);
});

test("recarga online substitui shell antigo preservado no cache", async ({ browser }) => {
  const context = await browser.newContext({
    viewport: { width: 1200, height: 800 },
    screen: { width: 1200, height: 800 },
    isMobile: false,
    hasTouch: false,
    deviceScaleFactor: 1
  });
  const page = await context.newPage();
  try {
    await signIn(page);
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
      const cache = await caches.open("aralearn-shell-0.1.0-r4");
      const cssUrl = new URL("./styles-shell-baseline.css", location.href).href;
      const overlayUrl = new URL("./src/ui/RemoteLibraryOverlay.js", location.href).href;
      await cache.put(cssUrl, new Response(
        "#app-root{justify-content:flex-start!important}.local-durability{display:flex!important}",
        { headers: { "Content-Type": "text/css" } }
      ));
      await cache.put(overlayUrl, new Response(`
        export function resolveLibraryCourseUpdateAction() {
          return { action: "current", label: "Atual" };
        }
        export function createRemoteLibraryOverlay({ root }) {
          root.innerHTML = '<button data-library-open aria-label="Abrir biblioteca de cursos">pasta antiga</button>';
          return { open() {}, refresh() {} };
        }
      `, { headers: { "Content-Type": "text/javascript" } }));
    });

    await page.reload();
    const shell = page.locator(".app-shell");
    await expect(shell).toBeVisible();
    await expect.poll(() => page.locator("#app-root").evaluate(
      (node) => getComputedStyle(node).justifyContent
    )).toBe("center");
    const shellBox = await shell.boundingBox();
    const viewportWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(Math.abs(shellBox.x - ((viewportWidth - shellBox.width) / 2))).toBeLessThan(2);
    await expect(page.locator("[data-library-open]")).toHaveCount(0);
    await expect(page.locator("[data-local-durability]")).toBeHidden();
  } finally {
    await context.close();
  }
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

  await page.getByRole("button", { name: "Abrir biblioteca e sincronização" }).click();
  await page.getByRole("button", { name: "Sair da conta" }).click();

  await expect(secondPage.getByText("Sessão encerrada")).toHaveCount(0);
  await expect(secondPage.getByRole("heading", { name: "Acesso" })).toBeVisible({ timeout: 15_000 });
  await expect(secondPage.locator('[data-action="open-course"]')).toHaveCount(0);
});
