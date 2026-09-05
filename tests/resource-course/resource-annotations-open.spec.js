import { expect, test } from "@playwright/test";
import { buildResourceTestCourse } from "../../scripts/buildResourceTestCourse.mjs";

const course = buildResourceTestCourse();

async function openMatrix(page, theme, matrixCourse = course) {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.addInitScript((value) => localStorage.setItem("aralearn.ui.theme", value), theme);
  await page.route("**/tests/fixtures/package/resource-test-course.json", (route) => route.fulfill({ json: matrixCourse }));
  await page.goto("/tests/gallery/resource-test-matrix.html");
  await page.waitForFunction(() => globalThis.__RESOURCE_TEST_MATRIX_READY__ === true);
  await expect(page.locator("html")).toHaveAttribute("data-color-mode", theme);
  await expect(page.locator("html")).toHaveCSS("color-scheme", theme);
  const textColor = await page.locator("body").evaluate((element) =>
    getComputedStyle(element).color.match(/\d+(?:\.\d+)?/gu).slice(0, 3).map(Number));
  expect(textColor.every((channel) => theme === "dark" ? channel > 180 : channel < 80)).toBe(true);
}

for (const theme of ["light", "dark"]) {
  test(`texto anotado mantém associação e teclado no próprio pacote em ${theme}`, async ({ page }, testInfo) => {
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await openMatrix(page, theme);
    const cards = page.locator('.resource-test-card[data-package="aralearn.resource.annotated_text"]');
    const card = cards.first();
    await expect(cards).toHaveCount(3);
    await page.evaluate(async () => {
      const { RESOURCE_PACKAGE_REGISTRY } = await import("/src/resources/packages/index.js");
      const root = document.querySelector(".resource-test-matrix");
      await RESOURCE_PACKAGE_REGISTRY.hydrate(root);
      await RESOURCE_PACKAGE_REGISTRY.hydrate(root);
    });
    const segments = card.locator(".runtime-annotated-text-segment");
    const notes = card.locator(".runtime-annotated-text-note");
    await segments.first().click();
    await expect(segments.first()).toHaveAttribute("aria-pressed", "true");
    await expect(notes.first()).toHaveAttribute("aria-pressed", "true");
    await expect(notes.nth(1)).toHaveAttribute("aria-pressed", "false");
    await expect(cards.nth(1).locator('[aria-pressed="true"]')).toHaveCount(0);
    await notes.nth(1).focus();
    await page.keyboard.press("Enter");
    await expect(notes.first()).toHaveAttribute("aria-pressed", "false");
    await expect(segments.nth(1)).toHaveAttribute("aria-pressed", "true");
    await page.keyboard.press("Enter");
    await expect(card.locator('[aria-pressed="true"]')).toHaveCount(0);
    await segments.nth(1).click();
    await expect(notes.nth(1)).toBeInViewport();
    expect(await card.evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
    await card.screenshot({ path: testInfo.outputPath(`annotated-text-${theme}.png`) });
    expect(errors).toEqual([]);
  });

  test(`resposta aberta real aceita produção própria na matriz em ${theme}`, async ({ page }, testInfo) => {
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await openMatrix(page, theme);
    const card = page.locator('.resource-test-card[data-package="aralearn.response.open"]');
    await expect(card).toHaveCount(1);
    const input = card.getByRole("textbox", { name: "Explique com suas palavras por que o switch aprende pela origem e consulta o destino." });
    await expect(input).toHaveValue("");
    const response = "O endereço de origem informa por qual porta aquele emissor pode ser alcançado.\n" +
      "O destino determina onde encaminhar o quadro; ele não identifica a porta de entrada.";
    await input.focus();
    await page.keyboard.insertText(response);
    await expect(input).toHaveValue(response);
    await expect(input).toBeFocused();
    await expect(card.getByRole("radio")).toHaveCount(0);
    await expect(card.getByRole("checkbox")).toHaveCount(0);
    await expect(card.locator(".inline-feedback")).toHaveCount(0);
    expect(await card.evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
    await input.evaluate((element) => { element.scrollTop = 0; });
    await card.screenshot({ path: testInfo.outputPath(`open-response-${theme}.png`) });
    expect(errors).toEqual([]);
  });

  test(`condição da reação mantém um único campo na seta em ${theme}`, async ({ page }, testInfo) => {
    const matrixCourse = buildResourceTestCourse();
    const reactionModule = matrixCourse.courses[0].modules.find((moduleValue) =>
      moduleValue.lessons[0].microsequences[0].studyUnits[0].content[0]?.package === "aralearn.resource.reaction");
    const units = reactionModule.lessons[0].microsequences[0].studyUnits;
    units.forEach((unit) => {
      unit.content[0].data.conditions = ["ignição"];
      if (unit.response) {
        unit.title = "Condição por digitação";
        unit.response.data.blanks = [{
          id: "condition", targetInstanceId: unit.content[0].id, targetPath: "conditions[0]",
          responseMode: "text", answer: "ignição"
        }];
      }
    });
    await openMatrix(page, theme, matrixCourse);
    const cards = page.locator('.resource-test-card[data-package="aralearn.resource.reaction"]');
    const theory = cards.first();
    await expect(theory.locator(".package-reaction-arrow-condition")).toHaveText("ignição");
    await expect(theory.locator("math")).toHaveAttribute("aria-label", /Condições: ignição/);
    const practice = cards.nth(1);
    const input = practice.locator(".runtime-text-gap-blank");
    await expect(input).toHaveCount(1);
    await input.focus();
    await page.keyboard.insertText("ignição");
    await expect(input).toHaveText("ignição");
    await expect(input).toBeFocused();
    expect(await practice.evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
    await practice.screenshot({ path: testInfo.outputPath(`reaction-condition-${theme}.png`) });
  });
}
