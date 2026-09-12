import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

for (const width of [360, 1280]) test(`lista de explicações alinha os acessos e conserva títulos longos em ${width}px`, async ({ page }, info) => {
  const errors = []; page.on("pageerror", error => errors.push(error.message));
  await page.setViewportSize({ width, height: 850 });
  for (const [url, path, contentType] of [
    ["**/tests/gallery/course-microsequence-review.html", "../gallery/course-microsequence-review.html", "text/html"],
    ["**/tests/support/courseMicrosequenceReviewFixture.js", "../support/courseMicrosequenceReviewFixture.js", "text/javascript"],
    ["**/tests/helpers/courseMicrosequenceReviewFixture.js", "../helpers/courseMicrosequenceReviewFixture.js", "text/javascript"],
    ["**/tests/helpers/courseAuthoringAnalyticsFixture.js", "../helpers/courseAuthoringAnalyticsFixture.js", "text/javascript"]
  ]) await page.route(url, route => route.fulfill({ status: 200, contentType, body: readFileSync(new URL(path, import.meta.url), "utf8") }));
  await page.goto("/tests/gallery/course-microsequence-review.html");
  await expect.poll(() => page.evaluate(() => globalThis.__REVIEW_FIXTURE_READY__)).toBe(true);
  await page.evaluate(async () => {
    const { controller, probe } = globalThis.__reviewFixture;
    probe.withUnits = false;
    const exported = await controller.exportCourseAuthoring();
    const document = exported.artifact.document;
    const course = document.courses[0];
    const lesson = course.modules[0].lessons[0];
    const original = lesson.microsequences[0];
    lesson.microsequences = Array.from({ length: 36 }, (_, index) => ({
      ...structuredClone(original),
      id: index === 0 ? original.id : `micro-list-${index + 1}`,
      title: index === 0 ? original.title : index % 2
        ? "Host, hipervisor e máquina virtual"
        : "Memória, armazenamento e a relação entre processos em um sistema operacional sem interface gráfica"
    }));
    controller.loadCourseDocument = async () => ({ document });
    window.document.querySelector("#app-root").innerHTML =
      '<div class="app-shell"><section class="screen"><div class="screen-content"><div id="inspection-root"></div></div></section></div>';
    const { createCourseInspectionSequence } = await import("/src/ui/CourseInspectionSequence.js");
    const inspection = createCourseInspectionSequence({ root: window.document.querySelector("#inspection-root"), controller,
      course: { courseId: course.id, revision: probe.revision, ownership: "owned", canEdit: true } });
    await inspection.open();
  });
  const list = page.getByRole("list", { name: "Explicações das microssequências", exact: true });
  await expect(list.getByRole("listitem")).toHaveCount(36);
  const geometry = await list.evaluate(node => ({
    width: node.getBoundingClientRect().width,
    rows: [...node.children].map(row => {
      const rect = row.getBoundingClientRect();
      const button = row.querySelector("button").getBoundingClientRect();
      const title = row.querySelector("span").getBoundingClientRect();
      return { x: button.x, width: button.width, height: button.height, right: button.right,
        rowRight: rect.right, titleRight: title.right, titleHeight: title.height, rowHeight: rect.height };
    })
  }));
  expect(geometry.width).toBeLessThanOrEqual(430);
  for (const row of geometry.rows) {
    expect(Math.abs(row.x - geometry.rows[0].x)).toBeLessThan(1);
    expect(row.width).toBeGreaterThanOrEqual(44); expect(row.height).toBeGreaterThanOrEqual(44);
    expect(row.right).toBeLessThanOrEqual(row.rowRight + 1);
    expect(row.titleRight).toBeLessThan(row.x);
    expect(row.titleHeight).toBeLessThanOrEqual(row.rowHeight);
  }
  expect(geometry.rows[2].titleHeight).toBeGreaterThan(geometry.rows[0].titleHeight);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath(`explanation-list-${width}.png`) });
  const last = list.getByRole("listitem").last();
  await last.scrollIntoViewIfNeeded();
  const lastBox = await last.boundingBox();
  expect(lastBox.y).toBeGreaterThanOrEqual(0);
  expect(lastBox.y + lastBox.height).toBeLessThanOrEqual(851);
  const trigger = list.getByRole("button", { name: "Explicação de Interfaces", exact: true });
  await trigger.scrollIntoViewIfNeeded();
  await trigger.focus(); await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog", { name: "Explicação e revisão do conteúdo" })).toContainText("Um socket é a interface local");
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
  expect(errors).toEqual([]);
});
