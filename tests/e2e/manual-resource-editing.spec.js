import { expect, test } from "@playwright/test";

import { renderPackageCardBlocks } from "../../src/render/renderPackageCard.js";
import { RESOURCE_PACKAGE_REGISTRY } from "../../src/resources/packages/index.js";

const STYLES = ["/styles-tokens.css", "/styles-shell-baseline.css", "/styles.css"];
const SYSTEM_PACKAGE_ID = "aralearn.resource.software_system_context";
const SYSTEM_VERSION = "1.0.0";

function packageCardDocument({ packageId, instanceId, data, editing }) {
  const targetId = `content:${instanceId}`;
  const rendered = renderPackageCardBlocks({
    id: `${instanceId}-card`,
    position: 1,
    title: "Recurso",
    role: "theory",
    content: [{ id: instanceId, package: packageId, version: "1.0.0", data }],
    response: null,
    feedback: [],
    topics: [],
    sources: []
  }, {
    resourceSelectionEnabled: true,
    selectedResourceTargetIds: [targetId],
    manualEditingTargetId: editing ? targetId : ""
  });
  const links = STYLES.map((href) => `<link rel="stylesheet" href="${href}">`).join("");
  return "<!doctype html><html lang=\"pt-BR\"><head>" +
    '<meta name="viewport" content="width=device-width, initial-scale=1">' +
    `${links}</head><body><main style="width:100%;max-width:390px;padding:16px">` +
    '<section class="manual-package-card card-portrait-body" style="height:auto;min-height:0">' +
    `<div class="runtime-card-sheet"><div class="card-sheet-content">${rendered}</div></div>` +
    "</section></main></body></html>";
}

function expectSameBox(current, reference, label) {
  expect(current, label).not.toBeNull();
  expect(reference, label).not.toBeNull();
  expect(Math.abs(current.x - reference.x), label).toBeLessThanOrEqual(1);
  expect(Math.abs(current.y - reference.y), label).toBeLessThanOrEqual(1);
  expect(Math.abs(current.width - reference.width), label).toBeLessThanOrEqual(1);
  expect(Math.abs(current.height - reference.height), label).toBeLessThanOrEqual(1);
}

function systemCardDocument({ editing }) {
  const targetId = "content:system-edit";
  const contract = RESOURCE_PACKAGE_REGISTRY.getAuthoringContract(
    SYSTEM_PACKAGE_ID,
    SYSTEM_VERSION
  );
  const rendered = renderPackageCardBlocks({
    id: "system-card",
    position: 1,
    title: "Contexto",
    role: "theory",
    content: [{
      id: "system-edit",
      package: SYSTEM_PACKAGE_ID,
      version: SYSTEM_VERSION,
      data: contract.contract.example
    }],
    response: null,
    feedback: [],
    topics: [],
    sources: []
  }, {
    resourceSelectionEnabled: true,
    selectedResourceTargetIds: [targetId],
    manualEditingTargetId: editing ? targetId : ""
  });
  const links = STYLES.map((href) => `<link rel="stylesheet" href="${href}">`).join("");
  return "<!doctype html><html lang=\"pt-BR\"><head>" +
    '<meta name="viewport" content="width=device-width, initial-scale=1">' +
    `${links}</head><body><main style="width:100%;max-width:390px;padding:16px">` +
    '<section class="manual-system-card card-portrait-body" style="height:auto;min-height:0">' +
    `<div class="runtime-card-sheet"><div class="card-sheet-content">${rendered}</div></div>` +
    "</section></main></body></html>";
}

async function hydrate(page, { activate = false } = {}) {
  await page.evaluate(async ({ activate }) => {
    const { RESOURCE_PACKAGE_REGISTRY } = await import("/src/resources/packages/index.js");
    await RESOURCE_PACKAGE_REGISTRY.hydrate(document);
    if (activate) {
      const { activateManualCardEdit } = await import("/src/ui/manualCardEdit.js");
      globalThis.__manualResourceController = activateManualCardEdit(
        document.querySelector(".runtime-resource-edit-target")
      );
    }
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  }, { activate });
}

async function graphGeometry(page) {
  return page.locator(".package-system-diagram-svg").evaluate((svg) => {
    const graph = svg.querySelector(".graph");
    const box = graph.getBBox();
    return {
      viewBox: svg.getAttribute("viewBox"),
      graph: { x: box.x, y: box.y, width: box.width, height: box.height }
    };
  });
}

test("edição textual materializa rótulo Graphviz após hydrate sem trocar a interface", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.setContent(systemCardDocument({ editing: false }));
  await hydrate(page);

  const cardBefore = await page.locator(".manual-system-card").boundingBox();
  const resourceBefore = await page.locator(".runtime-resource-edit-target").boundingBox();
  const graphBefore = await graphGeometry(page);

  await page.setContent(systemCardDocument({ editing: true }));
  await hydrate(page, { activate: true });
  await expect(page.locator("[data-graphviz-status='ready']")).toBeVisible();

  expectSameBox(await page.locator(".manual-system-card").boundingBox(), cardBefore, "card");
  expectSameBox(
    await page.locator(".runtime-resource-edit-target").boundingBox(),
    resourceBefore,
    "resource"
  );
  expect(await graphGeometry(page)).toEqual(graphBefore);

  await expect(page.locator(".package-manual-editor, form, textarea")).toHaveCount(0);
  await expect(page.getByText("Textos editáveis", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Representação — somente leitura", { exact: true })).toHaveCount(0);
  const label = page.locator('[data-manual-edit-path="system.label"]')
    .filter({ visible: true });
  await expect(label).toHaveCount(1);
  await expect(label).toBeEditable();
  await expect(label).toHaveText("AraLearn");

  await label.fill("Ambiente de aprendizagem com um nome deliberadamente mais extenso");
  expectSameBox(await page.locator(".manual-system-card").boundingBox(), cardBefore, "card digitado");
  expectSameBox(
    await page.locator(".runtime-resource-edit-target").boundingBox(),
    resourceBefore,
    "resource digitado"
  );
  expect(await graphGeometry(page)).toEqual(graphBefore);
  await expect(label).toBeFocused();

  await page.locator('[data-diagram-action="toggle-expanded"]').click();
  const dialog = page.locator("[data-diagram-modal][open]");
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('[data-manual-edit-path="system.label"]')).toHaveCount(1);
  const canvas = dialog.locator("[data-resource-scroll-frame='diagram']");
  const scaleBefore = Number(await canvas.locator("svg").getAttribute("data-diagram-scale"));
  await dialog.locator('[data-diagram-action="zoom-in"]').click();
  await expect.poll(async () => Number(
    await canvas.locator("svg").getAttribute("data-diagram-scale")
  )).toBeGreaterThan(scaleBefore);
  await label.dispatchEvent("pointerdown", {
    pointerId: 7,
    pointerType: "touch",
    clientX: 120,
    clientY: 240
  });
  await expect(canvas).not.toHaveClass(/is-diagram-panning/u);
  await label.fill("AraLearn em tela inteira");
  await expect(label).toBeFocused();
  await dialog.locator('[data-diagram-action="toggle-expanded"]').click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator(
    '.runtime-resource-edit-target [data-manual-edit-path="system.label"]'
  )).toHaveCount(1);

  const values = await page.locator(".runtime-resource-edit-target").evaluate(async (element) => {
    const { readManualCardEditPathValues } = await import("/src/ui/manualCardEdit.js");
    return readManualCardEditPathValues(element);
  });
  expect(values["system.label"]).toBe("AraLearn em tela inteira");
});

test("fronteira Graphviz associa paths repetidos e multilinha sem busca por literal", async ({ page }) => {
  const contract = RESOURCE_PACKAGE_REGISTRY.getAuthoringContract(
    "aralearn.resource.software_container",
    "1.0.0"
  );
  const data = structuredClone(contract.contract.example);
  const repeated = "Plataforma compartilhada extensa";
  data.prompt = repeated;
  data.system.label = repeated;
  data.system.description = repeated;
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.setContent(packageCardDocument({
    packageId: "aralearn.resource.software_container",
    instanceId: "container-edit",
    data,
    editing: false
  }));
  await hydrate(page);
  const cardBefore = await page.locator(".manual-package-card").boundingBox();
  const resourceBefore = await page.locator(".runtime-resource-edit-target").boundingBox();
  const graphBefore = await graphGeometry(page);

  await page.setContent(packageCardDocument({
    packageId: "aralearn.resource.software_container",
    instanceId: "container-edit",
    data,
    editing: true
  }));
  await hydrate(page, { activate: true });
  await expect(page.locator("[data-graphviz-status='ready']")).toBeVisible();
  const prompt = page.locator('[data-manual-edit-path="prompt"]');
  const label = page.locator('[data-manual-edit-path="system.label"]');
  const description = page.locator('[data-manual-edit-path="system.description"]');
  await expect(prompt).toHaveCount(1);
  await expect(label).toHaveCount(1);
  await expect(description).toHaveCount(1);
  await expect(prompt).toHaveText(repeated);
  await expect(label).toHaveText(repeated);
  await expect(description).toHaveText(repeated);
  expect(await page.locator("svg [data-manual-edit-path]").evaluateAll((nodes) => (
    nodes.filter((node) => node.namespaceURI === "http://www.w3.org/2000/svg").length
  ))).toBe(0);
  expectSameBox(await page.locator(".manual-package-card").boundingBox(), cardBefore, "card");
  expectSameBox(
    await page.locator(".runtime-resource-edit-target").boundingBox(),
    resourceBefore,
    "resource"
  );
  expect(await graphGeometry(page)).toEqual(graphBefore);

  await label.fill("Núcleo móvel");
  await expect(prompt).toHaveText(repeated);
  await expect(description).toHaveText(repeated);
  expectSameBox(await page.locator(".manual-package-card").boundingBox(), cardBefore, "card digitado");
  expectSameBox(
    await page.locator(".runtime-resource-edit-target").boundingBox(),
    resourceBefore,
    "resource digitado"
  );
  expect(await graphGeometry(page)).toEqual(graphBefore);
  const values = await page.locator(".runtime-resource-edit-target").evaluate(async (element) => {
    const { readManualCardEditPathValues } = await import("/src/ui/manualCardEdit.js");
    return readManualCardEditPathValues(element);
  });
  expect(values.prompt).toBe(repeated);
  expect(values["system.label"]).toBe("Núcleo móvel");
  expect(values["system.description"]).toBe(repeated);
});

test("literais repetidos em tabela permanecem campos independentes sem redimensionar", async ({ page }) => {
  const data = {
    columns: ["Etapa", "Valor"],
    rows: [["Primeira", "igual"], ["Segunda", "igual"]]
  };
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.setContent(packageCardDocument({
    packageId: "aralearn.resource.table",
    instanceId: "table-edit",
    data,
    editing: false
  }));
  await hydrate(page);
  const cardBefore = await page.locator(".manual-package-card").boundingBox();
  const resourceBefore = await page.locator(".runtime-resource-edit-target").boundingBox();

  await page.setContent(packageCardDocument({
    packageId: "aralearn.resource.table",
    instanceId: "table-edit",
    data,
    editing: true
  }));
  await hydrate(page, { activate: true });
  const first = page.locator('[data-manual-edit-path="rows[0][1]"]');
  const second = page.locator('[data-manual-edit-path="rows[1][1]"]');
  await expect(first).toHaveCount(1);
  await expect(second).toHaveCount(1);
  await expect(first).toHaveText("igual");
  await expect(second).toHaveText("igual");
  expectSameBox(await page.locator(".manual-package-card").boundingBox(), cardBefore, "card");
  expectSameBox(
    await page.locator(".runtime-resource-edit-target").boundingBox(),
    resourceBefore,
    "resource"
  );

  await first.fill("distinto e deliberadamente mais extenso");
  await expect(second).toHaveText("igual");
  expectSameBox(await page.locator(".manual-package-card").boundingBox(), cardBefore, "card digitado");
  expectSameBox(
    await page.locator(".runtime-resource-edit-target").boundingBox(),
    resourceBefore,
    "resource digitado"
  );
});

test("títulos Vega são associados pela orientação e preservam a unidade", async ({ page }) => {
  const contract = RESOURCE_PACKAGE_REGISTRY.getAuthoringContract(
    "aralearn.resource.chart",
    "1.0.0"
  );
  const data = contract.contract.example;
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.setContent(packageCardDocument({
    packageId: "aralearn.resource.chart",
    instanceId: "chart-edit",
    data,
    editing: false
  }));
  await hydrate(page);
  const canvasBefore = await page.locator(".package-chart-canvas").boundingBox();

  await page.setContent(packageCardDocument({
    packageId: "aralearn.resource.chart",
    instanceId: "chart-edit",
    data,
    editing: true
  }));
  await hydrate(page, { activate: true });
  const xAxis = page.locator('[data-manual-edit-path="xAxis.label"]');
  const yAxis = page.locator('[data-manual-edit-path="yAxis.label"]');
  await expect(xAxis).toHaveCount(1);
  await expect(yAxis).toHaveCount(1);
  await expect(xAxis).toHaveClass(/runtime-manual-svg-field/u);
  await expect(xAxis).toHaveText("Concorrência (requisições simultâneas)");
  await expect(page.locator("svg [data-manual-edit-path]")).toHaveCount(0);
  expectSameBox(await page.locator(".package-chart-canvas").boundingBox(), canvasBefore, "canvas");

  await xAxis.fill("Carga");
  await expect(xAxis).toHaveText("Carga (requisições simultâneas)");
  expectSameBox(
    await page.locator(".package-chart-canvas").boundingBox(),
    canvasBefore,
    "canvas digitado"
  );
  const values = await page.locator(".runtime-resource-edit-target").evaluate(async (element) => {
    const { readManualCardEditPathValues } = await import("/src/ui/manualCardEdit.js");
    return readManualCardEditPathValues(element);
  });
  expect(values["xAxis.label"]).toBe("Carga");
  expect(values["yAxis.label"]).toBe(data.yAxis.label);
});
