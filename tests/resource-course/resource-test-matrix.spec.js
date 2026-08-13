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
      await expect(page.locator('.resource-test-card[data-package="aralearn.resource.relation_map"] .package-relation-map-set'))
        .toHaveCount(6);
      await expect(page.locator('.resource-test-card[data-package="aralearn.resource.relation_map"] .package-relation-map-edge text'))
        .toHaveCount(0);
      await expect(page.locator('.resource-test-card[data-package="aralearn.resource.set_diagram"]'))
        .toHaveCount(3);
      await expect(page.locator('.resource-test-card[data-package="aralearn.resource.set_diagram"] .package-set-shape'))
        .toHaveCount(9);
      await expect(page.locator('.resource-test-card[data-package="aralearn.resource.set_diagram"] .package-set-region-marker'))
        .toHaveCount(12);
      const audit = await page.evaluate(() => ({
        documentOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        cards: [...document.querySelectorAll(".resource-test-card")]
          .filter((element) => element.scrollWidth > element.clientWidth + 1)
          .map((element) => `${element.dataset.package}:${element.dataset.modality}`),
        setDiagramCollisions: [...document.querySelectorAll('.resource-test-card[data-package="aralearn.resource.set_diagram"]')]
          .flatMap((card) => {
            const labels = [...card.querySelectorAll(".package-set-name, .package-set-region-marker")];
            return labels.flatMap((left, leftIndex) => labels.slice(leftIndex + 1).flatMap((right) => {
              const a = left.getBoundingClientRect();
              const b = right.getBoundingClientRect();
              const overlaps = a.left < b.right - 1 && a.right > b.left + 1 && a.top < b.bottom - 1 && a.bottom > b.top + 1;
              return overlaps ? [`${left.textContent.trim()}:${right.textContent.trim()}`] : [];
            }));
          })
      }));
      expect(audit.documentOverflow).toBeLessThanOrEqual(1);
      expect(audit.cards).toEqual([]);
      expect(audit.setDiagramCollisions).toEqual([]);
      expect(pageErrors).toEqual([]);
    });
  }
}

test("lacunas preenchidas permanecem visíveis dentro dos objetos acadêmicos", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 900 });
  await page.addInitScript(() => localStorage.setItem("aralearn.ui.theme", "dark"));
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("/tests/gallery/resource-test-matrix.html?state=filled");
  await page.waitForFunction(() => globalThis.__RESOURCE_TEST_MATRIX_READY__ === true);

  const gapFields = page.locator(".runtime-text-gap-blank");
  expect(await gapFields.count()).toBeGreaterThan(20);
  await expect(page.locator('.runtime-text-gap-blank[data-empty="true"]')).toHaveCount(0);
  const audit = await page.evaluate(() => ({
    documentOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    overflowingCards: [...document.querySelectorAll(".resource-test-card")]
      .filter((element) => element.scrollWidth > element.clientWidth + 1)
      .map((element) => `${element.dataset.package}:${element.dataset.modality}`),
    invisibleGaps: [...document.querySelectorAll(".runtime-text-gap-blank")]
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        return rect.width < 2 || rect.height < 2;
      }).length,
    overflowingGraphvizLabels: [...document.querySelectorAll("foreignObject")]
      .filter((foreignObject) => foreignObject.querySelector(".runtime-text-gap-blank"))
      .flatMap((foreignObject) => {
        const content = foreignObject.firstElementChild;
        if (!content || (content.scrollWidth <= content.clientWidth + 1 && content.scrollHeight <= content.clientHeight + 1)) return [];
        const card = foreignObject.closest(".resource-test-card");
        return [`${card?.dataset.package}:${card?.dataset.modality}`];
      })
  }));
  expect(audit.documentOverflow).toBeLessThanOrEqual(1);
  expect(audit.overflowingCards).toEqual([]);
  expect(audit.invisibleGaps).toBe(0);
  expect(audit.overflowingGraphvizLabels).toEqual([]);
  expect(pageErrors).toEqual([]);
});
