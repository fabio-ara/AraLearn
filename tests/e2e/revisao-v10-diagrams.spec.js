import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

// Hidratação real dos diagramas de sistema no Estudo: enquadramento inicial em
// escala natural (Unidade e Explicação, 320/390/430/1280), vínculo decorado de
// aresta rotulada sem colisão, guarda/ação com self-loop e exploração com retorno
// de foco. A fixture é servida do disco, como nos demais specs de fixture do
// Estudo, para valer tanto no modo repositório quanto no artefato publicado.
const FIXTURE_FILES = [
  ["**/tests/gallery/revisao-v10-diagrams.html*", "../gallery/revisao-v10-diagrams.html", "text/html"],
  ["**/tests/support/revisaoV10DiagramFixture.js", "../support/revisaoV10DiagramFixture.js", "text/javascript"],
  ["**/tests/support/revisaoV10DiagramCases.js", "../support/revisaoV10DiagramCases.js", "text/javascript"],
  ["**/tests/support/studyExplanationFixture.js", "../support/studyExplanationFixture.js", "text/javascript"],
  ["**/tests/fixtures/package/project-minimal.json", "../fixtures/package/project-minimal.json", "application/json"]
];

const WIDTHS = [320, 390, 430, 1280];

async function mount(page, { width, height = 844, diagram, unit = "theory" }) {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width, height });
  for (const [url, file, contentType] of FIXTURE_FILES) {
    await page.route(url, (route) => route.fulfill({ status: 200, contentType,
      body: readFileSync(new URL(file, import.meta.url), "utf8") }));
  }
  await page.goto("/tests/gallery/revisao-v10-diagrams.html?diagram=" + diagram + "&unit=" + unit);
  await expect.poll(() => page.evaluate(() => globalThis.__EXPLANATION_FIXTURE_READY__ === true)).toBe(true);
  return errors;
}

async function openHost(page, hostName) {
  if (hostName === "explicacao") {
    await page.getByRole("button", { name: "Explicação", exact: true }).click();
    const host = page.locator(".study-explanation-body");
    await expect(host.locator('[data-graphviz-status="ready"]')).toHaveCount(1);
    return host;
  }
  const host = page.locator(".card-sheet-content");
  await expect(host.locator('[data-graphviz-status="ready"]')).toHaveCount(1);
  return host;
}

function metrics(host) {
  return host.evaluate((root) => {
    const canvas = root.querySelector('[data-resource-scroll-frame="diagram"]');
    const svg = canvas.querySelector("svg");
    const canvasRect = canvas.getBoundingClientRect();
    const scale = svg.getBoundingClientRect().width / svg.viewBox.baseVal.width;
    const visible = (box) => box.right > canvasRect.left + 1 && box.left < canvasRect.right - 1 &&
      box.bottom > canvasRect.top + 1 && box.top < canvasRect.bottom - 1;
    const nodes = [...svg.querySelectorAll("g.node")];
    const figure = root.querySelector(".package-system-diagram");
    const focusId = figure ? figure.dataset.systemDiagramFocusId || "" : "";
    const focus = focusId ? svg.querySelector("g#" + CSS.escape(focusId)) : null;
    const sizes = [...svg.querySelectorAll("g.node text")]
      .map((text) => Number(getComputedStyle(text).fontSize.replace("px", "")) * scale)
      .filter((size) => size > 0);
    return {
      scale: Number(scale.toFixed(3)),
      minTextPx: sizes.length ? Number(Math.min(...sizes).toFixed(2)) : null,
      maxTextPx: sizes.length ? Number(Math.max(...sizes).toFixed(2)) : null,
      visibleNodes: nodes.filter((node) => visible(node.getBoundingClientRect())).length,
      focusVisible: focus ? visible(focus.getBoundingClientRect()) : null,
      scroll: [Math.round(canvas.scrollLeft), Math.round(canvas.scrollTop)]
    };
  });
}

// Ponto de conteúdo no centro do quadro: preservado ao entrar e sair da tela inteira.
function centerContent(host) {
  return host.evaluate((root) => {
    const canvas = root.querySelector('[data-resource-scroll-frame="diagram"]');
    const svg = canvas.querySelector("svg");
    const scale = Number(svg.getAttribute("data-diagram-scale") || 1);
    return {
      x: Number(((canvas.scrollLeft + canvas.clientWidth / 2) / scale).toFixed(1)),
      y: Number(((canvas.scrollTop + canvas.clientHeight / 2) / scale).toFixed(1))
    };
  });
}

// Recorte de conteúdo visível: confere que o ponto central anterior continua à
// vista quando o quadro cresce (a rolagem é limitada pelo próprio conteúdo).
function visibleContent(host) {
  return host.evaluate((root) => {
    const canvas = root.querySelector('[data-resource-scroll-frame="diagram"]');
    const svg = canvas.querySelector("svg");
    const scale = Number(svg.getAttribute("data-diagram-scale") || 1);
    return {
      left: Number((canvas.scrollLeft / scale).toFixed(1)),
      top: Number((canvas.scrollTop / scale).toFixed(1)),
      right: Number(((canvas.scrollLeft + canvas.clientWidth) / scale).toFixed(1)),
      bottom: Number(((canvas.scrollTop + canvas.clientHeight) / scale).toFixed(1))
    };
  });
}

function edgeGeometry(host, edgeId) {
  return host.evaluate((root, id) => {
    const svg = root.querySelector(".package-system-diagram-svg");
    const group = svg.querySelector("g#" + CSS.escape(id));
    if (!group) return null;
    const boxOf = (nodes) => {
      const boxes = nodes.map((node) => node.getBBox()).filter((box) => box.width > 0 && box.height > 0);
      if (!boxes.length) return null;
      return { x: Math.min(...boxes.map((b) => b.x)), y: Math.min(...boxes.map((b) => b.y)),
        right: Math.max(...boxes.map((b) => b.x + b.width)), bottom: Math.max(...boxes.map((b) => b.y + b.height)) };
    };
    const area = (box) => Math.max(0, box.right - box.x) * Math.max(0, box.bottom - box.y);
    const intersection = (a, b) => {
      const width = Math.min(a.right, b.right) - Math.max(a.x, b.x);
      const height = Math.min(a.bottom, b.bottom) - Math.max(a.y, b.y);
      return Math.max(0, width) * Math.max(0, height);
    };
    const texts = [...group.querySelectorAll(":scope > text")];
    const label = boxOf(texts);
    const others = [
      ...[...svg.querySelectorAll("text")].filter((text) => !text.closest('g[id^="system-edge-"]'))
        .map((text) => ({ text: text.textContent.trim().slice(0, 24), box: text.getBBox() })),
      ...[...svg.querySelectorAll(".node :is(polygon, ellipse, path)")]
        .map((shape) => ({ text: "forma de " + (shape.closest("g[id]") ? shape.closest("g[id]").id : "?"),
          box: shape.getBBox() }))
    ];
    const collisions = [];
    if (label) {
      const labelArea = area(label);
      others.forEach((item) => {
        const shared = intersection(label, item.box);
        if (shared / Math.max(1, Math.min(labelArea, area(item.box))) > 0.02) collisions.push({ with: item.text });
      });
    }
    return {
      decorations: group.querySelectorAll(":scope > polyline").length,
      label: texts.map((text) => text.textContent.trim()).join(" ").replace(/\s+/gu, " "),
      collisions
    };
  }, edgeId);
}

for (const width of WIDTHS) {
  for (const hostName of ["unidade", "explicacao"]) {
    test("contêiner abre em escala natural com objeto visível em " + width + "px na " + hostName, async ({ page }, testInfo) => {
      const errors = await mount(page, { width, diagram: "container" });
      const host = await openHost(page, hostName);
      const data = await metrics(host);
      expect(data.scale, JSON.stringify(data)).toBeGreaterThan(0.999);
      expect(data.maxTextPx, JSON.stringify(data)).toBeGreaterThanOrEqual(12);
      expect(data.minTextPx, JSON.stringify(data)).toBeGreaterThanOrEqual(10);
      expect(data.visibleNodes, JSON.stringify(data)).toBeGreaterThanOrEqual(1);
      expect(data.focusVisible, JSON.stringify(data)).toBe(true);
      await page.screenshot({ path: testInfo.outputPath("container-" + width + "-" + hostName + ".png") });
      expect(errors).toEqual([]);
    });
  }
}

for (const hostName of ["unidade", "explicacao"]) {
  test("BPMN denso mantém rótulo decorado e sem colisão na " + hostName, async ({ page }) => {
    const errors = await mount(page, { width: 390, diagram: "dense-bpmn" });
    const host = await openHost(page, hostName);
    const geometry = await edgeGeometry(host, "system-edge-m1");
    expect(geometry, "aresta do fluxo de mensagem").not.toBeNull();
    expect(geometry.decorations, JSON.stringify(geometry)).toBe(1);
    expect(geometry.label, JSON.stringify(geometry)).toContain("confirmação registrada");
    expect(geometry.collisions, JSON.stringify(geometry)).toEqual([]);
    expect(errors).toEqual([]);
  });
}

test("BPMN com rótulo longo preserva texto e vínculo decorado", async ({ page }) => {
  const errors = await mount(page, { width: 390, diagram: "bpmn-long-label" });
  const host = await openHost(page, "unidade");
  const geometry = await edgeGeometry(host, "system-edge-f7");
  expect(geometry.decorations, JSON.stringify(geometry)).toBe(1);
  expect(geometry.label, JSON.stringify(geometry)).toContain("dados recebidos após validação do formulário");
  expect(geometry.collisions, JSON.stringify(geometry)).toEqual([]);
  expect(errors).toEqual([]);
});

test("máquina de estados mantém guarda, ação e self-loop com vínculo decorado", async ({ page }) => {
  const errors = await mount(page, { width: 390, diagram: "guarded-machine" });
  const host = await openHost(page, "unidade");
  const geometry = await edgeGeometry(host, "system-edge-loop");
  expect(geometry.decorations, JSON.stringify(geometry)).toBe(1);
  expect(geometry.label, JSON.stringify(geometry)).toContain("receber evento de nova tentativa");
  expect(geometry.label, JSON.stringify(geometry)).toContain("limite ainda não atingido");
  expect(geometry.label, JSON.stringify(geometry)).toContain("registrar a nova tentativa");
  expect(geometry.collisions, JSON.stringify(geometry)).toEqual([]);
  expect(errors).toEqual([]);
});

test("exploração preserva zoom, pan, estado lembrado e retorno de foco", async ({ page }) => {
  const errors = await mount(page, { width: 390, diagram: "guarded-machine" });
  const host = await openHost(page, "unidade");
  const figure = host.locator(".package-system-diagram");
  const canvas = host.locator('[data-resource-scroll-frame="diagram"]');
  const initial = await metrics(host);
  await figure.getByRole("button", { name: "Aumentar zoom", exact: true }).click();
  await expect.poll(async () => (await metrics(host)).scale).toBeGreaterThan(initial.scale);
  const zoomed = await metrics(host);
  const centerBefore = await centerContent(host);
  await canvas.focus();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowRight");
  await expect.poll(() => canvas.evaluate((node) => node.scrollLeft + node.scrollTop)).toBeGreaterThan(0);
  const panned = await metrics(host);
  const trigger = figure.getByRole("button", { name: "Explorar diagrama em tela inteira", exact: true });
  await trigger.click();
  const dialog = page.locator("dialog[open]");
  await expect(dialog).toBeVisible();
  await expect.poll(async () => (await metrics(host)).scale).toBeCloseTo(zoomed.scale, 2);
  const expanded = await metrics(host);
  expect(expanded.scale, JSON.stringify(expanded)).toBeCloseTo(zoomed.scale, 2);
  const visible = await visibleContent(host);
  const view = JSON.stringify([centerBefore, visible]);
  expect(centerBefore.x, view).toBeGreaterThanOrEqual(visible.left - 1);
  expect(centerBefore.x, view).toBeLessThanOrEqual(visible.right + 1);
  expect(centerBefore.y, view).toBeGreaterThanOrEqual(visible.top - 1);
  expect(centerBefore.y, view).toBeLessThanOrEqual(visible.bottom + 1);
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(trigger).toBeFocused();
  await expect.poll(async () => (await metrics(host)).scale).toBeCloseTo(zoomed.scale, 2);
  const backInline = await metrics(host);
  expect(backInline.scale, JSON.stringify(backInline)).toBeCloseTo(zoomed.scale, 2);
  // A tela inteira preserva escala, foco e conteúdo visível; a posição exata de
  // rolagem do cartão não é o contrato do retorno (o quadro maior mostra outro
  // recorte), então ela é registrada e não comparada aqui.
  console.log("EXPLORE " + JSON.stringify({ initial, zoomed, panned, expanded, backInline }));
  // Estado lembrado: reabrir a unidade mantém a escala explorada pelo estudante.
  await host.locator(".package-system-diagram-svg").evaluate((node) => { node.dataset.probeMark = "before"; });
  await page.evaluate(() => globalThis.__explanationFixture.openUnit("theory"));
  await expect(host.locator('[data-graphviz-status="ready"]')).toHaveCount(1);
  const sameDom = await host.locator(".package-system-diagram-svg")
    .evaluate((node) => node.dataset.probeMark === "before");
  console.log("EXPLORE dom preservado=" + sameDom);
  const reopened = await metrics(host);
  console.log("EXPLORE reopened " + JSON.stringify(reopened));
  expect(reopened.scale, JSON.stringify(reopened)).toBeCloseTo(zoomed.scale, 2);
  await host.getByRole("button", { name: "Diminuir zoom", exact: true }).click();
  await expect.poll(async () => (await metrics(host)).scale).toBeLessThan(reopened.scale);
  expect(errors).toEqual([]);
});
