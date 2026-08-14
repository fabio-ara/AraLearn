import { expect, test } from "@playwright/test";

import { renderPackageCardBlocks } from "../../src/render/renderPackageCard.js";

const STYLES = [
  "/styles-tokens.css",
  "/styles-shell-baseline.css",
  "/styles.css"
];

function tableDocument(table, { renderOptions = {}, wrapCard = false } = {}) {
  const links = STYLES.map((href) => `<link rel="stylesheet" href="${href}">`).join("");
  const rendered = renderPackageCardBlocks({
    id: "table-card",
    position: 1,
    title: "Tabela",
    role: "theory",
    content: [{
      id: "table-1",
      package: "aralearn.resource.table",
      version: "1.0.0",
      data: table
    }],
    response: null,
    feedback: [],
    topics: [],
    sources: []
  }, renderOptions);
  const content = wrapCard
    ? '<section class="table-test-card card-portrait-body" style="height:auto;min-height:0;">' +
      '<div class="runtime-card-sheet"><div class="card-sheet-content">' +
      rendered +
      "</div></div></section>"
    : rendered;
  return "<!doctype html><html lang=\"pt-BR\"><head>" +
    '<meta name="viewport" content="width=device-width, initial-scale=1">' +
    `${links}</head><body>` +
    `<main style="width:100%;max-width:100%;padding:16px;">${content}</main>` +
    "</body></html>";
}

function expectSameBox(current, reference, label) {
  expect(current, label).not.toBeNull();
  expect(reference, label).not.toBeNull();
  expect(Math.abs(current.x - reference.x), label).toBeLessThanOrEqual(1);
  expect(Math.abs(current.y - reference.y), label).toBeLessThanOrEqual(1);
  expect(Math.abs(current.width - reference.width), label).toBeLessThanOrEqual(1);
  expect(Math.abs(current.height - reference.height), label).toBeLessThanOrEqual(1);
}

test("table contém a rolagem horizontal no resource e não parte palavras arbitrariamente", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/");
  await page.setContent(tableDocument({
    layout: "wide",
    columns: ["Camada", "Função", "Exemplo", "Protocolo"],
    rows: [[
      "Aplicação",
      "Atender usuários",
      "Serviço corporativo",
      "IdentificadorExtensoSemPontoDeQuebra"
    ]]
  }));

  const wrapper = page.locator(".runtime-table-wrap");
  await expect(wrapper).toBeVisible();
  const dimensions = await wrapper.evaluate((element) => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
    overflowWrap: getComputedStyle(element.querySelector("td")).overflowWrap,
    wordBreak: getComputedStyle(element.querySelector("td")).wordBreak
  }));

  expect(dimensions.scrollWidth).toBeGreaterThan(dimensions.clientWidth);
  expect(dimensions.overflowWrap).toBe("normal");
  expect(dimensions.wordBreak).toBe("normal");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);

  await wrapper.evaluate((element) => {
    element.scrollLeft = element.scrollWidth;
  });
  expect(await wrapper.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
});

test("table curta ocupa a largura disponível sem criar rolagem externa", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/");
  await page.setContent(tableDocument({
    columns: ["Termo", "Síntese"],
    rows: [["Elasticidade", "Ajuste de capacidade conforme a demanda"]]
  }));

  const wrapper = page.locator(".runtime-table-wrap");
  const box = await wrapper.boundingBox();
  const frame = await page.locator(".runtime-table").boundingBox();

  expect(box).not.toBeNull();
  expect(frame).not.toBeNull();
  expect(Math.abs(frame.width - box.width)).toBeLessThanOrEqual(2);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
});

test("listas e multilinhas permanecem contidas ao selecionar e editar table", async ({ page }) => {
  const table = {
    columns: ["Camada", "Responsabilidades"],
    rows: [[
      "Aplicação\nServiço",
      "- atender usuários\n- validar entrada"
    ]]
  };
  const targetId = "content:table-1";
  const commonOptions = {
    resourceSelectionEnabled: true,
    selectedResourceTargetIds: [targetId]
  };

  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/");
  await page.setContent(tableDocument(table, {
    renderOptions: commonOptions,
    wrapCard: true
  }));

  await expect(page.locator(".runtime-table-cell-content br")).toHaveCount(1);
  await expect(page.locator(".runtime-table-cell-content .runtime-markdown-list li"))
    .toHaveCount(2);
  const cardBefore = await page.locator(".table-test-card").boundingBox();
  const resourceBefore = await page.locator(".runtime-resource-edit-target").boundingBox();

  await page.setContent(tableDocument(table, {
    renderOptions: {
      ...commonOptions,
      manualEditingTargetId: targetId
    },
    wrapCard: true
  }));
  const resource = page.locator(".runtime-resource-edit-target");
  await resource.evaluate(async (element) => {
    const { activateManualCardEdit } = await import("/src/ui/manualCardEdit.js");
    activateManualCardEdit(element);
  });

  expectSameBox(
    await page.locator(".table-test-card").boundingBox(),
    cardBefore,
    "card ao selecionar table"
  );
  expectSameBox(await resource.boundingBox(), resourceBefore, "table selecionada");

  const editableCell = resource.locator('[data-manual-edit-path="rows[0][1]"]');
  await editableCell.fill(Array.from(
    { length: 18 },
    (_value, index) => `- responsabilidade ${index + 1}`
  ).join("\n"));

  expectSameBox(
    await page.locator(".table-test-card").boundingBox(),
    cardBefore,
    "card após edição multilinha"
  );
  expectSameBox(await resource.boundingBox(), resourceBefore, "table após edição multilinha");
  const scrollState = await resource.locator(".runtime-resource-selection-content")
    .evaluate((element) => ({
      clientHeight: element.clientHeight,
      scrollHeight: element.scrollHeight
    }));
  expect(scrollState.scrollHeight).toBeGreaterThan(scrollState.clientHeight);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
});
