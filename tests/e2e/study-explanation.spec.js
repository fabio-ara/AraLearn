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
  test(`apoio em ${width}px conserva seleção múltipla pendente, foco, rolagem e progresso`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 850 });
    const errors = await mount(page, `?unit=practice&theme=${width === 390 ? "dark" : "light"}`);
    const answer = page.locator('[data-action="choice-toggle"][data-choice-option-id="local"]');
    await answer.click();
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
    await expect(answer).toHaveAttribute("aria-checked", "true");
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

// Conteúdo consecutivo de prosa, tabela e visual: a Explicação recebe o mesmo ritmo
// da Unidade de estudo, sem margem por host nem espaço vazio antes do primeiro recurso.
for (const width of [320, 390, 430, 1280]) {
  test(`recursos consecutivos da Explicação mantêm o ritmo compartilhado em ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 850 });
    const errors = await mount(page);
    await openButton(page).click();
    const body = page.locator(".study-explanation-body");
    await expect(body.locator(":scope > .runtime-resource-stack")).toHaveCount(1);
    const measured = await body.evaluate(node => {
      const stack = node.querySelector(":scope > .runtime-resource-stack");
      const resources = [...stack.children].filter(child => child.matches(".package-instance"));
      const isProse = resource => resource.matches(":has(> .runtime-block.runtime-paragraph-block)");
      const rects = resources.map(resource => resource.getBoundingClientRect());
      return { count: resources.length,
        gaps: rects.slice(1).map((rect, index) => ({ size: rect.top - rects[index].bottom,
          prose: isProse(resources[index]) && isProse(resources[index + 1]) })),
        leading: rects[0].top - node.querySelector(":scope > h3").getBoundingClientRect().bottom,
        overflow: node.scrollWidth - node.clientWidth };
    });
    expect(measured.count).toBeGreaterThanOrEqual(2);
    // Prosa vizinha ganha o degrau de seção; recursos de naturezas diferentes mantêm
    // o ritmo compacto da pilha compartilhada pela Unidade de estudo e pela Explicação.
    expect(measured.gaps.some(({ prose }) => prose)).toBe(true);
    for (const gap of measured.gaps) {
      if (gap.prose) { expect(gap.size).toBeGreaterThanOrEqual(15); expect(gap.size).toBeLessThanOrEqual(17); }
      else { expect(gap.size).toBeGreaterThanOrEqual(7); expect(gap.size).toBeLessThanOrEqual(9); }
    }
    expect(measured.leading).toBeGreaterThanOrEqual(11); expect(measured.leading).toBeLessThanOrEqual(13);
    expect(measured.overflow).toBeLessThanOrEqual(1);
    const table = body.locator('[data-package-instance-id="comparison"] .runtime-table-wrap');
    await expect(table).toHaveCount(1);
    expect(await table.evaluate(node => getComputedStyle(node).overflowX)).toBe("auto");
    await page.screenshot({ path: testInfo.outputPath(`explanation-resource-rhythm-${width}.png`), fullPage: true });
    await expect(page.getByRole("button", { name: "Fechar explicação", exact: true })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(overlay(page)).toHaveCount(0); await expect(openButton(page)).toBeFocused();
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
  await expect(source.getByRole("button", {
    name: "Autoria sintética. Referência local para inspeção da interface. 2026.", exact: true
  })).toBeVisible();
  await expect(source.getByRole("button", { name: /Voltar ao trecho/u })).toHaveCount(0);
  await source.locator('[data-action="download-citation-attachment"][title="Abrir Fonte sintética do mecanismo em p. 3"]').tap();
  await expect.poll(() => page.evaluate(() => globalThis.__explanationFixture.probe.opened.length)).toBe(1);
  await page.screenshot({ path: info.outputPath("legacy-references-390.png") });
  await page.keyboard.press("Escape"); await expect(openButton(page)).toBeFocused();
  expect(await page.evaluate(() => globalThis.__explanationFixture.probe.completions)).toEqual([]);
});

test("apoio ausente, offline e erro têm estados explícitos", async ({ page }) => {
  for (const [state, message] of [["missing", "Esta microssequência ainda não tem explicação"],
    ["error", "A explicação desta cópia está indisponível"]]) {
    await mount(page, `?state=${state}`); await openButton(page).click();
    await expect(overlay(page)).toContainText(message);
    if (state === "error") await expect(overlay(page).getByRole("alert")).toHaveCount(1);
    await page.keyboard.press("Escape"); await expect(openButton(page)).toBeFocused();
  }
  await mount(page, "?state=offline"); await openButton(page).click();
  await expect(page.locator(".study-explanation-body > h3")).toContainText("Processos, interfaces e transporte");
  await overlay(page).locator(".study-bibliography").first().scrollIntoViewIfNeeded();
  await expect(overlay(page).getByRole("button", {
    name: "Autoria sintética. Referência local para inspeção da interface. 2026.", exact: true
  })).toBeVisible();
  await page.locator('[data-action="download-citation-attachment"][title="Abrir Fonte sintética do mecanismo em p. 3"]').click();
  await expect(overlay(page)).toContainText("este PDF externo precisa de conexão");
  expect(await page.evaluate(() => globalThis.__explanationFixture.probe.opened)).toEqual([]);
});

for (const width of [390, 1280]) for (const state of ["draft", "current", "stale", "unregistered"]) {
  test(`D014/O007: Explicação não expõe workflow autoral ${state} em ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 844 });
    await mount(page, `?state=${state}`);
    await openButton(page).click();
    await expect(page.locator(".study-explanation-body > h3"))
      .toContainText("Processos, interfaces e transporte");
    await expect(overlay(page)).toContainText("é um programa em execução");
    await expect(overlay(page)).not.toContainText(/revisão autoral|A autoria precisa revisá-lo|Revisado pela autoria|A revisão deste conteúdo/iu);
    await expect(overlay(page).locator(".study-explanation-review")).toHaveCount(0);
    if (state === "draft") await page.screenshot({ path: info.outputPath(`explicacao-sem-workflow-${width}.png`), fullPage: true });
    await page.keyboard.press("Escape");
    await expect(openButton(page)).toBeFocused();
  });
}

test("mudança de conexão conserva overlay, foco e resposta pendente", async ({ page }) => {
  await mount(page, "?unit=practice");
  const answer = page.locator('[data-action="choice-toggle"][data-choice-option-id="local"]');
  await answer.click();
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
  await page.keyboard.press("Escape"); await expect(answer).toHaveAttribute("aria-checked", "true");
  expect(await page.evaluate(() => globalThis.__explanationFixture.probe.completions)).toEqual([]);
});

// Ferramentas reais a partir da Unidade e da Explicação: o parágrafo explicativo não
// prova o renderer da ferramenta. Cada caso abre o painel da ferramenta, opera e fecha
// devolvendo o foco ao acionador do próprio host, sem bloquear o caminho de estudo.
const toolWidths = [320, 390, 430, 1280];
const toolGroup = host => host.getByRole("button", { name: "Ferramentas da unidade", exact: true });
const toolMenu = page => page.getByRole("dialog", { name: "Ferramentas", exact: true });

async function openToolPanel(page, host, toolId) {
  const group = toolGroup(host);
  await expect(group).toBeVisible(); await group.click();
  await expect(toolMenu(page)).toBeVisible();
  await toolMenu(page).locator(`[data-open-study-tool="${toolId}"]`).click();
  await expect(toolMenu(page)).toHaveCount(0);
  return group;
}

async function closeToolPanel(page, group, hostName) {
  const close = page.getByRole("button", { name: "Fechar ferramenta", exact: true });
  // O controle do cabeçalho precisa estar visível e alcançável sem rolagem: o painel
  // é o mesmo em qualquer ferramenta, e o clique real pode cair em outro elemento.
  await expect(close).toBeVisible();
  const reachable = await close.evaluate((node) => {
    const box = node.getBoundingClientRect();
    const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
    return Boolean(hit && (hit === node || node.contains(hit)));
  });
  expect(reachable, "Fechar ferramenta alcançável sem rolagem").toBe(true);
  await close.click();
  await expect(page.locator(".study-tools-overlay")).toHaveCount(0);
  await expect(group).toBeFocused();
  // O caminho de estudo continua disponível no host de origem.
  if (hostName === "explicacao") await expect(overlay(page)).toBeVisible();
  else await expect(page.locator(".card-sheet-content")).toBeVisible();
}

async function openHostScope(page, hostName) {
  if (hostName === "explicacao") {
    await openButton(page).click();
    await expect(overlay(page)).toBeVisible();
    return overlay(page).locator(".study-explanation-tools");
  }
  return page.locator(".study-reader-footer");
}

for (const [hostName, hostLabel] of [["unidade", "Unidade"], ["explicacao", "Explicação"]]) {
  test(`ferramenta real: calculadora opera 2 + 3 = 5 na ${hostLabel} e devolve o foco`, async ({ page }, testInfo) => {
    for (const width of toolWidths) {
      await page.setViewportSize({ width, height: 844 });
      const errors = await mount(page, "?unit=theory");
      const host = await openHostScope(page, hostName);
      const group = await openToolPanel(page, host, "calculator");
      const panel = page.getByRole("dialog", { name: "Calculadora", exact: true });
      await expect(panel).toBeVisible();
      const input = panel.getByRole("textbox", { name: "Expressão", exact: true });
      await input.fill("2 + 3"); await page.keyboard.press("Enter");
      const output = panel.locator("[data-calculator-output]");
      await expect(output).toHaveText("5");
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
      if (width === 320 || width === 390) {
        await page.screenshot({ path: testInfo.outputPath(`tool-calculadora-${hostName}-${width}.png`), fullPage: true });
      }
      await closeToolPanel(page, group, hostName);
      expect(errors).toEqual([]);
    }
  });

  test(`ferramenta real: áudio abre player com estado explícito na ${hostLabel}`, async ({ page }, testInfo) => {
    for (const width of toolWidths) {
      await page.setViewportSize({ width, height: 844 });
      const errors = await mount(page, "?unit=theory&audio=1");
      const host = await openHostScope(page, hostName);
      const group = await openToolPanel(page, host, "audio");
      const panel = page.getByRole("dialog", { name: "Áudio", exact: true });
      await expect(panel).toBeVisible();
      const track = panel.locator('[data-audio-track="synthetic-native-notice"]');
      await expect(track.getByRole("heading", { name: "Aviso sintético em português", exact: true })).toBeVisible();
      const play = track.getByRole("button", { name: "Reproduzir Aviso sintético em português", exact: true });
      const stop = track.getByRole("button", { name: "Parar Aviso sintético em português", exact: true });
      await expect(play).toBeVisible();
      await expect(stop).toBeVisible();
      // Prova de interface: controles configurados e estado explícito, sem acionar fala.
      // A prova não exige voz, síntese nem hardware de áudio.
      await expect(play).toBeEnabled();
      await expect(stop).toBeDisabled();
      await expect(track.locator("[data-audio-duration]")).toHaveText(/desconhecida/i);
      await expect(track.locator("[data-audio-progress]")).toBeDisabled();
      await expect(track.locator("[data-audio-elapsed]")).toHaveText("0:00");
      expect(await panel.locator("audio").count(), "faixa nativa não usa elemento de mídia").toBe(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
      if (width === 320 || width === 390) {
        await page.screenshot({ path: testInfo.outputPath(`tool-audio-${hostName}-${width}.png`), fullPage: true });
      }
      await closeToolPanel(page, group, hostName);
      expect(errors).toEqual([]);
    }
  });

  test(`ferramenta real: mount padrão mantém duas calculadoras e nenhum player na ${hostLabel}`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const errors = await mount(page, "?unit=theory");
    const host = await openHostScope(page, hostName);
    const group = toolGroup(host);
    await expect(group).toBeVisible(); await group.click();
    await expect(toolMenu(page)).toBeVisible();
    await expect(toolMenu(page).locator("[data-open-study-tool]")).toHaveCount(2);
    await expect(toolMenu(page).locator('[data-open-study-tool="audio"]')).toHaveCount(0);
    await toolMenu(page).locator('[data-open-study-tool="calculator"]').click();
    const panel = page.getByRole("dialog", { name: "Calculadora", exact: true });
    await expect(panel).toBeVisible();
    await closeToolPanel(page, group, hostName);
    expect(errors).toEqual([]);
  });
}

// Apoio contextual (issue #445): a unidade sem bloco de ferramenta escolhido na
// autoria ainda oferece a calculadora durante o Estudo, sem ler nem resolver o enunciado.
// Os hosts de inspeção e revisão seguem sem esse apoio por padrão (default false).
for (const [hostName, hostLabel] of [["unidade", "Unidade"], ["explicacao", "Explicação"]]) {
  test(`apoio contextual sem bloco autoral oferece a calculadora na ${hostLabel} e devolve o foco`, async ({ page }, testInfo) => {
    for (const width of toolWidths) {
      await page.setViewportSize({ width, height: 844 });
      const errors = await mount(page, "?unit=theory&tools=contextual");
      const host = await openHostScope(page, hostName);
      // Sem recurso escolhido na autoria não há menu de grupo: a ferramenta contextual
      // aparece como controle direto do próprio rodapé.
      await expect(host.getByRole("button", { name: "Ferramentas da unidade", exact: true })).toHaveCount(0);
      const launcher = host.locator('[data-study-tool-id="study-contextual-calculator"]');
      await expect(launcher).toBeVisible();
      await expect(launcher).toHaveAccessibleName("Calculadora");
      await launcher.click();
      const panel = page.getByRole("dialog", { name: "Calculadora", exact: true });
      await expect(panel).toBeVisible();
      const input = panel.getByRole("textbox", { name: "Expressão", exact: true });
      // A ferramenta não extrai nem resolve o enunciado: o campo abre vazio.
      await expect(input).toHaveValue("");
      await input.fill("2 + 3"); await page.keyboard.press("Enter");
      await expect(panel.locator("[data-calculator-output]")).toHaveText("5");
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
      if (width === 320 || width === 390) {
        await page.screenshot({ path: testInfo.outputPath(`tool-calculadora-contextual-${hostName}-${width}.png`), fullPage: true });
      }
      await closeToolPanel(page, launcher, hostName);
      expect(errors).toEqual([]);
    }
  });
}

const dockSizes = [[320, 844, false], [390, 844, false], [1280, 844, false], [320, 500, true], [390, 500, true]];
const dockLabel = ([width, height, zoom]) => width + "x" + height + (zoom ? "+texto150" : "");

async function focusRelativeToPanel(page) {
  return page.evaluate(() => {
    const active = document.activeElement;
    const panel = document.querySelector(".study-tools-panel").getBoundingClientRect();
    const rect = active.getBoundingClientRect();
    const scroller = active.closest(".card-sheet-content, .study-explanation-body");
    const view = scroller ? scroller.getBoundingClientRect() : rect;
    return { insidePanel: Boolean(active.closest(".study-tools-panel")),
      // Área realmente visível do elemento dentro da sua janela de leitura.
      visibleArea: Math.round(Math.max(0, Math.min(rect.bottom, view.bottom) - Math.max(rect.top, view.top))),
      // A janela de leitura não pode estar sob a folha.
      readingCovered: view.bottom > panel.top + 1 && view.top < panel.bottom - 1 };
  });
}

// O apoio encaixado participa do layout do host: a leitura encolhe e continua visível e
// rolável até o último trecho, sem controles cobertos. O teclado alterna entre apoio e
// material. Cobre a prática curta e a explicação longa em telas estreitas, curtas e desktop.
test("apoio encaixado mantém as opções finais da prática, a resposta, a rolagem e o foco", async ({ page }, testInfo) => {
  for (const size of dockSizes) {
    const [width, height, zoom] = size;
    const label = dockLabel(size);
    await page.setViewportSize({ width, height });
    const errors = await mount(page, "?unit=practice&tools=contextual");
    if (zoom) await page.evaluate(() => { document.documentElement.style.fontSize = "150%"; });
    const answer = page.locator('[data-action="choice-toggle"][data-choice-option-id="local"]');
    await answer.click();
    await page.locator(".card-sheet-content").evaluate(node => { node.scrollTop = 60; });
    const launcher = page.locator(".study-reader-footer [data-study-tool-id='study-contextual-calculator']");
    await expect(launcher).toBeVisible();
    await launcher.click();
    const panel = page.getByRole("dialog", { name: "Calculadora", exact: true });
    await expect(panel).toBeVisible();
    await expect(page.locator(".study-tools-panel")).toHaveCount(1);
    expect(await panel.getAttribute("aria-modal"), label).toBeNull();
    // A folha vive no contêiner de leitura e nunca ocupa mais da metade dele.
    const layout = await page.evaluate(() => {
      const element = document.querySelector(".study-tools-panel");
      const scroller = document.querySelector(".card-sheet-content").getBoundingClientRect();
      const panelRect = element.getBoundingClientRect();
      return { readingHeight: Math.round(scroller.height), panelHeight: Math.round(panelRect.height),
        hostHeight: element.parentElement.parentElement.clientHeight, panelTop: Math.round(panelRect.top),
        scrollerBottom: Math.round(scroller.bottom),
        parentClass: element.parentElement.className };
    });
    expect(layout.parentClass, label).toContain("is-docked");
    expect(layout.hostHeight, label).toBeGreaterThan(0);
    expect(layout.panelTop, label).toBeGreaterThanOrEqual(layout.scrollerBottom - 1);
    expect(layout.panelHeight, label).toBeLessThanOrEqual(Math.round(layout.hostHeight / 2) + 1);
    // O fim do material continua alcançável na leitura, acima da folha.
    // A última opção renderizada é `local` (a ordem efetiva é prior, whole, local),
    // então a identidade é conferida em vez de presumir a posição.
    const lastOption = page.locator('[data-action="choice-toggle"]').last();
    await expect(lastOption).toHaveAttribute("data-choice-option-id", "local");
    await lastOption.evaluate(node => node.scrollIntoView({ block: "end" }));
    const reached = await lastOption.evaluate(node => {
      const rect = node.getBoundingClientRect();
      const scroller = node.closest(".card-sheet-content").getBoundingClientRect();
      return { bottom: Math.round(rect.bottom), scrollerTop: Math.round(scroller.top),
        scrollerBottom: Math.round(scroller.bottom),
        panelTop: Math.round(document.querySelector(".study-tools-panel").getBoundingClientRect().top) };
    });
    expect(reached.bottom, label).toBeLessThanOrEqual(reached.scrollerBottom + 1);
    expect(reached.bottom, label).toBeGreaterThan(reached.scrollerTop);
    expect(reached.bottom, label).toBeLessThanOrEqual(reached.panelTop + 1);
    // O apoio continua operável com a leitura visível.
    const input = panel.getByRole("textbox", { name: "Expressão", exact: true });
    await expect(input).toHaveValue("");
    await input.fill("2 + 3"); await page.keyboard.press("Enter");
    await expect(panel.locator("[data-calculator-output]")).toHaveText("5");
    await page.screenshot({ path: testInfo.outputPath("docked-pratica-" + label + ".png") });
    // Teclado: do apoio volta-se ao material visível, e Tab retorna à folha.
    await page.locator(".study-tools-panel [data-close-study-tool]").focus();
    await page.keyboard.press("Shift+Tab");
    const outside = await focusRelativeToPanel(page);
    expect(outside.insidePanel, label).toBe(false);
    expect(outside.visibleArea, label).toBeGreaterThan(0);
    expect(outside.readingCovered, label).toBe(false);
    await page.keyboard.press("Tab");
    expect((await focusRelativeToPanel(page)).insidePanel, label).toBe(true);
    // Escape fecha, devolve o foco ao acionador e preserva resposta e rolagem.
    const scrollBefore = await page.locator(".card-sheet-content").evaluate(node => node.scrollTop);
    await page.keyboard.press("Escape");
    await expect(page.locator(".study-tools-overlay")).toHaveCount(0);
    await expect(launcher).toBeFocused();
    await expect(answer).toHaveAttribute("aria-checked", "true");
    // A leitura volta a ser mais alta ao fechar: a posição é preservada até o novo limite.
    const after = await page.locator(".card-sheet-content").evaluate(node =>
      ({ top: node.scrollTop, max: node.scrollHeight - node.clientHeight }));
    expect(Math.abs(after.top - Math.min(scrollBefore, after.max)), label).toBeLessThanOrEqual(1);
    expect(errors).toEqual([]);
  }
});

test("apoio encaixado mantém o último parágrafo e as fontes da explicação alcançáveis", async ({ page }, testInfo) => {
  for (const size of dockSizes) {
    const [width, height, zoom] = size;
    const label = dockLabel(size);
    await page.setViewportSize({ width, height });
    const errors = await mount(page, "?unit=theory&tools=contextual");
    if (zoom) await page.evaluate(() => { document.documentElement.style.fontSize = "150%"; });
    await openButton(page).click();
    const launcher = overlay(page).locator(".study-explanation-tools [data-study-tool-id='study-contextual-calculator']");
    await expect(launcher).toBeVisible();
    await launcher.click();
    const panel = page.getByRole("dialog", { name: "Calculadora", exact: true });
    await expect(panel).toBeVisible();
    expect(await panel.getAttribute("aria-modal"), label).toBeNull();
    const layout = await page.evaluate(() => {
      const element = document.querySelector(".study-tools-panel");
      const reading = document.querySelector(".study-explanation-reading").getBoundingClientRect();
      const panelRect = element.getBoundingClientRect();
      return { readingHeight: Math.round(reading.height), panelHeight: Math.round(panelRect.height),
        hostHeight: element.parentElement.parentElement.clientHeight, panelTop: Math.round(panelRect.top),
        readingBottom: Math.round(reading.bottom),
        parentClass: element.parentElement.className };
    });
    expect(layout.parentClass, label).toContain("is-docked");
    expect(layout.panelTop, label).toBeGreaterThanOrEqual(layout.readingBottom - 1);
    expect(layout.panelHeight, label).toBeLessThanOrEqual(Math.round(layout.hostHeight / 2) + 1);
    // O último parágrafo e as fontes continuam alcançáveis no corpo da explicação.
    const body = page.locator(".study-explanation-body");
    const lastParagraph = body.locator('[data-package-instance-id="selective-7"]');
    await lastParagraph.evaluate(node => node.scrollIntoView({ block: "end" }));
    const paragraph = await lastParagraph.evaluate(node => {
      const rect = node.getBoundingClientRect();
      const scroller = node.closest(".study-explanation-body").getBoundingClientRect();
      return { bottom: Math.round(rect.bottom), scrollerTop: Math.round(scroller.top),
        scrollerBottom: Math.round(scroller.bottom),
        panelTop: Math.round(document.querySelector(".study-tools-panel").getBoundingClientRect().top) };
    });
    expect(paragraph.bottom, label).toBeLessThanOrEqual(paragraph.scrollerBottom + 1);
    expect(paragraph.bottom, label).toBeGreaterThan(paragraph.scrollerTop);
    expect(paragraph.bottom, label).toBeLessThanOrEqual(paragraph.panelTop + 1);
    const bibliography = overlay(page).locator(".study-bibliography").first();
    await bibliography.evaluate(node => node.scrollIntoView({ block: "end" }));
    const sources = await bibliography.evaluate(node => {
      const rect = node.getBoundingClientRect();
      const scroller = node.closest(".study-explanation-body").getBoundingClientRect();
      return { bottom: Math.round(rect.bottom), scrollerTop: Math.round(scroller.top),
        scrollerBottom: Math.round(scroller.bottom) };
    });
    expect(sources.bottom, label).toBeLessThanOrEqual(sources.scrollerBottom + 1);
    expect(sources.bottom, label).toBeGreaterThan(sources.scrollerTop);
    await page.screenshot({ path: testInfo.outputPath("docked-explicacao-" + label + ".png") });
    // Teclado: do apoio volta-se ao material visível, e Tab retorna à folha.
    await page.locator(".study-tools-panel [data-close-study-tool]").focus();
    await page.keyboard.press("Shift+Tab");
    const outside = await focusRelativeToPanel(page);
    expect(outside.insidePanel, label).toBe(false);
    expect(outside.visibleArea, label).toBeGreaterThan(0);
    expect(outside.readingCovered, label).toBe(false);
    await page.keyboard.press("Tab");
    expect((await focusRelativeToPanel(page)).insidePanel, label).toBe(true);
    const scrollBefore = await body.evaluate(node => node.scrollTop);
    await page.keyboard.press("Escape");
    await expect(page.locator(".study-tools-overlay")).toHaveCount(0);
    await expect(overlay(page)).toBeVisible();
    await expect(launcher).toBeFocused();
    const after = await body.evaluate(node => ({ top: node.scrollTop, max: node.scrollHeight - node.clientHeight }));
    expect(Math.abs(after.top - Math.min(scrollBefore, after.max)), label).toBeLessThanOrEqual(1);
    await page.keyboard.press("Escape");
    await expect(openButton(page)).toBeFocused();
    expect(errors).toEqual([]);
  }
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
  // Uma tabela larga mantém sua geometria; alcance a extremidade pelo scroll do próprio componente.
  await lastCell.evaluate(node => { const frame = node.closest('.runtime-table-wrap'); frame.scrollLeft = frame.scrollWidth; });
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
  await page.locator('[data-action="choice-toggle"][data-choice-option-id="local"]').click();
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
  await expect(page.locator('[data-action="choice-toggle"][data-choice-option-id="local"]')).toHaveAttribute("aria-checked", "true");
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
  await expect(page.locator('[data-action="choice-toggle"][data-choice-option-id="local"]')).toHaveAttribute("aria-checked", "true");
});
