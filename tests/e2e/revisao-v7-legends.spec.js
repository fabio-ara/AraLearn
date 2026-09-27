import { expect, test } from "@playwright/test";

const styles = ["/styles-tokens.css", "/styles-shell-baseline.css", "/styles.css", "/course-authoring.css"];
const widths = [320, 390, 1280];

async function bootstrap(page) {
  await page.goto("/");
  await page.setContent('<!doctype html><html lang="pt-BR"><head>' +
    styles.map((href) => `<link rel="stylesheet" href="${href}">`).join("") +
    '</head><body style="margin:0"><main id="fixture"></main></body></html>');
}

async function mountPackage(page, packageName, customData = null) {
  await bootstrap(page);
  await page.evaluate(async ({ packageName, customData }) => {
    const module = await import(`/src/resources/packages/${packageName}/index.js`);
    const exportName = packageName === "interlinear-gloss" ? "interlinearGlossPackage" : `${packageName}Package`;
    const definition = module[exportName];
    const data = structuredClone(customData || definition.authoringContract.example);
    const root = document.querySelector("#fixture");
    root.innerHTML = definition.render(data);
    await definition.hydrate?.(root);
    await document.fonts.ready;
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  }, { packageName, customData });
}

async function pageGeometry(page, selector) {
  return page.locator(selector).evaluate(node => {
    const box = node.getBoundingClientRect();
    const style = getComputedStyle(node);
    return {
      top: box.top,
      bottom: box.bottom,
      width: box.width,
      height: box.height,
      fontSize: style.fontSize,
      borderTopWidth: style.borderTopWidth,
      paddingTop: style.paddingTop,
      scrollWidth: node.scrollWidth,
      clientWidth: node.clientWidth
    };
  });
}

test("Q013: legenda do grafo explica V e E na representação corrente", async ({ page }, testInfo) => {
  for (const width of widths) {
    await page.setViewportSize({ width, height: 900 });
    await mountPackage(page, "graph");
    const figure = page.locator(".package-math-graph");
    await expect(figure.locator("svg").first()).toBeVisible();
    const caption = figure.locator("figcaption");
    await expect(caption).toContainText(/V: vértices \(\d+\); E: arestas(?: direcionadas)? \(\d+\)/u);
    const bounds = await caption.boundingBox();
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(width + 1);
    await page.screenshot({ path: testInfo.outputPath(`graph-legend-${width}.png`), fullPage: true });
  }
});

test("D012/O020: Unidade de plano materializa Vega, texto equivalente e legenda depois do plot", async ({ page }, testInfo) => {
  for (const width of widths) {
    await page.setViewportSize({ width, height: 900 });
    await mountPackage(page, "plane");

    const canvas = page.locator(".package-plane-canvas");
    const legend = page.locator(".package-plane-legend");
    const objectKey = page.locator(".package-plane-object-key");
    await expect(canvas).toHaveAttribute("data-vega-status", "ready");
    await expect(canvas.locator("svg")).toHaveCount(1);
    await expect(canvas).toHaveAttribute("role", "graphics-document");
    await expect(canvas).toHaveAttribute("aria-roledescription", "visualization");
    await expect(legend).toContainText("Objeto original");
    await expect(legend).toContainText("Imagem por A");
    await expect(objectKey).toContainText("Ponto");
    await expect(objectKey).toContainText("Vetor");
    await expect(objectKey).toContainText("Região");
    await expect(objectKey).not.toContainText("Trajetória");

    const geometry = await page.evaluate(() => {
      const plot = document.querySelector(".package-plane-canvas").getBoundingClientRect();
      const legend = document.querySelector(".package-plane-legend").getBoundingClientRect();
      const figure = document.querySelector(".package-plane-figure");
      const legendStyle = getComputedStyle(document.querySelector(".package-plane-legend"));
      const baseProbe = document.createElement("span");
      const typeSmProbe = document.createElement("span");
      const secondaryProbe = document.createElement("span");
      baseProbe.textContent = typeSmProbe.textContent = "probe";
      baseProbe.style.fontSize = "var(--type-base)";
      typeSmProbe.style.fontSize = "var(--type-sm)";
      secondaryProbe.style.color = "var(--resource-text-secondary)";
      document.body.append(baseProbe, typeSmProbe, secondaryProbe);
      const baseFontSize = getComputedStyle(baseProbe).fontSize;
      const typeSmFontSize = getComputedStyle(typeSmProbe).fontSize;
      const secondaryColor = getComputedStyle(secondaryProbe).color;
      baseProbe.remove();
      typeSmProbe.remove();
      secondaryProbe.remove();
      return {
        plotBottom: plot.bottom,
        legendTop: legend.top,
        canvasAriaLabel: document.querySelector(".package-plane-canvas").getAttribute("aria-label"),
        legendFontSize: legendStyle.fontSize,
        typeSmFontSize,
        baseFontSize,
        legendColor: legendStyle.color,
        secondaryColor,
        documentOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        figureOverflow: figure.scrollWidth - figure.clientWidth
      };
    });
    expect(geometry.legendTop, `${width}px legend must follow plot`).toBeGreaterThanOrEqual(geometry.plotBottom - 1);
    expect(geometry.canvasAriaLabel, `${width}px plot accessible text`).toMatch(/Eixo x: Coordenada x.*Eixo y: Coordenada y/u);
    expect(geometry.documentOverflow, `${width}px document overflow`).toBeLessThanOrEqual(1);
    expect(geometry.figureOverflow, `${width}px figure overflow`).toBeLessThanOrEqual(1);
    expect(geometry.legendFontSize, `${width}px legend uses --type-sm`).toBe(geometry.typeSmFontSize);
    expect(Number.parseFloat(geometry.legendFontSize), `${width}px legend is secondary to base`).toBeLessThan(Number.parseFloat(geometry.baseFontSize));
    expect(geometry.legendColor, `${width}px legend uses secondary color`).toBe(geometry.secondaryColor);
    await testInfo.attach(`plane-${width}.json`, {
      body: JSON.stringify({ width, geometry }, null, 2),
      contentType: "application/json"
    });
    await page.screenshot({ path: testInfo.outputPath(`plane-${width}.png`), fullPage: true });
  }
});

test("legenda geométrica só aparece quando distingue mais de um tipo", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  const oneType = {
    xAxis: { label: "Coordenada x", domain: [-1, 3] },
    yAxis: { label: "Coordenada y", domain: [-1, 3] },
    paths: [{ id: "route", label: "Trajetória", points: [[0, 0], [1, 2], [2, 1]] }]
  };
  await mountPackage(page, "plane", oneType);
  await expect(page.locator(".package-plane-legend")).toHaveCount(1);
  await expect(page.locator(".package-plane-legend")).toContainText("Trajetórias");
  await expect(page.locator(".package-plane-object-key")).toHaveCount(0);

  const mixed = {
    xAxis: { label: "Coordenada x", domain: [-1, 3] },
    yAxis: { label: "Coordenada y", domain: [-1, 3] },
    points: [{ id: "p", label: "Ponto", at: [1, 1] }],
    vectors: [{ id: "v", label: "Vetor", from: [0, 0], to: [1, 0] }],
    paths: [
      { id: "region", label: "Região", closed: true, points: [[0, 0], [2, 0], [2, 2], [0, 2]] },
      { id: "trajectory", label: "Trajetória", points: [[0, 2], [1, 3], [2, 2]] }
    ]
  };
  await mountPackage(page, "plane", mixed);
  const groupLegend = page.locator(".package-plane-legend");
  await expect(groupLegend).toHaveCount(1);
  await expect(groupLegend).toContainText("Pontos");
  await expect(groupLegend).toContainText("Vetores");
  await expect(groupLegend).toContainText("Regiões");
  await expect(groupLegend).toContainText("Trajetórias");
  const objectKey = page.locator(".package-plane-object-key");
  await expect(objectKey).toContainText("Ponto");
  await expect(objectKey).toContainText("Vetor");
  await expect(objectKey).toContainText("Região");
  await expect(objectKey).toContainText("Trajetória");
  await expect(objectKey).not.toContainText("Região ou trajetória");
  await expect(objectKey.locator(".package-plane-key-symbol")).toHaveCount(4);
  await expect(objectKey.locator(".package-plane-key-symbol.point")).toHaveCount(1);
  await expect(objectKey.locator(".package-plane-key-symbol.vector")).toHaveCount(1);
  await expect(objectKey.locator(".package-plane-key-symbol.region")).toHaveCount(1);
  await expect(objectKey.locator(".package-plane-key-symbol.trajectory")).toHaveCount(1);
});

test("O014/Q008: Explicação interlinear mantém texto legível e abreviações separadas", async ({ page }, testInfo) => {
  for (const width of widths) {
    await page.setViewportSize({ width, height: 900 });
    await mountPackage(page, "interlinear-gloss");

    const gloss = page.locator(".runtime-interlinear-gloss");
    const abbreviations = page.locator(".runtime-interlinear-abbreviations");
    await expect(gloss).toContainText("Gila");
    await expect(gloss).toContainText("they-OBL-GEN");
    await expect(gloss).toContainText("Agora, a fazenda deles");
    await expect(abbreviations).toContainText("OBL");
    await expect(abbreviations).toContainText("oblíquo");
    await expect(abbreviations).toHaveAttribute("aria-label", "Abreviações da glosa");

    const geometry = await pageGeometry(page, ".runtime-interlinear-abbreviations");
    expect(Number.parseFloat(geometry.borderTopWidth), `${width}px abbreviation border`).toBeGreaterThan(0);
    expect(Number.parseFloat(geometry.paddingTop), `${width}px abbreviation padding`).toBeGreaterThan(0);
    expect(geometry.scrollWidth - geometry.clientWidth, `${width}px abbreviation overflow`).toBeLessThanOrEqual(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), `${width}px document overflow`).toBeLessThanOrEqual(1);
    await testInfo.attach(`gloss-${width}.json`, {
      body: JSON.stringify({ width, geometry }, null, 2),
      contentType: "application/json"
    });
    await page.screenshot({ path: testInfo.outputPath(`gloss-${width}.png`), fullPage: true });
  }
});
