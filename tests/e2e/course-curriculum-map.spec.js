import { test, expect } from "@playwright/test";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { curriculumMapFixture } from "../fixtures/courseCurriculumMapFixture.js";

const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
let server;
let origin;
test.beforeAll(async () => {
  server = createServer(async (request, response) => {
    const pathname = new URL(request.url, "http://127.0.0.1").pathname;
    if (pathname === "/") {
      response.setHeader("Content-Type", "text/html; charset=utf-8");
      response.end('<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/public/styles-tokens.css"><link rel="stylesheet" href="/public/course-authoring.css"><style>body{margin:0;background:var(--surface-canvas);font-family:var(--font-ui)}.map-test-content{max-width:960px;margin:auto;padding:16px;box-sizing:border-box}</style><title>Mapa curricular isolado</title><body><main class="course-authoring-root"><div class="map-test-content"></div></main></body></html>');
      return;
    }
    if (!/^\/(?:src|public)\//u.test(pathname)) { response.writeHead(404).end(); return; }
    const target = path.resolve(repository, `.${pathname}`);
    if (!target.startsWith(`${repository}${path.sep}`)) { response.writeHead(404).end(); return; }
    try {
      response.setHeader("Content-Type", target.endsWith(".css") ? "text/css" : "text/javascript");
      response.end(await readFile(target));
    } catch { response.writeHead(404).end(); }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
});
test.afterAll(async () => { await new Promise((resolve) => server.close(resolve)); });

async function mount(page, fixture = curriculumMapFixture()) {
  await page.goto(origin);
  await page.evaluate(async (fixture) => {
    const { renderCourseCurriculumMap, bindCourseCurriculumMap } = await import("/src/ui/CourseCurriculumMap.js");
    const host = document.querySelector(".map-test-content");
    const scrollRoot = document.querySelector("main");
    window.__mapNavigations = [];
    function render(initialState = null) {
      host.innerHTML = renderCourseCurriculumMap({ ...fixture, expansion: initialState?.expansion || [] });
      window.__mapBinding = bindCourseCurriculumMap(host.querySelector("[data-course-curriculum-map]"), {
        scrollRoot, initialState,
        onStateChange(state) { window.__mapState = state; },
        onNavigate(hash, options) {
          window.__mapNavigations.push({ hash, options });
          const saved = window.__mapBinding.captureState();
          window.__mapBinding.destroy();
          host.innerHTML = '<section><h2>Destino de inspeção</h2><button type="button">Voltar ao mapa</button></section>';
          scrollRoot.scrollTop = 0;
          host.querySelector("button").addEventListener("click", () => render(saved));
        }
      });
      window.__mapBinding.restorePosition();
    }
    render();
    await document.fonts.ready;
  }, fixture);
}

const disclosure = (page, id) => page.locator(`details[data-curriculum-expansion="${id}"]`);

test("mapa grande usa disclosure por teclado e retorna de pré-requisito/cobertura com expansão, posição e foco", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mount(page);
  await expect(page.locator(".course-curriculum-map-module > summary:visible")).toHaveCount(12);
  await expect(page.locator(".course-curriculum-map-lesson > summary:visible")).toHaveCount(0);
  const module = disclosure(page, "module:module-2");
  const summary = module.locator(":scope > summary");
  await summary.focus();
  await page.keyboard.press("Space");
  await expect(module).toHaveAttribute("open", "");
  await expect(summary).toBeFocused();
  await expect(page.locator(".course-curriculum-map-lesson > summary:visible")).toHaveCount(4);
  const lesson = disclosure(page, "lesson:lesson-2-1");
  await lesson.locator(":scope > summary").focus();
  await page.keyboard.press("Enter");
  await expect(page.locator(".course-curriculum-map-microsequence:visible")).toHaveCount(5);
  const objective = disclosure(page, "objective:module:module-2");
  await objective.locator(":scope > summary").click();
  await expect(objective.locator("p")).toContainText("Última condição do objetivo.");
  const prerequisite = disclosure(page, "prerequisites:micro-2-1-2");
  await prerequisite.locator(":scope > summary").click();
  const target = page.locator('[data-curriculum-key="dependency:micro-2-1-2:micro-2-1-1"]');
  await target.scrollIntoViewIfNeeded();
  await target.focus();
  const originalTop = await target.evaluate((node) => node.getBoundingClientRect().top);
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "Destino de inspeção" })).toBeVisible();
  const navigation = await page.evaluate(() => window.__mapNavigations[0]);
  expect(navigation.hash).toContain("didacticMicrosequenceId=micro-2-1-1");
  expect(navigation.options.returnTo).toContain("section=planning");
  await page.getByRole("button", { name: "Voltar ao mapa" }).click();
  await expect(target).toBeFocused();
  await expect(objective).toHaveAttribute("open", "");
  await expect(lesson).toHaveAttribute("open", "");
  await expect(disclosure(page, "module:module-1")).not.toHaveAttribute("open", "");
  expect(Math.abs(await target.evaluate((node) => node.getBoundingClientRect().top) - originalTop)).toBeLessThanOrEqual(1);
  await disclosure(page, "coverage").locator(":scope > summary").click();
  await disclosure(page, "coverage:223e4567-e89b-42d3-a456-426614174000").locator(":scope > summary").click();
  await page.getByRole("link", { name: "Primeira comparação de mecanismos" }).click();
  expect(await page.evaluate(() => window.__mapNavigations.at(-1).hash)).toContain("studyUnitId=study-unit-1");
  await page.getByRole("button", { name: "Voltar ao mapa" }).click();
  await expect(page.getByRole("link", { name: "Primeira comparação de mecanismos" })).toBeFocused();
  await page.screenshot({ path: testInfo.outputPath("map-return-390.png") });
});

test("mapa e objetivos longos não transbordam em quatro larguras e dois temas reais", async ({ page }, testInfo) => {
  const fixture = curriculumMapFixture();
  fixture.curriculum.modules[0].title = '<img src=x onerror="window.__injected=true"> 語法 /ɐ/ العربية ' + "Mecanismo".repeat(28);
  const colors = new Map();
  for (const width of [360, 390, 430, 1280]) {
    await page.setViewportSize({ width, height: 844 });
    await mount(page, fixture);
    await disclosure(page, "module:module-1").locator(":scope > summary").click();
    await disclosure(page, "lesson:lesson-1-1").locator(":scope > summary").click();
    await disclosure(page, "objective:module:module-1").locator(":scope > summary").click();
    for (const theme of ["light", "dark"]) {
      await page.evaluate((theme) => { document.documentElement.dataset.colorMode = theme; }, theme);
      const geometry = await page.evaluate(() => {
        const root = document.querySelector("main");
        const map = document.querySelector("[data-course-curriculum-map]");
        const rect = root.getBoundingClientRect();
        return {
          theme: getComputedStyle(document.documentElement).colorScheme,
          color: getComputedStyle(map).color,
          overflow: Math.max(document.documentElement.scrollWidth - document.documentElement.clientWidth,
            root.scrollWidth - root.clientWidth, map.scrollWidth - map.clientWidth),
          summaryOverflow: Math.max(0, ...[...map.querySelectorAll("summary")]
            .filter((node) => node.getClientRects().length)
            .map((node) => Math.max(node.getBoundingClientRect().right - rect.right, rect.left - node.getBoundingClientRect().left)))
        };
      });
      expect(geometry.theme).toBe(theme);
      colors.set(theme, geometry.color);
      expect(geometry.overflow).toBeLessThanOrEqual(1);
      expect(geometry.summaryOverflow).toBeLessThanOrEqual(1);
      expect(await page.evaluate(() => window.__injected || false)).toBe(false);
      await expect(page.locator(".course-curriculum-map img")).toHaveCount(0);
      await page.evaluate(() => { document.querySelector("main").scrollTop = 0; });
      await page.screenshot({ path: testInfo.outputPath(`map-${width}-${theme}.png`) });
    }
  }
  expect(colors.get("light")).not.toBe(colors.get("dark"));
});
