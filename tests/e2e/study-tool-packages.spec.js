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
    if (kind !== "calculator") data.items = [
      { id: "external", label: "語法 — gramática /ɐ/ العربية", description: "Compare a explicação e volte à tarefa.", languageTag: "zh-Hant", target: { kind: "url", url: "https://example.org/consulta" } },
      { id: "pdf", label: "Leitura complementar em PDF", target: { kind: "source_attachment", sourceId: "source-local", sourceRevision: 2, contentHash: "a".repeat(64) } }
    ];
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
  await input.focus(); await page.keyboard.press("Enter");
  await expect(page.getByRole("status")).toHaveText("Resultado aproximado: 5");
  await expect(input).toBeFocused();
  await input.fill("1/0"); await page.keyboard.press("Enter");
  await expect(page.getByRole("status")).toContainText("dividir por zero");
  await expect(input).toHaveAttribute("aria-invalid", "true");
  await input.fill("sin(90)");
  await page.getByRole("combobox", { name: "Unidade dos ângulos" }).selectOption("degrees");
  await page.getByRole("button", { name: "Calcular", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("Resultado aproximado: 1");
  await page.getByRole("combobox", { name: "Unidade dos ângulos" }).selectOption("radians");
  await expect(page.getByRole("status")).toBeEmpty();
  await input.fill("<img src=x onerror=alert(1)>"); await page.keyboard.press("Enter");
  await expect(page.getByRole("status")).toContainText("símbolo não aceito");
  expect(await page.locator("img,iframe,svg,script").count()).toBe(0);
  await page.getByRole("button", { name: "Limpar", exact: true }).click();
  await expect(input).toBeEmpty(); await expect(input).toBeFocused();
  await input.fill("sqrt(3^2 + 4^2)"); await page.keyboard.press("Enter");
  await page.getByText("Operações e precisão", { exact: true }).click();
  for (const theme of ["light", "dark"]) {
    await page.evaluate(theme => { document.documentElement.dataset.colorMode = theme; }, theme);
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme)).toBe(theme);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
    await page.screenshot({ path: testInfo.outputPath(`calculator-${theme}.png`), fullPage: true });
  }
});

test("auxiliares plurais abrem pelo host, conservam alvo lógico e permitem tentar novamente sem duplicar listeners", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const kind of ["grammar", "dictionary", "reading"]) {
    await mount(page, kind);
    const external = page.getByRole("button", { name: "語法 — gramática /ɐ/ العربية" });
    await external.focus(); await page.keyboard.press("Enter");
    await expect.poll(() => page.evaluate(() => window.__opened.length)).toBe(1);
    const pdf = page.getByRole("button", { name: "Leitura complementar em PDF" });
    await pdf.click();
    await expect(page.getByRole("status").last()).toContainText("tente novamente");
    await expect(pdf).toBeEnabled();
    expect(await page.locator("main").innerText()).not.toContain("private-internal-token");
    await page.evaluate(() => {
      const oldCleanup = window.__cleanupTool;
      const { definition, root, data, host } = window.__tool;
      window.__cleanupTool = definition.toolInteraction.bind(root, data, host);
      oldCleanup();
      window.__cleanupTool = definition.toolInteraction.bind(root, data, host);
    });
    await pdf.click();
    await expect(page.getByRole("status").last()).toContainText("Recurso aberto");
    const opened = await page.evaluate(() => window.__opened);
    expect(opened).toHaveLength(3);
    expect(opened[1]).toEqual(opened[2]);
    expect(opened[2]).toEqual({ attachment: { sourceId: "source-local", sourceRevision: 2, contentHash: "a".repeat(64) } });
    await page.evaluate(() => window.__cleanupTool());
    await external.click();
    expect(await page.evaluate(() => window.__opened.length)).toBe(3);
    expect(await page.locator("main").ariaSnapshot()).toContain("Leitura complementar em PDF");
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
    if (kind === "grammar") await page.screenshot({ path: testInfo.outputPath("grammar-items.png"), fullPage: true });
  }
});
