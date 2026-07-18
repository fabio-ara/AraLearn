import { expect, test } from "@playwright/test";

test("o runtime local serve módulos JavaScript com o tipo correto", async ({ request }) => {
  const response = await request.get("/node_modules/pdfjs-dist/build/pdf.mjs");

  expect(response.ok()).toBe(true);
  expect(response.headers()["content-type"]).toContain("text/javascript");
});

test("o artefato publicado abre somente os três cursos do manifesto", async ({ page }) => {
  await page.goto("/");
  const courseButtons = page.locator('[data-action="open-course"]');
  await expect(courseButtons).toHaveCount(3);
  const courseKeys = await courseButtons.evaluateAll((buttons) =>
    buttons.map((button) => button.getAttribute("data-course-key"))
  );
  expect(courseKeys).toEqual([
    "course-microsoft-azure-ai-fundamentals-ai900",
    "course-dataprev-2026-analista-processamento-seguranca-informacao",
    "course-fundamentos-ia-analise-dados"
  ]);
});

test("o feedback do card de criptografia avança uma vez e não contamina o próximo card", async ({ page }) => {
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.goto("/");
  await page.locator('[data-action="open-course"][data-course-key="course-dataprev-2026-analista-processamento-seguranca-informacao"]').tap();
  await page.locator('[data-action="open-module"][data-module-key="module-seguranca-informacao"]').tap();
  await page.locator('[data-action="open-lesson"][data-lesson-key="lesson-seguranca-informacao-05"]').tap();
  await page.locator('[data-action="play-microsequence"][data-microsequence-key="dataprev-si-l05-ms01"]').tap();

  await expect(page.locator(".runtime-card-title")).toHaveText("Vocabulário mínimo da criptografia");
  await page.locator('[data-action="next-card"]').tap();
  await expect(page.locator(".study-continue-popup")).toBeVisible();

  await page.locator('[data-action="continue-popup-next"]').tap();

  await expect(page.locator(".runtime-card-title")).toHaveText("Mecanismo e objetivo de segurança");
  await page.waitForTimeout(400);
  await expect(page.locator(".study-continue-popup")).toHaveCount(0);

  await page.locator('[data-action="next-card"]').tap();
  await expect(page.locator(".study-continue-popup")).toBeVisible();
  await page.locator('[data-action="continue-popup-next"]').tap();

  await expect(page.locator(".runtime-card-title")).toHaveText("Complete o objetivo principal");
  await page.waitForTimeout(400);
  await expect(page.locator(".study-continue-popup")).toHaveCount(0);

  await page.locator('[data-action="text-gap-open-choice"]').tap();
  await page.locator('[data-action="text-gap-set-choice"][data-text-gap-value="confidencialidade"]').tap();
  await page.locator('[data-action="next-card"]').tap();
  await expect(page.locator(".inline-feedback.ok")).toBeVisible();
  await expect(page.locator(".study-continue-popup")).toBeVisible();
  await page.locator('[data-action="continue-popup-next"]').tap();

  await expect(page.locator(".runtime-card-title")).toHaveText("Transformação sem sigilo");
  await page.waitForTimeout(400);
  await expect(page.locator(".study-continue-popup")).toHaveCount(0);
  expect(pageErrors).toEqual([]);
});
