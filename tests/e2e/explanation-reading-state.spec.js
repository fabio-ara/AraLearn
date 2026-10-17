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
  // Discriminante: a leitura síncrona é feita no mesmo instante do render. O preserveFocus do
  // aplicativo restaura por caminho numa RAF; se o foco já está no corpo aqui, quem o repôs foi
  // o contrato da folha, e não o acerto incidental do caminho externo.
  const immediateFocus = await page.evaluate(() => {
    globalThis.__explanationFixture.probe.courseRevision = 2;
    globalThis.__explanationFixture.app.refreshRuntimeStatus();
    return document.activeElement?.className || "";
  });
  expect(immediateFocus).toContain("study-explanation-body");
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

// A âncora de referência é <a class="study-citation-link" href=...> sem tabindex: o caminho do
// estado não a captura, então a folha resolve o alvo pela identidade semântica (href) e só
// quando ela é única. Focar não ativa o link: nenhuma navegação pode ocorrer na atualização.
async function openReferences(page) {
  await page.getByRole("button", { name: "Explicação", exact: true }).click();
  const overlay = page.getByRole("dialog", { name: "Explicação", exact: true });
  await expect(overlay).toBeVisible();
  await overlay.getByRole("button", { name: "Referência 1", exact: true }).first().tap();
  await expect(overlay.locator('[data-citation-reference-id="support-link"]')).toBeVisible();
  return overlay;
}

test("foco em âncora de referência sobrevive à atualização da revisão", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 850 });
  const errors = await mount(page, "?weblink=1");
  const overlay = await openReferences(page);
  const anchor = overlay.locator("a[href]").first();
  await expect(anchor).toBeVisible();
  expect(await anchor.getAttribute("tabindex")).toBeNull();
  await anchor.evaluate(node => node.focus());
  expect(await anchor.evaluate(node => document.activeElement === node)).toBe(true);
  const beforeHref = await anchor.getAttribute("href");
  const urlBefore = page.url();
  await page.evaluate(() => {
    globalThis.__explanationFixture.probe.courseRevision = 2;
    globalThis.__explanationFixture.app.refreshRuntimeStatus();
  });
  await expect(overlay).toBeVisible();
  const same = overlay.locator(`a[href="${beforeHref}"]`).first();
  expect(await same.evaluate(node => document.activeElement === node)).toBe(true);
  expect(page.url()).toBe(urlBefore);
  expect(errors).toEqual([]);
});

test("bloco válido preposto antes do alvo preserva o mesmo link", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 850 });
  const errors = await mount(page, "?weblink=1");
  const overlay = await openReferences(page);
  const anchor = overlay.locator("a[href]").first();
  const beforeHref = await anchor.getAttribute("href");
  await anchor.evaluate(node => node.focus());
  await page.evaluate(() => {
    globalThis.__explanationFixture.probe.courseRevision = 2;
    globalThis.__explanationFixture.probe.explanationLayout = "prepend-block";
    globalThis.__explanationFixture.app.refreshRuntimeStatus();
  });
  await expect(overlay).toBeVisible();
  await expect(overlay.locator(".study-explanation-body")).toContainText("um bloco novo entra antes do texto anterior");
  const same = overlay.locator(`a[href="${beforeHref}"]`).first();
  expect(await same.evaluate(node => document.activeElement === node)).toBe(true);
  expect(errors).toEqual([]);
});

test("alvo removido mantém o foco seguro da abertura, sem trocar de controle", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 850 });
  const errors = await mount(page, "?weblink=1");
  const overlay = await openReferences(page);
  const anchor = overlay.locator("a[href]").first();
  await anchor.evaluate(node => node.focus());
  await page.evaluate(() => {
    globalThis.__explanationFixture.probe.courseRevision = 2;
    globalThis.__explanationFixture.probe.explanationLayout = "drop-weblink";
    globalThis.__explanationFixture.app.refreshRuntimeStatus();
  });
  await expect(overlay).toBeVisible();
  expect(await overlay.locator("a[href]").count()).toBe(0);
  expect(await page.evaluate(() => document.activeElement?.hasAttribute("data-close-explanation") === true)).toBe(true);
  expect(errors).toEqual([]);
});

