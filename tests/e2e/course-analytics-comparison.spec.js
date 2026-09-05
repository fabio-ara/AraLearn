import { test, expect } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";

async function mount(page, theme) {
  const root = process.cwd();
  // Browser proof uses the current source modules and an explicit adapter fixture, not a hosted API.
  await page.route("**/src/**", async route => {
    const relative = decodeURIComponent(new URL(route.request().url()).pathname).slice(1);
    const target = path.resolve(root, relative);
    if (!target.startsWith(path.resolve(root, "src") + path.sep)) return route.abort();
    await route.fulfill({ contentType: relative.endsWith(".json") ? "application/json" : "application/javascript", body: await fs.readFile(target, "utf8") });
  });
  await page.route("**/tests/helpers/courseAuthoringAnalyticsFixture.js", route => route.fulfill({ contentType: "application/javascript", path: path.join(root, "tests/helpers/courseAuthoringAnalyticsFixture.js") }));
  await page.route("**/*.css", async route => {
    const name = path.basename(new URL(route.request().url()).pathname);
    if (["styles-tokens.css", "styles-shell-baseline.css", "styles.css", "course-authoring.css"].includes(name)) return route.fulfill({ contentType: "text/css", path: path.join(root, "public", name) });
    await route.continue();
  });
  await page.route("**/main.js", route => route.fulfill({ contentType: "application/javascript", body: "" }));
  await page.goto("/");
  await page.evaluate(async theme => {
    document.documentElement.dataset.colorMode = theme;
    document.body.innerHTML = '<div id="app-root"><div id="aralearn-editor-root"><main class="course-authoring-root"><div id="analytics-probe"></div></main></div></div>';
    const { createCourseAnalyticsPanel } = await import("/src/ui/CourseAnalyticsPanel.js");
    const { courseAuthoringAnalyticsFixture, ANALYTICS_COURSE_ID } = await import("/tests/helpers/courseAuthoringAnalyticsFixture.js");
    const { buildCourseAuthoringComparison, assembleCourseAuthoringExport } = await import("/src/domain/courseAuthoringComparison.js");
    const otherId = "30000000-0000-4000-8000-000000000003";
    function reading(id = ANALYTICS_COURSE_ID, query = { scope: { kind: "course", ref: null } }) {
      const value = courseAuthoringAnalyticsFixture({ courseId: id, title: id === otherId ? "Curso comparado" : "Curso de referência", studyUnits: Array.from({ length: 60 }, (_, index) => ({ studyUnitRef: `unit-${index + 1}`, title: `Relação ${index + 1} — 日本語 e uma descrição com contexto completo`, wordCount: 100 + index, declaration: { mode: index % 3 ? "expository" : "mixed", introducedInstructionalAnalysisUnitIds: Array.from({ length: id === otherId ? 2 : 1 }, (_, n) => `analysis-${n + 1}`), usedInstructionalAnalysisUnitIds: [], explanationApplications: [], practiceApplications: [] } })) });
      value.basis.analysisUnits = [1, 2, 3].map((n) => ({ ref: `analysis-${n}`, position: n, statement: `Relação planejada ${n}`, description: "Definição completa e literal." }));
      value.scope.options.push({ kind: "didactic_microsequence", ref: "micro-one", label: "Microssequência de relações" });
      value.scope.selected = value.scope.options.find(scope => scope.kind === query.scope.kind && scope.ref === query.scope.ref);
      return value;
    }
    window.analyticsProbe = { reads: [], comparisons: [], exports: [], downloads: [] };
    const controller = {
      async loadCourseAuthoringAnalytics(id, options) { window.analyticsProbe.reads.push({ id, ...options }); return reading(id, options.query); },
      async listCourses() { return { items: [{ courseId: ANALYTICS_COURSE_ID, revision: 7, title: "Curso de referência", ownership: "owned", canEdit: true }, { courseId: otherId, revision: 7, title: "Curso comparado", ownership: "owned", canEdit: true }], hasMore: false, nextCursor: null }; },
      async loadCourseAuthoringComparison(request) { window.analyticsProbe.comparisons.push(request); return buildCourseAuthoringComparison({ left: reading(request.left.courseId, { scope: request.left.scope }), right: reading(request.right.courseId, { scope: request.right.scope }) }); },
      async exportCourseAuthoring(request) { window.analyticsProbe.exports.push(request); const analytics = reading(request.courseId, { scope: request.scope }); return assembleCourseAuthoringExport({ analytics, document: { contract: "aralearn.course.v1", courses: [{ id: request.courseId, title: analytics.course.title, goal: "Objetivo integral", modules: [] }] } }); }
    };
    window.analyticsPanel = createCourseAnalyticsPanel({ root: document.querySelector("#analytics-probe"), controller, course: { courseId: ANALYTICS_COURSE_ID, revision: 7 }, download: value => window.analyticsProbe.downloads.push(value) });
    await window.analyticsPanel.open(); await document.fonts.ready;
  }, theme);
}

test("Análise: distribuição, comparação, teclado e exportação nas oito geometrias", async ({ page }, info) => {
  test.setTimeout(120000);
  const errors = []; page.on("pageerror", error => errors.push(error.message));
  for (const width of [360, 390, 430, 1280]) for (const theme of ["light", "dark"]) {
    await page.setViewportSize({ width, height: 844 }); await mount(page, theme);
    const panel = page.getByRole("region", { name: "Dados de autoria", exact: true });
    await expect(panel.getByRole("heading", { name: "Novidade declarada" })).toBeVisible();
    const barColor = await panel.locator(".course-analytics-bar").first().evaluate(node => getComputedStyle(node, "::before").backgroundColor);
    expect(barColor).toBe(theme === "dark" ? "rgb(138, 180, 248)" : "rgb(11, 87, 208)");
    await page.screenshot({ path: info.outputPath(`analytics-${width}-${theme}-distribution.png`) });
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    const configuration = panel.getByRole("button", { name: "Escolher dimensão e escopo" });
    const dimensions = await configuration.boundingBox(); expect(dimensions.width).toBe(44); expect(dimensions.height).toBe(44);
    await configuration.click();
    const dialog = page.getByRole("dialog"); await expect(dialog).toBeVisible();
    const frame = await dialog.boundingBox(); expect(frame.width).toBeLessThanOrEqual(Math.min(430, width - 16)); expect(frame.height).toBe(640);
    expect(await dialog.evaluate(node => getComputedStyle(node).backgroundColor)).toBe(theme === "dark" ? "rgb(27, 31, 36)" : "rgb(255, 255, 255)");
    const footer = await dialog.locator("footer").boundingBox();
    await dialog.getByRole("button", { name: "Aplicar leitura" }).focus(); await page.keyboard.press("Tab");
    await expect(dialog.getByRole("button", { name: "Fechar análise contextual" })).toBeFocused();
    await page.screenshot({ path: info.outputPath(`analytics-${width}-${theme}-configuration.png`) });
    await page.keyboard.press("Escape"); await expect(configuration).toBeFocused();
    await panel.getByRole("button", { name: "Abrir 60 unidades: 1" }).click();
    await expect(dialog.getByRole("link", { name: /Relação 1 —/u })).toBeVisible();
    expect(await dialog.locator(".course-analytics-sheet-body").evaluate(node => node.scrollHeight > node.clientHeight)).toBe(true);
    await dialog.locator(".course-analytics-sheet-body").evaluate(node => { node.scrollTop = node.scrollHeight; });
    expect(await dialog.boundingBox()).toEqual(frame); expect(await dialog.locator("footer").boundingBox()).toEqual(footer);
    await page.keyboard.press("Escape");
    await panel.getByRole("button", { name: "Comparar cursos", exact: true }).click();
    await dialog.getByRole("combobox", { name: "Curso para comparar", exact: true }).selectOption("1");
    await expect(dialog.getByRole("combobox", { name: "Escopo comparado", exact: true })).toBeVisible();
    await dialog.getByRole("button", { name: "Comparar estas edições" }).click();
    await expect(dialog.getByText("Inventário planejado", { exact: true })).toBeVisible();
    await dialog.getByText("Configuração solicitada", { exact: true }).click();
    expect(await dialog.boundingBox()).toEqual(frame); expect(await dialog.locator("footer").boundingBox()).toEqual(footer);
    await page.screenshot({ path: info.outputPath(`analytics-${width}-${theme}-comparison.png`) });
    await page.keyboard.press("Escape"); await expect(panel.locator(".course-analytics-comparison")).toBeVisible();
    await panel.getByRole("button", { name: "Exportar curso e análise", exact: true }).click();
    await dialog.getByRole("button", { name: "Baixar arquivo JSON" }).click();
    expect(await page.evaluate(() => window.analyticsProbe.exports.length)).toBe(1);
    const exported = await page.evaluate(() => JSON.parse(window.analyticsProbe.downloads[0].content));
    expect(exported.contract).toBe("aralearn.course-authoring-export.v1"); expect(exported.artifact.document.courses[0].goal).toBe("Objetivo integral");
    await page.keyboard.press("Escape");
    expect(await panel.evaluate(node => node.scrollWidth - node.clientWidth)).toBeLessThanOrEqual(1);
    await page.unrouteAll({ behavior: "wait" });
  }
  expect(errors).toEqual([]);
});
