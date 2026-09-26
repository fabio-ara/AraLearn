import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

// Rótulo da linha de referência do gráfico estatístico: fica dentro da área de dados
// e uma série pode passar sobre o texto. O contorno na cor da superfície preserva a
// leitura sem deslocar nem ocultar dados, em Unidade e Explicação, do 320 ao 1280px,
// depois de redimensionar e de rehidratar. Fixture servida do disco, como nos demais
// specs de fixture do Estudo.
const FIXTURE_FILES = [
  ["**/tests/gallery/revisao-v10-chart.html*", "../gallery/revisao-v10-chart.html", "text/html"],
  ["**/tests/support/revisaoV10ChartFixture.js", "../support/revisaoV10ChartFixture.js", "text/javascript"],
  ["**/tests/support/studyExplanationFixture.js", "../support/studyExplanationFixture.js", "text/javascript"],
  ["**/tests/fixtures/package/project-minimal.json", "../fixtures/package/project-minimal.json", "application/json"]
];

const WIDTHS = [320, 390, 430, 1280];
const CAPTURE_WIDTHS = [320, 390];

async function mount(page, { width = 390, height = 844, unit = "theory", theme = "light" } = {}) {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width, height });
  for (const [url, file, contentType] of FIXTURE_FILES) {
    await page.route(url, (route) => route.fulfill({ status: 200, contentType,
      body: readFileSync(new URL(file, import.meta.url), "utf8") }));
  }
  await page.goto("/tests/gallery/revisao-v10-chart.html?unit=" + unit + "&theme=" + theme);
  await expect.poll(() => page.evaluate(() => globalThis.__EXPLANATION_FIXTURE_READY__ === true)).toBe(true);
  return errors;
}

async function openHost(page, hostName) {
  if (hostName === "explicacao") {
    await page.getByRole("button", { name: "Explicação", exact: true }).click();
    const host = page.locator(".study-explanation-body");
    await expect(host.locator('[data-vega-status="ready"]')).toHaveCount(1);
    return host;
  }
  const host = page.locator(".card-sheet-content");
  await expect(host.locator('[data-vega-status="ready"]')).toHaveCount(1);
  return host;
}

function chartReport(host) {
  return host.evaluate((root) => {
    const canvas = root.querySelector(".package-chart-canvas");
    const svg = canvas.querySelector("svg");
    const tokenColor = (name) => {
      const probe = document.createElement("span");
      probe.style.color = "var(" + name + ")";
      canvas.append(probe);
      const value = getComputedStyle(probe).color;
      probe.remove();
      return value;
    };
    const rectOf = (node) => {
      const box = node.getBoundingClientRect();
      return { left: box.left, top: box.top, right: box.right, bottom: box.bottom };
    };
    const label = [...svg.querySelectorAll("g[class*='role-mark'] text")]
      .find((node) => node.textContent.trim() === "Limite operacional");
    const style = label ? getComputedStyle(label) : null;
    const labelBox = label ? rectOf(label) : null;
    const overlap = (a, b) => Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) *
      Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
    const shapes = [...svg.querySelectorAll("g[class*='role-mark'] path, g[class*='role-mark'] line, g[class*='role-mark'] rect")];
    return {
      text: label ? label.textContent.trim() : null,
      paintOrderAttribute: label ? label.getAttribute("paint-order") : null,
      stroke: style ? style.stroke : null,
      strokeWidth: style ? style.strokeWidth : null,
      fill: style ? style.fill : null,
      surface: tokenColor("--resource-surface-subtle"),
      secondaryText: tokenColor("--resource-text-secondary"),
      seriesLines: svg.querySelectorAll("g[class*='mark-line'] path").length,
      symbolMarks: svg.querySelectorAll("g[class*='mark-symbol'] path").length,
      crossings: labelBox ? shapes.filter((shape) => overlap(labelBox, rectOf(shape)) > 0.5).length : 0
    };
  });
}

// O halo é do mecanismo compartilhado do pacote: contorno de superfície antes do
// preenchimento, texto com a cor secundária preservada e nenhum dado alterado.
function expectLegibleLabel(data, context) {
  expect(data.text, context).toBe("Limite operacional");
  expect(data.paintOrderAttribute, context).toBe("stroke fill");
  expect(data.strokeWidth, context).toBe("3px");
  expect(data.stroke, context).toBe(data.surface);
  expect(data.fill, context).toBe(data.secondaryText);
  expect(data.seriesLines, context).toBe(2);
  expect(data.symbolMarks, context).toBe(12);
  expect(data.crossings, context).toBeGreaterThan(0);
}

for (const hostName of ["unidade", "explicacao"]) {
  test("rótulo de referência legível e dados íntegros na " + hostName, async ({ page }, testInfo) => {
    const errors = await mount(page);
    let host = await openHost(page, hostName);
    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: 844 });
      await expect.poll(async () => (await chartReport(host)).text).toBe("Limite operacional");
      const data = await chartReport(host);
      expectLegibleLabel(data, hostName + " " + width + "px: " + JSON.stringify(data));
      if (CAPTURE_WIDTHS.includes(width)) {
        await page.screenshot({ path: testInfo.outputPath("chart-" + hostName + "-" + width + "-light.png") });
      }
    }
    // Rehidratação: reabrir a unidade recria a DOM do gráfico e o halo precisa voltar.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => globalThis.__explanationFixture.openUnit("theory"));
    host = await openHost(page, hostName);
    const rehydrated = await chartReport(host);
    expectLegibleLabel(rehydrated, hostName + " após rehidratar: " + JSON.stringify(rehydrated));
    expect(errors).toEqual([]);
  });

  test("rótulo de referência no tema escuro na " + hostName, async ({ page }, testInfo) => {
    const errors = await mount(page, { theme: "dark" });
    const host = await openHost(page, hostName);
    for (const width of CAPTURE_WIDTHS) {
      await page.setViewportSize({ width, height: 844 });
      await expect.poll(async () => (await chartReport(host)).text).toBe("Limite operacional");
      const data = await chartReport(host);
      expectLegibleLabel(data, "escuro " + hostName + " " + width + "px: " + JSON.stringify(data));
      await page.screenshot({ path: testInfo.outputPath("chart-" + hostName + "-" + width + "-dark.png") });
    }
    expect(errors).toEqual([]);
  });
}
