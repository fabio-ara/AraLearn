import { test, expect } from "@playwright/test";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
let server;
let origin;
test.beforeAll(async () => {
  server = createServer(async (request, response) => {
    const pathname = new URL(request.url, "http://127.0.0.1").pathname;
    if (pathname === "/") {
      response.setHeader("Content-Type", "text/html; charset=utf-8");
      response.end('<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/public/styles-tokens.css"><link rel="stylesheet" href="/public/styles-shell-baseline.css"><link rel="stylesheet" href="/public/styles.css"><title>Ferramentas isoladas</title><body><main style="max-width:720px;margin:12px auto;padding:12px;box-sizing:border-box"></main></body></html>');
      return;
    }
    if (!/^\/(?:src|public)\//u.test(pathname)) { response.writeHead(404).end(); return; }
    const target = path.resolve(repository, `.${pathname}`);
    if (!target.startsWith(`${repository}${path.sep}`)) { response.writeHead(404).end(); return; }
    try {
      response.setHeader("Content-Type", target.endsWith(".css") ? "text/css" : "text/javascript");
      response.end(await readFile(target));
    } catch { response.writeHead(404).end(); }
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
});
test.afterAll(async () => { await new Promise(resolve => server.close(resolve)); });

async function mount(page, kind) {
  await page.goto(origin);
  await page.evaluate(async kind => {
    const module = await import(`/src/resources/packages/${kind}/index.js`);
    const definition = module[`${kind}Package`];
    const data = structuredClone(definition.authoringContract.example);
    const root = document.querySelector("main");
    root.innerHTML = definition.render(data, { instanceId: "tool-example" });
    window.__opened = []; window.__pdfAttempts = 0;
    const host = {
      openExternalUrl: async url => { window.__opened.push({ url }); return true; },
      openSourceAttachment: async target => {
        window.__opened.push({ attachment: target });
        if (++window.__pdfAttempts === 1) throw new Error("private-internal-token-must-not-leak");
        return true;
      }
    };
    window.__tool = { root, definition, data, host };
    window.__cleanupTool = definition.toolInteraction.bind(root, data, host);
    await document.fonts.ready;
  }, kind);
}

test("calculadora móvel calcula por teclado, explica erro e invalida resultado ao mudar ângulo", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mount(page, "calculator");
  const input = page.getByRole("textbox", { name: "Expressão" });
  for (const name of ["Calcular", "Limpar"]) {
    const action = page.getByRole("button", { name, exact: true });
    await expect(action).toHaveText("");
    await expect(action.locator("svg[aria-hidden=true]")).toHaveAttribute("stroke", "currentColor");
  }
  const limitsTop = (await page.locator(".package-calculator-limits").boundingBox()).y;
  const stableResult = async () => expect((await page.locator(".package-calculator-limits").boundingBox()).y).toBe(limitsTop);
  await input.focus(); await page.keyboard.press("Enter");
  await expect(page.getByRole("status")).toHaveText("5");
  await expect(input).toBeFocused();
  await stableResult();
  await input.fill("1/0"); await page.keyboard.press("Enter");
  await expect(page.getByRole("status")).toContainText("dividir por zero");
  await expect(input).toHaveAttribute("aria-invalid", "true");
  await stableResult();
  await page.getByText("Funções e precisão", { exact: true }).click();
  await input.fill("sin(90)");
  await page.getByRole("combobox", { name: "Unidade dos ângulos" }).selectOption("degrees");
  await page.getByRole("button", { name: "Calcular", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("1");
  await page.getByRole("combobox", { name: "Unidade dos ângulos" }).selectOption("radians");
  await expect(page.locator("[data-calculator-output]")).toBeEmpty();
  await input.fill("<img src=x onerror=alert(1)>"); await page.keyboard.press("Enter");
  await expect(page.getByRole("status")).toContainText("símbolo não aceito");
  expect(await page.locator("img,iframe,script").count()).toBe(0);
  await page.getByRole("button", { name: "Limpar", exact: true }).click();
  await expect(input).toBeEmpty(); await expect(input).toBeFocused();
  await stableResult();
  await input.fill("sqrt(3^2 + 4^2)"); await page.keyboard.press("Enter");
  await page.getByText("Funções e precisão", { exact: true }).click();
  for (const theme of ["light", "dark"]) {
    await page.evaluate(theme => { document.documentElement.dataset.colorMode = theme; }, theme);
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme)).toBe(theme);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
    await page.screenshot({ path: testInfo.outputPath(`calculator-${theme}.png`), fullPage: true });
  }
});

test("teclado numérico compõe, calcula, continua pelo resultado e apaga sem executar código", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mount(page, "calculator");
  await page.getByRole("button", { name: "Limpar", exact: true }).click();
  const press = async name => page.getByRole("button", { name, exact: true }).click();
  for (const key of ["2", "Somar", "3", "Multiplicar", "4", "Calcular"]) await press(key);
  await expect(page.getByRole("status")).toHaveText("14");
  for (const key of ["Dividir", "2"]) await press(key);
  await expect(page.getByRole("textbox", { name: "Expressão" })).toHaveValue("14÷2");
  await press("Calcular");
  await expect(page.getByRole("status")).toHaveText("7");
  for (const key of ["1", "2", "Apagar último caractere", "Separador decimal", "5", "Calcular"]) await press(key);
  await expect(page.getByRole("status")).toHaveText("1.5");
  const input = page.getByRole("textbox", { name: "Expressão" });
  await input.fill("23");
  await input.evaluate(element => element.setSelectionRange(1, 1));
  await press("Somar");
  await expect(input).toHaveValue("2+3");
  await press("Calcular");
  await expect(page.getByRole("status")).toHaveText("5");
  await page.evaluate(() => {
    const { root, definition, data, host } = window.__tool;
    window.__cleanupTool = definition.toolInteraction.bind(root, data, host);
  });
  await press("Limpar"); await press("9");
  await expect(input).toHaveValue("9");
  for (const button of await page.locator('.package-calculator-keypad button').all()) {
    const box = await button.boundingBox();
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);
  }
});
