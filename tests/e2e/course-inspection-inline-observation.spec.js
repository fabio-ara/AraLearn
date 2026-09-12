import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { UX_UI_328_COURSE_ID } from "../fixtures/uxUi328Fixture.js";

const unit = (page, ordinal) => page.locator(`[data-inspection-study-unit="ux328-unit-${String(ordinal).padStart(2, "0")}"]`);

test.beforeEach(async ({ page }) => {
  for (const relative of ["fixtures/uxUi328.html", "fixtures/uxUi328Harness.js", "fixtures/uxUi328Fixture.js",
    "fixtures/courseCurriculumMapFixture.js", "helpers/courseDesignFixture.js"]) {
    const body = await readFile(new URL(`../${relative}`, import.meta.url), "utf8");
    await page.route(url => url.pathname === `/tests/${relative}`, route => route.fulfill({ body,
      contentType: relative.endsWith(".html") ? "text/html; charset=utf-8" : "text/javascript; charset=utf-8" }));
  }
});

for (const width of [360, 1280]) test(`observação inline em uma ou duas unidades conserva alvos e leitura em ${width}px`, async ({ page }, info) => {
  await page.setViewportSize({ width, height: 844 });
  const errors = []; page.on("pageerror", error => errors.push(error.message));
  await page.goto(`/tests/fixtures/uxUi328.html#/authoring/courses/${UX_UI_328_COURSE_ID}?section=content&studyUnitId=ux328-unit-01`);
  await expect(page.locator("html")).toHaveAttribute("data-fixture-ready", "true");
  await expect(page.locator(".course-authoring-surface")).toHaveAttribute("aria-busy", "false");
  const before = await page.evaluate(() => structuredClone(globalThis.uxUi328.units.map(item => item.studyUnit)));
  await unit(page, 1).getByRole("button", { name: "Mostrar várias unidades", exact: true }).click();
  await expect(page.locator("[data-inspection-study-unit]")).toHaveCount(12);
  const select = ordinal => unit(page, ordinal).locator('[data-inspection-selection-action="toggle-unit"]');
  const dock = page.locator("[data-inspection-selection-bar]");
  const field = dock.getByRole("textbox", { name: "Observação", exact: true });
  await select(1).click();
  await expect(field).toBeVisible();
  await expect(dock).toContainText("1 unidade selecionada");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await select(2).click();
  await expect(dock).toContainText("2 unidades selecionadas");
  await expect(field).toHaveValue("");
  const targets = dock.locator(".course-inspection-selection-targets");
  await targets.locator(":scope > summary").click();
  await expect(targets.locator("li")).toHaveText(before.slice(0, 2).map(item => item.title));
  await targets.locator(":scope > summary").click();
  const text = `Observação sintética em dois alvos — ${width}px.`;
  await field.fill(text);
  const bounds = await dock.boundingBox();
  expect(bounds.width).toBe(Math.min(width - 24, 406));
  expect(Math.abs(bounds.x + bounds.width / 2 - width / 2)).toBeLessThanOrEqual(1);
  for (const action of await dock.locator("button, .study-observation-category-disclosure > summary").all()) {
    const box = await action.boundingBox();
    expect(box.width).toBe(44); expect(box.height).toBe(44);
    expect(box.x).toBeGreaterThanOrEqual(bounds.x);
    expect(box.x + box.width).toBeLessThanOrEqual(bounds.x + bounds.width);
  }
  await page.locator("#course-authoring-root").evaluate(node => { node.scrollTop = node.scrollHeight; });
  await expect.poll(() => page.locator("#course-authoring-root").evaluate(node => node.scrollTop)).toBeGreaterThan(400);
  await expect(field).toBeInViewport();
  await expect(dock.getByRole("button", { name: "Enviar observação", exact: true })).toBeInViewport();
  const scrolled = await dock.boundingBox();
  expect(Math.abs(scrolled.y - bounds.y)).toBeLessThanOrEqual(1);
  await page.screenshot({ path: info.outputPath(`inline-observation-${width}.png`) });
  await dock.getByRole("button", { name: "Enviar observação", exact: true }).click();
  await expect.poll(() => page.evaluate(value => globalThis.uxUi328.annotations.filter(item => item.rawText === value).length, text)).toBe(2);
  const result = await page.evaluate(value => ({
    entries: globalThis.uxUi328.annotations.filter(item => item.rawText === value).map(item => ({ id: item.annotationId, target: item.target.id })),
    writes: globalThis.uxUi328.requests.filter(item => item.kind === "annotation-mutation").map(item => item.input),
    units: globalThis.uxUi328.units.map(item => item.studyUnit)
  }), text);
  expect(result.entries.map(item => item.target)).toEqual(["ux328-unit-01", "ux328-unit-02"]);
  expect(new Set(result.entries.map(item => item.id)).size).toBe(2);
  expect(result.writes).toHaveLength(2);
  expect(new Set(result.writes.map(item => item.requestId)).size).toBe(2);
  expect(result.writes.every(item => item.command.type === "create_anchored_annotation")).toBe(true);
  expect(result.units).toEqual(before);
  await expect(field).toHaveValue("");
  await dock.getByRole("button", { name: "Limpar seleção", exact: true }).click();
  await expect(page.locator("[data-inspection-study-unit]")).toHaveCount(12);
  await expect(dock).toContainText("Selecione uma ou mais unidades para comentar");
  await expect(dock.getByRole("textbox")).toHaveCount(0);
  await expect(select(1)).toHaveAttribute("aria-checked", "false");
  await expect(select(2)).toHaveAttribute("aria-checked", "false");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(errors).toEqual([]);
});
