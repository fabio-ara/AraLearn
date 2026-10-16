import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

// Reprodução focal: uma atualização assíncrona da explicação (nova revisão) precisa
// preservar a leitura da MESMA folha — rolagem vertical do corpo e horizontal da tabela —
// em vez de voltar ao topo. O caminho é o render real do aplicativo: beforeRender remove a
// folha, afterRender reabre quando a assinatura muda. Nada aqui simula o scroll: o DOM é o
// real, em Chromium local, na largura de 390 px.

async function mount(page) {
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  for (const [url, file, contentType] of [
    ["**/tests/gallery/study-explanation.html*", "../gallery/study-explanation.html", "text/html"],
    ["**/tests/support/studyExplanationFixture.js", "../support/studyExplanationFixture.js", "text/javascript"],
    ["**/tests/fixtures/package/project-minimal.json", "../fixtures/package/project-minimal.json", "application/json"]
  ]) await page.route(url, route => route.fulfill({ status: 200, contentType,
    body: readFileSync(new URL(file, import.meta.url), "utf8") }));
  await page.goto("/tests/gallery/study-explanation.html");
  await expect.poll(() => page.evaluate(() => globalThis.__EXPLANATION_FIXTURE_READY__ === true)).toBe(true);
  return errors;
}

test("atualização assíncrona da explicação preserva a rolagem da leitura em 390px", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 850 });
  const errors = await mount(page);
  await page.getByRole("button", { name: "Explicação", exact: true }).click();
  const overlay = page.getByRole("dialog", { name: "Explicação", exact: true });
  await expect(overlay).toBeVisible();
  await expect(page.locator(".study-explanation-body table")).toBeVisible();
  const body = page.locator(".study-explanation-body");
  await body.evaluate(node => { node.scrollTop = 240; });
  const frame = page.locator(".study-explanation-body [data-resource-scroll-frame]").first();
  const hasFrame = await frame.count() > 0;
  if (hasFrame) await frame.evaluate(node => { node.scrollLeft = 24; });
  const beforeVertical = await body.evaluate(node => node.scrollTop);
  const beforeHorizontal = hasFrame ? await frame.evaluate(node => node.scrollLeft) : 0;
  expect(beforeVertical).toBe(240);

  // Atualização assíncrona legítima: a explicação passa para a revisão 2 e o aplicativo
  // re-renderiza mantendo a mesma folha aberta.
  await page.evaluate(() => {
    globalThis.__explanationFixture.probe.courseRevision = 2;
    globalThis.__explanationFixture.app.refreshRuntimeStatus();
  });
  await expect(overlay).toBeVisible();
  await expect.poll(() => page.evaluate(() => globalThis.__explanationFixture.probe.reads.length)).toBeGreaterThan(0);

  const afterVertical = await body.evaluate(node => node.scrollTop);
  const afterHorizontal = hasFrame ? await page.locator(".study-explanation-body [data-resource-scroll-frame]").first().evaluate(node => node.scrollLeft) : 0;
  await page.screenshot({ path: testInfo.outputPath("explanation-reading-390.png"), fullPage: true });
  expect(afterVertical).toBe(beforeVertical);
  if (hasFrame) expect(afterHorizontal).toBe(beforeHorizontal);
  expect(errors).toEqual([]);
});

