import { expect, test } from "@playwright/test";

import { RESOURCE_PACKAGE_REGISTRY } from "../../src/resources/packages/index.js";
import {
  renderPackageCardArticle,
  renderPackageCardBlocks
} from "../../src/render/renderPackageCard.js";

const STYLES = ["/styles-tokens.css", "/styles-shell-baseline.css", "/styles.css"];

const graphInstance = {
  id: "graph-test",
  package: "aralearn.resource.graph",
  version: "1.0.0",
  data: {
    prompt: "Observe os dois ciclos ligados por uma ponte.",
    name: "G",
    directed: false,
    layout: "force",
    vertices: [
      { id: "v1", label: "v₁" }, { id: "v2", label: "v₂" },
      { id: "v3", label: "v₃" }, { id: "v4", label: "v₄" },
      { id: "v5", label: "v₅" }, { id: "v6", label: "v₆" },
      { id: "v7", label: "v₇" }, { id: "v8", label: "v₈" }
    ],
    edges: [
      { id: "e12", from: "v1", to: "v2" }, { id: "e23", from: "v2", to: "v3" }, { id: "e31", from: "v3", to: "v1" },
      { id: "bridge", from: "v3", to: "v4", label: "ponte" },
      { id: "e45", from: "v4", to: "v5" }, { id: "e56", from: "v5", to: "v6" }, { id: "e64", from: "v6", to: "v4" },
      { id: "e47", from: "v4", to: "v7" }, { id: "e78", from: "v7", to: "v8" }
    ],
    highlight: { vertices: ["v3", "v4"], edges: ["bridge"] }
  }
};

const relationInstance = {
  id: "relation-test",
  package: "aralearn.resource.relation_map",
  version: "1.0.0",
  data: {
    prompt: "Relacione cada grupo à sua finalidade principal.",
    name: "R",
    relationMeaning: "tem como finalidade",
    leftSet: {
      label: "Grupo de monitoramento",
      items: [
        { id: "statistics", label: "Estatísticas do segmento" },
        { id: "history", label: "Histórico por intervalo" },
        { id: "alarms", label: "Alarmes configurados" },
        { id: "events", label: "Eventos observados" }
      ]
    },
    rightSet: {
      label: "Finalidade operacional",
      items: [
        { id: "counters", label: "Consultar contadores atuais" },
        { id: "samples", label: "Preservar amostras ao longo do tempo" },
        { id: "conditions", label: "Avaliar condições e limites" },
        { id: "records", label: "Registrar avisos associados" }
      ]
    },
    relations: [
      { id: "r1", from: "statistics", to: "counters" },
      { id: "r2", from: "history", to: "samples" },
      { id: "r3", from: "alarms", to: "conditions" },
      { id: "r4", from: "events", to: "records" }
    ]
  }
};

const systemDiagramInstances = [
  "aralearn.resource.software_system_context",
  "aralearn.resource.software_container",
  "aralearn.resource.system_internal_block"
].map((packageId, index) => {
  const contract = RESOURCE_PACKAGE_REGISTRY.getAuthoringContract(packageId, "1.0.0");
  return { id: `system-diagram-${index + 1}`, package: packageId, version: "1.0.0", data: contract.contract.example };
});

const mobileVerticalDiagramExpectations = Object.freeze([
  { packageId: "aralearn.resource.database_schema", maxNaturalWidth: 720 },
  { packageId: "aralearn.resource.entity_relationship", maxNaturalWidth: 500 },
  { packageId: "aralearn.resource.network_topology", maxNaturalWidth: 520 },
  { packageId: "aralearn.resource.state_machine", maxNaturalWidth: 360 }
]);

const mobileVerticalDiagramInstances = mobileVerticalDiagramExpectations.map(({ packageId }, index) => {
  const contract = RESOURCE_PACKAGE_REGISTRY.getAuthoringContract(packageId, "1.0.0");
  return { id: `mobile-vertical-diagram-${index + 1}`, package: packageId, version: "1.0.0", data: contract.contract.example };
});

const vegaInstances = [
  "aralearn.resource.chart",
  "aralearn.resource.plane"
].map((packageId, index) => {
  const contract = RESOURCE_PACKAGE_REGISTRY.getAuthoringContract(packageId, "1.0.0");
  return { id: `vega-csp-${index + 1}`, package: packageId, version: "1.0.0", data: contract.contract.example };
});

const matrixInstance = {
  id: "matrix-test",
  package: "aralearn.resource.matrix",
  version: "1.0.0",
  data: {
    prompt: "Observe uma matriz de transformação linear.",
    name: "A",
    values: [
      ["1", "2", "0"],
      ["0", "1", "-1"]
    ]
  }
};

const treeInstance = {
  id: "tree-test",
  package: "aralearn.resource.tree",
  version: "1.0.0",
  data: {
    prompt: "Observe os níveis de um nome de documentação.",
    variant: "hierarchy",
    nodes: [
      { id: "root", label: "raiz lógica", parentId: null },
      { id: "test", label: "test", parentId: "root" },
      { id: "example", label: "example", parentId: "test" },
      { id: "app", label: "app", parentId: "example" }
    ]
  }
};

const wrongChoiceCard = {
  id: "choice-test",
  position: 1,
  title: "Escolha",
  role: "practice",
  content: [],
  response: {
    id: "choice-answer",
    package: "aralearn.response.choice",
    version: "1.0.0",
    data: {
      question: "Qual protocolo entrega um fluxo confiável?",
      selectionMode: "single",
      selectionCriterion: "correct",
      options: [
        { id: "tcp", text: "TCP" },
        { id: "dns", text: "DNS" }
      ],
      answerIds: ["tcp"]
    }
  },
  feedback: [],
  topics: [],
  sources: []
};

function documentFor(instance, mode) {
  const html = renderHydratableInstance(instance);
  return documentForHtml(html, mode);
}

function renderHydratableInstance(instance) {
  const content = RESOURCE_PACKAGE_REGISTRY.renderInstance(instance, "content");
  return `<section class="package-instance" data-package="${instance.package}" data-package-version="${instance.version}">${content}</section>`;
}

function documentForHtml(html, mode) {
  const links = STYLES.map((href) => `<link rel="stylesheet" href="${href}">`).join("");
  return `<!doctype html><html lang="pt-BR" data-color-mode="${mode}"><head><meta name="viewport" content="width=device-width, initial-scale=1">${links}</head><body><main style="box-sizing:border-box;width:100%;max-width:420px;margin:0 auto;padding:16px">${html}</main></body></html>`;
}

async function hydratePackages(page) {
  await page.evaluate(async () => {
    const { RESOURCE_PACKAGE_REGISTRY } = await import("/src/resources/packages/index.js");
    await RESOURCE_PACKAGE_REGISTRY.hydrate(document);
  });
}

async function mountVegaInstances(page) {
  const markup = vegaInstances.map(renderHydratableInstance).join("");
  await page.locator("body").evaluate((body, html) => {
    body.innerHTML = `<main style="box-sizing:border-box;width:100%;max-width:420px;margin:0 auto;padding:16px">${html}</main>`;
  }, markup);
  await hydratePackages(page);
  await expect(page.locator("[data-vega-status='ready']")).toHaveCount(2);
  await expect(page.locator(".package-chart-canvas svg, .package-plane-canvas svg")).toHaveCount(2);
  await expect(page.locator(".package-chart-layout-error:visible, .package-plane-layout-error:visible")).toHaveCount(0);
}

test("gráfico estatístico e plano cartesiano materializam sob a CSP real e permanecem offline", async ({ context, page }) => {
  const relevantErrors = [];
  page.on("pageerror", (error) => {
    if (/vega|unsafe-eval|content security policy/iu.test(error.message)) relevantErrors.push(error.message);
  });
  await page.goto("/");
  const policy = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute("content");
  expect(policy).toBeTruthy();
  expect(policy).not.toMatch(/(?:^|\s)'unsafe-eval'(?:\s|$)/u);
  await mountVegaInstances(page);
  await page.evaluate(() => navigator.serviceWorker.ready);

  await context.setOffline(true);
  try {
    await page.reload({ waitUntil: "domcontentloaded" });
    await mountVegaInstances(page);
  } finally {
    await context.setOffline(false);
  }
  expect(relevantErrors).toEqual([]);
});

function studyCardFor(instance) {
  return {
    id: `study-${instance.id}`,
    position: 1,
    title: "Card real de estudo",
    role: "theory",
    content: [instance],
    response: null,
    feedback: [],
    topics: [],
    sources: []
  };
}

async function assertContained(page, selector, viewportWidth) {
  const boxes = await page.locator(selector).evaluateAll((elements) => elements.map((element) => {
    const rect = element.getBoundingClientRect();
    return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height };
  }));
  boxes.forEach((box) => {
    expect(box.left).toBeGreaterThanOrEqual(0);
    expect(box.right).toBeLessThanOrEqual(viewportWidth + 0.5);
    expect(box.width).toBeGreaterThan(0);
    expect(box.height).toBeGreaterThan(0);
  });
}

for (const width of [360, 390, 412]) {
  for (const mode of ["light", "dark"]) {
    test(`graph preserva rótulos e limites em ${width}px no modo ${mode}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/");
      expect(await page.evaluate(() => window.innerWidth)).toBe(width);
      await page.setContent(documentFor(graphInstance, mode));
      await hydratePackages(page);
      await expect(page.locator(".package-math-graph-vertex")).toHaveCount(8);
      await expect(page.locator(".package-math-graph-edge")).toHaveCount(9);
      await expect(page.locator(".package-math-graph-svg")).toHaveCount(1);
      await assertContained(page, ".package-math-graph-canvas", width);
      const nodes = await page.locator(".package-math-graph-vertex").evaluateAll((elements) => elements.map((element) => {
        const rect = element.getBoundingClientRect();
        return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom };
      }));
      for (let leftIndex = 0; leftIndex < nodes.length; leftIndex += 1) {
        for (let rightIndex = leftIndex + 1; rightIndex < nodes.length; rightIndex += 1) {
          const left = nodes[leftIndex];
          const right = nodes[rightIndex];
          const overlapWidth = Math.max(0, Math.min(left.right, right.right) - Math.max(left.left, right.left));
          const overlapHeight = Math.max(0, Math.min(left.bottom, right.bottom) - Math.max(left.top, right.top));
          expect(overlapWidth * overlapHeight).toBeLessThanOrEqual(0.5);
        }
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
      await expect(page.locator("#graph-edge-bridge text")).toHaveText("ponte");
      await expect(page.locator(".package-math-graph figcaption")).toContainText("|V| = 8");
    });

    test(`relation_map materializa dois conjuntos e cada par sem sobrepor rótulos em ${width}px no modo ${mode}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/");
      await page.setContent(documentFor(relationInstance, mode));
      await hydratePackages(page);
      await expect(page.locator(".package-relation-map-set")).toHaveCount(2);
      await expect(page.locator(".package-relation-map-node")).toHaveCount(8);
      await expect(page.locator(".package-relation-map-edge")).toHaveCount(4);
      await expect(page.locator(".package-relation-map-edge text")).toHaveCount(0);
      await expect(page.locator(".package-relation-map .package-system-diagram-canvas"))
        .toHaveAttribute("data-graphviz-source", /rankdir="LR"/u);
      const relationNodes = await page.locator(".package-relation-map-node").evaluateAll((elements) => elements.map((element) => {
        const rect = element.getBoundingClientRect();
        return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom };
      }));
      for (let leftIndex = 0; leftIndex < relationNodes.length; leftIndex += 1) {
        for (let rightIndex = leftIndex + 1; rightIndex < relationNodes.length; rightIndex += 1) {
          const left = relationNodes[leftIndex];
          const right = relationNodes[rightIndex];
          const overlapWidth = Math.max(0, Math.min(left.right, right.right) - Math.max(left.left, right.left));
          const overlapHeight = Math.max(0, Math.min(left.bottom, right.bottom) - Math.max(left.top, right.top));
          expect(overlapWidth * overlapHeight).toBeLessThanOrEqual(0.5);
        }
      }
      await assertContained(page, ".package-relation-map .package-system-diagram-canvas", width);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    });

    test(`modo Estudo usa renderização segura de graph e relation_map em ${width}px no modo ${mode}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/");
      const html = [graphInstance, relationInstance]
        .map((instance) => renderPackageCardArticle(studyCardFor(instance)))
        .join("");
      await page.setContent(documentForHtml(html, mode));
      await hydratePackages(page);
      await expect(page.locator(".package-math-graph-vertex")).toHaveCount(8);
      await expect(page.locator(".package-math-graph-edge")).toHaveCount(9);
      await expect(page.locator(".package-relation-map .package-system-diagram-svg")).toHaveCount(1);
      await expect(page.locator(".package-relation-map .package-relation-map-set")).toHaveCount(2);
      await expect(page.locator(".package-relation-map .package-relation-map-node")).toHaveCount(8);
      await expect(page.locator(".package-relation-map .package-relation-map-edge")).toHaveCount(4);
      await assertContained(page, ".package-math-graph-canvas, .package-relation-map .package-system-diagram-frame", width);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    });

    test(`choice, matrix e tree preservam estado e riqueza visual em ${width}px no modo ${mode}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/");
      const choicePrefix = "visual-choice";
      const choiceKey = `${choicePrefix}::response:${wrongChoiceCard.response.id}`;
      const html = [
        renderPackageCardBlocks(wrongChoiceCard, {
          blockKeyPrefix: choicePrefix,
          responseStateByBlockKey: {
            [choiceKey]: { selected: ["dns"], feedback: "wrong" }
          }
        }),
        renderPackageCardArticle(studyCardFor(matrixInstance)),
        renderPackageCardArticle(studyCardFor(treeInstance))
      ].join("");
      await page.setContent(documentForHtml(html, mode));
      await hydratePackages(page);

      const tcp = page.locator('[data-choice-option-id="tcp"]');
      const dns = page.locator('[data-choice-option-id="dns"]');
      await expect(tcp).not.toHaveClass(/expected-selection|selected-correct/u);
      await expect(dns).toHaveClass(/selected-incorrect/u);
      await expect(page.locator(".runtime-feedback-icon")).toHaveCount(2);
      const iconStyles = await page.locator(".runtime-feedback-icon").evaluateAll((icons) => icons.map((icon) => ({
        fill: getComputedStyle(icon).fill,
        stroke: getComputedStyle(icon).stroke,
        color: getComputedStyle(icon.closest("button")).color
      })));
      iconStyles.forEach(({ fill, stroke, color }) => {
        expect(fill).toBe("none");
        expect(stroke).toBe(color);
      });

      await expect(page.locator(".runtime-matrix-delimiter")).toHaveCount(2);
      await expect(page.locator(".runtime-matrix-grid mtd")).toHaveCount(6);
      await expect(page.locator('.runtime-tree-block [data-graphviz-status="ready"]')).toHaveCount(1);
      await expect(page.locator(".package-rooted-tree-node")).toHaveCount(4);
      await expect(page.locator(".runtime-tree-entry, .runtime-tree-item")).toHaveCount(0);
      await assertContained(page, ".package-system-diagram-canvas", width);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    });
  }
}

for (const { width, mode } of [
  { width: 360, mode: "dark" },
  { width: 412, mode: "light" }
]) {
  test(`diagramas relacionais priorizam progressão vertical em ${width}px no modo ${mode}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto("/");
    const markup = mobileVerticalDiagramInstances.map(renderHydratableInstance).join("");
    await page.setContent(documentForHtml(markup, mode));
    await hydratePackages(page);

    await expect(page.locator('[data-graphviz-status="ready"]')).toHaveCount(mobileVerticalDiagramInstances.length);
    await expect(page.locator(".package-system-diagram-layout-error:visible")).toHaveCount(0);
    await assertContained(page, ".package-system-diagram-canvas", width);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);

    for (const { packageId, maxNaturalWidth } of mobileVerticalDiagramExpectations) {
      const root = page.locator(`[data-package="${packageId}"]`);
      const canvas = root.locator(".package-system-diagram-canvas");
      await expect(canvas).toHaveAttribute("data-graphviz-source", /rankdir="TB"/u);
      const dimensions = await root.locator(".package-system-diagram-svg").evaluate((svg) => ({
        width: svg.viewBox.baseVal.width,
        height: svg.viewBox.baseVal.height
      }));
      expect(dimensions.width, packageId).toBeLessThanOrEqual(maxNaturalWidth);
      expect(dimensions.height, packageId).toBeGreaterThan(0);

      const navigation = await canvas.evaluate((element) => {
        const maxX = Math.max(0, element.scrollWidth - element.clientWidth);
        const maxY = Math.max(0, element.scrollHeight - element.clientHeight);
        element.scrollLeft = maxX;
        element.scrollTop = maxY;
        return {
          maxX,
          maxY,
          reachedX: Math.abs(element.scrollLeft - maxX) <= 1,
          reachedY: Math.abs(element.scrollTop - maxY) <= 1,
          touchAction: getComputedStyle(element).touchAction
        };
      });
      expect(navigation.touchAction, packageId).toBe("pan-x pan-y");
      expect(navigation.reachedX, packageId).toBe(true);
      expect(navigation.reachedY, packageId).toBe(true);
      expect(navigation.maxX + navigation.maxY, packageId).toBeGreaterThan(0);

      const overlaps = await root.locator('[data-system-object-kind="node"]').evaluateAll((nodes) => {
        const boxes = nodes.map((node) => node.getBoundingClientRect());
        const collisions = [];
        for (let leftIndex = 0; leftIndex < boxes.length; leftIndex += 1) {
          for (let rightIndex = leftIndex + 1; rightIndex < boxes.length; rightIndex += 1) {
            const left = boxes[leftIndex];
            const right = boxes[rightIndex];
            const overlapWidth = Math.max(0, Math.min(left.right, right.right) - Math.max(left.left, right.left));
            const overlapHeight = Math.max(0, Math.min(left.bottom, right.bottom) - Math.max(left.top, right.top));
            if (overlapWidth * overlapHeight > 0.5) collisions.push([leftIndex, rightIndex]);
          }
        }
        return collisions;
      });
      expect(overlaps, packageId).toEqual([]);
    }
  });
}

for (const mode of ["light", "dark"]) {
  test(`diagramas acadêmicos de sistema preservam objetos e rótulos no modo ${mode}`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 1000 });
    await page.goto("/");
    const markup = systemDiagramInstances.map(renderHydratableInstance).join("");
    await page.setContent(documentForHtml(markup, mode));
    await hydratePackages(page);
    await expect(page.locator(".package-system-diagram-svg")).toHaveCount(3);
    await expect(page.locator(".package-system-diagram-layout-error:visible")).toHaveCount(0);
    await expect(page.locator(".package-system-context-node")).toHaveCount(5);
    await expect(page.locator(".package-software-container-node")).toHaveCount(7);
    await expect(page.locator(".package-system-internal-part")).toHaveCount(3);
    await expect(page.locator(".package-system-internal-connector")).toHaveCount(3);
    await assertContained(page, ".package-system-diagram-canvas", 390);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);

    const figures = page.locator(".package-system-diagram");
    for (let figureIndex = 0; figureIndex < await figures.count(); figureIndex += 1) {
      const figure = figures.nth(figureIndex);
      const labelState = await figure.locator('[data-system-object-kind="node"] text').evaluateAll((labels) => labels.map((label) => ({
        text: label.textContent.trim(),
        visibility: getComputedStyle(label).visibility,
        fill: getComputedStyle(label).fill
      })));
      expect(labelState.length).toBeGreaterThan(0);
      labelState.forEach(({ text, visibility, fill }) => {
        expect(text.length).toBeGreaterThan(0);
        expect(["visible", "hidden"]).toContain(visibility);
        expect(fill).not.toBe("rgba(0, 0, 0, 0)");
      });

      const visibleNodeLabels = await figure.locator('[data-system-object-kind="node"]').evaluateAll((nodes) => nodes.map((node) => ({
        svgText: [...node.querySelectorAll("text")].some((label) => getComputedStyle(label).visibility === "visible"),
        semanticText: Boolean(node.querySelector(".package-system-diagram-node-content"))
      })));
      visibleNodeLabels.forEach(({ svgText, semanticText }) => expect(svgText || semanticText).toBe(true));

      const viewportState = await figure.evaluate((element) => {
        const canvas = element.querySelector(".package-system-diagram-canvas");
        const focus = element.dataset.systemDiagramFocusId
          ? element.querySelector(`#${CSS.escape(element.dataset.systemDiagramFocusId)}`)
          : null;
        const canvasRect = canvas.getBoundingClientRect();
        const focusRect = focus?.getBoundingClientRect();
        return {
          overflowX: canvas.scrollWidth > canvas.clientWidth + 1,
          overflowY: canvas.scrollHeight > canvas.clientHeight + 1,
          boundedHeight: canvas.clientHeight <= 430,
          touchAction: getComputedStyle(canvas).touchAction,
          startsAtTop: canvas.scrollTop === 0,
          focusContained: !focusRect || (
            focusRect.left >= canvasRect.left - 1
            && focusRect.right <= canvasRect.right + 1
          )
        };
      });
      expect(viewportState.boundedHeight).toBe(true);
      expect(viewportState.touchAction).toBe("pan-x pan-y");
      expect(viewportState.startsAtTop).toBe(true);
      expect(viewportState.focusContained).toBe(true);
      await expect(figure.locator(".package-system-diagram-pan-hint")).toHaveCount(0);

      const overlaps = await figure.locator('[data-system-object-kind="node"]').evaluateAll((nodes) => {
        const boxes = nodes.map((node) => node.getBoundingClientRect());
        const collisions = [];
        for (let leftIndex = 0; leftIndex < boxes.length; leftIndex += 1) {
          for (let rightIndex = leftIndex + 1; rightIndex < boxes.length; rightIndex += 1) {
            const left = boxes[leftIndex];
            const right = boxes[rightIndex];
            const width = Math.max(0, Math.min(left.right, right.right) - Math.max(left.left, right.left));
            const height = Math.max(0, Math.min(left.bottom, right.bottom) - Math.max(left.top, right.top));
            if (width * height > 0.5) collisions.push([leftIndex, rightIndex]);
          }
        }
        return collisions;
      });
      expect(overlaps).toEqual([]);
    }

    const contextOrder = await figures.first().evaluate((figure) => {
      const rectFor = (selector) => {
        const rect = figure.querySelector(selector).getBoundingClientRect();
        return { top: rect.top, bottom: rect.bottom };
      };
      return {
        people: [...figure.querySelectorAll(".package-system-context-node.is-person")].map((node) => {
          const rect = node.getBoundingClientRect();
          return { top: rect.top, bottom: rect.bottom };
        }),
        focus: rectFor(".package-system-context-node.is-focus"),
        externals: [...figure.querySelectorAll(".package-system-context-node.is-external")].map((node) => {
          const rect = node.getBoundingClientRect();
          return { top: rect.top, bottom: rect.bottom };
        })
      };
    });
    expect(Math.max(...contextOrder.people.map(({ bottom }) => bottom)))
      .toBeLessThan(contextOrder.focus.top);
    expect(Math.min(...contextOrder.externals.map(({ top }) => top)))
      .toBeGreaterThan(contextOrder.focus.bottom);
    for (const figure of [figures.nth(0), figures.nth(1)]) {
      const hierarchy = await figure.locator('[data-system-object-kind="node"]').evaluateAll((nodes) => nodes.map((node) => {
        const labels = [...node.querySelectorAll("text")]
          .filter((label) => getComputedStyle(label).visibility === "visible");
        const shapeElements = [...node.querySelectorAll(":scope > path, :scope > polygon, :scope > ellipse, :scope > rect")];
        const boundsFor = (elements) => elements.reduce((bounds, element) => {
          const box = element.getBBox();
          return {
            left: Math.min(bounds.left, box.x),
            top: Math.min(bounds.top, box.y),
            right: Math.max(bounds.right, box.x + box.width),
            bottom: Math.max(bounds.bottom, box.y + box.height)
          };
        }, { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity });
        const shape = boundsFor(shapeElements);
        const text = boundsFor(labels);
        const styles = labels.map((label) => getComputedStyle(label));
        const weights = styles.map((style) => style.fontWeight === "bold"
          ? 700
          : Number.parseInt(style.fontWeight || "0", 10));
        return {
          complete: labels.length >= 3,
          native: !node.querySelector("foreignObject"),
          contained: text.left >= shape.left - 1 && text.right <= shape.right + 1 &&
            text.top >= shape.top - 1 && text.bottom <= shape.bottom + 1,
          typeSize: styles[0] ? Number.parseFloat(styles[0].fontSize) : 0,
          nameSize: Math.max(...styles.map((style) => Number.parseFloat(style.fontSize))),
          nameWeight: Math.max(...weights)
        };
      }));
      expect(hierarchy.length).toBeGreaterThan(0);
      hierarchy.forEach(({ complete, native, contained, typeSize, nameSize, nameWeight }) => {
        expect(complete).toBe(true);
        expect(native).toBe(true);
        expect(contained).toBe(true);
        expect(typeSize).toBeLessThanOrEqual(nameSize);
        expect(nameWeight).toBeGreaterThanOrEqual(600);
      });
    }
  });
}
