import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";

const project = JSON.parse(await readFile(new URL("../fixtures/package/project-minimal.json", import.meta.url), "utf8"));
const mainSource = await readFile(new URL("../../public/main.js", import.meta.url), "utf8");
const settingsModule = mainSource.slice(0, mainSource.indexOf('const root = document.getElementById("app-root");')) + "\nexport { renderSettings };";

async function mount(page, theme) {
  await page.route("**/main.js", route => route.fulfill({ contentType: "application/javascript", body: "" }));
  await page.route("**/settings-geometry.js", route => route.fulfill({ contentType: "application/javascript", body: settingsModule }));
  await page.goto("/");
  await page.evaluate(async ({ project, theme }) => {
    document.documentElement.dataset.colorMode = theme;
    document.body.innerHTML = '<div id="app-root"><div id="aralearn-editor-root"><div class="app-shell"></div></div><div id="settings-root"></div></div>';
    const { renderCourseStudyScreen } = await import("/src/study/CourseStudyScreen.js");
    const { renderCourseAuthoringSurface } = await import("/src/ui/CourseAuthoringSurface.js");
    const { renderSettings } = await import("/settings-geometry.js");
    const { createStudyTools, renderStudyToolActions } = await import("/src/study/studyTools.js");
    window.renderFrameProbe = (view, long, reviewQueueOpen = false, editing = false) => {
      window.frameTools?.destroy();
      if (!document.querySelector(".app-shell")) document.querySelector("#aralearn-editor-root").innerHTML = '<div class="app-shell"></div>';
      const source = structuredClone(project);
      const course = source.courses[0], moduleValue = course.modules[0], lesson = moduleValue.lessons[0];
      const microsequence = lesson.microsequences[0], studyUnit = microsequence.studyUnits[0];
      const title = long ? "Título completo com palavras que ocupam várias linhas e devem permanecer disponíveis. ".repeat(3) : "Título";
      const goal = long ? "Descrição integral: conhecimento, explicação e exemplos permanecem disponíveis por rolagem. ".repeat(28) + "FIM DA DESCRIÇÃO" : "Descrição.";
      course.title = moduleValue.title = lesson.title = microsequence.title = studyUnit.title = title;
      course.goal = moduleValue.guide.goal = lesson.guide.goal = microsequence.goal = goal;
      studyUnit.content = [{ id: "paragraph", package: "aralearn.resource.paragraph", version: "1.0.0", data: { text: goal } }];
      studyUnit.response = null; studyUnit.feedback = [];
      const html = renderCourseStudyScreen({ project: source, view, course, moduleValue, lesson, microsequence, studyUnit,
        structuralEditor: { enabled: editing, editing, saving: false, label: "Curso", fields: { title, goal },
          selectedChildId: view === "course" ? moduleValue.id : view === "module" ? lesson.id : microsequence.id },
        selection: { studyUnitIndex: 0 }, progress: { version: 1, lessons: {} }, coursePermissionsById: {},
        reviewQueueOpen, reviewItems: [{ title: "Rever unidade", context: "Contexto", entityPath: [course.id,moduleValue.id,lesson.id,microsequence.id,studyUnit.id] }] });
      document.querySelector(".app-shell").innerHTML = html;
      window.frameUnit = studyUnit;
      window.openToolProbe = (longTool) => {
        window.frameTools?.destroy();
        studyUnit.content = [{ id: "calculator", package: "aralearn.resource.calculator", version: "1.0.0", data: {
          title: "Verificar o cálculo", angleUnit: "radians", initialExpression: "2+3",
          ...(longTool ? { prompt: goal.slice(0, 1900) } : {}) } }];
        const host = document.querySelector(".app-shell");
        host.querySelectorAll(".study-tool-actions").forEach(node => node.remove());
        host.insertAdjacentHTML("beforeend", renderStudyToolActions(studyUnit));
        window.frameTools = createStudyTools({ root: document.querySelector("#aralearn-editor-root"), getStudyUnit: () => studyUnit,
          getContextKey: () => "synthetic", getHost: () => ({}) });
        window.frameTools.afterRender();
        host.querySelector("[data-study-tool-id]").click();
      };
    };
    window.renderAuthorHeader = (long = false) => {
      document.querySelector("#aralearn-editor-root").innerHTML = '<main class="course-authoring-root">' + renderCourseAuthoringSurface({ view: "course", section: "people", routeKey: "synthetic-people",
        course: { courseId: "e3060000-0000-4000-8000-000000000001", title: long ? "Título extenso do curso ".repeat(20) : "Curso", revision: 1,
          ownership: "owned", canEdit: true, visibility: "private", publicFileAccess: "restricted" },
        ...(long ? { writeMessage: "Mensagem que aparece depois da gravação. ".repeat(10) } : {}) }) + '</main>';
    };
    let mode = "automatic";
    window.frameSettings = renderSettings(document.querySelector("#settings-root"), { getSession: () => ({ user: { id: "synthetic" } }) }, {
      getPersonProfile: async () => ({ userId: "synthetic", handle: "sintetico", avatarObjectKey: null })
    }, { synchronizationPreference: { get: () => mode, set: value => { mode=value; }, subscribe: () => () => {} },
      previewVisitorState: async () => ({ courses: [] }), adoptVisitorState: async () => {} });
    await document.fonts.ready;
  }, { project, theme });
}

test("Inspection conserva o frame e o card vizinho com título, prosa e detalhes longos", async ({ page }, testInfo) => {
  for (const width of [360, 390, 430, 1280]) for (const theme of ["light", "dark"]) {
    await page.setViewportSize({ width, height: 844 });
    await mount(page, theme);
    await page.evaluate(async () => {
      const { createCourseInspectionSequence, normalizeCourseInspectionPage } = await import("/src/ui/CourseInspectionSequence.js");
      document.querySelector("#aralearn-editor-root").innerHTML = '<main class="course-authoring-root"><section class="course-authoring-surface"><div data-inspection-probe></div></section></main>';
      const courseId = "e3060000-0000-4000-8000-000000000001";
      const items = [false, true].map((long, index) => ({
        studyUnit: { id: `unit-${index}`, position: index + 1, title: long ? "Título longo e íntegro. ".repeat(12).trim() : "Título",
          role: "theory", topics: [], response: null, feedback: [],
          content: [{ id: `paragraph-${index}`, package: "aralearn.resource.paragraph", version: "1.0.0",
            data: { text: long ? "A explicação completa permanece disponível na área de leitura. ".repeat(50) + "FIM DA PROSA" : "Explicação." } }] },
        version: 1, updatedAt: "2026-09-05T12:00:00Z", ordinal: index + 1,
        curriculumPath: { module: { id: "module", position: 0, title: "Módulo" }, lesson: { id: "lesson", position: 0, title: "Lição" },
          didacticMicrosequence: { id: "micro", position: 0, title: long ? "Contexto extenso ".repeat(12).trim() : "Contexto" } },
        authoringPart: null, authorship: { createdOrigin: "human", lastRevisionOrigin: "human", design: { application: null } },
        deepLink: `#/authoring/courses/${courseId}?section=content&studyUnitId=unit-${index}`
      }));
      normalizeCourseInspectionPage({ contract: "aralearn.course-study-unit-inspection-page.v2", courseId,
        courseRevision: 1, scope: { kind: "course", id: null }, totalCount: 2,
        scopeOptions: { authoringParts: [], unassignedStudyUnitCount: 2 }, items,
        hasPrevious: false, hasMore: false, previousCursor: null, nextCursor: null, pageBytes: 12000 });
      window.frameInspection = createCourseInspectionSequence({ root: document.querySelector("[data-inspection-probe]"),
        course: { courseId, revision: 1, title: "Curso" }, controller: {
          loadAuthoringInspectionPosition: async () => null, saveAuthoringInspectionPosition: async () => {},
          loadAuthoringStudyUnits: async (_courseId, { scope }) => ({ contract: "aralearn.course-study-unit-inspection-page.v2", courseId,
            courseRevision: 1, scope, totalCount: 2, scopeOptions: { authoringParts: [], unassignedStudyUnitCount: 2 }, items,
            hasPrevious: false, hasMore: false, previousCursor: null, nextCursor: null, pageBytes: 12000 })
        } });
      await window.frameInspection.open();
      await document.fonts.ready;
    });
    await page.getByRole("button", { name: "Adicionar Título à seleção", exact: true }).click();
    const cards = page.locator(".course-inspection-item > article");
    await expect(cards).toHaveCount(2);
    const bounds = await cards.evaluateAll(nodes => nodes.map(node => ({ width: node.clientWidth, height: node.clientHeight })));
    expect(bounds[0]).toEqual(bounds[1]);
    const first = page.locator('.course-inspection-item[data-inspection-ordinal="1"]');
    await first.locator(".course-inspection-item-details > summary").scrollIntoViewIfNeeded();
    const beforeScroll = await page.locator(".course-authoring-root").evaluate(node => node.scrollTop);
    const second = await box(page, '.course-inspection-item[data-inspection-ordinal="2"]');
    await first.locator(".course-inspection-item-details > summary").click();
    const afterScroll = await page.locator(".course-authoring-root").evaluate(node => node.scrollTop);
    const afterSecond = await box(page, '.course-inspection-item[data-inspection-ordinal="2"]');
    sameBox({ ...afterSecond, y: afterSecond.y + afterScroll }, { ...second, y: second.y + beforeScroll }, "Detalhes não deslocam outro card");
    await first.locator(".course-inspection-item-details > summary").click();
    const content = cards.nth(1).locator(".card-sheet-content");
    await content.focus(); await page.keyboard.press("End");
    await expect.poll(() => content.evaluate(node => node.scrollTop)).toBeGreaterThan(0);
    await expect(content).toContainText("FIM DA PROSA");
    await page.screenshot({ path: testInfo.outputPath(`inspection-long-${width}-${theme}.png`) });
    await page.evaluate(() => window.frameInspection.destroy());
  }
});

async function box(page, selector) {
  return page.locator(selector).first().evaluate(node => {
    const rect = node.getBoundingClientRect(); return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
  });
}
function sameBox(actual, expected, label) {
  for (const key of ["x", "y", "width", "height"]) expect(Math.abs(actual[key] - expected[key]), `${label} ${key}`).toBeLessThanOrEqual(1);
}

for (const width of [360, 390, 430, 1280]) for (const theme of ["light", "dark"]) {
  test(`frames e tipografia independem de texto em ${width} ${theme}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 844 });
    await mount(page, theme);
    await page.evaluate(() => window.renderFrameProbe("course", false));
    const anchors = {
      back: await box(page, '[data-action="go-back"]'),
      sync: await box(page, '.study-runtime-status-control'),
      menu: await box(page, '[data-action="open-settings"]')
    };
    await page.evaluate(() => window.renderAuthorHeader());
    const authorAnchors = {
      back: await box(page, '[data-course-authoring-action="back"]'),
      sync: await box(page, '.study-runtime-status-control'),
      menu: await box(page, '.course-authoring-task-menu > summary')
    };
      for (const key of Object.keys(anchors)) sameBox(authorAnchors[key], anchors[key], `Cabeçalhos ${key}`);
    await page.evaluate(() => window.renderAuthorHeader(true));
    sameBox(await box(page, '[data-course-authoring-action="back"]'), anchors.back, "Aviso e título do curso");
    for (const [view, selector] of [["courses", ".home-course-selector-card"], ["course", ".navigation-list-card"],
      ["module", ".navigation-list-card"], ["lesson", ".navigation-list-card"], ["study", ".runtime-card-sheet"]]) {
      await page.evaluate(view => window.renderFrameProbe(view, false), view);
      const short = await box(page, selector);
      const shell = await box(page, ".app-shell");
      expect(shell.width).toBe(Math.min(width, 430));
      const summary = view !== "courses" && view !== "study" ? await box(page, ".entity-summary-card") : null;
      await page.evaluate(view => window.renderFrameProbe(view, true), view);
      sameBox(await box(page, selector), short, view);
      if (summary) sameBox(await box(page, ".entity-summary-card"), summary, `${view} summary`);
      if (summary) {
        await page.evaluate(view => window.renderFrameProbe(view, true, false, true), view);
        const card = page.locator(".navigation-list-card").first();
        const frame = await card.boundingBox();
        const action = await card.locator(".navigation-actions .open-mini").boundingBox();
        expect(Math.abs(action.x + action.width - (frame.x + frame.width - 13))).toBeLessThanOrEqual(1);
        expect(Math.abs(action.y + action.height - (frame.y + frame.height - 11))).toBeLessThanOrEqual(1);
        await page.evaluate(view => window.renderFrameProbe(view, true), view);
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
      const scroll = page.locator(view === "courses" ? ".home-course-preview-copy" : view === "study" ? ".card-sheet-content" : ".navigation-main").first();
      await scroll.focus(); await page.keyboard.press("End");
      await expect.poll(() => scroll.evaluate(node => node.scrollTop)).toBeGreaterThan(0);
      await expect(scroll).toContainText("FIM DA DESCRIÇÃO");
      if (view === "courses") {
        await page.evaluate(() => window.renderFrameProbe("courses", true, true));
        sameBox(await box(page, selector), short, "Rever não desloca curso");
        await page.screenshot({ path: testInfo.outputPath(`home-long-${width}-${theme}.png`) });
      }
    }
    await page.evaluate(() => { window.renderFrameProbe("courses", true); window.openToolProbe(false); });
    await expect(page.locator("#study-tool-title")).toHaveText("Calculadora");
    const tool = await box(page, ".study-tools-panel");
    expect(await page.locator("#study-tool-title").evaluate(node => parseFloat(getComputedStyle(node).fontSize))).toBeLessThanOrEqual(17);
    await page.getByRole("textbox", { name: "Expressão" }).press("Enter");
    await expect(page.locator("[data-calculator-output]")).toHaveText("Resultado aproximado: 5");
    await page.getByText("Operações e precisão", { exact: true }).click();
    sameBox(await box(page, ".study-tools-panel"), tool, "Ajuda não altera ferramenta");
    await expect(page.locator(".package-calculator-limits")).not.toContainText(/256|128|32 níveis|10¹²/u);
    await page.screenshot({ path: testInfo.outputPath(`calculator-${width}-${theme}.png`) });
    await page.getByRole("button", { name: "Fechar ferramenta" }).click();
    await page.evaluate(() => window.openToolProbe(true));
    await expect(page.locator("[data-calculator-input]")).toBeVisible();
    sameBox(await box(page, ".study-tools-panel"), tool, "Texto da ferramenta");
    await page.getByRole("button", { name: "Fechar ferramenta" }).click();
    await page.evaluate(() => window.frameSettings.open());
    await expect(page.locator("[data-settings-status]")).toBeEmpty();
    const settings = await box(page, ".account-settings-sheet");
    expect(await page.locator("#study-sync-title").evaluate(node => parseFloat(getComputedStyle(node).fontSize))).toBeLessThanOrEqual(17);
    await expect(page.locator(".study-sync-explanation")).not.toHaveAttribute("open", "");
    await page.getByText("Como sincroniza", { exact: true }).click();
    await expect(page.locator(".study-sync-explanation")).toContainText("Edições salvas em Autoria são enviadas em ambos os modos");
    sameBox(await box(page, ".account-settings-sheet"), settings, "Ajuda de sincronização");
    await page.getByText("Progresso sem conta", { exact: true }).click();
    sameBox(await box(page, ".account-settings-sheet"), settings, "Adoção revelada");
    await page.screenshot({ path: testInfo.outputPath(`settings-${width}-${theme}.png`) });
  });
}

test("cabeçalhos reais mantêm âncoras com scrollbar de desktop e modo edição", async ({ browser, baseURL }) => {
  const context = await browser.newContext({ baseURL, viewport: { width: 958, height: 844 }, isMobile: false, hasTouch: false });
  const page = await context.newPage();
  try {
    for (const theme of ["light", "dark"]) {
      await mount(page, theme);
      await page.evaluate(() => window.renderFrameProbe("course", true, false, true));
      const selectors = ['[data-action="go-back"]', '.study-runtime-status-control', '[data-action="open-settings"]'];
      const study = await Promise.all(selectors.map(selector => box(page, selector)));
      await page.evaluate(() => window.renderAuthorHeader(true));
      const author = await Promise.all(['[data-course-authoring-action="back"]', '.study-runtime-status-control', '.course-authoring-task-menu > summary'].map(selector => box(page, selector)));
      author.forEach((bounds, index) => sameBox(bounds, study[index], `Desktop958 ${theme} controle ${index}`));
      const heading = await box(page, '.course-authoring-course-heading h1');
      expect(Math.abs(heading.y + heading.height / 2 - (author[0].y + author[0].height / 2))).toBeLessThanOrEqual(1);
    }
  } finally { await context.close(); }
});
