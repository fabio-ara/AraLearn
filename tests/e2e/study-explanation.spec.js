import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

async function mount(page, query = "") {
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  // Somente arquivos de fixture: mantém este teste executável também com .pages,
  // onde a galeria de desenvolvimento não é publicada.
  for (const [url, file, contentType] of [
    ["**/tests/gallery/study-explanation.html*", "../gallery/study-explanation.html", "text/html"],
    ["**/tests/support/studyExplanationFixture.js", "../support/studyExplanationFixture.js", "text/javascript"],
    ["**/tests/fixtures/package/project-minimal.json", "../fixtures/package/project-minimal.json", "application/json"]
  ]) await page.route(url, route => route.fulfill({ status: 200, contentType,
    body: readFileSync(new URL(file, import.meta.url), "utf8") }));
  await page.goto(`/tests/gallery/study-explanation.html${query}`);
  await expect.poll(() => page.evaluate(() => globalThis.__EXPLANATION_FIXTURE_READY__ === true)).toBe(true);
  expect(errors).toEqual([]);
  return errors;
}
const openButton = page => page.getByRole("button", { name: "Explicação", exact: true });
const overlay = page => page.getByRole("dialog", { name: "Explicação", exact: true });

for (const width of [360, 390, 430, 1280]) {
  test(`apoio em ${width}px conserva prática, foco, rolagem e progresso`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 850 });
    const errors = await mount(page, `?unit=practice&theme=${width === 390 ? "dark" : "light"}`);
    const answer = page.getByRole("textbox", { name: "Explique a diferença com suas palavras." });
    await answer.fill("Resposta ainda não enviada: a interface local tem um papel específico.");
    const before = await page.locator(".card-sheet-content").evaluate(node => node.scrollTop);
    await openButton(page).focus(); await page.keyboard.press("Enter");
    await expect(overlay(page)).toBeVisible();
    await expect(page.getByRole("button", { name: "Fechar explicação", exact: true })).toBeFocused();
    await expect(page.locator(".study-explanation-body > h3")).toContainText("Processos, interfaces e transporte");
    await expect(page.locator(".study-explanation-body table")).toBeVisible();
    expect(await page.locator(".app-shell > .screen").evaluate(node => node.inert)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    const panelBox = await overlay(page).boundingBox();
    expect(panelBox.x).toBeGreaterThanOrEqual(0); expect(panelBox.x + panelBox.width).toBeLessThanOrEqual(width + 1);
    const beforeActions = await page.locator("[data-action='open-explanation']").evaluate(node => ({ width: node.getBoundingClientRect().width, height: node.getBoundingClientRect().height }));
    expect(beforeActions.width).toBeGreaterThanOrEqual(43); expect(beforeActions.height).toBeGreaterThanOrEqual(43);
    await page.locator(".study-explanation-body").evaluate(node => { node.scrollTop = 240; });
    await page.screenshot({ path: testInfo.outputPath(`explanation-${width}.png`), fullPage: true });
    await page.keyboard.press("Escape");
    await expect(overlay(page)).toHaveCount(0); await expect(openButton(page)).toBeFocused();
    await expect(answer).toHaveValue("Resposta ainda não enviada: a interface local tem um papel específico.");
    expect(Math.abs(await page.locator(".card-sheet-content").evaluate(node => node.scrollTop) - before)).toBeLessThanOrEqual(1);
    expect(await page.evaluate(() => globalThis.__explanationFixture.probe.completions)).toEqual([]);
    await openButton(page).click();
    expect(await page.locator(".study-explanation-body").evaluate(node => node.scrollTop)).toBe(240);
    await page.getByRole("button", { name: "Fechar explicação", exact: true }).click();
    await page.evaluate(() => globalThis.__explanationFixture.openUnit("theory"));
    await openButton(page).click();
    await expect(page.locator(".study-explanation-body > h3")).toContainText("Processos, interfaces e transporte");
    expect(await page.evaluate(() => globalThis.__explanationFixture.probe.completions)).toEqual([]);
    expect(errors).toEqual([]);
  });
}

test("referência no fim da explicação abre PDF e retorna à ocorrência sem ocultar a leitura", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 }); await mount(page);
  await openButton(page).tap();
  const marker = overlay(page).getByRole("button", { name: "Referência 1", exact: true }).first();
  await expect(marker).toBeVisible(); await marker.tap();
  const reference = overlay(page).locator('[data-citation-reference-id="support-link"]');
  await expect(reference).toBeFocused();
  await expect(overlay(page).locator('.study-explanation-body > h3')).toBeAttached();
  await expect(overlay(page).locator('.study-explanation-reading')).not.toHaveAttribute('hidden');
  await expect(page.getByRole("dialog")).toHaveCount(1);
  await expect(reference).toContainText("Mecanismo · p. 3");
  await page.locator('[data-action="download-citation-attachment"][title="Abrir Fonte sintética do mecanismo em p. 3"]').tap();
  await expect.poll(() => page.evaluate(() => globalThis.__explanationFixture.probe.opened.length)).toBe(1);
  expect(await page.evaluate(() => globalThis.__explanationFixture.probe.opened[0])).toBe("https://example.test/synthetic.pdf?token=fixture-1#page=3");
  expect(await page.evaluate(() => globalThis.__explanationFixture.probe.downloads[0].reference.targetKind)).toBe("microsequence_explanation");
  await page.screenshot({ path: testInfo.outputPath("explanation-sources-390.png") });
  await reference.getByRole('button', { name: 'Voltar ao trecho 1 da referência 1 na explicação', exact: true }).tap();
  await expect(marker).toBeFocused();
  await expect(page.getByRole('button', { name: 'Fontes da explicação', exact: true })).toHaveCount(0);
  await page.keyboard.press("Escape"); await expect(openButton(page)).toBeFocused();
});

test("referências distinguem retornos múltiplos em 320px com texto 200%", async ({ page }, info) => {
  await page.setViewportSize({ width: 320, height: 700 }); await mount(page, "?theme=dark&unit=practice");
  await page.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
  await openButton(page).tap();
  const markers = overlay(page).getByRole("button", { name: "Referência 1", exact: true });
  await expect(markers).toHaveCount(2);
  await markers.nth(1).tap();
  const reference = overlay(page).locator('[data-citation-reference-id="support-link"]');
  await expect(reference).toBeFocused();
  await reference.getByRole("button", { name: "Voltar ao trecho 2 da referência 1 na explicação", exact: true }).tap();
  await expect(markers.nth(1)).toBeFocused();
  await markers.first().tap();
  await reference.getByRole("button", { name: "Voltar ao trecho 1 da referência 1 na explicação", exact: true }).tap();
  await expect(markers.first()).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
  const close = page.getByRole("button", { name: "Fechar explicação", exact: true });
  const closeBox = await close.boundingBox();
  const titleBox = await overlay(page).getByRole("heading", { name: "Explicação", exact: true }).boundingBox();
  expect(closeBox.x).toBeGreaterThan(titleBox.x);
  await page.screenshot({ path: info.outputPath("explanation-citations-320-text200.png") });
  await close.tap(); await expect(openButton(page)).toBeFocused();
});

test("acervo sem base mantém fontes existentes na folha proporcional ao conteúdo", async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 }); await mount(page, "?state=missing");
  await expect(page.getByRole("button", { name: "Fontes", exact: true })).toHaveCount(0);
  await openButton(page).tap();
  await expect(overlay(page)).toContainText("Esta microssequência ainda não tem explicação");
  const source = overlay(page).locator('[data-citation-reference-id="support-link"]');
  await expect(source).toContainText("Fonte sintética do mecanismo");
  await expect(source.getByRole("button", { name: /Voltar ao trecho/u })).toHaveCount(0);
  await source.locator('[data-action="download-citation-attachment"][title="Abrir Fonte sintética do mecanismo em p. 3"]').tap();
  await expect.poll(() => page.evaluate(() => globalThis.__explanationFixture.probe.opened.length)).toBe(1);
  await page.screenshot({ path: info.outputPath("legacy-references-390.png") });
  await page.keyboard.press("Escape"); await expect(openButton(page)).toBeFocused();
  expect(await page.evaluate(() => globalThis.__explanationFixture.probe.completions)).toEqual([]);
});

test("apoio ausente, rascunho, offline e erro têm estados explícitos", async ({ page }) => {
  for (const [state, message] of [["missing", "Esta microssequência ainda não tem explicação"],
    ["draft", "Conteúdo salvo sem revisão autoral declarada"], ["error", "A explicação desta cópia está indisponível"]]) {
    await mount(page, `?state=${state}`); await openButton(page).click();
    await expect(overlay(page)).toContainText(message);
    if (state === "error") await expect(overlay(page).getByRole("alert")).toHaveCount(1);
    await page.keyboard.press("Escape"); await expect(openButton(page)).toBeFocused();
  }
  await mount(page, "?state=offline"); await openButton(page).click();
  await expect(page.locator(".study-explanation-body > h3")).toContainText("Processos, interfaces e transporte");
  await overlay(page).locator(".study-bibliography").first().scrollIntoViewIfNeeded();
  await expect(overlay(page)).toContainText("Fonte sintética do mecanismo");
  await page.locator('[data-action="download-citation-attachment"][title="Abrir Fonte sintética do mecanismo em p. 3"]').click();
  await expect(overlay(page)).toContainText("este PDF externo precisa de conexão");
  expect(await page.evaluate(() => globalThis.__explanationFixture.probe.opened)).toEqual([]);
});

test("mudança de conexão conserva overlay, foco e resposta pendente", async ({ page }) => {
  await mount(page, "?unit=practice");
  const answer = page.getByRole("textbox", { name: "Explique a diferença com suas palavras." });
  await answer.fill("Minha resposta pendente permanece aqui.");
  await openButton(page).click();
  await page.locator(".study-explanation-body").evaluate(node => { node.scrollTop = 180; });
  await page.getByRole("button", { name: "Fechar explicação", exact: true }).focus();
  expect(await page.locator(".study-explanation-body").evaluate(node => node.scrollTop)).toBe(180);
  await page.evaluate(() => {
    globalThis.__explanationFixture.probe.offline = true;
    globalThis.__explanationFixture.app.setOfflineStatus(true);
  });
  await expect(overlay(page)).toBeVisible();
  await expect(page.getByRole("button", { name: "Fechar explicação", exact: true })).toBeFocused();
  expect(await page.locator(".study-explanation-body").evaluate(node => node.scrollTop)).toBe(180);
  await page.keyboard.press("Escape"); await expect(answer).toHaveValue("Minha resposta pendente permanece aqui.");
  expect(await page.evaluate(() => globalThis.__explanationFixture.probe.completions)).toEqual([]);
});

test("ferramentas condicionais usam o grupo existente e altura reduzida mantém controles acessíveis", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 360, height: 500 }); await mount(page, "?unit=practice&theme=dark");
  await openButton(page).click();
  const tools = overlay(page).getByRole("button", { name: "Ferramentas da unidade", exact: true });
  await expect(tools).toBeVisible(); await tools.click();
  await expect(page.getByRole("dialog", { name: "Ferramentas", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Calculadora Compare a estimativa com o cálculo", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Calculadora", exact: true })).toBeVisible();
  const input = page.getByRole("textbox", { name: "Expressão", exact: true });
  await expect(input).toBeVisible(); await input.fill("2 + 3"); await page.keyboard.press("Enter");
  await page.getByRole("button", { name: "Fechar ferramenta", exact: true }).click();
  await expect(overlay(page)).toBeVisible(); await expect(tools).toBeFocused();
  await page.evaluate(() => { document.documentElement.style.fontSize = "150%"; });
  const close = page.getByRole("button", { name: "Fechar explicação", exact: true });
  await expect(close).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
  const last = overlay(page).locator("button").last(); await last.focus(); await page.keyboard.press("Tab");
  await expect(close).toBeFocused();
  await page.screenshot({ path: testInfo.outputPath("explanation-360-short-text150.png"), fullPage: true });
  await page.keyboard.press("Escape"); await expect(openButton(page)).toBeFocused();
});

test("apoio offline em 360x500 e texto150 alcança fim, tabela e fontes por toque e teclado", async ({ page }, info) => {
  await page.setViewportSize({ width: 360, height: 500 });
  await mount(page, "?unit=practice&state=offline&theme=dark");
  await page.evaluate(() => { document.documentElement.style.fontSize = "150%"; });
  await openButton(page).tap();
  const body = page.locator('.study-explanation-body');
  const close = page.getByRole('button', { name: 'Fechar explicação', exact: true });
  await expect(close).toBeFocused();
  const frame = await body.boundingBox();
  const touch = await page.context().newCDPSession(page);
  await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: frame.x + 40, y: frame.y + frame.height - 30 }] });
  await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: frame.x + 40, y: frame.y + 30 }] });
  await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await touch.detach();
  await expect.poll(() => body.evaluate(node => node.scrollTop)).toBeGreaterThan(0);
  await body.focus(); await page.keyboard.press('Control+End');
  await expect.poll(() => body.evaluate(node => node.scrollHeight - node.clientHeight - node.scrollTop)).toBeLessThanOrEqual(2);
  const lastLine = body.locator('[data-package-instance-id="selective-7"] p');
  await lastLine.evaluate(node => node.scrollIntoView({ block: "end" }));
  const lastRect = await lastLine.evaluate(node => {
    const range = document.createRange(); range.selectNodeContents(node);
    const rects = [...range.getClientRects()]; return rects[rects.length - 1].toJSON();
  });
  const tools = await page.locator('.study-explanation-tools').boundingBox();
  expect(lastRect.bottom).toBeLessThanOrEqual(tools.y + 1);
  expect(lastRect.top).toBeGreaterThanOrEqual(frame.y);
  await page.screenshot({ path: info.outputPath('support-last-line-360-short-text150.png') });
  const lastCell = body.locator('table tbody tr').last().locator('td').last();
  await lastCell.scrollIntoViewIfNeeded();
  const cell = await lastCell.boundingBox();
  expect(cell.y).toBeGreaterThanOrEqual(frame.y - 1);
  expect(cell.y + cell.height).toBeLessThanOrEqual(tools.y + 1);
  expect(cell.x + cell.width).toBeLessThanOrEqual(360);
  await page.screenshot({ path: info.outputPath('support-table-last-cell-360-short-text150.png') });
  await overlay(page).locator(".study-bibliography").first().scrollIntoViewIfNeeded();
  await expect(page.getByRole('dialog')).toHaveCount(1);
  const pdf = page.locator('[data-action="download-citation-attachment"][title="Abrir Fonte sintética do mecanismo em p. 3"]');
  await pdf.tap(); await expect(overlay(page)).toContainText('este PDF externo precisa de conexão');
  const unavailable = overlay(page).getByRole('alert');
  await unavailable.scrollIntoViewIfNeeded();
  const errorBox = await unavailable.boundingBox();
  expect(errorBox.y).toBeGreaterThanOrEqual(frame.y - 1);
  expect(errorBox.y + errorBox.height).toBeLessThanOrEqual(488);
  await page.screenshot({ path: info.outputPath('support-sources-offline-360-short-text150.png') });
  await close.focus(); await page.keyboard.press('Enter');
  await expect(openButton(page)).toBeFocused();
  expect(await page.evaluate(() => globalThis.__explanationFixture.probe.completions)).toEqual([]);
});

async function expandedDiagram(page) {
  await page.setViewportSize({ width: 390, height: 844 });
  await mount(page, "?unit=practice");
  await page.getByRole("textbox", { name: "Explique a diferença com suas palavras." }).fill("Minha resposta antes do diagrama.");
  await openButton(page).click();
  const expand = page.getByRole("button", { name: "Explorar diagrama em tela inteira", exact: true });
  await expect(expand).toBeEnabled(); await expand.click();
  const dialog = page.getByRole("dialog", { name: "Diagrama em tela inteira", exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Voltar à explicação", exact: true })).toBeVisible();
  await expect(dialog).not.toContainText("Explique a diferença com suas palavras.");
  await expect(dialog).toContainText("Hub Ethernet"); await expect(dialog).toContainText("Repetidor");
  expect(await dialog.evaluate(node => node.matches(":modal"))).toBe(true);
  return dialog;
}

test("diagrama expandido retorna ao apoio por Escape e preserva a prática", async ({ page }, testInfo) => {
  const diagram = await expandedDiagram(page);
  await page.screenshot({ path: testInfo.outputPath("explanation-diagram-390.png"), fullPage: true });
  await page.keyboard.press("Escape"); await expect(diagram).not.toBeVisible();
  await expect(overlay(page)).toBeVisible();
  await page.keyboard.press("Escape"); await expect(overlay(page)).toHaveCount(0);
  await expect(openButton(page)).toBeFocused();
  await expect(page.getByRole("textbox", { name: "Explique a diferença com suas palavras." })).toHaveValue("Minha resposta antes do diagrama.");
});

test("interrupção com diagrama expandido conserva modalidade e retorno em duas etapas", async ({ page }) => {
  const diagram = await expandedDiagram(page);
  const canvas = diagram.locator(".package-system-diagram-canvas");
  const svg = canvas.locator("svg");
  const initialScale = await svg.getAttribute("data-diagram-scale");
  await diagram.getByRole("button", { name: "Aumentar zoom", exact: true }).click();
  await expect(svg).not.toHaveAttribute("data-diagram-scale", initialScale);
  await canvas.evaluate(node => { node.scrollTop = 70; node.scrollLeft = 50; });
  const selectedScale = await svg.getAttribute("data-diagram-scale");
  const selectedPan = await canvas.evaluate(node => ({ x: node.scrollLeft, y: node.scrollTop }));
  expect(selectedPan.x + selectedPan.y).toBeGreaterThan(0);
  await diagram.getByRole("button", { name: "Voltar à explicação", exact: true }).focus();
  await page.evaluate(() => {
    globalThis.__explanationFixture.probe.offline = true;
    globalThis.__explanationFixture.app.setOfflineStatus(true);
  });
  await expect(diagram).toBeVisible();
  expect(await diagram.evaluate(node => node.matches(":modal"))).toBe(true);
  await expect(svg).toHaveAttribute("data-diagram-scale", selectedScale);
  expect(await canvas.evaluate(node => ({ x: node.scrollLeft, y: node.scrollTop }))).toEqual(selectedPan);
  await expect(diagram.getByRole("button", { name: "Voltar à explicação", exact: true })).toBeFocused();
  await page.keyboard.press("Escape"); await expect(diagram).not.toBeVisible();
  await expect(overlay(page)).toBeVisible();
  await page.keyboard.press("Escape"); await expect(overlay(page)).toHaveCount(0);
  await expect(page.getByRole("textbox", { name: "Explique a diferença com suas palavras." })).toHaveValue("Minha resposta antes do diagrama.");
});
