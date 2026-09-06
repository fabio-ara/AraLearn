import { expect, test } from "@playwright/test";
import { largeRichStudyUnit } from "../fixtures/package/rich-paragraph-limits.js";

async function mount(page) {
  await page.goto("/");
  await page.setContent('<!doctype html><html lang="pt-BR"><head><link rel="stylesheet" href="/styles-tokens.css"><link rel="stylesheet" href="/styles-shell-baseline.css"><link rel="stylesheet" href="/styles.css"></head><body><main style="max-width:900px;margin:12px auto;padding:12px;box-sizing:border-box;width:100%"><div class="runtime-card-sheet"><div id="fixture" class="card-sheet-content" style="height:70vh;overflow:auto"></div></div></main></body></html>');
  await page.evaluate(async (unit) => {
    const { renderPackageStudyUnitBlocks } = await import("/src/render/renderPackageStudyUnit.js");
    const { RESOURCE_PACKAGE_REGISTRY } = await import("/src/resources/packages/index.js");
    document.querySelector("#fixture").innerHTML = renderPackageStudyUnitBlocks(unit);
    await document.fonts.ready;
    await RESOURCE_PACKAGE_REGISTRY.hydrate(document);
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  }, largeRichStudyUnit());
}

test("AST512 inline/bloco e cercas altas conservam rolagem, leitura e alcance por teclado", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mount(page);
  for (const width of [360, 390, 430, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    for (const theme of ["light", "dark"]) {
      await page.evaluate((theme) => { document.documentElement.dataset.colorMode = theme; }, theme);
      expect(await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme)).toBe(theme);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
      const sizes = await page.locator('[data-package-instance-id="wide-inline"] .package-rich-math, [data-package-instance-id="wide-block"] .package-rich-math').evaluateAll((nodes) => nodes.map((node) => ({ overflow: node.scrollWidth - node.clientWidth, width: node.clientWidth, label: node.querySelector("math").getAttribute("aria-label") })));
      expect(sizes).toHaveLength(2);
      for (const size of sizes) {
        expect(size.overflow).toBeGreaterThan(1000);
        expect(size.width).toBeGreaterThan(100);
        expect(size.label).toContain("512 nós");
      }
      const ends = await page.locator('[data-package-instance-id="wide-inline"] .package-rich-math, [data-package-instance-id="wide-block"] .package-rich-math').evaluateAll((nodes) => nodes.map((node) => {
        node.scrollLeft = 0;
        const frame = node.getBoundingClientRect();
        const leaves = node.querySelectorAll("mi, mo");
        const first = leaves[0].getBoundingClientRect();
        node.scrollLeft = node.scrollWidth;
        const last = leaves[leaves.length - 1].getBoundingClientRect();
        node.scrollLeft = 0;
        return { first: first.left - frame.left, last: last.right - frame.right };
      }));
      for (const end of ends) { expect(end.first).toBeGreaterThanOrEqual(-1); expect(end.last).toBeLessThanOrEqual(1); }
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  const wide = page.locator('[data-package-instance-id="wide-block"] .package-rich-math');
  await wide.scrollIntoViewIfNeeded();
  await page.keyboard.press("Tab");
  const reachable = await page.evaluate(() => {
    const node = document.activeElement;
    return node.classList.contains("package-rich-math") || node.classList.contains("card-sheet-content");
  });
  expect(reachable).toBe(true);
  await wide.focus();
  await page.keyboard.press("ArrowRight");
  await expect.poll(() => wide.evaluate((node) => node.scrollLeft)).toBeGreaterThan(0);
  const beforeTouch = await wide.evaluate((node) => node.scrollLeft);
  const frame = await wide.boundingBox();
  const session = await page.context().newCDPSession(page);
  await session.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: frame.x + frame.width - 20, y: frame.y + frame.height / 2 }] });
  await session.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: frame.x + 20, y: frame.y + frame.height / 2 }] });
  await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await session.detach();
  await expect.poll(() => wide.evaluate((node) => node.scrollLeft)).toBeGreaterThan(beforeTouch);
  const tall = page.locator('[data-package-instance-id="tall-fences"] .package-rich-math');
  await tall.scrollIntoViewIfNeeded();
  const fences = await tall.evaluate((figure) => {
    const outer = figure.getBoundingClientRect();
    return [...figure.querySelectorAll(":scope > .package-formula-fence")].map((fence) => {
      const rect = fence.getBoundingClientRect();
      return { height: rect.height, top: rect.top - outer.top, bottom: rect.bottom - outer.bottom };
    });
  });
  expect(fences).toHaveLength(2);
  for (const fence of fences) { expect(fence.height).toBeGreaterThan(100); expect(fence.top).toBeGreaterThanOrEqual(-1); expect(fence.bottom).toBeLessThanOrEqual(1); }
  await page.screenshot({ path: testInfo.outputPath("rich-tall-390.png") });
  const last = page.locator('[data-package-instance-id="many-blocks"] math').last();
  await last.scrollIntoViewIfNeeded();
  await expect(last).toBeVisible();
  await expect(last).toHaveAttribute("aria-label", "Igualdade sintética 127.");
});
