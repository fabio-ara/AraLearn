import { test, expect } from "@playwright/test";
import { readFile, writeFile } from "node:fs/promises";

const project = JSON.parse(await readFile(new URL("../fixtures/package/project-minimal.json", import.meta.url), "utf8"));
const message = "Não foi possível sincronizar. Suas alterações continuam neste dispositivo.";

async function mount(page, theme = "light", error = message) {
  await page.route("**/main.js", route => route.fulfill({ contentType: "application/javascript", body: "" }));
  await page.goto("/");
  await page.evaluate(async ({ project, theme, error }) => {
    const { renderHomeScreen } = await import("/src/ui/renderHomeScreen.js");
    document.documentElement.dataset.colorMode = theme;
    document.body.innerHTML = '<div id="app-root"><div id="aralearn-editor-root"><div class="app-shell"></div></div></div>';
    window.statusActions = [];
    const root = document.querySelector(".app-shell");
    root.addEventListener("click", event => {
      const action = event.target.closest("[data-action]")?.dataset.action;
      if (action) window.statusActions.push(action);
    });
    window.renderStatusProbe = (runtimeStatus = { pending: true, syncError: error }) => {
      root.innerHTML = renderHomeScreen({ project, progress: { version: 1, lessons: {} },
        runtimeStatus });
    };
    window.renderStatusProbe();
    await document.fonts.ready;
  }, { project, theme, error });
}

async function navigationGeometry(page) {
  return page.evaluate(() => {
    const selectors = [".study-runtime-status-control", ".home-product-switch", "#home-course-select"];
    return selectors.map(selector => {
      const rect = document.querySelector(selector).getBoundingClientRect();
      return { selector, x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    });
  });
}

test("falha se distingue por forma no mesmo slot de 44 px em ambos os temas", async ({ page }, testInfo) => {
  const measurements = [];
  for (const theme of ["light", "dark"]) {
    await page.setViewportSize({ width: 390, height: 844 });
    await mount(page, theme);
    await page.evaluate(() => window.renderStatusProbe({}));
    const control = page.locator(".study-runtime-status-control");
    await expect(control).toHaveAccessibleName("Sincronizado");
    const syncedShape = await control.locator("svg").innerHTML();
    const before = await navigationGeometry(page);
    expect({ width: before[0].width, height: before[0].height }).toEqual({ width: 44, height: 44 });
    await page.evaluate(() => window.renderStatusProbe());
    await expect(control).toHaveAccessibleName("Falha na sincronização");
    await expect(control.locator("svg")).toHaveCount(1);
    expect(await control.locator("svg").innerHTML()).not.toBe(syncedShape);
    expect(await navigationGeometry(page)).toEqual(before);
    const measured = await control.evaluate(node => ({ color: getComputedStyle(node).color,
      background: getComputedStyle(document.body).backgroundColor,
      mode: document.documentElement.dataset.colorMode }));
    expect(measured.mode).toBe(theme);
    measurements.push({ theme, ...measured, navigation: before });
    await page.screenshot({ path: testInfo.outputPath(`sync-failure-shape-390-${theme}.png`) });
    await control.click();
    await expect(page.getByRole("region", { name: "Estado da sincronização" })).toBeVisible();
    expect(await page.evaluate(() => window.statusActions)).toEqual([]);
    expect(await navigationGeometry(page)).toEqual(before);
    await page.keyboard.press("Escape");
    await expect(control).toBeFocused();
    await control.click();
    await page.getByRole("button", { name: "Tentar novamente" }).click();
    expect(await page.evaluate(() => window.statusActions)).toEqual(["synchronize-study"]);
    expect(await navigationGeometry(page)).toEqual(before);
  }
  expect(measurements[0].color).not.toBe(measurements[1].color);
  await writeFile(testInfo.outputPath("sync-failure-shape-geometry.json"), JSON.stringify(measurements, null, 2));
});

test("falha fica no indicador; explicação revelada fecha sem bloquear a troca de área ou repetir envio", async ({ page }, testInfo) => {
  const measurements = [];
  for (const [width, theme] of [[360, "light"], [390, "light"], [390, "dark"], [1280, "light"]]) {
    await page.setViewportSize({ width, height: 640 });
    await mount(page, theme);
    const control = page.getByRole("button", { name: "Falha na sincronização", exact: true });
    const details = page.getByRole("region", { name: "Estado da sincronização" });
    const before = await navigationGeometry(page);
    await expect(details).toBeHidden();
    expect(before[0].width).toBe(44);
    expect(before[0].height).toBe(44);
    await control.click();
    await expect(details).toBeVisible();
    expect(await page.evaluate(() => window.statusActions)).toEqual([]);
    expect(await navigationGeometry(page)).toEqual(before);
    const geometry = await page.evaluate(() => {
      const menu = document.querySelector(".home-product-switch");
      const panel = document.querySelector(".study-runtime-status-popover").getBoundingClientRect();
      return { panel: { x: panel.x, right: panel.right, y: panel.y, bottom: panel.bottom },
        switchBottom: menu.getBoundingClientRect().bottom,
        buttons: [...menu.querySelectorAll("button")].map(button => {
          const r = button.getBoundingClientRect();
          return button.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2));
        }),
        background: getComputedStyle(document.querySelector(".study-runtime-status-popover")).backgroundColor,
        mode: document.documentElement.dataset.colorMode };
    });
    expect(geometry.panel.y).toBeGreaterThanOrEqual(geometry.switchBottom);
    expect(geometry.panel.x).toBeGreaterThanOrEqual(0);
    expect(geometry.panel.right).toBeLessThanOrEqual(width);
    expect(geometry.panel.bottom).toBeLessThanOrEqual(640);
    expect(geometry.buttons).toEqual([true, true]);
    expect(geometry.mode).toBe(theme);
    measurements.push({ width, theme, ...geometry });
    if (width === 390) {
      await page.screenshot({ path: testInfo.outputPath(`sync-error-details-390-${theme}.png`) });
      await testInfo.attach(`geometry-${theme}`, { body: JSON.stringify(geometry, null, 2), contentType: "application/json" });
    }
    await page.getByRole("button", { name: "Fechar estado da sincronização" }).click();
    await expect(details).toBeHidden();
    await expect(control).toBeFocused();
    await control.click();
    await page.keyboard.press("Escape");
    await expect(details).toBeHidden();
    await expect(control).toBeFocused();
    await control.click();
    await page.getByRole("button", { name: "Tentar novamente" }).click();
    await expect(details).toBeHidden();
    expect(await page.evaluate(() => window.statusActions)).toEqual(["synchronize-study"]);
    await page.evaluate(() => window.renderStatusProbe());
    await page.waitForTimeout(1000);
    await expect(details).toBeHidden();
    expect(await navigationGeometry(page)).toEqual(before);
    if (width === 390 && theme === "light") {
      await page.screenshot({ path: testInfo.outputPath("sync-error-indicator-390-light.png") });
    }
    await control.click();
    await page.locator('[data-action="open-authoring"]').click();
    await expect(details).toBeHidden();
    expect(await page.evaluate(() => window.statusActions)).toEqual(["synchronize-study", "open-authoring"]);
  }
  expect(measurements.find(item => item.theme === "dark").background)
    .not.toBe(measurements.find(item => item.theme === "light").background);
  await writeFile(testInfo.outputPath("sync-error-geometry.json"), JSON.stringify(measurements, null, 2));
});

test("mensagem longa permanece escapada, rolável e dispensável sem mover a Home", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 640 });
  await mount(page, "light", '<img src=x onerror="window.injected=true"> ' + message.repeat(60));
  const before = await navigationGeometry(page);
  await page.getByRole("button", { name: "Falha na sincronização", exact: true }).click();
  const details = page.getByRole("region", { name: "Estado da sincronização" });
  await expect(details.locator("img")).toHaveCount(0);
  expect(await details.evaluate(node => node.scrollHeight > node.clientHeight)).toBe(true);
  const box = await details.boundingBox();
  expect(box.y + box.height).toBeLessThanOrEqual(640);
  await details.evaluate(node => { node.scrollTop = node.scrollHeight; });
  await expect(page.getByRole("button", { name: "Tentar novamente" })).toBeInViewport();
  await page.keyboard.press("Escape");
  await expect(details).toBeHidden();
  expect(await navigationGeometry(page)).toEqual(before);
});
