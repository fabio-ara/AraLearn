import { expect, test } from "@playwright/test";

const widths = [360, 390, 412];
const themes = ["light", "dark"];

for (const theme of themes) {
  for (const width of widths) {
    test(`todos os cards declarados não criam overflow em ${width}px no modo ${theme}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.addInitScript((selectedTheme) => {
        localStorage.setItem("aralearn.ui.theme", selectedTheme);
      }, theme);
      const pageErrors = [];
      page.on("pageerror", (error) => pageErrors.push(error.message));
      await page.goto("/tests/gallery/resource-test-matrix.html");
      await page.waitForFunction(() => globalThis.__RESOURCE_TEST_MATRIX_READY__ === true);

      expect(await page.locator(".resource-test-card").count()).toBeGreaterThan(0);
      await expect(page.locator('.resource-test-card[data-package="aralearn.resource.relation_map"]'))
        .toHaveCount(3);
      await expect(page.locator(".package-relation-pairs")).toHaveCount(0);
      const audit = await page.evaluate(() => ({
        documentOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        cards: [...document.querySelectorAll(".resource-test-card")]
          .filter((element) => element.scrollWidth > element.clientWidth + 1)
          .map((element) => `${element.dataset.package}:${element.dataset.modality}`)
      }));
      expect(audit.documentOverflow).toBeLessThanOrEqual(1);
      expect(audit.cards).toEqual([]);
      expect(pageErrors).toEqual([]);
    });
  }
}
