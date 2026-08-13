import { expect, test } from "@playwright/test";

test("curso Teste de Recursos expõe 24 packages em quatro modalidades", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto("/teste-recursos");
  await page.waitForFunction(() => globalThis.__RESOURCE_TEST_COURSE_READY__ === true);

  await expect(page.locator('[data-action="open-course"]')).toBeVisible();
  await page.locator('[data-action="open-course"]').click();
  await expect(page.locator('[data-action="open-module"]')).toHaveCount(24);

  await page.locator('[data-action="open-module"]').first().click();
  await page.locator('[data-action="open-lesson"]').click();
  await page.locator('[data-action="open-microsequence-overview"]').click();
  await expect(page.locator('[data-action="open-microsequence-card"]')).toHaveCount(4);

  await page.locator('[data-action="open-microsequence-card"][data-card-index="0"]').click();
  await expect(page.locator(".runtime-card-title")).toHaveText("Exposição");
  await expect(page.locator(".package-instance[data-package='aralearn.resource.paragraph']"))
    .toHaveCount(1);

  await page.locator('[data-action="next-card"]').click();
  await expect(page.locator(".runtime-card-title")).toHaveText("Lacuna com alternativas");
  await expect(page.locator('[data-action="text-gap-open-choice"]')).toHaveCount(1);
  await page.locator('[data-action="text-gap-open-choice"]').click();
  await page.locator('[data-action="text-gap-set-choice"]').first().click();
  await page.locator('[data-action="next-card"]').click();

  await expect(page.locator(".runtime-card-title")).toHaveText("Lacuna com digitação");
  await expect(page.locator('[data-action="complete-input"]')).toHaveCount(1);
  const typingAnswer = await page.evaluate(async () => {
    const fixture = await fetch("/tests/fixtures/package/resource-test-course.json").then((entry) => entry.json());
    return fixture.courses[0].modules[0].lessons[0].microsequences[0].cards[2]
      .response.data.blanks[0].answer;
  });
  await page.locator('[data-action="complete-input"]').fill(typingAnswer);
  await page.locator('[data-action="next-card"]').click();

  await expect(page.locator(".runtime-card-title")).toHaveText("Blocos de ordenação");
  await expect(page.locator(".package-ordering-response li")).toHaveCount(3);
  const before = await page.locator(".package-ordering-response li").allInnerTexts();
  await page.locator('[data-action="ordering-move"][data-ordering-direction="down"]')
    .first()
    .click();
  const after = await page.locator(".package-ordering-response li").allInnerTexts();
  expect(after).not.toEqual(before);
  await page.locator('[data-action="ordering-validate"]').click();
  await expect(page.locator(".inline-feedback")).toBeVisible();

  expect(await page.evaluate(() => document.documentElement.scrollWidth))
    .toBeLessThanOrEqual(390);
});
