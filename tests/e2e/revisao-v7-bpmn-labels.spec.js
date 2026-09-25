import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const FLOW_LABEL = "dados recebidos";
const FLOW_EDGE_ID = "system-edge-f7";
const FLOW_EDGE_SELECTOR = "g#system-edge-f7";

async function mount(page, width, options = {}) {
  const unit = options.unit || "theory";
  const practiceResponse = options.practiceResponse || null;
  await page.setViewportSize({ width, height: 844 });
  await page.route("**/main.js", route => route.fulfill({ contentType: "application/javascript", body: "" }));
  for (const file of ["support/studyExplanationFixture.js", "fixtures/package/project-minimal.json"]) {
    await page.route("**/tests/" + file, route => route.fulfill({
      contentType: file.endsWith(".js") ? "text/javascript" : "application/json",
      body: readFileSync(resolve(repoRoot, "tests", file), "utf8")
    }));
  }
  await page.goto("/");
  await page.evaluate(async ({ unit, practiceResponse }) => {
    const { RESOURCE_PACKAGE_REGISTRY: registry } = await import("/src/resources/packages/index.js");
    const { mountStudyExplanationFixture } = await import("/tests/support/studyExplanationFixture.js");
    const definition = registry.get("aralearn.resource.bpmn_process", "1.0.0");
    const data = structuredClone(definition.authoringContract.example);
    document.body.innerHTML = '<div id="app-root"><div id="aralearn-editor-root"></div></div>';
    await mountStudyExplanationFixture(document.querySelector("#aralearn-editor-root"), {
      unit, practiceResponse: practiceResponse ? structuredClone(practiceResponse) : null, citationOccurrences: null,
      resourceContent: [{ id: "representation", package: definition.manifest.id,
        version: definition.manifest.version, data }]
    });
  }, { unit, practiceResponse });
  await page.waitForSelector('.card-sheet-content [data-graphviz-status="ready"]');
}

/**
 * Geometria real do rótulo do fluxo f7: texto íntegro, oclusão pelo preenchimento dos nós,
 * vínculo com a própria aresta e visibilidade dentro do quadro rolável.
 */
const measureFlowLabel = (hostSelector) => {
  const round = value => Math.round(value * 1000) / 1000;
  const normalize = value => String(value || "").replace(/\s+/gu, " ").trim();
  const host = document.querySelector(hostSelector);
  const canvas = host ? host.querySelector('[data-resource-scroll-frame="diagram"]') : null;
  const svg = canvas ? canvas.querySelector("svg") : null;
  if (!svg) return { error: "diagrama ausente" };
  const edge = svg.querySelector("g#system-edge-f7");
  const label = [...svg.querySelectorAll("text")].find(node => normalize(node.textContent) === "dados recebidos") || null;
  if (!label) return { labelPresent: false };
  const box = label.getBBox();
  const ownedNode = label.closest('g[id^="system-node-"]');
  const nodeShapes = [...svg.querySelectorAll('g[id^="system-node-"]')]
    .filter(group => group.id !== (ownedNode ? ownedNode.id : ""))
    .flatMap(group => [...group.querySelectorAll("polygon, path, ellipse, circle, rect")]);
  let covered = 0;
  let samples = 0;
  for (let column = 0; column < 80; column += 1) {
    for (let row = 0; row < 8; row += 1) {
      const x = box.x + (box.width * (column + 0.5)) / 80;
      const y = box.y + (box.height * (row + 0.5)) / 8;
      samples += 1;
      if (nodeShapes.some(shape => typeof shape.isPointInFill === "function"
        && shape.isPointInFill(new DOMPoint(x, y)))) covered += 1;
    }
  }
  const distanceToBox = point => {
    const dx = Math.max(box.x - point.x, 0, point.x - (box.x + box.width));
    const dy = Math.max(box.y - point.y, 0, point.y - (box.y + box.height));
    return Math.hypot(dx, dy);
  };
  const ranking = [...svg.querySelectorAll('g[id^="system-edge-"]')].map(group => {
    const path = group.querySelector("path");
    if (!path) return null;
    const length = path.getTotalLength();
    let best = Number.POSITIVE_INFINITY;
    for (let step = 0; step <= 200; step += 1) {
      best = Math.min(best, distanceToBox(path.getPointAtLength((length * step) / 200)));
    }
    return { edge: group.id, distance: round(best) };
  }).filter(Boolean).sort((first, second) => first.distance - second.distance);
  const client = label.getBoundingClientRect();
  const frame = canvas.getBoundingClientRect();
  return {
    labelPresent: true,
    text: label.textContent,
    insideFlowEdge: Boolean(edge && label.closest("g") === edge),
    nodeOcclusion: round(covered / samples),
    nearestEdge: ranking[0] ? ranking[0].edge : null,
    nearestEdgeDistance: ranking[0] ? ranking[0].distance : null,
    runnerUpDistance: ranking[1] ? ranking[1].distance : null,
    visibleInFrame: client.left >= frame.left - 0.5 && client.right <= frame.right + 0.5
      && client.top >= frame.top - 0.5 && client.bottom <= frame.bottom + 0.5
  };
};

const centerOnFlowLabel = (hostSelector) => {
  const host = document.querySelector(hostSelector);
  const canvas = host.querySelector('[data-resource-scroll-frame="diagram"]');
  const label = [...canvas.querySelectorAll("svg text")]
    .find(node => String(node.textContent).replace(/\s+/gu, " ").trim() === "dados recebidos");
  if (!label) return false;
  const canvasRect = canvas.getBoundingClientRect();
  const rect = label.getBoundingClientRect();
  canvas.scrollLeft += rect.left + rect.width / 2 - (canvasRect.left + canvas.clientWidth / 2);
  canvas.scrollTop += rect.top + rect.height / 2 - (canvasRect.top + canvas.clientHeight / 2);
  return true;
};

async function openExplanation(page) {
  await page.getByRole("button", { name: "Explicação", exact: true }).click();
  await page.waitForSelector('.study-explanation-body [data-graphviz-status="ready"]');
}

for (const width of [390, 1280]) {
  test("H009: rótulo do fluxo f7 íntegro e associado na Unidade e na Explicação (" + width + "px)",
    async ({ page }) => {
      await mount(page, width);
      for (const host of [".card-sheet-content", ".study-explanation-body"]) {
        if (host === ".study-explanation-body") await openExplanation(page);
        await expect(page.locator(host).locator(FLOW_EDGE_SELECTOR)).toHaveCount(1);
        const measured = await page.evaluate(measureFlowLabel, host);
        expect(measured.labelPresent, JSON.stringify(measured)).toBe(true);
        expect(measured.text, JSON.stringify(measured)).toBe(FLOW_LABEL);
        expect(measured.insideFlowEdge, JSON.stringify(measured)).toBe(true);
        expect(measured.nodeOcclusion, JSON.stringify(measured)).toBe(0);
        expect(measured.nearestEdge, JSON.stringify(measured)).toBe(FLOW_EDGE_ID);
        expect(measured.nearestEdgeDistance, JSON.stringify(measured)).toBeLessThanOrEqual(1);
        expect(measured.runnerUpDistance - measured.nearestEdgeDistance,
          JSON.stringify(measured)).toBeGreaterThan(12);
        expect(await page.evaluate(centerOnFlowLabel, host)).toBe(true);
        await page.waitForTimeout(120);
        const visible = await page.evaluate(measureFlowLabel, host);
        expect(visible.visibleInFrame, JSON.stringify(visible)).toBe(true);
        expect(visible.nodeOcclusion, JSON.stringify(visible)).toBe(0);
      }
    });
}

test("H009: pan e zoom preservam o rótulo do fluxo f7 em tela inteira", async ({ page }) => {
  await mount(page, 390);
  await openExplanation(page);
  await page.locator(".study-explanation-body")
    .getByRole("button", { name: "Explorar diagrama em tela inteira", exact: true }).click();
  await page.locator('dialog[open] [data-resource-scroll-frame="diagram"]').waitFor();
  for (let step = 0; step < 3; step += 1) {
    await page.locator('dialog[open] [data-diagram-action="zoom-in"]').click();
    await page.waitForTimeout(120);
  }
  expect(await page.evaluate(centerOnFlowLabel, "dialog[open]")).toBe(true);
  await page.waitForTimeout(150);
  const zoomed = await page.evaluate(measureFlowLabel, "dialog[open]");
  const scale = Number(await page.locator("dialog[open] svg[data-diagram-scale]").getAttribute("data-diagram-scale"));
  expect(scale).toBeGreaterThan(1.5);
  expect(zoomed.text, JSON.stringify(zoomed)).toBe(FLOW_LABEL);
  expect(zoomed.nodeOcclusion, JSON.stringify(zoomed)).toBe(0);
  expect(zoomed.visibleInFrame, JSON.stringify(zoomed)).toBe(true);
  await page.locator('dialog[open] [data-resource-scroll-frame="diagram"]').focus();
  for (let step = 0; step < 6; step += 1) {
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowDown");
  }
  await page.waitForTimeout(120);
  const panned = await page.evaluate(measureFlowLabel, "dialog[open]");
  expect(panned.text, JSON.stringify(panned)).toBe(FLOW_LABEL);
  expect(panned.nodeOcclusion, JSON.stringify(panned)).toBe(0);
  const scroll = await page.locator('dialog[open] [data-resource-scroll-frame="diagram"]')
    .evaluate(node => node.scrollLeft + node.scrollTop);
  expect(scroll).toBeGreaterThan(0);
});

test("H009: lacuna de prática no fluxo f7 continua operável", async ({ page }) => {
  await mount(page, 390, { unit: "practice", practiceResponse: { id: "response",
    package: "aralearn.response.gap", version: "1.0.0", data: { blanks: [{ id: "flow",
      targetInstanceId: "representation", targetPath: "flows[7].label", responseMode: "choice",
      answer: FLOW_LABEL, distractors: ["dados ausentes"] }] } } });
  const figure = page.locator(".card-sheet-content .package-system-diagram");
  const control = figure.locator('[data-action="text-gap-open-choice"]');
  await expect(control).toBeVisible();
  const geometry = await control.evaluate(node => {
    const frame = node.closest("foreignObject").getBoundingClientRect();
    const box = node.getBoundingClientRect();
    const canvas = node.closest('[data-resource-scroll-frame="diagram"]').getBoundingClientRect();
    return { insideFrame: box.left >= frame.left - 1 && box.right <= frame.right + 1,
      insideCanvas: box.left >= canvas.left - 1 && box.right <= canvas.right + 1 };
  });
  expect(geometry.insideFrame).toBe(true);
  expect(geometry.insideCanvas).toBe(true);
  await control.click();
  await page.locator('[data-text-gap-value="dados recebidos"]').click();
  await expect(figure.locator('[data-action="text-gap-open-choice"]')).toContainText(FLOW_LABEL);
});
