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
  await expect(page.locator("[data-review-explanation-content]")).toBeVisible();
  return errors;
}
const dialog = page => page.getByRole("dialog", { name: "Explicação e revisão do conteúdo" });

test("citação acompanha a última palavra na quebra de linha e não altera o texto editável", async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 850 });
  const errors = await mount(page);
  for (const marked of [false, true]) {
    const original = `Um socket é a interface local usada pelo ${marked ? "**processo.**" : "processo."}`;
    if (marked) {
      await page.getByRole("button", { name: "Fechar inspeção da explicação", exact: true }).click();
      await page.evaluate(text => { globalThis.__reviewFixture.probe.explanationText = text; }, original);
      await page.getByRole("button", { name: "Inspecionar Explicação", exact: true }).click();
    }
    await page.evaluate(() => document.fonts.ready);
    const wrapping = await page.locator('[data-review-explanation-content] .runtime-paragraph-block p').first().evaluate(paragraph => {
      const group = paragraph.querySelector('.source-marker-group');
      const marker = group.querySelector('button');
      const prefixNode = group.firstChild?.nodeType === Node.TEXT_NODE ? group.firstChild : null;
      const prefix = prefixNode?.data || '';
      if (prefixNode) prefixNode.data = '';
      const walker = document.createTreeWalker(paragraph, NodeFilter.SHOW_TEXT);
      let lastText;
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        if (!node.parentElement.closest('.source-marker-group') && node.data.endsWith('processo.')) lastText = node;
      }
      const range = document.createRange();
      range.setStart(lastText, lastText.data.length - 'processo.'.length);
      range.setEnd(lastText, lastText.data.length);
      const measure = () => {
        const word = range.getBoundingClientRect(); const number = marker.getBoundingClientRect();
        return { wordTop: word.top, wordBottom: word.bottom, markerTop: number.top, markerBottom: number.bottom };
      };
      let legacy = null;
      let width;
      const maxWidth = Math.floor(paragraph.getBoundingClientRect().width);
      for (width = 130; width <= maxWidth; width += 1) {
        paragraph.style.width = `${width}px`;
        const bounds = measure();
        if (bounds.markerTop >= bounds.wordBottom) { legacy = bounds; break; }
      }
      if (prefixNode) prefixNode.data = prefix;
      return { width, legacy, actual: measure() };
    });
    expect(wrapping.legacy, "A largura de prova deve reproduzir o expoente órfão anterior.").not.toBeNull();
    expect(wrapping.actual.markerTop).toBeLessThan(wrapping.actual.wordBottom);
    expect(wrapping.actual.markerBottom).toBeGreaterThan(wrapping.actual.wordTop);
    await page.screenshot({ path: info.outputPath(`citation-word-wrap-${marked ? 'strong' : 'plain'}-390.png`) });
    await page.getByRole("button", { name: "Editar explicação", exact: true }).click();
    const field = page.locator('[data-review-explanation-content] [data-manual-edit-path="text"]').first();
    await expect(field).toBeEditable();
    expect(await field.evaluate(async node => {
      const { serializeManualEditableNode } = await import('/src/ui/manualInlineFields.js');
      return serializeManualEditableNode(node).replace(/\n+$/u, '');
    })).toBe(original);
    await page.getByRole("button", { name: "Cancelar edição", exact: true }).click();
  }
  expect(await page.evaluate(() => globalThis.__reviewFixture.probe.calls)).toEqual([]);
  expect(errors).toEqual([]);
});
const confirm = page => page.getByRole("checkbox", { name: "Revisei esta versão e suas fontes." });
async function openReview(page) {
  const access = page.locator("summary[data-review-context=review]");
  if (await access.locator("..").getAttribute("open") === null) await access.click();
}
async function contextRow(page) {
  return page.locator(".course-review-authoring-panels").evaluate(container => {
    const origin = container.getBoundingClientRect();
    return [...container.querySelectorAll(":scope > details > summary")].map(summary => {
      const box = summary.getBoundingClientRect();
      return { x: box.x - origin.x, y: box.y - origin.y, width: box.width, height: box.height };
    });
  });
}
async function expectContextRow(page, initial) {
  const current = await contextRow(page);
  expect(current).toHaveLength(2);
  for (const [index, box] of current.entries()) {
    expect(Math.abs(box.y - current[0].y)).toBeLessThanOrEqual(1);
    expect(Math.abs(box.y - initial[index].y)).toBeLessThanOrEqual(1);
    expect(Math.abs(box.x - initial[index].x)).toBeLessThanOrEqual(1);
  }
  const bounds = await page.locator(".course-review-authoring-panels").boundingBox();
  for (const panel of await page.locator(".course-review-authoring-panels > details[open] > :not(summary)").all()) {
    const box = await panel.boundingBox();
    expect(box).not.toBeNull(); expect(Math.abs(box.width - bounds.width)).toBeLessThanOrEqual(1);
    expect(box.y).toBeGreaterThanOrEqual(bounds.y + current[0].height);
  }
}
async function expectObservationIcon(button, peer) {
  const box = await button.boundingBox();
  const icon = await button.locator(":scope > svg").boundingBox();
  const other = await peer.locator(":scope > svg").boundingBox();
  expect(box.width).toBe(44); expect(box.height).toBe(44);
  expect(Math.abs(icon.x + icon.width / 2 - box.x - box.width / 2)).toBeLessThanOrEqual(1);
  expect(Math.abs(icon.y + icon.height / 2 - box.y - box.height / 2)).toBeLessThanOrEqual(1);
  expect(Math.abs(icon.y + icon.height / 2 - other.y - other.height / 2)).toBeLessThanOrEqual(1);
}

for (const width of [360, 1280]) test(`contexto autoral e ações ficam separados da base longa em ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 850 });
  const errors = await mount(page);
  await page.getByRole("button", { name: "Fechar inspeção da explicação", exact: true }).click();
  await page.evaluate(() => {
    globalThis.__reviewFixture.probe.explanationText = "Um socket é a interface local usada pelo processo.\n\n".repeat(30);
  });
  await page.getByRole("button", { name: "Inspecionar Explicação", exact: true }).click();
  const context = dialog(page).getByRole("region", { name: "Contexto autoral", exact: true });
  const base = dialog(page).getByRole("region", { name: "Base explicativa", exact: true });
  const tools = base.locator(".course-explanation-tools");
  const content = base.locator("[data-review-explanation-content]");
  await expect(context).toContainText("Módulo › Lição › Interfaces");
  await expect(context).toContainText("Versão do curso");
  await expect(context).toContainText("Revisão autoral");
  await expect(context.locator("[contenteditable], [data-review-edit-target]")).toHaveCount(0);
  await expect(tools.getByRole("button", { name: "Fontes da explicação", exact: true })).toBeVisible();
  await expect(tools.getByRole("button", { name: "Editar explicação", exact: true })).toBeVisible();
  await expect(tools.getByRole("button", { name: /^Observações autorais de explicação/u })).toBeVisible();
  await expect(dialog(page).locator(":scope > .editor-head button")).toHaveCount(1);
  await expect(dialog(page).getByText("Debater com GPT", { exact: true })).toHaveCount(0);
  await expect(dialog(page).locator("[data-review-context=units], [data-review-unit-context]")).toHaveCount(0);
  await expect(dialog(page)).not.toContainText("O processo usa uma interface; a conexão relaciona participantes.");
  await expect(dialog(page).locator("[data-review-context=review]")).toHaveText("");
  await expect(dialog(page).locator("details.course-inspection-evidence > summary")).toHaveText("");
  const contextBox = await context.boundingBox();
  const toolbarBox = await tools.boundingBox();
  const contentBox = await content.boundingBox();
  const scrollBox = await dialog(page).locator(":scope > .editor-body").boundingBox();
  expect(contextBox.height).toBeLessThanOrEqual(80);
  await expect(context.getByText("Versão do curso", { exact: true })).not.toBeVisible();
  expect(contextBox.y + contextBox.height).toBeLessThanOrEqual(toolbarBox.y);
  expect(toolbarBox.y + toolbarBox.height).toBeLessThanOrEqual(contentBox.y);
  expect(toolbarBox.y + toolbarBox.height).toBeLessThanOrEqual(scrollBox.y + scrollBox.height);
  expect(contentBox.height).toBeGreaterThan(scrollBox.height);
  const standardWidth = await page.evaluate(() => {
    const shell = document.createElement("div"); shell.className = "app-shell";
    document.body.append(shell); const width = shell.getBoundingClientRect().width; shell.remove(); return width;
  });
  expect((await dialog(page).boundingBox()).width).toBe(standardWidth);
  for (const button of await tools.getByRole("button").all()) {
    const box = await button.boundingBox();
    expect(box.width).toBeGreaterThanOrEqual(44); expect(box.height).toBeGreaterThanOrEqual(44);
  }
  await expect(base.getByRole("heading", { name: "Referências da explicação", exact: true })).toBeAttached();
  await tools.getByRole("button", { name: "Editar explicação", exact: true }).click();
  await expect(tools.getByRole("button", { name: "Salvar explicação", exact: true })).toBeVisible();
  await expect(tools.getByRole("button", { name: "Cancelar edição", exact: true })).toBeVisible();
  expect(Math.abs((await content.boundingBox()).y - contentBox.y)).toBeLessThanOrEqual(1);
  await tools.getByRole("button", { name: "Cancelar edição", exact: true }).click();
  expect(await page.evaluate(() => globalThis.__reviewFixture.probe.calls)).toEqual([]);
  expect(errors).toEqual([]);
});

test("Autoria navega da ocorrência à bibliografia e resolve PDF por clique no snapshot inspecionado", async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 850 }); const errors = await mount(page);
  await page.getByRole("button", { name: "Fechar inspeção da explicação", exact: true }).click();
  await page.evaluate(() => { globalThis.__reviewFixture.probe.withPdf = true; });
  await page.getByRole("button", { name: "Inspecionar Explicação", exact: true }).click();
  const base = dialog(page).locator(".course-explanation-context");
  const marker = base.getByRole("button", { name: "Referência 1", exact: true });
  await expect(marker).toBeVisible();
  expect(await page.evaluate(() => globalThis.__reviewFixture.probe.pdfReads)).toEqual([]);
  await marker.tap();
  const reference = base.locator('[data-citation-reference-id="link-support-text"]');
  await expect(reference).toBeFocused();
  await expect(reference.getByRole("link", { name: "Endereço de Obra sintética sobre interfaces", exact: true })).toHaveAttribute("href", "https://example.test/reference");
  const pdf = reference.locator("button[data-action=download-citation-attachment]").first();
  expect(await pdf.evaluate(node => {
    const style = getComputedStyle(node); const prose = getComputedStyle(node.closest(".study-citation-reference"));
    return { padding: style.padding, margin: style.margin, border: style.borderWidth,
      fontSize: style.fontSize === prose.fontSize, lineHeight: style.lineHeight === prose.lineHeight };
  })).toEqual({ padding: "0px", margin: "0px", border: "0px", fontSize: true, lineHeight: true });
  await pdf.tap();
  await expect.poll(() => page.evaluate(() => globalThis.__reviewFixture.probe.openedSources.length)).toBe(1);
  expect(await page.evaluate(() => globalThis.__reviewFixture.probe.openedSources[0])).toBe("https://example.test/author-source.pdf?token=synthetic-1#page=12");
  expect(await page.evaluate(() => globalThis.__reviewFixture.probe.pdfReads[0])).toMatchObject({
    expectedCourseRevision: 7, sourceId: "source-review", sourceRevision: 1, contentHash: "a".repeat(64) });
  await reference.getByRole("button", { name: "Voltar ao trecho 1 da referência 1 na explicação", exact: true }).tap();
  await expect(marker).toBeFocused();
  await page.screenshot({ path: info.outputPath("authoring-citations-390.png") });
  expect(await page.evaluate(() => globalThis.__reviewFixture.probe.calls)).toEqual([]);
  expect(errors).toEqual([]);
});
for (const width of [360, 390, 430, 1280]) test(`inspeção completa e decisão explícita em ${width}px`, async ({ page }, info) => {
  await page.setViewportSize({ width, height: 850 }); const errors = await mount(page);
  const initialRow = await contextRow(page);
  await openReview(page);
  await expectContextRow(page, initialRow);
  const approve = page.getByRole("button", { name: "Marcar como revisado", exact: true });
  await expect(approve).toBeDisabled();
  await expect(dialog(page).locator('[aria-label="Revisão humana do conteúdo"]')).toContainText(
    "Base explicativa · Interfaces");
  await expect(dialog(page)).toContainText("Um socket é a interface local");
  await expect(dialog(page).locator("[data-review-unit-context]")).toHaveCount(0);
  await expect(dialog(page).getByRole("img", { name: "Revisão autoral pendente", exact: true })).toBeVisible();
  await page.locator("summary[data-review-context=metadata]").click();
  await expect(dialog(page)).toContainText("Distinguir interface e conexão.");
  await page.locator("summary[aria-label='Configuração solicitada e aplicada']").click();
  await expect(dialog(page).locator(".course-analytics-inspection-panel").getByText("Aplicado", { exact: true })).toBeVisible();
  await expectContextRow(page, initialRow);
  expect(await page.evaluate(() => globalThis.__reviewFixture.probe.calls)).toEqual([]);
  const box = await dialog(page).boundingBox(); expect(box.x).toBeGreaterThanOrEqual(0); expect(box.x + box.width).toBeLessThanOrEqual(width + 1);
  await openReview(page); await confirm(page).check(); await expect(approve).toBeEnabled();
  await expectContextRow(page, initialRow);
  await expect(dialog(page).locator("details.course-inspection-evidence")).toHaveAttribute("open", "");
  await page.screenshot({ path: info.outputPath(`review-${width}.png`), fullPage: true });
  await approve.click(); await expect(page.locator("[data-review-status]")).toContainText("Revisão declarada para este objeto");
  await expect(dialog(page).getByRole("img", { name: "Revisão autoral atual", exact: true })).toBeVisible();
  expect(await page.evaluate(() => globalThis.__reviewFixture.probe.calls.length)).toBe(1);
  await page.keyboard.press("Escape"); await expect(dialog(page)).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Inspecionar Explicação", exact: true })).toBeFocused(); expect(errors).toEqual([]);
});
test("edição no renderer real preserva geometria sem mudança; salvar registra intervenção separada", async ({ page }, info) => {
  const errors = await mount(page);
  const content = page.locator("[data-review-explanation-content]");
  const before = await content.boundingBox();
  await page.getByRole("button", { name: "Editar explicação", exact: true }).click();
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
  await expect(page.getByRole("button", { name: "Editar explicação", exact: true })).toBeFocused();
  await page.getByRole("button", { name: "Editar explicação", exact: true }).click();
  await field.fill("A interface local não é a conexão inteira.");
  await page.keyboard.press("Escape"); await expect(dialog(page)).toBeVisible();
  await expect(field).toHaveText("A interface local não é a conexão inteira."); await expect(field).toBeFocused();
  await page.screenshot({ path: info.outputPath("explanation-inline-edit.png"), fullPage: true });
  await page.getByRole("button", { name: "Cancelar edição" }).click();
  expect(await page.evaluate(() => globalThis.__reviewFixture.probe.calls)).toEqual([]);
  await expect(dialog(page)).toContainText("Um socket é a interface local");
  await page.getByRole("button", { name: "Editar explicação", exact: true }).click();
  await field.fill("A interface local não é a conexão inteira.");
  await page.getByRole("button", { name: "Salvar explicação", exact: true }).click();
  await expect(page.locator("[data-review-status]")).toContainText("O salvamento não declara revisão autoral");
  await expect(dialog(page)).toContainText("A interface local não é a conexão inteira.");
  await openReview(page);
  await expect(page.getByRole("button", { name: "Marcar como revisado", exact: true })).toBeDisabled();
  expect(await page.evaluate(() => globalThis.__reviewFixture.probe.calls.map(value => value.kind))).toEqual(["save"]); expect(errors).toEqual([]);
});
test("revisão incerta conserva identidade e bloqueia nova escrita", async ({ page }) => {
  const errors = await mount(page); await page.evaluate(() => { globalThis.__reviewFixture.probe.uncertain = true; });
  await openReview(page); await confirm(page).check(); await page.getByRole("button", { name: "Marcar como revisado", exact: true }).click();
  await expect(page.locator("[data-review-status]")).toContainText("Não foi possível confirmar a revisão");
  await page.keyboard.press("Escape"); await expect(dialog(page)).toBeVisible();
  await page.evaluate(() => { globalThis.__reviewFixture.probe.uncertain = false; });
  await page.getByRole("button", { name: "Confirmar resultado da mesma decisão" }).click();
  await expect(page.locator("[data-review-status]")).toContainText("Revisão declarada para este objeto");
  const calls = await page.evaluate(() => globalThis.__reviewFixture.probe.calls); expect(calls).toHaveLength(2);
  expect(calls[1].request).toEqual(calls[0].request); expect(errors).toEqual([]);
});
test("fontes recebem o alvo da Explicação e encerram a inspeção sem modal empilhado", async ({ page }) => {
  const errors = await mount(page); await page.getByRole("button", { name: "Fontes da explicação", exact: true }).click();
  await expect(dialog(page)).toHaveCount(0);
  const target = await page.evaluate(() => globalThis.__reviewFixture.probe.sources);
  expect(target.targetKind).toBe("microsequence_explanation"); expect(target.targetId).toBe("micro-review");
  expect(target.targetVersion).toBe(2); expect(target.targetExplanation.content).toHaveLength(1); expect(errors).toEqual([]);
});

test("marca e retirada da base preservam revisão compacta e reversível da unidade", async ({ page }, info) => {
  const errors = await mount(page);
  await openReview(page); await confirm(page).check(); await page.getByRole("button", { name: "Marcar como revisado", exact: true }).click();
  await expect(page.locator("[data-review-status]")).toContainText("Revisão declarada");
  await page.getByRole("button", { name: "Retirar marca de revisão", exact: true }).click();
  await expect(page.locator("[data-review-status]")).toContainText("Marca de revisão retirada deste objeto");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Revisar unidade", exact: true }).click();
  const unitDialog = page.getByRole("dialog", { name: "Revisão da unidade de estudo" });
  await expect(unitDialog.getByRole("heading", { name: "Revisão da unidade", exact: true })).toBeVisible();
  await expect(unitDialog.locator('[aria-label="Revisão humana do conteúdo"]')).toContainText("Unidade · Interface local");
  await expect(unitDialog.locator(".package-instance, [data-review-explanation-content], [data-review-observation-queue], [data-review-unit-sources]")).toHaveCount(0);
  await expect(unitDialog).not.toContainText("O processo usa uma interface; a conexão relaciona participantes.");
  await expect(unitDialog).not.toContainText("Um socket é a interface local usada pelo processo.");
  expect((await unitDialog.boundingBox()).height).toBeLessThan(page.viewportSize().height * 0.65);
  await expect(page.getByRole("button", { name: "Retirar marca de revisão", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Marcar como revisado", exact: true })).toBeDisabled();
  await confirm(page).check();
  await page.screenshot({ path: info.outputPath("unit-review-compact.png") });
  await page.getByRole("button", { name: "Marcar como revisado", exact: true }).click();
  await expect(page.locator("[data-review-status]")).toContainText("Revisão declarada");
  await page.getByRole("button", { name: "Retirar marca de revisão", exact: true }).click();
  await expect(page.locator("[data-review-status]")).toContainText("Marca de revisão retirada deste objeto");
  const calls = await page.evaluate(() => globalThis.__reviewFixture.probe.calls.map(value => value.request));
  expect(calls.map(value => [value.targetKind, value.targetId, value.reviewed])).toEqual([
    ["microsequence_explanation", "micro-review", true], ["microsequence_explanation", "micro-review", false],
    ["study_unit", "unit-theory", true], ["study_unit", "unit-theory", false]
  ]);
  expect(new Set(calls.map(value => value.requestId)).size).toBe(4);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Revisar unidade", exact: true })).toBeFocused();
  expect(errors).toEqual([]);
});
test("revisão desatualizada identifica a versão sem aplicar uma nova marca", async ({ page }) => {
  const errors = await mount(page);
  await page.keyboard.press("Escape");
  await page.evaluate(() => {
    globalThis.__reviewFixture.probe.reviews["microsequence_explanation:micro-review"] = {
      state: "stale", reviewedAt: "2026-09-09T12:00:00Z"
    };
  });
  await page.getByRole("button", { name: "Inspecionar Explicação", exact: true }).click();
  await openReview(page);
  await expect(dialog(page).getByRole("img", { name: "Revisão autoral desatualizada", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Marcar como revisado", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Retirar marca de revisão", exact: true })).toBeEnabled();
  expect(await page.evaluate(() => globalThis.__reviewFixture.probe.calls)).toEqual([]);
  expect(errors).toEqual([]);
});

test("fontes da explicação abrem o alvo salvo e conservam retorno contextual e foco", async ({ page }) => {
  const errors = await mount(page);
  await expect(page.getByRole("button", { name: "Fechar inspeção da explicação" })).toBeFocused();
  await expect(dialog(page).getByRole("heading", { name: "Referências da explicação", exact: true })).toBeAttached();
  await expect(dialog(page).locator("[data-review-unit-context]")).toHaveCount(0);
  expect(await page.evaluate(() => globalThis.__reviewFixture.probe.calls)).toEqual([]);
  await openReview(page); await confirm(page).check(); await expect(confirm(page)).toBeFocused();
  await page.keyboard.press("Tab"); await expect(page.getByRole("button", { name: "Marcar como revisado", exact: true })).toBeFocused();
  await page.getByRole("button", { name: "Fontes da explicação", exact: true }).click();
  await expect(dialog(page)).toHaveCount(0);
  const target = await page.evaluate(() => globalThis.__reviewFixture.probe.sources);
  expect(target.targetKind).toBe("microsequence_explanation"); expect(target.targetId).toBe("micro-review"); expect(target.targetVersion).toBe(2);
  expect(target.targetExplanation.content[0].data.text).toContain("Um socket é a interface local");
  await expect(page.getByRole("button", { name: "Inspecionar Explicação", exact: true })).toBeFocused(); expect(errors).toEqual([]);
});

test("fila da Explicação acumula, reabre, edita versão e reflete consumo sem declarar revisão", async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 850 }); const errors = await mount(page);
  const trigger = page.getByRole("button", { name: /^Observações autorais de explicação/u });
  await expect(trigger).toHaveAccessibleName("Observações autorais de explicação · Interfaces, 0 pendentes");
  await expect(trigger.locator(".course-authoring-observation-count")).toHaveCount(0);
  await expectObservationIcon(trigger, page.getByRole("button", { name: "Editar explicação", exact: true }));
  await trigger.click();
  const textbox = page.locator("[data-author-queue-text]");
  const add = page.getByRole("button", { name: "Adicionar observação", exact: true });
  await textbox.fill("Explicitar o pressuposto do exemplo."); await add.click();
  await expect(page.locator(".course-authoring-observation-entries li")).toHaveCount(1);
  await textbox.fill("Relacionar o argumento à fonte."); await add.click();
  await expect(page.locator(".course-authoring-observation-entries li")).toHaveCount(2);
  await expect(trigger).toHaveAccessibleName("Observações autorais de explicação · Interfaces, 2 pendentes");
  await expect(trigger.locator(".course-authoring-observation-count")).toHaveText("2");
  await expectObservationIcon(trigger, page.getByRole("button", { name: "Editar explicação", exact: true }));
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

test("badge da unidade preserva ícone centralizado com zero e com observações pendentes", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 850 });
  const errors = await mount(page);
  await page.getByRole("button", { name: "Fechar inspeção da explicação", exact: true }).click();
  await page.evaluate(async () => {
    const { createCourseInspectionSequence } = await import("/src/ui/CourseInspectionSequence.js");
    const { controller, probe } = globalThis.__reviewFixture;
    const document = (await controller.exportCourseAuthoring()).artifact.document;
    const course = document.courses[0], module = course.modules[0], lesson = module.lessons[0], micro = lesson.microsequences[0];
    const state = { count: 0 };
    controller.loadAuthoringStudyUnits = async (_courseId, options) => ({
      contract: "aralearn.course-study-unit-inspection-page.v2", courseId: course.id, courseRevision: probe.revision,
      scope: options.scope, totalCount: 1, scopeOptions: { authoringParts: [], unassignedStudyUnitCount: 1 },
      items: [{ studyUnit: micro.studyUnits[0], version: 1, updatedAt: "2026-09-11T12:00:00Z", ordinal: 1,
        curriculumPath: { module: { id: module.id, position: 0, title: module.title },
          lesson: { id: lesson.id, position: 0, title: lesson.title },
          didacticMicrosequence: { id: micro.id, position: 0, title: micro.title } },
        authoringPart: null, authorship: { createdOrigin: "gpt", lastRevisionOrigin: "gpt", design: { application: null } },
        pendingAuthoringObservationCount: state.count,
        deepLink: `#/authoring/courses/${course.id}?section=content&studyUnitId=${micro.studyUnits[0].id}` }],
      hasPrevious: false, hasMore: false, previousCursor: null, nextCursor: null, pageBytes: 2048,
      offline: false, stale: false, offlineKnown: false, readFailure: null
    });
    window.document.querySelector("#app-root").style.display = "block";
    const inspectionRoot = window.document.querySelector("#inspection-root");
    inspectionRoot.className = "app-shell course-authoring-root";
    const sequence = createCourseInspectionSequence({ root: inspectionRoot, controller,
      course: { courseId: course.id, revision: probe.revision, ownership: "owned", canEdit: true },
      onOpenParameters() {}, onEditContent() {}, onSaveManualEdit() {} });
    globalThis.__unitBadgeFixture = { state, sequence, revision: probe.revision };
    await sequence.open();
  });
  const trigger = page.locator("[data-inspection-observations]");
  const peer = page.locator("[data-inspection-open-parameters]").first();
  await expect(trigger).toHaveAccessibleName("Observações de Interface local, 0 pendentes");
  await expect(trigger.locator(".course-inspection-observation-count")).toHaveCount(0);
  await expectObservationIcon(trigger, peer);
  await page.evaluate(async () => {
    const fixture = globalThis.__unitBadgeFixture; fixture.state.count = 2; await fixture.sequence.refresh(fixture.revision);
  });
  await expect(trigger).toHaveAccessibleName("Observações de Interface local, 2 pendentes");
  await expect(trigger.locator(".course-inspection-observation-count")).toHaveText("2");
  await expectObservationIcon(trigger, peer);
  await trigger.focus(); await expect(trigger).toBeFocused();
  await expect(trigger).toHaveAttribute("title", "Observações autorais pendentes");
  expect(errors).toEqual([]);
});

test("fila preserva rascunho em resposta tardia e reconcilia envio perdido sem repetir", async ({ page }) => {
  const errors = await mount(page);
  const trigger = page.getByRole("button", { name: /^Observações autorais de explicação/u });
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
  await expect(dialog(page).locator("[data-review-context=units], [data-review-unit-context]")).toHaveCount(0);
  await expect(dialog(page).getByRole("button", { name: "Editar explicação", exact: true })).toBeVisible();
  await openReview(page); await confirm(page).check(); await page.getByRole("button", { name: "Marcar como revisado", exact: true }).click();
  await expect(page.locator("[data-review-status]")).toContainText("Revisão declarada para este objeto");
  await page.screenshot({ path: info.outputPath("explanation-before-units.png"), fullPage: true });
  await page.keyboard.press("Escape"); await expect(dialog(page)).toHaveCount(0);
  await expect(trigger).toBeFocused();
  expect(await page.evaluate(() => globalThis.__reviewFixture.probe.calls.map(value => [value.kind, value.request.targetKind])))
    .toEqual([["review", "microsequence_explanation"]]);
  expect(errors).toEqual([]);
});
