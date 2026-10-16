import { expect, test } from "@playwright/test";
import { mkdirSync, readFileSync } from "node:fs";
import path from "node:path";

// Issue 466 — achado de QA do 112. A revelação é aplicada no render da conferência; depois
// chega a leitura de citações, o app renderiza de novo e a inserção dos marcadores de
// referência muda a geometria depois da revelação. A instrumentação hospedada provou a
// inserção de DOM posterior ao reveal (botões de referência já existiam antes do check).
// Localmente o efeito medido é o painel encolher (a linha de marcadores entra na tela);
// no hospedado, o retorno também cresce uma linha com os marcadores. A fixture segue o
// fluxo real: com gate=1 a leitura fica pendente e o teste decide o instante da chegada,
// sem timeout arbitrário.

const PROOF_DIR = process.env.ARALEARN_466_PROOF_DIR || "";

async function mount(page, query = "") {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  for (const [url, file, contentType] of [
    ["**/tests/gallery/study-explanation.html*", "../gallery/study-explanation.html", "text/html"],
    ["**/tests/support/studyExplanationFixture.js", "../support/studyExplanationFixture.js", "text/javascript"],
    ["**/tests/fixtures/package/project-minimal.json", "../fixtures/package/project-minimal.json", "application/json"]
  ]) {
    await page.route(url, (route) => route.fulfill({ status: 200, contentType, body: readFileSync(new URL(file, import.meta.url), "utf8") }));
  }
  await page.goto("/tests/gallery/study-explanation.html" + query);
  await expect.poll(() => page.evaluate(() => globalThis.__EXPLANATION_FIXTURE_READY__ === true)).toBe(true);
  expect(errors).toEqual([]);
}

const settle = (page) => page.evaluate(() => (globalThis.document?.fonts?.ready || Promise.resolve())
  .then(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve(true))))));

const measure = (page) => page.evaluate(() => {
  const round = (value) => Math.round(value * 100) / 100;
  const panel = document.querySelector(".card-sheet-content");
  const panelBox = panel.getBoundingClientRect();
  const feedback = [...document.querySelectorAll(".multiple-choice-option-feedback")].at(-1);
  const box = feedback?.getBoundingClientRect() || null;
  const bandBottom = round(panelBox.top + panel.clientHeight);
  return {
    panel: { top: round(panelBox.top), clientHeight: round(panel.clientHeight), bandBottom, scrollTop: round(panel.scrollTop),
      scrollHeight: round(panel.scrollHeight) },
    feedback: box ? { top: round(box.top), height: round(box.height), bottom: round(box.bottom),
      inside: round(box.top) >= round(panelBox.top) - 1 && round(box.bottom) <= bandBottom + 1,
      hidden: round(Math.max(0, box.bottom - bandBottom)) } : null,
    markers: [...document.querySelectorAll(".source-marker")].length,
    pageScroll: round(document.scrollingElement.scrollTop),
    active: document.activeElement?.getAttribute("aria-label") || "",
    progress: document.querySelector(".study-reader-count-value")?.textContent?.trim() || ""
  };
});

async function shot(page, scene) {
  if (!PROOF_DIR) return;
  mkdirSync(PROOF_DIR, { recursive: true });
  await page.screenshot({ path: path.join(PROOF_DIR, scene + ".png") });
}

const check = (page) => page.getByRole("button", { name: "Conferir resposta", exact: true }).click();
const release = (page) => page.evaluate(() => { globalThis.__releaseStudyCitations?.(); });

test("citações depois do check: o painel encolhe e a revelação cobre o retorno na geometria nova", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await mount(page, "?unit=practice&practice=choice-return-anchored&anchors=1&gate=1");
  await page.locator('[data-action="choice-toggle"][data-choice-option-id="quatro"]').click();
  await check(page);
  const antes = await measure(page);
  expect(antes.markers, "sem citações ainda, nenhum marcador").toBe(0);
  expect(antes.feedback.inside, "revelação correta para a geometria do instante").toBe(true);
  await release(page);
  await expect.poll(() => page.locator(".source-marker").count()).toBe(2);
  await settle(page);
  const depois = await measure(page);
  await shot(page, "citations-after-check");
  expect(depois.panel.clientHeight, "a chegada das citações muda a altura útil do painel")
    .toBeLessThan(antes.panel.clientHeight);
  expect(depois.feedback.hidden, "nenhuma linha fora depois dos marcadores").toBe(0);
  expect(depois.feedback.inside, "retorno inteiro dentro do painel").toBe(true);
  expect(depois.pageScroll, "sem rolagem global").toBe(0);
  expect(depois.active, "foco preservado no controle").toBe("Conferir resposta");
  expect(depois.progress).toBe(antes.progress);
});

test("citações depois do reinício e do acerto: a intenção antiga não reabre", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await mount(page, "?unit=practice&practice=choice-return-anchored&anchors=1&gate=1");
  await page.locator('[data-action="choice-toggle"][data-choice-option-id="quatro"]').click();
  await check(page);
  const errado = await measure(page);
  expect(errado.feedback.inside, "revelação do erro aplicada").toBe(true);
  await page.getByRole("button", { name: "Tentar de novo", exact: true }).click();
  await page.locator('[data-action="choice-toggle"][data-choice-option-id="restrito"]').click();
  await check(page);
  await expect(page.locator(".study-continue-popup")).toBeVisible();
  const acerto = await measure(page);
  await release(page);
  await expect.poll(() => page.locator(".source-marker").count()).toBe(2);
  await settle(page);
  const depois = await measure(page);
  await shot(page, "citations-after-retry-correct");
  expect(depois.panel.scrollTop, "a chegada das citações não reabre a intenção antiga").toBe(acerto.panel.scrollTop);
  expect(depois.pageScroll, "sem rolagem global").toBe(0);
  expect(await page.locator(".study-continue-popup").isVisible(), "comentário final mantido").toBe(true);
  expect(depois.progress, "progresso inalterado").toBe(errado.progress);
});

test("citações depois do check: rolagem manual da pessoa não é roubada", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await mount(page, "?unit=practice&practice=choice-return-anchored&anchors=1&gate=1");
  await page.locator('[data-action="choice-toggle"][data-choice-option-id="quatro"]').click();
  await check(page);
  await page.locator(".card-sheet-content").evaluate((node) => { node.scrollTop = 0; });
  await release(page);
  await expect.poll(() => page.locator(".source-marker").count()).toBe(2);
  await settle(page);
  const depois = await measure(page);
  await shot(page, "citations-after-manual-scroll");
  expect(depois.panel.scrollTop, "posição da pessoa é preservada").toBe(0);
  expect(depois.pageScroll).toBe(0);
});

test("sem âncoras: o erro simples continua inteiro (regressão do 112)", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await mount(page, "?unit=practice&practice=choice-return");
  await page.locator('[data-action="choice-toggle"][data-choice-option-id="quatro"]').click();
  await check(page);
  await settle(page);
  const depois = await measure(page);
  expect(depois.feedback.inside).toBe(true);
  expect(depois.pageScroll).toBe(0);
});
