import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
async function mount(page) {
  const errors = []; page.on("pageerror", error => errors.push(error.message));
  for (const [url, path, contentType] of [
    ["**/tests/gallery/course-microsequence-review.html", "../gallery/course-microsequence-review.html", "text/html"],
    ["**/tests/support/courseMicrosequenceReviewFixture.js", "../support/courseMicrosequenceReviewFixture.js", "text/javascript"],
    ["**/tests/helpers/courseMicrosequenceReviewFixture.js", "../helpers/courseMicrosequenceReviewFixture.js", "text/javascript"],
    ["**/tests/helpers/courseAuthoringAnalyticsFixture.js", "../helpers/courseAuthoringAnalyticsFixture.js", "text/javascript"]
  ]) await page.route(url, route => route.fulfill({ status: 200, contentType, body: readFileSync(new URL(path, import.meta.url), "utf8") }));
  await page.goto("/tests/gallery/course-microsequence-review.html");
  await expect.poll(() => page.evaluate(() => globalThis.__REVIEW_FIXTURE_READY__)).toBe(true);
  await page.getByRole("button", { name: "Inspecionar Explicação", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Unidades (2)" })).toBeVisible();
  return errors;
}
const dialog = page => page.getByRole("dialog", { name: "Explicação e revisão do conteúdo" });
const confirm = page => page.getByRole("checkbox", { name: /Revisei o conjunto/ });
for (const width of [360, 390, 430, 1280]) test(`inspeção completa e decisão explícita em ${width}px`, async ({ page }, info) => {
  await page.setViewportSize({ width, height: 850 }); const errors = await mount(page);
  const approve = page.getByRole("button", { name: "Aprovar conteúdo revisado", exact: true });
  await expect(approve).toBeDisabled();
  await expect(dialog(page).locator('[aria-label="Revisão humana do conteúdo"]')).toContainText(
    "Interfaces · 2 unidades · Explicação compartilhada · vínculos de fontes.");
  await expect(dialog(page)).toContainText("Um socket é a interface local");
  await expect(dialog(page)).toContainText("1. Interface local · Teoria");
  await expect(dialog(page)).toContainText("2. Distinguir interface e relação · Prática");
  await page.getByText("Objetivo e proposta da microssequência", { exact: true }).click();
  await expect(dialog(page)).toContainText("Distinguir interface e conexão.");
  await page.getByText("Configuração solicitada e aplicada", { exact: true }).click();
  await expect(dialog(page)).toContainText("Configuração aplicada");
  expect(await page.evaluate(() => globalThis.__reviewFixture.probe.calls)).toEqual([]);
  const box = await dialog(page).boundingBox(); expect(box.x).toBeGreaterThanOrEqual(0); expect(box.x + box.width).toBeLessThanOrEqual(width + 1);
  await confirm(page).check(); await expect(approve).toBeEnabled();
  await expect(dialog(page).locator("details").filter({ has: page.getByText("Configuração solicitada e aplicada", { exact: true }) })).toHaveAttribute("open", "");
  await page.screenshot({ path: info.outputPath(`review-${width}.png`), fullPage: true });
  await approve.click(); await expect(page.locator("[data-review-status]")).toContainText("Conteúdo aprovado pela sua decisão");
  expect(await page.evaluate(() => globalThis.__reviewFixture.probe.calls.length)).toBe(1);
  await page.keyboard.press("Escape"); await expect(dialog(page)).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Inspecionar Explicação", exact: true })).toBeFocused(); expect(errors).toEqual([]);
});
test("edição manual permite prévia e cancelamento; salvar mantém rascunho até outra decisão", async ({ page }) => {
  const errors = await mount(page);
  await page.getByRole("button", { name: "Editar Explicação", exact: true }).click();
  const field = page.locator("[data-review-field]").last(); await field.fill("A interface local não é a conexão inteira.");
  await page.keyboard.press("Escape"); await expect(dialog(page)).toBeVisible();
  await expect(field).toHaveValue("A interface local não é a conexão inteira."); await expect(field).toBeFocused();
  await page.getByRole("button", { name: "Visualizar alterações" }).click();
  await expect(dialog(page)).toContainText("Prévia local: nada foi salvo.");
  await page.getByRole("button", { name: "Cancelar edição" }).click();
  expect(await page.evaluate(() => globalThis.__reviewFixture.probe.calls)).toEqual([]);
  await expect(dialog(page)).toContainText("Um socket é a interface local");
  await page.getByRole("button", { name: "Editar Explicação", exact: true }).click();
  await field.fill("A interface local não é a conexão inteira.");
  await page.getByRole("button", { name: "Salvar Explicação", exact: true }).click();
  await expect(page.locator("[data-review-status]")).toContainText("Explicação salva como rascunho");
  await expect(dialog(page)).toContainText("A interface local não é a conexão inteira.");
  await expect(page.getByRole("button", { name: "Aprovar conteúdo revisado", exact: true })).toBeDisabled();
  expect(await page.evaluate(() => globalThis.__reviewFixture.probe.calls.map(value => value.kind))).toEqual(["save"]); expect(errors).toEqual([]);
});
test("aprovação incerta conserva identidade e bloqueia nova escrita", async ({ page }) => {
  const errors = await mount(page); await page.evaluate(() => { globalThis.__reviewFixture.probe.uncertain = true; });
  await confirm(page).check(); await page.getByRole("button", { name: "Aprovar conteúdo revisado", exact: true }).click();
  await expect(page.locator("[data-review-status]")).toContainText("Não foi possível confirmar a aprovação");
  await page.keyboard.press("Escape"); await expect(dialog(page)).toBeVisible();
  await page.evaluate(() => { globalThis.__reviewFixture.probe.uncertain = false; });
  await page.getByRole("button", { name: "Confirmar resultado da mesma aprovação" }).click();
  await expect(page.locator("[data-review-status]")).toContainText("Conteúdo aprovado pela sua decisão");
  const calls = await page.evaluate(() => globalThis.__reviewFixture.probe.calls); expect(calls).toHaveLength(2);
  expect(calls[1].request).toEqual(calls[0].request); expect(errors).toEqual([]);
});
test("fontes recebem o alvo da Explicação e encerram a inspeção sem modal empilhado", async ({ page }) => {
  const errors = await mount(page); await page.getByRole("button", { name: "Fontes da Explicação", exact: true }).click();
  await expect(dialog(page)).toHaveCount(0);
  const target = await page.evaluate(() => globalThis.__reviewFixture.probe.sources);
  expect(target.targetKind).toBe("microsequence_explanation"); expect(target.targetId).toBe("micro-review");
  expect(target.targetVersion).toBe(2); expect(target.targetExplanation.content).toHaveLength(1); expect(errors).toEqual([]);
});
test("fontes de unidade preservam literal completo e retorno contextual; foco permanece no diálogo", async ({ page }) => {
  const errors = await mount(page);
  await expect(page.getByRole("button", { name: "Fechar inspeção da Explicação" })).toBeFocused();
  await expect(dialog(page)).toContainText("AUTORIA SINTÉTICA");
  await expect(dialog(page)).toContainText("Capítulo 2, páginas 12–13");
  await expect(dialog(page)).toContainText("Observe qual elemento é local ao processo");
  await expect(dialog(page).locator('[data-package="aralearn.response.open"]')).toHaveAttribute("inert", "");
  await confirm(page).check(); await expect(confirm(page)).toBeFocused();
  await page.keyboard.press("Tab"); await expect(page.getByRole("button", { name: "Aprovar conteúdo revisado", exact: true })).toBeFocused();
  await page.getByRole("button", { name: "Fontes de Interface local", exact: true }).click();
  await expect(dialog(page)).toHaveCount(0);
  const target = await page.evaluate(() => globalThis.__reviewFixture.probe.sources);
  expect(target.targetKind).toBe("study_unit"); expect(target.targetId).toBe("unit-theory"); expect(target.targetVersion).toBe(2);
  expect(target.targetStudyUnit.content[0].data.text).toContain("O processo usa uma interface");
  await expect(page.getByRole("button", { name: "Inspecionar Explicação", exact: true })).toBeFocused(); expect(errors).toEqual([]);
});
