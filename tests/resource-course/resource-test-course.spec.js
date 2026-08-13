import { expect, test } from "@playwright/test";

async function openModule(page, moduleIndex, cardIndex = 0) {
  await page.locator('[data-action="open-course"]').click();
  await page.locator('[data-action="open-module"]').nth(moduleIndex).click();
  await page.locator('[data-action="open-lesson"]').click();
  await page.locator('[data-action="open-microsequence-overview"]').click();
  await page.locator(`[data-action="open-microsequence-card"][data-card-index="${cardIndex}"]`).click();
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto("/teste-recursos");
  await page.waitForFunction(() => globalThis.__RESOURCE_TEST_COURSE_READY__ === true);
  await page.evaluate(() => localStorage.removeItem("aralearn.resource-test.progress.v3"));
  await page.reload();
  await page.waitForFunction(() => globalThis.__RESOURCE_TEST_COURSE_READY__ === true);
});

test("curso separa 24 representações dos quatro packages de resposta", async ({ page }) => {
  await expect(page.locator('[data-action="open-course"]')).toBeVisible();
  await page.locator('[data-action="open-course"]').click();
  await expect(page.locator('[data-action="open-module"]')).toHaveCount(28);
  await expect(page.locator('[data-action="open-module"]').nth(24)).toHaveAttribute("data-module-key", "response-choice-test-module");
  await expect(page.locator('[data-action="open-module"]').nth(25)).toHaveAttribute("data-module-key", "response-gap-test-module");
  await expect(page.locator('[data-action="open-module"]').nth(26)).toHaveAttribute("data-module-key", "response-ordering-test-module");
  await expect(page.locator('[data-action="open-module"]').nth(27)).toHaveAttribute("data-module-key", "response-matching-test-module");
});

test("paragraph usa alternativas sob demanda e segundo toque esvazia a lacuna", async ({ page }) => {
  await openModule(page, 0);
  await expect(page.locator(".runtime-card-title")).toHaveText("Exposição");
  await page.locator('[data-action="next-card"]').click();
  await expect(page.locator(".runtime-card-title")).toHaveText("Lacuna com alternativas");
  const blank = page.locator('[data-action="text-gap-open-choice"]');
  await expect(page.locator('[data-action="text-gap-set-choice"]')).toHaveCount(0);
  await blank.click();
  await expect(page.locator('[data-action="text-gap-set-choice"]')).toHaveCount(3);
  await page.locator('[data-action="text-gap-set-choice"]').first().click();
  await expect(page.locator('[data-action="text-gap-set-choice"]')).toHaveCount(0);
  await expect(blank).toHaveAttribute("data-empty", "false");
  await blank.click();
  await expect(blank).toHaveAttribute("data-empty", "true");
  await expect(page.locator('[data-action="text-gap-set-choice"]')).toHaveCount(0);
});

test("cada lacuna abre somente as próprias alternativas", async ({ page }) => {
  await openModule(page, 25);
  const blanks = page.locator('[data-action="text-gap-open-choice"]');
  await expect(blanks).toHaveCount(2);
  await expect(page.locator('[data-action="text-gap-set-choice"]')).toHaveCount(0);

  await blanks.nth(0).click();
  await expect(page.locator('[data-action="text-gap-set-choice"]')).toHaveText([
    "cliente", "servidor", "roteador"
  ]);
  await page.locator('[data-action="text-gap-set-choice"][data-text-gap-value="cliente"]').click();

  await blanks.nth(1).click();
  await expect(page.locator('[data-action="text-gap-set-choice"]')).toHaveText([
    "resposta", "requisição", "conexão"
  ]);
  await page.locator('[data-action="text-gap-set-choice"][data-text-gap-value="resposta"]').click();
  await blanks.nth(1).click();
  await expect(blanks.nth(1)).toHaveAttribute("data-empty", "true");
});

test("code recebe a lacuna no editor e não no enunciado", async ({ page }) => {
  await openModule(page, 1, 1);
  await expect(page.locator(".runtime-code-block pre [data-action='text-gap-open-choice']"))
    .toHaveCount(1);
  await expect(page.locator(".runtime-code-block > p [data-action='text-gap-open-choice']"))
    .toHaveCount(0);
});

test("table recebe alternativa e digitação dentro de células", async ({ page }) => {
  await openModule(page, 2, 1);
  await expect(page.locator(".runtime-table tbody [data-action='text-gap-open-choice']"))
    .toHaveCount(1);
  await expect(page.locator(".runtime-table-block > p [data-action='text-gap-open-choice']"))
    .toHaveCount(0);
  await page.locator(".runtime-table tbody [data-action='text-gap-open-choice']").click();
  await page.locator('[data-action="text-gap-set-choice"]').first().click();
  await page.locator('[data-action="next-card"]').click();
  await page.locator('[data-action="next-card"]').click();
  await expect(page.locator(".runtime-table tbody [data-action='complete-input']"))
    .toHaveCount(1);
});

test("texto anotado liga trecho e nota nos dois sentidos sem ids internos", async ({ page }) => {
  await openModule(page, 4);
  await expect(page.locator(".runtime-annotated-text-segment")).toHaveCount(2);
  await expect(page.locator(".runtime-annotated-text-notes")).not.toContainText("Trechos:");
  await page.locator(".runtime-annotated-text-segment").first().click();
  await expect(page.locator(".runtime-annotated-text-segment").first()).toHaveClass(/is-active/u);
  await expect(page.locator(".runtime-annotated-text-note").first()).toHaveClass(/is-active/u);
  await page.locator(".runtime-annotated-text-note").last().click();
  await expect(page.locator(".runtime-annotated-text-segment").last()).toHaveClass(/is-active/u);
});

test("glosa interlinear preserva alinhamento, tradução e legenda", async ({ page }) => {
  await openModule(page, 5);
  await expect(page.locator(".runtime-interlinear-unit")).toHaveCount(6);
  await expect(page.locator(".runtime-interlinear-form").nth(1)).toHaveText("abur-u-n");
  await expect(page.locator(".runtime-interlinear-unit-gloss").nth(1)).toHaveText("they-OBL-GEN");
  await expect(page.locator(".runtime-interlinear-form").last()).toHaveText("amuq’-da-č.");
  await expect(page.locator(".runtime-interlinear-unit-gloss").last()).toHaveText("stay-FUT-NEG");
  await expect(page.locator(".runtime-interlinear-translation")).toContainText("fazenda deles");
  await expect(page.locator(".runtime-interlinear-abbreviations")).toContainText("OBL");
  await expect(page.locator(".runtime-interlinear-abbreviations")).toContainText("oblíquo");
});

test("matrix usa MathML com peso normal e lacuna na entrada", async ({ page }) => {
  await openModule(page, 7);
  await expect(page.locator(".runtime-matrix-item math.runtime-matrix-values mtable")).toHaveCount(1);
  await expect(page.locator(".runtime-matrix-item math.runtime-matrix-values mtr")).toHaveCount(3);
  await expect(page.locator(".runtime-matrix-name")).toHaveText("I");
  await expect(page.locator(".runtime-matrix-name")).toHaveCSS("font-weight", "400");
  const dimensions = await page.locator(".runtime-matrix-item").evaluate((matrix) => {
    const gridRect = matrix.querySelector("mtable").getBoundingClientRect();
    return {
      grid: { top: gridRect.top, bottom: gridRect.bottom, height: gridRect.height },
      delimiters: [...matrix.querySelectorAll(".runtime-matrix-delimiter")]
        .map((delimiter) => {
          const rect = delimiter.getBoundingClientRect();
          return {
            top: rect.top,
            bottom: rect.bottom,
            height: rect.height,
            strokeWidth: getComputedStyle(delimiter.querySelector("path")).strokeWidth
          };
        })
    };
  });
  expect(dimensions.delimiters).toHaveLength(2);
  dimensions.delimiters.forEach((delimiter) => {
    expect(Math.abs(delimiter.height - dimensions.grid.height)).toBeLessThanOrEqual(1);
    expect(Math.abs(delimiter.top - dimensions.grid.top)).toBeLessThanOrEqual(1);
    expect(Math.abs(delimiter.bottom - dimensions.grid.bottom)).toBeLessThanOrEqual(1);
    expect(delimiter.strokeWidth).toBe("1px");
  });
  await page.locator('[data-action="next-card"]').click();
  await expect(page.locator(".runtime-matrix-item mtd [data-action='text-gap-open-choice']")).toHaveCount(1);
});

test("reaction materializa escolha e digitação dentro da equação química", async ({ page }) => {
  await openModule(page, 8);
  const spacing = await page.locator(".package-reaction-equation").evaluate((equation) => {
    const species = [...equation.querySelectorAll(".package-reaction-species")];
    const coefficient = equation.querySelector(".package-reaction-coefficient").getBoundingClientRect();
    const formula = equation.querySelector(".package-reaction-formula").getBoundingClientRect();
    const plus = equation.querySelector(".package-reaction-plus").getBoundingClientRect();
    const arrow = equation.querySelector(".package-reaction-arrow").getBoundingClientRect();
    const boxes = species.map((item) => item.getBoundingClientRect());
    return {
      coefficientToFormula: formula.left - coefficient.right,
      speciesToPlus: plus.left - boxes[0].right,
      plusToSpecies: boxes[1].left - plus.right,
      reactantsToArrow: arrow.left - boxes[1].right,
      arrowToProducts: boxes[2].left - arrow.right
    };
  });
  expect(spacing.coefficientToFormula).toBeGreaterThanOrEqual(5);
  expect(spacing.speciesToPlus).toBeGreaterThanOrEqual(8);
  expect(spacing.plusToSpecies).toBeGreaterThanOrEqual(8);
  expect(spacing.reactantsToArrow).toBeGreaterThanOrEqual(11);
  expect(spacing.arrowToProducts).toBeGreaterThanOrEqual(11);

  await page.locator('[data-action="next-card"]').click();
  await expect(page.locator(".inline-feedback")).toHaveCount(0);
  const coefficientGap = page.locator("math.package-reaction-equation [data-action='text-gap-open-choice']");
  await expect(coefficientGap).toHaveCount(1);
  await coefficientGap.click();
  await page.locator('[data-action="text-gap-set-choice"]').first().click();
  await page.locator('[data-action="next-card"]').click();
  await expect(page.locator("math.package-reaction-equation [data-action='complete-input']")).toHaveCount(1);
  await expect(page.locator(".inline-feedback")).toHaveCount(0);
});

test("flow usa convenções de fluxograma e não a estrutura visual de tree", async ({ page }) => {
  await openModule(page, 9);
  await expect(page.locator(".package-flowchart")).toBeVisible();
  await expect(page.locator('[data-flow-layout-status="ready"]')).toHaveCount(1);
  await expect(page.locator(".package-flow-node.is-terminal")).toHaveCount(2);
  await expect(page.locator(".package-flow-node.is-input-output")).toHaveCount(2);
  await expect(page.locator(".package-flow-node.is-decision")).toHaveCount(1);
  await expect(page.locator(".package-flow-node.is-merge")).toHaveCount(1);
  await expect(page.locator(".package-flow-edge-label")).toHaveText(["Sim", "Não"]);
  await expect(page.locator(".package-flow-edge")).toHaveCount(7);
  const topology = await page.locator(".package-flowchart").evaluate((chart) => {
    const canvas = chart.querySelector(".package-flow-canvas");
    const end = canvas.querySelector('[data-flow-kind="end"]')?.getAttribute("data-flow-node-id");
    const incoming = [...chart.querySelectorAll("[data-flow-edge-id]")]
      .filter((edge) => edge.getAttribute("data-flow-edge-visible") === "true" &&
        edge.getAttribute("data-flow-target") === end);
    const nodes = [...canvas.querySelectorAll(".package-flow-node:not(.is-merge)")]
      .map((node) => ({ id: node.getAttribute("data-flow-node-id"), rect: node.getBoundingClientRect() }));
    const labels = [...canvas.querySelectorAll(".package-flow-edge-label")]
      .map((label) => ({ id: label.textContent.trim(), rect: label.getBoundingClientRect() }));
    const overlaps = [];
    for (let leftIndex = 0; leftIndex < nodes.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < nodes.length; rightIndex += 1) {
        const left = nodes[leftIndex];
        const right = nodes[rightIndex];
        if (left.rect.left < right.rect.right && left.rect.right > right.rect.left &&
            left.rect.top < right.rect.bottom && left.rect.bottom > right.rect.top) {
          overlaps.push([left.id, right.id]);
        }
      }
    }
    const labelOverlaps = labels.flatMap((label) => nodes
      .filter((node) => label.rect.left < node.rect.right && label.rect.right > node.rect.left &&
        label.rect.top < node.rect.bottom && label.rect.bottom > node.rect.top)
      .map((node) => [label.id, node.id]));
    return { incomingToEnd: incoming.length, overlaps, labelOverlaps };
  });
  expect(topology.incomingToEnd).toBe(1);
  expect(topology.overlaps).toEqual([]);
  expect(topology.labelOverlaps).toEqual([]);
  await expect(page.locator(".runtime-tree-structure, .package-flow-tree")).toHaveCount(0);

  await page.locator('[data-action="next-card"]').click();
  await expect(page.locator('.package-flow-node [data-action="text-gap-open-choice"]')).toHaveCount(1);
  await expect(page.locator('[data-action="text-gap-open-choice"]')).toHaveCount(1);
  await page.locator('.package-flow-node [data-action="text-gap-open-choice"]').click();
  await page.locator('[data-action="text-gap-set-choice"]').first().click();
  await page.locator('[data-action="next-card"]').click();
  await page.locator('[data-action="next-card"]').click();
  await expect(page.locator('.package-flow-node [data-action="complete-input"]')).toHaveCount(1);
});

test("flow complexo diagrama laço e decisão aninhada sem sobrepor nós", async ({ page }) => {
  await page.evaluate(async () => {
    const { flowPackage } = await import("/src/resources/packages/flow/index.js");
    const host = document.createElement("section");
    host.id = "complex-flow-fixture";
    host.className = "package-instance";
    host.dataset.package = "aralearn.resource.flow";
    host.dataset.packageVersion = "1.0.0";
    host.innerHTML = flowPackage.render({
      prompt: "Acompanhe o processamento completo.",
      structure: {
        kind: "sequence",
        items: [
          { id: "start", kind: "start", text: "Início" },
          { id: "read", kind: "input", text: "Ler quantidade de registros" },
          {
            id: "loop",
            kind: "while",
            condition: "Ainda há registros?",
            branchLabels: { yes: "Sim", no: "Não" },
            body: [
              { id: "load", kind: "input", text: "Ler próximo registro" },
              {
                id: "valid",
                kind: "if_then_else",
                condition: "Registro é válido?",
                branchLabels: { yes: "Sim", no: "Não" },
                thenBranch: [
                  { id: "calculate", kind: "process", text: "Calcular subtotal" },
                  { id: "accumulate", kind: "process", text: "Acumular resultado" }
                ],
                elseBranch: [{ id: "warn", kind: "output", text: "Registrar inconsistência" }]
              },
              { id: "advance", kind: "process", text: "Avançar posição" }
            ]
          },
          { id: "result", kind: "output", text: "Exibir resultado final" },
          {
            id: "confirm",
            kind: "do_while",
            condition: "Exportação ainda não foi confirmada?",
            branchLabels: { yes: "Sim", no: "Não" },
            body: [{ id: "request-confirmation", kind: "process", text: "Solicitar confirmação" }]
          },
          { id: "end", kind: "end", text: "Fim" }
        ]
      }
    }, { instanceId: "complex-flow-test" });
    document.body.replaceChildren(host);
    await flowPackage.hydrate(host);
  });

  await expect(page.locator('#complex-flow-fixture [data-flow-layout-status="ready"]')).toBeVisible();
  await expect(page.locator("#complex-flow-fixture .package-flow-node.is-decision")).toHaveCount(3);
  await expect(page.locator("#complex-flow-fixture .package-flow-edge.is-loop")).toHaveCount(2);
  const geometry = await page.locator("#complex-flow-fixture .package-flow-canvas").evaluate((canvas) => {
    const nodes = [...canvas.querySelectorAll(".package-flow-node:not(.is-merge)")]
      .map((node) => ({ id: node.getAttribute("data-flow-source-id"), rect: node.getBoundingClientRect() }));
    const labels = [...canvas.querySelectorAll(".package-flow-edge-label")]
      .map((label) => ({ id: label.textContent.trim(), rect: label.getBoundingClientRect() }));
    const overlaps = [];
    for (let leftIndex = 0; leftIndex < nodes.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < nodes.length; rightIndex += 1) {
        const left = nodes[leftIndex];
        const right = nodes[rightIndex];
        if (left.rect.left < right.rect.right && left.rect.right > right.rect.left &&
            left.rect.top < right.rect.bottom && left.rect.bottom > right.rect.top) {
          overlaps.push([left.id, right.id]);
        }
      }
    }
    return {
      overlaps,
      labelOverlaps: labels.flatMap((label) => nodes
        .filter((node) => label.rect.left < node.rect.right && label.rect.right > node.rect.left &&
          label.rect.top < node.rect.bottom && label.rect.bottom > node.rect.top)
        .map((node) => [label.id, node.id])),
      width: canvas.getBoundingClientRect().width,
      height: canvas.getBoundingClientRect().height,
      scrollWidth: canvas.parentElement.scrollWidth,
      clientWidth: canvas.parentElement.clientWidth,
      documentOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
    };
  });
  expect(geometry.overlaps).toEqual([]);
  expect(geometry.labelOverlaps).toEqual([]);
  expect(geometry.width).toBeGreaterThan(300);
  expect(geometry.height).toBeGreaterThan(500);
  expect(geometry.scrollWidth).toBeGreaterThanOrEqual(geometry.clientWidth);
  expect(geometry.documentOverflow).toBeLessThanOrEqual(1);
});

test("formula combina texto e notação avançada na mesma escala tipográfica", async ({ page }) => {
  await openModule(page, 10);
  await expect(page.locator(".runtime-formula-block > p")).toContainText("teoria de campos");
  await expect(page.locator(".package-formula math")).toBeVisible();
  await expect(page.locator(".package-formula math mfrac")).toHaveCount(2);
  await expect(page.locator(".package-formula math msub")).toHaveCount(3);
  await expect(page.locator(".package-formula math msup")).toHaveCount(1);
  const fencedDimensions = await page.locator(".package-formula-fenced.is-stacked").evaluate((fenced) => {
    const figure = fenced.closest(".package-formula");
    const contentRect = fenced.querySelector(":scope > .package-formula-fenced-content").getBoundingClientRect();
    const delimiters = [...figure.querySelectorAll(":scope > .package-formula-fence")]
      .filter((delimiter) => delimiter.getBoundingClientRect().height > 20);
    return {
      contentRect: { top: contentRect.top, bottom: contentRect.bottom, height: contentRect.height },
      fences: delimiters.map((delimiter) => {
        const rect = delimiter.getBoundingClientRect();
        return {
          top: rect.top,
          bottom: rect.bottom,
          height: rect.height,
          strokeWidth: getComputedStyle(delimiter.querySelector("path")).strokeWidth
        };
      })
    };
  });
  expect(fencedDimensions.fences).toHaveLength(2);
  fencedDimensions.fences.forEach((fence) => {
    expect(Math.abs(fence.height - fencedDimensions.contentRect.height)).toBeLessThanOrEqual(1);
    expect(Math.abs(fence.top - fencedDimensions.contentRect.top)).toBeLessThanOrEqual(1);
    expect(Math.abs(fence.bottom - fencedDimensions.contentRect.bottom)).toBeLessThanOrEqual(1);
    expect(fence.strokeWidth).toBe("1px");
  });
  const sizes = await page.evaluate(() => ({
    prose: getComputedStyle(document.querySelector(".runtime-formula-block > p")).fontSize,
    formula: getComputedStyle(document.querySelector(".package-formula math")).fontSize
  }));
  expect(sizes.formula).toBe(sizes.prose);
});

test("plano cartesiano complexo preserva eixos, objetos e rótulos sem colisão", async ({ page }) => {
  await openModule(page, 11);
  await expect(page.locator(".package-plane-canvas[data-vega-status='ready']")).toBeVisible();
  const geometry = await page.locator(".package-plane-canvas").evaluate((canvas) => {
    const expected = new Set(["e₁", "e₂", "Ae₁", "Ae₂", "p", "Ap"]);
    const labels = [...canvas.querySelectorAll("svg text")]
      .filter((element) => expected.has(element.textContent.trim()))
      .map((element) => ({ text: element.textContent.trim(), rect: element.getBoundingClientRect() }));
    const overlaps = [];
    for (let leftIndex = 0; leftIndex < labels.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < labels.length; rightIndex += 1) {
        const left = labels[leftIndex];
        const right = labels[rightIndex];
        if (left.rect.left < right.rect.right && left.rect.right > right.rect.left &&
            left.rect.top < right.rect.bottom && left.rect.bottom > right.rect.top) {
          overlaps.push([left.text, right.text]);
        }
      }
    }
    return {
      labels: labels.map(({ text }) => text),
      overlaps,
      documentOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
    };
  });
  expect(geometry.labels.sort()).toEqual(["Ae₁", "Ae₂", "Ap", "e₁", "e₂", "p"].sort());
  expect(geometry.overlaps).toEqual([]);
  expect(geometry.documentOverflow).toBeLessThanOrEqual(1);
  await expect(page.locator(".package-plane-canvas svg")).toContainText("Coordenada x");
  await expect(page.locator(".package-plane-canvas svg")).toContainText("Coordenada y");
  await expect(page.locator(".package-plane-legend li")).toHaveCount(8);
});

test("gráfico acadêmico mostra escala logarítmica, incerteza e referência sem legenda solta", async ({ page }) => {
  await openModule(page, 12);
  const canvas = page.locator(".package-chart-canvas[data-vega-status='ready']");
  await expect(canvas).toBeVisible();
  await expect(canvas).toContainText("Concorrência (requisições simultâneas)");
  await expect(canvas).toContainText("Latência no percentil 95 (ms)");
  await expect(canvas).toContainText("Limite operacional");
  await expect(page.locator(".package-chart-uncertainty")).toHaveText("Intervalo de confiança de 95%");
  await expect(page.locator(".package-chart-legend li")).toHaveCount(2);
  await expect(page.locator(".package-chart-caption")).toContainText("bootstrap percentil");
  await expect(page.locator(".package-chart-figure > span")).toHaveCount(0);
  const geometry = await canvas.evaluate((element) => ({
    svgWidth: element.querySelector("svg").getBoundingClientRect().width,
    canvasWidth: element.getBoundingClientRect().width,
    documentOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    verticalIntervals: [...element.querySelectorAll("svg line")].filter((line) => {
      const x1 = Number(line.getAttribute("x1"));
      const x2 = Number(line.getAttribute("x2"));
      const y1 = Number(line.getAttribute("y1"));
      const y2 = Number(line.getAttribute("y2"));
      return Math.abs(x1 - x2) < 0.1 && Math.abs(y1 - y2) > 4;
    }).length
  }));
  expect(geometry.svgWidth).toBeLessThanOrEqual(geometry.canvasWidth + 1);
  expect(geometry.documentOverflow).toBeLessThanOrEqual(1);
  expect(geometry.verticalIntervals).toBeGreaterThanOrEqual(12);
});

test("ordenação é resposta independente e o Play é o único controle de confirmação", async ({ page }) => {
  await openModule(page, 26);
  await expect(page.locator(".package-ordering-response li")).toHaveCount(3);
  await expect(page.getByRole("button", { name: "Conferir" })).toHaveCount(0);
  await page.locator('[data-action="next-card"]').click();
  await expect(page.locator(".inline-feedback.err")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});
