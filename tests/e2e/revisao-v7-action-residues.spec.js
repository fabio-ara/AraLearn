import { test, expect } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";

const COURSE_ID = "10000000-0000-4000-8000-000000000001";
const EVIDENCE_ROOT = path.resolve(".tmp/agent/revisao-v7/action-residues");
const HARNESS_ASSETS = ["fixtures/uxUi328.html", "fixtures/uxUi328Harness.js", "fixtures/uxUi328Fixture.js",
  "fixtures/courseCurriculumMapFixture.js", "helpers/courseDesignFixture.js"];

async function prepare(page) {
  const root = process.cwd();
  await page.route("**/main.js", route => route.fulfill({
    contentType: "application/javascript", body: ""
  }));
  for (const file of ["styles.css", "styles-shell-baseline.css", "styles-tokens.css", "course-authoring.css"]) {
    await page.route(`**/${file}`, route => route.fulfill({
      contentType: "text/css", path: path.join(root, "public", file)
    }));
  }
  for (const relative of HARNESS_ASSETS) {
    const body = await fs.readFile(path.join(root, "tests", relative), "utf8");
    await page.route(url => url.pathname === `/tests/${relative}`, route => route.fulfill({ body,
      contentType: relative.endsWith(".html") ? "text/html; charset=utf-8" : "text/javascript; charset=utf-8" }));
  }
  await page.route("**/tests/fixtures/package/project-minimal.json", route => route.fulfill({
    contentType: "application/json", path: path.join(root, "tests/fixtures/package/project-minimal.json")
  }));
  await page.goto("/");
}

async function expectIconOnly(locator, label, { title = label, danger = false, icons = 1 } = {}) {
  await locator.scrollIntoViewIfNeeded();
  await expect(locator).toHaveAttribute("aria-label", label);
  await expect(locator).toHaveAttribute("title", title);
  await expect(locator).toHaveText("");
  await expect(locator.locator("svg")).toHaveCount(icons);
  await expect(locator).toBeVisible();
  const hit = await locator.evaluate(node => {
    const box = node.getBoundingClientRect();
    const center = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
    return {
      height: Math.round(box.height),
      width: Math.round(box.width),
      centered: Boolean(center && center.closest("button") === node)
    };
  });
  expect(hit.height).toBeGreaterThanOrEqual(24);
  expect(hit.width).toBeGreaterThanOrEqual(24);
  expect(hit.centered).toBe(true);
  if (danger) await expect(locator).toHaveClass(/is-danger/u);
}

async function shoot(page, name) {
  await fs.mkdir(EVIDENCE_ROOT, { recursive: true });
  await page.screenshot({ path: path.join(EVIDENCE_ROOT, `${name}.png`), fullPage: true });
}

function courseDetail(overrides = {}) {
  return {
    contract: "aralearn.course-authoring-detail.v1",
    courseId: COURSE_ID,
    revision: 4,
    title: "Curso sintético",
    goal: "Percorrer a unidade.",
    ownership: "owned",
    canEdit: true,
    canCopy: true,
    counts: { microsequenceCount: 2, studyUnitCount: 3 },
    visibility: "private",
    publicFileAccess: "restricted",
    ...overrides
  };
}

async function bootHarness(page) {
  await page.goto("/tests/fixtures/uxUi328.html");
  await expect(page.locator("html")).toHaveAttribute("data-fixture-ready", "true");
  await expect(page.locator(".course-authoring-surface")).toHaveAttribute("aria-busy", "false");
}

test("D001/O035: lista, tarefas e paginação seguem operando sem texto de ação em 390", async ({ page }, info) => {
  await prepare(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await bootHarness(page);
  await page.evaluate(() => {
    const controller = globalThis.uxUi328.controller;
    const original = controller.listCourses.bind(controller);
    globalThis.actionProbe = { listCalls: [], fail: true };
    controller.listCourses = async (request) => {
      globalThis.actionProbe.listCalls.push(request.cursor || "first");
      if (globalThis.actionProbe.fail) {
        globalThis.actionProbe.fail = false;
        throw new Error("Falha sintética de leitura.");
      }
      const result = await original(request);
      return request.cursor
        ? { ...result, hasMore: false, nextCursor: null }
        : { ...result, hasMore: true, nextCursor: "cursor-1" };
    };
    history.replaceState(null, "", "/tests/fixtures/uxUi328.html");
    return globalThis.uxUi328.surface.open();
  });

  const retry = page.locator("[data-course-authoring-action='retry']");
  await expectIconOnly(retry, "Tentar novamente");
  await retry.click();
  const more = page.getByRole("button", { name: "Carregar mais cursos", exact: true });
  await expectIconOnly(more, "Carregar mais cursos");
  await more.click();
  await expect(more).toHaveCount(0);
  expect(await page.evaluate(() => globalThis.actionProbe.listCalls)).toEqual(["first", "first", "cursor-1"]);
  await expect(page.locator(".course-authoring-course-card")).toHaveCount(1);

  const listMenu = page.locator(".course-authoring-task-menu").first();
  await listMenu.locator(":scope > summary").click();
  await expectIconOnly(listMenu.getByRole("button", { name: "Criar curso", exact: true }), "Criar curso");
  await expectIconOnly(
    listMenu.getByRole("button", { name: "Atualizar cursos", exact: true }), "Atualizar cursos"
  );
  await listMenu.getByRole("button", { name: "Atualizar cursos", exact: true }).click();
  expect(await page.evaluate(() => globalThis.actionProbe.listCalls.length)).toBe(4);
  await shoot(page, "lista-acoes-390");

  await page.evaluate(() => {
    history.replaceState(null, "",
      `#/authoring/courses/${globalThis.uxUi328.course.courseId}?section=content`);
    return globalThis.uxUi328.surface.open();
  });
  await expect(page.locator(".course-authoring-surface")).toHaveAttribute("data-section", "content");

  const courseMenu = page.locator(".course-authoring-task-menu").first();
  await courseMenu.locator(":scope > summary").click();
  const rows = courseMenu.locator("nav > button");
  const rowCount = await rows.count();
  expect(rowCount).toBeGreaterThan(0);
  for (let index = 0; index < rowCount; index += 1) {
    const row = rows.nth(index);
    const label = await row.getAttribute("aria-label");
    expect(label).toBeTruthy();
    await expectIconOnly(row, label);
  }
  await expect(courseMenu.getByRole("link", { name: "Fontes", exact: true })).toHaveText("Fontes");
  await courseMenu.getByRole("button", { name: "Atualizar curso", exact: true }).click();
  await expect(page.locator(".course-authoring-surface")).toHaveAttribute("aria-busy", "false");

  await page.getByRole("button", { name: "Mostrar várias unidades", exact: true }).first().click();
  const forward = page.getByRole("button", { name: "Carregar unidades posteriores", exact: true });
  await expectIconOnly(forward, "Carregar unidades posteriores");
  const before = await page.locator("[data-inspection-study-unit]").count();
  await forward.click();
  await expect.poll(() => page.locator("[data-inspection-study-unit]").count()).toBeGreaterThan(before);
  info.attach("fluxo-real-390", { body: JSON.stringify({ before,
    after: await page.locator("[data-inspection-study-unit]").count(),
    listCalls: await page.evaluate(() => globalThis.actionProbe.listCalls)
  }), contentType: "application/json" });
  await shoot(page, "fluxo-real-390");
});

test("D001/O035/D002: confirmação, rota inválida e saída da autoria usam ícone nomeado em 1280", async ({ page }, info) => {
  await prepare(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  const detail = courseDetail();

  await page.evaluate(async ({ courseDetail: course }) => {
    const { renderCourseAuthoringSurface } = await import("/src/ui/CourseAuthoringSurface.js");
    document.body.innerHTML = '<main id="action-residue-root">' +
      renderCourseAuthoringSurface({ view: "course", section: "sources", course,
        canCopyCourse: true, canOpenStudyContent: true, requestFailure: "Não foi possível ler." }) +
      "</main>";
  }, { courseDetail: detail });
  const courseMenu = page.locator(".course-authoring-task-menu").first();
  await courseMenu.locator(":scope > summary").click();
  await expectIconOnly(courseMenu.getByRole("button", { name: "Atualizar curso", exact: true }), "Atualizar curso");
  await expectIconOnly(courseMenu.getByRole("button", { name: "Copiar curso", exact: true }), "Copiar curso");
  await expect(courseMenu.getByRole("link", { name: "Fontes", exact: true })).toHaveText("Fontes");
  await shoot(page, "curso-tarefas-1280");

  await page.evaluate(async ({ courseDetail: course }) => {
    const { renderCourseAuthoringSurface } = await import("/src/ui/CourseAuthoringSurface.js");
    document.body.innerHTML = '<main id="action-residue-root">' +
      renderCourseAuthoringSurface({ view: "course", section: "people", course,
        people: { owner: { userId: "user-owner", handle: "owner" }, people: [] },
        peopleLoading: false,
        peopleFailure: "Não foi possível ler os acessos.",
        pendingPeopleCommand: { draft: { operation: "set_copy_permission", userId: "user-1" } } }) +
      "</main>";
  }, { courseDetail: detail });
  await page.locator(".course-authoring-task-menu > summary").first().click();
  await expectIconOnly(
    page.locator("[data-course-authoring-action='cancel-copy-permission']"),
    "Encerrar recuperação da permissão de cópia"
  );
  await shoot(page, "acessos-recuperacao-1280");

  await page.evaluate(async ({ courseDetail: course }) => {
    const { renderCourseAuthoringSurface } = await import("/src/ui/CourseAuthoringSurface.js");
    document.body.innerHTML = '<main id="action-residue-root">' +
      renderCourseAuthoringSurface({ view: "course", section: "sources", course,
        actionConfirmation: { message: "Remover o acesso?", tone: "danger", confirmLabel: "Remover acesso" } }) +
      "</main>";
  }, { courseDetail: detail });
  await expectIconOnly(page.locator("[data-course-authoring-action='cancel-action-confirmation']"), "Cancelar");
  await expectIconOnly(page.locator("[data-course-authoring-action='confirm-action-confirmation']"),
    "Remover acesso", { danger: true });
  await page.getByRole("button", { name: "Cancelar", exact: true }).focus();
  const outline = await page.evaluate(() => {
    const node = document.activeElement;
    const style = getComputedStyle(node);
    return { tag: node.tagName, outlineStyle: style.outlineStyle, outlineWidth: style.outlineWidth };
  });
  expect(outline.tag).toBe("BUTTON");
  info.attach("foco-cancelar", { body: JSON.stringify(outline), contentType: "application/json" });
  await shoot(page, "confirmacao-1280");

  await page.evaluate(async () => {
    const { renderCourseAuthoringSurface } = await import("/src/ui/CourseAuthoringSurface.js");
    document.body.innerHTML = '<main id="action-residue-root">' +
      renderCourseAuthoringSurface({ view: "invalid" }) + "</main>";
  });
  await expectIconOnly(page.getByRole("button", { name: "Ver cursos", exact: true }), "Ver cursos");

  await page.evaluate(async () => {
    const { renderAuthoringEditorExitConfirmation } = await import("/src/study/CourseStudyScreen.js");
    document.body.innerHTML = '<main id="action-residue-root">' +
      renderAuthoringEditorExitConfirmation({ unknown: true }) + "</main>";
  });
  await expectIconOnly(
    page.getByRole("button", { name: "Continuar editando", exact: true }), "Continuar editando"
  );
  await expectIconOnly(
    page.getByRole("button", { name: "Descartar e voltar", exact: true }),
    "Descartar e voltar", { danger: true }
  );
  await shoot(page, "saida-autoria-1280");
});

test("D001/O035: docks do Estudo salvam, descartam e voltam por ícone nomeado em 390", async ({ page }) => {
  await prepare(page);
  await page.setViewportSize({ width: 390, height: 844 });
  const mount = (patch) => page.evaluate(async (manualEditorPatch) => {
    const { renderCourseStudyScreen } = await import("/src/study/CourseStudyScreen.js");
    const project = await (await fetch("/tests/fixtures/package/project-minimal.json")).json();
    const course = project.courses[0];
    const moduleValue = course.modules[0];
    const lesson = moduleValue.lessons[0];
    const microsequence = lesson.microsequences[0];
    const studyUnit = microsequence.studyUnits[0];
    document.body.innerHTML = '<main id="action-residue-root">' + renderCourseStudyScreen({
      project,
      view: "study_unit",
      selection: {
        courseId: course.id, moduleId: moduleValue.id, lessonId: lesson.id,
        microsequenceId: microsequence.id, studyUnitId: studyUnit.id, studyUnitIndex: 0
      },
      course, moduleValue, lesson, microsequence, studyUnit,
      progress: { version: 1, lessons: {} },
      coursePermissionsById: {},
      manualEditor: {
        enabled: true, editing: true, saving: false, targetId: "study_unit",
        draft: { pathValues: {} }, ...manualEditorPatch
      }
    }) + "</main>";
  }, patch);

  await mount({ discardArmed: true, error: "A gravação pode ter sido concluída." });
  await expectIconOnly(page.locator("[data-action='study-manual-discard-unknown']"),
    "Descartar rascunho com resultado incerto", { title: "Descartar rascunho" });

  await mount({ editing: false, assistance: { draft: { scope: "study_unit", summary: "Mudança preparada" } } });
  await expectIconOnly(page.locator("[data-action='save-assistance-draft']"), "Salvar proposta");

  await mount({ authoringContext: { courseTitle: "Curso sintético" } });
  await page.locator(".course-authoring-task-menu > summary").first().click();
  await expectIconOnly(
    page.locator(".course-authoring-task-menu [data-action='authoring-context-back']"), "Voltar ao Conteúdo"
  );
  await shoot(page, "estudo-docks-390");
});
