import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";

const project = JSON.parse(await readFile(new URL("../fixtures/package/project-minimal.json", import.meta.url), "utf8"));
const courseId = "e3060000-0000-4000-8000-000000000010";

async function mount(page, theme, { long = true } = {}) {
  await page.route("**/main.js", route => route.fulfill({ contentType: "application/javascript", body: "" }));
  await page.goto("/");
  await page.evaluate(async ({ project, courseId, theme, long }) => {
    document.documentElement.dataset.colorMode = theme;
    document.body.innerHTML = '<div id="app-root"><main id="course-authoring-root" class="course-authoring-root"></main><div id="aralearn-editor-root" hidden></div></div>';
    const { createCourseStudyApplication } = await import("/src/study/CourseStudyApplication.js");
    const { renderCourseAuthoringSurface } = await import("/src/ui/CourseAuthoringSurface.js");
    const { buildCourseAuthoringRoute } = await import("/src/ui/courseAuthoringRoute.js");
    const canonical = structuredClone(project), course = canonical.courses[0];
    course.id = courseId;
    course.title = long ? "Curso sintético com título completo para preservar o contexto da Autoria ".repeat(3).trim() : "Curso";
    const moduleValue = course.modules[0], lesson = moduleValue.lessons[0], micro = lesson.microsequences[0], unit = micro.studyUnits[0];
    unit.response = null; unit.feedback = [];
    unit.content = [{ id: "context-paragraph", package: "aralearn.resource.paragraph", version: "1.0.0", data: { text: "Conteúdo didático integral. ".repeat(80) } }];
    for (const target of [course, moduleValue, lesson, micro]) {
      const goal = long ? "Objetivo integral acessível por rolagem. ".repeat(30).trim() : "Objetivo.";
      if (target.guide) target.guide.goal = goal;
      else target.goal = goal;
    }
    const route = buildCourseAuthoringRoute(courseId, { studyUnitId: unit.id });
    history.replaceState(null, "", route);
    const authoringRoot = document.querySelector("#course-authoring-root"), editorRoot = document.querySelector("#aralearn-editor-root");
    authoringRoot.innerHTML = renderCourseAuthoringSurface({ view: "course", section: "content", routeKey: "context-probe",
      course: { courseId, revision: 7, title: course.title, ownership: "owned", canEdit: true, visibility: "private", publicFileAccess: "restricted" } });
    authoringRoot.insertAdjacentHTML("beforeend", '<div style="height:900px"></div><button data-context-origin>Editar alvo selecionado</button>');
    const origin = authoringRoot.querySelector("[data-context-origin]");
    let revision = 7, version = 3;
    const navigationWrites = [], requests = [], returns = [];
    const repository = {
      loadProgress: () => ({ version: 1, lessons: {} }), loadStudyNavigation: () => null,
      saveStudyNavigation: async value => { navigationWrites.push(value); },
      loadCourseSummaries: () => [{ courseId, title: course.title, revision, ownership: "owned", canEdit: true }],
      loadRuntimeStatus: () => ({ localOnly: false }), loadAnnotationsForPath: () => [], loadReviewItems: () => [],
      hasMoreReviewItems: () => false, isStudyUnitMarkedForReview: () => false,
      loadCourse: async () => structuredClone(course), loadProject: () => structuredClone(canonical),
      loadStudyUnitCompositionContext: () => ({ courseRevision: revision, studyUnitVersion: version, didacticMicrosequenceId: micro.id }),
      setStudyUnitCompleted: async () => { throw new Error("Edição contextual não escreve progresso."); }, flush: async () => true
    };
    const app = createCourseStudyApplication({ root: editorRoot, repository, initialProject: canonical,
      onAuthoringContextReturn: result => {
        returns.push(result); editorRoot.hidden = true; authoringRoot.hidden = false;
        authoringRoot.scrollTop = window.contextReturnScroll; origin.focus({ preventScroll: true });
      },
      onSaveAssistedStructure: async request => {
        requests.push(structuredClone(request));
        if (window.contextLoseResponse) { window.contextLoseResponse = false; throw Object.assign(new Error("Resposta perdida"), { code: "network_error", ambiguous: true }); }
        revision += 1;
        return { project: request.proposedProject, courseRevision: revision };
      },
      onSaveManualEdit: async request => {
        requests.push(structuredClone(request));
        revision += 1; version += 1;
        return { courseId, courseRevision: revision, studyUnitId: request.studyUnitId, studyUnitVersion: version,
          studyUnit: request.studyUnit, version, changed: true, reconciled: true };
      }
    });
    window.contextProbe = { app, requests, returns, navigationWrites, route };
    window.openContextProbe = async length => {
      origin.focus(); authoringRoot.scrollTop = 180; window.contextReturnScroll = authoringRoot.scrollTop;
      const opened = await app.openEntityPath([courseId, moduleValue.id, lesson.id, micro.id, unit.id].slice(0, length), {
        editing: true, authoringContext: { returnRoute: route }
      });
      if (!opened) throw new Error("O editor contextual não abriu.");
      authoringRoot.hidden = true; editorRoot.hidden = false;
      app.focusAuthoringContext();
    };
    await document.fonts.ready;
  }, { project, courseId, theme, long });
}

async function headerGeometry(page, root) {
  return page.locator(root).evaluate(element => {
    const rect = selector => { const box = element.querySelector(selector).getBoundingClientRect(); return { x: box.x, y: box.y, width: box.width, height: box.height }; };
    return { back: rect(".course-authoring-back"), sync: rect(".study-runtime-status-control"), menu: rect(".course-authoring-task-menu > summary") };
  });
}

for (const width of [360, 390, 430, 1280]) for (const theme of ["light", "dark"]) {
  test(`Editor contextual conserva Autoria, âncoras e retorno nos cinco níveis ${width} ${theme}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 844 });
    await mount(page, theme);
    const before = await headerGeometry(page, "#course-authoring-root");
    for (const length of [1, 2, 3, 4, 5]) {
      await page.evaluate(length => window.openContextProbe(length), length);
      await expect(page.locator(".course-authoring-context-shell .course-authoring-course-heading h1")).toHaveText("Conteúdo");
      await expect(page.locator('#aralearn-editor-root [data-action="go-home"]')).toHaveCount(0);
      await expect(page.locator('#aralearn-editor-root [data-action="next-study-unit"]')).toHaveCount(0);
      await expect(page.locator(length === 5 ? '[data-study-manual-title]' : '[data-study-structure-field="title"]')).toBeFocused();
      const after = await headerGeometry(page, "#aralearn-editor-root");
      for (const control of ["back", "sync", "menu"]) for (const dimension of ["x", "y", "width", "height"]) {
        expect(Math.abs(after[control][dimension] - before[control][dimension]), `${length}: ${control}.${dimension}`).toBeLessThanOrEqual(1);
      }
      const save = page.locator(length === 5 ? '[data-action="study-manual-save"]' : '[data-action="save-study-structure"]');
      const box = await save.boundingBox();
      expect(box.y + box.height).toBeLessThanOrEqual(844);
      expect(box.width).toBeGreaterThanOrEqual(44); expect(box.height).toBeGreaterThanOrEqual(44);
      if (length < 5) {
        const cancel = await page.locator('[data-action="cancel-study-structure"]').boundingBox();
        const screen = await page.locator('#aralearn-editor-root .screen').boundingBox();
        expect(Math.abs(cancel.y - box.y)).toBeLessThanOrEqual(1);
        expect(Math.abs(screen.x + screen.width - box.x - box.width - 10)).toBeLessThanOrEqual(1);
        expect(Math.abs(screen.y + screen.height - box.y - box.height - 10)).toBeLessThanOrEqual(1);
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
      if (length === 5) await page.screenshot({ path: testInfo.outputPath(`context-${width}-${theme}.png`) });
      await save.click();
      await expect(page.locator("#course-authoring-root")).toBeVisible();
      await expect(page.locator("[data-context-origin]")).toBeFocused();
      expect(await page.evaluate(() => document.querySelector("#course-authoring-root").scrollTop)).toBe(await page.evaluate(() => window.contextReturnScroll));
      expect(await page.evaluate(() => location.hash)).toBe(await page.evaluate(() => window.contextProbe.route));
    }
    expect(await page.evaluate(() => window.contextProbe.requests)).toEqual([]);
    expect(await page.evaluate(() => window.contextProbe.navigationWrites)).toEqual([]);
  });
}

test("Editor contextual preserva rascunho ao voltar, salva e exige decisão sobre resposta incerta", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mount(page, "light");
  await page.evaluate(() => window.openContextProbe(1));
  const title = page.locator('[data-study-structure-field="title"]');
  await title.fill("Título corrigido sem trocar de área");
  await page.locator('[data-action="authoring-context-back"]').first().click();
  await expect(page.getByRole("alertdialog")).toContainText("rascunho");
  await page.keyboard.press("Escape");
  await expect(title).toHaveText("Título corrigido sem trocar de área");
  await page.locator('[data-action="save-study-structure"]').click();
  await expect(page.locator("[data-context-origin]")).toBeFocused();
  expect(await page.evaluate(() => window.contextProbe.requests[0].title)).toBe("Título corrigido sem trocar de área");
  await page.evaluate(() => window.openContextProbe(1));
  await title.fill("Rascunho cuja resposta se perdeu");
  await page.evaluate(() => { window.contextLoseResponse = true; });
  await page.locator('[data-action="save-study-structure"]').click();
  await expect(page.locator('.study-structure-editor [role="alert"]')).toBeVisible();
  await page.locator('[data-action="authoring-context-back"]').first().click();
  await expect(page.getByRole("alertdialog")).toContainText("pode ter sido concluída");
  await page.locator('[data-action="cancel-authoring-exit"]').click();
  await expect(title).toHaveText("Rascunho cuja resposta se perdeu");
  await page.locator('[data-action="authoring-context-back"]').first().click();
  await page.locator('[data-action="confirm-authoring-exit"]').click();
  await expect(page.locator("[data-context-origin]")).toBeFocused();
  expect(await page.evaluate(() => window.contextProbe.requests.length)).toBe(2);
  expect(await page.evaluate(() => window.contextProbe.returns.at(-1).discardedUnknown)).toBe(true);
  expect(await page.evaluate(() => window.contextProbe.navigationWrites)).toEqual([]);
  await page.evaluate(() => window.openContextProbe(5));
  await page.locator('[data-study-manual-title]').fill("Unidade editada dentro da Autoria");
  await page.locator('[data-action="study-manual-save"]').click();
  await expect(page.locator("[data-context-origin]")).toBeFocused();
  expect(await page.evaluate(() => window.contextProbe.requests.at(-1).studyUnit.title)).toBe("Unidade editada dentro da Autoria");
  expect(await page.evaluate(() => window.contextProbe.returns.at(-1).reason)).toBe("saved");
});

test("Editor contextual alinha o desktop com barras de rolagem reais a 958 px", async ({ browser }) => {
  for (const theme of ["light", "dark"]) {
    const context = await browser.newContext({ viewport: { width: 958, height: 900 }, isMobile: false, hasTouch: false,
      baseURL: `http://127.0.0.1:${process.env.ARALEARN_E2E_PORT || "4182"}` });
    try {
      const page = await context.newPage();
      await mount(page, theme);
      const before = await headerGeometry(page, "#course-authoring-root");
      await page.evaluate(() => window.openContextProbe(1));
      const after = await headerGeometry(page, "#aralearn-editor-root");
      for (const control of ["back", "sync", "menu"]) for (const dimension of ["x", "y", "width", "height"]) {
        expect(Math.abs(after[control][dimension] - before[control][dimension]), `${theme}: ${control}.${dimension}`).toBeLessThanOrEqual(1);
      }
    } finally { await context.close(); }
  }
});

test("Editor contextual mantém ações no rodapé com conteúdo curto sem depender do rolador", async ({ page }, info) => {
  for (const width of [360, 390, 430, 1280]) for (const theme of ["light", "dark"]) {
    await page.setViewportSize({ width, height: 844 });
    await mount(page, theme, { long: false });
    for (const length of [1, 2, 3, 4]) {
      await page.evaluate(length => window.openContextProbe(length), length);
      const save = page.locator('[data-action="save-study-structure"]'), cancel = page.locator('[data-action="cancel-study-structure"]');
      const boxes = { save: await save.boundingBox(), cancel: await cancel.boundingBox(), screen: await page.locator('#aralearn-editor-root .screen').boundingBox() };
      expect(Math.abs(boxes.save.y - boxes.cancel.y)).toBeLessThanOrEqual(1);
      expect(Math.abs(boxes.screen.x + boxes.screen.width - boxes.save.x - boxes.save.width - 10)).toBeLessThanOrEqual(1);
      expect(Math.abs(boxes.screen.y + boxes.screen.height - boxes.save.y - boxes.save.height - 10)).toBeLessThanOrEqual(1);
      if (width === 390 && length === 1) await page.screenshot({ path: info.outputPath(`short-course-${theme}.png`) });
      await cancel.click();
      await expect(page.locator("[data-context-origin]")).toBeFocused();
    }
  }
});
