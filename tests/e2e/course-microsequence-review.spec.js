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
  await expect(page.getByRole("heading", { name: "Unidades (2) · contexto" })).toBeVisible();
  return errors;
}
const dialog = page => page.getByRole("dialog", { name: "Explicação e revisão do conteúdo" });
const confirm = page => page.getByRole("checkbox", { name: /Inspecionei este objeto/ });

test("Autoria navega da ocorrência à bibliografia e resolve PDF por clique no snapshot inspecionado", async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 850 }); const errors = await mount(page);
  await page.getByRole("button", { name: "Fechar inspeção da Explicação", exact: true }).click();
  await page.evaluate(() => { globalThis.__reviewFixture.probe.withPdf = true; });
  await page.getByRole("button", { name: "Inspecionar Explicação", exact: true }).click();
  const base = dialog(page).locator(".course-explanation-context");
  const marker = base.getByRole("button", { name: "Referência 1", exact: true });
  await expect(marker).toBeVisible();
  expect(await page.evaluate(() => globalThis.__reviewFixture.probe.pdfReads)).toEqual([]);
  await marker.tap();
  const reference = base.locator('[data-citation-reference-id="link-support-text"]');
  await expect(reference).toBeFocused();
  await expect(reference.getByRole("link", { name: "Abrir fonte", exact: true })).toHaveAttribute("href", "https://example.test/reference");
  await reference.getByRole("button", { name: "Abrir PDF em pp. 12–13 de Obra sintética sobre interfaces", exact: true }).tap();
  await expect.poll(() => page.evaluate(() => globalThis.__reviewFixture.probe.openedSources.length)).toBe(1);
  expect(await page.evaluate(() => globalThis.__reviewFixture.probe.openedSources[0])).toBe("https://example.test/author-source.pdf?token=synthetic-1#page=12");
  expect(await page.evaluate(() => globalThis.__reviewFixture.probe.pdfReads[0])).toMatchObject({
    expectedCourseRevision: 7, sourceId: "source-review", sourceRevision: 1, contentHash: "a".repeat(64) });
  await reference.getByRole("button", { name: "Voltar ao trecho 1 da referência 1 na Explicação", exact: true }).tap();
  await expect(marker).toBeFocused();
  await page.screenshot({ path: info.outputPath("authoring-citations-390.png") });
  expect(await page.evaluate(() => globalThis.__reviewFixture.probe.calls)).toEqual([]);
  expect(errors).toEqual([]);
});
for (const width of [360, 390, 430, 1280]) test(`inspeção completa e decisão explícita em ${width}px`, async ({ page }, info) => {
  await page.setViewportSize({ width, height: 850 }); const errors = await mount(page);
  const approve = page.getByRole("button", { name: "Marcar como revisado", exact: true });
  await expect(approve).toBeDisabled();
  await expect(dialog(page).locator('[aria-label="Revisão humana do conteúdo"]')).toContainText(
    "Base explicativa · Interfaces · conteúdo salvo e vínculos de fontes.");
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
  await approve.click(); await expect(page.locator("[data-review-status]")).toContainText("Revisão declarada para este objeto");
  expect(await page.evaluate(() => globalThis.__reviewFixture.probe.calls.length)).toBe(1);
  await page.keyboard.press("Escape"); await expect(dialog(page)).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Inspecionar Explicação", exact: true })).toBeFocused(); expect(errors).toEqual([]);
});
test("edição no renderer real preserva geometria sem mudança; salvar registra intervenção separada", async ({ page }, info) => {
  const errors = await mount(page);
  const content = page.locator("[data-review-explanation-content]");
  const before = await content.boundingBox();
  await page.getByRole("button", { name: "Editar Explicação", exact: true }).click();
  const field = content.locator('[data-manual-edit-path="text"]').first();
  await expect(field).toHaveAttribute("contenteditable", "plaintext-only"); await expect(field).toBeFocused();
  const editingBox = await content.boundingBox();
  expect(Math.abs(editingBox.height - before.height)).toBeLessThanOrEqual(1);
  expect(Math.abs(editingBox.y - before.y)).toBeLessThanOrEqual(1);
  await expect(page.locator("textarea[data-review-field]")).toHaveCount(0);
  await page.getByRole("button", { name: "Cancelar edição", exact: true }).click();
  const unchanged = await content.boundingBox();
  expect(Math.abs(unchanged.height - before.height)).toBeLessThanOrEqual(1);
  expect(Math.abs(unchanged.y - before.y)).toBeLessThanOrEqual(1);
  await expect(page.getByRole("button", { name: "Editar Explicação", exact: true })).toBeFocused();
  await page.getByRole("button", { name: "Editar Explicação", exact: true }).click();
  await field.fill("A interface local não é a conexão inteira.");
  await page.keyboard.press("Escape"); await expect(dialog(page)).toBeVisible();
  await expect(field).toHaveText("A interface local não é a conexão inteira."); await expect(field).toBeFocused();
  await page.screenshot({ path: info.outputPath("explanation-inline-edit.png"), fullPage: true });
  await page.getByRole("button", { name: "Cancelar edição" }).click();
  expect(await page.evaluate(() => globalThis.__reviewFixture.probe.calls)).toEqual([]);
  await expect(dialog(page)).toContainText("Um socket é a interface local");
  await page.getByRole("button", { name: "Editar Explicação", exact: true }).click();
  await field.fill("A interface local não é a conexão inteira.");
  await page.getByRole("button", { name: "Salvar Explicação", exact: true }).click();
  await expect(page.locator("[data-review-status]")).toContainText("O salvamento não declara revisão autoral");
  await expect(dialog(page)).toContainText("A interface local não é a conexão inteira.");
  await expect(page.getByRole("button", { name: "Marcar como revisado", exact: true })).toBeDisabled();
  expect(await page.evaluate(() => globalThis.__reviewFixture.probe.calls.map(value => value.kind))).toEqual(["save"]); expect(errors).toEqual([]);
});
test("revisão incerta conserva identidade e bloqueia nova escrita", async ({ page }) => {
  const errors = await mount(page); await page.evaluate(() => { globalThis.__reviewFixture.probe.uncertain = true; });
  await confirm(page).check(); await page.getByRole("button", { name: "Marcar como revisado", exact: true }).click();
  await expect(page.locator("[data-review-status]")).toContainText("Não foi possível confirmar a revisão");
  await page.keyboard.press("Escape"); await expect(dialog(page)).toBeVisible();
  await page.evaluate(() => { globalThis.__reviewFixture.probe.uncertain = false; });
  await page.getByRole("button", { name: "Confirmar resultado da mesma decisão" }).click();
  await expect(page.locator("[data-review-status]")).toContainText("Revisão declarada para este objeto");
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

test("marca e retirada da base preservam a revisão independente da unidade", async ({ page }) => {
  const errors = await mount(page);
  await confirm(page).check(); await page.getByRole("button", { name: "Marcar como revisado", exact: true }).click();
  await expect(page.locator("[data-review-status]")).toContainText("Revisão declarada");
  await page.getByRole("button", { name: "Retirar marca de revisão", exact: true }).click();
  await expect(page.locator("[data-review-status]")).toContainText("Marca de revisão retirada deste objeto");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Revisar unidade", exact: true }).click();
  await expect(dialog(page).getByRole("heading", { name: "Unidade em revisão", exact: true })).toBeVisible();
  await expect(dialog(page).locator('[aria-label="Revisão humana do conteúdo"]')).toContainText("Unidade · Interface local");
  await expect(dialog(page).locator('[aria-label="Unidade em revisão"]')).not.toContainText("Distinguir interface e relação");
  await expect(page.getByRole("button", { name: "Retirar marca de revisão", exact: true })).toHaveCount(0);
  await confirm(page).check(); await page.getByRole("button", { name: "Marcar como revisado", exact: true }).click();
  await expect(page.locator("[data-review-status]")).toContainText("Revisão declarada");
  const calls = await page.evaluate(() => globalThis.__reviewFixture.probe.calls.map(value => value.request));
  expect(calls.map(value => [value.targetKind, value.targetId, value.reviewed])).toEqual([
    ["microsequence_explanation", "micro-review", true], ["microsequence_explanation", "micro-review", false],
    ["study_unit", "unit-theory", true]
  ]);
  expect(new Set(calls.map(value => value.requestId)).size).toBe(3);
  expect(errors).toEqual([]);
});
test("fontes de unidade preservam literal completo e retorno contextual; foco permanece no diálogo", async ({ page }, info) => {
  const errors = await mount(page);
  await expect(page.getByRole("button", { name: "Fechar inspeção da Explicação" })).toBeFocused();
  await expect(dialog(page)).toContainText("AUTORIA SINTÉTICA");
  await expect(dialog(page)).toContainText("Capítulo 2, páginas 12–13");
  await expect(dialog(page)).toContainText("Observe qual elemento é local ao processo");
  const response = dialog(page).locator('[data-package="aralearn.response.open"]');
  const accessibility = await page.context().newCDPSession(page);
  const nativeTree = await accessibility.send("Accessibility.getFullAXTree");
  await accessibility.detach();
  const accessibleNames = nativeTree.nodes.filter(node => !node.ignored).map(node => node.name?.value || "");
  await info.attach("open-native-accessibility", { body: JSON.stringify(accessibleNames), contentType: "application/json" });
  expect(accessibleNames).toContain("Explique a diferença com suas palavras.");
  expect(accessibleNames).toContain("Resposta aberta, sem correção automática.");
  const responseSnapshot = await response.ariaSnapshot();
  await info.attach("open-review-accessibility", { body: responseSnapshot, contentType: "text/plain" });
  expect(responseSnapshot).toContain("Explique a diferença com suas palavras.");
  expect(responseSnapshot).toContain("Resposta aberta, sem correção automática.");
  await expect(response).not.toHaveAttribute("inert", "");
  await expect(response).not.toHaveAttribute("aria-disabled", "true");
  await expect(response.locator("button, input, select, textarea, [contenteditable], [data-action^='open-response-']")).toHaveCount(0);
  await response.getByText("Explique a diferença com suas palavras.", { exact: true }).click();
  expect(await response.ariaSnapshot()).toBe(responseSnapshot);
  expect(await page.evaluate(() => globalThis.__reviewFixture.probe.calls)).toEqual([]);
  await response.screenshot({ path: info.outputPath("open-review-accessible.png") });
  await confirm(page).check(); await expect(confirm(page)).toBeFocused();
  await page.keyboard.press("Tab"); await expect(page.getByRole("button", { name: "Marcar como revisado", exact: true })).toBeFocused();
  await page.getByRole("button", { name: "Fontes de Interface local", exact: true }).click();
  await expect(dialog(page)).toHaveCount(0);
  const target = await page.evaluate(() => globalThis.__reviewFixture.probe.sources);
  expect(target.targetKind).toBe("study_unit"); expect(target.targetId).toBe("unit-theory"); expect(target.targetVersion).toBe(2);
  expect(target.targetStudyUnit.content[0].data.text).toContain("O processo usa uma interface");
  await expect(page.getByRole("button", { name: "Inspecionar Explicação", exact: true })).toBeFocused(); expect(errors).toEqual([]);
});

test("fila da Explicação acumula, reabre, edita versão e reflete consumo sem declarar revisão", async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 850 }); const errors = await mount(page);
  const trigger = page.getByRole("button", { name: /^Observações autorais de Explicação/u });
  await expect(trigger).toHaveAccessibleName("Observações autorais de Explicação · Interfaces, 0 pendentes");
  await trigger.click();
  const textbox = page.locator("[data-author-queue-text]");
  const add = page.getByRole("button", { name: "Adicionar observação", exact: true });
  await textbox.fill("Explicitar o pressuposto do exemplo."); await add.click();
  await expect(page.locator(".course-authoring-observation-entries li")).toHaveCount(1);
  await textbox.fill("Relacionar o argumento à fonte."); await add.click();
  await expect(page.locator(".course-authoring-observation-entries li")).toHaveCount(2);
  await expect(trigger).toHaveAccessibleName("Observações autorais de Explicação · Interfaces, 2 pendentes");
  await page.getByRole("button", { name: /Editar observação 1, versão 1/u }).click();
  await textbox.fill("Explicitar o pressuposto e seu limite.");
  await page.getByRole("button", { name: "Salvar edição da observação", exact: true }).click();
  await expect(page.locator('[data-author-queue-version="2"]')).toHaveCount(1);
  await page.screenshot({ path: info.outputPath("explanation-observation-queue-390.png"), fullPage: true });
  await page.keyboard.press("Escape"); await expect(dialog(page)).toHaveCount(0);
  await page.getByRole("button", { name: "Inspecionar Explicação", exact: true }).click(); await trigger.click();
  await expect(page.locator(".course-authoring-observation-entries li")).toHaveCount(2);
  await expect(page.getByText("Explicitar o pressuposto e seu limite.", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => globalThis.__reviewFixture.probe.calls)).toEqual([]);
  await page.evaluate(() => { globalThis.__reviewFixture.probe.observations[0].state = "resolved"; });
  await page.getByRole("button", { name: "Atualizar fila", exact: true }).click();
  await expect(page.locator(".course-authoring-observation-entries li")).toHaveCount(1);
  expect(await page.evaluate(() => globalThis.__reviewFixture.probe.observationWrites.map(value => value.command.type)))
    .toEqual(["create_anchored_annotation", "create_anchored_annotation", "revise_anchored_annotation"]);
  expect(errors).toEqual([]);
});

test("fila preserva rascunho em resposta tardia e reconcilia envio perdido sem repetir", async ({ page }) => {
  const errors = await mount(page);
  const trigger = page.getByRole("button", { name: /^Observações autorais de Explicação/u });
  await trigger.click();
  const textbox = page.locator("[data-author-queue-text]");
  await page.evaluate(() => { globalThis.__reviewFixture.probe.delayObservationRead = true; });
  await page.getByRole("button", { name: "Atualizar fila", exact: true }).click();
  await textbox.fill("Rascunho durante atualização.");
  await page.evaluate(() => {
    const probe = globalThis.__reviewFixture.probe; probe.delayObservationRead = false; probe.finishObservationRead();
  });
  await expect(textbox).toHaveValue("Rascunho durante atualização."); await expect(textbox).toBeFocused();
  await page.evaluate(() => { globalThis.__reviewFixture.probe.observationLostResponse = true; });
  await page.getByRole("button", { name: "Adicionar observação", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Não foi possível confirmar o envio");
  await expect(textbox).toHaveValue("Rascunho durante atualização.");
  await page.getByRole("button", { name: "Confirmar envio pendente", exact: true }).click();
  await expect(page.locator(".course-authoring-observation-entries li")).toHaveCount(1);
  expect(await page.evaluate(() => globalThis.__reviewFixture.probe.observationWrites.length)).toBe(1);
  expect(await page.evaluate(() => globalThis.__reviewFixture.probe.calls)).toEqual([]);
  expect(errors).toEqual([]);
});

test("Conteúdo abre Explicação salva sem unidades e retorna ao objeto vazio", async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 850 }); const errors = await mount(page);
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Conteúdo sem unidades", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Nenhuma unidade de estudo materializada" })).toBeVisible();
  const trigger = page.getByRole("button", { name: "Explicação de Interfaces", exact: true });
  await expect(trigger).toBeVisible(); await trigger.click();
  await expect(dialog(page)).toContainText("Um socket é a interface local");
  await expect(dialog(page).getByRole("heading", { name: "Unidades (0) · contexto", exact: true })).toBeVisible();
  await expect(dialog(page).getByRole("button", { name: "Editar Explicação", exact: true })).toBeVisible();
  await confirm(page).check(); await page.getByRole("button", { name: "Marcar como revisado", exact: true }).click();
  await expect(page.locator("[data-review-status]")).toContainText("Revisão declarada para este objeto");
  await page.screenshot({ path: info.outputPath("explanation-before-units.png"), fullPage: true });
  await page.keyboard.press("Escape"); await expect(dialog(page)).toHaveCount(0);
  await expect(trigger).toBeFocused();
  expect(await page.evaluate(() => globalThis.__reviewFixture.probe.calls.map(value => [value.kind, value.request.targetKind])))
    .toEqual([["review", "microsequence_explanation"]]);
  expect(errors).toEqual([]);
});
