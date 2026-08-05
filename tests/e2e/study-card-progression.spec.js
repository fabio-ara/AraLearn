import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

import { contractToRelationalRows } from "../../src/persistence/contractToRelationalRows.js";
import { canonicalRevisionHash } from "../../src/storage/canonicalRevision.js";
import { renderUiIcon } from "../../src/ui/renderUiIcons.js";
import { createExampleProjectDocument } from "../support/exampleProjectDocument.js";

const USER_ID = "77777777-7777-4777-8777-777777777777";
const PROJECT_URL = process.env.ARALEARN_SUPABASE_URL || "https://project.supabase.test";
const PROJECT_KEY = process.env.ARALEARN_SUPABASE_PUBLISHABLE_KEY || "sb_publishable_e2e";
const EXAMPLE_ROWS = contractToRelationalRows(createExampleProjectDocument());

function largeCourseRows() {
  return contractToRelationalRows({
    contract: "aralearn.contract",
    version: 4,
    kind: "project",
    courses: [JSON.parse(readFileSync(new URL(
      "../../supabase/fixtures/catalog/dataprev-analista-processamento-seed-course.json",
      import.meta.url
    ), "utf8"))]
  });
}

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

async function mockSupabase(page, {
  catalog = [],
  includeSelectedCourse = true,
  holdPush = false,
  replicaRows = EXAMPLE_ROWS
} = {}) {
  const revisionDocument = createExampleProjectDocument();
  const revisionHash = await canonicalRevisionHash(revisionDocument);
  const graph = structuredClone(replicaRows);
  const personalState = Object.fromEntries([
    "lessonProgress", "cardProgress", "comments", "studyPaths", "studyPathCourses"
  ].map((storeName) => [
    storeName,
    new Map((graph[storeName] || []).map((row) => [String(row.id), structuredClone(row)]))
  ]));
  Object.keys(personalState).forEach((storeName) => delete graph[storeName]);
  delete graph.projectMeta;
  const officialCourse = graph.courses?.[0] || null;
  const publicationSeq = 1;
  const contentHash = revisionHash;
  const selectionId = "99999999-9999-4999-8999-999999999999";
  const selectedCourses = new Map();
  if (includeSelectedCourse && officialCourse) {
    selectedCourses.set(officialCourse.id, {
      id: selectionId,
      userId: USER_ID,
      courseId: officialCourse.id,
      courseOrigin: "catalog",
      position: 0,
      publicationSeq,
      contentHash,
      selectedAt: "2026-07-19T12:00:00.000Z",
      updatedAt: "2026-07-19T12:00:00.000Z",
      deletedAt: null
    });
  }
  let remoteSequence = 1;
  const changes = [];
  const personalSnapshotRows = () => ({
    courseSelections: [...selectedCourses.values()].map((row) => structuredClone(row)),
    ...Object.fromEntries(Object.entries(personalState).map(([storeName, rows]) => [
      storeName,
      [...rows.values()].map((row) => structuredClone(row))
    ]))
  });
  const appendSelectionChange = (selection, operation) => {
    remoteSequence += 1;
    changes.push({
      sequence: remoteSequence,
      storeName: "user_course_selections",
      entityId: selection.id,
      courseId: selection.courseId,
      operation,
      updatedAt: selection.updatedAt,
      row: operation === "delete" ? null : structuredClone(selection)
    });
  };
  const remoteCatalogRows = catalog.length
    ? catalog
    : officialCourse
      ? [{
          collection_id: "88888888-8888-4888-8888-888888888888",
          collection_key: "geral",
          collection_title: "Geral",
          collection_description: "",
          collection_position: 0,
          course_id: officialCourse.id,
          contract_key: officialCourse.contractKey,
          title: officialCourse.title,
          goal: officialCourse.goal || ""
        }]
      : [];
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
      const afterSequence = Number(body.p_after_sequence || 0);
      const pendingChanges = changes.filter((change) => change.sequence > afterSequence);
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          changes: pendingChanges,
          nextSequence: pendingChanges.at(-1)?.sequence || Math.max(afterSequence, remoteSequence),
          hasMore: false
        })
      });
      return;
    }
    if (pathname.endsWith("/rpc/bootstrap_replica")) {
      const snapshot = personalSnapshotRows();
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          snapshot,
          selectedCourses: snapshot.courseSelections.map((selection) => ({
            courseId: selection.courseId,
            publicationSeq: selection.publicationSeq,
            contentHash: selection.contentHash
          })),
          highWaterSequence: remoteSequence
        })
      });
      return;
    }
    if (
      pathname.endsWith("/rpc/apply_sync_batch") ||
      pathname.endsWith("/rpc/apply_non_punitive_study_state_batch_v1") ||
      pathname.endsWith("/rpc/apply_situated_comment_batch_v1")
    ) {
      const body = request.postDataJSON();
      if (holdPush) {
        await route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ code: "57P03", message: "Temporariamente indisponível." })
        });
        return;
      }
      const results = (body.p_mutations || []).map((mutation) => {
        const rows = personalState[mutation.entityType];
        if (!rows) {
          return { mutationId: mutation.mutationId, status: "rejected", code: "22023" };
        }
        const previous = rows.get(String(mutation.entityId)) || {};
        const operation = mutation.operation === "delete" ? "delete" : "upsert";
        const row = operation === "delete"
          ? null
          : {
              ...previous,
              ...mutation.payload,
              id: mutation.entityId,
              ...(mutation.entityType === "studyPaths" ? { ownerId: USER_ID } : { userId: USER_ID }),
              updatedAt: "2026-07-19T12:03:00.000Z",
              deletedAt: null
            };
        if (row) rows.set(String(mutation.entityId), row);
        else rows.delete(String(mutation.entityId));
        remoteSequence += 1;
        changes.push({
          sequence: remoteSequence,
          storeName: mutation.entityType,
          entityId: mutation.entityId,
          courseId: mutation.courseId || row?.courseId || previous.courseId || null,
          operation,
          updatedAt: row?.updatedAt || "2026-07-19T12:03:00.000Z",
          row
        });
        return { mutationId: mutation.mutationId, status: "applied", row };
      });
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ results })
      });
      return;
    }
    if (pathname.endsWith("/rpc/list_trail_items_v1")) {
      const items = [...selectedCourses.values()].map((selection) => {
        const course = remoteCatalogRows.find((entry) => entry.course_id === selection.courseId) ||
          (selection.courseId === officialCourse?.id ? {
            title: officialCourse.title,
            goal: officialCourse.goal || "",
            contract_key: officialCourse.contractKey
          } : {});
        return {
          itemId: `selection:${selection.id}`,
          workspaceId: null,
          courseKey: course.contract_key || selection.courseId,
          courseId: selection.courseId,
          selectionId: selection.id,
          kind: "course",
          source: "selection",
          origin: selection.courseOrigin,
          title: course.title || "Curso",
          description: course.goal || "",
          moduleCount: 1,
          lessonCount: 1,
          microsequenceCount: 1,
          cardCount: 1,
          canEdit: selection.courseOrigin === "private",
          canDelete: selection.courseOrigin === "private",
          position: selection.position,
          updatedAt: selection.updatedAt
        };
      });
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          items,
          hasMore: false,
          nextCursor: null,
          capabilities: { catalogManage: false, catalogReview: false }
        })
      });
      return;
    }
    if (pathname.endsWith("/rpc/list_catalog_collections")) {
      const query = String(request.postDataJSON()?.p_query || "").trim().toLocaleLowerCase("pt-BR");
      const matchingCourses = remoteCatalogRows.filter((course) => [
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
          is_selected: selectedCourses.has(course.course_id),
          selection_id: selectedCourses.get(course.course_id)?.id || null
        })))
      });
      return;
    }
    if (pathname.endsWith("/rpc/list_user_course_summaries")) {
      const rows = [...selectedCourses.values()].map((selection) => {
        const course = remoteCatalogRows.find((entry) => entry.course_id === selection.courseId) ||
          (selection.courseId === officialCourse?.id ? {
            title: officialCourse.title,
            goal: officialCourse.goal || "",
            contract_key: officialCourse.contractKey
          } : {});
        return {
          selection_id: selection.id,
          course_id: selection.courseId,
          contract_key: course.contract_key || "",
          title: course.title || "Curso",
          goal: course.goal || "",
          position: selection.position,
          publication_seq: selection.publicationSeq,
          content_hash: selection.contentHash,
          course_origin: selection.courseOrigin
        };
      });
      await route.fulfill({ contentType: "application/json", body: JSON.stringify(rows) });
      return;
    }
    if (pathname.startsWith("/functions/v1/aralearn-course-revisions/")) {
      const [, , , , courseId, requestedHash] = pathname.split("/");
      if (!selectedCourses.has(courseId) || courseId !== officialCourse?.id) {
        await route.fulfill({
          status: 403,
          contentType: "application/json",
          body: JSON.stringify({ code: "42501", message: "Curso não selecionado." })
        });
        return;
      }
      if (requestedHash !== revisionHash) {
        await route.fulfill({
          status: 404,
          contentType: "application/json",
          body: JSON.stringify({ code: "revision_not_found", message: "Revisão não encontrada." })
        });
        return;
      }
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify(revisionDocument)
      });
      return;
    }
    if (pathname.endsWith("/rpc/delete_own_account")) {
      await route.fulfill({ contentType: "application/json", body: '{"status":"deleted"}' });
      return;
    }
    if (pathname.endsWith("/rpc/select_catalog_course")) {
      const body = request.postDataJSON();
      const courseId = body.p_course_id;
      let selection = selectedCourses.get(courseId);
      if (!selection) {
        selection = {
          id: courseId === officialCourse?.id ? selectionId : crypto.randomUUID(),
          userId: USER_ID,
          courseId,
          courseOrigin: "catalog",
          position: selectedCourses.size,
          publicationSeq,
          contentHash,
          selectedAt: "2026-07-19T12:01:00.000Z",
          updatedAt: "2026-07-19T12:01:00.000Z",
          deletedAt: null
        };
        selectedCourses.set(courseId, selection);
        appendSelectionChange(selection, "upsert");
      }
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          status: "applied",
          mutationId: body.p_mutation_id,
          selectionId: selection.id,
          courseId,
          desiredSelected: true,
          currentSelected: true,
          superseded: false,
          row: selection
        })
      });
      return;
    }
    if (pathname.endsWith("/rpc/unselect_catalog_course")) {
      const body = request.postDataJSON();
      const selection = selectedCourses.get(body.p_course_id);
      if (selection) {
        selectedCourses.delete(body.p_course_id);
        appendSelectionChange({
          ...selection,
          updatedAt: "2026-07-19T12:02:00.000Z",
          deletedAt: "2026-07-19T12:02:00.000Z"
        }, "delete");
      }
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          status: "applied",
          mutationId: body.p_mutation_id,
          selectionId: selection?.id || null,
          courseId: body.p_course_id,
          desiredSelected: false,
          currentSelected: false,
          superseded: false
        })
      });
      return;
    }
    await route.fulfill({ status: 404, contentType: "application/json", body: '{"message":"RPC não simulada"}' });
  });
}

async function signIn(page, options = {}) {
  await mockSupabase(page, options);
  await page.goto("/");
  await expect(page.locator(".auth-brand")).toBeVisible();
  await page.locator('input[name="email"]').fill("pessoa@example.com");
  await page.locator('input[name="password"]').fill("senha-segura");
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.locator('[data-action="open-course"]')).toHaveCount(1, { timeout: 20_000 });
}

async function readLocalStore(page, storeName) {
  return page.evaluate(async ({ userId, requestedStore }) => {
    const request = indexedDB.open(`aralearn-relational-v4-r2:user:${userId}`);
    const database = await new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const transaction = database.transaction(requestedStore, "readonly");
    const rowsRequest = transaction.objectStore(requestedStore).getAll();
    const rows = await new Promise((resolve, reject) => {
      rowsRequest.onsuccess = () => resolve(rowsRequest.result);
      rowsRequest.onerror = () => reject(rowsRequest.error);
    });
    database.close();
    return rows;
  }, { userId: USER_ID, requestedStore: storeName });
}

test("sem sessão o artefato mostra somente a porta de autenticação", async ({ page }) => {
  await mockSupabase(page);
  await page.goto("/");
  await expect(page.locator(".auth-brand")).toBeVisible();
  await expect(page.locator('[data-action="open-course"]')).toHaveCount(0);
  await expect(page.locator("text=Biblioteca AraLearn")).toHaveCount(0);
});

test("botões iconográficos mantêm o ícone no centro geométrico", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".auth-brand")).toBeVisible();
  await page.setContent(`
      <link rel="stylesheet" href="styles-tokens.css">
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

test("shell consolidado permanece operável em paisagem, tablet e desktop", async ({ page }) => {
  await signIn(page);
  const assertViewportFit = async () => {
    const layout = await page.evaluate(() => ({
      viewportWidth: document.documentElement.clientWidth,
      documentWidth: document.documentElement.scrollWidth,
      appWidth: document.querySelector("#app-root")?.scrollWidth || 0,
      appClientWidth: document.querySelector("#app-root")?.clientWidth || 0
    }));
    expect(layout.documentWidth).toBeLessThanOrEqual(layout.viewportWidth);
    expect(layout.appWidth).toBeLessThanOrEqual(layout.appClientWidth);
  };

  for (const viewport of [
    { width: 844, height: 390 },
    { width: 768, height: 1024 },
    { width: 1280, height: 800 }
  ]) {
    await page.setViewportSize(viewport);
    await assertViewportFit();
    await expect(page.locator('[data-action="open-course"]')).toBeVisible();
  }

  await page.keyboard.press("Tab");
  await expect(page.locator(":focus-visible")).toHaveCount(1);
  await page.locator('[data-action="open-course"]').click();
  await page.locator('[data-action="open-module"][data-module-key="module-teoria-dos-grafos"]').click();
  await page.locator('[data-action="open-lesson"][data-lesson-key="lesson-vocabulario-contagem"]').click();
  await page.locator('[data-action="play-microsequence"]').first().click();
  await expect(page.locator(".runtime-card-title")).toBeVisible();
  await assertViewportFit();
  await page.evaluate(() => globalThis.AraLearnTheme.setPreference("dark"));
  await expect(page.locator("html")).toHaveAttribute("data-color-mode", "dark");
  await assertViewportFit();
});

test("feedback de durabilidade permanece na coluna central do app", async ({ page }) => {
  await page.setContent(`
      <link rel="stylesheet" href="styles-tokens.css">
      <link rel="stylesheet" href="styles-shell-baseline.css">
      <link rel="stylesheet" href="styles.css">
      <main id="app-root">
        <section class="app-shell"></section>
        <aside class="local-durability" data-state="error">Não foi possível salvar.</aside>
      </main>`);
  const centers = await page.evaluate(() => {
    const viewportCenter = window.innerWidth / 2;
    const centerOf = (selector) => {
      const bounds = document.querySelector(selector).getBoundingClientRect();
      return bounds.left + bounds.width / 2;
    };
    return {
      viewportCenter,
      durabilityCenter: centerOf(".local-durability")
    };
  });
  expect(Math.abs(centers.durabilityCenter - centers.viewportCenter)).toBeLessThan(2);
});

test("a primeira sincronização monta um curso relacional sem catálogo embarcado", async ({ page }) => {
  await signIn(page);
  const course = page.locator('[data-action="open-course"]');
  await expect(course).toHaveAttribute("data-course-key", "course-matematica-para-informatica");
  await expect(page.getByText("Matemática para Informática", { exact: true }).first()).toBeVisible();
});

test("porta de autenticação ocupa a tela, permanece iconográfica e alinhada", async ({ page }) => {
  await mockSupabase(page);
  await page.goto("/");
  const card = page.locator(".auth-card");
  await expect(card).toBeVisible();
  const dimensions = await page.evaluate(() => {
    const bounds = document.querySelector(".auth-card").getBoundingClientRect();
    const panelBounds = document.querySelector(".auth-panel").getBoundingClientRect();
    const title = document.querySelector(".auth-screen-reader-title");
    return {
      widthDifference: Math.abs(window.innerWidth - bounds.width),
      heightDifference: Math.abs(window.innerHeight - bounds.height),
      panelCenterOffset: Math.abs(panelBounds.top + panelBounds.height / 2 - window.innerHeight / 2),
      titleWidth: title.getBoundingClientRect().width
    };
  });
  expect(dimensions.widthDifference).toBeLessThanOrEqual(1);
  expect(dimensions.heightDifference).toBeLessThanOrEqual(1);
  expect(dimensions.panelCenterOffset).toBeLessThanOrEqual(2);
  expect(dimensions.titleWidth).toBeLessThanOrEqual(1);
  const actionButtons = page.locator(".auth-actions button");
  await expect(actionButtons).toHaveCount(3);
  await expect.poll(() => actionButtons.evaluateAll((buttons) => buttons.every(
    (button) => button.textContent.trim() === "" && Boolean(button.querySelector("svg"))
  ))).toBe(true);
  await expectSvgControlsCentered(page, ".auth-actions button");

  await page.getByRole("button", { name: "Criar conta" }).first().click();
  await expect(page.locator(".auth-screen-reader-title")).toHaveText("Criar conta");
  await expect(card).toBeVisible();
});

test("aparência muda no próprio dispositivo sem recarregar o curso", async ({ page }) => {
  await signIn(page);
  await page.locator('[data-action="open-central"]').first().click();
  const darkChoice = page.locator('[data-theme-choice="dark"]');
  await expect(darkChoice).toBeVisible();

  await darkChoice.click();
  await expect(page.locator("html")).toHaveAttribute("data-color-mode", "dark");
  await expect(darkChoice).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator('[data-action="open-course"]')).toHaveCount(1);
  expect(await page.evaluate(() => localStorage.getItem("aralearn.ui.theme"))).toBe("dark");

  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-color-mode", "dark");
  await expect(page.locator('[data-action="open-course"]')).toHaveCount(1);

  await page.locator('[data-action="open-central"]').first().click();
  await page.locator('[data-theme-choice="system"]').click();
  expect(await page.evaluate(() => localStorage.getItem("aralearn.ui.theme"))).toBeNull();
});

test("exclusão da conta exige confirmação e retorna à porta de acesso", async ({ page }) => {
  await signIn(page);
  await page.getByRole("button", { name: "Abrir painel" }).click();
  const signOutButton = page.getByRole("button", { name: "Sair" });
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

  page.once("dialog", (dialog) => dialog.dismiss());
  await deleteAccountButton.click();

  const deletion = page.waitForRequest((request) => request.url().endsWith("/rpc/delete_own_account"));
  page.once("dialog", (dialog) => dialog.accept());
  await deleteAccountButton.click();
  const request = await deletion;
  expect(request.postDataJSON()).toEqual({ p_confirmation: "EXCLUIR" });
  await expect(page.locator(".auth-brand")).toBeVisible({ timeout: 15_000 });
});

test("uma réplica limpa baixa a revisão indicada pelo manifesto antes de abrir a home", async ({ page }) => {
  const revisionRequests = [];
  page.on("request", (request) => {
    const pathname = new URL(request.url()).pathname;
    if (pathname.startsWith("/functions/v1/aralearn-course-revisions/")) {
      revisionRequests.push(pathname.split("/")[4]);
    }
  });

  await signIn(page);

  await expect(page.getByText("Matemática para Informática", { exact: true }).first()).toBeVisible();
  expect(revisionRequests).toEqual([EXAMPLE_ROWS.courses[0].id]);
});

test("continuar cria somente estado funcional de retomada", async ({ page }) => {
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await signIn(page, { holdPush: true });
  await page.locator('[data-action="open-course"]').tap();
  await page.locator('[data-action="open-module"][data-module-key="module-teoria-dos-grafos"]').tap();
  await page.locator('[data-action="open-lesson"][data-lesson-key="lesson-vocabulario-contagem"]').tap();
  await page.locator('[data-action="play-microsequence"][data-microsequence-key="micro-grafo-como-conjuntos"]').tap();

  await expect(page.locator(".runtime-card-title")).toHaveText("Grafo como dois conjuntos");
  await page.locator('[data-action="next-card"]').tap();
  await page.locator('[data-action="continue-popup-next"]').tap();
  await expect(page.locator(".runtime-card-title")).toHaveText("Um grafo pequeno");

  const outbox = await readLocalStore(page, "outbox");
  expect(outbox.length).toBeGreaterThan(0);
  expect(new Set(outbox.map((entry) => entry.entityType))).toEqual(new Set(["lessonProgress", "cardProgress"]));
  expect(outbox.every((entry) => !entry.payload?.courses && !entry.payload?.lessons)).toBe(true);
  for (const entry of outbox) {
    expect(entry.payload).not.toHaveProperty("firstViewedAt");
    expect(entry.payload).not.toHaveProperty("lastActivityAt");
    expect(entry.payload).not.toHaveProperty("attempts");
    expect(entry.payload).not.toHaveProperty("lastResult");
  }
  expect(pageErrors).toEqual([]);
});

test("Rever persiste uma decisão pessoal sem registrar desempenho", async ({ page }) => {
  await signIn(page, { holdPush: true });
  await page.locator('[data-action="open-course"]').tap();
  await page.locator('[data-action="open-module"][data-module-key="module-teoria-dos-grafos"]').tap();
  await page.locator('[data-action="open-lesson"][data-lesson-key="lesson-vocabulario-contagem"]').tap();
  await page.locator('[data-action="play-microsequence"][data-microsequence-key="micro-grafo-como-conjuntos"]').tap();

  await page.getByRole("button", { name: "Marcar card para rever" }).tap();
  await expect(page.getByRole("button", { name: "Retirar card de Rever" }))
    .toHaveAttribute("aria-pressed", "true");

  const outbox = await readLocalStore(page, "outbox");
  const reviewMutation = outbox.find((entry) => entry.entityType === "cardProgress");
  expect(reviewMutation?.payload?.reviewMarkedAt).toBeTruthy();
  expect(reviewMutation?.payload).not.toHaveProperty("attempts");
  expect(reviewMutation?.payload).not.toHaveProperty("lastResult");
  expect(await readLocalStore(page, "lessonProgress")).toHaveLength(0);
});

test("observação situada fica editável no card enquanto aguarda reconexão", async ({ page }) => {
  await signIn(page, { holdPush: true });
  await page.locator('[data-action="open-course"]').tap();
  await page.locator('[data-action="open-module"][data-module-key="module-teoria-dos-grafos"]').tap();
  await page.locator('[data-action="open-lesson"][data-lesson-key="lesson-vocabulario-contagem"]').tap();
  await page.locator('[data-action="play-microsequence"][data-microsequence-key="micro-grafo-como-conjuntos"]').tap();

  await page.getByRole("button", { name: "Observação do card" }).tap();
  await page.getByText("Possível erro", { exact: true }).tap();
  await page.locator("[data-field='card-comment']").fill("Conferir a definição apresentada.");
  await page.getByRole("button", { name: "Salvar" }).tap();
  await expect(page.getByRole("button", { name: "Observação do card: 1" })).toBeVisible();

  await expect.poll(async () => {
    const outbox = await readLocalStore(page, "outbox");
    return outbox.find((entry) => entry.entityType === "comments")?.payload || null;
  }).toMatchObject({
    category: "possible_error",
    body: "Conferir a definição apresentada."
  });
  const comments = await readLocalStore(page, "comments");
  expect(comments).toHaveLength(1);
  expect(comments[0]).toMatchObject({
    category: "possible_error",
    body: "Conferir a definição apresentada.",
    status: "open"
  });
  expect(comments[0]).not.toHaveProperty("card");
  expect(comments[0]).not.toHaveProperty("course");

  await page.getByRole("button", { name: "Observação do card: 1" }).tap();
  await expect(page.locator("[data-field='card-comment']")).toHaveValue(
    "Conferir a definição apresentada."
  );
});

test("timestamp PostgreSQL de progresso não bloqueia estudo nem retorno à lição", async ({ page }) => {
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  const replicaRows = structuredClone(EXAMPLE_ROWS);
  const course = replicaRows.courses[0];
  const moduleValue = replicaRows.modules.find((row) => row.contractKey === "module-teoria-dos-grafos");
  const lesson = replicaRows.lessons.find((row) => row.contractKey === "lesson-vocabulario-contagem");
  const card = replicaRows.cards.find((row) => row.contractKey === "card-grafo-conjuntos-regra");
  const lessonProgressId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const timestamp = "2026-07-19T12:30:00.123456+00:00";
  replicaRows.lessonProgress = [{
    id: lessonProgressId,
    userId: USER_ID,
    courseId: course.id,
    moduleId: moduleValue.id,
    lessonId: lesson.id,
    courseKey: course.contractKey,
    moduleKey: moduleValue.contractKey,
    lessonKey: lesson.contractKey,
    pathKey: `${course.contractKey}::${moduleValue.contractKey}::${lesson.contractKey}`,
    cursor: 0,
    completedAt: null,
    updatedAt: timestamp,
    deletedAt: null
  }];
  replicaRows.cardProgress = [{
    id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    userId: USER_ID,
    courseId: course.id,
    moduleId: moduleValue.id,
    lessonId: lesson.id,
    lessonProgressId,
    cardId: card.id,
    pathKey: `${course.contractKey}::${moduleValue.contractKey}::${lesson.contractKey}`,
    cardKey: card.contractKey,
    position: 0,
    completedAt: timestamp,
    reviewMarkedAt: null,
    updatedAt: timestamp,
    deletedAt: null
  }];

  await signIn(page, { replicaRows });
  await page.locator('[data-action="open-course"]').tap();
  await page.locator('[data-action="open-module"][data-module-key="module-teoria-dos-grafos"]').tap();
  await page.locator('[data-action="open-lesson"][data-lesson-key="lesson-vocabulario-contagem"]').tap();
  await page.locator('[data-action="play-microsequence"][data-microsequence-key="micro-grafo-como-conjuntos"]').tap();

  await expect(page.locator(".runtime-card-title")).toBeVisible();
  await expect(page.locator('[data-action="toggle-card-edit-mode"]')).toHaveCount(1);
  await expect(page.locator('[data-action="select-workbench-pane"]')).toHaveCount(0);
  await expect(page.locator(".authoring-card-drag-handle")).toHaveCount(0);
  await page.locator('[data-action="go-back"]').tap();
  await expect(page.locator('[data-action="play-microsequence"]')).not.toHaveCount(0);
  expect(pageErrors).toEqual([]);
});

test("play abre a microssequência escolhida no primeiro card sem avanço implícito", async ({ page }) => {
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await signIn(page);

  for (const action of [
    "open-central",
    "reset-course-progress-direct",
    "edit-course",
    "delete-course-direct",
    "open-course"
  ]) {
    await expect(page.locator(`[data-action="${action}"]`)).toBeVisible();
  }
  for (const removedAction of [
    "open-authoring-assistant",
    "quick-create-course",
    "open-home-actions",
    "open-course-actions"
  ]) {
    await expect(page.locator(`[data-action="${removedAction}"]`)).toHaveCount(0);
  }
  await expect(page.locator('[data-action^="open-generation-panel"]')).toHaveCount(0);
  await expectSvgControlsCentered(
    page,
    ".home-topbar button[title][aria-label], .course-actions button[title][aria-label]"
  );
  await page.evaluate(() => {
    globalThis.__nextCardClickCount = 0;
    document.addEventListener("click", (event) => {
      if (event.target instanceof Element && event.target.closest('[data-action="next-card"]')) {
        globalThis.__nextCardClickCount += 1;
      }
    }, { capture: true });
  });

  await page.locator('[data-action="open-course"]').tap();
  await expect(page.locator('[data-action="open-module"]')).not.toHaveCount(0);
  await page.locator('[data-action="open-module"][data-module-key="module-teoria-dos-grafos"]').tap();
  await page.locator('[data-action="open-lesson"][data-lesson-key="lesson-vocabulario-contagem"]').tap();

  await page.locator(
    '[data-action="play-microsequence"][data-microsequence-key="micro-adjacencia-incidencia"]'
  ).tap();

  await expect(page.locator(".runtime-card-title")).toHaveText("Adjacência e incidência");
  await page.waitForTimeout(500);
  await expect(page.locator(".runtime-card-title")).toHaveText("Adjacência e incidência");
  await expect.poll(() => page.evaluate(() => globalThis.__nextCardClickCount)).toBe(0);
  expect(pageErrors).toEqual([]);
});

test("navegação de estudo permanece imediata em um curso extenso", async ({ page }) => {
  await signIn(page, { replicaRows: largeCourseRows() });
  await page.locator('[data-action="open-course"]').tap();
  await page.locator('[data-action="open-module"]').first().tap();
  await page.locator('[data-action="open-lesson"]').first().tap();

  const measureSynchronousClick = (selector) => page.locator(selector).first().evaluate((button) => {
    const startedAt = performance.now();
    button.click();
    return performance.now() - startedAt;
  });

  const delayedPlay = await page.locator('[data-action="play-microsequence"]').first().evaluate((button) =>
    new Promise((resolve) => {
      const delay = 850;
      const scheduledAt = performance.now() + delay;
      setTimeout(() => {
        const dispatchedAt = performance.now();
        button.click();
        resolve({
          queueDelay: dispatchedAt - scheduledAt,
          handlerDuration: performance.now() - dispatchedAt
        });
      }, delay);
    })
  );
  await expect(page.locator(".runtime-card-title")).toBeVisible();
  const backToLessonDuration = await measureSynchronousClick('[data-action="go-back"]');
  await expect(page.locator('[data-action="play-microsequence"]')).not.toHaveCount(0);
  const backToModuleDuration = await measureSynchronousClick('[data-action="go-back"]');
  await expect(page.locator('[data-action="open-lesson"]')).not.toHaveCount(0);

  expect(delayedPlay.queueDelay).toBeLessThan(750);
  expect(delayedPlay.handlerDuration).toBeLessThan(150);
  expect(backToLessonDuration).toBeLessThan(150);
  expect(backToModuleDuration).toBeLessThan(150);
});

test("leitor mobile mantém altura e CTA ancorado entre cards de tamanhos diferentes", async ({ page }) => {
  await signIn(page);
  await page.locator('[data-action="open-course"]').tap();
  await page.locator('[data-action="open-module"][data-module-key="module-teoria-dos-grafos"]').tap();
  await page.locator('[data-action="open-lesson"][data-lesson-key="lesson-vocabulario-contagem"]').tap();
  await page.locator(
    '[data-action="play-microsequence"][data-microsequence-key="micro-grafo-como-conjuntos"]'
  ).tap();

  const measureReader = () => page.evaluate(() => {
    const surface = document.querySelector(".workbench-surface");
    const body = document.querySelector(".workbench-surface-body");
    const stage = document.querySelector(".study-stage");
    const footer = document.querySelector(".study-reader-footer");
    const cta = document.querySelector('[data-action="next-card"]');
    if (!surface || !body || !stage || !footer || !cta) throw new Error("Leitor incompleto.");
    const surfaceRect = surface.getBoundingClientRect();
    const bodyRect = body.getBoundingClientRect();
    const stageRect = stage.getBoundingClientRect();
    const footerRect = footer.getBoundingClientRect();
    const ctaRect = cta.getBoundingClientRect();
    return {
      viewportHeight: document.documentElement.clientHeight,
      surfaceHeight: surfaceRect.height,
      bodyHeight: bodyRect.height,
      bodyBottom: bodyRect.bottom,
      stageHeight: stageRect.height,
      stageBottom: stageRect.bottom,
      footerTop: footerRect.top,
      footerBottom: footerRect.bottom,
      ctaTop: ctaRect.top,
      ctaBottom: ctaRect.bottom
    };
  });

  await expect(page.locator(".runtime-card-title")).toHaveText("Grafo como dois conjuntos");
  const first = await measureReader();
  expect(first.ctaBottom).toBeLessThanOrEqual(first.viewportHeight);
  expect(first.ctaTop).toBeGreaterThan(0);
  expect(first.stageHeight).toBeGreaterThan(0);
  expect(first.footerTop).toBeGreaterThanOrEqual(first.stageBottom);
  expect(first.bodyBottom - first.footerBottom).toBeLessThanOrEqual(14);

  await page.locator('[data-action="next-card"]').tap();
  await page.locator('[data-action="continue-popup-next"]').tap();
  await expect(page.locator(".runtime-card-title")).toHaveText("Um grafo pequeno");
  const second = await measureReader();

  expect(Math.abs(second.surfaceHeight - first.surfaceHeight)).toBeLessThanOrEqual(1);
  expect(Math.abs(second.bodyHeight - first.bodyHeight)).toBeLessThanOrEqual(1);
  expect(Math.abs(second.stageHeight - first.stageHeight)).toBeLessThanOrEqual(1);
  expect(Math.abs(second.footerTop - first.footerTop)).toBeLessThanOrEqual(1);
  expect(Math.abs(second.footerBottom - first.footerBottom)).toBeLessThanOrEqual(1);
  expect(Math.abs(second.ctaTop - first.ctaTop)).toBeLessThanOrEqual(1);
  expect(second.ctaBottom).toBeLessThanOrEqual(second.viewportHeight);
  expect(second.bodyBottom - second.footerBottom).toBeLessThanOrEqual(14);
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
      const cache = await caches.open("aralearn-shell-0.0.9-r0");
      const cssUrl = new URL("./styles-shell-baseline.css", location.href).href;
      const panelUrl = new URL("./src/ui/LearningSpacesPanel.js", location.href).href;
      await cache.put(cssUrl, new Response(
        "#app-root{justify-content:flex-start!important}.local-durability{display:flex!important}",
        { headers: { "Content-Type": "text/css" } }
      ));
      await cache.put(panelUrl, new Response(`
        export function createLearningSpacesPanel({ root }) {
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
  await expect(page.getByText("Modo offline: alterações pendentes serão sincronizadas quando a conexão voltar.")).toHaveCount(0);
  await context.setOffline(false);
});

test("sair em uma aba fecha imediatamente o documento nas demais abas", async ({ page, context }) => {
  await signIn(page);
  const secondPage = await context.newPage();
  await mockSupabase(secondPage);
  await secondPage.goto("/");
  await expect(secondPage.locator('[data-action="open-course"]')).toHaveCount(1, { timeout: 15_000 });

  await page.getByRole("button", { name: "Abrir painel" }).click();
  await page.getByRole("button", { name: "Sair" }).click();

  await expect(secondPage.getByText("Sessão encerrada")).toHaveCount(0);
  await expect(secondPage.getByRole("heading", { name: "Acesso" })).toBeVisible({ timeout: 15_000 });
  await expect(secondPage.locator('[data-action="open-course"]')).toHaveCount(0);
});

test("o runtime completo executa escolhas, lacunas, fluxograma, popup e anotação", async ({ page }) => {
  const project = {
    version: 4,
    courses: [{
      id: "course-runtime",
      title: "Curso de runtime",
      modules: [{
        id: "module-runtime",
        title: "Módulo de runtime",
        lessons: [{
          id: "lesson-runtime",
          title: "Lição de runtime",
          microsequences: [{
            id: "micro-runtime",
            title: "Microssequência de runtime",
            status: "ready",
            cards: [{
              id: "card-choice",
              title: "Escolha",
              resource: "choice",
              question: "Qual é a resposta?",
              options: [
                { id: "certa", text: "Certa" },
                { id: "errada", text: "Errada" }
              ],
              selectionMode: "single",
              selectionCriterion: "correct",
              answerIds: ["certa"]
            }, {
              id: "card-choice-gap",
              title: "Lacuna de opção",
              resource: "composite",
              kind: "exercise",
              exercise: "gap",
              blocks: [{ id: "paragraph-1", kind: "paragraph", value: "Escolha [[certo::certo|errado]]." }]
            }, {
              id: "card-free-gap",
              title: "Lacuna livre",
              resource: "composite",
              kind: "exercise",
              exercise: "gap",
              blocks: [{ id: "paragraph-1", kind: "paragraph", value: "Escreva [[livre  agora]]." }]
            }, {
              id: "card-flow",
              title: "Fluxograma",
              resource: "flow",
              prompt: "Complete.",
              structure: {
                kind: "sequence",
                items: [{ kind: "start" }, {
                  kind: "process",
                  text: "Processar",
                  practice: {
                    text: {
                      blank: true,
                      mode: "choice",
                      options: ["Processar", "Ignorar"]
                    }
                  }
                }, { kind: "end" }]
              }
            }, {
              id: "card-popup",
              title: "Popup",
              resource: "paragraph",
              text: "Confirme para continuar.",
              afterBlocks: [{
                id: "choice-1",
                kind: "choice",
                question: "Entendeu?",
                options: [
                  { id: "sim", text: "Sim" },
                  { id: "nao", text: "Não" }
                ],
                selectionMode: "single",
                selectionCriterion: "correct",
                answerIds: ["sim"]
              }]
            }, {
              id: "card-final",
              title: "Concluído",
              resource: "paragraph",
              text: "Fim."
            }]
          }]
        }]
      }]
    }]
  };

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Acesso" })).toBeVisible();
  await page.evaluate(async (initialProject) => {
    const oldRoot = document.querySelector("#app-root");
    const root = document.createElement("div");
    root.id = "app-root";
    oldRoot.replaceWith(root);
    const probe = {
      project: structuredClone(initialProject),
      progress: { version: 1, lessons: {} },
      reviewMarked: false,
      comment: null
    };
    const storage = {
      loadProject: () => probe.project,
      saveProject: async (next) => { probe.project = structuredClone(next); },
      loadProgress: () => probe.progress,
      saveProgress: async (next) => { probe.progress = structuredClone(next); },
      loadStudyPaths: () => [],
      isCardMarkedForReview: () => probe.reviewMarked,
      setCardReviewMark: async (_path, marked) => { probe.reviewMarked = marked; },
      loadCommentForPath: () => structuredClone(probe.comment),
      saveCommentForPath: async (_path, value) => {
        probe.comment = { ...structuredClone(value), status: "open" };
      },
      deleteCommentForPath: async () => { probe.comment = null; }
    };
    globalThis.__learnerRuntimeProbe = probe;
    const { createEditorSession } = await import("./src/editor/contractEditor.js");
    const { createLessonEditorApp } = await import("./src/ui/lessonEditorApp.js");
    createLessonEditorApp({
      root,
      storage,
      editor: createEditorSession(storage),
      initialProject: probe.project
    });
  }, project);

  await page.locator('[data-action="open-course"]').click();
  await page.locator('[data-action="open-module"]').click();
  await page.locator('[data-action="open-lesson"]').click();
  await page.locator('[data-action="play-microsequence"]').click();
  await expect(page.locator(".runtime-card-title")).toHaveText("Escolha");

  const reviewButton = page.getByRole("button", { name: "Marcar card para rever" });
  await reviewButton.click();
  await expect(page.getByRole("button", { name: "Retirar card de Rever" }))
    .toHaveAttribute("aria-pressed", "true");

  await page.getByRole("button", { name: "Observação do card" }).click();
  await page.getByText("Dúvida", { exact: true }).click();
  await expect(page.locator("[data-field='card-comment-category'][value='question']")).toBeChecked();
  await page.locator("[data-field='card-comment']").fill("Minha dúvida");
  await page.getByRole("button", { name: "Salvar" }).click();
  await expect.poll(() => page.evaluate(() => globalThis.__learnerRuntimeProbe.comment)).toEqual({
    category: "question",
    body: "Minha dúvida",
    status: "open"
  });
  await expect(page.locator(".study-comment-count")).toHaveText("1");
  await page.getByRole("button", { name: "Observação do card: 1" }).click();
  await page.getByRole("button", { name: "Retirar observação" }).click();
  await expect.poll(() => page.evaluate(() => globalThis.__learnerRuntimeProbe.comment)).toBeNull();
  await page.getByRole("button", { name: "Observação do card" }).focus();
  await page.getByRole("button", { name: "Observação do card" }).press("Enter");
  const observationCategory = page.locator(
    "[data-field='card-comment-category'][value='observation']"
  );
  await observationCategory.focus();
  await observationCategory.press("ArrowLeft");
  await expect(page.locator(
    "[data-field='card-comment-category'][value='suggestion']"
  )).toBeChecked();
  await page.getByRole("button", { name: "Fechar" }).press("Enter");

  await page.locator('[data-action="choice-toggle"][data-choice-option-id="certa"]').click();
  await page.locator('[data-action="next-card"]').click();
  await expect(page.locator(".runtime-card-title")).toHaveText("Lacuna de opção");

  let choiceGap = page.locator('[data-action="text-gap-open-choice"]');
  await choiceGap.focus();
  await choiceGap.press("Enter");
  await expect(page.locator("[data-text-gap-prompt='true']")).toBeVisible();
  await page.locator('[data-action="text-gap-set-choice"][data-text-gap-value="certo"]').click();
  choiceGap = page.locator('[data-action="text-gap-open-choice"]');
  await expect(choiceGap).toHaveText("certo");
  await choiceGap.focus();
  await choiceGap.press("Space");
  await expect(page.locator("[data-text-gap-prompt='true']")).toBeVisible();
  await expect(
    page.locator('[data-action="text-gap-set-choice"][data-text-gap-value="certo"]')
  ).toHaveClass(/active/u);
  await page.locator('[data-action="text-gap-set-choice"][data-text-gap-value="certo"]').click();
  await page.locator('[data-action="next-card"]').click();
  await expect(page.locator(".runtime-card-title")).toHaveText("Lacuna livre");

  const freeGap = page.locator("[data-action='complete-input'][contenteditable='true']");
  await freeGap.fill("errado");
  await page.locator('[data-action="next-card"]').click();
  await expect(page.locator("[data-complete-feedback-block-key]")).toContainText("Incorreto");

  await freeGap.focus();
  await freeGap.press("Control+A");
  await freeGap.press("l");
  await expect(freeGap).toBeFocused();
  await expect(page.locator("[data-complete-feedback-block-key]")).toHaveCount(0);
  await freeGap.pressSequentially("ivre  agora");
  await expect(freeGap).toHaveText("livre  agora");
  await expect(freeGap).toHaveAttribute("data-empty", "false");
  await page.locator('[data-action="next-card"]').click();
  await expect(page.locator(".runtime-card-title")).toHaveText("Fluxograma");

  await page.getByRole("button", { name: "Escolher texto" }).click();
  await expect(page.locator("[data-flowchart-prompt='true']")).toBeVisible();
  await page.locator('[data-action="flowchart-set-text"][data-flowchart-value="Processar"]').click();
  await page.locator('[data-action="next-card"]').click();
  await expect(page.locator(".runtime-card-title")).toHaveText("Popup");

  await page.locator('[data-action="next-card"]').click();
  const popup = page.locator(".study-continue-popup");
  await expect(popup).toBeVisible();
  await popup.locator('[data-action="choice-toggle"][data-choice-option-id="sim"]').click();
  await popup.locator('[data-action="continue-popup-next"]').click();
  await expect(page.locator(".runtime-card-title")).toHaveText("Concluído");

  expect(await page.evaluate(() => globalThis.__learnerRuntimeProbe.reviewMarked)).toBe(true);
  await expect(
    page.locator('[data-action="toggle-card-edit-mode"]')
  ).toHaveCount(1);
});
