import { expect, test } from "@playwright/test";

async function openModule(page, moduleIndex, cardIndex = 0) {
  await page.locator('[data-action="open-course"]').click();
  await page.locator('[data-action="open-module"]').nth(moduleIndex).click();
  await page.locator('[data-action="open-lesson"]').click();
  await page.locator('[data-action="open-microsequence-overview"]').click();
  await page.locator(`[data-action="open-microsequence-card"][data-card-index="${cardIndex}"]`).click();
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto("/teste-recursos");
  await page.waitForFunction(() => globalThis.__RESOURCE_TEST_COURSE_READY__ === true);
  await page.evaluate(() => localStorage.removeItem("aralearn.resource-test.progress.v3"));
  await page.reload();
  await page.waitForFunction(() => globalThis.__RESOURCE_TEST_COURSE_READY__ === true);
});

test("curso separa 24 representações dos quatro packages de resposta", async ({ page }) => {
  await expect(page.locator('[data-action="open-course"]')).toBeVisible();
  await page.locator('[data-action="open-course"]').click();
  await expect(page.locator('[data-action="open-module"]')).toHaveCount(28);
  await expect(page.locator('[data-action="open-module"]').nth(24)).toHaveAttribute("data-module-key", "response-choice-test-module");
  await expect(page.locator('[data-action="open-module"]').nth(25)).toHaveAttribute("data-module-key", "response-gap-test-module");
  await expect(page.locator('[data-action="open-module"]').nth(26)).toHaveAttribute("data-module-key", "response-ordering-test-module");
  await expect(page.locator('[data-action="open-module"]').nth(27)).toHaveAttribute("data-module-key", "response-matching-test-module");
});

test("paragraph usa alternativas sob demanda e segundo toque esvazia a lacuna", async ({ page }) => {
  await openModule(page, 0);
  await expect(page.locator(".runtime-card-title")).toHaveText("Exposição");
  await page.locator('[data-action="next-card"]').click();
  await expect(page.locator(".runtime-card-title")).toHaveText("Lacuna com alternativas");
  const blank = page.locator('[data-action="text-gap-open-choice"]');
  await expect(page.locator('[data-action="text-gap-set-choice"]')).toHaveCount(0);
  await blank.click();
  await expect(page.locator('[data-action="text-gap-set-choice"]')).toHaveCount(3);
  await page.locator('[data-action="text-gap-set-choice"]').first().click();
  await expect(page.locator('[data-action="text-gap-set-choice"]')).toHaveCount(0);
  await expect(blank).toHaveAttribute("data-empty", "false");
  await blank.click();
  await expect(blank).toHaveAttribute("data-empty", "true");
  await expect(page.locator('[data-action="text-gap-set-choice"]')).toHaveCount(0);
});

test("cada lacuna abre somente as próprias alternativas", async ({ page }) => {
  await openModule(page, 25);
  const blanks = page.locator('[data-action="text-gap-open-choice"]');
  await expect(blanks).toHaveCount(2);
  await expect(page.locator('[data-action="text-gap-set-choice"]')).toHaveCount(0);

  await blanks.nth(0).click();
  await expect(page.locator('[data-action="text-gap-set-choice"]')).toHaveText([
    "cliente", "servidor", "roteador"
  ]);
  await page.locator('[data-action="text-gap-set-choice"][data-text-gap-value="cliente"]').click();

  await blanks.nth(1).click();
  await expect(page.locator('[data-action="text-gap-set-choice"]')).toHaveText([
    "resposta", "requisição", "conexão"
  ]);
  await page.locator('[data-action="text-gap-set-choice"][data-text-gap-value="resposta"]').click();
  await blanks.nth(1).click();
  await expect(blanks.nth(1)).toHaveAttribute("data-empty", "true");
});

test("code recebe a lacuna no editor e não no enunciado", async ({ page }) => {
  await openModule(page, 1, 1);
  await expect(page.locator(".runtime-code-block pre [data-action='text-gap-open-choice']"))
    .toHaveCount(1);
  await expect(page.locator(".runtime-code-block > p [data-action='text-gap-open-choice']"))
    .toHaveCount(0);
});

test("table recebe alternativa e digitação dentro de células", async ({ page }) => {
  await openModule(page, 2, 1);
  await expect(page.locator(".runtime-table tbody [data-action='text-gap-open-choice']"))
    .toHaveCount(1);
  await expect(page.locator(".runtime-table-block > p [data-action='text-gap-open-choice']"))
    .toHaveCount(0);
  await page.locator(".runtime-table tbody [data-action='text-gap-open-choice']").click();
  await page.locator('[data-action="text-gap-set-choice"]').first().click();
  await page.locator('[data-action="next-card"]').click();
  await page.locator('[data-action="next-card"]').click();
  await expect(page.locator(".runtime-table tbody [data-action='complete-input']"))
    .toHaveCount(1);
});

test("texto anotado liga trecho e nota nos dois sentidos sem ids internos", async ({ page }) => {
  await openModule(page, 4);
  await expect(page.locator(".runtime-annotated-text-segment")).toHaveCount(2);
  await expect(page.locator(".runtime-annotated-text-notes")).not.toContainText("Trechos:");
  await page.locator(".runtime-annotated-text-segment").first().click();
  await expect(page.locator(".runtime-annotated-text-segment").first()).toHaveClass(/is-active/u);
  await expect(page.locator(".runtime-annotated-text-note").first()).toHaveClass(/is-active/u);
  await page.locator(".runtime-annotated-text-note").last().click();
  await expect(page.locator(".runtime-annotated-text-segment").last()).toHaveClass(/is-active/u);
});

test("glosa interlinear preserva alinhamento, tradução e legenda", async ({ page }) => {
  await openModule(page, 5);
  await expect(page.locator(".runtime-interlinear-unit")).toHaveCount(6);
  await expect(page.locator(".runtime-interlinear-form").nth(1)).toHaveText("abur-u-n");
  await expect(page.locator(".runtime-interlinear-unit-gloss").nth(1)).toHaveText("they-OBL-GEN");
  await expect(page.locator(".runtime-interlinear-form").last()).toHaveText("amuq’-da-č.");
  await expect(page.locator(".runtime-interlinear-unit-gloss").last()).toHaveText("stay-FUT-NEG");
  await expect(page.locator(".runtime-interlinear-translation")).toContainText("fazenda deles");
  await expect(page.locator(".runtime-interlinear-abbreviations")).toContainText("OBL");
  await expect(page.locator(".runtime-interlinear-abbreviations")).toContainText("oblíquo");
});

test("matrix usa MathML com peso normal e lacuna na entrada", async ({ page }) => {
  await openModule(page, 7);
  await expect(page.locator(".runtime-matrix-item math.runtime-matrix-values mtable")).toHaveCount(1);
  await expect(page.locator(".runtime-matrix-item math.runtime-matrix-values mtr")).toHaveCount(3);
  await expect(page.locator(".runtime-matrix-name")).toHaveText("I");
  await expect(page.locator(".runtime-matrix-name")).toHaveCSS("font-weight", "400");
  const dimensions = await page.locator(".runtime-matrix-item").evaluate((matrix) => {
    const gridHeight = matrix.querySelector("mtable").getBoundingClientRect().height;
    return {
      gridHeight,
      delimiterHeights: [...matrix.querySelectorAll(".runtime-matrix-delimiter")]
        .map((delimiter) => delimiter.getBoundingClientRect().height)
    };
  });
  expect(dimensions.delimiterHeights).toHaveLength(2);
  dimensions.delimiterHeights.forEach((height) => expect(height).toBeGreaterThanOrEqual(dimensions.gridHeight * 0.85));
  await page.locator('[data-action="next-card"]').click();
  await expect(page.locator(".runtime-matrix-item mtd [data-action='text-gap-open-choice']")).toHaveCount(1);
});

test("reaction materializa escolha e digitação dentro da equação química", async ({ page }) => {
  await openModule(page, 8, 1);
  await expect(page.locator(".inline-feedback")).toHaveCount(0);
  const coefficientGap = page.locator("math.package-reaction-equation [data-action='text-gap-open-choice']");
  await expect(coefficientGap).toHaveCount(1);
  await coefficientGap.click();
  await page.locator('[data-action="text-gap-set-choice"]').first().click();
  await page.locator('[data-action="next-card"]').click();
  await expect(page.locator("math.package-reaction-equation [data-action='complete-input']")).toHaveCount(1);
  await expect(page.locator(".inline-feedback")).toHaveCount(0);
});

test("ordenação é resposta independente e o Play é o único controle de confirmação", async ({ page }) => {
  await openModule(page, 26);
  await expect(page.locator(".package-ordering-response li")).toHaveCount(3);
  await expect(page.getByRole("button", { name: "Conferir" })).toHaveCount(0);
  await page.locator('[data-action="next-card"]').click();
  await expect(page.locator(".inline-feedback.err")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});
