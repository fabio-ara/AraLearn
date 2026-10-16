import { expect, test } from "@playwright/test";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

// Issue 466: o retorno autoral da alternativa marcada vive dentro dela, no painel de
// leitura (.card-sheet-content). O alvo pertinente é o retorno da alternativa marcada
// INCORRETA; sem retorno declarado nada é revelado. Este teste mede o MESMO estado antes e
// depois da correção: invariantes externos (geometria e altura de conteúdo) precisam ficar
// idênticos, e a única mudança admitida é a rolagem do painel, uma vez por ação.
//
// O spec é autocontido e roda em checkout limpo: as asserções públicas cobrem visibilidade
// do retorno, alvo exato da rolagem, ausência de rolagem de página, foco e progresso. A
// comparação extra de invariantes externos é opcional e só acontece quando
// ARALEARN_466_BASELINE é fornecida explicitamente; nesse caso, arquivo ou cena ausentes
// falham o teste em vez de passar em silêncio.

const MEASURE_DIR = process.env.ARALEARN_466_MEASURE_DIR || "";
const PROOF_DIR = process.env.ARALEARN_466_PROOF_DIR || "";
const BASELINE = process.env.ARALEARN_466_BASELINE || "";
const TOLERANCE = 0.5;

async function mount(page, query = "") {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  // Somente arquivos de fixture: mantém o teste executável contra o stage de .pages.
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

const measure = (page) => page.evaluate(() => {
  const round = (value) => Math.round(value * 100) / 100;
  const panel = document.querySelector(".card-sheet-content");
  const dock = document.querySelector(".card-answer-dock");
  const panelBox = panel.getBoundingClientRect();
  const contentOffset = (node) => round(node.getBoundingClientRect().top - panelBox.top + panel.scrollTop);
  const shape = (node) => ({ top: contentOffset(node), height: round(node.getBoundingClientRect().height) });
  const returns = [...document.querySelectorAll(".multiple-choice-option-feedback")];
  const bandTop = round(panelBox.top);
  const bandBottom = round(panelBox.top + panel.clientHeight);
  const detail = (node) => ({
    option: node.getAttribute("data-choice-return-option"),
    block: node.getAttribute("data-choice-return-block"),
    top: contentOffset(node),
    bottom: round(node.getBoundingClientRect().bottom - panelBox.top + panel.scrollTop),
    height: round(node.getBoundingClientRect().height)
  });
  return {
    external: {
      panelWidth: round(panel.clientWidth),
      panelHeight: round(panel.clientHeight),
      contentHeight: round(panel.scrollHeight),
      maxScroll: round(panel.scrollHeight - panel.clientHeight),
      dockHeight: dock ? round(dock.getBoundingClientRect().height) : null,
      options: [...document.querySelectorAll(".multiple-choice-option")].map(shape),
      returns: returns.map(detail)
    },
    scroll: {
      scrollTop: round(panel.scrollTop),
      pageScroll: round(document.scrollingElement.scrollTop),
      progress: document.querySelector(".study-reader-count-value")?.textContent?.trim() || "",
      active: document.activeElement?.getAttribute("aria-label") || (document.activeElement?.textContent || "").trim().slice(0, 40),
      focusInsidePanel: Boolean(document.activeElement?.closest?.(".card-sheet-content"))
    },
    visibility: returns.map((node) => {
      const box = node.getBoundingClientRect();
      return {
        option: node.getAttribute("data-choice-return-option"),
        inside: round(box.top) >= bandTop - 1 && round(box.bottom) <= bandBottom + 1,
        startsAtBandTop: Math.abs(round(box.top) - bandTop) <= 1,
        tallerThanPanel: round(box.height) > round(panel.clientHeight)
      };
    }),
    dockText: dock ? dock.textContent.replace(/\s+/gu, " ").trim() : ""
  };
});

function record(scene, data) {
  if (!MEASURE_DIR) return;
  mkdirSync(MEASURE_DIR, { recursive: true });
  writeFileSync(path.join(MEASURE_DIR, scene + ".json"), JSON.stringify(data, null, 2) + "\n", "utf8");
}

function externalDrift(scene, external) {
  if (!BASELINE) return null;
  if (!existsSync(BASELINE)) {
    throw new Error("referência externa pedida e ausente: " + BASELINE);
  }
  const baseline = JSON.parse(readFileSync(BASELINE, "utf8"))[scene];
  if (!baseline) throw new Error("cena ausente na referência externa: " + scene);
  const deltas = [];
  const walk = (left, right, key) => {
    if (typeof left === "number" && typeof right === "number") {
      deltas.push({ key, delta: Math.abs(left - right) });
      return;
    }
    if (Array.isArray(left) && Array.isArray(right)) {
      left.forEach((item, index) => walk(item, right[index], key + "[" + index + "]"));
      return;
    }
    if (left && right && typeof left === "object") {
      for (const name of Object.keys(left)) walk(left[name], right[name], key + "." + name);
    }
  };
  walk(external, baseline.external, scene);
  return {
    max: deltas.reduce((value, item) => Math.max(value, item.delta), 0),
    keys: deltas.filter((item) => item.delta > TOLERANCE).map((item) => item.key)
  };
}

// Comparação externa opcional, cena a cena, no MESMO estado. Sem referência explícita
// nenhuma comparação acontece e nenhum resultado externo é afirmado.
function expectSameExternal(scene, external) {
  const drift = externalDrift(scene, external);
  if (!drift) return;
  expect(drift.keys, "invariantes externos iguais ao estado de referência").toEqual([]);
  expect(drift.max).toBeLessThanOrEqual(TOLERANCE);
}

async function shot(page, scene) {
  if (!PROOF_DIR) return;
  mkdirSync(PROOF_DIR, { recursive: true });
  await page.screenshot({ path: path.join(PROOF_DIR, scene + ".png") });
}

function targetOf(after, optionId) {
  const item = after.external.returns.find((entry) => entry.option === optionId);
  if (!item) throw new Error("retorno ausente para a alternativa " + optionId);
  const max = after.external.maxScroll;
  const clamp = (value) => Math.min(Math.max(value, 0), max);
  return {
    item,
    taller: item.height > after.external.panelHeight,
    flush: clamp(item.bottom - after.external.panelHeight),
    topAligned: clamp(item.top)
  };
}

// Reproduz a decisão do host: alinha o topo quando o retorno é maior que o painel; senão
// rola apenas o necessário para o retorno inteiro entrar, e nada quando ele já está visível.
function expectedScrollTop(after, before, optionId) {
  const target = targetOf(after, optionId);
  const base = before.scroll.scrollTop;
  if (target.taller) return target.topAligned;
  if (target.item.bottom > base + after.external.panelHeight + TOLERANCE) return target.flush;
  if (target.item.top < base - TOLERANCE) return target.topAligned;
  return base;
}

function expectReveal(after, before, optionId) {
  const expected = expectedScrollTop(after, before, optionId);
  const target = targetOf(after, optionId);
  expect(Math.abs(after.scroll.scrollTop - expected),
    "rolagem final exatamente no alvo " + optionId).toBeLessThanOrEqual(1);
  const visibility = after.visibility.find((entry) => entry.option === optionId);
  if (target.taller) {
    expect(visibility.startsAtBandTop, "retorno maior que o painel alinhado pelo topo").toBe(true);
  } else {
    expect(visibility.inside, "retorno inteiro dentro da banda visível").toBe(true);
  }
  expect(after.scroll.pageScroll, "nenhuma rolagem de página inteira").toBe(0);
}

const check = (page) => page.getByRole("button", { name: "Conferir resposta", exact: true }).click();
const genericWrong = "As respostas marcadas não correspondem ao conjunto esperado.";
const explanationButton = (page) => page.getByRole("button", { name: "Explicação", exact: true });
const explanationOverlay = (page) => page.getByRole("dialog", { name: "Explicação", exact: true });
const panel = (page) => page.locator(".card-sheet-content");

test("erro: retorno da alternativa marcada incorreta entra no painel de leitura", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await mount(page, "?unit=practice&practice=choice-return");
  await page.locator('[data-action="choice-toggle"][data-choice-option-id="quatro"]').click();
  const before = await measure(page);
  await check(page);
  await expect(page.locator(".card-answer-dock")).toContainText(genericWrong);
  const after = await measure(page);
  record("wrong-long-after-check", after);
  await shot(page, "wrong-long-after-check");
  expect(after.external.returns.map((entry) => entry.option)).toEqual(["quatro"]);
  expect(new Set(after.external.returns.map((entry) => entry.block)).size).toBe(1);
  expectReveal(after, before, "quatro");
  expect(after.scroll.active, "foco preservado no controle").toBe("Conferir resposta");
  expect(after.scroll.progress, "progresso da unidade inalterado").toBe(before.scroll.progress);
  await page.waitForTimeout(700);
  const settled = await measure(page);
  expect(settled.scroll.scrollTop, "hidratação assíncrona não provoca segunda rolagem").toBe(after.scroll.scrollTop);
  expect(settled.visibility[0].inside).toBe(true);
  expectSameExternal("wrong-long-after-check", settled.external);
});

test("erro sem retorno autoral declarado: o check não introduz rolagem nova", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await mount(page, "?unit=practice");
  await page.locator('[data-action="choice-toggle"][data-choice-option-id="whole"]').click();
  const before = await measure(page);
  await check(page);
  await expect(page.locator(".card-answer-dock")).toContainText(genericWrong);
  const after = await measure(page);
  record("wrong-without-return", after);
  await shot(page, "wrong-without-return");
  expect(after.external.returns, "prática sem retorno declarado não tem retorno autoral").toEqual([]);
  expect(after.scroll.scrollTop, "sem retorno, a rolagem do painel não muda").toBe(before.scroll.scrollTop);
  expect(after.scroll.pageScroll).toBe(before.scroll.pageScroll);
  expect(after.scroll.progress).toBe(before.scroll.progress);
  expectSameExternal("wrong-without-return", after.external);
});

test("erro com marcada correta e incorreta: o alvo é o retorno da incorreta", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await mount(page, "?unit=practice&practice=choice-multiple");
  await page.locator('[data-action="choice-toggle"][data-choice-option-id="restrito"]').click();
  await page.locator('[data-action="choice-toggle"][data-choice-option-id="soma"]').click();
  const before = await measure(page);
  await check(page);
  await expect(page.locator(".card-answer-dock")).toContainText(genericWrong);
  const after = await measure(page);
  record("wrong-multiple-priority", after);
  await shot(page, "wrong-multiple-priority");
  expect(new Set(after.external.returns.map((entry) => entry.option))).toEqual(new Set(["restrito", "soma"]));
  expect(new Set(after.external.returns.map((entry) => entry.block)).size, "um único bloco").toBe(1);
  const wrongExpected = expectedScrollTop(after, before, "soma");
  const correctExpected = expectedScrollTop(after, before, "restrito");
  expect(Math.abs(wrongExpected - correctExpected), "cena discriminante entre incorreta e correta").toBeGreaterThan(2);
  expectReveal(after, before, "soma");
  expect(Math.abs(after.scroll.scrollTop - correctExpected), "não revela a alternativa correta").toBeGreaterThan(2);
  expect(after.scroll.progress).toBe(before.scroll.progress);
  expectSameExternal("wrong-multiple-priority", after.external);
});

test("erro por omissão: revela o retorno da alternativa marcada", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await mount(page, "?unit=practice&practice=choice-multiple");
  await page.locator('[data-action="choice-toggle"][data-choice-option-id="restrito"]').click();
  const before = await measure(page);
  await check(page);
  await expect(page.locator(".card-answer-dock")).toContainText(genericWrong);
  const after = await measure(page);
  record("wrong-omission-fallback", after);
  await shot(page, "wrong-omission-fallback");
  expect(after.external.returns.map((entry) => entry.option)).toEqual(["restrito"]);
  expectReveal(after, before, "restrito");
  expect(after.scroll.progress).toBe(before.scroll.progress);
  expectSameExternal("wrong-omission-fallback", after.external);
});

test("sem salto: overlay, sincronização e tentar de novo não herdam a revelação", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await mount(page, "?unit=practice&practice=choice-return");
  await page.locator('[data-action="choice-toggle"][data-choice-option-id="quatro"]').click();
  const before = await measure(page);
  await check(page);
  const revealed = await measure(page);
  record("wrong-no-jump", revealed);
  await shot(page, "wrong-no-jump");
  expectReveal(revealed, before, "quatro");
  expectSameExternal("wrong-no-jump", revealed.external);
  expect(revealed.scroll.scrollTop).toBeGreaterThan(before.scroll.scrollTop);

  // Rolagem manual de volta ao topo: nenhuma ação posterior pode trazer o retorno de novo.
  await panel(page).evaluate((node) => { node.scrollTop = 0; });
  expect((await measure(page)).scroll.scrollTop).toBe(0);

  // Rerender real da explicação não reaplica a intenção já consumida.
  await explanationButton(page).click();
  await expect(explanationOverlay(page)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(explanationOverlay(page)).toHaveCount(0);
  const afterOverlay = await measure(page);
  expect(afterOverlay.scroll.scrollTop, "overlay não reaplica a revelação").toBeLessThanOrEqual(1);
  expect(afterOverlay.scroll.pageScroll).toBe(0);

  // Rerender de sincronização também não.
  await page.evaluate(() => globalThis.__explanationFixture.app.setOfflineStatus(true));
  const afterSync = await measure(page);
  expect(afterSync.scroll.scrollTop, "sincronização não reaplica a revelação").toBeLessThanOrEqual(1);
  expect(afterSync.scroll.pageScroll).toBe(0);

  // Tentar de novo limpa o retorno e não herda intenção pendente.
  await page.getByRole("button", { name: "Tentar de novo", exact: true }).click();
  const afterReset = await measure(page);
  expect(afterReset.external.returns, "retorno some no reinício da prática").toEqual([]);
  expect(afterReset.scroll.scrollTop, "reinício não herda revelação").toBeLessThanOrEqual(1);
  expect(afterReset.scroll.pageScroll).toBe(0);
  expect(afterReset.scroll.focusInsidePanel, "foco fora do painel de leitura").toBe(false);

  await page.evaluate(() => globalThis.__explanationFixture.app.setOfflineStatus(false));
  const afterSyncBack = await measure(page);
  expect(afterSyncBack.scroll.scrollTop, "sync de volta não salta").toBeLessThanOrEqual(1);
  expect(afterSyncBack.external.returns, "reinício mantém a prática sem retorno").toEqual([]);
});

test("retorno maior que o painel em 320: topo alinhado e leitura integral por rolagem manual", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await mount(page, "?unit=practice&practice=choice-return-tall");
  await page.locator('[data-action="choice-toggle"][data-choice-option-id="soma"]').click();
  const before = await measure(page);
  await check(page);
  await expect(page.locator(".card-answer-dock")).toContainText(genericWrong);
  const after = await measure(page);
  record("wrong-tall-320", after);
  await shot(page, "wrong-tall-320");
  expect(after.external.returns.map((entry) => entry.option)).toEqual(["soma"]);
  expect(after.visibility[0].tallerThanPanel, "retorno maior que o painel em 320").toBe(true);
  expectReveal(after, before, "soma");
  expect(after.scroll.active).toBe("Conferir resposta");
  expect(after.scroll.progress).toBe(before.scroll.progress);

  // Leitura integral: a rolagem manual do painel alcança o fim do retorno, sem rolar a página.
  await panel(page).evaluate((node) => { node.scrollTop = node.scrollHeight; });
  const atEnd = await measure(page);
  const target = targetOf(atEnd, "soma");
  expect(target.item.bottom - atEnd.external.maxScroll, "fim do retorno dentro da banda no fim da rolagem")
    .toBeLessThanOrEqual(atEnd.external.panelHeight + TOLERANCE);
  expect(atEnd.scroll.scrollTop).toBe(atEnd.external.maxScroll);
  expect(atEnd.scroll.pageScroll).toBe(0);
  expectSameExternal("wrong-tall-320", after.external);
});

test("acerto: comentário final mantém prioridade e nenhuma rolagem nova é introduzida", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await mount(page, "?unit=practice&practice=choice-return");
  await page.locator('[data-action="choice-toggle"][data-choice-option-id="restrito"]').click();
  const before = await measure(page);
  await check(page);
  await expect(page.locator(".study-continue-popup")).toBeVisible();
  await expect(page.locator(".card-answer-dock")).toContainText("Correto.");
  const after = await measure(page);
  record("correct-popover", after);
  await shot(page, "correct-popover");
  expect(after.scroll.scrollTop, "acerto não introduz rolagem nova no painel").toBe(before.scroll.scrollTop);
  expect(after.scroll.pageScroll).toBe(before.scroll.pageScroll);
  expect(after.scroll.focusInsidePanel, "foco fora do painel de leitura").toBe(false);
  expectSameExternal("correct-popover", after.external);
});
