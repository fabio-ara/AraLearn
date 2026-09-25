import { expect, test } from "@playwright/test";
import fs from "node:fs";

import { courseDesignFixture } from "../helpers/courseDesignFixture.js";

const project = JSON.parse(fs.readFileSync(
  new URL("../fixtures/package/project-minimal.json", import.meta.url),
  "utf8"
));
const course = project.courses[0];
const moduleValue = course.modules[0];
const lesson = moduleValue.lessons[0];
const microsequence = lesson.microsequences[0];
const studyUnit = microsequence.studyUnits[0];
const lessonKey = course.id + "::" + moduleValue.id + "::" + lesson.id;
const designCourseId = "10000000-0000-4000-8000-000000000001";
const design = courseDesignFixture({
  courseId: designCourseId,
  moduleId: moduleValue.id,
  lessonId: lesson.id,
  microsequenceId: microsequence.id,
  studyUnitId: studyUnit.id
});

async function bootstrap(page) {
  await page.route("**/main.js", route => route.fulfill({
    contentType: "application/javascript",
    body: ""
  }));
  await page.goto("/");
}

async function mountHome(page, overrides = {}) {
  await bootstrap(page);
  await page.evaluate(async ({ project, courseId, lessonKey, studyUnitId, moduleId, lessonId,
    microsequenceId, overrides }) => {
    const { renderHomeScreen } = await import("/src/ui/renderHomeScreen.js");
    document.body.innerHTML = '<div id="app-root"><div id="home-root"></div></div>';
    const reviewItems = Array.from({ length: 18 }, (_, index) => ({
      entityPath: [courseId, moduleId, lessonId, microsequenceId, studyUnitId],
      title: "Unidade marcada " + String(index + 1),
      context: "Lição de teste"
    }));
    window.homeProbe = { actions: [] };
    const root = document.querySelector("#home-root");
    root.addEventListener("click", event => {
      const action = event.target.closest("[data-action]")?.dataset.action;
      if (action) window.homeProbe.actions.push(action);
    });
    root.innerHTML = renderHomeScreen({
      project,
      progress: { version: 1, lessons: {
        [lessonKey]: { cursorStudyUnitId: studyUnitId, completedStudyUnitIds: [studyUnitId] }
      } },
      selectedCourseId: courseId,
      reviewItems,
      reviewHasMore: true,
      reviewQueueOpen: true,
      runtimeStatus: { pending: true },
      homeNotice: "Retorno de teste.",
      reviewUndo: { entityPath: [] },
      editorSupport: {
        coursePermissionsById: {
          [courseId]: { ownership: "owned", canCopy: true, availableOffline: true }
        }
      },
      ...overrides
    });
    await document.fonts.ready;
  }, {
    project,
    courseId: course.id,
    lessonKey,
    studyUnitId: studyUnit.id,
    moduleId: moduleValue.id,
    lessonId: lesson.id,
    microsequenceId: microsequence.id,
    overrides
  });
}

async function expectIconOnly(locator, label, { title = label } = {}) {
  await expect(locator).toHaveAttribute("aria-label", label);
  await expect(locator).toHaveAttribute("title", title);
  await expect(locator.locator("svg")).toHaveCount(1);
  expect(await locator.evaluate(node => [...node.childNodes]
    .filter(child => child.nodeType === Node.TEXT_NODE && child.textContent.trim()).length)).toBe(0);
  await expect(locator.locator("span")).toHaveCount(0);
}

test("D001/O035/O036/O039/O037: Home torna ações e envio previsíveis", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mountHome(page);

  await expectIconOnly(page.getByRole("button", { name: "Estudo", exact: true }), "Estudo");
  await expectIconOnly(page.getByRole("button", { name: "Autoria", exact: true }), "Autoria", { title: "Abrir Autoria" });
  await page.getByRole("button", { name: "Ações deste curso", exact: true }).click();

  const menu = page.getByRole("menu", { name: "Ações deste curso", exact: true });
  await expect(menu).toBeVisible();
  for (const name of ["Copiar curso", "Zerar progresso", "Excluir este curso"]) {
    await expectIconOnly(menu.getByRole("menuitem", { name, exact: true }), name);
  }
  const destructive = menu.locator('[data-action-group="destructive"]');
  await expect(destructive).toHaveCount(2);
  await expect(destructive.nth(1)).toHaveClass(/is-danger/u);
  await expect(destructive.nth(0)).toHaveAttribute("aria-describedby", /home-course-destructive-/u);
  await expect(destructive.nth(1)).toHaveAttribute("aria-describedby", /home-course-destructive-/u);
  await page.screenshot({ path: testInfo.outputPath("home-course-actions-390.png"), fullPage: true });

  await page.keyboard.press("Escape");
  const sync = page.locator(".study-runtime-status-control");
  await expect(sync).toHaveAccessibleName("Sincronização pendente");
  await expect(sync).toHaveAttribute("data-sync-effect", "flush-and-refresh");
  const descriptionId = await sync.getAttribute("aria-describedby");
  await expect(page.locator("#" + descriptionId)).toContainText("envia alterações pendentes");
  await expect(sync).toHaveAttribute("title", /envia alterações pendentes/u);
  await sync.click();
  await expect(page.getByRole("region", { name: "Estado da sincronização" })).toBeVisible();
  expect(await page.evaluate(() => window.homeProbe.actions))
    .toEqual(["course-lifecycle-menu", "synchronize-study"]);
});

test("D001/O039: Parâmetros mostra ações icon-only e efeitos diferentes", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await bootstrap(page);
  await page.evaluate(async ({ design, parameterId, group }) => {
    const { renderCourseDesignPanel } = await import("/src/ui/CourseDesignPanel.js");
    document.body.innerHTML = '<div id="course-authoring-root"><div class="course-design-context-body" id="design-root"></div></div>';
    document.querySelector("#design-root").innerHTML = renderCourseDesignPanel({
      courseDesign: design,
      designParameterId: parameterId,
      designBusy: false,
      designAppliedParameters: [],
      pendingDesignCommands: new Set(),
      designCategory: group
    });
    await document.fonts.ready;
  }, {
    design,
    parameterId: design.definitions[0].id,
    group: design.definitions[0].group
  });

  const editor = page.locator(".course-design-parameter-editor");
  await expect(editor).toBeVisible();
  for (const [label, effect] of [
    ["Restaurar herança", "restores-inherited-value"],
    ["Descartar alterações", "discards-form-draft"],
    ["Salvar neste escopo", "updates-next-production"]
  ]) {
    const control = editor.getByRole("button", { name: label, exact: true });
    await expectIconOnly(control, label);
    await expect(control).toHaveAttribute("data-action-effect", effect);
  }
  await expect(editor).toContainText("Definição e origem");
  await expect(editor).toContainText("O que muda ao salvar");
  await page.screenshot({ path: testInfo.outputPath("course-design-actions-390.png"), fullPage: true });
});

test("H002: rolagem natural preserva feedback em fluxo sem sobrepor cartões", async ({ page }, testInfo) => {
  for (const width of [390, 1280]) {
    await page.setViewportSize({ width, height: 640 });
    await mountHome(page);
    await expect(page.getByRole("status").filter({ hasText: "Retorno de teste." })).toBeVisible();
    await expect(page.getByRole("button", { name: "Desfazer", exact: true })).toBeVisible();
    await expect(page.locator(".study-runtime-status-control")).toHaveAccessibleName("Sincronização pendente");
    const before = await page.evaluate(() => ({ scrollY: window.scrollY, scrollHeight: document.documentElement.scrollHeight }));
    await page.mouse.wheel(0, 600);
    const result = await page.evaluate(() => {
      const layer = document.querySelector(".study-home-feedback-layer");
      const feedback = layer.getBoundingClientRect();
      const cards = [...document.querySelectorAll(".study-review-item")].map(node => node.getBoundingClientRect());
      const overlap = cards.some(card => card.top < feedback.bottom && card.bottom > feedback.top);
      const style = getComputedStyle(layer);
      return {
        scrollY: window.scrollY,
        naturalScrollOccurred: window.scrollY > 0,
        feedback: { top: feedback.top, bottom: feedback.bottom },
        overlap,
        position: style.position,
        pointerEvents: style.pointerEvents
      };
    });
    expect(result.naturalScrollOccurred || before.scrollHeight <= 640).toBe(true);
    expect(result.position).not.toBe("fixed");
    expect(result.pointerEvents).not.toBe("none");
    expect(result.overlap, `${width}px: ${JSON.stringify(result)}`).toBe(false);
    await testInfo.attach(`h002-natural-scroll-${width}.json`, {
      body: JSON.stringify({ width, before, result }, null, 2),
      contentType: "application/json"
    });
    await page.screenshot({ path: testInfo.outputPath(`h002-natural-scroll-${width}.png`), fullPage: false });
  }
});
