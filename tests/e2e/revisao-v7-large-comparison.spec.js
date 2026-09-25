import { test, expect } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";

const LIMIT_MESSAGE = "Leitura acima do limite. Escolha outro curso ou uma parte menor, se disponível.";

async function mount(page, { code, phase, theme }, baseURL) {
  const root = process.cwd(), externalRequests = [];
  // Prova de apresentação com controller/identidade simulados, sem MCP Auth.
  // Os 413 aqui são estímulos explícitos: a prova causal está no teste runtime HTTP.
  await page.route("**/*", async route => {
    const url = new URL(route.request().url());
    if (url.origin !== new URL(baseURL).origin) {
      externalRequests.push(url.origin);
      return route.abort();
    }
    if (url.pathname === "/") return route.fulfill({ contentType: "text/html", body: `<!doctype html>
      <html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1">
      <link rel="stylesheet" href="/styles-tokens.css"><link rel="stylesheet" href="/styles-shell-baseline.css">
      <link rel="stylesheet" href="/styles.css"><link rel="stylesheet" href="/course-authoring.css"></head>
      <body><div id="app-root"><div id="aralearn-editor-root"><main class="course-authoring-root">
      <div id="analytics-probe"></div></main></div></div></body></html>` });
    if (url.pathname.startsWith("/src/") || url.pathname === "/tests/helpers/courseAuthoringAnalyticsFixture.js") {
      const relative = decodeURIComponent(url.pathname).slice(1), target = path.resolve(root, relative);
      if (!target.startsWith(path.resolve(root, "src") + path.sep) &&
        target !== path.resolve(root, "tests/helpers/courseAuthoringAnalyticsFixture.js")) return route.abort();
      return route.fulfill({ contentType: relative.endsWith(".json") ? "application/json" : "application/javascript",
        body: await fs.readFile(target, "utf8") });
    }
    const name = path.basename(url.pathname);
    if (["styles-tokens.css", "styles-shell-baseline.css", "styles.css", "course-authoring.css"].includes(name)) {
      return route.fulfill({ contentType: "text/css", path: path.join(root, "public", name) });
    }
    return route.continue();
  });
  await page.goto("/");
  await page.evaluate(async ({ code, phase, theme }) => {
    document.documentElement.dataset.colorMode = theme;
    const { createCourseAnalyticsPanel } = await import("/src/ui/CourseAnalyticsPanel.js");
    const { courseAuthoringAnalyticsFixture, ANALYTICS_COURSE_ID } = await import("/tests/helpers/courseAuthoringAnalyticsFixture.js");
    const { buildCourseAuthoringComparison } = await import("/src/domain/courseAuthoringComparison.js");
    const largeId = "30000000-0000-4000-8000-000000000003";
    const smallId = "30000000-0000-4000-8000-000000000004";
    const titles = new Map([[ANALYTICS_COURSE_ID, "Curso de referência"],
      [largeId, "Curso sintético grande"], [smallId, "Curso sintético menor"]]);
    const reading = id => courseAuthoringAnalyticsFixture({ courseId: id, title: titles.get(id),
      studyUnits: [{ studyUnitRef: "unit-one", title: "Uma relação sintética", wordCount: 180 }] });
    const failure = () => Object.assign(new Error("Leia uma parcela menor do Curso."), { status: 413, code });
    const probe = window.largeComparisonProbe = { reads: [], comparisons: [] };
    const controller = {
      async listCourses() {
        return { items: [...titles].map(([courseId, title]) => ({ courseId, title, revision: 7,
          ownership: "owned", canEdit: true })), hasMore: false, nextCursor: null };
      },
      async loadCourseAuthoringAnalytics(id, options) {
        probe.reads.push({ id, ...options });
        if (id === largeId && phase === "read") throw failure();
        return reading(id);
      },
      async loadCourseAuthoringComparison(request) {
        probe.comparisons.push(request);
        if (request.right.courseId === largeId) throw failure();
        return buildCourseAuthoringComparison({ left: reading(request.left.courseId), right: reading(request.right.courseId) });
      }
    };
    window.largeComparisonPanel = createCourseAnalyticsPanel({ root: document.querySelector("#analytics-probe"),
      controller, course: { courseId: ANALYTICS_COURSE_ID, revision: 7 } });
    await window.largeComparisonPanel.open();
    await document.fonts.ready;
  }, { code, phase, theme });
  return externalRequests;
}

for (const phase of ["read", "comparison"]) {
  for (const code of ["response_too_large", "course_authoring_analytics_response_too_large", "course_response_too_large"]) {
    test(`H005 390px: ${phase} ${code}`, async ({ page, baseURL }, info) => {
      const errors = [];
      page.on("pageerror", error => errors.push(error.message));
      await page.setViewportSize({ width: 390, height: 844 });
      const theme = phase === "read" ? "light" : "dark";
      const external = await mount(page, { code, phase, theme }, baseURL);
      await page.getByRole("button", { name: "Comparar cursos", exact: true }).click();
      const dialog = page.getByRole("dialog");
      const courses = dialog.getByRole("combobox", { name: "Curso para comparar", exact: true });
      const compare = dialog.getByRole("button", { name: "Comparar cursos", exact: true });
      await courses.selectOption("1");
      if (phase === "comparison") {
        await expect(compare).toBeEnabled();
        await compare.click();
      }
      const alert = dialog.getByRole("alert");
      await expect(alert).toHaveText(LIMIT_MESSAGE);
      await expect(alert).toBeInViewport({ ratio: 1 });
      await expect(dialog).not.toContainText(/tente novamente|Carregando leitura/iu);
      await expect(dialog.getByRole("button", { name: /tentar novamente|atualizar leitura/iu })).toHaveCount(0);
      await expect(courses).toBeEnabled();
      await expect(dialog.getByRole("button", { name: "Fechar análise contextual" })).toBeEnabled();
      if (phase === "read") {
        await expect(compare).toBeDisabled();
        await expect(dialog.getByRole("combobox", { name: "Parte do curso", exact: true })).toHaveCount(0);
      }
      expect(await page.evaluate(() => window.largeComparisonProbe.reads.length)).toBe(phase === "read" ? 2 : 3);
      expect(await page.evaluate(() => window.largeComparisonProbe.comparisons.length)).toBe(phase === "read" ? 0 : 1);
      expect(await dialog.evaluate(node => node.scrollWidth - node.clientWidth)).toBeLessThanOrEqual(1);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
      await page.screenshot({ path: info.outputPath(`large-comparison-${phase}-${code}-390-${theme}.png`) });

      // A orientação leva a uma recuperação observável sem repetir o curso bloqueado.
      await courses.selectOption("2");
      await expect(alert).toHaveCount(0);
      await expect(compare).toBeEnabled();
      await compare.click();
      await expect(dialog.getByText("Inventário planejado", { exact: true })).toBeVisible();
      const largeReads = await page.evaluate(() => window.largeComparisonProbe.reads
        .filter(item => item.id === "30000000-0000-4000-8000-000000000003").length);
      expect(largeReads).toBe(phase === "read" ? 1 : 2);
      await page.keyboard.press("Escape");
      await expect(dialog).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Comparar cursos", exact: true })).toBeFocused();
      expect(errors).toEqual([]);
      expect(external).toEqual([]);
    });
  }
}
