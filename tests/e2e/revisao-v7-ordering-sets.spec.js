import { expect, test } from "@playwright/test";
import { mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const evidenceRoot = resolve(".tmp/agent/revisao-v7/ordering-sets");

const fallbackSet = {
  kind: "venn",
  universeLabel: "Elementos observados",
  sets: [
    { id: "alpha", symbol: "A", label: "Alpha" },
    { id: "beta", symbol: "B", label: "Beta" },
    { id: "gamma", symbol: "C", label: "Gamma" }
  ],
  regions: [
    { id: "alpha-only", setIds: ["alpha"], label: "Somente A", items: ["um"] },
    { id: "beta-only", setIds: ["beta"], label: "Somente B", items: ["dois"] },
    { id: "gamma-only", setIds: ["gamma"], label: "Somente C", items: ["três"] },
    { id: "alpha-beta", setIds: ["alpha", "beta"], label: "A e B", items: ["quatro"] },
    { id: "alpha-gamma", setIds: ["alpha", "gamma"], label: "A e C", items: ["cinco"] },
    { id: "beta-gamma", setIds: ["beta", "gamma"], label: "B e C", items: ["seis"] },
    { id: "all-three", setIds: ["alpha", "beta", "gamma"], label: "A, B e C", items: ["sete"] },
    { id: "outside", setIds: [], label: "Fora dos conjuntos", items: ["oito"] }
  ]
};

const normalSet = {
  kind: "venn",
  sets: [
    { id: "left", symbol: "L", label: "Esquerda" },
    { id: "right", symbol: "R", label: "Direita" }
  ],
  regions: [
    { id: "left-only", setIds: ["left"], label: "Somente L", items: ["um"] },
    { id: "right-only", setIds: ["right"], label: "Somente R", items: ["dois"] },
    { id: "both", setIds: ["left", "right"], label: "L e R", items: ["três"] },
    { id: "outside", setIds: [], label: "Fora dos conjuntos", items: ["quatro"] }
  ]
};

const content = [
  {
    id: "sequence-text",
    package: "aralearn.resource.paragraph",
    version: "1.0.0",
    data: { text: "Primeiro preparar; depois executar; por fim conferir." }
  },
  { id: "fallback-diagram", package: "aralearn.resource.set_diagram", version: "1.0.0", data: fallbackSet },
  { id: "normal-diagram", package: "aralearn.resource.set_diagram", version: "1.0.0", data: normalSet }
];

const practiceResponse = {
  id: "ordering-response",
  package: "aralearn.response.ordering",
  version: "3.0.0",
  data: {
    targets: [
      { id: "prepare", targetInstanceId: "sequence-text", targetPath: "text:prepare", answer: "Primeiro preparar" },
      { id: "execute", targetInstanceId: "sequence-text", targetPath: "text:execute", answer: "depois executar" },
      { id: "check", targetInstanceId: "sequence-text", targetPath: "text:check", answer: "por fim conferir" }
    ]
  }
};

async function mount(page, width) {
  await page.setViewportSize({ width, height: 844 });
  await page.route("**/main.js", route => route.fulfill({
    status: 200,
    contentType: "text/javascript",
    body: ""
  }));
  for (const file of ["support/studyExplanationFixture.js", "fixtures/package/project-minimal.json"]) {
    await page.route(`**/tests/${file}`, route => route.fulfill({
      contentType: file.endsWith(".js") ? "text/javascript" : "application/json",
      body: readFileSync(new URL(`../${file}`, import.meta.url), "utf8")
    }));
  }
  await page.goto("/");
  await page.evaluate(async ({ content: fixtureContent, practiceResponse: fixtureResponse }) => {
    const { mountStudyExplanationFixture } = await import("/tests/support/studyExplanationFixture.js");
    document.body.innerHTML = '<div id="app-root"><div id="aralearn-editor-root"></div></div>';
    await mountStudyExplanationFixture(document.querySelector("#aralearn-editor-root"), {
      unit: "practice",
      practiceResponse: fixtureResponse,
      resourceContent: fixtureContent
    });
  }, { content, practiceResponse });
  await expect(page.locator(".card-sheet-content [data-set-diagram-state='ready']")).toHaveCount(2);
}

async function orderingValues(root) {
  return root.locator(".runtime-ordering-value").allTextContents();
}

function assertMarkerGeometry(root) {
  return root.locator("[data-region-id='alpha-gamma']").evaluate(node => ({
    placement: node.dataset.regionPlacement,
    anchorX: node.dataset.regionAnchorX,
    anchorY: node.dataset.regionAnchorY,
    number: node.querySelector("text:last-of-type")?.textContent,
    leader: node.querySelector(".package-set-marker-leader") !== null,
    anchor: node.querySelector(".package-set-marker-anchor") !== null,
    viewBox: node.closest("svg")?.getAttribute("viewBox")
  }));
}

for (const width of [390, 1280]) {
  test(`D026/O067/O053: ordering e conjuntos em Unidade e Explicação (${width}px)`, async ({ page }) => {
    mkdirSync(evidenceRoot, { recursive: true });
    await mount(page, width);
    const unit = page.locator(".card-sheet-content");
    const slots = unit.locator(".runtime-ordering-slot");
    await expect(slots).toHaveCount(3);
    expect(await orderingValues(unit)).toEqual(["depois executar; ", "por fim conferir; ", "Primeiro preparar."]);
    expect(await unit.locator(".runtime-markdown-paragraph").first().evaluate(node =>
      [...node.childNodes].filter(child => child.nodeType === Node.TEXT_NODE && child.textContent.trim()).map(child => child.textContent)
    )).toEqual([]);

    const geometry = await unit.locator(".runtime-ordering-slot").evaluateAll(nodes => nodes.map(node => ({
      top: node.getBoundingClientRect().top,
      textAlign: getComputedStyle(node.querySelector(".runtime-ordering-value")).textAlign,
      itemId: node.dataset.orderingItemId
    })));
    expect(geometry.map(({ itemId }) => itemId)).toEqual(["execute", "check", "prepare"]);
    expect(geometry.every((item, index) => index === 0 || item.top > geometry[index - 1].top)).toBe(true);
    expect(new Set(geometry.map(({ textAlign }) => textAlign))).toEqual(new Set(["start"]));
    await expect(unit.locator("[data-action='ordering-move']")).toHaveCount(6);
    expect(await unit.locator("[data-action='ordering-move']").evaluateAll(nodes => nodes.every(node => (
      node.textContent.trim() === "" && ["up", "down"].includes(node.dataset.orderingDirection)
    )))).toBe(true);

    const firstDown = unit.locator("[data-ordering-direction='down']:not([disabled])").first();
    const movedId = await firstDown.getAttribute("data-ordering-item-id");
    await firstDown.click();
    await expect(unit.locator(`.runtime-ordering-slot[data-ordering-item-id='${movedId}']`)).toBeFocused();
    const movedOrder = await orderingValues(unit);
    expect(movedOrder).toEqual(["por fim conferir; ", "depois executar; ", "Primeiro preparar."]);

    const fallback = unit.locator("[data-set-diagram]").first();
    await expect(fallback.locator("[data-region-id='alpha-gamma']")).toHaveAttribute("data-region-placement", "external");
    expect(await fallback.locator("[data-region-id]").allTextContents()).toEqual(["1", "2", "3", "4", "5", "6", "7", "8"]);
    expect(await assertMarkerGeometry(unit)).toMatchObject({
      placement: "external",
      anchorX: expect.any(String),
      anchorY: expect.any(String),
      number: "5",
      leader: true,
      anchor: true,
      viewBox: "0 0 355 250"
    });
    expect(await unit.locator("[data-set-diagram]").nth(1).locator("[data-region-placement]").count()).toBe(0);
    await expect(unit.locator("[data-set-diagram]").nth(1).locator("svg")).toHaveAttribute("viewBox", "0 0 300 250");

    await page.screenshot({ path: resolve(evidenceRoot, `unit-${width}.png`), fullPage: true });
    await page.getByRole("button", { name: "Explicação", exact: true }).click();
    const explanation = page.getByRole("dialog", { name: "Explicação", exact: true });
    await expect(explanation).toBeVisible();
    await expect(explanation.locator("[data-set-diagram-state='ready']")).toHaveCount(2);
    await expect(explanation.locator(".runtime-ordering-slot")).toHaveCount(0);
    await expect(explanation.locator("[data-region-id='alpha-gamma']")).toHaveAttribute("data-region-placement", "external");
    await expect(explanation.locator("[data-region-id='alpha-gamma']")).toContainText("5");
    await page.screenshot({ path: resolve(evidenceRoot, `explanation-${width}.png`), fullPage: true });
    await explanation.getByRole("button", { name: "Fechar explicação", exact: true }).click();
    await expect(page.getByRole("button", { name: "Explicação", exact: true })).toBeFocused();
    expect(await orderingValues(unit)).toEqual(movedOrder);
  });
}
