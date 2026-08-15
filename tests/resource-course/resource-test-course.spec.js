import { expect, test } from "@playwright/test";

async function openModuleRuntime(page, module, cardIndex = 0) {
  await page.locator('[data-action="open-course"]').click();
  await module.click();

  if (await page.locator(".runtime-card-title").isVisible()) {
    if (cardIndex === 0) return;
    await page.locator('[data-action="go-back"]').first().click();
  }

  const lesson = page.locator('[data-action="open-lesson"]').first();
  if (await lesson.isVisible()) await lesson.click();
  const overview = page.locator('[data-action="open-microsequence-overview"]').first();
  if (await overview.isVisible()) await overview.click();
  await page.locator(
    `[data-action="open-microsequence-card"][data-card-index="${cardIndex}"]`
  ).first().click();
}

async function openModule(page, moduleIndex, cardIndex = 0) {
  await openModuleRuntime(
    page,
    page.locator('[data-action="open-module"]').nth(moduleIndex),
    cardIndex
  );
}

async function openModuleByKey(page, moduleKey, cardIndex = 0) {
  await openModuleRuntime(
    page,
    page.locator(`[data-action="open-module"][data-module-key="${moduleKey}"]`),
    cardIndex
  );
}

async function touchSwipe(page, { from, to }) {
  const session = await page.context().newCDPSession(page);
  await session.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x: from.x, y: from.y }]
  });
  for (let step = 1; step <= 8; step += 1) {
    await session.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{
        x: from.x + ((to.x - from.x) * step) / 8,
        y: from.y + ((to.y - from.y) * step) / 8
      }]
    });
    await page.waitForTimeout(16);
  }
  await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await session.detach();
}

async function touchPinch(page, { center, startDistance = 36, endDistance = 90 }) {
  const session = await page.context().newCDPSession(page);
  const points = (distance) => ([
    { id: 0, x: center.x - distance, y: center.y },
    { id: 1, x: center.x + distance, y: center.y }
  ]);
  await session.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: points(startDistance)
  });
  for (let step = 1; step <= 8; step += 1) {
    const distance = startDistance + ((endDistance - startDistance) * step) / 8;
    await session.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: points(distance)
    });
    await page.waitForTimeout(16);
  }
  await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await session.detach();
}

async function expectGapChoiceSet(page, expectedValues) {
  const values = await page.locator('[data-action="text-gap-set-choice"]')
    .evaluateAll((buttons) => buttons.map((button) => button.dataset.textGapValue).sort());
  expect(values).toEqual([...expectedValues].sort());
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto("/tests/gallery/resource-test-course.html");
  await page.waitForFunction(() => globalThis.__RESOURCE_TEST_COURSE_READY__ === true);
  await page.evaluate(() => localStorage.removeItem("aralearn.resource-test.progress.v3"));
  await page.reload();
  await page.waitForFunction(() => globalThis.__RESOURCE_TEST_COURSE_READY__ === true);
});

test("curso separa representações dos três packages de resposta", async ({ page }) => {
  await expect(page.locator('[data-action="open-course"]')).toBeVisible();
  await page.locator('[data-action="open-course"]').click();
  expect(await page.locator('[data-action="open-module"]').count()).toBeGreaterThan(4);
  await expect(page.locator('[data-action="open-module"][data-module-key="response-choice-test-module"]')).toHaveCount(1);
  await expect(page.locator('[data-action="open-module"][data-module-key="response-gap-test-module"]')).toHaveCount(1);
  await expect(page.locator('[data-action="open-module"][data-module-key="response-ordering-test-module"]')).toHaveCount(1);
});

test("prosa do card mantém 15,5 px e entrelinha de 1,5 nas larguras móveis", async ({ page }) => {
  await openModule(page, 0);
  const card = page.locator(".card-sheet-content");

  for (const width of [320, 360, 390, 430]) {
    await page.setViewportSize({ width, height: 900 });
    const typography = await card.evaluate((element) => {
      const paragraphElement = element.querySelector(".runtime-markdown-paragraph");
      const cardStyle = getComputedStyle(element);
      const paragraphStyle = getComputedStyle(paragraphElement);
      return {
        cardFontSize: cardStyle.fontSize,
        cardLineHeight: cardStyle.lineHeight,
        paragraphFontSize: paragraphStyle.fontSize,
        paragraphLineHeight: paragraphStyle.lineHeight
      };
    });
    expect(typography).toEqual({
      cardFontSize: "15.5px",
      cardLineHeight: "23.25px",
      paragraphFontSize: "15.5px",
      paragraphLineHeight: "23.25px"
    });
  }

  await page.locator('[data-action="next-card"]').click();
  const gap = page.locator('[data-action="text-gap-open-choice"]');
  await expect(gap).toHaveCSS("font-size", "16px");
  await gap.click();
  await expect(page.locator('[data-action="text-gap-set-choice"]').first()).toHaveCSS("font-size", "16px");
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
  await openModuleByKey(page, "response-gap-test-module");
  const blanks = page.locator('[data-action="text-gap-open-choice"]');
  await expect(blanks).toHaveCount(2);
  await expect(page.locator('[data-action="text-gap-set-choice"]')).toHaveCount(0);

  await blanks.nth(0).click();
  await expectGapChoiceSet(page, ["cliente", "servidor", "roteador"]);
  await page.locator('[data-action="text-gap-set-choice"][data-text-gap-value="cliente"]').click();

  await blanks.nth(1).click();
  await expectGapChoiceSet(page, ["resposta", "requisição", "conexão"]);
  await page.locator('[data-action="text-gap-set-choice"][data-text-gap-value="resposta"]').click();
  await blanks.nth(1).click();
  await expect(blanks.nth(1)).toHaveAttribute("data-empty", "true");
});

test("tabela de transição mantém lacunas e alternativas independentes", async ({ page }) => {
  await openModuleByKey(page, "resource-test-27-module", 1);
  const blanks = page.locator('.package-state-transition-table [data-action="text-gap-open-choice"]');
  await expect(blanks).toHaveCount(2);
  await expect(
    page.locator(".package-state-transition-table tbody tr").nth(0).locator("td").nth(1)
      .locator('[data-complete-blank-index="0"]')
  ).toHaveCount(1);
  await expect(
    page.locator(".package-state-transition-table tbody tr").nth(2).locator("td").nth(1)
      .locator('[data-complete-blank-index="1"]')
  ).toHaveCount(1);

  await blanks.nth(0).click();
  await expectGapChoiceSet(page, ["q0", "q1", "q2"]);
  await page.locator('[data-action="text-gap-set-choice"][data-text-gap-value="q0"]').click();
  await expect(blanks.nth(0)).toHaveText("q₀");
  await expect(blanks.nth(1)).toBeEmpty();

  await blanks.nth(1).click();
  await expectGapChoiceSet(page, ["q0", "q1", "q2"]);
  await page.locator('[data-action="text-gap-set-choice"][data-text-gap-value="q0"]').click();
  await expect(blanks.nth(0)).toHaveText("q₀");
  await expect(blanks.nth(1)).toHaveText("q₀");

  await blanks.nth(0).click();
  await expect(blanks.nth(0)).toBeEmpty();
  await expect(blanks.nth(1)).toHaveText("q₀");
});

test("code recebe a lacuna no editor e não no enunciado", async ({ page }) => {
  await openModule(page, 1, 1);
  const code = page.locator(".runtime-code-block pre");
  const gap = code.locator("[data-action='text-gap-open-choice']");
  await expect(gap).toHaveCount(1);
  await expect(page.locator(".runtime-code-block > p [data-action='text-gap-open-choice']"))
    .toHaveCount(0);
  await expect(code).toHaveCSS("font-size", "15px");
  await expect(code).toHaveCSS("line-height", "21.6px");
  await expect(gap).toHaveCSS("font-size", "16px");
});

test("table recebe alternativa e digitação dentro de células", async ({ page }) => {
  await openModule(page, 2, 1);
  const cell = page.locator(".runtime-table tbody td").first();
  const gap = page.locator(".runtime-table tbody [data-action='text-gap-open-choice']");
  await expect(gap).toHaveCount(1);
  await expect(page.locator(".runtime-table-block > p [data-action='text-gap-open-choice']"))
    .toHaveCount(0);
  await expect(cell).toHaveCSS("font-size", "15px");
  await expect(cell).toHaveCSS("line-height", "21.6px");
  await expect(gap).toHaveCSS("font-size", "16px");
  await gap.click();
  await page.locator('[data-action="text-gap-set-choice"][data-text-gap-value="start"]').click();
  await page.locator('[data-action="next-card"]').click();
  await page.locator('[data-action="next-card"]').click();
  await expect(page.locator(".runtime-table tbody [data-action='complete-input']"))
    .toHaveCount(1);
});

test("texto anotado liga trecho e nota nos dois sentidos sem ids internos", async ({ page }) => {
  await openModuleByKey(page, "resource-test-4-module");
  await expect(page.locator(".runtime-annotated-text-segment")).toHaveCount(2);
  await expect(page.locator(".runtime-annotated-text-notes")).not.toContainText("Trechos:");
  await page.locator(".runtime-annotated-text-segment").first().click();
  await expect(page.locator(".runtime-annotated-text-segment").first()).toHaveClass(/is-active/u);
  await expect(page.locator(".runtime-annotated-text-note").first()).toHaveClass(/is-active/u);
  await page.locator(".runtime-annotated-text-note").last().click();
  await expect(page.locator(".runtime-annotated-text-segment").last()).toHaveClass(/is-active/u);
});

test("BPMN preserva participantes, raias, gateways e fluxos em um caso não trivial", async ({ page }) => {
  await openModuleByKey(page, "resource-test-5-module");
  await expect(page.locator('[data-graphviz-status="ready"]')).toHaveCount(1);
  await expect(page.locator(".package-bpmn-participant")).toHaveCount(2);
  await expect(page.locator(".package-bpmn-lane")).toHaveCount(3);
  await expect(page.locator(".package-bpmn-node.is-exclusive_gateway")).toHaveCount(1);
  await expect(page.locator(".package-bpmn-flow.is-message")).toHaveCount(1);
  await expect(page.locator(".package-bpmn-flow.is-sequence")).toHaveCount(8);
  const visibleEventText = await page.locator(".package-bpmn-process .package-system-diagram-svg text").allTextContents();
  expect(visibleEventText.map((value) => value.trim())).not.toContain("need");
  expect(visibleEventText.map((value) => value.trim())).not.toContain("finish");
  const geometry = await page.locator(".package-bpmn-process .package-system-diagram-svg").evaluate((svg) => {
    const boxes = [...svg.querySelectorAll("g.package-bpmn-node")].map((node) => ({
      id: node.id,
      rect: node.getBoundingClientRect()
    }));
    const overlaps = [];
    for (let leftIndex = 0; leftIndex < boxes.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < boxes.length; rightIndex += 1) {
        const left = boxes[leftIndex].rect;
        const right = boxes[rightIndex].rect;
        if (left.left < right.right && left.right > right.left && left.top < right.bottom && left.bottom > right.top) {
          overlaps.push([boxes[leftIndex].id, boxes[rightIndex].id]);
        }
      }
    }
    const send = svg.querySelector("#system-node-send").getBoundingClientRect();
    const receive = svg.querySelector("#system-node-receive").getBoundingClientRect();
    return {
      overlaps,
      width: svg.getBoundingClientRect().width,
      naturalWidth: svg.viewBox.baseVal.width,
      primaryFlow: {
        horizontal: Math.abs(receive.x - send.x),
        vertical: receive.y - send.y
      }
    };
  });
  expect(geometry.overlaps).toEqual([]);
  expect(geometry.naturalWidth).toBeGreaterThan(300);
  expect(geometry.width).toBeLessThanOrEqual(370);
  expect(geometry.primaryFlow.vertical).toBeGreaterThan(geometry.primaryFlow.horizontal);
  await expect(page.locator(".package-bpmn-process [data-graphviz-source]"))
    .toHaveAttribute("data-graphviz-source", /rankdir="TB"/u);
  await page.locator('[data-action="next-card"]').click();
  const nodeGap = page.locator('.package-system-diagram-svg [data-action="text-gap-open-choice"]');
  await expect(nodeGap).toHaveCount(1);
  await expect(page.locator(".package-system-diagram-detail")).toHaveCount(0);
  await expect(page.locator("#system-node-send foreignObject")).not.toContainText("solicitação");
  await expect(page.locator("body")).not.toContainText("Detalhe para leitura");
  await page.evaluate(() => { document.documentElement.style.fontSize = "32px"; });
  const textZoomGeometry = await page.locator("#system-node-send foreignObject").evaluate((foreignObject) => {
    const content = foreignObject.querySelector(".package-system-diagram-node-content");
    const gap = content.querySelector(".runtime-text-gap-blank");
    const foreignRect = foreignObject.getBoundingClientRect();
    const gapRect = gap.getBoundingClientRect();
    return {
      contentFontSize: getComputedStyle(content).fontSize,
      gapFontSize: getComputedStyle(gap).fontSize,
      contentOverflow: content.scrollWidth - content.clientWidth,
      gapContained: gapRect.left >= foreignRect.left - 1 && gapRect.right <= foreignRect.right + 1
    };
  });
  expect(textZoomGeometry).toEqual({
    contentFontSize: "16px",
    gapFontSize: "16px",
    contentOverflow: 0,
    gapContained: true
  });
  await page.evaluate(() => { document.documentElement.style.fontSize = ""; });
  await page.locator('.package-bpmn-process [data-diagram-action="toggle-expanded"]').click();
  const dialog = page.locator(".package-bpmn-process [data-diagram-modal]");
  await expect(dialog).toHaveAttribute("open", "");
  await page.locator('.package-bpmn-process [data-diagram-action="zoom-in"]').click();
  const practicedScale = Number(await page.locator(".package-bpmn-process .package-system-diagram-svg")
    .getAttribute("data-diagram-scale"));
  await nodeGap.click();
  await expect(dialog).toHaveAttribute("open", "");
  const prompt = dialog.locator('[data-text-gap-prompt="true"]');
  await expect(prompt).toBeVisible();
  await expect.poll(async () => Number(await page.locator(".package-bpmn-process .package-system-diagram-svg")
    .getAttribute("data-diagram-scale"))).toBeGreaterThanOrEqual(practicedScale - 0.01);
  const answer = prompt.locator(
    '[data-action="text-gap-set-choice"][data-text-gap-value="solicitação"]'
  );
  await expect(answer).toHaveAttribute("data-response-control-bound", "true");
  await answer.click();
  await expect(dialog).toHaveAttribute("open", "");
  await expect(page.locator('[data-graphviz-status="ready"]')).toHaveCount(1);
  await expect(page.locator("#system-node-send foreignObject")).toContainText("solicitação");
  const completedLabel = await page.locator("#system-node-send").evaluate((node) => {
    const shape = node.querySelector("path, polygon").getBoundingClientRect();
    const label = node.querySelector("foreignObject").getBoundingClientRect();
    return {
      insideShape: label.left >= shape.left - 1 && label.right <= shape.right + 1 &&
        label.top >= shape.top - 1 && label.bottom <= shape.bottom + 1,
      label: label.width > 0 && label.height > 0,
      activeControls: node.querySelectorAll('[data-action="text-gap-open-choice"], [data-action="complete-input"]').length
    };
  });
  expect(completedLabel.insideShape).toBe(true);
  expect(completedLabel.label).toBe(true);
  expect(completedLabel.activeControls).toBe(1);
  await page.locator('.package-bpmn-process [data-diagram-action="toggle-expanded"]').click();
  await expect(dialog).not.toHaveAttribute("open", "");
});

test("frame BPMN permite pinça e pan no card e preserva o mesmo canvas em tela inteira", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 700 });
  await openModuleByKey(page, "resource-test-5-module");
  const frame = page.locator('.package-bpmn-process [data-resource-scroll-frame="diagram"]');
  const svg = page.locator(".package-bpmn-process .package-system-diagram-svg");
  const expand = page.locator('.package-bpmn-process [data-diagram-action="toggle-expanded"]');
  await expect(frame).toHaveAttribute("data-graphviz-status", "ready");

  const geometry = await frame.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const cardRect = element.closest(".card-sheet-content").getBoundingClientRect();
    return {
      clientHeight: element.clientHeight,
      scrollHeight: element.scrollHeight,
      clientWidth: element.clientWidth,
      scrollWidth: element.scrollWidth,
      frameBottom: rect.bottom,
      cardBottom: cardRect.bottom,
      touchAction: getComputedStyle(element).touchAction
    };
  });
  expect(geometry.clientHeight).toBeLessThanOrEqual(336);
  expect(geometry.scrollHeight - geometry.clientHeight).toBeLessThanOrEqual(1);
  expect(geometry.scrollWidth - geometry.clientWidth).toBeLessThanOrEqual(1);
  expect(geometry.frameBottom).toBeLessThanOrEqual(geometry.cardBottom + 3);
  expect(geometry.touchAction).toBe("none");
  await expect(frame).toHaveAttribute("data-diagram-viewport-mode", "inline");
  await expect(page.locator('.package-bpmn-process [data-diagram-zoom-controls]')).toBeVisible();
  await expect(page.locator('.package-bpmn-process [data-diagram-action="fit"]')).toHaveCount(0);
  await expect(page.locator('.package-bpmn-process [data-diagram-action="zoom-out"]')).toBeDisabled();
  await expect(page.locator('.package-bpmn-process [data-diagram-action="zoom-in"]')).toBeEnabled();
  await expect(expand).toHaveText("");
  await expect(expand.locator("svg")).toHaveCount(1);
  await expect(expand).toHaveAttribute("aria-expanded", "false");

  const card = page.locator(".card-sheet-content");
  const fittedBox = await frame.boundingBox();
  await card.evaluate((element) => {
    const spacer = document.createElement("div");
    spacer.dataset.diagramGestureTestSpacer = "true";
    spacer.style.height = "360px";
    spacer.setAttribute("aria-hidden", "true");
    element.append(spacer);
  });
  await expect.poll(() => card.evaluate((element) => element.scrollHeight - element.clientHeight))
    .toBeGreaterThan(100);
  await card.evaluate((element) => { element.scrollTop = 0; });
  await touchSwipe(page, {
    from: { x: fittedBox.x + fittedBox.width / 2, y: fittedBox.y + fittedBox.height - 28 },
    to: { x: fittedBox.x + fittedBox.width / 2, y: fittedBox.y + 28 }
  });
  await expect.poll(() => card.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  expect(await frame.evaluate((element) => element.scrollTop)).toBe(0);
  await card.evaluate((element) => {
    element.scrollTop = 0;
    element.querySelector('[data-diagram-gesture-test-spacer="true"]')?.remove();
  });

  const inlineBox = await frame.boundingBox();
  const scaleBeforePinch = Number(await svg.getAttribute("data-diagram-scale"));
  await touchPinch(page, {
    center: { x: inlineBox.x + inlineBox.width / 2, y: inlineBox.y + inlineBox.height / 2 }
  });
  await expect.poll(async () => Number(await svg.getAttribute("data-diagram-scale")))
    .toBeGreaterThan(scaleBeforePinch);
  await expect.poll(() => frame.evaluate((element) => Math.max(
    element.scrollWidth - element.clientWidth,
    element.scrollHeight - element.clientHeight
  ))).toBeGreaterThan(0);

  const beforePan = await frame.evaluate((element) => ({
    left: element.scrollLeft,
    top: element.scrollTop
  }));
  await touchSwipe(page, {
    from: { x: inlineBox.x + inlineBox.width * 0.7, y: inlineBox.y + inlineBox.height * 0.7 },
    to: { x: inlineBox.x + inlineBox.width * 0.3, y: inlineBox.y + inlineBox.height * 0.3 }
  });
  await expect.poll(() => frame.evaluate((element) => ({
    left: element.scrollLeft,
    top: element.scrollTop
  }))).not.toEqual(beforePan);

  await touchPinch(page, {
    center: { x: inlineBox.x + inlineBox.width / 2, y: inlineBox.y + inlineBox.height / 2 },
    startDistance: 90,
    endDistance: 4
  });
  const zoomOutAtFit = page.locator('.package-bpmn-process [data-diagram-action="zoom-out"]');
  await expect(zoomOutAtFit).toBeDisabled();
  await expect.poll(() => frame.evaluate((element) => Math.max(
    element.scrollWidth - element.clientWidth,
    element.scrollHeight - element.clientHeight
  ))).toBeLessThanOrEqual(1);

  const compactFitScale = Number(await svg.getAttribute("data-diagram-scale"));
  await page.setViewportSize({ width: 390, height: 900 });
  await expect.poll(async () => Number(await svg.getAttribute("data-diagram-scale")))
    .toBeGreaterThan(compactFitScale);
  await expect(zoomOutAtFit).toBeDisabled();
  await page.setViewportSize({ width: 390, height: 700 });
  await expect.poll(async () => Number(await svg.getAttribute("data-diagram-scale")))
    .toBeLessThanOrEqual(compactFitScale + 0.001);
  await page.locator('.package-bpmn-process [data-diagram-action="zoom-in"]').click();

  await svg.evaluate((element) => { element.dataset.sameViewportProbe = "true"; });
  await expand.click();
  const dialog = page.locator(".package-bpmn-process [data-diagram-modal]");
  await expect(dialog).toHaveAttribute("open", "");
  await expect(frame).toHaveAttribute("data-diagram-viewport-mode", "explore");
  expect(await frame.evaluate((element) => getComputedStyle(element).touchAction)).toBe("none");
  await expect(dialog.locator('svg[data-same-viewport-probe="true"]')).toHaveCount(1);
  await expect(page.locator('.package-bpmn-process [data-diagram-zoom-controls]')).toBeVisible();
  await expect(expand).toHaveAttribute("aria-expanded", "true");
  for (const action of ["zoom-out", "zoom-in", "toggle-expanded"]) {
    const button = page.locator(`.package-bpmn-process [data-diagram-action="${action}"]`);
    await expect(button).toHaveText("");
    await expect(button.locator("svg")).toHaveCount(1);
  }

  const explorationLayout = await dialog.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const zoomOutRect = element.querySelector('[data-diagram-action="zoom-out"]').getBoundingClientRect();
    const zoomInRect = element.querySelector('[data-diagram-action="zoom-in"]').getBoundingClientRect();
    const returnRect = element.querySelector('[data-diagram-action="toggle-expanded"]').getBoundingClientRect();
    const canvasRect = element.querySelector(".package-system-diagram-canvas").getBoundingClientRect();
    const toolbarRect = element.querySelector(".package-diagram-toolbar").getBoundingClientRect();
    return {
      width: rect.width,
      height: rect.height,
      zoomAtLeft: zoomOutRect.left < zoomInRect.left && zoomInRect.right < returnRect.left,
      returnAtRight: returnRect.right <= rect.right && rect.right - returnRect.right <= 20,
      reserved: toolbarRect.bottom <= canvasRect.top + 1
    };
  });
  expect(explorationLayout.width).toBeLessThanOrEqual(390);
  expect(explorationLayout.height).toBe(700);
  expect(explorationLayout.zoomAtLeft).toBe(true);
  expect(explorationLayout.returnAtRight).toBe(true);
  expect(explorationLayout.reserved).toBe(true);

  const scaleBefore = Number(await svg.getAttribute("data-diagram-scale"));
  await page.locator('.package-bpmn-process [data-diagram-action="zoom-in"]').click();
  const explored = await frame.evaluate((element) => ({
    overflowX: element.scrollWidth - element.clientWidth,
    overflowY: element.scrollHeight - element.clientHeight,
    scale: Number(element.querySelector("svg").dataset.diagramScale)
  }));
  expect(explored.scale).toBeGreaterThan(scaleBefore);
  expect(Math.max(explored.overflowX, explored.overflowY)).toBeGreaterThan(0);

  const zoomOut = page.locator('.package-bpmn-process [data-diagram-action="zoom-out"]');
  for (let attempt = 0; attempt < 16 && await zoomOut.isEnabled(); attempt += 1) {
    await zoomOut.click();
  }
  await expect(zoomOut).toBeDisabled();
  await expect.poll(() => frame.evaluate((element) => Math.max(
    element.scrollWidth - element.clientWidth,
    element.scrollHeight - element.clientHeight
  ))).toBeLessThanOrEqual(1);

  await page.keyboard.press("Escape");
  await expect(dialog).not.toHaveAttribute("open", "");
  await expect(frame).toHaveAttribute("data-diagram-viewport-mode", "inline");
  await expect(expand).toHaveAttribute("aria-expanded", "false");
  await expect(expand).toBeFocused();
  await expect.poll(() => frame.evaluate((element) => ({
    x: element.scrollWidth - element.clientWidth,
    y: element.scrollHeight - element.clientHeight
  }))).toEqual({ x: 0, y: 0 });
  await page.setViewportSize({ width: 320, height: 700 });
  await expect.poll(() => frame.evaluate((element) => {
    const frameRect = element.getBoundingClientRect();
    const svgRect = element.querySelector("svg").getBoundingClientRect();
    return {
      overflowFree: element.scrollWidth - element.clientWidth <= 1 &&
        element.scrollHeight - element.clientHeight <= 1,
      contained: svgRect.left >= frameRect.left - 1 && svgRect.right <= frameRect.right + 1 &&
        svgRect.top >= frameRect.top - 1 && svgRect.bottom <= frameRect.bottom + 1
    };
  })).toEqual({ overflowFree: true, contained: true });

  await expand.click();
  await expect(dialog).toHaveAttribute("open", "");
  expect(await dialog.evaluate((element) => element.getBoundingClientRect().width)).toBe(320);
  await page.keyboard.press("Escape");
  await expect(dialog).not.toHaveAttribute("open", "");

  await page.setViewportSize({ width: 760, height: 700 });
  await expand.click();
  await expect(dialog).toHaveAttribute("open", "");
  expect(await dialog.evaluate((element) => element.getBoundingClientRect().width)).toBe(430);
  await page.keyboard.press("Escape");
  await expect(dialog).not.toHaveAttribute("open", "");
});

test("contêineres de software preservam todo rótulo na exposição e após preencher a lacuna", async ({ page }) => {
  await openModuleByKey(page, "resource-test-15-module");
  await expect(page.locator('.runtime-software-container-block [data-graphviz-status="ready"]')).toHaveCount(1);

  const staticLabels = await page.locator(".package-software-container-node").evaluateAll((nodes) => nodes.map((node) => {
    const union = (elements) => elements.reduce((bounds, element) => {
      const rect = element.getBoundingClientRect();
      return {
        left: Math.min(bounds.left, rect.left),
        top: Math.min(bounds.top, rect.top),
        right: Math.max(bounds.right, rect.right),
        bottom: Math.max(bounds.bottom, rect.bottom)
      };
    }, { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity });
    const shape = union([...node.querySelectorAll(":scope > path, :scope > polygon, :scope > ellipse, :scope > rect")]);
    const text = union([...node.querySelectorAll("text")]
      .filter((label) => getComputedStyle(label).visibility === "visible"));
    return {
      native: !node.querySelector("foreignObject"),
      textCount: node.querySelectorAll("text").length,
      inside: text.left >= shape.left - 1 && text.right <= shape.right + 1 &&
        text.top >= shape.top - 1 && text.bottom <= shape.bottom + 1
    };
  }));
  expect(staticLabels).toHaveLength(7);
  staticLabels.forEach(({ native, textCount, inside }) => {
    expect(native).toBe(true);
    expect(textCount).toBeGreaterThanOrEqual(3);
    expect(inside).toBe(true);
  });

  await page.locator('[data-action="next-card"]').click();
  const gap = page.locator('.package-system-diagram-svg [data-action="text-gap-open-choice"]');
  await expect(gap).toHaveCount(1);
  await expect(page.locator(".package-system-diagram-detail")).toHaveCount(0);
  await gap.click();
  await page.locator('[data-action="text-gap-set-choice"][data-text-gap-value="Aplicação"]').click();
  await expect(page.locator('.runtime-software-container-block [data-graphviz-status="ready"]')).toHaveCount(1);

  const interactiveLabel = await page.locator(".package-software-container-node foreignObject").evaluate((foreignObject) => {
    const node = foreignObject.closest(".package-software-container-node");
    const shapeRects = [...node.querySelectorAll(":scope > path, :scope > polygon, :scope > ellipse, :scope > rect")]
      .map((element) => element.getBoundingClientRect());
    const shape = shapeRects.reduce((bounds, rect) => ({
      left: Math.min(bounds.left, rect.left),
      top: Math.min(bounds.top, rect.top),
      right: Math.max(bounds.right, rect.right),
      bottom: Math.max(bounds.bottom, rect.bottom)
    }), { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity });
    const label = foreignObject.getBoundingClientRect();
    return {
      inside: label.left >= shape.left - 1 && label.right <= shape.right + 1 &&
        label.top >= shape.top - 1 && label.bottom <= shape.bottom + 1,
      activeControls: foreignObject.querySelectorAll('[data-action="text-gap-open-choice"], [data-action="complete-input"]').length
    };
  });
  expect(interactiveLabel.inside).toBe(true);
  expect(interactiveLabel.activeControls).toBe(1);

  await page.locator('[data-action="next-card"]').click();
  const typing = page.locator('.package-system-diagram-svg [data-action="complete-input"]');
  await expect(typing).toHaveCount(1);
  await expect(page.locator(".package-system-diagram-detail")).toHaveCount(0);
  await typing.fill("Aplicação web");
  await expect(typing).toHaveText("Aplicação web");
  await expect(page.locator('[data-action="complete-input"]')).toHaveCount(1);
});

test("glosa interlinear preserva alinhamento, tradução e legenda", async ({ page }) => {
  await openModuleByKey(page, "resource-test-6-module");
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
  await openModuleByKey(page, "resource-test-8-module");
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
  await openModuleByKey(page, "resource-test-9-module");
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
  await page.locator('[data-action="text-gap-set-choice"][data-text-gap-value="2"]').click();
  await page.locator('[data-action="next-card"]').click();
  await expect(page.locator("math.package-reaction-equation [data-action='complete-input']")).toHaveCount(1);
  await expect(page.locator(".inline-feedback")).toHaveCount(0);
});

test("flow usa convenções de fluxograma e não a estrutura visual de tree", async ({ page }) => {
  await openModuleByKey(page, "resource-test-10-module");
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
  await page.locator('[data-action="text-gap-set-choice"][data-text-gap-value="Início"]').click();
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

test("formula combina prosa compacta e notação matemática preservada em 16 px", async ({ page }) => {
  await openModuleByKey(page, "resource-test-11-module");
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
  expect(sizes).toEqual({ prose: "15.5px", formula: "16px" });
});

test("plano cartesiano complexo preserva eixos, objetos e rótulos sem colisão", async ({ page }) => {
  await page.evaluate(() => localStorage.setItem("aralearn.ui.theme", "dark"));
  await page.reload();
  await page.waitForFunction(() => globalThis.__RESOURCE_TEST_COURSE_READY__ === true);
  await openModuleByKey(page, "resource-test-12-module");
  await expect(page.locator(".package-plane-canvas[data-vega-status='ready']")).toBeVisible();
  const geometry = await page.locator(".package-plane-canvas").evaluate((canvas) => {
    const expected = new Set(["e₁", "e₂", "Ae₁", "Ae₂", "p", "Ap"]);
    const labels = [...canvas.querySelectorAll("svg text")]
      .filter((element) => expected.has(element.textContent.trim()))
      .map((element) => ({
        text: element.textContent.trim(),
        rect: element.getBoundingClientRect(),
        fill: getComputedStyle(element).fill,
        stroke: getComputedStyle(element).stroke,
        strokeWidth: getComputedStyle(element).strokeWidth
      }));
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
    const parseColor = (value) => {
      const context = document.createElement("canvas").getContext("2d", { willReadFrequently: true });
      context.fillStyle = value;
      context.fillRect(0, 0, 1, 1);
      return [...context.getImageData(0, 0, 1, 1).data].slice(0, 3);
    };
    const luminance = (channels) => channels
      .map((channel) => channel / 255)
      .map((channel) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4)
      .reduce((total, channel, index) => total + channel * [0.2126, 0.7152, 0.0722][index], 0);
    const figureColor = parseColor(getComputedStyle(canvas.closest("figure")).backgroundColor);
    const figureLuminance = luminance(figureColor);
    const swatchColors = [...canvas.closest("figure").querySelectorAll(".package-plane-swatch")]
      .map((swatch) => getComputedStyle(swatch).backgroundColor);
    const vectorShafts = [...canvas.querySelectorAll('svg g.mark-rule.role-mark line[x2][y2]')];
    const distanceToSegment = (point, start, end) => {
      const deltaX = end.x - start.x;
      const deltaY = end.y - start.y;
      const lengthSquared = (deltaX ** 2) + (deltaY ** 2);
      const ratio = lengthSquared
        ? Math.max(0, Math.min(1, (((point.x - start.x) * deltaX) + ((point.y - start.y) * deltaY)) / lengthSquared))
        : 0;
      return Math.hypot(
        point.x - (start.x + (ratio * deltaX)),
        point.y - (start.y + (ratio * deltaY))
      );
    };
    const vectorLabelOrder = ["e₁", "e₂", "Ae₁", "Ae₂"];
    const vectorLabelDistances = vectorShafts.map((shaft, index) => {
      const matrix = shaft.getScreenCTM();
      const svg = shaft.ownerSVGElement;
      const endpoint = (xName, yName) => {
        const point = svg.createSVGPoint();
        point.x = Number(shaft.getAttribute(xName));
        point.y = Number(shaft.getAttribute(yName));
        return point.matrixTransform(matrix);
      };
      const label = labels.find(({ text: labelText }) => labelText === vectorLabelOrder[index]);
      return distanceToSegment(
        { x: label.rect.left + (label.rect.width / 2), y: label.rect.top + (label.rect.height / 2) },
        endpoint("x1", "y1"),
        endpoint("x2", "y2")
      );
    });
    const arrowMarkers = vectorShafts.map((shaft) => {
      const markerId = /^url\(#(.+)\)$/u.exec(shaft.getAttribute("marker-end") || "")?.[1];
      const marker = markerId ? canvas.querySelector(`svg marker[id="${markerId}"]`) : null;
      return {
        markerEnd: shaft.getAttribute("marker-end"),
        orient: marker?.getAttribute("orient"),
        refX: marker?.getAttribute("refX"),
        refY: marker?.getAttribute("refY"),
        head: marker?.querySelector("path")?.getAttribute("d"),
        headColor: marker?.querySelector("path")?.getAttribute("fill"),
        shaftColor: shaft.getAttribute("stroke")
      };
    });
    const contrasts = swatchColors.map((color) => {
      const swatchLuminance = luminance(parseColor(color));
      return (Math.max(figureLuminance, swatchLuminance) + 0.05) / (Math.min(figureLuminance, swatchLuminance) + 0.05);
    });
    return {
      labels: labels.map(({ text }) => text),
      labelPaint: labels.map(({ text, fill, stroke, strokeWidth }) => ({ text, fill, stroke, strokeWidth })),
      vectorLabelDistances,
      overlaps,
      swatchColors,
      contrasts,
      arrowMarkers,
      detachedTriangleMarks: canvas.querySelectorAll('g.mark-symbol path[d^="M0,-4.899"]').length,
      documentOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
    };
  });
  expect(geometry.labels.sort()).toEqual(["Ae₁", "Ae₂", "Ap", "e₁", "e₂", "p"].sort());
  expect(geometry.labelPaint.every(({ fill, stroke, strokeWidth }) =>
    fill !== "none" && fill !== "rgba(0, 0, 0, 0)" &&
    (stroke === "none" || strokeWidth === "0px"))).toBe(true);
  expect(Math.max(...geometry.vectorLabelDistances)).toBeLessThanOrEqual(20);
  expect(geometry.overlaps).toEqual([]);
  expect(new Set(geometry.swatchColors).size).toBe(2);
  expect(Math.min(...geometry.contrasts)).toBeGreaterThanOrEqual(3);
  expect(geometry.arrowMarkers).toHaveLength(4);
  expect(geometry.arrowMarkers.every(({ markerEnd, orient, refX, refY, head, headColor, shaftColor }) =>
    markerEnd && orient === "auto" && refX === "9" && refY === "4.5" &&
    head === "M0 0 L9 4.5 L0 9 Z" && headColor === shaftColor)).toBe(true);
  expect(geometry.detachedTriangleMarks).toBe(0);
  expect(geometry.documentOverflow).toBeLessThanOrEqual(1);
  await expect(page.locator(".package-plane-canvas svg")).toContainText("Coordenada x");
  await expect(page.locator(".package-plane-canvas svg")).toContainText("Coordenada y");
  await expect(page.locator(".package-plane-legend li")).toHaveCount(2);
  await expect(page.locator(".package-plane-legend li").nth(0)).toContainText("Objeto original");
  await expect(page.locator(".package-plane-legend li").nth(0)).toContainText("e₁, e₂, p, Q");
  await expect(page.locator(".package-plane-legend li").nth(1)).toContainText("Imagem por A");
  await expect(page.locator(".package-plane-legend li").nth(1)).toContainText("Ae₁, Ae₂, Ap, A(Q)");
  await expect(page.locator(".package-plane-object-key li")).toHaveText(["Ponto", "Vetor", "Região ou trajetória"]);
});

test("gráfico acadêmico mostra escala logarítmica, incerteza e referência sem legenda solta", async ({ page }) => {
  await openModuleByKey(page, "resource-test-13-module");
  const canvas = page.locator(".package-chart-canvas[data-vega-status='ready']");
  await expect(canvas).toBeVisible();
  await expect(canvas).toContainText("Concorrência (requisições simultâneas)");
  await expect(canvas).toContainText("Latência no percentil 95 (ms)");
  await expect(canvas).toContainText("Limite operacional");
  await expect(page.locator(".package-chart-uncertainty")).toHaveText("Intervalo de confiança de 95%");
  await expect(page.locator(".package-chart-legend li")).toHaveCount(2);
  const seriesColors = await page.locator(".package-chart-swatch").evaluateAll((swatches) => swatches.map((swatch) => getComputedStyle(swatch).backgroundColor));
  expect(new Set(seriesColors).size).toBe(2);
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

test("ordenação atua nas células com setas por ícone e largura estável", async ({ page }) => {
  await openModuleByKey(page, "response-ordering-test-module");
  const slots = page.locator(".runtime-ordering-slot");
  await expect(slots).toHaveCount(3);
  await expect(page.locator(".package-ordering-response")).toHaveCount(0);
  const moveButtons = page.locator('[data-action="ordering-move"]');
  await expect(moveButtons).toHaveCount(6);
  expect(await moveButtons.allTextContents()).toEqual(["", "", "", "", "", ""]);
  await expect(moveButtons.first()).toHaveAttribute("aria-label", /esquerda/u);
  const moveTarget = await moveButtons.nth(1).evaluate((node) => {
    const bounds = node.getBoundingClientRect();
    return { width: bounds.width, height: bounds.height };
  });
  expect(moveTarget.width).toBeGreaterThanOrEqual(44);
  expect(moveTarget.height).toBeGreaterThanOrEqual(44);
  await expect(page.getByRole("button", { name: "Conferir" })).toHaveCount(0);
  for (const width of [360, 320]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth))
      .toBeLessThanOrEqual(width);
  }
  const widthsBefore = await slots.evaluateAll((nodes) => nodes.map((node) => (
    Math.round(node.getBoundingClientRect().width)
  )));
  await page.locator('[data-action="next-card"]').click();
  await expect(page.locator(".inline-feedback.err")).toBeVisible();
  const query = page.locator('.runtime-ordering-slot[data-ordering-item-id="query"]');
  await query.locator('[data-ordering-direction="left"]').click();
  await expect(query).toBeFocused();
  await expect(query).toHaveAttribute("aria-label", /posição 2 de 3/u);
  await page.locator('.runtime-ordering-slot[data-ordering-item-id="query"] [data-ordering-direction="left"]').click();
  await expect(query).toBeFocused();
  await expect(query).toHaveAttribute("aria-label", /posição 1 de 3/u);
  const widthsAfter = await slots.evaluateAll((nodes) => nodes.map((node) => (
    Math.round(node.getBoundingClientRect().width)
  )));
  expect(widthsAfter).toEqual(widthsBefore);
  await page.locator('[data-action="next-card"]').click();
  await expect(page.getByRole("heading", { name: "Microssequências" })).toBeVisible();
  await expect(page.locator(".inline-feedback.err")).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
});
