import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

// Reprodução focal (mantida): uma atualização assíncrona da explicação precisa preservar a
// leitura da MESMA folha. Em Chromium local real, a folha é aberta pelo botão, o conteúdo vem
// da fixture e o refresh é disparado pelo render real do aplicativo (beforeRender/afterRender).

async function mount(page, query = "") {
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  for (const [url, file, contentType] of [
    ["**/tests/gallery/study-explanation.html*", "../gallery/study-explanation.html", "text/html"],
    ["**/tests/support/studyExplanationFixture.js", "../support/studyExplanationFixture.js", "text/javascript"],
    ["**/tests/fixtures/package/project-minimal.json", "../fixtures/package/project-minimal.json", "application/json"]
  ]) await page.route(url, route => route.fulfill({ status: 200, contentType,
    body: readFileSync(new URL(file, import.meta.url), "utf8") }));
  await page.goto(`/tests/gallery/study-explanation.html${query}`);
  await expect.poll(() => page.evaluate(() => globalThis.__EXPLANATION_FIXTURE_READY__ === true)).toBe(true);
  return errors;
}

test("atualização assíncrona preserva rolagem, quadro horizontal e foco em 390px", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 850 });
  const errors = await mount(page, "?wide=1");
  await page.getByRole("button", { name: "Explicação", exact: true }).click();
  const overlay = page.getByRole("dialog", { name: "Explicação", exact: true });
  await expect(overlay).toBeVisible();
  const body = page.locator(".study-explanation-body");
  const frame = body.locator("[data-resource-scroll-frame]").first();
  await expect(frame).toBeVisible();
  // Garantia da prova horizontal: o quadro desta leitura rola de fato em 390 px.
  const overflow = await frame.evaluate(node => node.scrollWidth - node.clientWidth);
  expect(overflow).toBeGreaterThan(0);
  await body.evaluate(node => { node.scrollTop = 240; });
  await frame.evaluate(node => { node.scrollLeft = Math.min(24, node.scrollWidth - node.clientWidth); });
  await body.focus();
  const beforeVertical = await body.evaluate(node => node.scrollTop);
  const beforeHorizontal = await frame.evaluate(node => node.scrollLeft);
  expect(beforeVertical).toBe(240);
  expect(beforeHorizontal).toBeGreaterThan(0);
  expect(await page.evaluate(() => document.activeElement?.className)).toContain("study-explanation-body");

  // Atualização legítima: a explicação passa para a revisão 2 e o texto novo entra no conteúdo.
  await page.evaluate(() => {
    globalThis.__explanationFixture.probe.courseRevision = 2;
    globalThis.__explanationFixture.app.refreshRuntimeStatus();
  });
  await expect(overlay).toBeVisible();
  await expect(body).toContainText("Revisão 2 da explicação");
  expect(await frame.evaluate(node => node.scrollWidth - node.clientWidth)).toBeGreaterThan(0);
  const afterVertical = await body.evaluate(node => node.scrollTop);
  const afterHorizontal = await frame.evaluate(node => node.scrollLeft);
  await page.screenshot({ path: testInfo.outputPath("explanation-reading-390.png"), fullPage: true });
  expect(afterVertical).toBe(beforeVertical);
  expect(afterHorizontal).toBe(beforeHorizontal);
  expect(await page.evaluate(() => document.activeElement?.className)).toContain("study-explanation-body");
  expect(errors).toEqual([]);
});

test("mudança de contexto fecha a folha da explicação", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 850 });
  const errors = await mount(page, "?wide=1");
  await page.getByRole("button", { name: "Explicação", exact: true }).click();
  const overlay = page.getByRole("dialog", { name: "Explicação", exact: true });
  await expect(overlay).toBeVisible();
  await page.evaluate(() => globalThis.__explanationFixture.openUnit("practice"));
  await expect(overlay).toHaveCount(0);
  expect(errors).toEqual([]);
});

