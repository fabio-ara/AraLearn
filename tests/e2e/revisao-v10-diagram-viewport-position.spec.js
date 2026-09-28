import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

// Focal: posição do quadro compartilhado de diagramas ao entrar e sair da tela
// inteira. Reutiliza a fixture sintética do Estudo (gallery + runtime real) de
// revisao-v10-diagrams.spec.js, sem acervo privado e sem rede.
const FIXTURE_FILES = [
  ["**/tests/gallery/revisao-v10-diagrams.html*", "../gallery/revisao-v10-diagrams.html", "text/html"],
  ["**/tests/support/revisaoV10DiagramFixture.js", "../support/revisaoV10DiagramFixture.js", "text/javascript"],
  ["**/tests/support/revisaoV10DiagramCases.js", "../support/revisaoV10DiagramCases.js", "text/javascript"],
  ["**/tests/support/studyExplanationFixture.js", "../support/studyExplanationFixture.js", "text/javascript"],
  ["**/tests/fixtures/package/project-minimal.json", "../fixtures/package/project-minimal.json", "application/json"]
];

async function mount(page, { width = 390, height = 844, diagram = "container", unit = "theory" } = {}) {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width, height });
  for (const [url, file, contentType] of FIXTURE_FILES) {
    await page.route(url, (route) =>
      route.fulfill({ status: 200, contentType, body: readFileSync(new URL(file, import.meta.url), "utf8") }));
  }
  await page.goto("/tests/gallery/revisao-v10-diagrams.html?diagram=" + diagram + "&unit=" + unit);
  await expect.poll(() => page.evaluate(() => globalThis.__EXPLANATION_FIXTURE_READY__ === true)).toBe(true);
  const host = page.locator(".card-sheet-content");
  await expect(host.locator('[data-graphviz-status="ready"]')).toHaveCount(1);
  return { errors, host };
}

function readViewport(host) {
  return host.evaluate((root) => {
    const canvas = root.querySelector('[data-resource-scroll-frame="diagram"]');
    const svg = canvas.querySelector("svg");
    const canvasRect = canvas.getBoundingClientRect();
    const visible = (box) => box.right > canvasRect.left + 1 && box.left < canvasRect.right - 1 &&
      box.bottom > canvasRect.top + 1 && box.top < canvasRect.bottom - 1;
    const scale = Number(svg.getAttribute("data-diagram-scale") || 1);
    return {
      scroll: [Math.round(canvas.scrollLeft), Math.round(canvas.scrollTop)],
      maxScroll: [canvas.scrollWidth - canvas.clientWidth, canvas.scrollHeight - canvas.clientHeight],
      box: [canvas.clientWidth, canvas.clientHeight],
      scale: Number(scale.toFixed(3)),
      center: {
        x: Number(((canvas.scrollLeft + canvas.clientWidth / 2) / scale).toFixed(1)),
        y: Number(((canvas.scrollTop + canvas.clientHeight / 2) / scale).toFixed(1))
      },
      visibleNodes: [...svg.querySelectorAll("g.node")].filter((node) => visible(node.getBoundingClientRect())).length,
      mode: canvas.dataset.diagramViewportMode
    };
  });
}

async function panInline(page, host) {
  await host.locator('[data-resource-scroll-frame="diagram"]').focus();
  for (let step = 0; step < 3; step++) await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowDown");
}

async function openExplanation(page) {
  await page.getByRole("button", { name: "Explicação", exact: true }).click();
  const explanation = page.getByRole("dialog", { name: "Explicação", exact: true });
  await expect(explanation).toBeVisible();
  const host = page.locator(".study-explanation-body");
  await expect(host.locator('[data-graphviz-status="ready"]')).toHaveCount(1);
  return { explanation, host };
}

for (const diagram of ["container", "guarded-machine"]) {
  test("fechar a tela inteira sem explorar devolve a posição inline (" + diagram + ")", async ({ page }, testInfo) => {
    const { errors, host } = await mount(page, { diagram });
    const figure = host.locator(".package-system-diagram");
    const trigger = figure.getByRole("button", { name: "Explorar diagrama em tela inteira", exact: true });

    await panInline(page, host);
    const panned = await readViewport(host);
    expect(panned.scroll[0] + panned.scroll[1], JSON.stringify(panned)).toBeGreaterThan(0);

    await trigger.click();
    await expect(page.locator("dialog[open]")).toBeVisible();
    await expect.poll(async () => (await readViewport(host)).mode).toBe("explore");
    const expanded = await readViewport(host);
    await page.screenshot({ path: testInfo.outputPath(diagram + "-tela-inteira.png") });

    await page.keyboard.press("Escape");
    await expect(page.locator("dialog[open]")).toHaveCount(0);
    await expect(trigger).toBeFocused();
    await expect.poll(async () => (await readViewport(host)).mode).toBe("inline");
    const backInline = await readViewport(host);
    await page.screenshot({ path: testInfo.outputPath(diagram + "-inline-restaurado.png") });

    await page.keyboard.press("Enter");
    await expect(page.locator("dialog[open]")).toBeVisible();
    await expect.poll(async () => (await readViewport(host)).mode).toBe("explore");
    const reopened = await readViewport(host);
    await page.keyboard.press("Escape");
    await expect(page.locator("dialog[open]")).toHaveCount(0);
    await expect.poll(async () => (await readViewport(host)).mode).toBe("inline");
    const secondInline = await readViewport(host);

    const view = JSON.stringify({ panned, expanded, backInline, reopened, secondInline });
    // Escala preservada nas duas pontas.
    expect(expanded.scale, view).toBeCloseTo(panned.scale, 2);
    expect(backInline.scale, view).toBeCloseTo(panned.scale, 2);
    // Nenhuma abertura em região vazia do diagrama.
    expect(expanded.visibleNodes, view).toBeGreaterThanOrEqual(1);
    // Posição inline exata quando o estudante não mexeu na tela inteira.
    expect(backInline.scroll[0], view).toBe(panned.scroll[0]);
    expect(backInline.scroll[1], view).toBe(panned.scroll[1]);
    // Reabertura determinística: o mesmo enquadramento da primeira abertura.
    expect(reopened.scroll[0], view).toBe(expanded.scroll[0]);
    expect(reopened.scroll[1], view).toBe(expanded.scroll[1]);
    expect(secondInline.scroll[0], view).toBe(panned.scroll[0]);
    expect(secondInline.scroll[1], view).toBe(panned.scroll[1]);
    expect(errors).toEqual([]);
  });

  test("fechar a tela inteira depois de explorar conserva o ponto visto (" + diagram + ")", async ({ page }) => {
    const { errors, host } = await mount(page, { diagram });
    const figure = host.locator(".package-system-diagram");
    const canvas = host.locator('[data-resource-scroll-frame="diagram"]');
    const trigger = figure.getByRole("button", { name: "Explorar diagrama em tela inteira", exact: true });

    await panInline(page, host);
    await trigger.click();
    await expect(page.locator("dialog[open]")).toBeVisible();
    await expect.poll(async () => (await readViewport(host)).mode).toBe("explore");
    await canvas.focus();
    for (let step = 0; step < 4; step++) await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowDown");
    await figure.getByRole("button", { name: "Aumentar zoom", exact: true }).click();
    await expect.poll(async () => (await readViewport(host)).scale).toBeGreaterThan(1);
    const explored = await readViewport(host);

    await page.keyboard.press("Escape");
    await expect(page.locator("dialog[open]")).toHaveCount(0);
    await expect(trigger).toBeFocused();
    await expect.poll(async () => (await readViewport(host)).mode).toBe("inline");
    const backInline = await readViewport(host);

    await page.keyboard.press("Enter");
    await expect(page.locator("dialog[open]")).toBeVisible();
    await expect.poll(async () => (await readViewport(host)).mode).toBe("explore");
    const reopened = await readViewport(host);
    await page.keyboard.press("Escape");
    await expect(page.locator("dialog[open]")).toHaveCount(0);
    await expect(trigger).toBeFocused();
    await expect.poll(async () => (await readViewport(host)).mode).toBe("inline");
    const secondInline = await readViewport(host);

    const view = JSON.stringify({ explored, backInline, reopened, secondInline });
    expect(backInline.scale, view).toBeCloseTo(explored.scale, 2);
    expect(Math.abs(backInline.center.x - explored.center.x), view).toBeLessThanOrEqual(1);
    expect(Math.abs(backInline.center.y - explored.center.y), view).toBeLessThanOrEqual(1);
    expect(reopened.scale, view).toBeCloseTo(explored.scale, 2);
    expect(Math.abs(reopened.center.x - explored.center.x), view).toBeLessThanOrEqual(1);
    expect(Math.abs(reopened.center.y - explored.center.y), view).toBeLessThanOrEqual(1);
    expect(secondInline.scale, view).toBeCloseTo(explored.scale, 2);
    expect(Math.abs(secondInline.center.x - explored.center.x), view).toBeLessThanOrEqual(1);
    expect(Math.abs(secondInline.center.y - explored.center.y), view).toBeLessThanOrEqual(1);
    expect(errors).toEqual([]);
  });

  test("Explicação mantém o host aberto ao fechar e reabrir o fullscreen (" + diagram + ")", async ({ page }) => {
    const { errors } = await mount(page, { diagram });
    const { explanation, host } = await openExplanation(page);
    const figure = host.locator(".package-system-diagram");
    const trigger = figure.getByRole("button", { name: "Explorar diagrama em tela inteira", exact: true });

    await panInline(page, host);
    const panned = await readViewport(host);
    expect(panned.scroll[0] + panned.scroll[1], JSON.stringify(panned)).toBeGreaterThan(0);

    await trigger.click();
    let fullscreen = page.locator("dialog[open]");
    await expect(fullscreen).toHaveCount(1);
    await expect(page.getByRole("dialog")).toHaveCount(2);
    await expect(explanation).toBeVisible();
    await expect.poll(async () => (await readViewport(host)).mode).toBe("explore");
    await fullscreen.locator('[data-resource-scroll-frame="diagram"]').focus();
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowDown");
    await fullscreen.getByRole("button", { name: "Aumentar zoom", exact: true }).click();
    await expect.poll(async () => (await readViewport(host)).scale).toBeGreaterThan(1);
    const explored = await readViewport(host);

    await page.keyboard.press("Escape");
    await expect(fullscreen).toHaveCount(0);
    await expect(page.getByRole("dialog")).toHaveCount(1);
    await expect(explanation).toBeVisible();
    await expect(trigger).toBeFocused();
    await expect.poll(async () => (await readViewport(host)).mode).toBe("inline");
    const backInline = await readViewport(host);

    await page.keyboard.press("Enter");
    fullscreen = page.locator("dialog[open]");
    await expect(fullscreen).toHaveCount(1);
    await expect(page.getByRole("dialog")).toHaveCount(2);
    await expect(explanation).toBeVisible();
    await expect.poll(async () => (await readViewport(host)).mode).toBe("explore");
    const reopened = await readViewport(host);

    await page.keyboard.press("Escape");
    await expect(fullscreen).toHaveCount(0);
    await expect(page.getByRole("dialog")).toHaveCount(1);
    await expect(explanation).toBeVisible();
    await expect(trigger).toBeFocused();
    await expect.poll(async () => (await readViewport(host)).mode).toBe("inline");
    const secondInline = await readViewport(host);

    const view = JSON.stringify({ panned, explored, backInline, reopened, secondInline });
    expect(backInline.scale, view).toBeCloseTo(explored.scale, 2);
    expect(reopened.scale, view).toBeCloseTo(explored.scale, 2);
    expect(Math.abs(reopened.center.x - explored.center.x), view).toBeLessThanOrEqual(1);
    expect(Math.abs(reopened.center.y - explored.center.y), view).toBeLessThanOrEqual(1);
    expect(secondInline.scale, view).toBeCloseTo(explored.scale, 2);
    expect(Math.abs(secondInline.center.x - explored.center.x), view).toBeLessThanOrEqual(1);
    expect(Math.abs(secondInline.center.y - explored.center.y), view).toBeLessThanOrEqual(1);
    expect(errors).toEqual([]);
  });
}

test("evento de scroll com a caixa oculta não apaga o ponto visto na segunda volta (guarded-machine)", async ({ page }) => {
  const { errors, host } = await mount(page, { diagram: "guarded-machine" });
  const figure = host.locator(".package-system-diagram");
  const canvas = host.locator('[data-resource-scroll-frame="diagram"]');
  const trigger = figure.getByRole("button", { name: "Explorar diagrama em tela inteira", exact: true });

  await panInline(page, host);
  await trigger.click();
  await expect(page.locator("dialog[open]")).toBeVisible();
  await expect.poll(async () => (await readViewport(host)).mode).toBe("explore");
  await canvas.focus();
  for (let step = 0; step < 4; step++) await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowDown");
  await figure.getByRole("button", { name: "Aumentar zoom", exact: true }).click();
  await expect.poll(async () => (await readViewport(host)).scale).toBeGreaterThan(1);
  const explored = await readViewport(host);

  await page.keyboard.press("Escape");
  await expect(page.locator("dialog[open]")).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await expect.poll(async () => (await readViewport(host)).mode).toBe("inline");
  const backInline = await readViewport(host);
  expect(Math.abs(backInline.center.x - explored.center.x), "primeira volta ao inline").toBeLessThanOrEqual(1);

  await page.keyboard.press("Enter");
  await expect(page.locator("dialog[open]")).toBeVisible();
  await expect.poll(async () => (await readViewport(host)).mode).toBe("explore");
  const reopened = await readViewport(host);
  expect(Math.abs(reopened.center.x - explored.center.x), "reabertura").toBeLessThanOrEqual(1);

  // Ao fechar, o motor pode zerar a rolagem da caixa oculta e emitir "scroll"
  // antes da restauração. O caso força esse evento fiel na captura do close e
  // confirma que o ponto visto e o foco sobrevivem.
  await page.evaluate(() => {
    globalThis.__HIDDEN_SCROLL_FORCED__ = false;
    const canvas = document.querySelector('.card-sheet-content [data-resource-scroll-frame="diagram"]');
    const dialog = document.querySelector("dialog[data-diagram-modal]");
    dialog.addEventListener("close", () => {
      if (canvas.clientWidth === 0 && canvas.clientHeight === 0) {
        canvas.dispatchEvent(new Event("scroll"));
        globalThis.__HIDDEN_SCROLL_FORCED__ = true;
      }
    }, { capture: true, once: true });
  });

  await page.keyboard.press("Escape");
  await expect(page.locator("dialog[open]")).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await expect.poll(async () => (await readViewport(host)).mode).toBe("inline");
  const secondInline = await readViewport(host);

  expect(await page.evaluate(() => globalThis.__HIDDEN_SCROLL_FORCED__), "evento de scroll com caixa oculta forçado").toBe(true);
  const view = JSON.stringify({ explored, backInline, reopened, secondInline });
  expect(secondInline.scale, view).toBeCloseTo(explored.scale, 2);
  expect(Math.abs(secondInline.center.x - explored.center.x), view).toBeLessThanOrEqual(1);
  expect(Math.abs(secondInline.center.y - explored.center.y), view).toBeLessThanOrEqual(1);
  expect(errors).toEqual([]);
});